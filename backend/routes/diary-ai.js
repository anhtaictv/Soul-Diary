// routes/diary-ai.js — Các route AI: gợi ý chủ đề, tóm tắt tuần, AI Coach
// Mount sau authMiddleware trong diary.js — không cần auth riêng.
const express = require('express');
const { getPool, sql } = require('../db');
const { genai, DAILY_PROMPTS, dayOfYear } = require('../utils/diary-helpers');
const { decryptRows } = require('../utils/diary-crypto');
const { toDateOnly, fromDateOnly, localDayKey } = require('../utils/date-only');
const gateway = require('../utils/ai-client');

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
    const today = localDayKey();
    if (ai_recap_text && ai_recap_date && localDayKey(fromDateOnly(ai_recap_date)) === today)
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
    if (thisDays > 0) {
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

      // 1. Gateway
      insight = await gateway.chat({ prompt, maxTokens: 400, label: 'smart-recap' });

      // 2. Gemini
      if (!insight && genai) {
        try {
          const model  = genai.getGenerativeModel({ model: 'gemini-3.6-flash' });
          const result = await model.generateContent(prompt);
          insight = result.response.text().trim();
        } catch (aiErr) {
          console.error('Gemini smart-recap error:', aiErr.message);
          insight = null;
        }
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
      .input('date', sql.Date,     toDateOnly())
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
    if (row && row.ai_coach_text && row.ai_coach_date && localDayKey(fromDateOnly(row.ai_coach_date)) === localDayKey())
      return res.json({ advice: JSON.parse(row.ai_coach_text), cached: true });

    const entriesR = await db.request().input('uid', sql.Int, uid).query(`
      SELECT TOP 30 mood_score, event_text, tags, created_at
      FROM DiaryEntries WHERE user_id = @uid ORDER BY created_at DESC
    `);
    const entries = decryptRows(entriesR.recordset, ['event_text']);
    if (entries.length < 3)
      return res.json({ advice: null, message: 'Cần ít nhất 3 nhật ký để phân tích.' });

    let advice = null;
    const avgMood = entries.reduce((s, e) => s + e.mood_score, 0) / entries.length;

    {
      const summary = entries.slice(0, 10).map((e, i) =>
        `#${i+1}: Mood ${e.mood_score}/10. "${(e.event_text || '').slice(0, 100)}"`
      ).join('\n');
      const prompt = `Bạn là coach tâm lý ấm áp cho học sinh/sinh viên Việt Nam. Phân tích nhật ký cảm xúc (mood TB: ${avgMood.toFixed(1)}/10) và đưa ra đúng 3 lời khuyên thực tế, cụ thể, ấm áp.
Trả về JSON thuần (không markdown): {"advice":[{"emoji":"🌱","title":"Tiêu đề ngắn","body":"2-3 câu cụ thể"}]}
Nhật ký gần nhất:\n${summary}`;

      // 1. Gateway
      const gwParsed = gateway.parseJson(
        await gateway.chat({ prompt, json: true, maxTokens: 900, label: 'ai-coach' })
      );
      if (Array.isArray(gwParsed?.advice) && gwParsed.advice.length > 0)
        advice = gwParsed.advice.slice(0, 3);

      // 2. Gemini
      if (!advice && genai) {
        try {
          const model  = genai.getGenerativeModel({ model: 'gemini-3.6-flash' });
          const result = await model.generateContent(prompt);
          const raw    = result.response.text().trim().replace(/^```json\n?|\n?```$/g, '');
          const parsed = JSON.parse(raw);
          if (parsed.advice && Array.isArray(parsed.advice) && parsed.advice.length > 0)
            advice = parsed.advice.slice(0, 3);
        } catch (e) { console.error('Gemini coach error:', e.message); }
      }
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
      .input('date', sql.Date,     toDateOnly())
      .query(`UPDATE Users SET ai_coach_text = @text, ai_coach_date = @date WHERE id = @id`);

    res.json({ advice, cached: false });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/mood-forecast — Dự báo chủ động: đối chiếu Lịch học tập
//     sắp tới với pattern mood của chính user quanh các mốc tương tự trước đây ──
router.get('/mood-forecast', async (req, res) => {
  try {
    const db  = await getPool();
    const uid = req.user.id;

    const upcomingR = await db.request().input('uid', sql.Int, uid).query(`
      SELECT TOP 1 title, event_type, event_date
      FROM StudyEvents
      WHERE user_id=@uid AND is_done=0 AND event_type IN ('exam','deadline')
        AND event_date >= CAST(GETDATE() AS DATE) AND event_date <= DATEADD(DAY,21,CAST(GETDATE() AS DATE))
      ORDER BY event_date ASC
    `);
    const upcoming = upcomingR.recordset[0];
    if (!upcoming) return res.json({ forecast: null });

    const daysUntil = Math.round((fromDateOnly(upcoming.event_date) - toDateOnly()) / 86400000);
    const eventLabel = upcoming.event_type === 'exam' ? 'kỳ thi' : 'deadline';

    const overallR = await db.request().input('uid', sql.Int, uid).query(`
      SELECT AVG(CAST(mood_score AS FLOAT)) AS avg_mood, COUNT(*) AS cnt FROM DiaryEntries WHERE user_id=@uid
    `);
    const { avg_mood: overallAvg, cnt: totalEntries } = overallR.recordset[0];

    const pastR = await db.request().input('uid', sql.Int, uid).query(`
      SELECT (SELECT AVG(CAST(mood_score AS FLOAT)) FROM DiaryEntries de
                WHERE de.user_id=se.user_id AND de.created_at >= DATEADD(DAY,-5,se.event_date) AND de.created_at < se.event_date) AS pre_avg
      FROM StudyEvents se
      WHERE se.user_id=@uid AND se.event_type IN ('exam','deadline') AND se.event_date < CAST(GETDATE() AS DATE)
    `);
    const preAvgs = pastR.recordset.map(r => r.pre_avg).filter(v => v !== null);

    let level = 'unknown'; // 'unknown' | 'dip' | 'stable'
    let dip = 0;
    if (totalEntries >= 5 && preAvgs.length >= 2 && overallAvg !== null) {
      const avgPre = preAvgs.reduce((a, b) => a + b, 0) / preAvgs.length;
      dip = overallAvg - avgPre;
      level = dip >= 0.5 ? 'dip' : 'stable';
    }

    let suggestion = null;
    if (level === 'dip') {
      const artR = await db.request().query(`
        SELECT TOP 1 id, title FROM Articles
        WHERE is_published=1 AND type='exercise' AND category IN ('stress','study')
        ORDER BY NEWID()
      `);
      suggestion = artR.recordset[0] || null;
    }

    const message = level === 'dip'
      ? `Bạn có "${upcoming.title}" (${eventLabel}) trong ${daysUntil} ngày nữa. Nhìn lại lịch sử, tâm trạng của bạn thường giảm nhẹ trong những ngày trước các mốc như thế này (thấp hơn khoảng ${dip.toFixed(1)} điểm so với mức trung bình) — biết trước để chuẩn bị sẽ dễ hơn nhiều.`
      : level === 'stable'
      ? `Bạn có "${upcoming.title}" (${eventLabel}) trong ${daysUntil} ngày nữa. Nhìn lại lịch sử, bạn thường giữ tâm trạng khá ổn quanh những mốc như thế này — cứ tự tin chuẩn bị nhé!`
      : `Bạn có "${upcoming.title}" (${eventLabel}) trong ${daysUntil} ngày nữa. Chưa đủ dữ liệu để dự báo, nhưng đừng quên chăm sóc bản thân trong giai đoạn chuẩn bị.`;

    res.json({
      forecast: {
        event: { title: upcoming.title, type: upcoming.event_type, days_until: daysUntil },
        level, message,
        suggestion: suggestion ? { id: suggestion.id, title: suggestion.title } : null,
      },
    });
  } catch (err) {
    console.error('Mood forecast error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/roleplay — dựng tình huống "nếu gặp lại thì sao" từ nhật ký gần nhất ──
router.get('/roleplay', async (req, res) => {
  try {
    const db  = await getPool();
    const uid = req.user.id;
    const entryR = await db.request().input('uid', sql.Int, uid).query(`
      SELECT TOP 1 event_text FROM DiaryEntries WHERE user_id=@uid ORDER BY created_at DESC
    `);
    if (!entryR.recordset.length)
      return res.json({ roleplay: null, message: 'Cần ít nhất 1 nhật ký để tạo tình huống.' });
    const [entry] = decryptRows(entryR.recordset, ['event_text']);
    const text = (entry.event_text || '').trim();
    if (!text) return res.json({ roleplay: null, message: 'Nhật ký gần nhất chưa có nội dung để phân tích.' });

    const prompt = `Bạn là coach tâm lý CBT ấm áp cho học sinh/sinh viên Việt Nam. Đọc đoạn nhật ký sau và dựng ra MỘT tình huống ngắn kiểu "nếu chuyện tương tự xảy ra lần nữa" để người viết luyện cách phản ứng. Không lặp lại nguyên văn nhật ký, không phán xét, không giả định chi tiết nhạy cảm không có trong bài viết.
Trả về JSON thuần (không markdown): {"scenario":"1-2 câu mô tả tình huống giả định","question":"câu hỏi mời người dùng viết cách họ sẽ phản ứng"}
Nhật ký: "${text.slice(0, 500)}"`;

    let roleplay = null;
    const gwParsed = gateway.parseJson(
      await gateway.chat({ prompt, json: true, maxTokens: 400, label: 'roleplay' })
    );
    if (gwParsed?.scenario) roleplay = { scenario: gwParsed.scenario, question: gwParsed.question || 'Bạn sẽ phản ứng thế nào?' };

    if (!roleplay && genai) {
      try {
        const model  = genai.getGenerativeModel({ model: 'gemini-3.6-flash' });
        const result = await model.generateContent(prompt);
        const raw    = result.response.text().trim().replace(/^```json\n?|\n?```$/g, '');
        const parsed = JSON.parse(raw);
        if (parsed.scenario) roleplay = { scenario: parsed.scenario, question: parsed.question || 'Bạn sẽ phản ứng thế nào?' };
      } catch (e) { console.error('Gemini roleplay error:', e.message); }
    }

    if (!roleplay) return res.json({ roleplay: null, message: 'Chưa tạo được tình huống, thử lại sau.' });
    res.json({ roleplay });
  } catch (err) {
    console.error('Roleplay error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/diary/roleplay-feedback — AI góp ý cho cách phản ứng người dùng vừa nhập ──
router.post('/roleplay-feedback', async (req, res) => {
  try {
    const { scenario, response } = req.body;
    if (!scenario || !response || !response.trim())
      return res.status(400).json({ message: 'Thiếu tình huống hoặc câu trả lời.' });

    const prompt = `Bạn là coach tâm lý CBT ấm áp cho học sinh/sinh viên Việt Nam.
Tình huống: "${String(scenario).slice(0, 300)}"
Cách người dùng dự định phản ứng: "${String(response).slice(0, 500)}"
Viết đúng 2-3 câu tiếng Việt góp ý: khen điểm tốt trong cách phản ứng (nếu có), gợi ý nhẹ nhàng để cải thiện. Giọng ấm áp, không phán xét, không chẩn đoán. Không dùng tiêu đề, bullet.`;

    let feedback = await gateway.chat({ prompt, maxTokens: 300, label: 'roleplay-feedback' });

    if (!feedback && genai) {
      try {
        const model  = genai.getGenerativeModel({ model: 'gemini-3.6-flash' });
        const result = await model.generateContent(prompt);
        feedback = result.response.text().trim();
      } catch (e) { console.error('Gemini roleplay-feedback error:', e.message); }
    }

    if (!feedback) feedback = 'Cảm ơn bạn đã thử luyện tập! Đây là một bước tốt để chuẩn bị tâm lý cho tình huống thật — cứ tiếp tục suy ngẫm và điều chỉnh dần theo thời gian nhé.';

    res.json({ feedback });
  } catch (err) {
    console.error('Roleplay feedback error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
