const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');
const authMiddleware = require('../middleware/auth');

// Cache ngày — reset tự động vì key là ngày hiện tại (YYYY-MM-DD)
const _quoteCache = {};

router.use(authMiddleware);

// GET /api/quotes/today — câu cảm hứng trong ngày, cache 1 lần/ngày
router.get('/today', async (req, res) => {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    if (_quoteCache[todayKey]) return res.json({ quote: _quoteCache[todayKey] });

    const db    = await getPool();
    const total = await db.request().query('SELECT COUNT(*) as n FROM Quotes');
    const count = total.recordset[0].n;
    if (!count) return res.json({ quote: null });

    const now       = new Date();
    const start     = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);
    const rowNum    = (dayOfYear % count) + 1;

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
    const quote = r.recordset[0] || null;
    if (quote) _quoteCache[todayKey] = quote;
    // Xóa cache ngày cũ
    Object.keys(_quoteCache).forEach(k => { if (k !== todayKey) delete _quoteCache[k]; });
    res.json({ quote });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
