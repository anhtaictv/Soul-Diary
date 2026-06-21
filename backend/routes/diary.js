// routes/diary.js — CRUD nhật ký cảm xúc
const express        = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genai = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const router = express.Router();
router.use(authMiddleware);   // Tất cả diary routes đều cần auth

// ── Helper: parse cột photos (JSON array data URI) — trả [] nếu null/lỗi ──
function parsePhotos(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

const MAX_PHOTOS = 4;
const MAX_PHOTO_SIZE = 3_000_000; // ~2MB ảnh gốc sau khi base64 hóa

// ── Helper: validate + serialize mảng ảnh đính kèm, trả {error} hoặc {photosJson} ──
function buildPhotosJson(photos) {
  if (photos === undefined || photos === null) return { photosJson: null };
  if (!Array.isArray(photos)) return { error: 'Định dạng ảnh không hợp lệ.' };

  const validPhotos = photos.filter(Boolean);
  if (validPhotos.length > MAX_PHOTOS) {
    return { error: `Chỉ được đính kèm tối đa ${MAX_PHOTOS} ảnh.` };
  }
  for (const p of validPhotos) {
    if (typeof p !== 'string' || !p.startsWith('data:image/')) {
      return { error: 'Định dạng ảnh không hợp lệ.' };
    }
    if (p.length > MAX_PHOTO_SIZE) {
      return { error: 'Ảnh quá lớn (mỗi ảnh tối đa khoảng 2MB).' };
    }
  }
  return { photosJson: validPhotos.length ? JSON.stringify(validPhotos) : null };
}

// ── Helper: phân tích cảm xúc dựa trên từ khóa (fallback khi không có Gemini) ──
const EMOTION_KW = {
  'Buồn bã':  ['buồn','khóc','mất','cô đơn','trống rỗng','chán nản','tuyệt vọng','đau lòng'],
  'Lo lắng':  ['lo','lo lắng','sợ','căng thẳng','áp lực','hồi hộp','bất an','lo sợ'],
  'Tức giận': ['tức','giận','bực','bực bội','khó chịu','phẫn nộ','cáu'],
  'Vui vẻ':   ['vui','hạnh phúc','phấn khích','tuyệt vời','hài lòng','phấn khởi'],
  'Mệt mỏi':  ['mệt','kiệt sức','chán','mệt mỏi','uể oải'],
  'Hy vọng':  ['hy vọng','hi vọng','mong','kỳ vọng','tin tưởng','lạc quan'],
  'Biết ơn':  ['cảm ơn','biết ơn','trân trọng','may mắn'],
  'Tự hào':   ['tự hào','thành công','đạt được','hoàn thành','chiến thắng'],
};
const THEME_KW = {
  'Học tập':   ['học','bài','thi','điểm','lớp','thầy','cô','trường','bài tập'],
  'Gia đình':  ['ba','mẹ','gia đình','bố','anh','chị','em','nhà'],
  'Bạn bè':    ['bạn','bạn bè','nhóm','hội'],
  'Sức khỏe':  ['bệnh','sức khỏe','đau','bác sĩ','thuốc'],
  'Tình cảm':  ['người yêu','thích','yêu','chia tay','crush'],
  'Công việc': ['việc','làm','thực tập','đi làm','sếp'],
};

function ruleBasedAnalysis(text, moodScore) {
  const lc = (text || '').toLowerCase();
  const eScores = {};
  for (const [em, kws] of Object.entries(EMOTION_KW))
    eScores[em] = kws.filter(k => lc.includes(k)).length;
  const dominant = Object.entries(eScores).sort((a,b)=>b[1]-a[1]).filter(([,v])=>v>0);
  let emotions;
  if (!dominant.length) {
    if (moodScore >= 8) emotions = [{ name:'Vui vẻ', percent:70 },{ name:'Hy vọng', percent:30 }];
    else if (moodScore >= 6) emotions = [{ name:'Bình thản', percent:60 },{ name:'Hy vọng', percent:40 }];
    else if (moodScore >= 4) emotions = [{ name:'Mệt mỏi', percent:50 },{ name:'Lo lắng', percent:50 }];
    else emotions = [{ name:'Buồn bã', percent:60 },{ name:'Lo lắng', percent:40 }];
  } else {
    const total = dominant.reduce((s,[,v])=>s+v,0);
    emotions = dominant.slice(0,3).map(([name,v]) => ({ name, percent: Math.round(v/total*100) }));
  }
  const themes = Object.entries(THEME_KW).filter(([,kws]) => kws.some(k=>lc.includes(k))).map(([t])=>t).slice(0,3);
  const intensity = moodScore <= 3 ? 'cao' : moodScore <= 6 ? 'trung bình' : 'thấp';
  const suggestions = [
    moodScore <= 4
      ? 'Hãy nói chuyện với người bạn tin tưởng về những cảm xúc này.'
      : 'Tiếp tục ghi chép cảm xúc — đây là cách tốt nhất để hiểu bản thân.',
    themes.includes('Học tập')
      ? 'Chia nhỏ bài tập thành từng bước nhỏ để bớt áp lực.'
      : 'Dành 10 phút mỗi ngày để thư giãn cơ thể và tâm trí.',
  ];
  return { emotions, themes, intensity, suggestions };
}

async function analyzeEntry(text, moodScore) {
  if (genai && (text || '').trim().length > 20) {
    const prompt = `Phân tích cảm xúc đoạn nhật ký tiếng Việt này. Trả về JSON thuần (không markdown, không giải thích):
{"emotions":[{"name":"Tên cảm xúc","percent":50}],"themes":["Chủ đề"],"intensity":"cao|trung bình|thấp","suggestions":["Gợi ý 1","Gợi ý 2"]}
Quy tắc: tối đa 3 emotions (tổng percent=100), tối đa 3 themes (1-2 từ tiếng Việt), 2 suggestions ngắn gọn thực tế.
Nhật ký: "${text.slice(0,800)}"
Điểm tâm trạng: ${moodScore}/10`;
    try {
      const model  = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const raw    = result.response.text().trim().replace(/^```json\n?|\n?```$/g, '');
      const parsed = JSON.parse(raw);
      if (parsed.emotions && Array.isArray(parsed.emotions)) return parsed;
    } catch (e) {
      console.error('Gemini emotion error:', e.message);
    }
  }
  return ruleBasedAnalysis(text, moodScore);
}

// ── Helper: Trợ lý Tâm hồn AI — lời phản hồi ấm áp sau khi lưu nhật ký ──
const COMPANION_FALLBACK = {
  low: [
    'Hôm nay có vẻ là một ngày không dễ dàng với bạn. Cảm xúc của bạn hoàn toàn hợp lý — bạn đã dũng cảm khi viết ra. Điều gì sẽ giúp bạn cảm thấy nhẹ nhõm hơn một chút ngay bây giờ?',
    'Mình nghe thấy sự mệt mỏi trong những dòng chữ này. Bạn không cần phải mạnh mẽ mọi lúc. Nếu ngày mai có một điều nhỏ thay đổi, bạn muốn điều đó là gì?',
    'Cảm ơn bạn đã chia sẻ những điều khó nói này. Mỗi cảm xúc đều xứng đáng được lắng nghe, kể cả những cảm xúc nặng nề nhất. Ai là người bạn có thể tâm sự thêm về điều này?',
  ],
  mid: [
    'Một ngày bình thường cũng đáng được ghi lại — không phải lúc nào cũng cần điều gì đó lớn lao. Điều gì trong hôm nay khiến bạn suy nghĩ nhiều nhất?',
    'Cảm ơn bạn đã dành thời gian nhìn lại ngày hôm nay. Nếu có thể thay đổi một phần nhỏ của ngày mai, bạn sẽ chọn điều gì?',
    'Những cảm xúc xen lẫn như vậy là điều rất con người. Bạn nghĩ điều gì đã giúp bạn giữ được sự bình thản hôm nay?',
  ],
  high: [
    'Thật vui khi đọc được những dòng tích cực này! Bạn đã làm gì khiến hôm nay trở nên đặc biệt như vậy?',
    'Cảm xúc tốt đẹp này xứng đáng được ăn mừng. Bạn muốn giữ lại điều gì từ hôm nay cho những ngày sau này?',
    'Năng lượng tích cực của bạn lan tỏa qua từng câu chữ. Điều gì đã góp phần lớn nhất tạo nên ngày hôm nay của bạn?',
  ],
};

function ruleBasedCompanion(moodScore) {
  const bucket = moodScore <= 4 ? 'low' : moodScore <= 7 ? 'mid' : 'high';
  const list = COMPANION_FALLBACK[bucket];
  return list[Math.floor(Math.random() * list.length)];
}

async function companionMessage(text, moodScore) {
  if (genai && (text || '').trim().length > 20) {
    const prompt = `Bạn là người đồng hành ấm áp, không phán xét, trong ứng dụng nhật ký "Soul Diary" dành cho học sinh/sinh viên Việt Nam. Họ vừa viết:
"${text.slice(0,800)}"
Điểm tâm trạng: ${moodScore}/10
Hãy viết đúng 2-3 câu tiếng Việt thuần văn xuôi (không markdown, không gạch đầu dòng, không JSON): một lời phản hồi ấm áp, đồng cảm, KHÔNG lặp lại nguyên văn nhật ký, và kết thúc bằng một câu hỏi gợi mở nhẹ nhàng để họ suy ngẫm thêm. Giọng văn tự nhiên, gần gũi, không giáo điều, không dùng emoji.`;
    try {
      const model  = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const text2  = result.response.text().trim();
      if (text2) return text2;
    } catch (e) {
      console.error('Gemini companion error:', e.message);
    }
  }
  return ruleBasedCompanion(moodScore);
}

// ── Gợi ý chủ đề viết hàng ngày — cố định theo ngày, không tốn quota Gemini ──
const DAILY_PROMPTS = [
  'Điều gì làm bạn mỉm cười hôm nay?',
  'Nếu được gửi một lời khuyên cho chính mình 5 năm trước, bạn sẽ nói gì?',
  'Một điều nhỏ bạn biết ơn ngay lúc này là gì?',
  'Hôm nay bạn đã tử tế với ai, hoặc ai đã tử tế với bạn?',
  'Có điều gì đang khiến bạn lo lắng mà bạn chưa nói ra với ai?',
  'Nếu hôm nay có một màu sắc, bạn sẽ chọn màu gì và vì sao?',
  'Điều gì bạn đã học được về bản thân trong tuần này?',
  'Bạn muốn ngày mai của mình khác hôm nay ở điểm nào?',
  'Một kỷ niệm vui nào vừa chợt đến trong đầu bạn?',
  'Bạn đang chờ đợi điều gì nhất trong những ngày tới?',
  'Điều gì khiến bạn cảm thấy an toàn khi mọi thứ trở nên quá tải?',
  'Nếu có thể nói một câu với người đã làm bạn buồn, bạn sẽ nói gì?',
  'Bạn đã đối xử với bản thân như thế nào hôm nay?',
  'Một nỗi sợ bạn muốn vượt qua trong năm nay là gì?',
  'Điều gì khiến bạn cảm thấy tự hào về bản thân gần đây?',
  'Nếu hôm nay là một trang sách, tiêu đề của trang đó sẽ là gì?',
  'Bạn đang mang theo gánh nặng nào mà muốn đặt xuống?',
  'Một người bạn muốn cảm ơn nhưng chưa có cơ hội là ai?',
  'Điều gì khiến bạn thấy bình yên nhất lúc này?',
  'Nếu được nghỉ một ngày không lo nghĩ gì, bạn sẽ làm gì?',
  'Bạn nghĩ phiên bản tốt nhất của mình trông như thế nào?',
  'Có điều gì bạn đang trì hoãn vì sợ thất bại không?',
  'Điều gì trong quá khứ bạn đã buông bỏ được, và cảm giác đó ra sao?',
  'Bạn muốn được lắng nghe điều gì nhất ngay bây giờ?',
  'Một thói quen nhỏ nào đang giúp bạn từng ngày?',
];

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

// ── GET /api/diary — danh sách nhật ký (có phân trang) ──────────────────
router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const db = await getPool();

    const [dataResult, countResult] = await Promise.all([
      db.request()
        .input('user_id', sql.Int, req.user.id)
        .input('limit',   sql.Int, limit)
        .input('offset',  sql.Int, offset)
        .query(`
          SELECT id, mood_score, event_text, thoughts, gratitude, tags, audio_data, ai_emotion, ai_companion_message, cbt_data, photos, created_at
          FROM DiaryEntries
          WHERE user_id = @user_id
          ORDER BY created_at DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `),
      db.request()
        .input('user_id', sql.Int, req.user.id)
        .query('SELECT COUNT(*) AS total FROM DiaryEntries WHERE user_id = @user_id'),
    ]);

    const total = countResult.recordset[0].total;

    res.json({
      entries: dataResult.recordset.map(e => ({
        ...e,
        tags: e.tags ? e.tags.split('|') : [],
        photos: parsePhotos(e.photos),
      })),
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Get diary error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/mental-health — 4 chỉ số sức khỏe tâm thần ──────────────
router.get('/mental-health', async (req, res) => {
  try {
    const db = await getPool();

    // 1. Cảm xúc xuất hiện nhiều nhất (từ ai_emotion JSON, fallback sang tags)
    const emotionRes = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`
        SELECT TOP 30 ai_emotion, tags
        FROM DiaryEntries
        WHERE user_id = @user_id AND created_at >= DATEADD(DAY, -30, GETDATE())
        ORDER BY created_at DESC
      `);
    const emotionCount = {};
    for (const row of emotionRes.recordset) {
      if (row.ai_emotion) {
        try {
          const ae = JSON.parse(row.ai_emotion);
          if (ae.emotions) ae.emotions.forEach(e => {
            emotionCount[e.name] = (emotionCount[e.name] || 0) + e.percent;
          });
        } catch {}
      } else if (row.tags) {
        row.tags.split('|').filter(Boolean).forEach(t => {
          emotionCount[t] = (emotionCount[t] || 0) + 1;
        });
      }
    }
    const topEmotion = Object.entries(emotionCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

    // 2. Ngày trong tuần căng thẳng nhất (avg mood thấp nhất, cần ít nhất 2 mẫu)
    const dayRes = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`
        SELECT DATEPART(WEEKDAY, created_at) AS dow,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id = @user_id AND created_at >= DATEADD(DAY, -60, GETDATE())
        GROUP BY DATEPART(WEEKDAY, created_at)
        HAVING COUNT(*) >= 2
        ORDER BY avg_mood ASC
      `);
    const DOW = ['','Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
    const stressDay = dayRes.recordset[0] ? DOW[dayRes.recordset[0].dow] : null;

    // 3. Chủ đề áp lực (theme thường gặp khi mood thấp)
    const themeRes = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`
        SELECT TOP 20 ai_emotion, tags
        FROM DiaryEntries
        WHERE user_id = @user_id AND mood_score <= 5
          AND created_at >= DATEADD(DAY, -30, GETDATE())
        ORDER BY created_at DESC
      `);
    const themeCount = {};
    for (const row of themeRes.recordset) {
      if (row.ai_emotion) {
        try {
          const ae = JSON.parse(row.ai_emotion);
          if (ae.themes) ae.themes.forEach(t => { themeCount[t] = (themeCount[t]||0)+1; });
        } catch {}
      }
      if (row.tags) {
        row.tags.split('|').filter(Boolean).forEach(t => { themeCount[t] = (themeCount[t]||0)+1; });
      }
    }
    const topTheme = Object.entries(themeCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

    // 4. Xu hướng tháng này vs tháng trước
    const trendRes = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`
        SELECT
          SUM(CASE WHEN created_at >= DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE()),0) THEN CAST(mood_score AS FLOAT) ELSE 0 END) AS this_sum,
          SUM(CASE WHEN created_at >= DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE()),0) THEN 1 ELSE 0 END) AS this_cnt,
          SUM(CASE WHEN created_at < DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE()),0)
                    AND created_at >= DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE())-1,0) THEN CAST(mood_score AS FLOAT) ELSE 0 END) AS last_sum,
          SUM(CASE WHEN created_at < DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE()),0)
                    AND created_at >= DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE())-1,0) THEN 1 ELSE 0 END) AS last_cnt
        FROM DiaryEntries WHERE user_id = @user_id
      `);
    const tr = trendRes.recordset[0];
    const thisAvg = tr.this_cnt > 0 ? tr.this_sum / tr.this_cnt : null;
    const lastAvg = tr.last_cnt > 0 ? tr.last_sum / tr.last_cnt : null;
    let monthTrend = null;
    if (thisAvg !== null && lastAvg !== null) {
      const diff = thisAvg - lastAvg;
      monthTrend = { this: +thisAvg.toFixed(1), last: +lastAvg.toFixed(1), diff: +diff.toFixed(1) };
    }

    res.json({ topEmotion, stressDay, topTheme, monthTrend });
  } catch (err) {
    console.error('Mental health error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/stats — thống kê cho biểu đồ ─────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const days = Math.min(90, parseInt(req.query.days) || 14);
    const db   = await getPool();

    const result = await db.request()
      .input('user_id', sql.Int,  req.user.id)
      .input('days',    sql.Int,  days)
      .query(`
        SELECT
          CAST(created_at AS DATE) AS entry_date,
          AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
          MAX(mood_score) AS max_mood,
          MIN(mood_score) AS min_mood,
          COUNT(*) AS entry_count,
          STRING_AGG(tags, '|') AS all_tags
        FROM DiaryEntries
        WHERE user_id = @user_id
          AND created_at >= DATEADD(DAY, -@days, GETDATE())
        GROUP BY CAST(created_at AS DATE)
        ORDER BY entry_date ASC
      `);

    res.json({ stats: result.recordset });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/calendar?month=YYYY-MM — bản đồ thời tiết tâm hồn theo tháng ──
router.get('/calendar', async (req, res) => {
  try {
    const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : null;
    const now   = new Date();
    const year  = m ? parseInt(m.slice(0,4)) : now.getFullYear();
    const month = m ? parseInt(m.slice(5,7)) - 1 : now.getMonth();
    const start = new Date(year, month, 1);
    const end   = new Date(year, month + 1, 1);
    const monthLabel = `${year}-${String(month+1).padStart(2,'0')}`;

    const db = await getPool();
    const result = await db.request()
      .input('user_id', sql.Int,      req.user.id)
      .input('start',   sql.DateTime, start)
      .input('end',     sql.DateTime, end)
      .query(`
        SELECT
          CAST(created_at AS DATE) AS entry_date,
          AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
          COUNT(*) AS entry_count
        FROM DiaryEntries
        WHERE user_id = @user_id AND created_at >= @start AND created_at < @end
        GROUP BY CAST(created_at AS DATE)
        ORDER BY entry_date ASC
      `);

    res.json({ month: monthLabel, days: result.recordset });
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/daily-prompt — gợi ý chủ đề viết hôm nay ─────────────
router.get('/daily-prompt', async (req, res) => {
  const idx = req.query.refresh === '1'
    ? Math.floor(Math.random() * DAILY_PROMPTS.length)
    : dayOfYear(new Date()) % DAILY_PROMPTS.length;
  res.json({ prompt: DAILY_PROMPTS[idx] });
});

// ── GET /api/diary/smart-recap — AI tóm tắt tuần (cache 1 lần/ngày) ────
router.get('/smart-recap', async (req, res) => {
  try {
    const db = await getPool();

    // Kiểm tra cache còn dùng được không
    const cacheRes = await db.request()
      .input('id', sql.Int, req.user.id)
      .query(`SELECT ai_recap_text, ai_recap_date FROM Users WHERE id = @id`);
    const { ai_recap_text, ai_recap_date } = cacheRes.recordset[0];
    const today = new Date().toISOString().split('T')[0];

    if (ai_recap_text && ai_recap_date && ai_recap_date.toISOString().startsWith(today)) {
      return res.json({ insight: ai_recap_text, cached: true });
    }

    // Lấy stats 14 ngày
    const statsRes = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`
        SELECT
          CAST(created_at AS DATE) AS entry_date,
          AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
          COUNT(*) AS entry_count,
          STRING_AGG(tags, '|') AS all_tags
        FROM DiaryEntries
        WHERE user_id = @user_id AND created_at >= DATEADD(DAY, -14, GETDATE())
        GROUP BY CAST(created_at AS DATE)
        ORDER BY entry_date ASC
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

Dữ liệu tuần này của người dùng:
- Ngày ghi nhật ký: ${thisDays}/7 ngày
- Tâm trạng trung bình: ${thisAvg !== null ? thisAvg.toFixed(1) : 'chưa có'}/10
- Xu hướng: ${trend}
- Cảm xúc thường gặp: ${topEmotions.length > 0 ? topEmotions.join(', ') : 'chưa ghi nhãn'}
- Ngày tâm trạng thấp (≤4): ${lowMoodDays} ngày

Viết đúng 2-3 câu tiếng Việt: nhận xét ngắn về tuần cảm xúc và một gợi ý nhỏ phù hợp. Giọng ấm áp, khích lệ, tự nhiên. Không dùng tiêu đề, bullet, ký hiệu lạ.`;

      try {
        const model  = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(prompt);
        insight = result.response.text().trim();
      } catch (aiErr) {
        console.error('Gemini error:', aiErr.message);
        insight = null;
      }
    }

    // Fallback rule-based nếu Gemini lỗi hoặc chưa có key
    if (!insight) {
      if (thisDays === 0) {
        insight = 'Tuần này chưa có nhật ký nào. Hãy bắt đầu bằng một dòng nhỏ hôm nay — không cần hoàn hảo, chỉ cần thật! 🌱';
      } else {
        const trend = thisAvg === null ? '' : lastAvg === null ? '' :
          thisAvg - lastAvg > 0.5 ? `Tâm trạng đang cải thiện (tăng ${(thisAvg-lastAvg).toFixed(1)} điểm) 📈. ` :
          thisAvg - lastAvg < -0.5 ? `Tâm trạng có xu hướng giảm so tuần trước 💙. ` : '';
        insight = `Tuần này bạn ghi ${thisDays}/7 ngày, tâm trạng trung bình ${thisAvg !== null ? thisAvg.toFixed(1) : '—'}/10. ${trend}${topEmotions.length > 0 ? `Cảm xúc nổi bật: ${topEmotions.join(', ')}. ` : ''}Tiếp tục duy trì thói quen ghi nhật ký — đây là cách tốt nhất để hiểu bản thân ✨`;
      }
    }

    // Lưu cache
    await db.request()
      .input('id',     sql.Int,      req.user.id)
      .input('text',   sql.NVarChar, insight)
      .input('date',   sql.Date,     new Date())
      .query(`UPDATE Users SET ai_recap_text = @text, ai_recap_date = @date WHERE id = @id`);

    res.json({ insight, cached: false });
  } catch (err) {
    console.error('Smart recap error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/diary — tạo nhật ký mới ───────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { mood_score, event_text, thoughts, gratitude, tags, audio_data, cbt_data, photos } = req.body;

    if (!mood_score || mood_score < 1 || mood_score > 10) {
      return res.status(400).json({ message: 'Điểm tâm trạng phải từ 1 đến 10.' });
    }
    if (!event_text && !thoughts && !cbt_data) {
      return res.status(400).json({ message: 'Vui lòng viết ít nhất một dòng nhật ký.' });
    }

    let cbtJson = null;
    if (cbt_data && typeof cbt_data === 'object') {
      cbtJson = JSON.stringify(cbt_data);
    }

    // Bản ghi âm: data URI base64, giới hạn ~30 giây (chặn cả phía client lẫn server)
    let audioData = null;
    if (audio_data) {
      if (typeof audio_data !== 'string' || !audio_data.startsWith('data:audio/')) {
        return res.status(400).json({ message: 'Định dạng bản ghi âm không hợp lệ.' });
      }
      if (audio_data.length > 2_000_000) {
        return res.status(400).json({ message: 'Bản ghi âm quá lớn (tối đa khoảng 30 giây).' });
      }
      audioData = audio_data;
    }

    // Ảnh đính kèm: tối đa MAX_PHOTOS ảnh dạng data URI base64
    const { photosJson, error: photosError } = buildPhotosJson(photos);
    if (photosError) return res.status(400).json({ message: photosError });

    const tagsStr = Array.isArray(tags) ? tags.join('|') : '';
    const db      = await getPool();

    // Insert entry
    const result = await db.request()
      .input('user_id',    sql.Int,      req.user.id)
      .input('mood_score', sql.TinyInt,  mood_score)
      .input('event_text', sql.NVarChar, event_text  || '')
      .input('thoughts',   sql.NVarChar, thoughts    || '')
      .input('gratitude',  sql.NVarChar, gratitude   || '')
      .input('tags',       sql.NVarChar, tagsStr)
      .input('audio_data', sql.NVarChar, audioData)
      .input('cbt_data',   sql.NVarChar, cbtJson)
      .input('photos',     sql.NVarChar, photosJson)
      .query(`
        INSERT INTO DiaryEntries (user_id, mood_score, event_text, thoughts, gratitude, tags, audio_data, cbt_data, photos)
        OUTPUT INSERTED.id, INSERTED.mood_score, INSERTED.event_text, INSERTED.thoughts,
               INSERTED.gratitude, INSERTED.tags, INSERTED.audio_data, INSERTED.cbt_data, INSERTED.photos, INSERTED.created_at
        VALUES (@user_id, @mood_score, @event_text, @thoughts, @gratitude, @tags, @audio_data, @cbt_data, @photos)
      `);

    const entry = result.recordset[0];

    // Cập nhật streak
    const streakResult = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`SELECT streak, last_entry, streak_freeze, max_streak FROM Users WHERE id = @user_id`);

    const { streak, last_entry, streak_freeze, max_streak } = streakResult.recordset[0];
    const today      = new Date(); today.setHours(0,0,0,0);
    const yesterday  = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const lastDate   = last_entry ? new Date(last_entry) : null;
    if (lastDate) lastDate.setHours(0,0,0,0);

    let newStreak      = streak;
    let freezeUsed     = false;
    let freezeGrant    = 0;
    let newFreezeCount = streak_freeze;

    const isSameDay    = lastDate && lastDate.getTime() === today.getTime();
    const isYesterday  = lastDate && lastDate.getTime() === yesterday.getTime();
    const isTwoDaysAgo = lastDate && lastDate.getTime() === twoDaysAgo.getTime();

    if (!isSameDay) {
      if (isYesterday) {
        newStreak = streak + 1;
      } else if (isTwoDaysAgo && streak_freeze > 0) {
        // Bỏ lỡ đúng 1 ngày + còn lượt freeze → tự động cứu streak
        newStreak  = streak + 1;
        freezeUsed = true;
      } else {
        newStreak = 1;
      }

      // Tặng lượt freeze khi đạt mốc streak
      const milestoneGrants = { 7: 1, 14: 1, 21: 1, 30: 2, 50: 2, 100: 3 };
      freezeGrant    = milestoneGrants[newStreak] || 0;
      const newMaxStreak  = Math.max(max_streak, newStreak);
      const freezeDelta   = freezeGrant - (freezeUsed ? 1 : 0);
      newFreezeCount = Math.max(0, streak_freeze + freezeDelta);

      await db.request()
        .input('user_id',    sql.Int,  req.user.id)
        .input('streak',     sql.Int,  newStreak)
        .input('last_entry', sql.Date, today)
        .input('max_streak', sql.Int,  newMaxStreak)
        .input('new_freeze', sql.Int,  newFreezeCount)
        .query(`
          UPDATE Users
          SET streak = @streak, last_entry = @last_entry,
              max_streak = @max_streak, streak_freeze = @new_freeze,
              updated_at = GETDATE()
          WHERE id = @user_id
        `);
    }

    res.status(201).json({
      message: 'Đã lưu nhật ký!',
      entry: { ...entry, tags: entry.tags ? entry.tags.split('|') : [], photos: parsePhotos(entry.photos) },
      streak:         newStreak,
      freeze_used:    freezeUsed,
      freeze_granted: freezeGrant,
      streak_freeze:  newFreezeCount,
    });
  } catch (err) {
    console.error('Create diary error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PUT /api/diary/:id — sửa nhật ký ────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { mood_score, event_text, thoughts, gratitude, tags, audio_data, cbt_data, photos } = req.body;
    const tagsStr = Array.isArray(tags) ? tags.join('|') : '';

    let audioData = null;
    if (audio_data) {
      if (typeof audio_data !== 'string' || !audio_data.startsWith('data:audio/')) {
        return res.status(400).json({ message: 'Định dạng bản ghi âm không hợp lệ.' });
      }
      if (audio_data.length > 2_000_000) {
        return res.status(400).json({ message: 'Bản ghi âm quá lớn (tối đa khoảng 30 giây).' });
      }
      audioData = audio_data;
    }

    let cbtJson = null;
    if (cbt_data && typeof cbt_data === 'object') cbtJson = JSON.stringify(cbt_data);

    // Ảnh đính kèm: tối đa MAX_PHOTOS ảnh dạng data URI base64
    const { photosJson, error: photosError } = buildPhotosJson(photos);
    if (photosError) return res.status(400).json({ message: photosError });

    const db = await getPool();

    const result = await db.request()
      .input('id',         sql.Int,      req.params.id)
      .input('user_id',    sql.Int,      req.user.id)
      .input('mood_score', sql.TinyInt,  mood_score)
      .input('event_text', sql.NVarChar, event_text || '')
      .input('thoughts',   sql.NVarChar, thoughts   || '')
      .input('gratitude',  sql.NVarChar, gratitude  || '')
      .input('tags',       sql.NVarChar, tagsStr)
      .input('audio_data', sql.NVarChar, audioData)
      .input('cbt_data',   sql.NVarChar, cbtJson)
      .input('photos',     sql.NVarChar, photosJson)
      .query(`
        UPDATE DiaryEntries
        SET mood_score = @mood_score, event_text = @event_text,
            thoughts = @thoughts, gratitude = @gratitude,
            tags = @tags, audio_data = @audio_data, cbt_data = @cbt_data, photos = @photos, updated_at = GETDATE()
        OUTPUT INSERTED.id, INSERTED.mood_score, INSERTED.event_text, INSERTED.thoughts,
               INSERTED.gratitude, INSERTED.tags, INSERTED.audio_data, INSERTED.cbt_data, INSERTED.photos, INSERTED.created_at
        WHERE id = @id AND user_id = @user_id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });
    }

    const entry = result.recordset[0];
    res.json({
      message: 'Đã cập nhật nhật ký.',
      entry: { ...entry, tags: entry.tags ? entry.tags.split('|') : [], photos: parsePhotos(entry.photos) },
    });
  } catch (err) {
    console.error('Update diary error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/:id/emotion — phân tích / trả cache cảm xúc entry ───────
router.get('/:id/emotion', async (req, res) => {
  try {
    const db  = await getPool();
    const row = await db.request()
      .input('id',      sql.Int, req.params.id)
      .input('user_id', sql.Int, req.user.id)
      .query(`SELECT id, mood_score, event_text, thoughts, gratitude, ai_emotion
              FROM DiaryEntries WHERE id=@id AND user_id=@user_id`);
    if (!row.recordset.length) return res.status(404).json({ message: 'Không tìm thấy.' });

    const entry = row.recordset[0];
    if (entry.ai_emotion) {
      try { return res.json({ analysis: JSON.parse(entry.ai_emotion), cached: true }); } catch {}
    }

    const text = [entry.event_text, entry.thoughts, entry.gratitude].filter(Boolean).join('\n');
    if (!text.trim()) return res.json({ analysis: null });

    const analysis = await analyzeEntry(text, entry.mood_score);
    await db.request()
      .input('id', sql.Int,      req.params.id)
      .input('ae', sql.NVarChar, JSON.stringify(analysis))
      .query(`UPDATE DiaryEntries SET ai_emotion=@ae WHERE id=@id`);

    res.json({ analysis, cached: false });
  } catch (err) {
    console.error('Emotion analysis error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/:id/companion — lời phản hồi ấm áp của Trợ lý Tâm hồn AI ──
router.get('/:id/companion', async (req, res) => {
  try {
    const db  = await getPool();
    const row = await db.request()
      .input('id',      sql.Int, req.params.id)
      .input('user_id', sql.Int, req.user.id)
      .query(`SELECT id, mood_score, event_text, thoughts, gratitude, ai_companion_message
              FROM DiaryEntries WHERE id=@id AND user_id=@user_id`);
    if (!row.recordset.length) return res.status(404).json({ message: 'Không tìm thấy.' });

    const entry = row.recordset[0];
    if (entry.ai_companion_message) {
      return res.json({ message: entry.ai_companion_message, cached: true });
    }

    const text = [entry.event_text, entry.thoughts, entry.gratitude].filter(Boolean).join('\n');
    if (!text.trim()) return res.json({ message: null });

    const message = await companionMessage(text, entry.mood_score);
    await db.request()
      .input('id', sql.Int,      req.params.id)
      .input('m',  sql.NVarChar, message)
      .query(`UPDATE DiaryEntries SET ai_companion_message=@m WHERE id=@id`);

    res.json({ message, cached: false });
  } catch (err) {
    console.error('Companion message error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── DELETE /api/diary/:id — xóa nhật ký ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('id',      sql.Int, req.params.id)
      .input('user_id', sql.Int, req.user.id)
      .query('DELETE FROM DiaryEntries OUTPUT DELETED.id WHERE id = @id AND user_id = @user_id');

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });
    }
    res.json({ message: 'Đã xóa nhật ký.' });
  } catch (err) {
    console.error('Delete diary error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
