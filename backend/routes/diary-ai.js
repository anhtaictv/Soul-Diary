// routes/diary-ai.js — Các route AI: gợi ý chủ đề, tóm tắt tuần, AI Coach
// Mount sau authMiddleware trong diary.js — không cần auth riêng.
const express = require('express');
const { getPool, sql } = require('../db');
const { genai, DAILY_PROMPTS, dayOfYear } = require('../utils/diary-helpers');

const router = express.Router();

// ── GET /api/diary/daily-prompt ───────────────────────────────────────────
router.get('/daily-prompt', async (req, res) => {
  const idx = req.query.refresh === '1'
    ? Math.floor(Math.random() * DAILY_PROMPTS.length)
    : dayOfYear(new Date()) % DAILY_PROMPTS.length;
  res.json({ prompt: DAILY_PROMPTS[idx] });
});

// ── GET /api/diary/smart-recap — AI tóm tắt tuần (cache 1 lần/ngày) ─────
router.get('/smart-recap', async (req, res) => {
  try {
    const db = await getPool();
    const cacheRes = await db.request().input('id', sql.Int, req.user.id)
      .query(`SELECT ai_recap_text, ai_recap_date FROM Users WHERE id = @id`);
    const { ai_recap_text, ai_recap_date } = cacheRes.recordset[0];
    const today = new Date().toISOString().split('T')[0];
    if (ai_recap_text && ai_recap_date && ai_recap_date.toISOString().startsWith(today))
      return res.json({ insight: ai_recap_text, cached: true });

    const statsRes = await db.request().input('user_id', sql.Int, req.user.id).query(`
      SELECT CAST(created_at AS DATE) AS entry_date,
             AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
             COUNT(*) AS entry_count, STRING_AGG(tags, '|') AS all_tags
      FROM DiaryEntries
      WHERE user_id = @user_id AND created_at >= DATEADD(DAY, -14, GETDATE())
      GROUP BY CAST(created_at AS DATE) ORDER BY entry_date ASC
    `);

    const stats = statsRes.recordset;
    const now   = new Date();
    const thisWeek = [], lastWeek = [];
    for (let i = 0; i < 14; i++) {
      const d  = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const row = stats.find(s => s.entry_date && s.entry_date.toISOString().startsWith(ds)) || null;
      if (i < 7) thisWeek.push(row); else lastWeek.push(row);
    }

    const thisDays  = thisWeek.filter(Boolean).length;
    const thisMoods = thisWeek.filter(Boolean).map(r => r.avg_mood);
    const lastMoods = lastWeek.filter(Boolean).map(r => r.avg_mood);
    const thisAvg   = thisMoods.length ? thisMoods.reduce((a,b)=>a+b,0)/thisMoods.length : null;
    const lastAvg   = lastMoods.length ? lastMoods.reduce((a,b)=>a+b,0)/lastMoods.length : null;
    const tagFreq   = {};
    thisWeek.filter(Boolean).forEach(r => {
      if (r.all_tags) r.all_tags.split('|').filter(Boolean).forEach(t => { tagFreq[t] = (tagFreq[t]||0)+1; });
    });
    const topEmotions = Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t);
    const lowMoodDays = thisWeek.filter(r => r && r.avg_mood <= 4).length;

    let insight;
    if (genai && thisDays > 0) {
      const trend = thisAvg === null || lastAvg === null ? 'chưa đủ dữ liệu so sánh'
        : thisAvg - lastAvg > 0.5 ? `tăng ${(thisAvg-lastAvg).toFixed(1)} điểm so tuần trước`
        : thisAvg - lastAvg < -0.5 ? `giảm ${(thisAvg-lastAvg).toFixed(1)} điểm so tuần trước`
        : 'ổn định so tuần trước';
      const prompt = `Bạn là người đồng hành tâm lý ấm áp trên ứng dụng nhật ký cảm xúc "Soul Diary" dành cho học sinh Việt Nam.

Dữ liệu tuần này:
- Ngày ghi: ${thisDays}/7 ngày
- Tâm trạng TB: ${thisAvg !== null ? thisAvg.toFixed(1) : 'chưa có'}/10
- Xu hướng: ${trend}
- Cảm xúc thường gặp: ${topEmotions.length > 0 ? topEmotions.join(', ') : 'chưa ghi nhãn'}
- Ngày tâm trạng thấp (≤4): ${lowMoodDays}

Viết đúng 2-3 câu tiếng Việt: nhận xét ngắn về tuần cảm xúc và một gợi ý nhỏ phù hợp. Giọng ấm áp, khích lệ, tự nhiên. Không dùng tiêu đề, bullet, ký hiệu lạ.`;
      try {
        const model  = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(prompt);
        insight = result.response.text().trim();
      } catch (aiErr) {
        console.error('Gemini smart-recap error:', aiErr.message);
        insight = null;
      }
    }

    if (!insight) {
      if (thisDays === 0) {
        insight = 'Tuần này chưa có nhật ký nào. Hãy bắt đầu bằng một dòng nhỏ hôm nay — không cần hoàn hảo, chỉ cần thật! 🌱';
      } else {
        const trend = thisAvg === null ? '' : lastAvg === null ? '' :
          thisAvg - lastAvg > 0.5 ? `Tâm trạng đang cải thiện (tăng ${(thisAvg-lastAvg).toFixed(1)} điểm) 📈. ` :
          thisAvg - lastAvg < -0.5 ? `Tâm trạng có xu hướng giảm so tuần trước 💙. ` : '';
        insight = `Tuần này bạn ghi ${thisDays}/7 ngày, tâm trạng TB ${thisAvg !== null ? thisAvg.toFixed(1) : '—'}/10. ${trend}${topEmotions.length > 0 ? `Cảm xúc nổi bật: ${topEmotions.join(', ')}. ` : ''}Tiếp tục duy trì thói quen ghi nhật ký ✨`;
      }
    }

    await db.request()
      .input('id',   sql.Int,      req.user.id)
      .input('text', sql.NVarChar, insight)
      .input('date', sql.Date,     new Date())
      .query(`UPDATE Users SET ai_recap_text = @text, ai_recap_date = @date WHERE id = @id`);

    res.json({ insight, cached: false });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/ai-coach — AI Coach phân tích nhật ký, cache 7 ngày ──
router.get('/ai-coach', async (req, res) => {
  try {
    const db  = await getPool();
    const uid = req.user.id;

    const cacheR = await db.request().input('id', sql.Int, uid)
      .query(`SELECT ai_coach_text, ai_coach_date FROM Users WHERE id = @id`);
    const row = cacheR.recordset[0];
    if (row && row.ai_coach_text && row.ai_coach_date) {
      const ageDays = Math.floor((Date.now() - new Date(row.ai_coach_date).getTime()) / 86400000);
      if (ageDays < 7) return res.json({ advice: JSON.parse(row.ai_coach_text), cached: true });
    }

    const entriesR = await db.request().input('uid', sql.Int, uid).query(`
      SELECT TOP 30 mood_score, event_text, tags, created_at
      FROM DiaryEntries WHERE user_id = @uid ORDER BY created_at DESC
    `);
    const entries = entriesR.recordset;
    if (entries.length < 3)
      return res.json({ advice: null, message: 'Cần ít nhất 3 nhật ký để phân tích.' });

    let advice = null;
    const avgMood = entries.reduce((s, e) => s + e.mood_score, 0) / entries.length;

    if (genai) {
      const summary = entries.slice(0, 10).map((e, i) =>
        `#${i+1}: Mood ${e.mood_score}/10. "${(e.event_text || '').slice(0, 100)}"`
      ).join('\n');
      const prompt = `Bạn là coach tâm lý ấm áp cho học sinh/sinh viên Việt Nam. Phân tích nhật ký cảm xúc (mood TB: ${avgMood.toFixed(1)}/10) và đưa ra đúng 3 lời khuyên thực tế, cụ thể, ấm áp.
Trả về JSON thuần (không markdown): {"advice":[{"emoji":"🌱","title":"Tiêu đề ngắn","body":"2-3 câu cụ thể"}]}
Nhật ký gần nhất:\n${summary}`;
      try {
        const model  = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(prompt);
        const raw    = result.response.text().trim().replace(/^```json\n?|\n?```$/g, '');
        const parsed = JSON.parse(raw);
        if (parsed.advice && Array.isArray(parsed.advice) && parsed.advice.length > 0)
          advice = parsed.advice.slice(0, 3);
      } catch (e) { console.error('Gemini coach error:', e.message); }
    }

    if (!advice) {
      const tagFreq = {};
      entries.forEach(e => {
        if (e.tags) e.tags.split('|').filter(Boolean).forEach(t => { tagFreq[t] = (tagFreq[t]||0)+1; });
      });
      const topTag = Object.keys(tagFreq).sort((a,b) => tagFreq[b] - tagFreq[a])[0];
      advice = [
        avgMood < 5
          ? { emoji: '💙', title: 'Chăm sóc bản thân', body: 'Tâm trạng gần đây có vẻ nặng nề. Hãy thử dành 10 phút mỗi ngày cho một hoạt động yêu thích — đọc sách, nghe nhạc, hay đi dạo nhẹ nhàng.' }
          : { emoji: '🌟', title: 'Duy trì năng lượng', body: 'Tâm trạng bạn đang khá tốt! Ghi lại những gì đang giúp bạn cảm thấy như vậy để tái tạo khi cần thiết.' },
        { emoji: '📓', title: 'Kiên trì với nhật ký', body: `Bạn đã ghi ${entries.length} nhật ký gần đây — đây là nền tảng tuyệt vời. Thử đặt nhắc nhở mỗi tối để không bỏ lỡ ngày nào.` },
        topTag
          ? { emoji: '🔍', title: `Khám phá chủ đề "${topTag}"`, body: `Bạn thường xuyên ghi về "${topTag}". Hãy suy ngẫm sâu hơn: điều này ảnh hưởng tới bạn thế nào và bạn có thể phát triển ở đây không?` }
          : { emoji: '🏷️', title: 'Thêm nhãn cảm xúc', body: 'Thử thêm tags vào nhật ký để dễ nhìn lại xu hướng. Ví dụ: "học tập", "gia đình", "bạn bè", "stress".' },
      ];
    }

    await db.request()
      .input('id',   sql.Int,      uid)
      .input('text', sql.NVarChar, JSON.stringify(advice))
      .input('date', sql.Date,     new Date())
      .query(`UPDATE Users SET ai_coach_text = @text, ai_coach_date = @date WHERE id = @id`);

    res.json({ advice, cached: false });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

module.exports = router;
