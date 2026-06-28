// routes/habits.js — Habit Tracker (v2.5)
const express          = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/habits — danh sách habit + trạng thái hôm nay + streak 7 ngày
router.get('/', async (req, res) => {
  try {
    const db      = await getPool();
    const today   = new Date().toISOString().slice(0, 10);
    const ago7    = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

    const habits = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`SELECT id, name, icon, sort_order FROM Habits WHERE user_id=@uid ORDER BY sort_order, id`);

    if (!habits.recordset.length) return res.json({ habits: [] });

    const ids = habits.recordset.map(h => h.id).join(',');
    const logs = await db.request()
      .input('uid',   sql.Int,  req.user.id)
      .input('from7', sql.Date, ago7)
      .input('today', sql.Date, today)
      .query(`
        SELECT habit_id, CAST(log_date AS VARCHAR(10)) AS log_date
        FROM HabitLogs
        WHERE user_id=@uid AND log_date BETWEEN @from7 AND @today AND habit_id IN (${ids})
      `);

    const logSet = new Set(logs.recordset.map(l => `${l.habit_id}|${l.log_date}`));

    const result = habits.recordset.map(h => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        days.push({ date: d, done: logSet.has(`${h.id}|${d}`) });
      }
      const streak = (() => {
        let s = 0;
        for (let i = days.length - 1; i >= 0; i--) {
          if (days[i].done) s++; else break;
        }
        return s;
      })();
      return { ...h, days, streak, done_today: logSet.has(`${h.id}|${today}`) };
    });

    res.json({ habits: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// POST /api/habits — tạo habit mới
router.post('/', async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Tên thói quen không được để trống.' });
    if (name.length > 100)     return res.status(400).json({ message: 'Tên tối đa 100 ký tự.' });

    const db  = await getPool();
    const cnt = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`SELECT COUNT(*) AS c FROM Habits WHERE user_id=@uid`);
    if (cnt.recordset[0].c >= 5) return res.status(400).json({ message: 'Tối đa 5 thói quen.' });

    const r = await db.request()
      .input('uid',  sql.Int,          req.user.id)
      .input('name', sql.NVarChar(100), name.trim())
      .input('icon', sql.NVarChar(10),  icon || '✅')
      .query(`
        INSERT INTO Habits(user_id, name, icon)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.icon, INSERTED.sort_order
        VALUES(@uid, @name, @icon)
      `);
    res.json({ habit: r.recordset[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// DELETE /api/habits/:id
router.delete('/:id', async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query(`DELETE FROM Habits WHERE id=@id AND user_id=@uid`);
    res.json({ message: 'Đã xóa thói quen.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// POST /api/habits/:id/log — toggle check-in hôm nay
router.post('/:id/log', async (req, res) => {
  try {
    const db    = await getPool();
    const today = new Date().toISOString().slice(0, 10);

    // Kiểm tra habit thuộc user
    const habit = await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query(`SELECT id FROM Habits WHERE id=@id AND user_id=@uid`);
    if (!habit.recordset.length) return res.status(404).json({ message: 'Không tìm thấy thói quen.' });

    // Toggle: nếu đã log thì xóa, chưa log thì thêm
    const existing = await db.request()
      .input('hid',   sql.Int,  req.params.id)
      .input('uid',   sql.Int,  req.user.id)
      .input('today', sql.Date, today)
      .query(`SELECT id FROM HabitLogs WHERE habit_id=@hid AND user_id=@uid AND log_date=@today`);

    if (existing.recordset.length) {
      await db.request()
        .input('id', sql.Int, existing.recordset[0].id)
        .query(`DELETE FROM HabitLogs WHERE id=@id`);
      res.json({ done: false });
    } else {
      await db.request()
        .input('hid',   sql.Int,  req.params.id)
        .input('uid',   sql.Int,  req.user.id)
        .input('today', sql.Date, today)
        .query(`INSERT INTO HabitLogs(habit_id, user_id, log_date) VALUES(@hid, @uid, @today)`);
      res.json({ done: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
