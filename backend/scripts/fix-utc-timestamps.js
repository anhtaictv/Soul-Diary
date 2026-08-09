// Vá MỘT LẦN các mốc thời gian bị lệch 7 tiếng, đi kèm việc chuyển kết nối sang
// `useUTC: false` (xem db/index.js).
//
// Bối cảnh: trước đây driver tedious ghi giá trị datetime bằng phần UTC của đối tượng
// Date, trong khi các cột DEFAULT GETDATE() lại lưu giờ địa phương. Hệ quả là dữ liệu
// do JavaScript ghi xuống bị lùi 7 tiếng so với dữ liệu do SQL Server tự sinh.
//
// Sau khi đặt useUTC:false, dữ liệu GETDATE() trở nên đúng, còn phần do JS ghi cần
// được cộng bù lại 7 tiếng — đó là việc của script này.
//
// Phạm vi (chỉ những chỗ do JS ghi):
//   · DiaryEntries + PsychTestResults của các tài khoản demo test_*  (script seed ghi)
//   · FeatureFlags.released_at                                        (trang quản trị ghi)
// KHÔNG đụng tới nhật ký của người dùng thật: các cột đó do DEFAULT GETDATE() sinh ra
// nên vốn đã đúng giờ địa phương.
//
// Chạy hai lần sẽ cộng thành 14 tiếng, nên script tự cắm cờ vào bảng Settings và từ
// chối chạy lại; muốn ép thì thêm --force.
//
// Cách dùng:
//   node scripts/fix-utc-timestamps.js           — chỉ xem trước
//   node scripts/fix-utc-timestamps.js --apply   — ghi thay đổi

require('dotenv').config();
process.env.DB_REQUEST_TIMEOUT = process.env.DB_REQUEST_TIMEOUT || '120000';
const { getPool, sql } = require('../db');

const FLAG_KEY = 'utc_shift_2026_08';

async function main() {
  const apply = process.argv.includes('--apply');
  const force = process.argv.includes('--force');
  const db    = await getPool();

  const done = await db.request().input('k', sql.NVarChar, FLAG_KEY)
    .query(`SELECT [value] FROM Settings WHERE [key]=@k`);
  if (done.recordset.length && !force) {
    console.log(`Đã vá rồi lúc ${done.recordset[0].value} — bỏ qua (thêm --force nếu thực sự muốn chạy lại).`);
    return;
  }

  // Lấy độ lệch từ chính máy chủ thay vì hardcode 7, phòng khi đổi múi giờ
  const off = (await db.request()
    .query(`SELECT DATEDIFF(hour, GETUTCDATE(), GETDATE()) AS h`)).recordset[0].h;
  console.log(`Độ lệch múi giờ máy chủ: +${off} giờ`);

  const targets = [
    {
      label: 'DiaryEntries (test_*)',
      count: `SELECT COUNT(*) AS n FROM DiaryEntries d JOIN Users u ON u.id=d.user_id WHERE u.username LIKE 'test_%'`,
      update: `UPDATE d SET created_at = DATEADD(hour, @off, d.created_at),
                            updated_at = DATEADD(hour, @off, d.updated_at)
               FROM DiaryEntries d JOIN Users u ON u.id=d.user_id WHERE u.username LIKE 'test_%'`,
    },
    {
      label: 'PsychTestResults (test_*)',
      count: `SELECT COUNT(*) AS n FROM PsychTestResults p JOIN Users u ON u.id=p.user_id WHERE u.username LIKE 'test_%'`,
      update: `UPDATE p SET created_at = DATEADD(hour, @off, p.created_at)
               FROM PsychTestResults p JOIN Users u ON u.id=p.user_id WHERE u.username LIKE 'test_%'`,
    },
    {
      label: 'FeatureFlags.released_at',
      count: `SELECT COUNT(*) AS n FROM FeatureFlags WHERE released_at IS NOT NULL`,
      update: `UPDATE FeatureFlags SET released_at = DATEADD(hour, @off, released_at) WHERE released_at IS NOT NULL`,
    },
  ];

  for (const t of targets) {
    const n = (await db.request().query(t.count)).recordset[0].n;
    if (!apply) { console.log(`  ${t.label.padEnd(28)} ${n} dòng sẽ được cộng +${off}h`); continue; }
    const r = await db.request().input('off', sql.Int, off).query(t.update);
    console.log(`  ${t.label.padEnd(28)} đã cập nhật ${r.rowsAffected[0]}/${n} dòng`);
  }

  if (!apply) { console.log('\nXem trước — chạy lại với --apply để ghi thay đổi.'); return; }

  await db.request()
    .input('k', sql.NVarChar, FLAG_KEY)
    .input('v', sql.NVarChar, new Date().toISOString())
    .query(`
      IF EXISTS (SELECT 1 FROM Settings WHERE [key]=@k)
        UPDATE Settings SET [value]=@v, updated_at=GETDATE() WHERE [key]=@k
      ELSE
        INSERT INTO Settings ([key],[value]) VALUES (@k,@v)
    `);
  console.log('\nXong. Đã cắm cờ chống chạy lại trong bảng Settings.');
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('Vá thất bại:', err); process.exit(1); });
