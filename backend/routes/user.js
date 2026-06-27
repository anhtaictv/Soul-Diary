const express        = require('express');
const router         = express.Router();
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/user/export — xuất toàn bộ dữ liệu người dùng
router.get('/export', async (req, res) => {
  try {
    const db  = await getPool();
    const uid = req.user.id;

    const [userR, entriesR, checkinsR, lettersR, goalsR] = await Promise.all([
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, username, email, fullname, created_at, streak, max_streak FROM Users WHERE id = @uid'),
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, mood_score, event_text, thoughts, gratitude, tags, created_at FROM DiaryEntries WHERE user_id = @uid ORDER BY created_at DESC'),
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, year, week_number, results, created_at FROM CheckIns WHERE user_id = @uid ORDER BY created_at DESC'),
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, title, send_date, sent, created_at FROM FutureLetters WHERE user_id = @uid ORDER BY send_date'),
      db.request().input('uid', sql.Int, uid)
        .query('SELECT id, title, goal_type, target, current_value, completed, created_at FROM Goals WHERE user_id = @uid ORDER BY created_at DESC'),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      version: 'v2.0',
      user:     userR.recordset[0],
      diary:    entriesR.recordset,
      checkins: checkinsR.recordset,
      future_letters: lettersR.recordset,
      goals:    goalsR.recordset,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      `attachment; filename="souldiary-export-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(exportData);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
