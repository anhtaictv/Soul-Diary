// routes/study.js — Lịch Học tập (v1.8)
const express = require('express');
const { getPool, sql } = require('../db');
const authMiddleware  = require('../middleware/auth');

const router = express.Router();

// ── GET /api/study — danh sách sự kiện ───────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = await getPool();
    let q = `SELECT id, title, event_type, event_date, notes, is_done, created_at
             FROM StudyEvents WHERE user_id=@uid`;
    if (from) q += ` AND event_date >= @from`;
    if (to)   q += ` AND event_date <= @to`;
    q += ` ORDER BY event_date ASC`;
    const req2 = db.request().input('uid', sql.Int, req.user.id);
    if (from) req2.input('from', sql.Date, from);
    if (to)   req2.input('to',   sql.Date, to);
    const result = await req2.query(q);
    res.json({ events: result.recordset });
  } catch (err) {
    console.error('Study GET error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/study/upcoming — 7 sự kiện sắp tới (cho dashboard) ──────────
router.get('/upcoming', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT TOP 5 id, title, event_type, event_date, is_done
        FROM StudyEvents
        WHERE user_id=@uid AND event_date >= CAST(GETDATE() AS DATE) AND is_done=0
        ORDER BY event_date ASC
      `);
    res.json({ events: result.recordset });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/study — tạo sự kiện ────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, event_type, event_date, notes } = req.body;
    if (!title || !event_date)
      return res.status(400).json({ message: 'Tiêu đề và ngày là bắt buộc.' });
    const validTypes = ['exam', 'deadline', 'assignment', 'other'];
    const type = validTypes.includes(event_type) ? event_type : 'other';
    const db = await getPool();
    const r = await db.request()
      .input('uid',   sql.Int,      req.user.id)
      .input('title', sql.NVarChar, title.slice(0, 200))
      .input('type',  sql.NVarChar, type)
      .input('date',  sql.Date,     event_date)
      .input('notes', sql.NVarChar, (notes || '').slice(0, 500))
      .query(`
        INSERT INTO StudyEvents (user_id, title, event_type, event_date, notes)
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.event_type, INSERTED.event_date, INSERTED.is_done
        VALUES (@uid, @title, @type, @date, @notes)
      `);
    res.status(201).json({ event: r.recordset[0] });
  } catch (err) {
    console.error('Study POST error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PATCH /api/study/:id/done — đánh dấu hoàn thành ─────────────────────
router.patch('/:id/done', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query('UPDATE StudyEvents SET is_done = 1 WHERE id=@id AND user_id=@uid');
    res.json({ message: 'Đã đánh dấu hoàn thành.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── DELETE /api/study/:id — xóa sự kiện ──────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id',  sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.id)
      .query('DELETE FROM StudyEvents WHERE id=@id AND user_id=@uid');
    res.json({ message: 'Đã xóa.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
