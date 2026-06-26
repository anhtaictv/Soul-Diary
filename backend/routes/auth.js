// routes/auth.js — Đăng ký / Đăng nhập / Profile
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();

// ── Helper: tạo JWT ──────────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ── POST /api/auth/register ──────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

    // Validate
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu phải ít nhất 6 ký tự.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Email không hợp lệ.' });
    }

    const db = await getPool();

    // Kiểm tra trùng username/email
    const existing = await db.request()
      .input('username', sql.NVarChar, username)
      .input('email',    sql.NVarChar, email)
      .query('SELECT id FROM Users WHERE username = @username OR email = @email');

    if (existing.recordset.length > 0) {
      return res.status(409).json({ message: 'Tên đăng nhập hoặc email đã được sử dụng.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Avatar text: 2 chữ cái đầu của full_name hoặc username
    const avatarText = (full_name || username).substring(0, 2).toUpperCase();

    // Insert user
    const result = await db.request()
      .input('username',    sql.NVarChar, username)
      .input('email',       sql.NVarChar, email)
      .input('password',    sql.NVarChar, hashedPassword)
      .input('full_name',   sql.NVarChar, full_name || username)
      .input('avatar_text', sql.NVarChar, avatarText)
      .query(`
        INSERT INTO Users (username, email, password, full_name, avatar_text)
        OUTPUT INSERTED.id, INSERTED.username, INSERTED.email,
               INSERTED.full_name, INSERTED.avatar_text, INSERTED.role,
               INSERTED.streak, INSERTED.streak_freeze, INSERTED.max_streak
        VALUES (@username, @email, @password, @full_name, @avatar_text)
      `);

    const user  = result.recordset[0];
    const token = signToken(user);

    res.status(201).json({
      message: 'Đăng ký thành công!',
      token,
      user: {
        id:            user.id,
        username:      user.username,
        email:         user.email,
        full_name:     user.full_name,
        avatar_text:   user.avatar_text,
        role:          user.role,
        streak:        user.streak,
        streak_freeze: user.streak_freeze,
        max_streak:    user.max_streak,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Lỗi server. Vui lòng thử lại sau.' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
    }

    const db = await getPool();

    // Cho phép login bằng username hoặc email
    const result = await db.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT id, username, email, password, full_name, avatar_text, role,
               streak, streak_freeze, max_streak
        FROM Users
        WHERE username = @username OR email = @username
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    const user = result.recordset[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    const token = signToken(user);

    res.json({
      message: 'Đăng nhập thành công!',
      token,
      user: {
        id:            user.id,
        username:      user.username,
        email:         user.email,
        full_name:     user.full_name,
        avatar_text:   user.avatar_text,
        role:          user.role,
        streak:        user.streak,
        streak_freeze: user.streak_freeze,
        max_streak:    user.max_streak,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Lỗi server. Vui lòng thử lại sau.' });
  }
});

// ── GET /api/auth/me — lấy thông tin user hiện tại ──────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, req.user.id)
      .query(`
        SELECT id, username, email, full_name, avatar_text, role,
               streak, streak_freeze, max_streak, last_entry, created_at,
               notif_hour, notif_days
        FROM Users WHERE id = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    }

    res.json({ user: result.recordset[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PUT /api/auth/profile — cập nhật profile ────────────────────────────
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { full_name } = req.body;
    if (!full_name) return res.status(400).json({ message: 'Tên không được để trống.' });

    const avatarText = full_name.substring(0, 2).toUpperCase();
    const db = await getPool();

    await db.request()
      .input('id',          sql.Int,      req.user.id)
      .input('full_name',   sql.NVarChar, full_name)
      .input('avatar_text', sql.NVarChar, avatarText)
      .query(`
        UPDATE Users
        SET full_name = @full_name, avatar_text = @avatar_text, updated_at = GETDATE()
        WHERE id = @id
      `);

    res.json({ message: 'Cập nhật thành công.', avatar_text: avatarText, full_name });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PUT /api/auth/notification-prefs — cài đặt nhắc nhở tùy chỉnh ─────
router.put('/notification-prefs', authMiddleware, async (req, res) => {
  try {
    const { notif_hour, notif_days } = req.body;
    const h = notif_hour !== null && notif_hour !== undefined ? parseInt(notif_hour) : null;
    if (h !== null && (isNaN(h) || h < 0 || h > 23))
      return res.status(400).json({ message: 'Giờ không hợp lệ (0–23).' });
    const db = await getPool();
    await db.request()
      .input('uid',        sql.Int,      req.user.id)
      .input('notif_hour', sql.Int,      h)
      .input('notif_days', sql.NVarChar, notif_days || null)
      .query('UPDATE Users SET notif_hour=@notif_hour, notif_days=@notif_days WHERE id=@uid');
    res.json({ message: 'Đã lưu cài đặt nhắc nhở!' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
