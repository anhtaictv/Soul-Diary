// Xoá các bản ghi CheckIns tạo ra khi kiểm thử checkin flow trên production (2026-08-27)
// bằng 2 tài khoản test_vui_ve / test_binh_yen — không đụng tới Users hay dữ liệu demo
// khác (nhật ký, kết quả test tâm lý) của 2 tài khoản này.
//
// Cách dùng (chạy trực tiếp trên máy chủ, nơi kết nối được DB production):
//   node scripts/cleanup-test-checkins.js           — chỉ xem trước, không xoá
//   node scripts/cleanup-test-checkins.js --apply   — xoá thật

require('dotenv').config();
const { getPool, sql } = require('../db');

const USERNAMES = ['test_vui_ve', 'test_binh_yen'];

async function main() {
  const apply = process.argv.includes('--apply');
  const db    = await getPool();

  const rows = await db.request().query(`
    SELECT c.id, u.username, c.year, c.week_number, c.created_at
    FROM CheckIns c JOIN Users u ON u.id = c.user_id
    WHERE u.username IN ('${USERNAMES.join("','")}')
  `);

  if (!rows.recordset.length) {
    console.log('Không có bản ghi CheckIns nào của 2 tài khoản này.');
    return;
  }

  console.log(`Tìm thấy ${rows.recordset.length} bản ghi:`);
  console.table(rows.recordset);

  if (!apply) {
    console.log('\n(Chỉ xem trước — thêm --apply để xoá thật)');
    return;
  }

  const ids = rows.recordset.map(r => r.id).join(',');
  await db.request().query(`DELETE FROM CheckIns WHERE id IN (${ids})`);
  console.log(`Đã xoá ${rows.recordset.length} bản ghi CheckIns.`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('Lỗi:', err); process.exit(1); });
