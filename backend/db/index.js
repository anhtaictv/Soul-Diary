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

  // Seed feature flags v1.7 — Heatmap cảm xúc năm + Báo cáo Admin (disabled by default)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='mood_heatmap')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('mood_heatmap',N'Heatmap Cảm xúc Năm',
            N'Lưới 52 tuần kiểu GitHub-style — mỗi ô là 1 ngày, màu sắc theo điểm tâm trạng trung bình',
            'v1.7',N'Phân tích Cảm xúc Nâng cao',0,11)
  `);

  // Feature 6: Nhắc nhở tùy chỉnh — giờ + ngày trong tuần user muốn nhận push
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='notif_hour')
    ALTER TABLE Users ADD notif_hour INT NULL
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='notif_days')
    ALTER TABLE Users ADD notif_days NVARCHAR(20) NULL
  `);

  // Feature 3: Thử thách Sức khỏe Tâm thần
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Challenges' AND xtype='U')
    CREATE TABLE Challenges (
      id            INT           IDENTITY(1,1) PRIMARY KEY,
      slug          NVARCHAR(50)  NOT NULL UNIQUE,
      title         NVARCHAR(200) NOT NULL,
      description   NVARCHAR(MAX) NOT NULL,
      duration_days INT           NOT NULL,
      category      NVARCHAR(50)  NOT NULL DEFAULT 'general',
      tasks_json    NVARCHAR(MAX) NULL,
      badge_emoji   NVARCHAR(10)  NULL,
      is_active     BIT           NOT NULL DEFAULT 1,
      sort_order    INT           NOT NULL DEFAULT 0
    )
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserChallenges' AND xtype='U')
    CREATE TABLE UserChallenges (
      id              INT       IDENTITY(1,1) PRIMARY KEY,
      user_id         INT       NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      challenge_id    INT       NOT NULL REFERENCES Challenges(id),
      started_at      DATETIME2 DEFAULT GETDATE(),
      last_checkin_at DATETIME2 NULL,
      completed_at    DATETIME2 NULL,
      current_day     INT       NOT NULL DEFAULT 0,
      is_completed    BIT       NOT NULL DEFAULT 0,
      CONSTRAINT UQ_UserChallenge UNIQUE(user_id, challenge_id)
    )
  `);

  // Seed dữ liệu 3 thử thách
  const GRATITUDE_TASKS = JSON.stringify([
    'Viết 3 điều bạn biết ơn về gia đình hôm nay',
    'Viết 3 điều bạn biết ơn về bản thân mình',
    'Viết 3 điều bạn biết ơn về những người bạn xung quanh',
    'Viết 3 điều nhỏ trong ngày khiến bạn mỉm cười',
    'Viết 3 điều bạn biết ơn về sức khỏe và cơ thể',
    'Viết 3 điều bạn biết ơn về cơ hội học tập của mình',
    'Nhìn lại 6 ngày vừa rồi — điều lớn nhất bạn nhận ra về bản thân là gì?',
  ]);
  const CBT_TASKS = JSON.stringify([
    'Ghi một tình huống căng thẳng hôm nay và cảm xúc bạn cảm thấy',
    'Suy nghĩ tự động nào xuất hiện trong đầu bạn khi đó?',
    'Suy nghĩ đó có hoàn toàn đúng không? Hãy tìm bằng chứng ủng hộ VÀ phản bác',
    'Viết một suy nghĩ thay thế cân bằng và thực tế hơn',
    'Nếu người bạn thân gặp tình huống tương tự, bạn sẽ nói gì với họ?',
    'Hành động nhỏ nhất nào bạn có thể làm ngay hôm nay để cải thiện tình hình?',
    'Ghi một lo lắng và thách thức nó: điều tệ nhất có thể xảy ra là gì và xác suất bao nhiêu?',
    'Nhận diện 1 suy nghĩ quá tiêu cực và viết lại theo cách cân bằng hơn',
    'Thực hành câu hỏi Socrates: "Suy nghĩ này có giúp ích gì cho mình không?"',
    'Liệt kê 3 thành tích bạn đạt được trong tuần — dù rất nhỏ',
    'Ghi một tình huống bạn phản ứng bằng cảm xúc và phân tích lại bằng lý trí',
    'Viết một bức thư ngắn từ "phiên bản tương lai" của bạn gửi cho bạn hiện tại',
    'Ôn lại 12 ngày — kiểu suy nghĩ tiêu cực nào hay lặp lại nhất ở bạn?',
    'Cam kết: viết 1 hành động cụ thể bạn sẽ làm khác đi khi suy nghĩ đó xuất hiện',
  ]);
  const MINDFUL_TASKS = JSON.stringify([
    'Dành 5 phút chú ý vào hơi thở. Đếm 10 nhịp thở chậm rồi ghi lại cảm giác',
    'Quan sát 5 điều nhìn thấy, 4 âm thanh nghe thấy, 3 vật bạn chạm vào',
    'Ăn một bữa chậm rãi — hoàn toàn tập trung vào hương vị và kết cấu thức ăn',
    'Đi bộ 10 phút không nhìn điện thoại — chú ý đến môi trường xung quanh',
    'Dành 5 phút không làm gì cả — không điện thoại, không nhạc, chỉ ngồi yên',
    'Ghi nhật ký về khoảnh khắc hiện tại: bạn đang ở đâu, cảm thấy gì, nghe thấy gì',
    'Thực hành quét cơ thể (body scan): từ đầu đến chân, chú ý từng vùng 30 giây',
    'Khi lo lắng xuất hiện, dừng lại và hỏi: "Điều này có đang xảy ra ngay lúc này không?"',
    'Cảm ơn 3 người trong ngày — bằng lời nói thật sự hoặc trong tâm trí',
    'Dành 10 phút trong thiên nhiên (ban công, công viên, cây xanh) và quan sát',
    'Nhận diện 3 cảm xúc bạn đã trải qua hôm nay mà không phán xét chúng',
    'Thực hành khoảng dừng chánh niệm: 3 hơi thở sâu trước mỗi hoạt động lớn',
    'Viết về điều bạn thường bỏ qua nhưng thực ra đang làm cuộc sống tốt hơn',
    'Chú ý đến một việc thường ngày (đánh răng, rửa tay) và làm hoàn toàn có ý thức',
    'Đọc lại nhật ký 2 tuần qua — sự thay đổi nào bạn nhận ra trong cảm xúc?',
    'Thực hành thiền từ bi: nghĩ đến người yêu thương và gửi tâm tư tốt lành đến họ',
    'Đặt điện thoại xuống 1 giờ và làm điều gì đó sáng tạo hoặc bạn yêu thích',
    'Khi suy nghĩ khó chịu xuất hiện, hãy hình dung nó như đám mây trôi qua — rồi để nó đi',
    'Ghi 5 điều làm bạn cảm thấy bình an hôm nay',
    'Chia sẻ khoảnh khắc chánh niệm với ai đó — nói về điều bạn đang trải nghiệm',
    'Nhìn lại 21 ngày — điều gì thay đổi trong cách bạn nhìn nhận khoảnh khắc hiện tại?',
  ]);

  await db.request().input('tasks', sql.NVarChar, GRATITUDE_TASKS).query(`
    IF NOT EXISTS (SELECT * FROM Challenges WHERE slug='gratitude_7')
    INSERT INTO Challenges (slug,title,description,duration_days,category,tasks_json,badge_emoji,sort_order)
    VALUES ('gratitude_7',N'7 Ngày Biết Ơn',
            N'Nuôi dưỡng lòng biết ơn mỗi ngày — thay đổi cách nhìn về cuộc sống chỉ trong 1 tuần',
            7,'gratitude',@tasks,N'🙏',1)
  `);
  await db.request().input('tasks', sql.NVarChar, CBT_TASKS).query(`
    IF NOT EXISTS (SELECT * FROM Challenges WHERE slug='cbt_14')
    INSERT INTO Challenges (slug,title,description,duration_days,category,tasks_json,badge_emoji,sort_order)
    VALUES ('cbt_14',N'14 Ngày Viết CBT',
            N'Học cách nhận diện và thay đổi suy nghĩ tiêu cực qua kỹ thuật CBT mỗi ngày',
            14,'cbt',@tasks,N'🧠',2)
  `);
  await db.request().input('tasks', sql.NVarChar, MINDFUL_TASKS).query(`
    IF NOT EXISTS (SELECT * FROM Challenges WHERE slug='mindful_21')
    INSERT INTO Challenges (slug,title,description,duration_days,category,tasks_json,badge_emoji,sort_order)
    VALUES ('mindful_21',N'21 Ngày Chánh Niệm',
            N'Xây dựng thói quen sống chánh niệm — chú ý vào hiện tại để giảm lo âu và stress',
            21,'mindfulness',@tasks,N'🧘',3)
  `);

  // Feature 7: Tâm sự Ẩn danh
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AnonPosts' AND xtype='U')
    CREATE TABLE AnonPosts (
      id             INT           IDENTITY(1,1) PRIMARY KEY,
      user_id        INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      content        NVARCHAR(500) NOT NULL,
      mood_tag       NVARCHAR(50)  NULL,
      sympathy_count INT           NOT NULL DEFAULT 0,
      is_hidden      BIT           NOT NULL DEFAULT 0,
      created_at     DATETIME2     DEFAULT GETDATE()
    )
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AnonReactions' AND xtype='U')
    CREATE TABLE AnonReactions (
      id         INT       IDENTITY(1,1) PRIMARY KEY,
      post_id    INT       NOT NULL REFERENCES AnonPosts(id) ON DELETE CASCADE,
      user_id    INT       NOT NULL REFERENCES Users(id),
      created_at DATETIME2 DEFAULT GETDATE(),
      CONSTRAINT UQ_AnonReact UNIQUE(post_id, user_id)
    )
  `);

  // Seed feature flags v1.7 — 4 tính năng mới (disabled by default)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='challenge_system')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('challenge_system',N'Thử thách Sức khỏe Tâm thần',
            N'Gói thử thách có cấu trúc 7/14/21 ngày: biết ơn, CBT, chánh niệm — streak riêng, huy hiệu khi hoàn thành',
            'v1.7',N'Thử thách & Cộng đồng',0,12)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='diary_export')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('diary_export',N'Xuất Nhật ký',
            N'User export nhật ký ra CSV (Excel) hoặc in PDF — tiện chia sẻ với tâm lý học đường',
            'v1.7',N'Thử thách & Cộng đồng',0,13)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='custom_reminder')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('custom_reminder',N'Nhắc nhở Tùy chỉnh',
            N'User tự chọn giờ và ngày trong tuần nhận push notification thay vì hệ thống tự tính',
            'v1.7',N'Thử thách & Cộng đồng',0,14)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='community_wall')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('community_wall',N'Tâm sự Ẩn danh',
            N'Board chia sẻ cảm xúc ẩn danh — chỉ có thể bấm 💙 Đồng cảm, không comment tự do, admin moderation',
            'v1.7',N'Thử thách & Cộng đồng',0,15)
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
