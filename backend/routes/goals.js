// routes/goals.js — Mục tiêu Cá nhân (v1.8)
const express = require('express');
const { getPool, sql } = require('../db');
const authMiddleware  = require('../middleware/auth');

const router = express.Router();

// ── GET /api/goals — danh sách mục tiêu + tiến độ hiện tại ───────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db     = await getPool();
    const goals  = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query('SELECT * FROM PersonalGoals WHERE user_id=@uid AND is_active=1 ORDER BY created_at DESC');

    // Lấy dữ liệu để tính tiến độ
    const user = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query('SELECT streak, max_streak FROM Users WHERE id=@uid');
    const { streak } = user.recordset[0] || { streak: 0 };

    const result = await Promise.all(goals.recordset.map(async g => {
      let current = 0;
      if (g.goal_type === 'streak') {
        current = streak;
      } else if (g.goal_type === 'mood_avg') {
        const r = await db.request()
          .input('uid',  sql.Int, req.user.id)
          .input('days', sql.Int, g.period_days)
          .query(`
            SELECT AVG(CAST(mood_score AS FLOAT)) AS avg_mood
            FROM DiaryEntries
            WHERE user_id=@uid AND created_at >= DATEADD(DAY,-@days,GETDATE())
          `);
        current = r.recordset[0].avg_mood ? Math.round(r.recordset[0].avg_mood * 10) / 10 : 0;
      } else if (g.goal_type === 'entries') {
        const r = await db.request()
          .input('uid',  sql.Int, req.user.id)
          .input('days', sql.Int, g.period_days)
          .query(`
            SELECT COUNT(*) AS cnt FROM DiaryEntries
            WHERE user_id=@uid AND created_at >= DATEADD(DAY,-@days,GETDATE())
          `);
        current = r.recordset[0].cnt;
      }
      const pct = Math.min(100, Math.round((current / g.target_value) * 100));
      return { ...g, current, pct };
    }));

    res.json({ goals: result });
  } catch (err) {
    console.error('Goals GET error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/goals — tạo mục tiêu ────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, goal_type, target_value, period_days } = req.body;
    const validTypes = ['mood_avg', 'streak', 'entries'];
    if (!title || !validTypes.includes(goal_type) || !target_value)
      return res.status(400).json({ message: 'Thông tin không hợp lệ.' });
    if (goal_type === 'mood_avg' && (target_value < 1 || target_value > 10))
      return res.status(400).json({ message: 'Mood trung bình phải từ 1-10.' });

    const db = await getPool();
    const r  = await db.request()
      .input('uid',     sql.Int,      req.user.id)
      .input('title',   sql.NVarChar, title.slice(0, 200))
      .input('type',    sql.NVarChar, goal_type)
      .input('target',  sql.Float,    parseFloat(target_value))
      .input('period',  sql.Int,      parseInt(period_days) || 30)
      .query(`
        INSERT INTO PersonalGoals (user_id,title,goal_type,target_value,period_days)
        OUTPUT INSERTED.*
        VALUES (@uid,@title,@type,@target,@period)
      `);
    res.status(201).json({ goal: r.recordset[0] });
  } catch (err) {
    console.error('Goals POST error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── DELETE /api/goals/:id ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query('UPDATE PersonalGoals SET is_active=0 WHERE id=@id AND user_id=@uid');
    res.json({ message: 'Đã xóa mục tiêu.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
