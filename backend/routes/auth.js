// routes/auth.js — Đăng ký / Đăng nhập / Profile / Đặt lại mật khẩu
const express      = require('express');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const crypto       = require('crypto');
const nodemailer   = require('nodemailer');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

function createMailTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

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

// ── PUT /api/auth/change-password — đổi mật khẩu ────────────────────────
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin.' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'Mật khẩu mới phải ít nhất 6 ký tự.' });

    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, req.user.id)
      .query('SELECT password FROM Users WHERE id=@id');
    if (!result.recordset.length)
      return res.status(404).json({ message: 'Người dùng không tồn tại.' });

    const isMatch = await bcrypt.compare(currentPassword, result.recordset[0].password);
    if (!isMatch)
      return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng.' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.request()
      .input('id', sql.Int, req.user.id)
      .input('pw', sql.NVarChar, hashed)
      .query('UPDATE Users SET password=@pw, updated_at=GETDATE() WHERE id=@id');

    res.json({ message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/auth/forgot-password — yêu cầu đặt lại mật khẩu ──────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Vui lòng nhập email.' });

    const db = await getPool();
    const result = await db.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id, full_name, username FROM Users WHERE email=@email');

    // Luôn trả 200 để tránh lộ thông tin tài khoản tồn tại hay không
    if (!result.recordset.length)
      return res.json({ message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được link trong vài phút.' });

    const user = result.recordset[0];
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 giờ

    await db.request()
      .input('uid',     sql.Int,      user.id)
      .input('hash',    sql.NVarChar, tokenHash)
      .input('expires', sql.DateTime2, expiresAt)
      .query(`INSERT INTO PasswordResets (user_id, token_hash, expires_at) VALUES (@uid, @hash, @expires)`);

    const transporter = createMailTransporter();
    if (!transporter) {
      return res.status(501).json({
        message: 'Chức năng gửi email chưa được cấu hình. Vui lòng liên hệ quản trị viên để đặt lại mật khẩu.',
      });
    }

    const appUrl   = process.env.APP_URL || 'https://souldiary.work.gd';
    const resetUrl = `${appUrl}/?reset=${rawToken}`;
    const fromAddr = process.env.SMTP_FROM || `Soul Diary <${process.env.SMTP_USER}>`;

    await transporter.sendMail({
      from: fromAddr,
      to:   email,
      subject: 'Đặt lại mật khẩu Soul Diary',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#2563eb">🔐 Đặt lại mật khẩu</h2>
          <p>Xin chào <strong>${user.full_name || user.username}</strong>,</p>
          <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Soul Diary của bạn.</p>
          <p style="margin:24px 0">
            <a href="${resetUrl}"
               style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
              Đặt lại mật khẩu
            </a>
          </p>
          <p style="color:#6b7280;font-size:14px">Link này hết hạn sau <strong>1 giờ</strong>. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
          <p style="color:#9ca3af;font-size:12px">Soul Diary · Nhật ký cảm xúc</p>
        </div>`,
    });

    res.json({ message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được link trong vài phút.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Lỗi server. Vui lòng thử lại sau.' });
  }
});

// ── POST /api/auth/reset-password — xác nhận token + đặt mật khẩu mới ──
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword)
      return res.status(400).json({ message: 'Thiếu thông tin.' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'Mật khẩu phải ít nhất 6 ký tự.' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const db = await getPool();
    const result = await db.request()
      .input('hash', sql.NVarChar, tokenHash)
      .query(`
        SELECT id, user_id FROM PasswordResets
        WHERE token_hash=@hash AND used_at IS NULL AND expires_at > GETDATE()
      `);

    if (!result.recordset.length)
      return res.status(400).json({ message: 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });

    const { id: resetId, user_id } = result.recordset[0];
    const hashed = await bcrypt.hash(newPassword, 12);

    await db.request()
      .input('uid', sql.Int, user_id)
      .input('pw',  sql.NVarChar, hashed)
      .query('UPDATE Users SET password=@pw, updated_at=GETDATE() WHERE id=@uid');

    await db.request()
      .input('id', sql.Int, resetId)
      .query('UPDATE PasswordResets SET used_at=GETDATE() WHERE id=@id');

    res.json({ message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── DELETE /api/auth/account — xóa tài khoản ─────────────────────────────
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Vui lòng nhập mật khẩu để xác nhận.' });

    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, req.user.id)
      .query('SELECT password, role FROM Users WHERE id=@id');

    if (!result.recordset.length)
      return res.status(404).json({ message: 'Người dùng không tồn tại.' });

    if (result.recordset[0].role === 'admin')
      return res.status(403).json({ message: 'Không thể xóa tài khoản admin.' });

    const isMatch = await bcrypt.compare(password, result.recordset[0].password);
    if (!isMatch)
      return res.status(401).json({ message: 'Mật khẩu không đúng.' });

    // Xóa các bản ghi không có CASCADE trước
    await db.request().input('uid', sql.Int, req.user.id)
      .query('DELETE FROM AnonReactions WHERE user_id=@uid');
    await db.request().input('uid', sql.Int, req.user.id)
      .query('DELETE FROM AdminMessages WHERE from_user_id=@uid');

    // Xóa user — CASCADE xử lý phần còn lại
    await db.request().input('id', sql.Int, req.user.id)
      .query('DELETE FROM Users WHERE id=@id');

    res.json({ message: 'Tài khoản đã được xóa.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
