const express        = require('express');
const router         = express.Router();
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/letters
router.get('/', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT id, title, LEFT(content, 200) AS preview,
               send_date, sent, created_at
        FROM FutureLetters
        WHERE user_id = @uid
        ORDER BY send_date ASC
      `);
    res.json({ letters: result.recordset });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/letters
router.post('/', async (req, res) => {
  const { title, content, send_date } = req.body;
  if (!title || !content || !send_date)
    return res.status(400).json({ message: 'Thiếu thông tin.' });
  if (new Date(send_date) <= new Date())
    return res.status(400).json({ message: 'Ngày gửi phải là ngày trong tương lai.' });
  try {
    const db = await getPool();
    const result = await db.request()
      .input('uid',       sql.Int,      req.user.id)
      .input('title',     sql.NVarChar, title.slice(0, 200))
      .input('content',   sql.NVarChar, content)
      .input('send_date', sql.Date,     send_date)
      .query(`
        INSERT INTO FutureLetters (user_id, title, content, send_date)
        OUTPUT INSERTED.id
        VALUES (@uid, @title, @content, @send_date)
      `);
    res.json({ id: result.recordset[0].id, ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/letters/:id
router.delete('/:id', async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('id',  sql.Int, parseInt(req.params.id))
      .input('uid', sql.Int, req.user.id)
      .query('DELETE FROM FutureLetters WHERE id = @id AND user_id = @uid');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
