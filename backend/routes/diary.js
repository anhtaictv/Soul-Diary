// routes/diary.js — CRUD nhật ký cảm xúc
const express        = require('express');
const crypto         = require('crypto');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { dataUriToBuffer, bufferToDataUri } = require('../utils/media');

const genai = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const router = express.Router();

// ── Public route: xem nhật ký được chia sẻ (không cần auth) ─────────────
router.get('/share/:token', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('token', sql.NVarChar(64), req.params.token)
      .query(`
        SELECT e.id, e.mood_score, e.event_text, e.gratitude, e.created_at, e.tags,
               u.username, u.full_name, u.avatar_text
        FROM DiaryEntries e
        JOIN Users u ON e.user_id = u.id
        WHERE e.share_token = @token
      `);
    if (!r.recordset.length)
      return res.status(404).json({ message: 'Liên kết không hợp lệ hoặc đã bị thu hồi.' });
    res.json({ entry: r.recordset[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

router.use(authMiddleware);   // Tất cả diary routes tiếp theo đều cần auth

const MAX_PHOTOS = 4;
const MAX_PHOTO_SIZE = 3_000_000; // ~2MB ảnh gốc sau khi base64 hóa

// ── Helper: validate mảng ảnh đính kèm, trả {error} hoặc {photos: [dataURI,...]} ──
function validatePhotos(photos) {
  if (photos === undefined || photos === null) return { photos: [] };
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
  return { photos: validPhotos };
}

// ── Helper: ghi ảnh/audio (data URI) của 1 entry vào DiaryMedia dạng nhị phân ──
async function saveMedia(db, entryId, photos, audioDataUri) {
  for (let i = 0; i < photos.length; i++) {
    const parsed = dataUriToBuffer(photos[i]);
    if (!parsed) continue;
    await db.request()
      .input('entry_id',   sql.Int, entryId)
      .input('kind',       sql.NVarChar, 'photo')
      .input('mime',       sql.NVarChar, parsed.mime)
      .input('data',       sql.VarBinary(sql.MAX), parsed.buffer)
      .input('sort_order', sql.Int, i)
      .query(`INSERT INTO DiaryMedia (entry_id, kind, mime_type, data, sort_order)
              VALUES (@entry_id, @kind, @mime, @data, @sort_order)`);
  }
  if (audioDataUri) {
    const parsed = dataUriToBuffer(audioDataUri);
    if (parsed) {
      await db.request()
        .input('entry_id',   sql.Int, entryId)
        .input('kind',       sql.NVarChar, 'audio')
        .input('mime',       sql.NVarChar, parsed.mime)
        .input('data',       sql.VarBinary(sql.MAX), parsed.buffer)
        .input('sort_order', sql.Int, 0)
        .query(`INSERT INTO DiaryMedia (entry_id, kind, mime_type, data, sort_order)
                VALUES (@entry_id, @kind, @mime, @data, @sort_order)`);
    }
  }
}

// ── Helper: lấy ảnh/audio (DiaryMedia) cho nhiều entry, trả Map entry_id -> {photos, audio_data} ──
async function loadMediaForEntries(db, entryIds) {
  const map = new Map();
  if (!entryIds.length) return map;
  const result = await db.request().query(`
    SELECT entry_id, kind, mime_type, data, sort_order
    FROM DiaryMedia WHERE entry_id IN (${entryIds.join(',')})
    ORDER BY entry_id, sort_order
  `);
  for (const row of result.recordset) {
    if (!map.has(row.entry_id)) map.set(row.entry_id, { photos: [], audio_data: null });
    const m = map.get(row.entry_id);
    const uri = bufferToDataUri(row.mime_type, row.data);
    if (row.kind === 'photo') m.photos.push(uri);
    else if (row.kind === 'audio') m.audio_data = uri;
  }
  return map;
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

// ── GET /api/diary/patterns — phân tích xu hướng cảm xúc 90 ngày ────────
router.get('/patterns', async (req, res) => {
  const DOW_VN = ['', 'Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  try {
    const db  = await getPool();
    const uid = req.user.id;

    const [dowR, monthR, overallR, tagR] = await Promise.all([
      // Mood trung bình theo ngày trong tuần (90 ngày gần nhất)
      db.request().input('uid', sql.Int, uid).query(`
        SELECT DATEPART(WEEKDAY, created_at) AS dow,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id = @uid AND created_at >= DATEADD(DAY, -90, GETDATE())
        GROUP BY DATEPART(WEEKDAY, created_at)
        ORDER BY dow
      `),
      // Mood trung bình theo tháng (3 tháng gần nhất)
      db.request().input('uid', sql.Int, uid).query(`
        SELECT FORMAT(created_at, 'yyyy-MM') AS month,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id = @uid AND created_at >= DATEADD(MONTH, -3, GETDATE())
        GROUP BY FORMAT(created_at, 'yyyy-MM')
        ORDER BY month
      `),
      // Tổng quan toàn bộ
      db.request().input('uid', sql.Int, uid).query(`
        SELECT COUNT(*) AS total,
               AVG(CAST(mood_score AS FLOAT)) AS overall_avg,
               MIN(mood_score) AS min_mood, MAX(mood_score) AS max_mood
        FROM DiaryEntries WHERE user_id = @uid
      `),
      // Top 5 tags được dùng nhiều nhất
      db.request().input('uid', sql.Int, uid).query(`
        SELECT TOP 5 tags, COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id = @uid AND tags IS NOT NULL AND tags != ''
        GROUP BY tags ORDER BY cnt DESC
      `),
    ]);

    const byDow = dowR.recordset;
    const best  = byDow.length ? [...byDow].sort((a, b) => b.avg_mood - a.avg_mood)[0] : null;
    const worst = byDow.length ? [...byDow].sort((a, b) => a.avg_mood - b.avg_mood)[0] : null;
    const stats = overallR.recordset[0] || {};

    res.json({
      best_day:    best  ? { label: DOW_VN[best.dow],  avg: +best.avg_mood.toFixed(1)  } : null,
      worst_day:   worst ? { label: DOW_VN[worst.dow], avg: +worst.avg_mood.toFixed(1) } : null,
      by_dow:      byDow.map(r => ({ label: DOW_VN[r.dow], avg: +r.avg_mood.toFixed(1), cnt: r.cnt })),
      monthly:     monthR.recordset.map(r => ({ month: r.month, avg: +r.avg_mood.toFixed(1), cnt: r.cnt })),
      total:       stats.total || 0,
      overall_avg: stats.overall_avg ? +stats.overall_avg.toFixed(1) : null,
      top_tags:    tagR.recordset,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/diary/search — tìm kiếm toàn văn nhật ký ──────────────────
router.get('/search', async (req, res) => {
  try {
    const q    = (req.query.q || '').trim();
    const from = req.query.from || null;
    const to   = req.query.to   || null;
    if (!q) return res.json({ entries: [] });

    const db = await getPool();
    const r  = db.request().input('user_id', sql.Int, req.user.id).input('q', sql.NVarChar, `%${q}%`);
    if (from) r.input('from', sql.Date, from);
    if (to)   r.input('to',   sql.Date, to);

    const result = await r.query(`
      SELECT TOP 50 id, mood_score, event_text, tags, cbt_data, created_at
      FROM DiaryEntries
      WHERE user_id = @user_id
        AND (event_text LIKE @q OR thoughts LIKE @q OR gratitude LIKE @q OR tags LIKE @q)
        ${from ? 'AND CAST(created_at AS DATE) >= @from' : ''}
        ${to   ? 'AND CAST(created_at AS DATE) <= @to'   : ''}
      ORDER BY created_at DESC
    `);

    res.json({
      entries: result.recordset.map(e => ({
        ...e,
        tags: e.tags ? e.tags.split('|') : [],
      })),
    });
  } catch (err) {
    console.error('Search diary error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

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
          SELECT id, mood_score, event_text, thoughts, gratitude, tags, ai_emotion, ai_companion_message, cbt_data, created_at
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
    const mediaMap = await loadMediaForEntries(db, dataResult.recordset.map(e => e.id));

    res.json({
      entries: dataResult.recordset.map(e => ({
        ...e,
        tags: e.tags ? e.tags.split('|') : [],
        photos: mediaMap.get(e.id)?.photos || [],
        audio_data: mediaMap.get(e.id)?.audio_data || null,
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

// ── GET /api/diary/export — Xuất nhật ký ra CSV (hoặc JSON cho PDF) ────
router.get('/export', async (req, res) => {
  try {
    const db   = await getPool();
    const from = req.query.from || `${new Date().getFullYear()}-01-01`;
    const to   = req.query.to   || new Date().toISOString().split('T')[0];
    const fmt  = req.query.format || 'csv';
    const result = await db.request()
      .input('uid',  sql.Int,  req.user.id)
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .query(`
        SELECT CONVERT(NVARCHAR(10), created_at, 23) AS entry_date,
               FORMAT(created_at, 'HH:mm') AS entry_time,
               mood_score,
               ISNULL(event_text, '') AS event_text,
               ISNULL(thoughts, '')   AS thoughts,
               ISNULL(gratitude, '')  AS gratitude,
               ISNULL(tags, '[]')     AS tags
        FROM DiaryEntries
        WHERE user_id = @uid
          AND created_at >= @from
          AND CAST(created_at AS DATE) <= @to
        ORDER BY created_at DESC
      `);
    if (fmt === 'json') return res.json({ entries: result.recordset, from, to });

    // CSV với BOM UTF-8 để Excel mở được
    const BOM  = '﻿';
    const CRLF = '\r\n';
    const esc  = s => `"${String(s || '').replace(/"/g, '""')}"`;
    const hdr  = ['Ngày','Giờ','Tâm trạng','Sự kiện / Cảm xúc','Suy nghĩ','Lòng biết ơn','Tags'].join(',');
    const rows = result.recordset.map(r => {
      let tags = '';
      try { tags = JSON.parse(r.tags).join('; '); } catch(_) {}
      return [r.entry_date, r.entry_time, r.mood_score, esc(r.event_text), esc(r.thoughts), esc(r.gratitude), esc(tags)].join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="souldiary-${from}-den-${to}.csv"`);
    res.send(BOM + hdr + CRLF + rows.join(CRLF));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi xuất dữ liệu' });
  }
});

// ── GET /api/diary/heatmap?year=YYYY — Heatmap cảm xúc năm ─────────────
router.get('/heatmap', async (req, res) => {
  try {
    const db   = await getPool();
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const result = await db.request()
      .input('uid',   sql.Int,  req.user.id)
      .input('start', sql.Date, `${year}-01-01`)
      .input('end',   sql.Date, `${year + 1}-01-01`)
      .query(`
        SELECT CAST(created_at AS DATE) AS entry_date,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               COUNT(*) AS entry_count
        FROM DiaryEntries
        WHERE user_id = @uid
          AND created_at >= @start
          AND created_at < @end
        GROUP BY CAST(created_at AS DATE)
        ORDER BY entry_date
      `);
    res.json({ year, days: result.recordset });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
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
    const { photos: validPhotos, error: photosError } = validatePhotos(photos);
    if (photosError) return res.status(400).json({ message: photosError });

    const tagsStr = Array.isArray(tags) ? tags.join('|') : '';
    const db      = await getPool();

    // Insert entry (ảnh/audio lưu riêng ở DiaryMedia dạng nhị phân, không qua cột NVARCHAR)
    const result = await db.request()
      .input('user_id',    sql.Int,      req.user.id)
      .input('mood_score', sql.TinyInt,  mood_score)
      .input('event_text', sql.NVarChar, event_text  || '')
      .input('thoughts',   sql.NVarChar, thoughts    || '')
      .input('gratitude',  sql.NVarChar, gratitude   || '')
      .input('tags',       sql.NVarChar, tagsStr)
      .input('cbt_data',   sql.NVarChar, cbtJson)
      .query(`
        INSERT INTO DiaryEntries (user_id, mood_score, event_text, thoughts, gratitude, tags, cbt_data)
        OUTPUT INSERTED.id, INSERTED.mood_score, INSERTED.event_text, INSERTED.thoughts,
               INSERTED.gratitude, INSERTED.tags, INSERTED.cbt_data, INSERTED.created_at
        VALUES (@user_id, @mood_score, @event_text, @thoughts, @gratitude, @tags, @cbt_data)
      `);

    const entry = result.recordset[0];
    await saveMedia(db, entry.id, validPhotos, audioData);

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

    // Kiểm tra chuỗi 7 ngày tâm trạng tiêu cực (avg_mood ≤ 4 trên 7 ngày gần nhất có nhật ký)
    const lowStreakRes = await db.request()
      .input('uid_ls', sql.Int, req.user.id)
      .query(`
        SELECT COUNT(*) AS low_days FROM (
          SELECT TOP 7 CAST(created_at AS DATE) AS d, AVG(CAST(mood_score AS FLOAT)) AS avg_m
          FROM DiaryEntries WHERE user_id = @uid_ls
          GROUP BY CAST(created_at AS DATE)
          ORDER BY d DESC
        ) t WHERE t.avg_m <= 4
      `);
    const lowStreak = lowStreakRes.recordset[0].low_days >= 7;

    res.status(201).json({
      message: 'Đã lưu nhật ký!',
      entry: { ...entry, tags: entry.tags ? entry.tags.split('|') : [], photos: validPhotos, audio_data: audioData },
      streak:         newStreak,
      freeze_used:    freezeUsed,
      freeze_granted: freezeGrant,
      streak_freeze:  newFreezeCount,
      low_streak:     lowStreak,
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
    const { photos: validPhotos, error: photosError } = validatePhotos(photos);
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
      .input('cbt_data',   sql.NVarChar, cbtJson)
      .query(`
        UPDATE DiaryEntries
        SET mood_score = @mood_score, event_text = @event_text,
            thoughts = @thoughts, gratitude = @gratitude,
            tags = @tags, cbt_data = @cbt_data,
            audio_data = NULL, photos = NULL, updated_at = GETDATE()
        OUTPUT INSERTED.id, INSERTED.mood_score, INSERTED.event_text, INSERTED.thoughts,
               INSERTED.gratitude, INSERTED.tags, INSERTED.cbt_data, INSERTED.created_at
        WHERE id = @id AND user_id = @user_id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });
    }

    const entry = result.recordset[0];

    // Nhật ký sửa lại = thay toàn bộ ảnh/audio: xóa media cũ rồi ghi lại media mới
    await db.request().input('id', sql.Int, entry.id)
      .query('DELETE FROM DiaryMedia WHERE entry_id = @id');
    await saveMedia(db, entry.id, validPhotos, audioData);

    res.json({
      message: 'Đã cập nhật nhật ký.',
      entry: { ...entry, tags: entry.tags ? entry.tags.split('|') : [], photos: validPhotos, audio_data: audioData },
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

// ── GET /api/diary/year-review?year=YYYY — Tổng kết Năm (v1.8) ───────────
router.get('/year-review', authMiddleware, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const db   = await getPool();

    const [summary, monthly, tags, sleepCorr] = await Promise.all([
      db.request().input('uid', sql.Int, req.user.id).input('year', sql.Int, year).query(`
        SELECT COUNT(*) AS total_entries,
          AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
          COUNT(DISTINCT CAST(created_at AS DATE)) AS days_written
        FROM DiaryEntries WHERE user_id=@uid AND YEAR(created_at)=@year
      `),
      db.request().input('uid', sql.Int, req.user.id).input('year', sql.Int, year).query(`
        SELECT MONTH(created_at) AS month, COUNT(*) AS entries,
          AVG(CAST(mood_score AS FLOAT)) AS avg_mood
        FROM DiaryEntries WHERE user_id=@uid AND YEAR(created_at)=@year
        GROUP BY MONTH(created_at) ORDER BY month ASC
      `),
      db.request().input('uid', sql.Int, req.user.id).input('year', sql.Int, year).query(`
        SELECT TOP 5 tag, COUNT(*) AS cnt
        FROM (SELECT TRIM(value) AS tag FROM DiaryEntries
              CROSS APPLY STRING_SPLIT(tags, ',')
              WHERE user_id=@uid AND YEAR(created_at)=@year AND tags IS NOT NULL AND tags != '') t
        GROUP BY tag ORDER BY cnt DESC
      `),
      db.request().input('uid', sql.Int, req.user.id).input('year', sql.Int, year).query(`
        SELECT CASE WHEN sleep_hours < 6 THEN N'Thiếu ngủ (<6h)'
                    WHEN sleep_hours <= 8 THEN N'Đủ giấc (6-8h)'
                    ELSE N'Ngủ nhiều (>8h)' END AS sleep_band,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood, COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id=@uid AND YEAR(created_at)=@year AND sleep_hours IS NOT NULL
        GROUP BY CASE WHEN sleep_hours < 6 THEN N'Thiếu ngủ (<6h)'
                      WHEN sleep_hours <= 8 THEN N'Đủ giấc (6-8h)'
                      ELSE N'Ngủ nhiều (>8h)' END
      `),
    ]);

    const s = summary.recordset[0] || {};
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = monthly.recordset.find(r => r.month === i + 1);
      return { month: i + 1, entries: m ? m.entries : 0, avg_mood: m ? Math.round(m.avg_mood * 10) / 10 : null };
    });
    const withMood   = months.filter(m => m.avg_mood !== null);
    const bestMonth  = withMood.length ? withMood.reduce((a, b) => b.avg_mood > a.avg_mood ? b : a) : null;
    const worstMonth = withMood.length ? withMood.reduce((a, b) => b.avg_mood < a.avg_mood ? b : a) : null;

    res.json({
      year, monthly: months,
      total_entries: s.total_entries || 0,
      avg_mood:      s.avg_mood ? Math.round(s.avg_mood * 10) / 10 : null,
      days_written:  s.days_written || 0,
      best_month:    bestMonth,
      worst_month:   worstMonth,
      top_tags:      tags.recordset,
      sleep_corr:    sleepCorr.recordset,
    });
  } catch (err) {
    console.error('Year review error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/emotion-radar — tổng hợp cảm xúc cho radar chart ─────
router.get('/emotion-radar', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT TOP 30 ai_emotion
        FROM DiaryEntries
        WHERE user_id=@uid AND ai_emotion IS NOT NULL
        ORDER BY created_at DESC
      `);

    const totals = {};
    let entryCount = 0;
    for (const row of r.recordset) {
      try {
        const data = JSON.parse(row.ai_emotion);
        if (Array.isArray(data.emotions)) {
          entryCount++;
          for (const em of data.emotions) {
            if (em.name && em.percent > 0)
              totals[em.name] = (totals[em.name] || 0) + em.percent;
          }
        }
      } catch {}
    }

    const emotions = Object.entries(totals)
      .map(([name, total]) => ({ name, avgPercent: Math.round(total / entryCount) }))
      .sort((a, b) => b.avgPercent - a.avgPercent)
      .slice(0, 8);

    res.json({ emotions, entryCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/diary/:id/share — tạo/lấy share token ──────────────────────
router.post('/:id/share', async (req, res) => {
  try {
    const db    = await getPool();
    const check = await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query(`SELECT id, share_token FROM DiaryEntries WHERE id=@id AND user_id=@uid`);
    if (!check.recordset.length)
      return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });

    let token = check.recordset[0].share_token;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      await db.request()
        .input('id',    sql.Int,         req.params.id)
        .input('token', sql.NVarChar(64), token)
        .query(`UPDATE DiaryEntries SET share_token=@token WHERE id=@id`);
    }
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── DELETE /api/diary/:id/share — thu hồi share ───────────────────────────
router.delete('/:id/share', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query(`UPDATE DiaryEntries SET share_token=NULL WHERE id=@id AND user_id=@uid`);
    if (!r.rowsAffected[0])
      return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });
    res.json({ message: 'Đã thu hồi chia sẻ.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/sleep-stats — tương quan mood-giấc ngủ ────────────────
router.get('/sleep-stats', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().input('uid', sql.Int, req.user.id).query(`
      SELECT TOP 30 CAST(created_at AS DATE) AS entry_date, mood_score, sleep_hours, sleep_quality
      FROM DiaryEntries WHERE user_id=@uid AND sleep_hours IS NOT NULL ORDER BY created_at DESC
    `);
    res.json({ data: result.recordset.reverse() });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
