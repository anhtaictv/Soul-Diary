const sql = require('mssql');
const { dataUriToBuffer } = require('../utils/media');

const config = {
  server:   'localhost',
  port:     1433,
  user:     'sa',
  password: 'Anhtai99@',
  database: 'NhatKyCamXuc',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10, min: 0, idleTimeoutMillis: 30000,
  },
};

let pool = null;

// Nội dung mặc định cho mục "Các đường dây hỗ trợ" (admin có thể sửa lại trong trang quản trị)
const DEFAULT_SOS_TEXT =
`🆘 Đường dây hỗ trợ tâm lý 24/7
1800 599 920 — Tư vấn khủng hoảng miễn phí, bảo mật hoàn toàn. (24/7, miễn phí)

🏥 Bệnh viện Tâm thần TP.HCM
028 3839 3957 — Khám và điều trị các vấn đề sức khỏe tâm thần. (T2–T7: 7h–16h30)

👨‍⚕️ Trung tâm Tham vấn ĐHQG HCM
028 3724 4270 — Miễn phí cho sinh viên hệ thống ĐHQG TP.HCM. (T2–T6: 8h–17h)

💬 Tổng đài sức khỏe tâm thần
1800 456 789 — Bộ Y tế, tư vấn và kết nối chuyên gia. (T2–T7: 8h–21h)

🌐 Mạng lưới Sức khỏe Tâm thần VN
info@tamthanhvn.org — Cộng đồng trực tuyến, danh sách chuyên gia chứng nhận. (Online 24/7)`;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    pool.on('error', err => {
      console.error('SQL Pool error:', err);
      pool = null;
    });
    console.log('✅ Kết nối SQL Server thành công');
  }
  return pool;
}

// Chuyển dữ liệu ảnh/audio cũ (base64 trong NVARCHAR) sang bảng DiaryMedia (VARBINARY)
async function migrateLegacyMedia() {
  const db = await getPool();
  const rows = await db.request().query(`
    SELECT id, photos, audio_data FROM DiaryEntries
    WHERE photos IS NOT NULL OR audio_data IS NOT NULL
  `);
  if (!rows.recordset.length) return;

  for (const row of rows.recordset) {
    if (row.photos) {
      let arr = [];
      try { arr = JSON.parse(row.photos); } catch {}
      for (let i = 0; i < arr.length; i++) {
        const parsed = dataUriToBuffer(arr[i]);
        if (!parsed) continue;
        await db.request()
          .input('entry_id',   sql.Int, row.id)
          .input('kind',       sql.NVarChar, 'photo')
          .input('mime',       sql.NVarChar, parsed.mime)
          .input('data',       sql.VarBinary(sql.MAX), parsed.buffer)
          .input('sort_order', sql.Int, i)
          .query(`INSERT INTO DiaryMedia (entry_id, kind, mime_type, data, sort_order)
                  VALUES (@entry_id, @kind, @mime, @data, @sort_order)`);
      }
    }
    if (row.audio_data) {
      const parsed = dataUriToBuffer(row.audio_data);
      if (parsed) {
        await db.request()
          .input('entry_id',   sql.Int, row.id)
          .input('kind',       sql.NVarChar, 'audio')
          .input('mime',       sql.NVarChar, parsed.mime)
          .input('data',       sql.VarBinary(sql.MAX), parsed.buffer)
          .input('sort_order', sql.Int, 0)
          .query(`INSERT INTO DiaryMedia (entry_id, kind, mime_type, data, sort_order)
                  VALUES (@entry_id, @kind, @mime, @data, @sort_order)`);
      }
    }
    await db.request().input('id', sql.Int, row.id)
      .query(`UPDATE DiaryEntries SET photos = NULL, audio_data = NULL WHERE id = @id`);
  }
  console.log(`✅ Đã chuyển ${rows.recordset.length} nhật ký sang lưu ảnh/audio dạng nhị phân (DiaryMedia)`);
}

async function initSchema() {
  const db = await getPool();

  // Users table
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
    CREATE TABLE Users (
      id          INT           IDENTITY(1,1) PRIMARY KEY,
      username    NVARCHAR(50)  NOT NULL UNIQUE,
      email       NVARCHAR(100) NOT NULL UNIQUE,
      password    NVARCHAR(255) NOT NULL,
      full_name   NVARCHAR(100),
      avatar_text NVARCHAR(5)   DEFAULT 'SV',
      role        NVARCHAR(20)  DEFAULT 'user',
      streak      INT           DEFAULT 0,
      last_entry  DATE,
      created_at  DATETIME2     DEFAULT GETDATE(),
      updated_at  DATETIME2     DEFAULT GETDATE()
    )
  `);

  // Thêm cột role nếu bảng Users đã tồn tại trước đó (migration an toàn)
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Users' AND COLUMN_NAME='role'
    )
    ALTER TABLE Users ADD role NVARCHAR(20) DEFAULT 'user'
  `);

  // Cache AI recap — tránh gọi Gemini nhiều lần trong ngày
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Users' AND COLUMN_NAME='ai_recap_text'
    )
    ALTER TABLE Users ADD ai_recap_text NVARCHAR(MAX) NULL
  `);
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Users' AND COLUMN_NAME='ai_recap_date'
    )
    ALTER TABLE Users ADD ai_recap_date DATE NULL
  `);

  // Thời điểm gửi push gần nhất — chống spam thông báo
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Users' AND COLUMN_NAME='last_notif_at'
    )
    ALTER TABLE Users ADD last_notif_at DATETIME2 NULL
  `);

  // Bảng lưu Web Push subscriptions
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PushSubscriptions' AND xtype='U')
    CREATE TABLE PushSubscriptions (
      id         INT           IDENTITY(1,1) PRIMARY KEY,
      user_id    INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      endpoint   NVARCHAR(MAX) NOT NULL,
      p256dh     NVARCHAR(500) NOT NULL,
      auth       NVARCHAR(200) NOT NULL,
      created_at DATETIME2     DEFAULT GETDATE()
    )
  `);

  // Bảng FeatureFlags — quản lý tính năng theo phiên bản, phát hành có kiểm soát
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FeatureFlags' AND xtype='U')
    CREATE TABLE FeatureFlags (
      id            INT           IDENTITY(1,1) PRIMARY KEY,
      flag_key      NVARCHAR(100) NOT NULL,
      label         NVARCHAR(200) NOT NULL,
      description   NVARCHAR(MAX) NULL,
      version       NVARCHAR(20)  NULL,
      version_title NVARCHAR(200) NULL,
      enabled       BIT           NOT NULL DEFAULT 0,
      release_date  DATE          NULL,
      released_at   DATETIME2     NULL,
      sort_order    INT           NOT NULL DEFAULT 0,
      created_at    DATETIME2     DEFAULT GETDATE(),
      CONSTRAINT UQ_FF_key UNIQUE (flag_key)
    )
  `);

  // Lượt cứu streak — tặng khi đạt mốc, dùng khi bỏ lỡ 1 ngày
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Users' AND COLUMN_NAME='streak_freeze'
    )
    ALTER TABLE Users ADD streak_freeze INT NOT NULL DEFAULT 1
  `);

  // Chuỗi ngày cao nhất từ trước đến nay — dùng để tính huy hiệu
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Users' AND COLUMN_NAME='max_streak'
    )
    ALTER TABLE Users ADD max_streak INT NOT NULL DEFAULT 0
  `);

  // Thời điểm gửi push nhắc check-in tâm lý hàng tuần gần nhất — chống spam
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Users' AND COLUMN_NAME='last_checkin_notif_at'
    )
    ALTER TABLE Users ADD last_checkin_notif_at DATETIME2 NULL
  `);

  // Thời điểm gửi push cảnh báo chuỗi tâm trạng tiêu cực gần nhất — chống spam
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Users' AND COLUMN_NAME='last_lowmood_notif_at'
    )
    ALTER TABLE Users ADD last_lowmood_notif_at DATETIME2 NULL
  `);

  // DiaryEntries table
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DiaryEntries' AND xtype='U')
    CREATE TABLE DiaryEntries (
      id          INT           IDENTITY(1,1) PRIMARY KEY,
      user_id     INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      mood_score  TINYINT       NOT NULL CHECK (mood_score BETWEEN 1 AND 10),
      event_text  NVARCHAR(MAX),
      thoughts    NVARCHAR(MAX),
      gratitude   NVARCHAR(MAX),
      tags        NVARCHAR(500),
      created_at  DATETIME2     DEFAULT GETDATE(),
      updated_at  DATETIME2     DEFAULT GETDATE()
    )
  `);

  // Thêm cột audio_data — lưu bản ghi âm cảm xúc dạng base64 data URI (tối đa ~30 giây)
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='DiaryEntries' AND COLUMN_NAME='audio_data'
    )
    ALTER TABLE DiaryEntries ADD audio_data NVARCHAR(MAX)
  `);

  // Kết quả phân tích cảm xúc AI — cache JSON: {emotions, themes, intensity, suggestions}
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='DiaryEntries' AND COLUMN_NAME='ai_emotion'
    )
    ALTER TABLE DiaryEntries ADD ai_emotion NVARCHAR(MAX) NULL
  `);

  // Dữ liệu viết theo hướng dẫn CBT — JSON: {event, thoughts, feelings, behavior}
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='DiaryEntries' AND COLUMN_NAME='cbt_data'
    )
    ALTER TABLE DiaryEntries ADD cbt_data NVARCHAR(MAX) NULL
  `);

  // Ảnh đính kèm nhật ký — JSON array các data URI base64 (tối đa 4 ảnh)
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='DiaryEntries' AND COLUMN_NAME='photos'
    )
    ALTER TABLE DiaryEntries ADD photos NVARCHAR(MAX) NULL
  `);

  // Lời phản hồi ấm áp của Trợ lý Tâm hồn AI — cache plain text sau khi lưu nhật ký
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='DiaryEntries' AND COLUMN_NAME='ai_companion_message'
    )
    ALTER TABLE DiaryEntries ADD ai_companion_message NVARCHAR(MAX) NULL
  `);

  // Bảng DiaryMedia — ảnh/audio đính kèm nhật ký lưu dạng VARBINARY (nhị phân gốc),
  // thay cho cột photos/audio_data NVARCHAR(MAX) base64 cũ (base64 + UTF-16 tốn ~2.7x dung lượng thật)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DiaryMedia' AND xtype='U')
    CREATE TABLE DiaryMedia (
      id         INT            IDENTITY(1,1) PRIMARY KEY,
      entry_id   INT            NOT NULL REFERENCES DiaryEntries(id) ON DELETE CASCADE,
      kind       NVARCHAR(10)   NOT NULL,
      mime_type  NVARCHAR(50)   NOT NULL,
      data       VARBINARY(MAX) NOT NULL,
      sort_order INT            NOT NULL DEFAULT 0,
      created_at DATETIME2      DEFAULT GETDATE()
    )
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_DiaryMedia_entry')
    CREATE INDEX IX_DiaryMedia_entry ON DiaryMedia(entry_id)
  `);

  // Migration 1 lần: chuyển ảnh/audio cũ (base64 NVARCHAR) sang DiaryMedia rồi xóa dữ liệu cột cũ.
  // Idempotent: chỉ những entry còn photos/audio_data NOT NULL mới được xử lý; sau khi xong
  // cột cũ được set NULL nên lần khởi động sau sẽ không còn gì để xử lý.
  await migrateLegacyMedia();

  // Articles table
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Articles' AND xtype='U')
    CREATE TABLE Articles (
      id           INT           IDENTITY(1,1) PRIMARY KEY,
      title        NVARCHAR(255) NOT NULL,
      slug         NVARCHAR(300) NOT NULL UNIQUE,
      category     NVARCHAR(50)  NOT NULL,
      summary      NVARCHAR(500),
      content      NVARCHAR(MAX) NOT NULL,
      thumbnail    NVARCHAR(10)  DEFAULT '📄',
      cover_color  NVARCHAR(20)  DEFAULT '#eef2ff',
      read_time    NVARCHAR(20)  DEFAULT '5 phút',
      is_published BIT           DEFAULT 0,
      author_id    INT           REFERENCES Users(id),
      view_count   INT           DEFAULT 0,
      created_at   DATETIME2     DEFAULT GETDATE(),
      updated_at   DATETIME2     DEFAULT GETDATE()
    )
  `);

  // Thêm cột type (đăng vào "Thư viện kiến thức" hay "Bài tập thực hành")
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Articles' AND COLUMN_NAME='type'
    )
    ALTER TABLE Articles ADD type NVARCHAR(20) NOT NULL DEFAULT 'library'
  `);

  // Settings table — lưu nội dung có thể chỉnh sửa dạng key/value (vd: đường dây hỗ trợ)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Settings' AND xtype='U')
    CREATE TABLE Settings (
      [key]      NVARCHAR(100) NOT NULL PRIMARY KEY,
      [value]    NVARCHAR(MAX),
      updated_at DATETIME2     DEFAULT GETDATE()
    )
  `);

  // Seed nội dung mặc định cho "Các đường dây hỗ trợ" nếu chưa có
  await db.request()
    .input('value', sql.NVarChar, DEFAULT_SOS_TEXT)
    .query(`
      IF NOT EXISTS (SELECT * FROM Settings WHERE [key] = 'sos_contacts')
      INSERT INTO Settings ([key], [value]) VALUES ('sos_contacts', @value)
    `);

  // Seed feature flags v1.3 — AI Thấu hiểu cảm xúc (disabled by default)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='ai_emotion_analysis')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('ai_emotion_analysis',N'AI Phân tích cảm xúc tự động',
            N'Phân tích cảm xúc, chủ đề và gợi ý ngay sau khi lưu nhật ký',
            'v1.3',N'AI Thấu hiểu cảm xúc',0,1)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='enhanced_mental_dashboard')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('enhanced_mental_dashboard',N'Dashboard sức khỏe tâm thần nâng cao',
            N'4 chỉ số mới: cảm xúc chính, ngày căng thẳng, chủ đề áp lực, xu hướng tháng',
            'v1.3',N'AI Thấu hiểu cảm xúc',0,2)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='cbt_guided_writing')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('cbt_guided_writing',N'Viết nhật ký có hướng dẫn (CBT)',
            N'Chế độ viết theo 4 bước: Sự kiện → Suy nghĩ → Cảm xúc → Hành vi',
            'v1.3',N'AI Thấu hiểu cảm xúc',0,3)
  `);

  // Bảng CheckIns — kết quả check-in sức khỏe tinh thần hàng tuần (PHQ-9/GAD-7/PSS-10/WHO-5)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CheckIns' AND xtype='U')
    CREATE TABLE CheckIns (
      id          INT           IDENTITY(1,1) PRIMARY KEY,
      user_id     INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      week_number INT           NOT NULL,
      year        INT           NOT NULL,
      raw_answers NVARCHAR(MAX) NOT NULL,
      scores      NVARCHAR(MAX) NOT NULL,
      status      NVARCHAR(20)  NOT NULL DEFAULT 'completed',
      created_at  DATETIME2     DEFAULT GETDATE(),
      CONSTRAINT UQ_CheckIns_user_week UNIQUE (user_id, year, week_number)
    )
  `);

  // Cột lưu kết quả phân tích AI hàng tuần (weekly_overview/emotional_trend/key_triggers/bright_spots/ai_recommendations)
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='CheckIns' AND COLUMN_NAME='ai_analysis'
    )
    ALTER TABLE CheckIns ADD ai_analysis NVARCHAR(MAX) NULL
  `);

  // Seed feature flag v1.4 — Check-in Sức khỏe Tinh thần hàng tuần (disabled by default)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='weekly_checkin')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('weekly_checkin',N'Check-in Sức khỏe Tinh thần hàng tuần',
            N'Bài test sàng lọc PHQ-9/GAD-7/PSS-10/WHO-5 (31 câu), nhắc nhở mỗi Thứ 7',
            'v1.4',N'Check-in Tâm lý',0,4)
  `);

  // Seed feature flags v1.5 — Nuôi dưỡng Tâm hồn (disabled by default, chờ admin bật)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='mood_calendar')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('mood_calendar',N'Bản đồ thời tiết tâm hồn',
            N'Lịch tâm trạng theo tháng dạng icon thời tiết, trực quan hóa chu kỳ cảm xúc',
            'v1.5',N'Nuôi dưỡng Tâm hồn',0,5)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='soul_companion')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('soul_companion',N'Trợ lý Tâm hồn AI',
            N'AI phản hồi ấm áp sau mỗi nhật ký và gợi ý chủ đề viết khi bí ý tưởng',
            'v1.5',N'Nuôi dưỡng Tâm hồn',0,6)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='mood_ambience')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('mood_ambience',N'Không gian theo cảm xúc',
            N'Gợi ý nhạc thư giãn và đổi màu nền theo tâm trạng khi viết nhật ký',
            'v1.5',N'Nuôi dưỡng Tâm hồn',0,7)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='soul_seed')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('soul_seed',N'Hạt mầm tâm hồn',
            N'Cây ảo trên dashboard lớn dần theo chuỗi ngày viết, héo nếu bỏ bê',
            'v1.5',N'Nuôi dưỡng Tâm hồn',0,8)
  `);

  // Seed feature flag v1.7 — Hộp thư hỗ trợ (disabled by default, chờ admin phát hành)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='inbox_support')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('inbox_support',N'Hộp thư hỗ trợ',
            N'User nhận tin nhắn/động viên/gợi ý nhạc-bài viết từ admin/counselor, hiển thị nav Hộp thư với badge chưa đọc',
            'v1.7',N'Admin Tiếp Cận Người Dùng',0,10)
  `);

  // Seed feature flag v1.6 — Lan tỏa Tâm hồn (disabled by default, chờ admin bật)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='mood_wrapped_card')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('mood_wrapped_card',N'Thẻ Cảm xúc Chia sẻ (Mood Wrapped)',
            N'Tạo ảnh tổng kết tâm trạng tuần dạng thẻ đẹp để lưu/chia sẻ, không upload lên server',
            'v1.6',N'Lan tỏa Tâm hồn',0,9)
  `);

  // Bảng AdminMessages — tin nhắn admin/counselor gửi đến user (hộp thư hỗ trợ)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AdminMessages' AND xtype='U')
    CREATE TABLE AdminMessages (
      id           INT           IDENTITY(1,1) PRIMARY KEY,
      from_user_id INT           NOT NULL REFERENCES Users(id),
      to_user_id   INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      type         NVARCHAR(20)  NOT NULL DEFAULT 'message',
      content      NVARCHAR(MAX) NOT NULL,
      meta_json    NVARCHAR(MAX) NULL,
      is_read      BIT           NOT NULL DEFAULT 0,
      created_at   DATETIME2     DEFAULT GETDATE()
    )
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_AdminMessages_to_user')
    CREATE INDEX IX_AdminMessages_to_user ON AdminMessages(to_user_id, created_at DESC)
  `);

  // Index
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_DiaryEntries_user_created')
    CREATE INDEX IX_DiaryEntries_user_created
      ON DiaryEntries(user_id, created_at DESC)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Articles_published')
    CREATE INDEX IX_Articles_published ON Articles(is_published, created_at DESC)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_CheckIns_user_created')
    CREATE INDEX IX_CheckIns_user_created ON CheckIns(user_id, created_at DESC)
  `);

  console.log('✅ Schema đã sẵn sàng');
}

// Seed tài khoản admin lần đầu
async function seedAdmin(username, email, hashedPassword) {
  const db = await getPool();
  const existing = await db.request()
    .input('email', sql.NVarChar, email)
    .input('username', sql.NVarChar, username)
    .query(`SELECT id FROM Users WHERE email = @email OR username = @username`);
  if (existing.recordset.length > 0) return false;

  await db.request()
    .input('username',    sql.NVarChar, username)
    .input('email',       sql.NVarChar, email)
    .input('password',    sql.NVarChar, hashedPassword)
    .input('full_name',   sql.NVarChar, 'Admin')
    .input('avatar_text', sql.NVarChar, 'AD')
    .query(`
      INSERT INTO Users (username, email, password, full_name, avatar_text, role)
      VALUES (@username, @email, @password, @full_name, @avatar_text, 'admin')
    `);
  return true;
}

module.exports = { getPool, initSchema, seedAdmin, sql };
