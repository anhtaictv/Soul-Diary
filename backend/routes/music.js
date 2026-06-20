// routes/music.js — Thư viện nhạc thư giãn: proxy đọc công khai tới Jamendo API
const express = require('express');
const router  = express.Router();

const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;

// Mỗi "tâm trạng" map sang fuzzytags của Jamendo — backend kiểm soát để tránh truyền thẳng input người dùng ra API ngoài
const MOODS = {
  chill:  'chillout+relaxing',
  focus:  'instrumental+study',
  sleep:  'sleep+ambient',
  nature: 'nature+calm',
};

function formatTrack(t) {
  return {
    id:       t.id,
    name:     t.name,
    artist:   t.artist_name,
    image:    t.image,
    audio:    t.audio,
    duration: t.duration,
  };
}

// Xáo trộn Fisher-Yates — dùng để random thứ tự bài trả về mỗi lần gọi
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchJamendo(mood, limit, offset) {
  const url = 'https://api.jamendo.com/v3.0/tracks/'
    + `?client_id=${encodeURIComponent(JAMENDO_CLIENT_ID)}`
    + `&format=json&limit=${limit}&offset=${offset}&fuzzytags=${MOODS[mood]}`
    + '&audioformat=mp32&include=musicinfo&boost=popularity_total&imagesize=300';
  const jamRes = await fetch(url);
  if (!jamRes.ok) throw new Error(`Jamendo HTTP ${jamRes.status}`);
  return jamRes.json();
}

// ── GET /api/music/tracks?mood=chill — Danh sách nhạc thư giãn (public) ─────
router.get('/tracks', async (req, res) => {
  if (!JAMENDO_CLIENT_ID) {
    return res.status(503).json({ message: 'Tính năng nhạc thư giãn chưa được cấu hình.' });
  }
  try {
    const mood  = MOODS[req.query.mood] ? req.query.mood : 'chill';
    const limit = Math.min(parseInt(req.query.limit) || 24, 50);

    // Lấy pool lớn hơn nhu cầu, từ một offset ngẫu nhiên trong bảng xếp hạng popularity,
    // rồi shuffle — để mỗi lần vào trang thấy danh sách bài khác nhau thay vì luôn top cố định
    const poolLimit = Math.min(limit * 3, 100);
    let data = await fetchJamendo(mood, poolLimit, Math.floor(Math.random() * 100));
    if (!data.results || !data.results.length) {
      data = await fetchJamendo(mood, poolLimit, 0); // mood ít bài, offset ngẫu nhiên vượt quá tổng số — quay lại đầu danh sách
    }

    const tracks = shuffle((data.results || []).map(formatTrack)).slice(0, limit);
    res.json({ mood, tracks });
  } catch (err) {
    res.status(502).json({ message: 'Không thể tải danh sách nhạc lúc này. Vui lòng thử lại sau.' });
  }
});

module.exports = router;
