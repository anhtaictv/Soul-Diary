// routes/inbox.js — Hộp thư hỗ trợ từ admin/counselor
const express          = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/inbox — danh sách tin nhắn của user hiện tại
router.get('/', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT m.id, m.type, m.content, m.meta_json, m.is_read, m.created_at,
               u.username AS from_username, u.full_name AS from_fullname
        FROM AdminMessages m
        JOIN Users u ON u.id = m.from_user_id
        WHERE m.to_user_id = @uid
        ORDER BY m.created_at DESC
      `);
    res.json({ messages: result.recordset });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// GET /api/inbox/unread-count — số tin chưa đọc (dùng cho badge)
router.get('/unread-count', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query('SELECT COUNT(*) AS cnt FROM AdminMessages WHERE to_user_id=@uid AND is_read=0');
    res.json({ count: result.recordset[0].cnt });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// PATCH /api/inbox/:id/read — đánh dấu đã đọc
router.patch('/:id/read', async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query('UPDATE AdminMessages SET is_read=1 WHERE id=@id AND to_user_id=@uid');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
