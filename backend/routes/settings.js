// routes/settings.js — Nội dung cấu hình dạng key/value (vd: đường dây hỗ trợ)
const express          = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');
const adminMiddleware  = require('../middleware/admin');

const router = express.Router();

// ── GET /api/settings/:key — Đọc nội dung (public) ───────────────────────
router.get('/:key', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('key', sql.NVarChar, req.params.key)
      .query('SELECT [value], updated_at FROM Settings WHERE [key] = @key');

    res.json({ key: req.params.key, value: result.recordset[0]?.value || '' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PUT /api/settings/:key — Cập nhật nội dung (chỉ admin) ───────────────
router.put('/:key', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const value = typeof req.body.value === 'string' ? req.body.value : '';
    const db    = await getPool();

    await db.request()
      .input('key',   sql.NVarChar,    req.params.key)
      .input('value', sql.NVarChar(sql.MAX), value)
      .query(`
        MERGE Settings AS target
        USING (SELECT @key AS [key]) AS src
        ON target.[key] = src.[key]
        WHEN MATCHED THEN
          UPDATE SET [value] = @value, updated_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT ([key], [value]) VALUES (@key, @value);
      `);

    res.json({ message: '💾 Đã lưu thay đổi.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
