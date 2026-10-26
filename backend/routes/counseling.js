// routes/counseling.js — Tổ chức (trường/công ty/cộng đồng...) & tư vấn viên
// - Thành viên: tổ chức gắn qua hồ sơ (Users.org_id), nhắn tin 1-1 với tư vấn viên của tổ chức
// - Tư vấn viên (role='counselor'): CHỈ thấy người đã tự nhắn cho mình + số liệu mood tổng hợp ẩn danh,
//   không bao giờ đọc được nhật ký của thành viên
// - Admin: tạo tổ chức, cấp tài khoản tư vấn viên
const express          = require('express');
const bcrypt           = require('bcryptjs');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');
const adminMiddleware  = require('../middleware/admin');
const { encryptField, decryptField } = require('../utils/diary-crypto');
const { createNotification } = require('../utils/notifier');

const router = express.Router();
router.use(authMiddleware);

const ORG_TYPES = ['school', 'company', 'community', 'clinic', 'other'];
const MIN_AGGREGATE = 5; // giống Bản đồ cảm xúc trường: < 5 người thì không hiện số liệu tổng hợp (tránh lộ danh tính)

function cleanContent(raw) {
  const s = String(raw || '').trim();
  return s && s.length <= 2000 ? s : null;
}

const mapMessages = rows => rows.map(m => ({
  id: m.id, sender: m.sender, content: decryptField(m.content), created_at: m.created_at,
  counselor_name: m.counselor_name || null,
}));

async function counselorMiddleware(req, res, next) {
  try {
    const db = await getPool();
    const r = await db.request().input('id', sql.Int, req.user.id)
      .query('SELECT role, org_id FROM Users WHERE id=@id');
    const u = r.recordset[0];
    if (!u || u.role !== 'counselor' || !u.org_id)
      return res.status(403).json({ message: 'Chỉ tư vấn viên của tổ chức mới truy cập được.' });
    req.orgId = u.org_id;
    next();
  } catch (err) { res.status(500).json({ message: 'Lỗi kiểm tra quyền.' }); }
}

// ── Mọi user ────────────────────────────────────────────────────────────────

// GET /api/counseling/orgs — danh sách tổ chức (gợi ý khi nhập ở hồ sơ)
router.get('/orgs', async (req, res) => {
  try {
    const db = await getPool();
    const r = await db.request().query('SELECT id, name, org_type FROM Organizations ORDER BY name');
    res.json({ orgs: r.recordset });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// GET /api/counseling/me — tổ chức của tôi + hội thoại với tư vấn viên (đánh dấu đã đọc)
router.get('/me', async (req, res) => {
  try {
    const db = await getPool();
    const orgR = await db.request().input('uid', sql.Int, req.user.id).query(`
      SELECT o.id, o.name, o.org_type,
             (SELECT COUNT(*) FROM Users c WHERE c.org_id=o.id AND c.role='counselor') AS counselor_count
      FROM Users u JOIN Organizations o ON o.id=u.org_id WHERE u.id=@uid
    `);
    const org = orgR.recordset[0];
    if (!org) return res.json({ org: null, messages: [] });
    const msgR = await db.request().input('uid', sql.Int, req.user.id).input('org', sql.Int, org.id).query(`
      SELECT m.id, m.sender, m.content, m.created_at, c.full_name AS counselor_name
      FROM CounselingMessages m LEFT JOIN Users c ON c.id=m.counselor_id
      WHERE m.org_id=@org AND m.user_id=@uid ORDER BY m.created_at
    `);
    await db.request().input('uid', sql.Int, req.user.id).input('org', sql.Int, org.id).query(`
      UPDATE CounselingMessages SET is_read=1 WHERE org_id=@org AND user_id=@uid AND sender='counselor' AND is_read=0
    `);
    res.json({ org, messages: mapMessages(msgR.recordset) });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// GET /api/counseling/me/unread — số tin tư vấn viên gửi chưa đọc (badge)
router.get('/me/unread', async (req, res) => {
  try {
    const db = await getPool();
    const r = await db.request().input('uid', sql.Int, req.user.id).query(`
      SELECT COUNT(*) AS cnt FROM CounselingMessages m JOIN Users u ON u.id=m.user_id AND u.org_id=m.org_id
      WHERE m.user_id=@uid AND m.sender='counselor' AND m.is_read=0
    `);
    res.json({ count: r.recordset[0].cnt });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// POST /api/counseling/me — gửi tin cho tư vấn viên của tổ chức mình
router.post('/me', async (req, res) => {
  const content = cleanContent(req.body.content);
  if (!content) return res.status(400).json({ message: 'Tin nhắn phải từ 1 đến 2000 ký tự.' });
  try {
    const db = await getPool();
    const r = await db.request().input('uid', sql.Int, req.user.id).query(`
      SELECT u.org_id, u.full_name FROM Users u WHERE u.id=@uid AND u.org_id IS NOT NULL
    `);
    const me = r.recordset[0];
    if (!me) return res.status(400).json({ message: 'Bạn chưa chọn tổ chức trong Cài đặt → Hồ sơ.' });
    const cR = await db.request().input('org', sql.Int, me.org_id)
      .query(`SELECT id FROM Users WHERE org_id=@org AND role='counselor'`);
    if (!cR.recordset.length) return res.status(400).json({ message: 'Tổ chức của bạn chưa có tư vấn viên.' });

    await db.request()
      .input('org', sql.Int, me.org_id).input('uid', sql.Int, req.user.id)
      .input('content', sql.NVarChar, encryptField(content))
      .query(`INSERT INTO CounselingMessages (org_id, user_id, sender, content) VALUES (@org, @uid, 'user', @content)`);
    for (const c of cR.recordset) {
      createNotification(c.id, 'counseling', 'Tin nhắn tư vấn mới', `${me.full_name || 'Một thành viên'} vừa nhắn cho bạn`, 'counselor');
    }
    res.json({ message: 'Đã gửi.' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── Tư vấn viên ─────────────────────────────────────────────────────────────

// GET /api/counseling/c/overview — thông tin tổ chức + mood tổng hợp ẩn danh + danh sách hội thoại
router.get('/c/overview', counselorMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const [orgR, statR, threadR] = await Promise.all([
      db.request().input('org', sql.Int, req.orgId).query('SELECT id, name, org_type FROM Organizations WHERE id=@org'),
      db.request().input('org', sql.Int, req.orgId).query(`
        SELECT
          (SELECT COUNT(*) FROM Users WHERE org_id=@org AND role='user') AS member_count,
          COUNT(DISTINCT de.user_id) AS active_7d,
          AVG(CAST(de.mood_score AS FLOAT)) AS avg_mood_7d,
          COUNT(DISTINCT CASE WHEN de.mood_score <= 3 THEN de.user_id END) AS low_mood_members_7d
        FROM DiaryEntries de JOIN Users u ON u.id=de.user_id
        WHERE u.org_id=@org AND u.role='user' AND de.created_at >= DATEADD(DAY, -7, GETDATE())
      `),
      db.request().input('org', sql.Int, req.orgId).query(`
        SELECT t.user_id, u.full_name, u.username, t.last_at, t.unread,
               (SELECT TOP 1 content FROM CounselingMessages x
                WHERE x.org_id=@org AND x.user_id=t.user_id ORDER BY x.created_at DESC) AS last_content
        FROM (
          SELECT user_id, MAX(created_at) AS last_at,
                 SUM(CASE WHEN sender='user' AND is_read=0 THEN 1 ELSE 0 END) AS unread
          FROM CounselingMessages WHERE org_id=@org GROUP BY user_id
        ) t JOIN Users u ON u.id=t.user_id
        ORDER BY t.unread DESC, t.last_at DESC
      `),
    ]);
    const s = statR.recordset[0];
    // Đủ người mới hiện số liệu — ít quá thì "mood TB" gần như là mood của 1-2 người cụ thể
    const enough = s.active_7d >= MIN_AGGREGATE;
    res.json({
      org: orgR.recordset[0],
      stats: {
        member_count: s.member_count,
        active_7d: enough ? s.active_7d : null,
        avg_mood_7d: enough && s.avg_mood_7d ? Math.round(s.avg_mood_7d * 10) / 10 : null,
        low_mood_members_7d: enough ? s.low_mood_members_7d : null,
        min_aggregate: MIN_AGGREGATE,
      },
      threads: threadR.recordset.map(t => ({
        user_id: t.user_id, full_name: t.full_name, username: t.username, last_at: t.last_at, unread: t.unread,
        last_content: decryptField(t.last_content || '').slice(0, 80),
      })),
    });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// GET /api/counseling/c/threads/:uid — hội thoại với 1 thành viên (đánh dấu đã đọc)
router.get('/c/threads/:uid', counselorMiddleware, async (req, res) => {
  const uid = parseInt(req.params.uid);
  if (!uid) return res.status(400).json({ message: 'Thiếu người dùng.' });
  try {
    const db = await getPool();
    const r = await db.request().input('org', sql.Int, req.orgId).input('uid', sql.Int, uid).query(`
      SELECT m.id, m.sender, m.content, m.created_at, c.full_name AS counselor_name
      FROM CounselingMessages m LEFT JOIN Users c ON c.id=m.counselor_id
      WHERE m.org_id=@org AND m.user_id=@uid ORDER BY m.created_at
    `);
    if (!r.recordset.length) return res.status(404).json({ message: 'Không có hội thoại.' });
    const uR = await db.request().input('uid', sql.Int, uid).query('SELECT full_name, username FROM Users WHERE id=@uid');
    await db.request().input('org', sql.Int, req.orgId).input('uid', sql.Int, uid).query(`
      UPDATE CounselingMessages SET is_read=1 WHERE org_id=@org AND user_id=@uid AND sender='user' AND is_read=0
    `);
    res.json({ user: uR.recordset[0] || null, messages: mapMessages(r.recordset) });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// POST /api/counseling/c/threads/:uid — trả lời. Chỉ trả lời được người đã tự nhắn trước
// (tư vấn viên không chủ động nhắn ai — thành viên luôn là người mở lời).
router.post('/c/threads/:uid', counselorMiddleware, async (req, res) => {
  const uid = parseInt(req.params.uid);
  const content = cleanContent(req.body.content);
  if (!uid || !content) return res.status(400).json({ message: 'Tin nhắn phải từ 1 đến 2000 ký tự.' });
  try {
    const db = await getPool();
    const r = await db.request().input('org', sql.Int, req.orgId).input('uid', sql.Int, uid)
      .query(`SELECT TOP 1 id FROM CounselingMessages WHERE org_id=@org AND user_id=@uid AND sender='user'`);
    if (!r.recordset.length) return res.status(404).json({ message: 'Không có hội thoại.' });
    await db.request()
      .input('org', sql.Int, req.orgId).input('uid', sql.Int, uid).input('cid', sql.Int, req.user.id)
      .input('content', sql.NVarChar, encryptField(content))
      .query(`INSERT INTO CounselingMessages (org_id, user_id, sender, counselor_id, content)
              VALUES (@org, @uid, 'counselor', @cid, @content)`);
    createNotification(uid, 'counseling', 'Tư vấn viên đã trả lời bạn', content.slice(0, 100), 'counseling');
    res.json({ message: 'Đã gửi.' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── Admin ───────────────────────────────────────────────────────────────────

// GET /api/counseling/admin/orgs — tổ chức + số thành viên + tư vấn viên
router.get('/admin/orgs', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const [oR, cR] = await Promise.all([
      db.request().query(`
        SELECT o.id, o.name, o.org_type, o.created_at,
               (SELECT COUNT(*) FROM Users u WHERE u.org_id=o.id AND u.role='user') AS member_count
        FROM Organizations o ORDER BY o.name
      `),
      db.request().query(`SELECT id, username, email, full_name, org_id FROM Users WHERE role='counselor'`),
    ]);
    res.json({ orgs: oR.recordset.map(o => ({ ...o, counselors: cR.recordset.filter(c => c.org_id === o.id) })) });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// POST /api/counseling/admin/orgs — { name, org_type }
router.post('/admin/orgs', adminMiddleware, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const orgType = ORG_TYPES.includes(req.body.org_type) ? req.body.org_type : 'other';
  if (!name || name.length > 100) return res.status(400).json({ message: 'Tên tổ chức phải từ 1 đến 100 ký tự.' });
  try {
    const db = await getPool();
    const dup = await db.request().input('name', sql.NVarChar, name).query('SELECT id FROM Organizations WHERE name=@name');
    if (dup.recordset.length) return res.status(409).json({ message: 'Tổ chức này đã tồn tại.' });
    const r = await db.request().input('name', sql.NVarChar, name).input('type', sql.NVarChar, orgType)
      .query('INSERT INTO Organizations (name, org_type) OUTPUT INSERTED.id VALUES (@name, @type)');
    // User đã nhập đúng tên này trong hồ sơ từ trước → gắn luôn vào tổ chức
    const linked = await db.request().input('id', sql.Int, r.recordset[0].id).input('name', sql.NVarChar, name)
      .query(`UPDATE Users SET org_id=@id WHERE school_name=@name AND org_id IS NULL AND role='user'`);
    res.json({ message: `Đã tạo tổ chức, gắn ${linked.rowsAffected[0]} thành viên có sẵn.`, id: r.recordset[0].id });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// DELETE /api/counseling/admin/orgs/:id — xoá tổ chức; tư vấn viên của tổ chức trở về user thường
router.delete('/admin/orgs/:id', adminMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'Thiếu tổ chức.' });
  try {
    const db = await getPool();
    await db.request().input('id', sql.Int, id).query(`
      DELETE FROM CounselingMessages WHERE org_id=@id;
      UPDATE Users SET role='user' WHERE org_id=@id AND role='counselor';
      DELETE FROM Organizations WHERE id=@id;
    `);
    res.json({ message: 'Đã xoá tổ chức.' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// POST /api/counseling/admin/counselors — cấp tài khoản tư vấn viên { org_id, username, email, password, full_name }
router.post('/admin/counselors', adminMiddleware, async (req, res) => {
  const { org_id, username, email, password, full_name } = req.body;
  const orgId = parseInt(org_id);
  if (!orgId || !username || !email || !password || !full_name)
    return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin.' });
  if (String(password).length < 6) return res.status(400).json({ message: 'Mật khẩu phải ít nhất 6 ký tự.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Email không hợp lệ.' });
  try {
    const db = await getPool();
    const org = await db.request().input('id', sql.Int, orgId).query('SELECT name FROM Organizations WHERE id=@id');
    if (!org.recordset.length) return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });
    const dup = await db.request().input('u', sql.NVarChar, username).input('e', sql.NVarChar, email)
      .query('SELECT id FROM Users WHERE username=@u OR email=@e');
    if (dup.recordset.length) return res.status(409).json({ message: 'Tên đăng nhập hoặc email đã được sử dụng.' });
    const hashed = await bcrypt.hash(String(password), 12);
    await db.request()
      .input('u', sql.NVarChar, username).input('e', sql.NVarChar, email).input('p', sql.NVarChar, hashed)
      .input('n', sql.NVarChar, full_name).input('a', sql.NVarChar, String(full_name).substring(0, 2).toUpperCase())
      .input('org', sql.Int, orgId).input('school', sql.NVarChar, org.recordset[0].name)
      .query(`INSERT INTO Users (username, email, password, full_name, avatar_text, role, org_id, school_name)
              VALUES (@u, @e, @p, @n, @a, 'counselor', @org, @school)`);
    res.json({ message: 'Đã cấp tài khoản tư vấn viên.' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// DELETE /api/counseling/admin/counselors/:id — thu hồi quyền tư vấn viên (tài khoản về user thường)
router.delete('/admin/counselors/:id', adminMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.request().input('id', sql.Int, parseInt(req.params.id))
      .query(`UPDATE Users SET role='user' WHERE id=@id AND role='counselor'`);
    res.json({ message: 'Đã thu hồi quyền tư vấn viên.' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

module.exports = router;
