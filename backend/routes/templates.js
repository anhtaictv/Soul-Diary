// routes/templates.js — Nhật ký định kỳ (template viết nhanh)
const express       = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/templates — danh sách template của user
router.get('/', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT id, title, content, gratitude, tags, default_mood, created_at
        FROM DiaryTemplates
        WHERE user_id=@uid
        ORDER BY created_at DESC
      `);
    res.json({ templates: r.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// POST /api/templates — tạo template mới
router.post('/', async (req, res) => {
  try {
    const { title, content, gratitude, tags, default_mood } = req.body;
    if (!title || !title.trim())
      return res.status(400).json({ message: 'Tên template không được để trống.' });
    if (title.length > 200)
      return res.status(400).json({ message: 'Tên tối đa 200 ký tự.' });

    const db = await getPool();

    // Giới hạn 20 template / user
    const cnt = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`SELECT COUNT(*) AS c FROM DiaryTemplates WHERE user_id=@uid`);
    if (cnt.recordset[0].c >= 20)
      return res.status(400).json({ message: 'Tối đa 20 template.' });

    const mood = Math.min(10, Math.max(1, parseInt(default_mood) || 5));

    const r = await db.request()
      .input('uid',   sql.Int,          req.user.id)
      .input('title', sql.NVarChar(200), title.trim())
      .input('cont',  sql.NVarChar,     content   || null)
      .input('grat',  sql.NVarChar,     gratitude || null)
      .input('tags',  sql.NVarChar(500), tags     || null)
      .input('mood',  sql.Int,           mood)
      .query(`
        INSERT INTO DiaryTemplates(user_id, title, content, gratitude, tags, default_mood)
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.content, INSERTED.gratitude, INSERTED.tags, INSERTED.default_mood, INSERTED.created_at
        VALUES(@uid, @title, @cont, @grat, @tags, @mood)
      `);
    res.json({ template: r.recordset[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// DELETE /api/templates/:id — xóa template
router.delete('/:id', async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query(`DELETE FROM DiaryTemplates WHERE id=@id AND user_id=@uid`);
    res.json({ message: 'Đã xóa template.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
