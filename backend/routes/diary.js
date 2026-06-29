// routes/diary.js — CRUD nhật ký cảm xúc (core)
// Sub-routers: diary-stats.js (thống kê), diary-ai.js (AI)
const express      = require('express');
const crypto       = require('crypto');
const { getPool, sql }  = require('../db');
const authMiddleware    = require('../middleware/auth');
const { analyzeEntry, companionMessage } = require('../utils/diary-helpers');
const { dataUriToBuffer, bufferToDataUri } = require('../utils/media');

const router = express.Router();

// ── Hằng số ──────────────────────────────────────────────────────────────
const MAX_PHOTOS    = 4;
const MAX_PHOTO_SIZE = 3_000_000;

// ── Helper: validate ảnh đính kèm ────────────────────────────────────────
function validatePhotos(photos) {
  if (photos === undefined || photos === null) return { photos: [] };
  if (!Array.isArray(photos)) return { error: 'Định dạng ảnh không hợp lệ.' };
  const validPhotos = photos.filter(Boolean);
  if (validPhotos.length > MAX_PHOTOS) return { error: `Chỉ được đính kèm tối đa ${MAX_PHOTOS} ảnh.` };
  for (const p of validPhotos) {
    if (typeof p !== 'string' || !p.startsWith('data:image/')) return { error: 'Định dạng ảnh không hợp lệ.' };
    if (p.length > MAX_PHOTO_SIZE) return { error: 'Ảnh quá lớn (mỗi ảnh tối đa khoảng 2MB).' };
  }
  return { photos: validPhotos };
}

// ── Helper: lưu ảnh/audio vào DiaryMedia ─────────────────────────────────
async function saveMedia(db, entryId, photos, audioDataUri) {
  for (let i = 0; i < photos.length; i++) {
    const parsed = dataUriToBuffer(photos[i]);
    if (!parsed) continue;
    await db.request()
      .input('entry_id',   sql.Int,               entryId)
      .input('kind',       sql.NVarChar,           'photo')
      .input('mime',       sql.NVarChar,           parsed.mime)
      .input('data',       sql.VarBinary(sql.MAX), parsed.buffer)
      .input('sort_order', sql.Int,               i)
      .query(`INSERT INTO DiaryMedia (entry_id, kind, mime_type, data, sort_order)
              VALUES (@entry_id, @kind, @mime, @data, @sort_order)`);
  }
  if (audioDataUri) {
    const parsed = dataUriToBuffer(audioDataUri);
    if (parsed) {
      await db.request()
        .input('entry_id',   sql.Int,               entryId)
        .input('kind',       sql.NVarChar,           'audio')
        .input('mime',       sql.NVarChar,           parsed.mime)
        .input('data',       sql.VarBinary(sql.MAX), parsed.buffer)
        .input('sort_order', sql.Int,               0)
        .query(`INSERT INTO DiaryMedia (entry_id, kind, mime_type, data, sort_order)
                VALUES (@entry_id, @kind, @mime, @data, @sort_order)`);
    }
  }
}

// ── Helper: tải ảnh/audio từ DiaryMedia cho nhiều entry ──────────────────
async function loadMediaForEntries(db, entryIds) {
  const map = new Map();
  if (!entryIds.length) return map;
  const result = await db.request().query(`
    SELECT entry_id, kind, mime_type, data, sort_order
    FROM DiaryMedia WHERE entry_id IN (${entryIds.join(',')})
    ORDER BY entry_id, sort_order
  `);
  for (const row of result.recordset) {
    if (!map.has(row.entry_id)) map.set(row.entry_id, { photos: [], audio_data: null });
    const m = map.get(row.entry_id);
    const uri = bufferToDataUri(row.mime_type, row.data);
    if (row.kind === 'photo') m.photos.push(uri);
    else if (row.kind === 'audio') m.audio_data = uri;
  }
  return map;
}

// ── Public: GET /api/diary/share/:token (không cần auth) ─────────────────
router.get('/share/:token', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request()
      .input('token', sql.NVarChar(64), req.params.token)
      .query(`
        SELECT e.id, e.mood_score, e.event_text, e.gratitude, e.created_at, e.tags,
               u.username, u.full_name, u.avatar_text
        FROM DiaryEntries e JOIN Users u ON e.user_id = u.id
        WHERE e.share_token = @token
      `);
    if (!r.recordset.length)
      return res.status(404).json({ message: 'Liên kết không hợp lệ hoặc đã bị thu hồi.' });
    res.json({ entry: r.recordset[0] });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// Tất cả route sau đây cần auth
router.use(authMiddleware);

// ── GET /api/diary/search ─────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const q        = (req.query.q || '').trim();
    const from     = req.query.from     || null;
    const to       = req.query.to       || null;
    const moodMin  = req.query.mood_min ? parseInt(req.query.mood_min) : null;
    const moodMax  = req.query.mood_max ? parseInt(req.query.mood_max) : null;
    const hasMedia = req.query.has_media === 'true';
    const hasCbt   = req.query.has_cbt   === 'true';
    const hasFilter = q || from || to || moodMin !== null || moodMax !== null || hasMedia || hasCbt;
    if (!hasFilter) return res.json({ entries: [] });

    const db = await getPool();
    const r  = db.request().input('user_id', sql.Int, req.user.id);
    if (q)              r.input('q',        sql.NVarChar, `%${q}%`);
    if (from)           r.input('from',     sql.Date,     from);
    if (to)             r.input('to',       sql.Date,     to);
    if (moodMin !== null) r.input('mood_min', sql.Int, moodMin);
    if (moodMax !== null) r.input('mood_max', sql.Int, moodMax);

    const result = await r.query(`
      SELECT TOP 50 d.id, d.mood_score, d.event_text, d.tags, d.cbt_data, d.created_at,
                    d.has_photos, d.photo_count, d.has_audio
      FROM (
        SELECT e.id, e.mood_score, e.event_text, e.tags, e.cbt_data, e.created_at,
               (SELECT COUNT(*) FROM EntryPhotos WHERE entry_id=e.id) AS photo_count,
               CAST(CASE WHEN EXISTS(SELECT 1 FROM EntryPhotos WHERE entry_id=e.id) THEN 1 ELSE 0 END AS BIT) AS has_photos,
               CAST(CASE WHEN e.audio_data IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS has_audio
        FROM DiaryEntries e
        WHERE e.user_id = @user_id
          ${q       ? 'AND (e.event_text LIKE @q OR e.thoughts LIKE @q OR e.gratitude LIKE @q OR e.tags LIKE @q)' : ''}
          ${from    ? 'AND CAST(e.created_at AS DATE) >= @from' : ''}
          ${to      ? 'AND CAST(e.created_at AS DATE) <= @to'   : ''}
          ${moodMin !== null ? 'AND e.mood_score >= @mood_min' : ''}
          ${moodMax !== null ? 'AND e.mood_score <= @mood_max' : ''}
          ${hasCbt  ? 'AND e.cbt_data IS NOT NULL' : ''}
      ) d
      ${hasMedia ? 'WHERE d.has_photos = 1 OR d.has_audio = 1' : ''}
      ORDER BY d.created_at DESC
    `);

    res.json({ entries: result.recordset.map(e => ({ ...e, tags: e.tags ? e.tags.split('|') : [] })) });
  } catch (err) {
    console.error('Search diary error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── Mount sub-routers (trước /:id để tránh conflict) ─────────────────────
router.use(require('./diary-stats'));
router.use(require('./diary-ai'));

// ── GET /api/diary — danh sách (có phân trang, không trả binary) ─────────
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const db = await getPool();
    const [dataResult, countResult] = await Promise.all([
      db.request()
        .input('user_id', sql.Int, req.user.id)
        .input('limit',   sql.Int, limit)
        .input('offset',  sql.Int, offset)
        .query(`
          SELECT id, mood_score, event_text, thoughts, gratitude, tags,
                 ai_emotion, ai_companion_message, cbt_data, is_pinned, created_at
          FROM DiaryEntries WHERE user_id = @user_id
          ORDER BY created_at DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `),
      db.request().input('user_id', sql.Int, req.user.id)
        .query('SELECT COUNT(*) AS total FROM DiaryEntries WHERE user_id = @user_id'),
    ]);

    const total    = countResult.recordset[0].total;
    const entryIds = dataResult.recordset.map(e => e.id);

    const mediaCountMap = new Map();
    if (entryIds.length > 0) {
      const mR = await db.request().query(`
        SELECT entry_id,
          SUM(CASE WHEN kind='photo' THEN 1 ELSE 0 END) AS photo_count,
          MAX(CASE WHEN kind='audio' THEN 1 ELSE 0 END)  AS has_audio
        FROM DiaryMedia WHERE entry_id IN (${entryIds.join(',')})
        GROUP BY entry_id
      `);
      mR.recordset.forEach(r => mediaCountMap.set(r.entry_id, { photo_count: r.photo_count, has_audio: r.has_audio === 1 }));
    }

    res.json({
      entries: dataResult.recordset.map(e => {
        const mc = mediaCountMap.get(e.id) || { photo_count: 0, has_audio: false };
        return { ...e, tags: e.tags ? e.tags.split('|') : [], has_photos: mc.photo_count > 0, photo_count: mc.photo_count, has_audio: mc.has_audio };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── POST /api/diary — tạo nhật ký mới ───────────────────────────────────
router.post('/', async (req, res) => {
  try {
    let { mood_score, event_text, thoughts, gratitude, tags, audio_data, cbt_data, photos } = req.body;

    const moodInt = parseInt(mood_score);
    if (!moodInt || moodInt < 1 || moodInt > 10)
      return res.status(400).json({ message: 'Điểm tâm trạng phải từ 1 đến 10.' });
    mood_score = moodInt;
    if (!event_text && !thoughts && !cbt_data)
      return res.status(400).json({ message: 'Vui lòng viết ít nhất một dòng nhật ký.' });
    if (event_text) { event_text = String(event_text).trim(); if (event_text.length > 5000) return res.status(400).json({ message: 'Nội dung quá dài (tối đa 5000 ký tự).' }); }
    if (gratitude)  { gratitude  = String(gratitude).trim();  if (gratitude.length  > 2000) return res.status(400).json({ message: 'Phần biết ơn quá dài (tối đa 2000 ký tự).' }); }
    if (thoughts)   { thoughts   = String(thoughts).trim();   if (thoughts.length   > 3000) return res.status(400).json({ message: 'Suy nghĩ quá dài (tối đa 3000 ký tự).' }); }
    if (tags && String(tags).length > 500) return res.status(400).json({ message: 'Tags quá dài.' });

    let cbtJson = null;
    if (cbt_data && typeof cbt_data === 'object') cbtJson = JSON.stringify(cbt_data);

    let audioData = null;
    if (audio_data) {
      if (typeof audio_data !== 'string' || !audio_data.startsWith('data:audio/'))
        return res.status(400).json({ message: 'Định dạng bản ghi âm không hợp lệ.' });
      if (audio_data.length > 2_000_000)
        return res.status(400).json({ message: 'Bản ghi âm quá lớn (tối đa khoảng 30 giây).' });
      audioData = audio_data;
    }

    const { photos: validPhotos, error: photosError } = validatePhotos(photos);
    if (photosError) return res.status(400).json({ message: photosError });

    const tagsStr = Array.isArray(tags) ? tags.join('|') : '';
    const db      = await getPool();

    const result = await db.request()
      .input('user_id',    sql.Int,      req.user.id)
      .input('mood_score', sql.TinyInt,  mood_score)
      .input('event_text', sql.NVarChar, event_text  || '')
      .input('thoughts',   sql.NVarChar, thoughts    || '')
      .input('gratitude',  sql.NVarChar, gratitude   || '')
      .input('tags',       sql.NVarChar, tagsStr)
      .input('cbt_data',   sql.NVarChar, cbtJson)
      .query(`
        INSERT INTO DiaryEntries (user_id, mood_score, event_text, thoughts, gratitude, tags, cbt_data)
        OUTPUT INSERTED.id, INSERTED.mood_score, INSERTED.event_text, INSERTED.thoughts,
               INSERTED.gratitude, INSERTED.tags, INSERTED.cbt_data, INSERTED.created_at
        VALUES (@user_id, @mood_score, @event_text, @thoughts, @gratitude, @tags, @cbt_data)
      `);

    const entry = result.recordset[0];
    await saveMedia(db, entry.id, validPhotos, audioData);

    // Cập nhật streak
    const streakResult = await db.request().input('user_id', sql.Int, req.user.id)
      .query(`SELECT streak, last_entry, streak_freeze, max_streak FROM Users WHERE id = @user_id`);
    const { streak, last_entry, streak_freeze, max_streak } = streakResult.recordset[0];
    const today      = new Date(); today.setHours(0,0,0,0);
    const yesterday  = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const lastDate   = last_entry ? new Date(last_entry) : null;
    if (lastDate) lastDate.setHours(0,0,0,0);

    let newStreak = streak, freezeUsed = false, freezeGrant = 0, newFreezeCount = streak_freeze;
    const isSameDay    = lastDate && lastDate.getTime() === today.getTime();
    const isYesterday  = lastDate && lastDate.getTime() === yesterday.getTime();
    const isTwoDaysAgo = lastDate && lastDate.getTime() === twoDaysAgo.getTime();

    if (!isSameDay) {
      if (isYesterday)                        newStreak = streak + 1;
      else if (isTwoDaysAgo && streak_freeze > 0) { newStreak = streak + 1; freezeUsed = true; }
      else                                    newStreak = 1;

      const milestoneGrants = { 7: 1, 14: 1, 21: 1, 30: 2, 50: 2, 100: 3 };
      freezeGrant    = milestoneGrants[newStreak] || 0;
      const newMaxStreak  = Math.max(max_streak, newStreak);
      const freezeDelta   = freezeGrant - (freezeUsed ? 1 : 0);
      newFreezeCount = Math.max(0, streak_freeze + freezeDelta);

      if (milestoneGrants[newStreak]) {
        const { createNotification } = require('../utils/notifier');
        setImmediate(() => createNotification(req.user.id, 'streak_milestone',
          `🎉 Bạn đạt mốc ${newStreak} ngày streak!`,
          `Thật tuyệt vời! Chuỗi ${newStreak} ngày ghi nhật ký liên tiếp — bạn đã nhận thêm ${freezeGrant} lượt cứu streak. Tiếp tục nhé!`,
          '/diary'
        ).catch(() => {}));
      }

      await db.request()
        .input('user_id',    sql.Int,  req.user.id)
        .input('streak',     sql.Int,  newStreak)
        .input('last_entry', sql.Date, today)
        .input('max_streak', sql.Int,  newMaxStreak)
        .input('new_freeze', sql.Int,  newFreezeCount)
        .query(`UPDATE Users SET streak=@streak, last_entry=@last_entry, max_streak=@max_streak, streak_freeze=@new_freeze, updated_at=GETDATE() WHERE id=@user_id`);
    }

    // Kiểm tra chuỗi 7 ngày tâm trạng thấp
    const lowStreakRes = await db.request().input('uid_ls', sql.Int, req.user.id).query(`
      SELECT COUNT(*) AS low_days FROM (
        SELECT TOP 7 CAST(created_at AS DATE) AS d, AVG(CAST(mood_score AS FLOAT)) AS avg_m
        FROM DiaryEntries WHERE user_id = @uid_ls
        GROUP BY CAST(created_at AS DATE) ORDER BY d DESC
      ) t WHERE t.avg_m <= 4
    `);
    const lowStreak = lowStreakRes.recordset[0].low_days >= 7;

    // Fire-and-forget: phân tích AI sau khi trả response
    setImmediate(async () => {
      try {
        const text = [event_text, thoughts, gratitude].filter(Boolean).join('\n');
        if (text.trim().length > 20) {
          const db2 = await getPool();
          const [analysis, msg] = await Promise.all([
            analyzeEntry(text, mood_score),
            companionMessage(text, mood_score),
          ]);
          await db2.request()
            .input('id', sql.Int,      entry.id)
            .input('ae', sql.NVarChar, JSON.stringify(analysis))
            .input('cm', sql.NVarChar, msg)
            .query(`UPDATE DiaryEntries SET ai_emotion=@ae, ai_companion_message=@cm WHERE id=@id`);
        }
      } catch {}
    });

    res.status(201).json({
      message:        'Đã lưu nhật ký!',
      entry:          { ...entry, tags: entry.tags ? entry.tags.split('|') : [], photos: validPhotos, audio_data: audioData },
      streak:         newStreak,
      freeze_used:    freezeUsed,
      freeze_granted: freezeGrant,
      streak_freeze:  newFreezeCount,
      low_streak:     lowStreak,
    });
  } catch (err) {
    console.error('Create diary error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── PUT /api/diary/:id — sửa nhật ký ────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { mood_score, event_text, thoughts, gratitude, tags, audio_data, cbt_data, photos } = req.body;
    const tagsStr = Array.isArray(tags) ? tags.join('|') : '';

    let audioData = null;
    if (audio_data) {
      if (typeof audio_data !== 'string' || !audio_data.startsWith('data:audio/'))
        return res.status(400).json({ message: 'Định dạng bản ghi âm không hợp lệ.' });
      if (audio_data.length > 2_000_000)
        return res.status(400).json({ message: 'Bản ghi âm quá lớn (tối đa khoảng 30 giây).' });
      audioData = audio_data;
    }

    let cbtJson = null;
    if (cbt_data && typeof cbt_data === 'object') cbtJson = JSON.stringify(cbt_data);

    const { photos: validPhotos, error: photosError } = validatePhotos(photos);
    if (photosError) return res.status(400).json({ message: photosError });

    const db     = await getPool();
    const result = await db.request()
      .input('id',         sql.Int,      req.params.id)
      .input('user_id',    sql.Int,      req.user.id)
      .input('mood_score', sql.TinyInt,  mood_score)
      .input('event_text', sql.NVarChar, event_text || '')
      .input('thoughts',   sql.NVarChar, thoughts   || '')
      .input('gratitude',  sql.NVarChar, gratitude  || '')
      .input('tags',       sql.NVarChar, tagsStr)
      .input('cbt_data',   sql.NVarChar, cbtJson)
      .query(`
        UPDATE DiaryEntries
        SET mood_score=@mood_score, event_text=@event_text, thoughts=@thoughts,
            gratitude=@gratitude, tags=@tags, cbt_data=@cbt_data,
            audio_data=NULL, photos=NULL, updated_at=GETDATE()
        OUTPUT INSERTED.id, INSERTED.mood_score, INSERTED.event_text, INSERTED.thoughts,
               INSERTED.gratitude, INSERTED.tags, INSERTED.cbt_data, INSERTED.created_at
        WHERE id=@id AND user_id=@user_id
      `);

    if (!result.recordset.length)
      return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });

    const entry = result.recordset[0];
    await db.request().input('id', sql.Int, entry.id).query('DELETE FROM DiaryMedia WHERE entry_id = @id');
    await saveMedia(db, entry.id, validPhotos, audioData);

    res.json({ message: 'Đã cập nhật nhật ký.', entry: { ...entry, tags: entry.tags ? entry.tags.split('|') : [], photos: validPhotos, audio_data: audioData } });
  } catch (err) {
    console.error('Update diary error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/:id/emotion ────────────────────────────────────────────
router.get('/:id/emotion', async (req, res) => {
  try {
    const db  = await getPool();
    const row = await db.request()
      .input('id', sql.Int, req.params.id).input('user_id', sql.Int, req.user.id)
      .query(`SELECT id, mood_score, event_text, thoughts, gratitude, ai_emotion FROM DiaryEntries WHERE id=@id AND user_id=@user_id`);
    if (!row.recordset.length) return res.status(404).json({ message: 'Không tìm thấy.' });
    const entry = row.recordset[0];
    if (entry.ai_emotion) {
      try { return res.json({ analysis: JSON.parse(entry.ai_emotion), cached: true }); } catch {}
    }
    const text = [entry.event_text, entry.thoughts, entry.gratitude].filter(Boolean).join('\n');
    if (!text.trim()) return res.json({ analysis: null });
    const analysis = await analyzeEntry(text, entry.mood_score);
    await db.request().input('id', sql.Int, req.params.id).input('ae', sql.NVarChar, JSON.stringify(analysis))
      .query(`UPDATE DiaryEntries SET ai_emotion=@ae WHERE id=@id`);
    res.json({ analysis, cached: false });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/:id/companion ──────────────────────────────────────────
router.get('/:id/companion', async (req, res) => {
  try {
    const db  = await getPool();
    const row = await db.request()
      .input('id', sql.Int, req.params.id).input('user_id', sql.Int, req.user.id)
      .query(`SELECT id, mood_score, event_text, thoughts, gratitude, ai_companion_message FROM DiaryEntries WHERE id=@id AND user_id=@user_id`);
    if (!row.recordset.length) return res.status(404).json({ message: 'Không tìm thấy.' });
    const entry = row.recordset[0];
    if (entry.ai_companion_message) return res.json({ message: entry.ai_companion_message, cached: true });
    const text = [entry.event_text, entry.thoughts, entry.gratitude].filter(Boolean).join('\n');
    if (!text.trim()) return res.json({ message: null });
    const message = await companionMessage(text, entry.mood_score);
    await db.request().input('id', sql.Int, req.params.id).input('m', sql.NVarChar, message)
      .query(`UPDATE DiaryEntries SET ai_companion_message=@m WHERE id=@id`);
    res.json({ message, cached: false });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── PATCH /api/diary/:id/pin ──────────────────────────────────────────────
router.patch('/:id/pin', async (req, res) => {
  try {
    const db    = await getPool();
    const entry = await db.request()
      .input('id', sql.Int, req.params.id).input('uid', sql.Int, req.user.id)
      .query(`SELECT id, is_pinned FROM DiaryEntries WHERE id=@id AND user_id=@uid`);
    if (!entry.recordset.length) return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });
    const current = entry.recordset[0].is_pinned;
    if (!current) {
      const cnt = await db.request().input('uid', sql.Int, req.user.id)
        .query(`SELECT COUNT(*) AS c FROM DiaryEntries WHERE user_id=@uid AND is_pinned=1`);
      if (cnt.recordset[0].c >= 5) return res.status(400).json({ message: 'Tối đa 5 nhật ký được ghim.' });
    }
    const newVal = current ? 0 : 1;
    await db.request().input('id', sql.Int, req.params.id).input('uid', sql.Int, req.user.id).input('val', sql.Bit, newVal)
      .query(`UPDATE DiaryEntries SET is_pinned=@val WHERE id=@id AND user_id=@uid`);
    res.json({ pinned: !!newVal });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── POST /api/diary/:id/share ─────────────────────────────────────────────
router.post('/:id/share', async (req, res) => {
  try {
    const db    = await getPool();
    const check = await db.request().input('id', sql.Int, req.params.id).input('uid', sql.Int, req.user.id)
      .query(`SELECT id, share_token FROM DiaryEntries WHERE id=@id AND user_id=@uid`);
    if (!check.recordset.length) return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });
    let token = check.recordset[0].share_token;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      await db.request().input('id', sql.Int, req.params.id).input('token', sql.NVarChar(64), token)
        .query(`UPDATE DiaryEntries SET share_token=@token WHERE id=@id`);
    }
    res.json({ token });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── DELETE /api/diary/:id/share ───────────────────────────────────────────
router.delete('/:id/share', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request().input('id', sql.Int, req.params.id).input('uid', sql.Int, req.user.id)
      .query(`UPDATE DiaryEntries SET share_token=NULL WHERE id=@id AND user_id=@uid`);
    if (!r.rowsAffected[0]) return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });
    res.json({ message: 'Đã thu hồi chia sẻ.' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── DELETE /api/diary/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db     = await getPool();
    const result = await db.request().input('id', sql.Int, req.params.id).input('user_id', sql.Int, req.user.id)
      .query('DELETE FROM DiaryEntries OUTPUT DELETED.id WHERE id=@id AND user_id=@user_id');
    if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });
    res.json({ message: 'Đã xóa nhật ký.' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

// ── GET /api/diary/:id — PHẢI ĐỨng CUỐI (sau tất cả named routes) ────────
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID không hợp lệ.' });
  try {
    const db = await getPool();
    const r  = await db.request().input('id', sql.Int, id).input('uid', sql.Int, req.user.id).query(`
      SELECT id, mood_score, event_text, thoughts, gratitude, tags,
             ai_emotion, ai_companion_message, cbt_data, is_pinned, share_token, created_at
      FROM DiaryEntries WHERE id=@id AND user_id=@uid
    `);
    if (!r.recordset.length) return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });
    const entry    = r.recordset[0];
    const mediaMap = await loadMediaForEntries(db, [entry.id]);
    res.json({ entry: { ...entry, tags: entry.tags ? entry.tags.split('|') : [], photos: mediaMap.get(entry.id)?.photos || [], audio_data: mediaMap.get(entry.id)?.audio_data || null } });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

module.exports = router;
