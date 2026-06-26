// routes/courses.js — Mini Courses (v1.8)
const express = require('express');
const { getPool, sql } = require('../db');
const authMiddleware  = require('../middleware/auth');

const router = express.Router();

// ── GET /api/courses — danh sách khóa học + tiến độ user ─────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const courses = await db.request().query(`
      SELECT id, slug, title, description, lessons_json, badge_emoji, category, duration_min, sort_order
      FROM MiniCourses WHERE is_active=1 ORDER BY sort_order ASC
    `);
    const progress = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query('SELECT course_id, lesson_index, completed_at FROM UserCourseProgress WHERE user_id=@uid');
    const progressMap = {};
    progress.recordset.forEach(p => { progressMap[p.course_id] = p; });

    const result = courses.recordset.map(c => {
      const lessons = JSON.parse(c.lessons_json || '[]');
      const prog    = progressMap[c.id];
      return {
        ...c,
        lesson_count:  lessons.length,
        lessons:       lessons.map((l, i) => ({ ...l, index: i })),
        lessons_json:  undefined,
        current_lesson: prog ? prog.lesson_index : 0,
        completed:      prog ? !!prog.completed_at : false,
        completed_at:   prog ? prog.completed_at  : null,
      };
    });
    res.json({ courses: result });
  } catch (err) {
    console.error('Courses GET error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/courses/:id/progress — cập nhật tiến độ ────────────────────
router.post('/:id/progress', authMiddleware, async (req, res) => {
  try {
    const courseId    = parseInt(req.params.id);
    const { lesson_index } = req.body;
    if (lesson_index === undefined || lesson_index < 0)
      return res.status(400).json({ message: 'lesson_index không hợp lệ.' });

    const db = await getPool();

    // Lấy tổng số bài để biết có hoàn thành chưa
    const c = await db.request().input('id', sql.Int, courseId)
      .query('SELECT lessons_json FROM MiniCourses WHERE id=@id');
    if (!c.recordset.length) return res.status(404).json({ message: 'Không tìm thấy khóa học.' });

    const lessons   = JSON.parse(c.recordset[0].lessons_json || '[]');
    const completed = lesson_index >= lessons.length;

    await db.request()
      .input('uid',        sql.Int,      req.user.id)
      .input('cid',        sql.Int,      courseId)
      .input('lesson',     sql.Int,      Math.min(lesson_index, lessons.length))
      .input('completed',  sql.DateTime2, completed ? new Date() : null)
      .query(`
        MERGE UserCourseProgress AS t
        USING (SELECT @uid AS user_id, @cid AS course_id) AS s
        ON t.user_id = s.user_id AND t.course_id = s.course_id
        WHEN MATCHED THEN
          UPDATE SET lesson_index=@lesson, completed_at=CASE WHEN @completed IS NOT NULL AND completed_at IS NULL THEN @completed ELSE completed_at END, updated_at=GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (user_id,course_id,lesson_index,completed_at) VALUES (@uid,@cid,@lesson,@completed);
      `);

    res.json({ lesson_index, completed });
  } catch (err) {
    console.error('Course progress error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
