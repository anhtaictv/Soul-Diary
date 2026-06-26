require('dotenv').config();
console.log('DB_HOST:', process.env.DB_HOST);

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const bcrypt     = require('bcryptjs');
const cron       = require('node-cron');
const { initSchema, seedAdmin, getPool, sql } = require('./db');
const { webpush } = require('./routes/push');
const { getCheckinWeek } = require('./utils/checkinWeek');

const app  = express();
const PORT = process.env.PORT || 3001;

// IIS đứng trước proxy /api/* → tin tưởng header X-Forwarded-For từ localhost
app.set('trust proxy', 'loopback');

// Một số request đến với X-Forwarded-For dạng "IP:PORT" (proxy/bot gửi sai định dạng)
// → req.ip trả về chuỗi không phải IP hợp lệ, khiến express-rate-limit ném ValidationError
// (ERR_ERL_INVALID_IP_ADDRESS) chưa được bắt → unhandled rejection → crash toàn bộ tiến trình
// (đây là nguyên nhân của loạt restart liên tục khiến site thỉnh thoảng "không vào được").
// Cắt bỏ phần ":port" thừa trước khi đưa cho rate limiter để tránh ném lỗi.
function safeKeyGenerator(req) {
  const ip = req.ip || '';
  const m  = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/);
  return m ? m[1] : ip;
}

// Chốt chặn cuối — không để một promise bị từ chối mà không ai bắt làm sập cả server
process.on('unhandledRejection', (err) => {
  console.error('⚠️  Unhandled rejection (đã chặn để server không crash):', err);
});

// ── Security middleware ───────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: false,
  methods: ['GET', 'POST','PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting — chống brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 phút
  max: 20,
  message: { message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeKeyGenerator,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,    // 1 phút
  max: 100,
  message: { message: 'Quá nhiều yêu cầu.' },
  keyGenerator: safeKeyGenerator,
});

// 3mb — đủ cho payload nhật ký kèm bản ghi âm base64 ~30 giây (chặn kích thước thật ở routes/diary.js)
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',  authLimiter, require('./routes/auth'));
app.use('/api/diary', apiLimiter,  require('./routes/diary'));
app.use('/api/articles', apiLimiter,  require('./routes/articles'));
app.use('/api/admin',    apiLimiter,  require('./routes/admin'));
app.use('/api/settings', apiLimiter,  require('./routes/settings'));
app.use('/api/music',    apiLimiter,  require('./routes/music'));
app.use('/api/push',     apiLimiter,  require('./routes/push').router);
app.use('/api/features', apiLimiter,  require('./routes/features'));
app.use('/api/check-in',   apiLimiter, require('./routes/checkin'));
app.use('/api/inbox',      apiLimiter, require('./routes/inbox'));
app.use('/api/challenges', apiLimiter, require('./routes/challenges'));
app.use('/api/community',  apiLimiter, require('./routes/community'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint không tồn tại.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Lỗi server không xác định.' });
});

// ── Cron: Push notification nhắc nhở thông minh (chạy mỗi giờ) ──────────
cron.schedule('0 * * * *', async () => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const db = await getPool();
    // Giờ hiện tại theo múi giờ Việt Nam (UTC+7)
    const vnHour = (new Date().getUTCHours() + 7) % 24;

    // Lấy danh sách user cần gửi nhắc nhở:
    // – Có subscription, chưa viết hôm nay, chưa nhận push trong 20h gần nhất, ≥3 bài
    const result = await db.request().query(`
      SELECT
        u.id, u.streak, u.streak_freeze, u.notif_days,
        ps.endpoint, ps.p256dh, ps.auth,
        (SELECT TOP 1 mood_score FROM DiaryEntries
         WHERE user_id = u.id ORDER BY created_at DESC) AS last_mood,
        COALESCE(
          u.notif_hour,
          ISNULL(
            (SELECT CAST(AVG(CAST(DATEPART(HOUR, DATEADD(HOUR,7,created_at)) AS FLOAT)) AS INT)
             FROM (SELECT TOP 20 created_at FROM DiaryEntries WHERE user_id = u.id ORDER BY created_at DESC) r
            ), 20
          )
        ) AS preferred_hour
      FROM Users u
      INNER JOIN PushSubscriptions ps ON ps.user_id = u.id
      WHERE
        (u.last_entry IS NULL OR u.last_entry < CAST(GETDATE() AS DATE))
        AND (u.last_notif_at IS NULL OR DATEDIFF(HOUR, u.last_notif_at, GETDATE()) >= 20)
        AND (SELECT COUNT(*) FROM DiaryEntries WHERE user_id = u.id) >= 3
    `);

    // Lọc theo giờ ưa thích (±1h) và ngày trong tuần (nếu đã cài)
    const vnDow = (new Date().getUTCDay()); // 0=CN, 1=T2, ..., 6=T7
    const toNotify = result.recordset.filter(u => {
      const hourOk = Math.abs(vnHour - (u.preferred_hour || 20)) <= 1;
      const dayOk  = !u.notif_days || u.notif_days.split(',').map(Number).includes(vnDow);
      return hourOk && dayOk;
    });

    for (const u of toNotify) {
      let body;
      const m = u.last_mood;
      if      (m !== null && m <= 4)  body = `Hôm qua bạn cảm thấy không tốt lắm. Hôm nay thế nào rồi? 💙`;
      else if (m !== null && m >= 8)  body = `Hôm qua bạn đang rất tốt (${m}/10)! Tiếp tục duy trì nhé 😊`;
      else if (u.streak > 0)          body = `Chuỗi ${u.streak} ngày 🔥 đang chờ bạn — đừng để streak bị mất nhé!`;
      else                            body = 'Hãy ghi một điều bạn cảm nhận hôm nay. Chỉ cần một câu thôi 🌱';

      try {
        await webpush.sendNotification(
          { endpoint: u.endpoint, keys: { p256dh: u.p256dh, auth: u.auth } },
          JSON.stringify({ title: 'Soul Diary 📖', body }),
        );
        await db.request()
          .input('id', sql.Int, u.id)
          .query('UPDATE Users SET last_notif_at = GETDATE() WHERE id = @id');
      } catch (pushErr) {
        // Subscription hết hạn → xóa tự động
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          await db.request()
            .input('ep', sql.NVarChar, u.endpoint)
            .query('DELETE FROM PushSubscriptions WHERE endpoint = @ep');
        }
      }
    }
    if (toNotify.length > 0) console.log(`📬 Đã gửi push cho ${toNotify.length} người dùng`);
  } catch (err) {
    console.error('Push cron error:', err.message);
  }
});

// ── Cron: Push nhắc Check-in Sức khỏe Tinh thần (9h sáng Thứ 7, giờ VN) ──
cron.schedule('0 * * * *', async () => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const vnDate = new Date(Date.now() + 7 * 3600 * 1000);
    if (vnDate.getUTCDay() !== 6 || vnDate.getUTCHours() !== 9) return; // chỉ chạy 9h sáng Thứ 7 (giờ VN)

    const db = await getPool();

    const flagRes = await db.request().query(
      `SELECT enabled FROM FeatureFlags WHERE flag_key='weekly_checkin'`
    );
    if (!flagRes.recordset.length || !flagRes.recordset[0].enabled) return;

    const { year, weekNumber } = getCheckinWeek();

    const result = await db.request()
      .input('year', sql.Int, year)
      .input('week', sql.Int, weekNumber)
      .query(`
        SELECT u.id, ps.endpoint, ps.p256dh, ps.auth
        FROM Users u
        INNER JOIN PushSubscriptions ps ON ps.user_id = u.id
        WHERE NOT EXISTS (
          SELECT 1 FROM CheckIns c WHERE c.user_id = u.id AND c.year = @year AND c.week_number = @week
        )
        AND (u.last_checkin_notif_at IS NULL OR CAST(u.last_checkin_notif_at AS DATE) < CAST(GETDATE() AS DATE))
      `);

    let sentCount = 0;
    for (const u of result.recordset) {
      try {
        await webpush.sendNotification(
          { endpoint: u.endpoint, keys: { p256dh: u.p256dh, auth: u.auth } },
          JSON.stringify({ title: 'Soul Diary 📖', body: 'Đến lúc check-in sức khỏe tinh thần tuần này rồi — chỉ mất khoảng 5 phút 🧪' }),
        );
        await db.request()
          .input('id', sql.Int, u.id)
          .query('UPDATE Users SET last_checkin_notif_at = GETDATE() WHERE id = @id');
        sentCount++;
      } catch (pushErr) {
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          await db.request()
            .input('ep', sql.NVarChar, u.endpoint)
            .query('DELETE FROM PushSubscriptions WHERE endpoint = @ep');
        }
      }
    }
    if (sentCount > 0) console.log(`📬 Đã gửi nhắc check-in cho ${sentCount} người dùng`);
  } catch (err) {
    console.error('Check-in reminder cron error:', err.message);
  }
});

// ── Cron: Cảnh báo chuỗi tâm trạng tiêu cực (8h sáng giờ VN = 1h UTC) ──────
cron.schedule('0 1 * * *', async () => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    const db = await getPool();
    // Lấy user có 7 ngày nhật ký gần nhất đều avg_mood ≤ 4 + có push subscription + chưa nhận cảnh báo hôm nay
    const result = await db.request().query(`
      SELECT u.id, ps.endpoint, ps.p256dh, ps.auth
      FROM Users u
      INNER JOIN PushSubscriptions ps ON ps.user_id = u.id
      WHERE (u.last_lowmood_notif_at IS NULL OR CAST(u.last_lowmood_notif_at AS DATE) < CAST(GETDATE() AS DATE))
        AND u.id IN (
          SELECT user_id FROM (
            SELECT user_id, CAST(created_at AS DATE) AS d,
                   AVG(CAST(mood_score AS FLOAT)) AS avg_m,
                   ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY CAST(created_at AS DATE) DESC) AS rn
            FROM DiaryEntries
            GROUP BY user_id, CAST(created_at AS DATE)
          ) daily
          WHERE rn <= 7
          GROUP BY user_id
          HAVING COUNT(*) = 7 AND SUM(CASE WHEN avg_m <= 4 THEN 1 ELSE 0 END) = 7
        )
    `);
    let sentCount = 0;
    for (const u of result.recordset) {
      try {
        await webpush.sendNotification(
          { endpoint: u.endpoint, keys: { p256dh: u.p256dh, auth: u.auth } },
          JSON.stringify({
            title: 'Soul Diary 💙',
            body: 'Bạn đã có những ngày không dễ dàng. Bạn không cần đối mặt một mình — hãy xem đường dây hỗ trợ nhé.',
            url: '/sos',
          }),
        );
        await db.request()
          .input('id', sql.Int, u.id)
          .query('UPDATE Users SET last_lowmood_notif_at = GETDATE() WHERE id = @id');
        sentCount++;
      } catch (pushErr) {
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          await db.request()
            .input('ep', sql.NVarChar, u.endpoint)
            .query('DELETE FROM PushSubscriptions WHERE endpoint = @ep');
        }
      }
    }
    if (sentCount > 0) console.log(`💙 Đã gửi cảnh báo tâm trạng tiêu cực cho ${sentCount} người dùng`);
  } catch (err) {
    console.error('Low mood cron error:', err.message);
  }
});

// ── Cron: Tự động phát hành tính năng theo lịch hẹn (chạy lúc 00:05 giờ VN = 17:05 UTC) ──
cron.schedule('5 17 * * *', async () => {
  try {
    const db = await getPool();
    const r  = await db.request().query(`
      UPDATE FeatureFlags SET enabled=1, released_at=GETDATE(), release_date=NULL
      WHERE release_date IS NOT NULL
        AND release_date <= CAST(DATEADD(HOUR,7,GETDATE()) AS DATE)
        AND enabled=0
    `);
    if (r.rowsAffected[0] > 0)
      console.log(`[cron] Đã tự động phát hành ${r.rowsAffected[0]} tính năng theo lịch hẹn`);
  } catch (e) {
    console.error('[cron] Lỗi auto-release:', e.message);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initSchema();

    // Tạo tài khoản admin lần đầu từ .env
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass  = process.env.ADMIN_PASSWORD;
    const adminUser  = process.env.ADMIN_USERNAME || 'admin';
    if (adminEmail && adminPass) {
      const hashed  = await bcrypt.hash(adminPass, 12);
      const created = await seedAdmin(adminUser, adminEmail, hashed);
      if (created) console.log(`✅ Tạo tài khoản admin: ${adminEmail}`);
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server: http://localhost:${PORT}`);
      console.log(`   Env: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Không khởi động được:', err.message);
    process.exit(1);
  }
}

start();