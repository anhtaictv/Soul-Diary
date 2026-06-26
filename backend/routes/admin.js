// routes/admin.js — Quản lý hệ thống (chỉ admin)
const express          = require('express');
const bcrypt           = require('bcryptjs');
const crypto           = require('crypto');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');
const adminMiddleware  = require('../middleware/admin');
const { webpush }      = require('./push');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

// ── GET /api/admin/stats — Thống kê tổng quan ────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const db = await getPool();
    const [users, entries, articles, atRisk] = await Promise.all([
      db.request().query('SELECT COUNT(*) AS total FROM Users WHERE role=\'user\''),
      db.request().query('SELECT COUNT(*) AS total FROM DiaryEntries'),
      db.request().query('SELECT COUNT(*) AS total, SUM(CAST(is_published AS INT)) AS published FROM Articles'),
      db.request().query(`
        SELECT COUNT(*) AS total FROM (
          SELECT user_id FROM (
            SELECT user_id, CAST(created_at AS DATE) AS d,
                   AVG(CAST(mood_score AS FLOAT)) AS avg_m,
                   ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY CAST(created_at AS DATE) DESC) AS rn
            FROM DiaryEntries
            GROUP BY user_id, CAST(created_at AS DATE)
          ) daily
          WHERE rn <= 7
          GROUP BY user_id
          HAVING COUNT(*) = 7 AND SUM(CASE WHEN avg_m <= 4 THEN 1 ELSE 0 END) = 7
        ) x
      `),
    ]);
    res.json({
      users:             users.recordset[0].total,
      diary_entries:     entries.recordset[0].total,
      articles_total:    articles.recordset[0].total,
      articles_published:articles.recordset[0].published || 0,
      at_risk_users:     atRisk.recordset[0].total,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/admin/users — Danh sách người dùng ──────────────────────────
router.get('/users', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role,
             u.streak, u.created_at,
             COUNT(d.id) AS diary_count,
             (SELECT TOP 1 mood_score FROM DiaryEntries WHERE user_id=u.id ORDER BY created_at DESC) AS last_mood
      FROM Users u
      LEFT JOIN DiaryEntries d ON d.user_id = u.id
      GROUP BY u.id, u.username, u.email, u.full_name, u.role, u.streak, u.created_at
      ORDER BY u.created_at DESC
    `);
    res.json({ users: result.recordset });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PATCH /api/admin/users/:id/role — Thay đổi role ──────────────────────
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role không hợp lệ.' });
    }
    // Không cho tự hạ quyền chính mình
    if (parseInt(req.params.id) === req.user.id && role === 'user') {
      return res.status(400).json({ message: 'Không thể tự hạ quyền admin của chính mình.' });
    }
    const db = await getPool();
    await db.request()
      .input('id',   sql.Int,      req.params.id)
      .input('role', sql.NVarChar, role)
      .query('UPDATE Users SET role=@role WHERE id=@id');
    res.json({ message: role === 'admin' ? 'Đã cấp quyền admin.' : 'Đã thu hồi quyền admin.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/admin/outreach — Gửi tin hỗ trợ đến user ──────────────────
router.post('/outreach', async (req, res) => {
  try {
    const { to_user_id, type, content, meta } = req.body;
    if (!to_user_id || !content?.trim()) {
      return res.status(400).json({ message: 'Thiếu người nhận hoặc nội dung.' });
    }
    if (!['message','cheer','song','article'].includes(type)) {
      return res.status(400).json({ message: 'Loại tin không hợp lệ.' });
    }
    const db = await getPool();
    await db.request()
      .input('from',    sql.Int,      req.user.id)
      .input('to',      sql.Int,      to_user_id)
      .input('type',    sql.NVarChar, type)
      .input('content', sql.NVarChar, content.trim())
      .input('meta',    sql.NVarChar, meta ? JSON.stringify(meta) : null)
      .query(`INSERT INTO AdminMessages (from_user_id,to_user_id,type,content,meta_json)
              VALUES (@from,@to,@type,@content,@meta)`);

    // Push notification nếu user có subscription
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      const subs = await db.request()
        .input('uid', sql.Int, to_user_id)
        .query('SELECT endpoint,p256dh,auth FROM PushSubscriptions WHERE user_id=@uid');
      const icons = { message:'💬', cheer:'✨', song:'🎵', article:'📖' };
      for (const s of subs.recordset) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: `Soul Diary ${icons[type]}`, body: content.trim().slice(0, 80) }),
          );
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            await db.request().input('ep', sql.NVarChar, s.endpoint)
              .query('DELETE FROM PushSubscriptions WHERE endpoint=@ep');
          }
        }
      }
    }
    res.json({ message: 'Đã gửi tin!' });
  } catch (err) {
    console.error('Outreach error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/admin/report — Báo cáo xu hướng tâm trạng hàng tháng ──────
router.get('/report', async (req, res) => {
  try {
    const db = await getPool();
    const [monthly, moodDist] = await Promise.all([
      // Avg mood, entry count, active users per month (6 tháng)
      db.request().query(`
        SELECT FORMAT(created_at, 'yyyy-MM') AS month,
               ROUND(AVG(CAST(mood_score AS FLOAT)), 2) AS avg_mood,
               COUNT(*) AS total_entries,
               COUNT(DISTINCT user_id) AS active_users
        FROM DiaryEntries
        WHERE created_at >= DATEADD(MONTH, -5, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
        GROUP BY FORMAT(created_at, 'yyyy-MM')
        ORDER BY month
      `),
      // Phân bố điểm tâm trạng 30 ngày gần nhất
      db.request().query(`
        SELECT mood_score, COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE created_at >= DATEADD(DAY, -30, GETDATE())
        GROUP BY mood_score
        ORDER BY mood_score
      `),
    ]);
    res.json({ monthly: monthly.recordset, moodDist: moodDist.recordset });
  } catch (err) {
    console.error('Admin report error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/admin/users/:id/reset-password — admin đặt lại mật khẩu tạm ──
router.post('/users/:id/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const db = await getPool();
    const check = await db.request().input('id', sql.Int, userId)
      .query('SELECT id, role FROM Users WHERE id=@id');
    if (!check.recordset.length)
      return res.status(404).json({ message: 'Người dùng không tồn tại.' });
    if (check.recordset[0].role === 'admin' && userId !== req.user.id)
      return res.status(403).json({ message: 'Không thể reset mật khẩu tài khoản admin khác.' });

    const tempPassword = crypto.randomBytes(5).toString('hex'); // 10 ký tự hex
    const hashed = await bcrypt.hash(tempPassword, 12);
    await db.request()
      .input('id', sql.Int, userId)
      .input('pw', sql.NVarChar, hashed)
      .query('UPDATE Users SET password=@pw, updated_at=GETDATE() WHERE id=@id');

    res.json({ message: 'Đã đặt lại mật khẩu tạm thời.', tempPassword });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
