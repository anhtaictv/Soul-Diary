// routes/notifications.js — Trung tâm thông báo in-app (notification_center)
const express          = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/notifications/unread-count — phải đứng TRƯỚC /:id
router.get('/unread-count', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`SELECT COUNT(*) AS cnt FROM Notifications WHERE user_id = @user_id AND is_read = 0`);
    res.json({ count: r.recordset[0].cnt });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// GET /api/notifications — 30 thông báo gần nhất
router.get('/', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`
        SELECT TOP 30 id, type, title, body, link, is_read, created_at
        FROM Notifications
        WHERE user_id = @user_id
        ORDER BY created_at DESC
      `);
    res.json({ notifications: result.recordset });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query(`UPDATE Notifications SET is_read = 1 WHERE user_id = @user_id AND is_read = 0`);
    res.json({ message: 'Đã đánh dấu đọc tất cả.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID không hợp lệ.' });
    const db = await getPool();
    await db.request()
      .input('id',      sql.Int, id)
      .input('user_id', sql.Int, req.user.id)
      .query(`UPDATE Notifications SET is_read = 1 WHERE id = @id AND user_id = @user_id`);
    res.json({ message: 'Đã đọc.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
