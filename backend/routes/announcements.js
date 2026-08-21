// routes/announcements.js — Thông báo hệ thống (banner): public read, admin CRUD
const express = require('express');
const { getPool, sql } = require('../db');
const authMiddleware  = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const router = express.Router();

const SEVERITIES = ['info', 'warning', 'critical'];

// Cache 30s — bảng ít đổi nhưng được gọi ở mọi lần tải trang của mọi user
let _activeCache = null; // { data, time }
const ACTIVE_CACHE_TTL = 30000;

// ── GET /api/announcements/active — public, chỉ các thông báo đang bật ──
router.get('/active', async (req, res) => {
  try {
    if (_activeCache && Date.now() - _activeCache.time < ACTIVE_CACHE_TTL) {
      return res.json({ announcements: _activeCache.data });
    }
    const db = await getPool();
    const result = await db.request().query(`
      SELECT id, message, severity, created_at
      FROM Announcements
      WHERE is_active = 1
      ORDER BY created_at DESC
    `);
    _activeCache = { data: result.recordset, time: Date.now() };
    res.json({ announcements: result.recordset });
  } catch (err) {
    console.error('Get active announcements error:', err);
    res.json({ announcements: _activeCache?.data || [] });
  }
});

router.use(authMiddleware, adminMiddleware);

// ── GET /api/announcements/admin-list — admin: toàn bộ thông báo ────────
router.get('/admin-list', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT a.id, a.message, a.severity, a.is_active, a.created_at, a.updated_at,
             u.full_name AS created_by_name
      FROM Announcements a
      LEFT JOIN Users u ON a.created_by = u.id
      ORDER BY a.created_at DESC
    `);
    res.json({ announcements: result.recordset });
  } catch (err) {
    console.error('Get admin announcements error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/announcements — tạo thông báo mới ──────────────────────────
router.post('/', async (req, res) => {
  try {
    const { message, severity, is_active } = req.body;
    if (!message) return res.status(400).json({ message: 'Nội dung thông báo là bắt buộc.' });

    const cleanSeverity = SEVERITIES.includes(severity) ? severity : 'info';
    const db = await getPool();
    const result = await db.request()
      .input('message',    sql.NVarChar, message)
      .input('severity',   sql.NVarChar, cleanSeverity)
      .input('is_active',  sql.Bit,      is_active ? 1 : 0)
      .input('created_by', sql.Int,      req.user.id)
      .query(`
        INSERT INTO Announcements (message, severity, is_active, created_by)
        OUTPUT INSERTED.id, INSERTED.message, INSERTED.severity, INSERTED.is_active, INSERTED.created_at
        VALUES (@message, @severity, @is_active, @created_by)
      `);

    res.status(201).json({ message: 'Đã tạo thông báo.', announcement: result.recordset[0] });
  } catch (err) {
    console.error('Create announcement error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PUT /api/announcements/:id — sửa thông báo ───────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { message, severity, is_active } = req.body;
    const db = await getPool();
    const r  = db.request().input('id', sql.Int, req.params.id);
    const set = ['updated_at = GETDATE()'];

    if (message  !== undefined) { set.push('message = @message');   r.input('message', sql.NVarChar, message); }
    if (severity !== undefined) { set.push('severity = @severity'); r.input('severity', sql.NVarChar, SEVERITIES.includes(severity) ? severity : 'info'); }
    if (is_active !== undefined) { set.push('is_active = @is_active'); r.input('is_active', sql.Bit, is_active ? 1 : 0); }

    await r.query(`UPDATE Announcements SET ${set.join(', ')} WHERE id = @id`);
    res.json({ message: 'Đã cập nhật.' });
  } catch (err) {
    console.error('Update announcement error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── DELETE /api/announcements/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db = await getPool();
    await db.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM Announcements WHERE id = @id');
    res.json({ message: 'Đã xóa.' });
  } catch (err) {
    console.error('Delete announcement error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
