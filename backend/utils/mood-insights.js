// utils/mood-insights.js — Tìm yếu tố (tag, thói quen, giấc ngủ) đi kèm mood cao/thấp hơn hẳn.
// So sánh trung bình mood nhóm "có" vs "không có"; chỉ báo khi mỗi nhóm đủ MIN_N mẫu và
// chênh ≥ MIN_DIFF điểm (thang 1-10) để tránh kết luận từ 1-2 ngày ngẫu nhiên.
// ponytail: chênh lệch trung bình thuần, chưa kiểm định thống kê — đủ cho gợi ý cá nhân, không phải chẩn đoán.
const MIN_N = 3;
const MIN_DIFF = 0.7;

const avg = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
const round1 = x => Math.round(x * 10) / 10;

function compare(withArr, withoutArr) {
  if (withArr.length < MIN_N || withoutArr.length < MIN_N) return null;
  const w = avg(withArr), wo = avg(withoutArr);
  if (Math.abs(w - wo) < MIN_DIFF) return null;
  return { with_avg: round1(w), without_avg: round1(wo), diff: round1(w - wo), n: withArr.length };
}

// entries: [{ date:'YYYY-MM-DD', mood, tags:[...], sleep_hours|null }]
// habits:  [{ id, name, icon, created:'YYYY-MM-DD' }], habitLogs: [{ habit_id, date }]
function computeInsights(entries, habits = [], habitLogs = []) {
  const out = [];

  // Tag: so theo từng nhật ký
  const tagSet = new Set(entries.flatMap(e => e.tags));
  for (const tag of tagSet) {
    const r = compare(entries.filter(e => e.tags.includes(tag)).map(e => e.mood),
                      entries.filter(e => !e.tags.includes(tag)).map(e => e.mood));
    if (r) out.push({ kind: 'tag', label: tag, icon: '🏷️', ...r });
  }

  // Thói quen: so theo ngày (mood TB của ngày), chỉ tính các ngày từ lúc tạo thói quen
  const dayMood = new Map();
  for (const e of entries) {
    if (!dayMood.has(e.date)) dayMood.set(e.date, []);
    dayMood.get(e.date).push(e.mood);
  }
  for (const h of habits) {
    const done = new Set(habitLogs.filter(l => l.habit_id === h.id).map(l => l.date));
    const withArr = [], withoutArr = [];
    for (const [date, moods] of dayMood) {
      if (h.created && date < h.created) continue;
      (done.has(date) ? withArr : withoutArr).push(avg(moods));
    }
    const r = compare(withArr, withoutArr);
    if (r) out.push({ kind: 'habit', label: h.name, icon: h.icon || '✅', ...r });
  }

  // Giấc ngủ: ngủ đủ (≥7h) vs thiếu ngủ (<6h)
  const slept = entries.filter(e => e.sleep_hours !== null && e.sleep_hours !== undefined);
  const r = compare(slept.filter(e => e.sleep_hours >= 7).map(e => e.mood),
                    slept.filter(e => e.sleep_hours < 6).map(e => e.mood));
  if (r) out.push({ kind: 'sleep', label: 'Ngủ đủ 7 tiếng trở lên (so với dưới 6 tiếng)', icon: '🌙', ...r });

  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 6);
}

module.exports = { computeInsights };

if (require.main === module) {
  const assert = require('assert');
  const e = (date, mood, tags = [], sleep_hours = null) => ({ date, mood, tags, sleep_hours });
  const entries = [
    e('2026-01-01', 8, ['thể dục'], 8), e('2026-01-02', 8, ['thể dục'], 7.5), e('2026-01-03', 9, ['thể dục'], 8),
    e('2026-01-04', 4, ['thi cử'], 5),  e('2026-01-05', 5, ['thi cử'], 5.5),  e('2026-01-06', 4, ['thi cử'], 4),
    e('2026-01-07', 6, ['bạn bè']),    e('2026-01-08', 6, ['bạn bè']),
  ];
  const habits = [{ id: 1, name: 'Đi bộ', icon: '🚶', created: '2026-01-01' }];
  const logs = ['2026-01-01', '2026-01-02', '2026-01-03'].map(date => ({ habit_id: 1, date }));
  const res = computeInsights(entries, habits, logs);
  const by = k => res.find(x => x.label === k || x.kind === k);
  assert.ok(by('thể dục').diff > 0, 'tag thể dục kéo mood lên');
  assert.ok(by('thi cử').diff < 0, 'tag thi cử kéo mood xuống');
  assert.ok(!by('bạn bè'), 'tag chỉ 2 mẫu → bỏ qua');
  assert.ok(by('Đi bộ').diff > 0, 'ngày đi bộ mood cao hơn');
  assert.ok(by('sleep').diff > 0, 'ngủ đủ mood cao hơn');
  assert.deepStrictEqual(computeInsights([], habits, logs), [], 'không có dữ liệu → rỗng');
  console.log('mood-insights OK', res.length, 'insights');
}
