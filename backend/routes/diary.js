// routes/diary.js — CRUD nhật ký cảm xúc (core)
// Sub-routers: diary-stats.js (thống kê), diary-ai.js (AI)
const express      = require('express');
const crypto       = require('crypto');
const { getPool, sql }  = require('../db');
const authMiddleware    = require('../middleware/auth');
const { analyzeEntry, companionMessage } = require('../utils/diary-helpers');
const { dataUriToBuffer, bufferToDataUri, SAFE_MIME_RE } = require('../utils/media');
const { encryptField, decryptRow, decryptRows } = require('../utils/diary-crypto');

const router = express.Router();

// ── Hằng số ──────────────────────────────────────────────────────────────
const MAX_PHOTOS    = 4;
// Ảnh đã được resize/nén ở frontend (compressImage) trước khi gửi lên — cap này chỉ để chặn lạm dụng,
// không phải giới hạn ảnh gốc (giới hạn ảnh gốc 10MB nằm ở frontend, xử lý bởi compressImage).
const MAX_PHOTO_SIZE = 4_000_000;

// ── Helper: validate ảnh đính kèm ────────────────────────────────────────
function validatePhotos(photos) {
  if (photos === undefined || photos === null) return { photos: [] };
  if (!Array.isArray(photos)) return { error: 'Định dạng ảnh không hợp lệ.' };
  const validPhotos = photos.filter(Boolean);
  if (validPhotos.length > MAX_PHOTOS) return { error: `Chỉ được đính kèm tối đa ${MAX_PHOTOS} ảnh.` };
  for (const p of validPhotos) {
    if (typeof p !== 'string' || !p.startsWith('data:image/')) return { error: 'Định dạng ảnh không hợp lệ.' };
    if (p.length > MAX_PHOTO_SIZE) return { error: 'Ảnh quá lớn sau khi nén, vui lòng chọn ảnh khác.' };
    const idx = p.indexOf(';base64,');
    if (idx === -1 || !SAFE_MIME_RE.test(p.slice(5, idx))) return { error: 'Định dạng ảnh không hợp lệ.' };
  }
  return { photos: validPhotos };
}

// ── Helper: validate bản ghi âm đính kèm ─────────────────────────────────
function validateAudio(audioData) {
  if (!audioData) return { audio: null };
  if (typeof audioData !== 'string' || !audioData.startsWith('data:audio/'))
    return { error: 'Định dạng bản ghi âm không hợp lệ.' };
  if (audioData.length > 8_000_000)
    return { error: 'Bản ghi âm quá lớn (tối đa khoảng 2 phút).' };
  const idx = audioData.indexOf(';base64,');
  if (idx === -1 || !SAFE_MIME_RE.test(audioData.slice(5, idx)))
    return { error: 'Định dạng bản ghi âm không hợp lệ.' };
  return { audio: audioData };
}

// ── Helper: ghi audit log CRUD nhật ký (baomat.txt: khuyến nghị #6) ──────
// Không throw nếu ghi log lỗi — audit trail không được phép làm hỏng thao tác chính của user.
async function logAudit(db, entryId, userId, action, req) {
  try {
    await db.request()
      .input('entry_id', sql.Int,      entryId)
      .input('user_id',  sql.Int,      userId)
      .input('action',   sql.NVarChar, action)
      .input('ip',       sql.NVarChar, (req.ip || '').slice(0, 64))
      .query(`INSERT INTO DiaryAuditLog (entry_id, user_id, action, ip_address) VALUES (@entry_id, @user_id, @action, @ip)`);
  } catch (err) {
    console.error('[diary-audit] Lỗi ghi log:', err.message);
  }
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
    res.json({ entry: decryptRow(r.recordset[0], ['event_text', 'gratitude']) });
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
    if (from)           r.input('from',     sql.Date,     from);
    if (to)             r.input('to',       sql.Date,     to);
    if (moodMin !== null) r.input('mood_min', sql.Int, moodMin);
    if (moodMax !== null) r.input('mood_max', sql.Int, moodMax);

    // event_text/thoughts/gratitude đã mã hoá at-rest → không thể LIKE trong SQL. Lọc theo mọi
    // tiêu chí khác ở SQL (không đổi), rồi nếu có `q` thì giải mã + lọc substring phía Node.
    const result = await r.query(`
      SELECT d.id, d.mood_score, d.event_text, d.thoughts, d.gratitude, d.tags, d.cbt_data, d.created_at,
                    d.has_photos, d.photo_count, d.has_audio
      FROM (
        SELECT e.id, e.mood_score, e.event_text, e.thoughts, e.gratitude, e.tags, e.cbt_data, e.created_at,
               (SELECT COUNT(*) FROM DiaryMedia WHERE entry_id=e.id AND kind='photo') AS photo_count,
               CAST(CASE WHEN EXISTS(SELECT 1 FROM DiaryMedia WHERE entry_id=e.id AND kind='photo') THEN 1 ELSE 0 END AS BIT) AS has_photos,
               CAST(CASE WHEN e.audio_data IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS has_audio
        FROM DiaryEntries e
        WHERE e.user_id = @user_id
          ${from    ? 'AND CAST(e.created_at AS DATE) >= @from' : ''}
          ${to      ? 'AND CAST(e.created_at AS DATE) <= @to'   : ''}
          ${moodMin !== null ? 'AND e.mood_score >= @mood_min' : ''}
          ${moodMax !== null ? 'AND e.mood_score <= @mood_max' : ''}
          ${hasCbt  ? 'AND e.cbt_data IS NOT NULL' : ''}
      ) d
      ${hasMedia ? 'WHERE d.has_photos = 1 OR d.has_audio = 1' : ''}
      ORDER BY d.created_at DESC
    `);

    let entries = decryptRows(result.recordset, ['event_text', 'thoughts', 'gratitude', 'cbt_data']);
    if (q) {
      const needle = q.toLowerCase();
      entries = entries.filter(e =>
        (e.event_text && e.event_text.toLowerCase().includes(needle)) ||
        (e.thoughts   && e.thoughts.toLowerCase().includes(needle))   ||
        (e.gratitude  && e.gratitude.toLowerCase().includes(needle))  ||
        (e.tags       && e.tags.toLowerCase().includes(needle))
      );
    }
    entries = entries.slice(0, 50).map(({ thoughts, gratitude, ...e }) => ({ ...e, tags: e.tags ? e.tags.split('|') : [] }));

    res.json({ entries });
  } catch (err) {
    console.error('Search diary error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/diary/on-this-day — nhật ký cùng ngày các năm trước (v3.4) ──
router.get('/on-this-day', async (req, res) => {
  try {
    const db = await getPool();
    const r  = await db.request().input('user_id', sql.Int, req.user.id).query(`
      SELECT id, mood_score, event_text, tags, created_at,
             YEAR(GETDATE()) - YEAR(created_at) AS years_ago
      FROM DiaryEntries
      WHERE user_id = @user_id
        AND MONTH(created_at) = MONTH(GETDATE())
        AND DAY(created_at) = DAY(GETDATE())
        AND YEAR(created_at) < YEAR(GETDATE())
      ORDER BY created_at DESC
    `);
    res.json({ entries: decryptRows(r.recordset, ['event_text']).map(e => ({ ...e, tags: e.tags ? e.tags.split('|') : [] })) });
  } catch (err) {
    console.error('On this day error:', err);
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

    const decrypted = decryptRows(dataResult.recordset, ['event_text', 'thoughts', 'gratitude', 'cbt_data', 'ai_emotion', 'ai_companion_message']);
    res.json({
      entries: decrypted.map(e => {
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

    const { audio: audioData, error: audioError } = validateAudio(audio_data);
    if (audioError) return res.status(400).json({ message: audioError });

    const { photos: validPhotos, error: photosError } = validatePhotos(photos);
    if (photosError) return res.status(400).json({ message: photosError });

    const tagsStr = Array.isArray(tags) ? tags.join('|') : '';
    const db      = await getPool();

    const result = await db.request()
      .input('user_id',    sql.Int,      req.user.id)
      .input('mood_score', sql.TinyInt,  mood_score)
      .input('event_text', sql.NVarChar, encryptField(event_text  || ''))
      .input('thoughts',   sql.NVarChar, encryptField(thoughts    || ''))
      .input('gratitude',  sql.NVarChar, encryptField(gratitude   || ''))
      .input('tags',       sql.NVarChar, tagsStr)
      .input('cbt_data',   sql.NVarChar, encryptField(cbtJson))
      .query(`
        INSERT INTO DiaryEntries (user_id, mood_score, event_text, thoughts, gratitude, tags, cbt_data)
        OUTPUT INSERTED.id, INSERTED.mood_score, INSERTED.tags, INSERTED.created_at
        VALUES (@user_id, @mood_score, @event_text, @thoughts, @gratitude, @tags, @cbt_data)
      `);

    // event_text/thoughts/gratitude/cbt_data đã mã hoá trong OUTPUT INSERTED — dùng lại giá trị
    // plaintext gốc còn trong biến JS cho response, khỏi phải giải mã lại.
    const entry = { ...result.recordset[0], event_text: event_text || '', thoughts: thoughts || '', gratitude: gratitude || '', cbt_data: cbtJson };
    await saveMedia(db, entry.id, validPhotos, audioData);
    await logAudit(db, entry.id, req.user.id, 'create', req);

    // Cập nhật streak
    const streakResult = await db.request().input('user_id', sql.Int, req.user.id)
      .query(`SELECT streak, last_entry, streak_freeze, max_streak, referred_by, referral_rewarded FROM Users WHERE id = @user_id`);
    const { streak, last_entry, streak_freeze, max_streak, referred_by, referral_rewarded } = streakResult.recordset[0];
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

      // Thưởng người mời khi bạn được mời duy trì streak 7 ngày (v3.4, chỉ 1 lần/người được mời)
      if (newStreak === 7 && referred_by && !referral_rewarded) {
        await db.request().input('rid', sql.Int, referred_by)
          .query(`UPDATE Users SET streak_freeze = streak_freeze + 1 WHERE id=@rid`);
        await db.request().input('user_id', sql.Int, req.user.id)
          .query(`UPDATE Users SET referral_rewarded=1 WHERE id=@user_id`);
        const { createNotification } = require('../utils/notifier');
        setImmediate(() => createNotification(referred_by, 'referral_reward',
          '🎁 Bạn nhận được 1 lượt cứu streak!',
          'Người bạn bạn mời đã duy trì streak 7 ngày liên tiếp — cảm ơn bạn đã lan tỏa Soul Diary!',
          '/settings'
        ).catch(() => {}));
      }
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
            .input('ae', sql.NVarChar, encryptField(JSON.stringify(analysis)))
            .input('cm', sql.NVarChar, encryptField(msg))
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

    const { audio: audioData, error: audioError } = validateAudio(audio_data);
    if (audioError) return res.status(400).json({ message: audioError });

    let cbtJson = null;
    if (cbt_data && typeof cbt_data === 'object') cbtJson = JSON.stringify(cbt_data);

    const { photos: validPhotos, error: photosError } = validatePhotos(photos);
    if (photosError) return res.status(400).json({ message: photosError });

    const db     = await getPool();
    const result = await db.request()
      .input('id',         sql.Int,      req.params.id)
      .input('user_id',    sql.Int,      req.user.id)
      .input('mood_score', sql.TinyInt,  mood_score)
      .input('event_text', sql.NVarChar, encryptField(event_text || ''))
      .input('thoughts',   sql.NVarChar, encryptField(thoughts   || ''))
      .input('gratitude',  sql.NVarChar, encryptField(gratitude  || ''))
      .input('tags',       sql.NVarChar, tagsStr)
      .input('cbt_data',   sql.NVarChar, encryptField(cbtJson))
      .query(`
        UPDATE DiaryEntries
        SET mood_score=@mood_score, event_text=@event_text, thoughts=@thoughts,
            gratitude=@gratitude, tags=@tags, cbt_data=@cbt_data,
            audio_data=NULL, photos=NULL, updated_at=GETDATE()
        OUTPUT INSERTED.id, INSERTED.mood_score, INSERTED.tags, INSERTED.created_at
        WHERE id=@id AND user_id=@user_id
      `);

    if (!result.recordset.length)
      return res.status(404).json({ message: 'Không tìm thấy nhật ký.' });

    const entry = { ...result.recordset[0], event_text: event_text || '', thoughts: thoughts || '', gratitude: gratitude || '', cbt_data: cbtJson };
    await db.request().input('id', sql.Int, entry.id).query('DELETE FROM DiaryMedia WHERE entry_id = @id');
    await saveMedia(db, entry.id, validPhotos, audioData);
    await logAudit(db, entry.id, req.user.id, 'update', req);

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
    const entry = decryptRow(row.recordset[0], ['event_text', 'thoughts', 'gratitude', 'ai_emotion']);
    if (entry.ai_emotion) {
      try { return res.json({ analysis: JSON.parse(entry.ai_emotion), cached: true }); } catch {}
    }
    const text = [entry.event_text, entry.thoughts, entry.gratitude].filter(Boolean).join('\n');
    if (!text.trim()) return res.json({ analysis: null });
    const analysis = await analyzeEntry(text, entry.mood_score);
    await db.request().input('id', sql.Int, req.params.id).input('ae', sql.NVarChar, encryptField(JSON.stringify(analysis)))
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
    const entry = decryptRow(row.recordset[0], ['event_text', 'thoughts', 'gratitude', 'ai_companion_message']);
    if (entry.ai_companion_message) return res.json({ message: entry.ai_companion_message, cached: true });
    const text = [entry.event_text, entry.thoughts, entry.gratitude].filter(Boolean).join('\n');
    if (!text.trim()) return res.json({ message: null });
    const message = await companionMessage(text, entry.mood_score);
    await db.request().input('id', sql.Int, req.params.id).input('m', sql.NVarChar, encryptField(message))
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
    await logAudit(db, req.params.id, req.user.id, 'delete', req);
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
    const entry    = decryptRow(r.recordset[0], ['event_text', 'thoughts', 'gratitude', 'ai_emotion', 'ai_companion_message', 'cbt_data']);
    const mediaMap = await loadMediaForEntries(db, [entry.id]);
    res.json({ entry: { ...entry, tags: entry.tags ? entry.tags.split('|') : [], photos: mediaMap.get(entry.id)?.photos || [], audio_data: mediaMap.get(entry.id)?.audio_data || null } });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

module.exports = router;
