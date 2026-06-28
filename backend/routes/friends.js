// routes/friends.js — Streak bạn bè
const express       = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/friends — danh sách bạn bè đã chấp nhận + streak của họ
router.get('/', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT
          f.id AS friendship_id,
          u.id, u.username, u.full_name, u.avatar_text, u.avatar_url,
          u.streak, u.max_streak,
          u.last_entry,
          CASE WHEN u.last_entry >= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS wrote_today
        FROM Friendships f
        JOIN Users u ON u.id = CASE WHEN f.user_id=@uid THEN f.friend_id ELSE f.user_id END
        WHERE (f.user_id=@uid OR f.friend_id=@uid) AND f.[status]='accepted'
        ORDER BY u.streak DESC, u.username
      `);
    res.json({ friends: r.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// GET /api/friends/requests — lời mời đang chờ (gửi đến mình)
router.get('/requests', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT f.id AS friendship_id, u.id, u.username, u.full_name, u.avatar_text, u.avatar_url, f.created_at
        FROM Friendships f
        JOIN Users u ON u.id = f.user_id
        WHERE f.friend_id=@uid AND f.[status]='pending'
        ORDER BY f.created_at DESC
      `);
    res.json({ requests: r.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// POST /api/friends/request — gửi lời mời kết bạn theo username
router.post('/request', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: 'Thiếu username.' });

    const db = await getPool();

    // Tìm user mục tiêu
    const target = await db.request()
      .input('un', sql.NVarChar, username.trim())
      .query(`SELECT id FROM Users WHERE username=@un`);
    if (!target.recordset.length)
      return res.status(404).json({ message: 'Không tìm thấy người dùng này.' });

    const friendId = target.recordset[0].id;
    if (friendId === req.user.id)
      return res.status(400).json({ message: 'Không thể kết bạn với chính mình.' });

    // Kiểm tra đã tồn tại chưa (cả 2 chiều)
    const exist = await db.request()
      .input('a', sql.Int, req.user.id)
      .input('b', sql.Int, friendId)
      .query(`
        SELECT id, [status] FROM Friendships
        WHERE (user_id=@a AND friend_id=@b) OR (user_id=@b AND friend_id=@a)
      `);
    if (exist.recordset.length) {
      const s = exist.recordset[0].status;
      if (s === 'accepted') return res.status(409).json({ message: 'Đã là bạn bè rồi.' });
      if (s === 'pending')  return res.status(409).json({ message: 'Đã gửi lời mời rồi, đang chờ xác nhận.' });
    }

    await db.request()
      .input('uid', sql.Int, req.user.id)
      .input('fid', sql.Int, friendId)
      .query(`INSERT INTO Friendships(user_id, friend_id, [status]) VALUES(@uid, @fid, 'pending')`);

    res.json({ message: 'Đã gửi lời mời kết bạn!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// PUT /api/friends/:id/accept — chấp nhận lời mời
router.put('/:id/accept', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query(`
        UPDATE Friendships SET [status]='accepted'
        WHERE id=@id AND friend_id=@uid AND [status]='pending'
      `);
    if (!r.rowsAffected[0])
      return res.status(404).json({ message: 'Không tìm thấy lời mời.' });
    res.json({ message: 'Đã chấp nhận lời mời kết bạn!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// DELETE /api/friends/:id — xóa bạn hoặc từ chối lời mời
router.delete('/:id', async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query(`
        DELETE FROM Friendships
        WHERE id=@id AND (user_id=@uid OR friend_id=@uid)
      `);
    res.json({ message: 'Đã xóa.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
