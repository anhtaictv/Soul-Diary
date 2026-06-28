const express = require('express');
const router  = express.Router();
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

router.use(authMiddleware);

const MAX_NOTES = 10;
const VALID_COLORS = ['yellow','green','blue','pink','white'];

// GET /api/notes — danh sách ghi chú của user
router.get('/', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`SELECT id, content, color, created_at
              FROM QuickNotes WHERE user_id = @uid
              ORDER BY created_at DESC`);
    res.json({ notes: r.recordset });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notes — tạo ghi chú mới (tối đa 10)
router.post('/', async (req, res) => {
  const { content, color = 'yellow' } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ message: 'Nội dung không được trống.' });
  if (content.trim().length > 500) return res.status(400).json({ message: 'Ghi chú tối đa 500 ký tự.' });
  if (!VALID_COLORS.includes(color)) return res.status(400).json({ message: 'Màu không hợp lệ.' });

  try {
    const db    = await getPool();
    const count = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query('SELECT COUNT(*) as n FROM QuickNotes WHERE user_id = @uid');
    if (count.recordset[0].n >= MAX_NOTES)
      return res.status(400).json({ message: `Chỉ được tạo tối đa ${MAX_NOTES} ghi chú.` });

    const r = await db.request()
      .input('uid',     sql.Int,      req.user.id)
      .input('content', sql.NVarChar, content.trim())
      .input('color',   sql.NVarChar, color)
      .query(`INSERT INTO QuickNotes (user_id, content, color)
              OUTPUT INSERTED.id, INSERTED.content, INSERTED.color, INSERTED.created_at
              VALUES (@uid, @content, @color)`);
    res.status(201).json({ note: r.recordset[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query('DELETE FROM QuickNotes WHERE id = @id AND user_id = @uid');
    if (!r.rowsAffected[0]) return res.status(404).json({ message: 'Không tìm thấy ghi chú.' });
    res.json({ message: 'Đã xóa.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
