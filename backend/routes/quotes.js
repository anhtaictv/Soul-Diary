const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/quotes/today — câu truyền cảm hứng trong ngày (xoay vòng theo ngày trong năm)
router.get('/today', async (req, res) => {
  try {
    const db    = await getPool();
    const total = await db.request().query('SELECT COUNT(*) as n FROM Quotes');
    const count = total.recordset[0].n;
    if (!count) return res.json({ quote: null });

    const now      = new Date();
    const start    = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);
    const rowNum   = (dayOfYear % count) + 1;

    const r = await db.request()
      .input('rn', rowNum)
      .query(`
        SELECT [text], author, category
        FROM (
          SELECT [text], author, category, ROW_NUMBER() OVER (ORDER BY id) AS rn
          FROM Quotes
        ) t
        WHERE rn = @rn
      `);
    res.json({ quote: r.recordset[0] || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
