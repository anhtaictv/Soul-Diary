// routes/features.js — Feature flags & quản lý phiên bản phát hành
const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');
const sql   = require('mssql');
const auth  = require('../middleware/auth');
const admin = require('../middleware/admin');

// GET /api/features — public, trả toàn bộ flags (frontend tự đọc enabled)
router.get('/', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request().query(`
      SELECT flag_key AS [key], label, description, version, version_title, enabled
      FROM FeatureFlags ORDER BY version DESC, sort_order ASC
    `);
    res.json({ features: r.recordset });
  } catch (e) {
    res.json({ features: [] });
  }
});

// GET /api/features/admin-list — admin: đầy đủ thông tin bao gồm ngày hẹn
router.get('/admin-list', auth, admin, async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request().query(`
      SELECT id, flag_key AS [key], label, description, version, version_title,
             enabled, release_date, released_at, sort_order, created_at
      FROM FeatureFlags ORDER BY version DESC, sort_order ASC
    `);
    res.json({ features: r.recordset });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/features/admin-list/release — phát hành toàn bộ version ngay lập tức
router.post('/admin-list/release', auth, admin, async (req, res) => {
  const { version } = req.body;
  if (!version) return res.status(400).json({ message: 'Thiếu version' });
  try {
    const db = await getPool();
    await db.request()
      .input('v', sql.NVarChar, version)
      .query(`UPDATE FeatureFlags
              SET enabled=1, released_at=GETDATE(), release_date=NULL
              WHERE version=@v`);
    res.json({ message: `Đã phát hành ${version}` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/features/admin-list/schedule — hẹn ngày phát hành cho cả version
router.post('/admin-list/schedule', auth, admin, async (req, res) => {
  const { version, release_date } = req.body;
  if (!version || !release_date) return res.status(400).json({ message: 'Thiếu version hoặc ngày' });
  try {
    const db = await getPool();
    await db.request()
      .input('v',  sql.NVarChar, version)
      .input('rd', sql.Date,     release_date)
      .query(`UPDATE FeatureFlags SET release_date=@rd
              WHERE version=@v AND enabled=0`);
    res.json({ message: `Đã hẹn phát hành ${version} vào ${release_date}` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/features/admin-list/revoke — thu hồi (tắt) toàn bộ version đã phát hành
router.post('/admin-list/revoke', auth, admin, async (req, res) => {
  const { version } = req.body;
  if (!version) return res.status(400).json({ message: 'Thiếu version' });
  try {
    const db = await getPool();
    await db.request()
      .input('v', sql.NVarChar, version)
      .query(`UPDATE FeatureFlags
              SET enabled=0, released_at=NULL, release_date=NULL
              WHERE version=@v`);
    res.json({ message: `Đã thu hồi ${version}` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/features/admin-list — tạo flag mới
router.post('/admin-list', auth, admin, async (req, res) => {
  const { key, label, description, version, version_title } = req.body;
  if (!key || !label || !version || !version_title)
    return res.status(400).json({ message: 'Thiếu: key, label, version, version_title' });
  const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  try {
    const db    = await getPool();
    const oRes  = await db.request()
      .input('v', sql.NVarChar, version)
      .query('SELECT ISNULL(MAX(sort_order),0)+1 AS n FROM FeatureFlags WHERE version=@v');
    await db.request()
      .input('fk',   sql.NVarChar, cleanKey)
      .input('lbl',  sql.NVarChar, label)
      .input('desc', sql.NVarChar, description || null)
      .input('ver',  sql.NVarChar, version)
      .input('vtl',  sql.NVarChar, version_title)
      .input('ord',  sql.Int,      oRes.recordset[0].n)
      .query(`INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
              VALUES (@fk,@lbl,@desc,@ver,@vtl,0,@ord)`);
    res.json({ message: 'Đã thêm tính năng', key: cleanKey });
  } catch (e) {
    if (e.message.includes('UQ_FF_key') || e.message.includes('UNIQUE'))
      return res.status(409).json({ message: `Key "${cleanKey}" đã tồn tại, chọn tên khác` });
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/features/admin-list/:key — cập nhật flag (bật/tắt, ngày hẹn, label, mô tả)
router.put('/admin-list/:key', auth, admin, async (req, res) => {
  const { enabled, release_date, label, description } = req.body;
  try {
    const db  = await getPool();
    const r   = db.request().input('k', sql.NVarChar, req.params.key);
    const set = [];
    if (enabled !== undefined) {
      set.push('enabled=@en', 'released_at=@ra');
      r.input('en', sql.Bit,       enabled ? 1 : 0);
      r.input('ra', sql.DateTime2, enabled ? new Date() : null);
    }
    if (release_date !== undefined) { set.push('release_date=@rd'); r.input('rd', sql.Date, release_date || null); }
    if (label        !== undefined) { set.push('label=@lbl');        r.input('lbl',  sql.NVarChar, label); }
    if (description  !== undefined) { set.push('description=@dsc'); r.input('dsc',  sql.NVarChar, description || null); }
    if (!set.length) return res.json({ message: 'OK' });
    await r.query(`UPDATE FeatureFlags SET ${set.join(',')} WHERE flag_key=@k`);
    res.json({ message: 'Đã cập nhật' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/features/admin-list/:key — xóa flag
router.delete('/admin-list/:key', auth, admin, async (req, res) => {
  try {
    const db = await getPool();
    await db.request().input('k', sql.NVarChar, req.params.key)
      .query('DELETE FROM FeatureFlags WHERE flag_key=@k');
    res.json({ message: 'Đã xóa' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
