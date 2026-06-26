// routes/challenges.js — Thử thách Sức khỏe Tâm thần
const express        = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET / — danh sách challenges + trạng thái của user hiện tại
router.get('/', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT c.id, c.slug, c.title, c.description, c.duration_days,
               c.category, c.tasks_json, c.badge_emoji,
               uc.current_day, uc.is_completed, uc.started_at, uc.last_checkin_at,
               CASE WHEN uc.id IS NOT NULL THEN 1 ELSE 0 END AS is_joined
        FROM Challenges c
        LEFT JOIN UserChallenges uc ON uc.challenge_id = c.id AND uc.user_id = @uid
        WHERE c.is_active = 1
        ORDER BY c.sort_order
      `);
    res.json({ challenges: result.recordset });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /:id/join — tham gia thử thách (hoặc làm lại nếu đã hoàn thành)
router.post('/:id/join', async (req, res) => {
  try {
    const db  = await getPool();
    const cid = parseInt(req.params.id);
    const ch  = await db.request().input('id', sql.Int, cid)
      .query('SELECT id FROM Challenges WHERE id=@id AND is_active=1');
    if (!ch.recordset.length) return res.status(404).json({ error: 'Không tìm thấy thử thách.' });

    const existing = await db.request()
      .input('uid', sql.Int, req.user.id)
      .input('cid', sql.Int, cid)
      .query('SELECT id, is_completed FROM UserChallenges WHERE user_id=@uid AND challenge_id=@cid');

    if (existing.recordset.length > 0) {
      if (!existing.recordset[0].is_completed)
        return res.status(400).json({ error: 'Bạn đang thực hiện thử thách này rồi!' });
      // Reset để làm lại
      await db.request()
        .input('uid', sql.Int, req.user.id)
        .input('cid', sql.Int, cid)
        .query(`UPDATE UserChallenges
                SET current_day=0, is_completed=0, completed_at=NULL,
                    started_at=GETDATE(), last_checkin_at=NULL
                WHERE user_id=@uid AND challenge_id=@cid`);
    } else {
      await db.request()
        .input('uid', sql.Int, req.user.id)
        .input('cid', sql.Int, cid)
        .query('INSERT INTO UserChallenges (user_id, challenge_id) VALUES (@uid, @cid)');
    }
    res.json({ message: 'Đã tham gia thử thách!' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /:id/checkin — check-in ngày hôm nay (1 lần/ngày)
router.post('/:id/checkin', async (req, res) => {
  try {
    const db  = await getPool();
    const cid = parseInt(req.params.id);
    const ucRes = await db.request()
      .input('uid', sql.Int, req.user.id)
      .input('cid', sql.Int, cid)
      .query(`SELECT uc.*, c.duration_days
              FROM UserChallenges uc
              JOIN Challenges c ON c.id = uc.challenge_id
              WHERE uc.user_id=@uid AND uc.challenge_id=@cid`);

    if (!ucRes.recordset.length)
      return res.status(404).json({ error: 'Bạn chưa tham gia thử thách này.' });
    const uc = ucRes.recordset[0];
    if (uc.is_completed)
      return res.status(400).json({ error: 'Thử thách đã hoàn thành!' });

    // Kiểm tra đã check-in hôm nay chưa (theo múi giờ VN UTC+7)
    if (uc.last_checkin_at) {
      const vnToday = new Date(Date.now() + 7 * 3600000);
      const vnLast  = new Date(new Date(uc.last_checkin_at).getTime() + 7 * 3600000);
      if (vnToday.toDateString() === vnLast.toDateString())
        return res.status(400).json({ error: 'Hôm nay bạn đã check-in rồi! Quay lại ngày mai nhé 🌱' });
    }

    const newDay   = uc.current_day + 1;
    const completed = newDay >= uc.duration_days;
    await db.request()
      .input('uid',       sql.Int,       req.user.id)
      .input('cid',       sql.Int,       cid)
      .input('day',       sql.Int,       newDay)
      .input('completed', sql.Bit,       completed ? 1 : 0)
      .input('now',       sql.DateTime2, new Date())
      .query(`UPDATE UserChallenges
              SET current_day=@day, last_checkin_at=@now,
                  is_completed=@completed,
                  completed_at = CASE WHEN @completed=1 THEN @now ELSE NULL END
              WHERE user_id=@uid AND challenge_id=@cid`);

    res.json({
      current_day: newDay,
      completed,
      message: completed
        ? '🎉 Chúc mừng bạn đã hoàn thành thử thách!'
        : `✅ Check-in ngày ${newDay} thành công!`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /:id/quit — bỏ thử thách đang tham gia
router.delete('/:id/quit', async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('uid', sql.Int, req.user.id)
      .input('cid', sql.Int, parseInt(req.params.id))
      .query('DELETE FROM UserChallenges WHERE user_id=@uid AND challenge_id=@cid AND is_completed=0');
    res.json({ message: 'Đã rời khỏi thử thách.' });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
