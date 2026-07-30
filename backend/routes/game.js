// routes/game.js — Mini game: nộp điểm + bảng xếp hạng, dùng chung cho nhiều game (v3.7)
const express          = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const VALID_GAMES = ['catmouse', 'snake', '2048', 'caro', 'flappy'];

// GET /api/game/:gameKey/leaderboard — top 20 điểm cao nhất của 1 game, hiển thị tên thật
router.get('/:gameKey/leaderboard', async (req, res) => {
  try {
    const { gameKey } = req.params;
    if (!VALID_GAMES.includes(gameKey)) return res.status(400).json({ message: 'Game không hợp lệ.' });

    const db = await getPool();
    const r = await db.request()
      .input('gk', sql.NVarChar, gameKey)
      .query(`
        SELECT TOP 20 u.id AS user_id, ISNULL(u.full_name, u.username) AS display_name, g.best_score
        FROM UserGameScores g
        JOIN Users u ON u.id = g.user_id
        WHERE g.game_key = @gk
        ORDER BY g.best_score DESC, g.updated_at ASC
      `);
    res.json({ leaderboard: r.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// POST /api/game/:gameKey/score — nộp điểm, chỉ cập nhật nếu là điểm cao mới
router.post('/:gameKey/score', async (req, res) => {
  try {
    const { gameKey } = req.params;
    if (!VALID_GAMES.includes(gameKey)) return res.status(400).json({ message: 'Game không hợp lệ.' });

    const score = parseInt(req.body.score, 10);
    if (!Number.isFinite(score) || score < 0 || score > 1000000) {
      return res.status(400).json({ message: 'Điểm không hợp lệ.' });
    }

    const db = await getPool();
    await db.request()
      .input('uid',   sql.Int, req.user.id)
      .input('gk',    sql.NVarChar, gameKey)
      .input('score', sql.Int, score)
      .query(`
        MERGE UserGameScores AS target
        USING (SELECT @uid AS user_id, @gk AS game_key, @score AS score) AS src
        ON target.user_id = src.user_id AND target.game_key = src.game_key
        WHEN MATCHED AND src.score > target.best_score THEN
          UPDATE SET best_score = src.score, updated_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (user_id, game_key, best_score) VALUES (src.user_id, src.game_key, src.score);
      `);

    const r = await db.request()
      .input('uid', sql.Int, req.user.id)
      .input('gk',  sql.NVarChar, gameKey)
      .query(`SELECT best_score FROM UserGameScores WHERE user_id=@uid AND game_key=@gk`);
    res.json({ best_score: r.recordset[0].best_score });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
