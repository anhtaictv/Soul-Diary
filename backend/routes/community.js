// routes/community.js — Góc Tâm sự Ẩn danh
const express          = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');
const adminMiddleware  = require('../middleware/admin');

const router = express.Router();
router.use(authMiddleware);

const MAX_CONTENT = 500;

// GET / — danh sách bài tâm sự hiển thị (ẩn danh)
router.get('/', async (req, res) => {
  try {
    const db     = await getPool();
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 20;
    const offset = (page - 1) * limit;
    const result = await db.request()
      .input('uid',    sql.Int, req.user.id)
      .input('offset', sql.Int, offset)
      .input('limit',  sql.Int, limit)
      .query(`
        SELECT p.id, p.content, p.mood_tag, p.sympathy_count, p.created_at,
               CASE WHEN p.user_id = @uid THEN 1 ELSE 0 END AS is_own,
               CASE WHEN EXISTS (
                 SELECT 1 FROM AnonReactions r WHERE r.post_id=p.id AND r.user_id=@uid
               ) THEN 1 ELSE 0 END AS has_reacted
        FROM AnonPosts p
        WHERE p.is_hidden = 0
        ORDER BY p.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);
    res.json({ posts: result.recordset, page });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST / — đăng bài tâm sự ẩn danh
router.post('/', async (req, res) => {
  try {
    const { content, mood_tag } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Nội dung không được để trống.' });
    if (content.length > MAX_CONTENT) return res.status(400).json({ error: `Nội dung tối đa ${MAX_CONTENT} ký tự.` });
    const db = await getPool();
    const result = await db.request()
      .input('uid',      sql.Int,      req.user.id)
      .input('content',  sql.NVarChar, content.trim())
      .input('mood_tag', sql.NVarChar, mood_tag || null)
      .query(`INSERT INTO AnonPosts (user_id, content, mood_tag)
              OUTPUT INSERTED.id, INSERTED.content, INSERTED.mood_tag,
                     INSERTED.sympathy_count, INSERTED.created_at
              VALUES (@uid, @content, @mood_tag)`);
    res.status(201).json({ post: { ...result.recordset[0], is_own: 1, has_reacted: 0 } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /:id/react — toggle 💙 đồng cảm
router.post('/:id/react', async (req, res) => {
  try {
    const db  = await getPool();
    const pid = parseInt(req.params.id);
    const existing = await db.request()
      .input('pid', sql.Int, pid)
      .input('uid', sql.Int, req.user.id)
      .query('SELECT id FROM AnonReactions WHERE post_id=@pid AND user_id=@uid');

    if (existing.recordset.length > 0) {
      await db.request()
        .input('pid', sql.Int, pid).input('uid', sql.Int, req.user.id)
        .query('DELETE FROM AnonReactions WHERE post_id=@pid AND user_id=@uid');
      await db.request().input('pid', sql.Int, pid)
        .query('UPDATE AnonPosts SET sympathy_count=sympathy_count-1 WHERE id=@pid AND sympathy_count>0');
      res.json({ reacted: false });
    } else {
      await db.request()
        .input('pid', sql.Int, pid).input('uid', sql.Int, req.user.id)
        .query('INSERT INTO AnonReactions (post_id, user_id) VALUES (@pid, @uid)');
      await db.request().input('pid', sql.Int, pid)
        .query('UPDATE AnonPosts SET sympathy_count=sympathy_count+1 WHERE id=@pid');
      res.json({ reacted: true });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /:id — xóa bài của chính mình
router.delete('/:id', async (req, res) => {
  try {
    const db     = await getPool();
    const result = await db.request()
      .input('pid', sql.Int, parseInt(req.params.id))
      .input('uid', sql.Int, req.user.id)
      .query('DELETE FROM AnonPosts WHERE id=@pid AND user_id=@uid');
    if (result.rowsAffected[0] === 0)
      return res.status(403).json({ error: 'Không có quyền xóa bài này.' });
    res.json({ message: 'Đã xóa.' });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Admin: GET /admin-list — xem bài với username để kiểm duyệt
router.get('/admin-list', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT p.id, p.content, p.mood_tag, p.sympathy_count, p.is_hidden, p.created_at,
             u.username
      FROM AnonPosts p JOIN Users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
    `);
    res.json({ posts: result.recordset });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Admin: PATCH /:id/hide — ẩn/hiện bài
router.patch('/:id/hide', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .query('UPDATE AnonPosts SET is_hidden=1-is_hidden OUTPUT INSERTED.is_hidden WHERE id=@id');
    res.json({ is_hidden: result.recordset[0]?.is_hidden });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
