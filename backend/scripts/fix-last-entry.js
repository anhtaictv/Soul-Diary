// Vá dữ liệu Users.last_entry / streak / max_streak bị sai do lỗi múi giờ.
//
// Bối cảnh: routes/diary.js từng truyền Date nửa đêm giờ địa phương vào cột DATE,
// mà driver tedious ghi cột DATE theo phần UTC — nên last_entry bị lưu LÙI 1 NGÀY
// (xem utils/date-only.js). Hệ quả kéo theo:
//   · viết bài thứ hai trong cùng ngày vẫn bị tính là "ngày mới" → streak cộng dồn sai
//   · sang hôm sau bị coi là cách 2 ngày → đốt oan lượt cứu streak, hết lượt thì streak về 1
//   · cron nhắc nhở và cờ "đã viết hôm nay" của bạn bè đọc nhầm trạng thái
//
// Script tính lại ba cột này từ chính bảng DiaryEntries (nguồn sự thật) và chỉ ghi
// khi có --apply. max_streak chỉ được NÂNG lên, không hạ xuống: chuỗi cũ có thể đã
// được nối hợp lệ bằng lượt cứu streak mà bảng nhật ký không ghi lại.
//
// Cách dùng:
//   node scripts/fix-last-entry.js           — chỉ xem trước, không sửa gì
//   node scripts/fix-last-entry.js --apply   — ghi thay đổi

require('dotenv').config();
process.env.DB_REQUEST_TIMEOUT = process.env.DB_REQUEST_TIMEOUT || '120000';
const { getPool, sql } = require('../db');

const MS_PER_DAY = 86400000;
// Nửa đêm giờ địa phương — dạng chuẩn cho cột DATE, xem utils/date-only.js
const parseDay   = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

// Chuỗi ngày liên tiếp kết thúc ở ngày cuối cùng, và chuỗi dài nhất từng có.
function computeStreaks(days) {
  const sorted = [...new Set(days)].sort();
  let best = 0, run = 0, prev = null;
  for (const key of sorted) {
    const d = parseDay(key);
    run  = (prev && (d - prev) === MS_PER_DAY) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current: run, max: best, lastDay: sorted[sorted.length - 1] || null };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db    = await getPool();

  const users = await db.request().query(`
    SELECT id, username, streak, max_streak,
           CONVERT(varchar(10), last_entry, 120) AS last_entry
    FROM Users ORDER BY id
  `);

  const changes = [];
  for (const u of users.recordset) {
    const rows = await db.request().input('uid', sql.Int, u.id).query(`
      SELECT DISTINCT CONVERT(varchar(10), created_at, 120) AS d
      FROM DiaryEntries WHERE user_id=@uid
    `);
    const days = rows.recordset.map(r => r.d);
    if (!days.length) continue;   // chưa viết bài nào — không có gì để suy ra

    const { current, max, lastDay } = computeStreaks(days);
    const newMax = Math.max(max, u.max_streak || 0);
    if (u.last_entry === lastDay && u.streak === current && u.max_streak === newMax) continue;

    changes.push({
      id: u.id, username: u.username,
      last_entry: `${u.last_entry || '—'} → ${lastDay}`,
      streak:     `${u.streak} → ${current}`,
      max_streak: `${u.max_streak} → ${newMax}`,
    });

    if (apply) {
      await db.request()
        .input('uid',        sql.Int,  u.id)
        .input('last_entry', sql.Date, parseDay(lastDay))
        .input('streak',     sql.Int,  current)
        .input('max_streak', sql.Int,  newMax)
        .query(`UPDATE Users SET last_entry=@last_entry, streak=@streak, max_streak=@max_streak,
                updated_at=GETDATE() WHERE id=@uid`);
    }
  }

  if (!changes.length) { console.log('Không có tài khoản nào cần vá.'); return; }
  console.table(changes);
  console.log(apply
    ? `Đã cập nhật ${changes.length} tài khoản.`
    : `${changes.length} tài khoản cần vá. Chạy lại với --apply để ghi thay đổi.`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('Vá thất bại:', err); process.exit(1); });
