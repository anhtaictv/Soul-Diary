const express        = require('express');
const router         = express.Router();
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');
const { decryptRows, decryptRow, encryptField } = require('../utils/diary-crypto');

router.use(authMiddleware);

const EC_FIELDS = ['emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_email'];

// GET /api/user/emergency-contact — người thân được user tự lưu để liên hệ khi cần
router.get('/emergency-contact', async (req, res) => {
  try {
    const db = await getPool();
    const r = await db.request().input('uid', sql.Int, req.user.id).query(`
      SELECT emergency_contact_name, emergency_contact_phone, emergency_contact_email,
             emergency_contact_relationship, emergency_contact_consent
      FROM Users WHERE id = @uid
    `);
    if (!r.recordset.length) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    res.json(decryptRow(r.recordset[0], EC_FIELDS));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/user/emergency-contact — lưu người thân + bật/tắt đồng ý tự động báo khi khủng hoảng
router.put('/emergency-contact', async (req, res) => {
  const { name, phone, email, relationship, consent } = req.body;
  const name_ = (name || '').trim(), phone_ = (phone || '').trim(), email_ = (email || '').trim();
  const consent_ = !!consent;
  if (consent_ && !name_) return res.status(400).json({ message: 'Cần nhập tên người thân để bật đồng ý.' });
  if (consent_ && !phone_ && !email_) return res.status(400).json({ message: 'Cần ít nhất số điện thoại hoặc email của người thân để bật đồng ý.' });
  try {
    const db = await getPool();
    await db.request()
      .input('uid', sql.Int, req.user.id)
      .input('name', sql.NVarChar, encryptField(name_))
      .input('phone', sql.NVarChar, encryptField(phone_))
      .input('email', sql.NVarChar, encryptField(email_))
      .input('rel', sql.NVarChar, (relationship || '').trim().slice(0, 100))
      .input('consent', sql.Bit, consent_ ? 1 : 0)
      .query(`
        UPDATE Users SET
          emergency_contact_name = @name,
          emergency_contact_phone = @phone,
          emergency_contact_email = @email,
          emergency_contact_relationship = @rel,
          emergency_contact_consent = @consent
        WHERE id = @uid
      `);
    res.json({ message: 'Đã lưu thông tin liên hệ khẩn cấp.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/user/export — xuất toàn bộ dữ liệu người dùng
router.get('/export', async (req, res) => {
  try {
    const db  = await getPool();
    const uid = req.user.id;

    const [userR, entriesR, checkinsR, lettersR, goalsR] = await Promise.all([
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, username, email, full_name, created_at, streak, max_streak FROM Users WHERE id = @uid'),
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, mood_score, event_text, thoughts, gratitude, tags, created_at FROM DiaryEntries WHERE user_id = @uid ORDER BY created_at DESC'),
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, year, week_number, results, created_at FROM CheckIns WHERE user_id = @uid ORDER BY created_at DESC'),
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, title, send_date, sent, created_at FROM FutureLetters WHERE user_id = @uid ORDER BY send_date'),
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, title, goal_type, target, current_value, completed, created_at FROM Goals WHERE user_id = @uid ORDER BY created_at DESC'),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      version: 'v2.0',
      user:     userR.recordset[0],
      diary:    decryptRows(entriesR.recordset, ['event_text', 'thoughts', 'gratitude']),
      checkins: checkinsR.recordset,
      future_letters: lettersR.recordset,
      goals:    goalsR.recordset,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      `attachment; filename="souldiary-export-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(exportData);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/user/referral — mã giới thiệu + thống kê (v3.4, flag referral_program)
router.get('/referral', async (req, res) => {
  try {
    const db  = await getPool();
    const uid = req.user.id;
    const r = await db.request().input('uid', sql.Int, uid).query(`
      SELECT referral_code,
        (SELECT COUNT(*) FROM Users WHERE referred_by=@uid) AS referredCount,
        (SELECT COUNT(*) FROM Users WHERE referred_by=@uid AND referral_rewarded=1) AS rewardsEarned
      FROM Users WHERE id=@uid
    `);
    if (!r.recordset.length) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    res.json(r.recordset[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
