// routes/admin.js — Quản lý hệ thống (chỉ admin)
const express          = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');
const adminMiddleware  = require('../middleware/admin');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

// ── GET /api/admin/stats — Thống kê tổng quan ────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const db = await getPool();
    const [users, entries, articles] = await Promise.all([
      db.request().query('SELECT COUNT(*) AS total FROM Users WHERE role=\'user\''),
      db.request().query('SELECT COUNT(*) AS total FROM DiaryEntries'),
      db.request().query('SELECT COUNT(*) AS total, SUM(CAST(is_published AS INT)) AS published FROM Articles'),
    ]);
    res.json({
      users:             users.recordset[0].total,
      diary_entries:     entries.recordset[0].total,
      articles_total:    articles.recordset[0].total,
      articles_published:articles.recordset[0].published || 0,
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
             COUNT(d.id) AS diary_count
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

module.exports = router;
