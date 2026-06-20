// routes/checkin.js — Check-in Sức khỏe Tinh thần hàng tuần (PHQ-9 + GAD-7 + PSS-10 + WHO-5)
const express          = require('express');
const { getPool, sql } = require('../db');
const authMiddleware    = require('../middleware/auth');
const { getCheckinWeek } = require('../utils/checkinWeek');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const genai = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const router = express.Router();
router.use(authMiddleware);

// ── Cấu trúc 31 câu hỏi: thứ tự answers[] = PHQ-9 (0-8) → GAD-7 (9-15) → PSS-10 (16-25) → WHO-5 (26-30) ──
// `reverse` chứa các index (0-based, trong block) cần đảo điểm trước khi cộng tổng.
const SCALES = {
  phq9:  { start: 0,  count: 9,  maxPerItem: 3, reverse: [] },
  gad7:  { start: 9,  count: 7,  maxPerItem: 3, reverse: [] },
  pss10: { start: 16, count: 10, maxPerItem: 4, reverse: [3, 4, 6, 7] }, // câu 4,5,7,8 (1-based) đảo điểm
  who5:  { start: 26, count: 5,  maxPerItem: 5, reverse: [] },
};
const TOTAL_QUESTIONS = Object.values(SCALES).reduce((s, c) => s + c.count, 0); // = 31

function validateAnswers(answers) {
  if (!Array.isArray(answers) || answers.length !== TOTAL_QUESTIONS) return false;
  return Object.values(SCALES).every(scale =>
    Array.from({ length: scale.count }).every((_, i) => {
      const v = answers[scale.start + i];
      return Number.isInteger(v) && v >= 0 && v <= scale.maxPerItem;
    })
  );
}

function sumBlock(answers, scale) {
  let total = 0;
  for (let i = 0; i < scale.count; i++) {
    const raw = answers[scale.start + i];
    total += scale.reverse.includes(i) ? (scale.maxPerItem - raw) : raw;
  }
  return total;
}

function computeScores(answers) {
  return {
    phq9_score:  sumBlock(answers, SCALES.phq9),
    gad7_score:  sumBlock(answers, SCALES.gad7),
    pss10_score: sumBlock(answers, SCALES.pss10),
    who5_score:  sumBlock(answers, SCALES.who5) * 4, // 0-25 -> 0-100
  };
}

// ── Phân loại mức độ — KHÔNG chẩn đoán bệnh, chỉ sàng lọc & theo dõi ───────
function classify(key, score) {
  switch (key) {
    case 'phq9_score':
      if (score <= 4)  return { level: 'low',      text: 'Mức độ biểu hiện triệu chứng trầm cảm của bạn đang ở mức thấp. Bạn đang quản lý cảm xúc khá tốt.' };
      if (score <= 14) return { level: 'moderate', text: 'Mức độ biểu hiện triệu chứng trầm cảm của bạn đang ở mức trung bình. Hãy chú ý chăm sóc bản thân nhiều hơn nhé.' };
      return                   { level: 'high',     text: 'Mức độ biểu hiện triệu chứng Trầm cảm của bạn đang ở mức Cao.' };

    case 'gad7_score':
      if (score <= 4)  return { level: 'low',      text: 'Mức độ biểu hiện triệu chứng lo âu của bạn đang ở mức thấp.' };
      if (score <= 14) return { level: 'moderate', text: 'Mức độ biểu hiện triệu chứng lo âu của bạn đang ở mức trung bình. Một vài kỹ thuật thư giãn có thể giúp ích cho bạn.' };
      return                   { level: 'high',     text: 'Mức độ biểu hiện triệu chứng Lo âu của bạn đang ở mức Cao.' };

    case 'pss10_score':
      if (score <= 13) return { level: 'low',      text: 'Mức độ căng thẳng của bạn đang ở mức thấp. Bạn đang kiểm soát áp lực khá tốt.' };
      if (score <= 26) return { level: 'moderate', text: 'Mức độ căng thẳng của bạn đang ở mức trung bình. Hãy dành thời gian nghỉ ngơi hợp lý.' };
      return                   { level: 'high',     text: 'Mức độ biểu hiện triệu chứng Stress của bạn đang ở mức Cao.' };

    case 'who5_score': // điểm càng cao càng tốt — đảo ngược so với 3 thang trên
      if (score >= 50) return { level: 'low',      text: 'Chỉ số tinh thần tích cực (WHO-5) của bạn đang ở mức tốt. Tiếp tục duy trì những điều khiến bạn vui nhé!' };
      if (score >= 29) return { level: 'moderate', text: 'Chỉ số tinh thần tích cực (WHO-5) của bạn ở mức trung bình. Hãy dành thời gian cho những hoạt động bạn yêu thích.' };
      return                   { level: 'high',     text: 'Chỉ số tinh thần tích cực (WHO-5) của bạn đang ở mức thấp, cho thấy bạn có thể đang trải qua một giai đoạn khó khăn.' };

    default:
      return { level: 'low', text: '' };
  }
}

const SCALE_META = {
  phq9_score:  { name: 'Trầm cảm (PHQ-9)',          max: 27 },
  gad7_score:  { name: 'Lo âu (GAD-7)',             max: 21 },
  pss10_score: { name: 'Căng thẳng (PSS-10)',       max: 40 },
  who5_score:  { name: 'Tinh thần tích cực (WHO-5)', max: 100 },
};

const DISCLAIMER = 'Kết quả chỉ mang tính chất sàng lọc và theo dõi tiến triển cá nhân, không thay thế cho kết luận chẩn đoán y khoa từ bác sĩ chuyên khoa.';

function buildResult(scores) {
  const items = Object.entries(SCALE_META).map(([key, meta]) => {
    const { level, text } = classify(key, scores[key]);
    return { key, name: meta.name, score: scores[key], max: meta.max, level, text };
  });

  const hasHigh = items.some(i => i.level === 'high');
  const summary = hasHigh
    ? 'Một vài chỉ số tuần này đang ở mức cần chú ý.'
    : 'Tuần này nhìn chung ổn! Hãy tiếp tục viết nhật ký mỗi ngày để theo dõi cảm xúc của bạn nhé 🌱';
  const recommendation = hasHigh
    ? 'Hãy thử trò chuyện với một người bạn tin tưởng hoặc người thân, hoặc đặt lịch gặp chuyên gia tâm lý/tư vấn học đường để được hỗ trợ thêm nhé.'
    : null;

  return { items, summary, recommendation, disclaimer: DISCLAIMER };
}

// ── AI Phân tích Tâm lý Hàng tuần — "phần thưởng" cuối tuần ────────────────
// Liên kết điểm số PHQ-9/GAD-7/PSS-10/WHO-5 (tuần này & tuần trước) với nhật ký
// trong tuần để tìm nguyên nhân (triggers) & điểm sáng (bright spots).
// KHÔNG được chẩn đoán bệnh lý — chỉ quan sát, đồng cảm, gợi ý nhẹ nhàng.

const ANALYSIS_SYSTEM_PROMPT = `Bạn là một chuyên gia phân tích tâm lý học hành vi tích cực, có giọng điệu ấm áp, đồng cảm, sâu sắc và không phán xét. Bạn đang đồng hành cùng một học sinh sử dụng ứng dụng nhật ký cảm xúc "Soul Diary".

Nhiệm vụ: Dựa trên kết quả bài test sàng lọc tâm lý hàng tuần (PHQ-9, GAD-7, PSS-10, WHO-5) của tuần này — và tuần trước (nếu có) để so sánh xu hướng — cùng với các bài nhật ký người dùng đã viết trong tuần qua, hãy viết một bản tổng kết tuần sâu sắc, mang tính xây dựng, như một món quà nhỏ động viên người dùng.

QUY TẮC BẮT BUỘC:
1. TUYỆT ĐỐI KHÔNG được chẩn đoán bệnh lý tâm thần hay đưa ra bất kỳ kết luận y khoa nào.
2. KHÔNG lặp lại các con số hay câu chữ khô khan của bài test (ví dụ "điểm PHQ-9 của bạn là 12") — thay vào đó hãy LIÊN KẾT các chỉ số với những SỰ KIỆN THỰC TẾ trong nhật ký để tìm ra nguyên nhân (triggers) và những điểm sáng (bright spots).
3. Nếu nhật ký không có thông tin rõ ràng, hãy nhận xét chung dựa trên xu hướng điểm số, không bịa đặt chi tiết không có thật.
4. Viết bằng tiếng Việt tự nhiên, ấm áp, khích lệ.
5. CHỈ trả về JSON đúng theo schema đã cho — không thêm markdown, không thêm chữ nào ngoài JSON.`;

const ANALYSIS_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    weekly_overview:    { type: SchemaType.STRING,  description: 'Tóm tắt ngắn gọn tình trạng tinh thần tuần qua, 2-3 câu' },
    emotional_trend:    { type: SchemaType.STRING,  format: 'enum', enum: ['Tăng', 'Giảm', 'Ổn định'], description: 'Xu hướng cảm xúc tích cực so với tuần trước' },
    key_triggers:       { type: SchemaType.ARRAY,   items: { type: SchemaType.STRING }, description: '2-3 nguyên nhân gây stress chính tìm thấy trong nhật ký' },
    bright_spots:       { type: SchemaType.ARRAY,   items: { type: SchemaType.STRING }, description: 'Khoảnh khắc tích cực hoặc điều biết ơn user đã viết' },
    ai_recommendations: { type: SchemaType.ARRAY,   items: { type: SchemaType.STRING }, description: '2-3 lời khuyên/hành động nhỏ tự chăm sóc bản thân, cá nhân hóa theo vấn đề của tuần' },
  },
  required: ['weekly_overview', 'emotional_trend', 'key_triggers', 'bright_spots', 'ai_recommendations'],
};

// Validate an toàn dữ liệu JSON trả về từ AI trước khi lưu/hiển thị
function validateAnalysis(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.weekly_overview !== 'string' || !obj.weekly_overview.trim()) return false;
  if (!['Tăng', 'Giảm', 'Ổn định'].includes(obj.emotional_trend)) return false;
  return ['key_triggers', 'bright_spots', 'ai_recommendations'].every(key =>
    Array.isArray(obj[key]) && obj[key].every(s => typeof s === 'string' && s.trim())
  );
}

// Gộp nội dung 1 bài nhật ký thành 1 đoạn text ngắn cho prompt
function summarizeDiaryEntry(row) {
  const parts = [];
  if (row.event_text) parts.push(row.event_text);
  if (row.thoughts)   parts.push(`Suy nghĩ: ${row.thoughts}`);
  if (row.gratitude)  parts.push(`Biết ơn: ${row.gratitude}`);
  return parts.join(' | ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function scoresToText(s) {
  return `PHQ-9 (Trầm cảm): ${s.phq9_score}/27, GAD-7 (Lo âu): ${s.gad7_score}/21, PSS-10 (Căng thẳng): ${s.pss10_score}/40, WHO-5 (Tinh thần tích cực): ${s.who5_score}/100`;
}

// Fallback rule-based khi không có Gemini hoặc Gemini lỗi/quota — không chẩn đoán, chỉ quan sát chung
function ruleBasedWeeklyAnalysis(currentScores, previousScores, diaryEntries) {
  const distress = s => s.phq9_score + s.gad7_score + s.pss10_score + (100 - s.who5_score) / 4;

  let emotional_trend = 'Ổn định';
  if (previousScores) {
    const diff = distress(currentScores) - distress(previousScores);
    if (diff <= -3) emotional_trend = 'Tăng';
    else if (diff >= 3) emotional_trend = 'Giảm';
  }

  const trendText = {
    'Tăng':     'có vẻ nhẹ nhàng và tích cực hơn so với tuần trước',
    'Giảm':     'có phần nặng nề hơn một chút so với tuần trước',
    'Ổn định':  'khá ổn định so với tuần trước',
  }[emotional_trend];

  const weekly_overview = diaryEntries.length
    ? `Tuần này bạn đã ghi lại ${diaryEntries.length} bài nhật ký — cảm ơn bạn đã dành thời gian lắng nghe bản thân. Nhìn chung, tinh thần của bạn ${trendText}.`
    : `Tuần này bạn chưa ghi nhật ký nào, nhưng kết quả check-in cho thấy tinh thần của bạn ${trendText}. Hãy thử viết vài dòng mỗi ngày để mình có thể đồng hành cùng bạn rõ hơn nhé.`;

  const gratitudeNotes = diaryEntries.map(e => e.gratitude).filter(Boolean).slice(0, 3);
  const bright_spots = gratitudeNotes.length
    ? gratitudeNotes
    : ['Bạn đã dành thời gian quan tâm đến cảm xúc của chính mình tuần này — đó đã là một điều đáng trân trọng.'];

  const key_triggers = diaryEntries.length
    ? ['Một vài sự kiện trong tuần có thể đã ảnh hưởng đến tâm trạng của bạn — hãy thử đọc lại nhật ký để nhận diện rõ hơn nhé.']
    : ['Chưa có đủ nhật ký trong tuần để xác định nguyên nhân cụ thể.'];

  const ai_recommendations = [
    'Dành 5-10 phút mỗi tối để hít thở sâu và thả lỏng cơ thể trước khi ngủ.',
    'Viết nhật ký đều đặn hơn — mỗi dòng nhỏ đều giúp bạn hiểu bản thân tốt hơn.',
    'Dành thời gian cho một hoạt động bạn yêu thích trong tuần tới, dù chỉ là việc nhỏ.',
  ];

  return { weekly_overview, emotional_trend, key_triggers, bright_spots, ai_recommendations };
}

async function generateWeeklyAnalysis(currentScores, previousScores, diaryEntries) {
  if (genai) {
    try {
      const prevText = previousScores ? scoresToText(previousScores) : 'Chưa có dữ liệu tuần trước.';
      const diaryText = diaryEntries.length
        ? diaryEntries.map(e => `- [${e.date}] ${e.content}`).join('\n')
        : 'Không có nhật ký nào trong tuần qua.';

      const prompt = `${ANALYSIS_SYSTEM_PROMPT}

DỮ LIỆU TUẦN NÀY:
${scoresToText(currentScores)}

DỮ LIỆU TUẦN TRƯỚC:
${prevText}

NHẬT KÝ TRONG TUẦN QUA:
${diaryText}`;

      const model = genai.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: ANALYSIS_SCHEMA,
          temperature: 0.8,
        },
      });
      const result  = await model.generateContent(prompt);
      const parsed  = JSON.parse(result.response.text());
      if (validateAnalysis(parsed)) return parsed;
      console.error('Gemini weekly analysis: JSON không hợp lệ schema, dùng fallback.');
    } catch (e) {
      console.error('Gemini weekly analysis error:', e.message);
    }
  }
  return ruleBasedWeeklyAnalysis(currentScores, previousScores, diaryEntries);
}

// ── GET /api/check-in/status ───────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { year, weekNumber } = getCheckinWeek();
    const db = await getPool();

    const currentRes = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .input('year',    sql.Int, year)
      .input('week',    sql.Int, weekNumber)
      .query(`SELECT id FROM CheckIns WHERE user_id=@user_id AND year=@year AND week_number=@week`);

    const lastRes = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`SELECT TOP 1 week_number, year, scores, ai_analysis, created_at FROM CheckIns
              WHERE user_id=@user_id ORDER BY created_at DESC`);

    let lastResult = null;
    if (lastRes.recordset.length) {
      const row = lastRes.recordset[0];
      lastResult = {
        weekNumber: row.week_number,
        year: row.year,
        createdAt: row.created_at,
        ...buildResult(JSON.parse(row.scores)),
        weeklyAnalysis: row.ai_analysis ? JSON.parse(row.ai_analysis) : null,
      };
    }

    res.json({ needsCheckin: currentRes.recordset.length === 0, weekNumber, year, lastResult });
  } catch (err) {
    console.error('Check-in status error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/check-in/submit ──────────────────────────────────────────
router.post('/submit', async (req, res) => {
  try {
    const { answers } = req.body;
    if (!validateAnswers(answers)) {
      return res.status(400).json({ message: `Dữ liệu trả lời không hợp lệ. Cần đủ ${TOTAL_QUESTIONS} câu trả lời hợp lệ.` });
    }

    const { year, weekNumber } = getCheckinWeek();
    const db = await getPool();

    const existing = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .input('year',    sql.Int, year)
      .input('week',    sql.Int, weekNumber)
      .query(`SELECT id FROM CheckIns WHERE user_id=@user_id AND year=@year AND week_number=@week`);

    if (existing.recordset.length) {
      return res.status(409).json({ message: 'Bạn đã hoàn thành check-in của tuần này rồi.' });
    }

    const scores = computeScores(answers);

    // Điểm tuần trước (gần nhất) — dùng để AI so sánh xu hướng
    const prevRes = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`SELECT TOP 1 scores FROM CheckIns WHERE user_id=@user_id ORDER BY created_at DESC`);
    const previousScores = prevRes.recordset.length ? JSON.parse(prevRes.recordset[0].scores) : null;

    // Nhật ký 7 ngày qua — dùng để AI tìm triggers/bright spots
    const diaryRes = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`
        SELECT created_at, event_text, thoughts, gratitude FROM DiaryEntries
        WHERE user_id=@user_id AND created_at >= DATEADD(DAY, -7, GETDATE())
        ORDER BY created_at ASC
      `);
    const diaryEntries = diaryRes.recordset
      .map(r => ({
        date: new Date(r.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        content: summarizeDiaryEntry(r),
        gratitude: r.gratitude || '',
      }))
      .filter(e => e.content);

    const weeklyAnalysis = await generateWeeklyAnalysis(scores, previousScores, diaryEntries);

    await db.request()
      .input('user_id',     sql.Int,      req.user.id)
      .input('year',        sql.Int,      year)
      .input('week',        sql.Int,      weekNumber)
      .input('raw_answers', sql.NVarChar, JSON.stringify(answers))
      .input('scores',      sql.NVarChar, JSON.stringify(scores))
      .input('ai_analysis', sql.NVarChar, JSON.stringify(weeklyAnalysis))
      .query(`
        INSERT INTO CheckIns (user_id, year, week_number, raw_answers, scores, ai_analysis, status)
        VALUES (@user_id, @year, @week, @raw_answers, @scores, @ai_analysis, 'completed')
      `);

    res.status(201).json({ message: 'Đã lưu kết quả check-in!', result: buildResult(scores), weeklyAnalysis });
  } catch (err) {
    console.error('Check-in submit error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/check-in/history ──────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`SELECT TOP 10 week_number, year, scores, created_at FROM CheckIns
              WHERE user_id=@user_id ORDER BY created_at DESC`);

    res.json({
      history: result.recordset.map(row => ({
        weekNumber: row.week_number,
        year: row.year,
        createdAt: row.created_at,
        scores: JSON.parse(row.scores),
      })),
    });
  } catch (err) {
    console.error('Check-in history error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
