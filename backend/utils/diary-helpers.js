// utils/diary-helpers.js — Shared AI helpers cho diary routes
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genai = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// ── Phân tích cảm xúc rule-based (fallback) ─────────────────────────────
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

// ── Trợ lý Tâm hồn AI ───────────────────────────────────────────────────
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

// ── Gợi ý chủ đề viết hàng ngày ────────────────────────────────────────
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

module.exports = {
  genai,
  analyzeEntry,
  companionMessage,
  ruleBasedCompanion,
  DAILY_PROMPTS,
  dayOfYear,
};
