// routes/diary-stats.js — Các route thống kê & báo cáo nhật ký
// Mount sau authMiddleware trong diary.js — không cần auth riêng.
const express    = require('express');
const { getPool, sql } = require('../db');
const { bufferToDataUri } = require('../utils/media');

const router = express.Router();

// ── GET /api/diary/patterns — xu hướng cảm xúc 90 ngày ─────────────────
router.get('/patterns', async (req, res) => {
  const DOW_VN = ['', 'Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  try {
    const db  = await getPool();
    const uid = req.user.id;
    const [dowR, monthR, overallR, tagR] = await Promise.all([
      db.request().input('uid', sql.Int, uid).query(`
        SELECT DATEPART(WEEKDAY, created_at) AS dow,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id = @uid AND created_at >= DATEADD(DAY, -90, GETDATE())
        GROUP BY DATEPART(WEEKDAY, created_at)
        ORDER BY dow
      `),
      db.request().input('uid', sql.Int, uid).query(`
        SELECT FORMAT(created_at, 'yyyy-MM') AS month,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id = @uid AND created_at >= DATEADD(MONTH, -3, GETDATE())
        GROUP BY FORMAT(created_at, 'yyyy-MM')
        ORDER BY month
      `),
      db.request().input('uid', sql.Int, uid).query(`
        SELECT COUNT(*) AS total,
               AVG(CAST(mood_score AS FLOAT)) AS overall_avg,
               MIN(mood_score) AS min_mood, MAX(mood_score) AS max_mood
        FROM DiaryEntries WHERE user_id = @uid
      `),
      db.request().input('uid', sql.Int, uid).query(`
        SELECT TOP 5 tags, COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id = @uid AND tags IS NOT NULL AND tags != ''
        GROUP BY tags ORDER BY cnt DESC
      `),
    ]);
    const byDow = dowR.recordset;
    const best  = byDow.length ? [...byDow].sort((a,b) => b.avg_mood - a.avg_mood)[0] : null;
    const worst = byDow.length ? [...byDow].sort((a,b) => a.avg_mood - b.avg_mood)[0] : null;
    const stats = overallR.recordset[0] || {};
    res.json({
      best_day:    best  ? { label: DOW_VN[best.dow],  avg: +best.avg_mood.toFixed(1)  } : null,
      worst_day:   worst ? { label: DOW_VN[worst.dow], avg: +worst.avg_mood.toFixed(1) } : null,
      by_dow:      byDow.map(r => ({ label: DOW_VN[r.dow], avg: +r.avg_mood.toFixed(1), cnt: r.cnt })),
      monthly:     monthR.recordset.map(r => ({ month: r.month, avg: +r.avg_mood.toFixed(1), cnt: r.cnt })),
      total:       stats.total || 0,
      overall_avg: stats.overall_avg ? +stats.overall_avg.toFixed(1) : null,
      top_tags:    tagR.recordset,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/diary/stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const days = Math.min(90, parseInt(req.query.days) || 14);
    const db   = await getPool();
    const result = await db.request()
      .input('user_id', sql.Int, req.user.id)
      .input('days',    sql.Int, days)
      .query(`
        SELECT CAST(created_at AS DATE) AS entry_date,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               MAX(mood_score) AS max_mood,
               MIN(mood_score) AS min_mood,
               COUNT(*) AS entry_count,
               STRING_AGG(tags, '|') AS all_tags
        FROM DiaryEntries
        WHERE user_id = @user_id AND created_at >= DATEADD(DAY, -@days, GETDATE())
        GROUP BY CAST(created_at AS DATE)
        ORDER BY entry_date ASC
      `);
    res.json({ stats: result.recordset });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/calendar?month=YYYY-MM ───────────────────────────────
router.get('/calendar', async (req, res) => {
  try {
    const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : null;
    const now   = new Date();
    const year  = m ? parseInt(m.slice(0,4)) : now.getFullYear();
    const month = m ? parseInt(m.slice(5,7)) - 1 : now.getMonth();
    const start = new Date(year, month, 1);
    const end   = new Date(year, month + 1, 1);
    const monthLabel = `${year}-${String(month+1).padStart(2,'0')}`;
    const db = await getPool();
    const result = await db.request()
      .input('user_id', sql.Int,      req.user.id)
      .input('start',   sql.DateTime, start)
      .input('end',     sql.DateTime, end)
      .query(`
        SELECT CAST(created_at AS DATE) AS entry_date,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               COUNT(*) AS entry_count
        FROM DiaryEntries
        WHERE user_id = @user_id AND created_at >= @start AND created_at < @end
        GROUP BY CAST(created_at AS DATE)
        ORDER BY entry_date ASC
      `);
    res.json({ month: monthLabel, days: result.recordset });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/heatmap?year=YYYY ────────────────────────────────────
router.get('/heatmap', async (req, res) => {
  try {
    const db   = await getPool();
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const result = await db.request()
      .input('uid',   sql.Int,  req.user.id)
      .input('start', sql.Date, `${year}-01-01`)
      .input('end',   sql.Date, `${year + 1}-01-01`)
      .query(`
        SELECT CAST(created_at AS DATE) AS entry_date,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               COUNT(*) AS entry_count
        FROM DiaryEntries
        WHERE user_id = @uid AND created_at >= @start AND created_at < @end
        GROUP BY CAST(created_at AS DATE)
        ORDER BY entry_date
      `);
    res.json({ year, days: result.recordset });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// ── GET /api/diary/mental-health — 4 chỉ số sức khỏe tâm thần ──────────
router.get('/mental-health', async (req, res) => {
  try {
    const db  = await getPool();
    const uid = req.user.id;
    const [emotionRes, dayRes, themeRes, trendRes] = await Promise.all([
      db.request().input('user_id', sql.Int, uid).query(`
        SELECT TOP 30 ai_emotion, tags FROM DiaryEntries
        WHERE user_id = @user_id AND created_at >= DATEADD(DAY, -30, GETDATE())
        ORDER BY created_at DESC
      `),
      db.request().input('user_id', sql.Int, uid).query(`
        SELECT DATEPART(WEEKDAY, created_at) AS dow,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
               COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id = @user_id AND created_at >= DATEADD(DAY, -60, GETDATE())
        GROUP BY DATEPART(WEEKDAY, created_at)
        HAVING COUNT(*) >= 2
        ORDER BY avg_mood ASC
      `),
      db.request().input('user_id', sql.Int, uid).query(`
        SELECT TOP 20 ai_emotion, tags FROM DiaryEntries
        WHERE user_id = @user_id AND mood_score <= 5
          AND created_at >= DATEADD(DAY, -30, GETDATE())
        ORDER BY created_at DESC
      `),
      db.request().input('user_id', sql.Int, uid).query(`
        SELECT
          SUM(CASE WHEN created_at >= DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE()),0) THEN CAST(mood_score AS FLOAT) ELSE 0 END) AS this_sum,
          SUM(CASE WHEN created_at >= DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE()),0) THEN 1 ELSE 0 END) AS this_cnt,
          SUM(CASE WHEN created_at < DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE()),0)
                    AND created_at >= DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE())-1,0) THEN CAST(mood_score AS FLOAT) ELSE 0 END) AS last_sum,
          SUM(CASE WHEN created_at < DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE()),0)
                    AND created_at >= DATEADD(MONTH,DATEDIFF(MONTH,0,GETDATE())-1,0) THEN 1 ELSE 0 END) AS last_cnt
        FROM DiaryEntries WHERE user_id = @user_id
      `),
    ]);

    const emotionCount = {};
    for (const row of emotionRes.recordset) {
      if (row.ai_emotion) {
        try {
          const ae = JSON.parse(row.ai_emotion);
          if (ae.emotions) ae.emotions.forEach(e => { emotionCount[e.name] = (emotionCount[e.name] || 0) + e.percent; });
        } catch {}
      } else if (row.tags) {
        row.tags.split('|').filter(Boolean).forEach(t => { emotionCount[t] = (emotionCount[t] || 0) + 1; });
      }
    }
    const topEmotion = Object.entries(emotionCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

    const DOW = ['','Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
    const stressDay = dayRes.recordset[0] ? DOW[dayRes.recordset[0].dow] : null;

    const themeCount = {};
    for (const row of themeRes.recordset) {
      if (row.ai_emotion) {
        try {
          const ae = JSON.parse(row.ai_emotion);
          if (ae.themes) ae.themes.forEach(t => { themeCount[t] = (themeCount[t]||0)+1; });
        } catch {}
      }
      if (row.tags) row.tags.split('|').filter(Boolean).forEach(t => { themeCount[t] = (themeCount[t]||0)+1; });
    }
    const topTheme = Object.entries(themeCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

    const tr = trendRes.recordset[0];
    const thisAvg = tr.this_cnt > 0 ? tr.this_sum / tr.this_cnt : null;
    const lastAvg = tr.last_cnt > 0 ? tr.last_sum / tr.last_cnt : null;
    let monthTrend = null;
    if (thisAvg !== null && lastAvg !== null) {
      const diff = thisAvg - lastAvg;
      monthTrend = { this: +thisAvg.toFixed(1), last: +lastAvg.toFixed(1), diff: +diff.toFixed(1) };
    }
    res.json({ topEmotion, stressDay, topTheme, monthTrend });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/emotion-radar ─────────────────────────────────────────
router.get('/emotion-radar', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request().input('uid', sql.Int, req.user.id).query(`
      SELECT TOP 30 ai_emotion FROM DiaryEntries
      WHERE user_id=@uid AND ai_emotion IS NOT NULL ORDER BY created_at DESC
    `);
    const totals = {};
    let entryCount = 0;
    for (const row of r.recordset) {
      try {
        const data = JSON.parse(row.ai_emotion);
        if (Array.isArray(data.emotions)) {
          entryCount++;
          for (const em of data.emotions)
            if (em.name && em.percent > 0) totals[em.name] = (totals[em.name] || 0) + em.percent;
        }
      } catch {}
    }
    const emotions = Object.entries(totals)
      .map(([name, total]) => ({ name, avgPercent: Math.round(total / entryCount) }))
      .sort((a,b) => b.avgPercent - a.avgPercent).slice(0, 8);
    res.json({ emotions, entryCount });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/monthly-report ────────────────────────────────────────
router.get('/monthly-report', async (req, res) => {
  try {
    const db    = await getPool();
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const [year, mon] = month.split('-').map(Number);
    const r = await db.request()
      .input('uid',   sql.Int, req.user.id)
      .input('year',  sql.Int, year)
      .input('month', sql.Int, mon)
      .query(`
        SELECT CAST(created_at AS DATE) AS day, mood_score, tags,
               DATEPART(WEEK, created_at) AS week_num
        FROM DiaryEntries
        WHERE user_id=@uid AND YEAR(created_at)=@year AND MONTH(created_at)=@month
        ORDER BY created_at
      `);
    const rows = r.recordset;
    if (!rows.length) return res.json({ month, totalEntries: 0, avgMood: null, bestDay: null, worstDay: null, topTags: [], moodByWeek: [], entryDays: 0 });

    const totalEntries = rows.length;
    const avgMood      = +(rows.reduce((s, e) => s + e.mood_score, 0) / totalEntries).toFixed(1);

    const byDay = {};
    rows.forEach(e => { if (!byDay[e.day]) byDay[e.day] = []; byDay[e.day].push(e.mood_score); });
    const dayAvgs  = Object.entries(byDay).map(([date, moods]) => ({ date, avg: +(moods.reduce((s,m)=>s+m,0)/moods.length).toFixed(1) }));
    const bestDay  = dayAvgs.reduce((a,b) => b.avg > a.avg ? b : a);
    const worstDay = dayAvgs.reduce((a,b) => b.avg < a.avg ? b : a);
    const entryDays = dayAvgs.length;

    const tagCount = {};
    rows.forEach(e => {
      if (!e.tags) return;
      e.tags.split('|').forEach(t => { const s = t.trim(); if (s) tagCount[s] = (tagCount[s]||0)+1; });
    });
    const topTags = Object.entries(tagCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([tag,count])=>({tag,count}));

    const byWeek = {};
    rows.forEach(e => { const wk = `W${e.week_num}`; if (!byWeek[wk]) byWeek[wk] = []; byWeek[wk].push(e.mood_score); });
    const moodByWeek = Object.entries(byWeek).map(([week, moods]) => ({ week, avg: +(moods.reduce((s,m)=>s+m,0)/moods.length).toFixed(1), count: moods.length }));

    res.json({ month, totalEntries, avgMood, bestDay, worstDay, topTags, moodByWeek, entryDays });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/year-review?year=YYYY ─────────────────────────────────
router.get('/year-review', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const db   = await getPool();
    const [summary, monthly, tags, sleepCorr] = await Promise.all([
      db.request().input('uid', sql.Int, req.user.id).input('year', sql.Int, year).query(`
        SELECT COUNT(*) AS total_entries,
          AVG(CAST(mood_score AS FLOAT)) AS avg_mood,
          COUNT(DISTINCT CAST(created_at AS DATE)) AS days_written
        FROM DiaryEntries WHERE user_id=@uid AND YEAR(created_at)=@year
      `),
      db.request().input('uid', sql.Int, req.user.id).input('year', sql.Int, year).query(`
        SELECT MONTH(created_at) AS month, COUNT(*) AS entries,
          AVG(CAST(mood_score AS FLOAT)) AS avg_mood
        FROM DiaryEntries WHERE user_id=@uid AND YEAR(created_at)=@year
        GROUP BY MONTH(created_at) ORDER BY month ASC
      `),
      db.request().input('uid', sql.Int, req.user.id).input('year', sql.Int, year).query(`
        SELECT TOP 5 tag, COUNT(*) AS cnt
        FROM (SELECT TRIM(value) AS tag FROM DiaryEntries
              CROSS APPLY STRING_SPLIT(tags, ',')
              WHERE user_id=@uid AND YEAR(created_at)=@year AND tags IS NOT NULL AND tags != '') t
        GROUP BY tag ORDER BY cnt DESC
      `),
      db.request().input('uid', sql.Int, req.user.id).input('year', sql.Int, year).query(`
        SELECT CASE WHEN sleep_hours < 6 THEN N'Thiếu ngủ (<6h)'
                    WHEN sleep_hours <= 8 THEN N'Đủ giấc (6-8h)'
                    ELSE N'Ngủ nhiều (>8h)' END AS sleep_band,
               AVG(CAST(mood_score AS FLOAT)) AS avg_mood, COUNT(*) AS cnt
        FROM DiaryEntries
        WHERE user_id=@uid AND YEAR(created_at)=@year AND sleep_hours IS NOT NULL
        GROUP BY CASE WHEN sleep_hours < 6 THEN N'Thiếu ngủ (<6h)'
                      WHEN sleep_hours <= 8 THEN N'Đủ giấc (6-8h)'
                      ELSE N'Ngủ nhiều (>8h)' END
      `),
    ]);
    const s = summary.recordset[0] || {};
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = monthly.recordset.find(r => r.month === i + 1);
      return { month: i + 1, entries: m ? m.entries : 0, avg_mood: m ? Math.round(m.avg_mood * 10) / 10 : null };
    });
    const withMood   = months.filter(m => m.avg_mood !== null);
    const bestMonth  = withMood.length ? withMood.reduce((a,b) => b.avg_mood > a.avg_mood ? b : a) : null;
    const worstMonth = withMood.length ? withMood.reduce((a,b) => b.avg_mood < a.avg_mood ? b : a) : null;
    res.json({ year, monthly: months, total_entries: s.total_entries || 0, avg_mood: s.avg_mood ? Math.round(s.avg_mood*10)/10 : null, days_written: s.days_written || 0, best_month: bestMonth, worst_month: worstMonth, top_tags: tags.recordset, sleep_corr: sleepCorr.recordset });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/year-stats ─────────────────────────────────────────────
router.get('/year-stats', async (req, res) => {
  try {
    const db   = await getPool();
    const uid  = req.user.id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const [overallR, monthlyR, tagsR, userR] = await Promise.all([
      db.request().input('uid', sql.Int, uid).input('year', sql.Int, year).query(`
        SELECT COUNT(*) as totalEntries, ROUND(AVG(CAST(mood_score AS FLOAT)), 1) as avgMood
        FROM DiaryEntries WHERE user_id = @uid AND DATEPART(YEAR, created_at) = @year
      `),
      db.request().input('uid', sql.Int, uid).input('year', sql.Int, year).query(`
        SELECT DATEPART(MONTH, created_at) as month, COUNT(*) as count,
               ROUND(AVG(CAST(mood_score AS FLOAT)), 1) as avg
        FROM DiaryEntries WHERE user_id = @uid AND DATEPART(YEAR, created_at) = @year
        GROUP BY DATEPART(MONTH, created_at) ORDER BY month
      `),
      db.request().input('uid', sql.Int, uid).input('year', sql.Int, year).query(`
        SELECT TOP 5 value as tag, COUNT(*) as count
        FROM DiaryEntries CROSS APPLY STRING_SPLIT(tags, '|')
        WHERE user_id = @uid AND DATEPART(YEAR, created_at) = @year
          AND tags IS NOT NULL AND tags != '' AND value != ''
        GROUP BY value ORDER BY count DESC
      `),
      db.request().input('uid', sql.Int, uid).query(`SELECT max_streak FROM Users WHERE id = @uid`),
    ]);
    const overall = overallR.recordset[0];
    if (!overall.totalEntries) return res.json({ year, totalEntries: 0 });
    const moodByMonth = Array.from({ length: 12 }, (_, i) => {
      const m = monthlyR.recordset.find(r => r.month === i + 1);
      return m ? { month: i+1, count: m.count, avg: m.avg } : { month: i+1, count: 0, avg: null };
    });
    const withData  = monthlyR.recordset;
    const bestMonth = withData.length ? [...withData].sort((a,b) => b.avg - a.avg)[0]   : null;
    const busyMonth = withData.length ? [...withData].sort((a,b) => b.count - a.count)[0] : null;
    res.json({ year, totalEntries: overall.totalEntries, avgMood: overall.avgMood, maxStreak: userR.recordset[0]?.max_streak || 0, bestMonth: bestMonth ? { month: bestMonth.month, avg: bestMonth.avg } : null, busyMonth: busyMonth ? { month: busyMonth.month, count: busyMonth.count } : null, moodByMonth, topTags: tagsR.recordset });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/sleep-stats ────────────────────────────────────────────
router.get('/sleep-stats', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().input('uid', sql.Int, req.user.id).query(`
      SELECT TOP 30 CAST(created_at AS DATE) AS entry_date, mood_score, sleep_hours, sleep_quality
      FROM DiaryEntries WHERE user_id=@uid AND sleep_hours IS NOT NULL ORDER BY created_at DESC
    `);
    res.json({ data: result.recordset.reverse() });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/compare ────────────────────────────────────────────────
router.get('/compare', async (req, res) => {
  try {
    const { from1, to1, from2, to2 } = req.query;
    if (!from1 || !to1 || !from2 || !to2)
      return res.status(400).json({ message: 'Cần đủ 4 tham số: from1, to1, from2, to2.' });
    const db  = await getPool();
    const uid = req.user.id;

    async function periodStats(from, to) {
      const base = await db.request()
        .input('uid',  sql.Int,      uid)
        .input('from', sql.NVarChar, from)
        .input('to',   sql.NVarChar, to)
        .query(`
          SELECT COUNT(*) as total, ROUND(AVG(CAST(mood_score AS FLOAT)), 1) as avgMood,
                 MAX(mood_score) as maxMood, MIN(mood_score) as minMood
          FROM DiaryEntries WHERE user_id = @uid AND CAST(created_at AS DATE) BETWEEN @from AND @to
        `);
      const tags = await db.request()
        .input('uid',  sql.Int,      uid)
        .input('from', sql.NVarChar, from)
        .input('to',   sql.NVarChar, to)
        .query(`
          SELECT TOP 5 value as tag, COUNT(*) as count
          FROM DiaryEntries CROSS APPLY STRING_SPLIT(tags, '|')
          WHERE user_id = @uid AND CAST(created_at AS DATE) BETWEEN @from AND @to
            AND tags IS NOT NULL AND tags != '' AND value != ''
          GROUP BY value ORDER BY count DESC
        `);
      return { ...base.recordset[0], topTags: tags.recordset };
    }

    const [p1, p2] = await Promise.all([periodStats(from1, to1), periodStats(from2, to2)]);
    res.json({ period1: { from: from1, to: to1, ...p1 }, period2: { from: from2, to: to2, ...p2 } });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/gallery ────────────────────────────────────────────────
router.get('/gallery', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request().input('uid', sql.Int, req.user.id).query(`
      SELECT TOP 50 e.id, e.mood_score, e.created_at,
             SUBSTRING(ISNULL(e.event_text,''), 1, 80) AS event_text,
             m.mime_type, m.data
      FROM DiaryEntries e
      INNER JOIN DiaryMedia m ON m.entry_id = e.id AND m.kind = 'photo' AND m.sort_order = 0
      WHERE e.user_id = @uid ORDER BY e.created_at DESC
    `);
    const entries = r.recordset.map(row => ({
      id: row.id, mood_score: row.mood_score, created_at: row.created_at,
      event_text: row.event_text, photo: bufferToDataUri(row.mime_type, row.data),
    }));
    res.json({ entries });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/export ─────────────────────────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const db   = await getPool();
    const from = req.query.from || `${new Date().getFullYear()}-01-01`;
    const to   = req.query.to   || new Date().toISOString().split('T')[0];
    const fmt  = req.query.format || 'csv';
    const result = await db.request()
      .input('uid',  sql.Int,  req.user.id)
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .query(`
        SELECT CONVERT(NVARCHAR(10), created_at, 23) AS entry_date,
               FORMAT(created_at, 'HH:mm') AS entry_time, mood_score,
               ISNULL(event_text, '') AS event_text, ISNULL(thoughts, '') AS thoughts,
               ISNULL(gratitude, '') AS gratitude, ISNULL(tags, '[]') AS tags
        FROM DiaryEntries
        WHERE user_id = @uid AND created_at >= @from AND CAST(created_at AS DATE) <= @to
        ORDER BY created_at DESC
      `);
    if (fmt === 'json') return res.json({ entries: result.recordset, from, to });

    const BOM  = '﻿';
    const CRLF = '\r\n';
    const esc  = s => `"${String(s || '').replace(/"/g, '""')}"`;
    const hdr  = ['Ngày','Giờ','Tâm trạng','Sự kiện / Cảm xúc','Suy nghĩ','Lòng biết ơn','Tags'].join(',');
    const rows = result.recordset.map(r => {
      let tags = ''; try { tags = JSON.parse(r.tags).join('; '); } catch(_) {}
      return [r.entry_date, r.entry_time, r.mood_score, esc(r.event_text), esc(r.thoughts), esc(r.gratitude), esc(tags)].join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="souldiary-${from}-den-${to}.csv"`);
    res.send(BOM + hdr + CRLF + rows.join(CRLF));
  } catch (e) { res.status(500).json({ error: 'Lỗi xuất dữ liệu' }); }
});

module.exports = router;
