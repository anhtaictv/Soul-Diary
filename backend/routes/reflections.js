// routes/reflections.js — Phản tư cuối tuần (v2.4)
const express        = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Tính ngày Thứ Hai của tuần chứa ngày đầu vào (ISO week start)
function getWeekStart(date = new Date()) {
  const d   = new Date(date);
  const day = d.getUTCDay(); // 0=CN, 1=T2...
  const diff = (day === 0) ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// GET /api/reflections/current — trạng thái tuần này
router.get('/current', async (req, res) => {
  try {
    const db        = await getPool();
    const weekStart = getWeekStart();
    const r = await db.request()
      .input('uid',  sql.Int,  req.user.id)
      .input('week', sql.Date, weekStart)
      .query(`SELECT id, q1,q2,q3,q4,q5, created_at FROM WeeklyReflections WHERE user_id=@uid AND week_start=@week`);
    res.json({ weekStart, reflection: r.recordset[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// GET /api/reflections — lịch sử phản tư (10 tuần gần nhất)
router.get('/', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT TOP 10 id, week_start, q1,q2,q3,q4,q5, created_at
        FROM WeeklyReflections
        WHERE user_id=@uid
        ORDER BY week_start DESC
      `);
    res.json({ reflections: r.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// POST /api/reflections — lưu phản tư tuần (upsert)
router.post('/', async (req, res) => {
  try {
    const { q1, q2, q3, q4, q5, week_start } = req.body;
    const weekStart = week_start || getWeekStart();

    const db = await getPool();
    await db.request()
      .input('uid',  sql.Int,          req.user.id)
      .input('week', sql.Date,         weekStart)
      .input('q1',   sql.NVarChar,     q1 || null)
      .input('q2',   sql.NVarChar,     q2 || null)
      .input('q3',   sql.NVarChar,     q3 || null)
      .input('q4',   sql.NVarChar,     q4 || null)
      .input('q5',   sql.NVarChar,     q5 || null)
      .query(`
        MERGE WeeklyReflections AS target
        USING (SELECT @uid AS user_id, @week AS week_start) AS source
          ON target.user_id=source.user_id AND target.week_start=source.week_start
        WHEN MATCHED THEN
          UPDATE SET q1=@q1, q2=@q2, q3=@q3, q4=@q4, q5=@q5
        WHEN NOT MATCHED THEN
          INSERT (user_id, week_start, q1, q2, q3, q4, q5)
          VALUES (@uid, @week, @q1, @q2, @q3, @q4, @q5);
      `);
    res.json({ message: 'Đã lưu phản tư tuần!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
