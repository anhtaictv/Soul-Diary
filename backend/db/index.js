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

  // ── v1.8: Soul Chat AI ────────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SoulChatMessages' AND xtype='U')
    CREATE TABLE SoulChatMessages (
      id         INT           IDENTITY(1,1) PRIMARY KEY,
      user_id    INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      role       NVARCHAR(10)  NOT NULL,
      content    NVARCHAR(MAX) NOT NULL,
      created_at DATETIME2     DEFAULT GETDATE()
    )
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_SoulChat_user_created')
    CREATE INDEX IX_SoulChat_user_created ON SoulChatMessages(user_id, created_at DESC)
  `);

  // ── v1.8: Theo dõi Giấc ngủ — thêm cột vào DiaryEntries ──────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='DiaryEntries' AND COLUMN_NAME='sleep_hours')
    ALTER TABLE DiaryEntries ADD sleep_hours FLOAT NULL
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='DiaryEntries' AND COLUMN_NAME='sleep_quality')
    ALTER TABLE DiaryEntries ADD sleep_quality INT NULL
  `);

  // ── v1.8: Lịch Học tập ────────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='StudyEvents' AND xtype='U')
    CREATE TABLE StudyEvents (
      id          INT           IDENTITY(1,1) PRIMARY KEY,
      user_id     INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      title       NVARCHAR(200) NOT NULL,
      event_type  NVARCHAR(20)  NOT NULL DEFAULT 'other',
      event_date  DATE          NOT NULL,
      notes       NVARCHAR(500) NULL,
      is_done     BIT           NOT NULL DEFAULT 0,
      created_at  DATETIME2     DEFAULT GETDATE()
    )
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_StudyEvents_user_date')
    CREATE INDEX IX_StudyEvents_user_date ON StudyEvents(user_id, event_date ASC)
  `);

  // ── v1.8: Mini Courses ────────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MiniCourses' AND xtype='U')
    CREATE TABLE MiniCourses (
      id           INT           IDENTITY(1,1) PRIMARY KEY,
      slug         NVARCHAR(50)  NOT NULL UNIQUE,
      title        NVARCHAR(200) NOT NULL,
      description  NVARCHAR(MAX) NOT NULL,
      lessons_json NVARCHAR(MAX) NOT NULL,
      badge_emoji  NVARCHAR(10)  NULL,
      category     NVARCHAR(50)  NOT NULL DEFAULT 'general',
      duration_min INT           NOT NULL DEFAULT 30,
      is_active    BIT           NOT NULL DEFAULT 1,
      sort_order   INT           NOT NULL DEFAULT 0
    )
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserCourseProgress' AND xtype='U')
    CREATE TABLE UserCourseProgress (
      id           INT       IDENTITY(1,1) PRIMARY KEY,
      user_id      INT       NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      course_id    INT       NOT NULL REFERENCES MiniCourses(id),
      lesson_index INT       NOT NULL DEFAULT 0,
      completed_at DATETIME2 NULL,
      updated_at   DATETIME2 DEFAULT GETDATE(),
      CONSTRAINT UQ_UserCourse UNIQUE(user_id, course_id)
    )
  `);

  // Seed 3 mini-courses
  const COURSE1_LESSONS = JSON.stringify([
    { title:'Lo âu là gì?', body:'Lo âu là phản ứng tự nhiên của não bộ trước nguy hiểm. Hệ thần kinh giao cảm (fight-or-flight) kích hoạt tim đập nhanh, thở gấp, cơ căng — để chuẩn bị cho bạn đối phó. Vấn đề là khi não nhầm lẫn, xem kỳ thi hay buổi thuyết trình là "mối đe dọa sinh tử". Bài học đầu tiên: lo âu không nguy hiểm, nó chỉ là tín hiệu. Hãy đặt tay lên ngực và cảm nhận nhịp tim — bạn ổn.', duration_min:5 },
    { title:'Thở để bình tĩnh', body:'Khi lo âu, hơi thở là công cụ mạnh nhất bạn có. Thở ra dài hơn thở vào kích hoạt hệ thần kinh phó giao cảm — đưa cơ thể về trạng thái bình tĩnh trong vòng 90 giây. Thử ngay: hít vào 4 giây, thở ra 6 giây, lặp lại 5 lần. Bài tập 4-7-8 trong phần Bài tập cũng rất hiệu quả. Thực hành mỗi sáng 2 phút — não bộ sẽ học được cách bình tĩnh nhanh hơn.', duration_min:8 },
    { title:'Thách thức suy nghĩ lo lắng', body:'CBT (Liệu pháp Nhận thức Hành vi) dạy chúng ta: cảm xúc đến từ suy nghĩ, không phải từ sự kiện. Khi lo lắng "Mình sẽ thi trượt", não bộ không phân biệt đây là sự thật hay chỉ là nỗi sợ. Hãy hỏi: "Bằng chứng nào cho thấy điều này sẽ xảy ra?" và "Điều tệ nhất thực sự là gì và mình có thể đối phó không?". Ghi lại câu trả lời — ngôn ngữ viết tắt hoạt động hợp lý hơn ngôn ngữ nói.', duration_min:10 },
    { title:'Tiếp xúc dần dần', body:'Lo âu giảm đi khi bạn đối mặt — không phải né tránh. Graduated Exposure (tiếp xúc dần dần) là kỹ thuật được chứng minh nhất để vượt qua lo âu. Tạo "thang nỗi sợ" từ 0-10: bắt đầu từ tình huống lo lắng nhất ít nhất (mức 2-3), ở lại với cảm giác đó cho đến khi giảm xuống còn một nửa, rồi tiến lên bậc tiếp theo. Não bộ học được: "Lo âu không kéo dài mãi và mình an toàn".', duration_min:12 },
    { title:'Kế hoạch phòng ngừa', body:'Bây giờ bạn đã có hộp công cụ: thở có kiểm soát, thách thức suy nghĩ, tiếp xúc dần dần. Bước cuối cùng: tạo kế hoạch cá nhân. Xác định 3 trigger lo âu chính của bạn. Với mỗi trigger, chọn 1 kỹ thuật sẽ dùng. Luyện tập KHI KHÔNG lo lắng — như tập thể dục khi khỏe, không phải khi ốm. Chia sẻ kế hoạch với một người bạn tin tưởng để có thêm trách nhiệm giải trình.', duration_min:8 },
  ]);
  const COURSE2_LESSONS = JSON.stringify([
    { title:'Khoa học Hạnh phúc', body:'Martin Seligman (cha đẻ Tâm lý học Tích cực) phát hiện hạnh phúc gồm 5 thành phần: Positive emotions (cảm xúc tích cực), Engagement (đắm chìm), Relationships (mối quan hệ), Meaning (ý nghĩa), Achievement (thành tựu) — mô hình PERMA. Tin tốt: hạnh phúc 40% phụ thuộc vào hành động của bạn, 50% di truyền, 10% hoàn cảnh. 40% đó là vùng bạn có thể thay đổi ngay hôm nay.', duration_min:6 },
    { title:'Sức mạnh Biết ơn', body:'Nghiên cứu Emmons & McCullough: viết nhật ký biết ơn 3 lần/tuần tăng hạnh phúc 25% sau 6 tuần. Lý do: não bộ có xu hướng chú ý đến tiêu cực (negativity bias) — biết ơn là cách chủ động cân bằng lại. Bài tập "3 điều tốt": mỗi tối viết 3 điều tốt đã xảy ra và LÝ DO tại sao. Phần lý do quan trọng hơn — nó buộc não xử lý sâu hơn, không chỉ liệt kê.', duration_min:8 },
    { title:'Mục tiêu có ý nghĩa', body:'Nghiên cứu của Deci & Ryan: có 3 nhu cầu tâm lý cơ bản: Autonomy (tự chủ), Competence (năng lực), Relatedness (kết nối). Mục tiêu nào thỏa mãn cả 3 sẽ bền vững và mang lại hạnh phúc thật sự. Hỏi bản thân: "Mục tiêu này có phải của mình hay của người khác?" (Autonomy). "Mình có khả năng đạt được không?" (Competence). "Nó kết nối mình với điều gì lớn hơn?" (Relatedness). Đặt mục tiêu phần Mục tiêu trong app để theo dõi.', duration_min:10 },
    { title:'Nuôi dưỡng Kết nối', body:'Robert Waldinger (Harvard Study of Adult Development — nghiên cứu 80 năm): yếu tố quyết định nhất sức khỏe và hạnh phúc lâu dài là CHẤT LƯỢNG mối quan hệ. Không phải số lượng bạn bè, không phải tiền bạc. Kết nối sâu giải phóng oxytocin — hormone chống stress tự nhiên. Hành động nhỏ hàng ngày: nhắn tin hỏi thăm một người, ăn cơm không nhìn điện thoại, lắng nghe để hiểu chứ không phải để trả lời.', duration_min:7 },
    { title:'Tìm kiếm Ý nghĩa', body:'Viktor Frankl (nhà tâm lý học sống sót qua Holocaust): con người có thể chịu đựng bất kỳ HOW nếu có WHY. Ý nghĩa không phải tìm được — nó được TẠO RA. 3 nguồn ý nghĩa: Tạo ra (công việc, sáng tạo), Trải nghiệm (tình yêu, cái đẹp, sự thật), Thái độ (cách bạn đối mặt với đau khổ không thể tránh). Bài tập: viết câu trả lời cho "Nếu mình chỉ còn 1 năm sống, mình sẽ làm gì?" — câu trả lời đó thường chỉ ra điều thực sự có ý nghĩa.', duration_min:9 },
  ]);
  const COURSE3_LESSONS = JSON.stringify([
    { title:'Hiểu stress học đường', body:'Stress học đường không xấu — nó cho thấy bạn quan tâm. Vấn đề là khi stress kéo dài và vượt quá khả năng đối phó. Mô hình Yerkes-Dodson: hiệu suất đạt đỉnh ở mức stress VỪA PHẢI — quá ít thì buồn ngủ, quá nhiều thì tê liệt. Nhận biết "stress tốt" (eustress) và "stress độc" (distress). Stress tốt: deadline thúc đẩy bạn làm việc. Stress độc: mất ngủ, không tập trung, cảm thấy tuyệt vọng. Viết nhật ký mood mỗi ngày để theo dõi pattern.', duration_min:7 },
    { title:'Quản lý thời gian', body:'Ma trận Eisenhower: phân loại công việc theo Khẩn cấp × Quan trọng. Quan trọng + Khẩn cấp → làm ngay. Quan trọng + Không khẩn cấp → lên kế hoạch (đây là vùng phát triển thật sự). Khẩn cấp + Không quan trọng → giao người khác hoặc làm nhanh. Không quan trọng + Không khẩn cấp → loại bỏ. Sinh viên thường bị mắc kẹt ở ô "Khẩn cấp + Quan trọng" vì bỏ qua ô "Quan trọng + Chưa khẩn cấp". Lịch học tập trong app giúp bạn lập kế hoạch trước.', duration_min:9 },
    { title:'Học tập hiệu quả', body:'Spaced Repetition (Lặp lại cách quãng): ôn lại sau 1 ngày → 3 ngày → 1 tuần → 2 tuần. Hiệu quả hơn 300% so với nhồi nhét. Active Recall: tự kiểm tra thay vì đọc lại — đóng sách, viết lại những gì nhớ được. Pomodoro: 25 phút tập trung + 5 phút nghỉ (sau 4 pomodoro nghỉ dài 15-30 phút). Ngủ đủ 7-8 tiếng: trong giấc ngủ não củng cố ký ức — thiếu ngủ xóa bỏ đi những gì vừa học. Theo dõi giấc ngủ trong phần Nhật ký.', duration_min:10 },
    { title:'Xử lý áp lực thi cử', body:'Test anxiety (lo âu thi cử) ảnh hưởng 25-40% sinh viên và thực sự làm giảm điểm. Chiến lược trước kỳ thi: ôn tập "cách khoảng" 2-3 tuần trước, không nhồi nhét đêm trước. Đêm trước thi: ngủ đủ giấc (quan trọng hơn ôn thêm 2 tiếng). Sáng thi: ăn sáng protein + carb phức hợp, thở sâu 5 phút. Trong phòng thi: đọc toàn bộ đề trước, làm câu dễ trước. Sau khi kết thúc câu khó: thở 3 hơi sâu rồi tiếp tục.', duration_min:8 },
    { title:'Cân bằng học và sống', body:'"Cân bằng" không có nghĩa là dành thời gian bằng nhau cho mọi thứ — mà là đầu tư thời gian đúng chỗ vào đúng lúc. Wheel of Life: vẽ bánh xe với 8 lĩnh vực (học tập, sức khỏe, gia đình, bạn bè, sở thích, tài chính, tâm linh, phát triển cá nhân), chấm điểm 0-10 mỗi ô. Lĩnh vực nào thấp nhất? Đó là ưu tiên tiếp theo. Nghỉ ngơi không phải là lãng phí thời gian — nó là đầu tư cho hiệu suất dài hạn. Lên lịch nghỉ ngơi như lên lịch học.', duration_min:9 },
  ]);

  await db.request().input('lessons', sql.NVarChar, COURSE1_LESSONS).query(`
    IF NOT EXISTS (SELECT * FROM MiniCourses WHERE slug='anxiety_management')
    INSERT INTO MiniCourses (slug,title,description,lessons_json,badge_emoji,category,duration_min,sort_order)
    VALUES ('anxiety_management',N'Quản lý Lo âu',
            N'5 bài học dựa trên CBT và khoa học thần kinh để hiểu và kiểm soát lo âu hiệu quả',
            @lessons,N'🧠','anxiety',43,1)
  `);
  await db.request().input('lessons', sql.NVarChar, COURSE2_LESSONS).query(`
    IF NOT EXISTS (SELECT * FROM MiniCourses WHERE slug='happiness_science')
    INSERT INTO MiniCourses (slug,title,description,lessons_json,badge_emoji,category,duration_min,sort_order)
    VALUES ('happiness_science',N'Khoa học Hạnh phúc',
            N'5 bài học từ Tâm lý học Tích cực về hạnh phúc thật sự — không phải hạnh phúc thoáng qua',
            @lessons,N'✨','positive',40,2)
  `);
  await db.request().input('lessons', sql.NVarChar, COURSE3_LESSONS).query(`
    IF NOT EXISTS (SELECT * FROM MiniCourses WHERE slug='study_stress')
    INSERT INTO MiniCourses (slug,title,description,lessons_json,badge_emoji,category,duration_min,sort_order)
    VALUES ('study_stress',N'Vượt qua Áp lực Học tập',
            N'5 bài học thực tiễn về quản lý stress học đường, kỹ thuật học tập và cân bằng cuộc sống',
            @lessons,N'📚','study',43,3)
  `);

  // ── v1.8: Mục tiêu Cá nhân ───────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PersonalGoals' AND xtype='U')
    CREATE TABLE PersonalGoals (
      id           INT           IDENTITY(1,1) PRIMARY KEY,
      user_id      INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      title        NVARCHAR(200) NOT NULL,
      goal_type    NVARCHAR(20)  NOT NULL,
      target_value FLOAT         NOT NULL,
      period_days  INT           NOT NULL DEFAULT 30,
      is_active    BIT           NOT NULL DEFAULT 1,
      achieved_at  DATETIME2     NULL,
      created_at   DATETIME2     DEFAULT GETDATE()
    )
  `);

  // ── v1.8: Feature flags ───────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='soul_chat')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('soul_chat',N'Soul Chat — Trò chuyện AI',
            N'Chatbot tâm lý AI (Gemini), lắng nghe và phản hồi ấm áp, nhận diện khủng hoảng, giới hạn 20 tin/ngày',
            'v1.8',N'Soul Chat & Theo dõi Toàn diện',0,16)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='sleep_tracking')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('sleep_tracking',N'Theo dõi Giấc ngủ',
            N'Ghi giờ ngủ và chất lượng giấc ngủ kèm nhật ký, biểu đồ tương quan mood-giấc ngủ',
            'v1.8',N'Soul Chat & Theo dõi Toàn diện',0,17)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='study_calendar')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('study_calendar',N'Lịch Học tập',
            N'Ghi lịch thi/deadline/bài tập, nhắc nhở trước 1 ngày qua push notification',
            'v1.8',N'Soul Chat & Theo dõi Toàn diện',0,18)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='mini_courses')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('mini_courses',N'Khóa học Tâm lý Ngắn',
            N'3 khóa học 5 bài theo chủ đề: Quản lý Lo âu, Khoa học Hạnh phúc, Vượt qua Áp lực Học tập',
            'v1.8',N'Học liệu & Mục tiêu',0,19)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='year_review')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('year_review',N'Tổng kết Năm',
            N'Trang nhìn lại cả năm: tổng nhật ký, mood trung bình, tháng tốt nhất, chuỗi dài nhất, tag hay dùng nhất',
            'v1.8',N'Học liệu & Mục tiêu',0,20)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='personal_goals')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('personal_goals',N'Mục tiêu Cá nhân',
            N'Đặt và theo dõi mục tiêu tâm lý: mood trung bình, chuỗi ngày, số nhật ký trong khoảng thời gian',
            'v1.8',N'Học liệu & Mục tiêu',0,21)
  `);

  // Bảng PasswordResets — token đặt lại mật khẩu (hết hạn sau 1 giờ)
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PasswordResets' AND xtype='U')
    CREATE TABLE PasswordResets (
      id         INT           IDENTITY(1,1) PRIMARY KEY,
      user_id    INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      token_hash NVARCHAR(100) NOT NULL UNIQUE,
      expires_at DATETIME2     NOT NULL,
      used_at    DATETIME2     NULL,
      created_at DATETIME2     DEFAULT GETDATE()
    )
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

  // ── v1.9: Feature flags ───────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='dark_mode')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('dark_mode',N'Chế độ tối (Dark Mode)',
            N'Giao diện tối bảo vệ mắt, phù hợp dùng ban đêm — toggle ngay trong sidebar',
            'v1.9',N'Trải nghiệm Cá nhân hoá',1,22)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='diary_search')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('diary_search',N'Tìm kiếm Nhật ký',
            N'Tìm kiếm toàn văn trong tất cả nhật ký đã viết theo từ khóa, tag và khoảng thời gian',
            'v1.9',N'Trải nghiệm Cá nhân hoá',1,23)
  `);

  // ── Bảng FutureLetters — thư gửi tương lai ──────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FutureLetters' AND xtype='U')
    CREATE TABLE FutureLetters (
      id         INT           IDENTITY(1,1) PRIMARY KEY,
      user_id    INT           NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      title      NVARCHAR(200) NOT NULL,
      content    NVARCHAR(MAX) NOT NULL,
      send_date  DATE          NOT NULL,
      sent       BIT           DEFAULT 0,
      created_at DATETIME2     DEFAULT GETDATE()
    )
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_FutureLetters_send_date')
    CREATE INDEX IX_FutureLetters_send_date ON FutureLetters(send_date, sent)
  `);

  // ── v2.0: Feature flags ─────────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='memory_card')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('memory_card',N'Thẻ kỷ niệm',
            N'Tạo thẻ ảnh đẹp từ nhật ký để lưu và chia sẻ',
            'v2.0',N'Đột phá v2.0',1,24)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='future_letter')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('future_letter',N'Thư gửi tương lai',
            N'Viết thư cho bản thân trong tương lai, tự động gửi email đúng ngày',
            'v2.0',N'Đột phá v2.0',1,25)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='pin_lock')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('pin_lock',N'Khoá PIN',
            N'Bảo vệ nhật ký bằng mã PIN 4 chữ số',
            'v2.0',N'Đột phá v2.0',1,26)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='ai_patterns')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('ai_patterns',N'AI Phân tích xu hướng',
            N'Phân tích pattern cảm xúc 90 ngày: ngày tốt nhất, tệ nhất, xu hướng',
            'v2.0',N'Đột phá v2.0',1,27)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='weekly_missions')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('weekly_missions',N'Nhiệm vụ hàng tuần',
            N'5 nhiệm vụ thử thách mỗi tuần với phần thưởng kinh nghiệm',
            'v2.0',N'Đột phá v2.0',1,28)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='data_export')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('data_export',N'Xuất dữ liệu',
            N'Tải toàn bộ nhật ký và dữ liệu cá nhân về máy định dạng JSON',
            'v2.0',N'Đột phá v2.0',1,29)
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key='offline_mode')
    INSERT INTO FeatureFlags (flag_key,label,description,version,version_title,enabled,sort_order)
    VALUES ('offline_mode',N'Chế độ Offline',
            N'Viết nhật ký khi mất mạng, tự đồng bộ khi có kết nối lại',
            'v2.0',N'Đột phá v2.0',1,30)
  `);

  // ── v2.2: Custom Avatar & Bio ────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='bio')
    ALTER TABLE Users ADD bio NVARCHAR(300) NULL
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' AND COLUMN_NAME='avatar_url')
    ALTER TABLE Users ADD avatar_url NVARCHAR(MAX) NULL
  `);

  // ── v2.2: Chia sẻ Entry ──────────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='DiaryEntries' AND COLUMN_NAME='share_token')
    ALTER TABLE DiaryEntries ADD share_token NVARCHAR(64) NULL
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_DiaryEntries_share_token')
    CREATE INDEX IX_DiaryEntries_share_token ON DiaryEntries(share_token)
  `);

  // ── v2.4: Phản tư cuối tuần ──────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WeeklyReflections' AND xtype='U')
    CREATE TABLE WeeklyReflections (
      id           INT IDENTITY PRIMARY KEY,
      user_id      INT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      week_start   DATE NOT NULL,
      q1           NVARCHAR(MAX),
      q2           NVARCHAR(MAX),
      q3           NVARCHAR(MAX),
      q4           NVARCHAR(MAX),
      q5           NVARCHAR(MAX),
      created_at   DATETIME2 DEFAULT GETDATE(),
      CONSTRAINT UQ_Reflection_user_week UNIQUE (user_id, week_start)
    )
  `);

  // ── v2.1 → v2.4: Seed feature flags (disabled mặc định) ─────────────────
  const v22flags = [
    { key: 'pwa_install',         label: 'Cài đặt PWA',                desc: 'Nút 📲 trong sidebar cho phép cài Soul Diary về màn hình chính',    ver: 'v2.1', title: 'Sửa lỗi & Cải tiến UX', sort: 210 },
    { key: 'pin_management',      label: 'Quản lý PIN',                 desc: 'Phần Khóa PIN trong Cài đặt > Bảo mật (đặt/đổi/xóa PIN)',           ver: 'v2.1', title: 'Sửa lỗi & Cải tiến UX', sort: 211 },
    { key: 'avatar_bio',          label: 'Avatar & Tiểu sử',           desc: 'Upload ảnh đại diện và viết bio ngắn trong trang Hồ sơ',             ver: 'v2.2', title: 'Nâng cấp Cá nhân hoá', sort: 220 },
    { key: 'long_recording',      label: 'Ghi âm 120 giây',            desc: 'Nâng giới hạn ghi âm nhật ký từ 30s lên 120 giây',                   ver: 'v2.2', title: 'Nâng cấp Cá nhân hoá', sort: 221 },
    { key: 'smart_notification',  label: 'Nhắc nhở thông minh',        desc: 'Gợi ý giờ viết nhật ký dựa trên thói quen 90 ngày qua',              ver: 'v2.2', title: 'Nâng cấp Cá nhân hoá', sort: 222 },
    { key: 'share_entry',         label: 'Chia sẻ nhật ký',            desc: 'Tạo link public cho từng entry, thu hồi được bất cứ lúc nào',        ver: 'v2.2', title: 'Nâng cấp Cá nhân hoá', sort: 223 },
    { key: 'friend_streaks',      label: 'Streak bạn bè',              desc: 'Thêm bạn qua username, xem bảng xếp hạng streak',                    ver: 'v2.3', title: 'Streak Bạn bè & Nhật ký Định kỳ', sort: 230 },
    { key: 'diary_templates',     label: 'Nhật ký định kỳ (Template)', desc: 'Lưu template viết sẵn, áp dụng nhanh vào form nhật ký',              ver: 'v2.3', title: 'Streak Bạn bè & Nhật ký Định kỳ', sort: 231 },
    { key: 'monthly_report',      label: 'Báo cáo tháng',              desc: 'Thống kê tháng: avg mood, top tags, ngày tốt nhất, xu hướng theo tuần', ver: 'v2.4', title: 'Báo cáo Cá nhân & Phản tư Tuần', sort: 240 },
    { key: 'weekly_reflection',   label: 'Phản tư cuối tuần',          desc: '5 câu hỏi hướng dẫn mỗi Chủ nhật, lưu lại để xem lại sau',            ver: 'v2.4', title: 'Báo cáo Cá nhân & Phản tư Tuần', sort: 241 },
    { key: 'quick_mood_log',      label: 'Quick Mood Log',              desc: 'Widget 5 emoji trên dashboard, ghi mood 1 chạm không cần mở form',    ver: 'v2.4', title: 'Báo cáo Cá nhân & Phản tư Tuần', sort: 242 },
  ];
  for (const f of v22flags) {
    await db.request()
      .input('k', sql.NVarChar(100), f.key)
      .input('l', sql.NVarChar(200), f.label)
      .input('d', sql.NVarChar,      f.desc)
      .input('v', sql.NVarChar(20),  f.ver)
      .input('t', sql.NVarChar(200), f.title)
      .input('s', sql.Int,           f.sort)
      .query(`
        IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key=@k)
        INSERT INTO FeatureFlags(flag_key, label, description, version, version_title, enabled, sort_order)
        VALUES(@k, @l, @d, @v, @t, 0, @s)
      `);
  }

  // ── v2.3: Streak bạn bè ──────────────────────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Friendships' AND xtype='U')
    CREATE TABLE Friendships (
      id           INT IDENTITY PRIMARY KEY,
      user_id      INT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      friend_id    INT NOT NULL REFERENCES Users(id),
      [status]     NVARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at   DATETIME2 DEFAULT GETDATE(),
      CONSTRAINT UQ_Friendship UNIQUE (user_id, friend_id)
    )
  `);
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_Friendships_friend')
    CREATE INDEX IX_Friendships_friend ON Friendships(friend_id, [status])
  `);

  // ── v2.3: Nhật ký định kỳ (templates) ───────────────────────────────────
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DiaryTemplates' AND xtype='U')
    CREATE TABLE DiaryTemplates (
      id               INT IDENTITY PRIMARY KEY,
      user_id          INT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      title            NVARCHAR(200) NOT NULL,
      content          NVARCHAR(MAX),
      gratitude        NVARCHAR(MAX),
      tags             NVARCHAR(500),
      default_mood     INT DEFAULT 5,
      created_at       DATETIME2 DEFAULT GETDATE()
    )
  `);

  // Index
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_DiaryEntries_user_created')
    CREATE INDEX IX_DiaryEntries_user_created
      ON DiaryEntries(user_id, created_at DESC)
  `);
  // Index hỗ trợ tìm kiếm nhanh theo tags
  await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_DiaryEntries_tags')
    CREATE INDEX IX_DiaryEntries_tags ON DiaryEntries(user_id, tags)
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
