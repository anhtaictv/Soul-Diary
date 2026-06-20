// routes/articles.js — Thư viện kiến thức: public read, admin CRUD
const express        = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');
const adminMiddleware  = require('../middleware/admin');

const router = express.Router();

// Helper: tạo slug từ tiêu đề
function makeSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    + '-' + Date.now();
}

// ── GET /api/articles — Danh sách bài (public, chỉ published) ────────────
router.get('/', async (req, res) => {
  try {
    const category = req.query.category || '';
    const search   = req.query.search   || '';
    const type     = req.query.type     || '';
    const db       = await getPool();

    const result = await db.request()
      .input('category', sql.NVarChar, category)
      .input('search',   sql.NVarChar, `%${search}%`)
      .input('type',     sql.NVarChar, type)
      .query(`
        SELECT a.id, a.title, a.slug, a.category, a.summary, a.type,
               a.thumbnail, a.cover_color, a.read_time,
               a.view_count, a.created_at,
               u.full_name AS author_name
        FROM Articles a
        LEFT JOIN Users u ON a.author_id = u.id
        WHERE a.is_published = 1
          AND (@type = '' OR a.type = @type)
          AND (@category = '' OR a.category = @category)
          AND (@search = '%%' OR a.title LIKE @search OR a.summary LIKE @search)
        ORDER BY a.created_at DESC
      `);

    res.json({ articles: result.recordset });
  } catch (err) {
    console.error('Get articles error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/articles/categories — Danh sách category (public) ───────────
router.get('/categories', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT DISTINCT category, COUNT(*) AS count
      FROM Articles WHERE is_published = 1 AND type = 'library'
      GROUP BY category ORDER BY count DESC
    `);
    res.json({ categories: result.recordset });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/articles/:id — Chi tiết bài viết (public) ───────────────────
router.get('/:id', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT a.*, u.full_name AS author_name, u.avatar_text AS author_avatar
        FROM Articles a
        LEFT JOIN Users u ON a.author_id = u.id
        WHERE a.id = @id AND a.is_published = 1
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
    }

    // Tăng view count
    await db.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Articles SET view_count = view_count + 1 WHERE id = @id');

    res.json({ article: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — Yêu cầu đăng nhập + role admin
// ═══════════════════════════════════════════════════════════════════════════
router.use(authMiddleware, adminMiddleware);

// ── GET /api/articles/admin/all — Tất cả bài (cả draft) ──────────────────
router.get('/admin/all', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT a.id, a.title, a.slug, a.category, a.summary, a.type,
             a.thumbnail, a.cover_color, a.read_time,
             a.is_published, a.view_count, a.created_at, a.updated_at,
             u.full_name AS author_name
      FROM Articles a
      LEFT JOIN Users u ON a.author_id = u.id
      ORDER BY a.updated_at DESC
    `);
    res.json({ articles: result.recordset });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/articles/admin/:id — Chi tiết bài (kể cả draft) ─────────────
router.get('/admin/:id', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM Articles WHERE id = @id');
    if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy.' });
    res.json({ article: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/articles — Tạo bài mới ─────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, category, summary, content,
            thumbnail, cover_color, read_time, is_published, type } = req.body;

    if (!title || !category || !content) {
      return res.status(400).json({ message: 'Tiêu đề, danh mục và nội dung là bắt buộc.' });
    }

    const articleType = ['library', 'exercise'].includes(type) ? type : 'library';
    const slug = makeSlug(title);
    const db   = await getPool();

    const result = await db.request()
      .input('title',        sql.NVarChar, title)
      .input('slug',         sql.NVarChar, slug)
      .input('category',     sql.NVarChar, category)
      .input('summary',      sql.NVarChar, summary      || '')
      .input('content',      sql.NVarChar, content)
      .input('type',         sql.NVarChar, articleType)
      .input('thumbnail',    sql.NVarChar, thumbnail    || '📄')
      .input('cover_color',  sql.NVarChar, cover_color  || '#eef2ff')
      .input('read_time',    sql.NVarChar, read_time    || '5 phút')
      .input('is_published', sql.Bit,      is_published ? 1 : 0)
      .input('author_id',    sql.Int,      req.user.id)
      .query(`
        INSERT INTO Articles
          (title, slug, category, summary, content, type, thumbnail, cover_color, read_time, is_published, author_id)
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.slug, INSERTED.type, INSERTED.is_published, INSERTED.created_at
        VALUES
          (@title, @slug, @category, @summary, @content, @type, @thumbnail, @cover_color, @read_time, @is_published, @author_id)
      `);

    res.status(201).json({
      message: is_published ? '✅ Đã đăng bài!' : '💾 Đã lưu nháp.',
      article: result.recordset[0],
    });
  } catch (err) {
    console.error('Create article error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PUT /api/articles/:id — Sửa bài ──────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { title, category, summary, content,
            thumbnail, cover_color, read_time, is_published, type } = req.body;

    const articleType = ['library', 'exercise'].includes(type) ? type : 'library';
    const db = await getPool();
    const result = await db.request()
      .input('id',           sql.Int,      req.params.id)
      .input('title',        sql.NVarChar, title)
      .input('category',     sql.NVarChar, category)
      .input('summary',      sql.NVarChar, summary      || '')
      .input('content',      sql.NVarChar, content)
      .input('type',         sql.NVarChar, articleType)
      .input('thumbnail',    sql.NVarChar, thumbnail    || '📄')
      .input('cover_color',  sql.NVarChar, cover_color  || '#eef2ff')
      .input('read_time',    sql.NVarChar, read_time    || '5 phút')
      .input('is_published', sql.Bit,      is_published ? 1 : 0)
      .query(`
        UPDATE Articles
        SET title=@title, category=@category, summary=@summary, content=@content,
            type=@type, thumbnail=@thumbnail, cover_color=@cover_color, read_time=@read_time,
            is_published=@is_published, updated_at=GETDATE()
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.type, INSERTED.is_published, INSERTED.updated_at
        WHERE id = @id
      `);

    if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy bài.' });
    res.json({ message: 'Đã cập nhật.', article: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── DELETE /api/articles/:id — Xóa bài ───────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Articles WHERE id = @id');
    res.json({ message: 'Đã xóa bài viết.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PATCH /api/articles/:id/publish — Toggle publish ─────────────────────
router.patch('/:id/publish', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE Articles
        SET is_published = 1 - is_published, updated_at = GETDATE()
        OUTPUT INSERTED.id, INSERTED.is_published
        WHERE id = @id
      `);
    const pub = result.recordset[0]?.is_published;
    res.json({ message: pub ? '✅ Đã đăng bài.' : '📝 Chuyển về nháp.', is_published: pub });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
