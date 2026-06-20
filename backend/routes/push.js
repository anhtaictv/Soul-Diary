// routes/push.js — Web Push subscription management
const express        = require('express');
const webpush        = require('web-push');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();

// Cấu hình VAPID keys cho web-push
webpush.setVapidDetails(
  process.env.VAPID_EMAIL    || 'mailto:admin@souldiary.vn',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

// ── GET /api/push/vapid-public-key — gửi public key cho frontend subscribe ──
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// ── POST /api/push/subscribe — lưu subscription của user ────────────────
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Subscription không hợp lệ.' });
    }
    const db = await getPool();
    // Xóa subscription cũ của user (nếu có) rồi insert mới
    await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query('DELETE FROM PushSubscriptions WHERE user_id = @user_id');
    await db.request()
      .input('user_id',  sql.Int,      req.user.id)
      .input('endpoint', sql.NVarChar, endpoint)
      .input('p256dh',   sql.NVarChar, keys.p256dh)
      .input('auth',     sql.NVarChar, keys.auth)
      .query(`
        INSERT INTO PushSubscriptions (user_id, endpoint, p256dh, auth)
        VALUES (@user_id, @endpoint, @p256dh, @auth)
      `);
    res.json({ message: 'Đã bật thông báo.' });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── DELETE /api/push/subscribe — huỷ subscription ───────────────────────
router.delete('/subscribe', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query('DELETE FROM PushSubscriptions WHERE user_id = @user_id');
    res.json({ message: 'Đã tắt thông báo.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/push/status — kiểm tra user có đang subscribe không ─────────
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .query('SELECT id FROM PushSubscriptions WHERE user_id = @user_id');
    res.json({ subscribed: result.recordset.length > 0 });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = { router, webpush };
