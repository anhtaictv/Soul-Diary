# 🌱 Nhật Ký Cảm Xúc Số — Full Stack

**Stack:** Node.js + Express · Microsoft SQL Server · Vanilla JS Frontend

> Ứng dụng nhật ký cảm xúc cho học sinh/sinh viên. Toàn bộ UI string, comment và commit message trong repo dùng **tiếng Việt** — giữ quy ước này khi sửa code. Dự án hiện **không có** test suite, lint config hay build step — đừng tự thêm vào.

---

## Cấu trúc dự án

```
nhat-ky-fullstack/
├── backend/
│   ├── server.js            # Express entry point
│   ├── package.json
│   ├── .env.example         # → copy thành .env và điền thông tin
│   ├── db/
│   │   └── index.js         # SQL Server pool + auto schema migration
│   ├── middleware/
│   │   └── auth.js          # JWT verification
│   └── routes/
│       ├── auth.js          # POST /register, POST /login, GET /me
│       └── diary.js         # CRUD nhật ký + stats
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── config.js        # ← ĐỔI API_URL khi deploy
        ├── data.js          # Dữ liệu tĩnh
        ├── api.js           # Fetch wrappers
        ├── auth.js          # Login/register/logout
        ├── pages.js         # HTML templates
        └── app.js           # App controller
```

---

## Cài đặt & chạy local

### 1. Backend

```bash
cd backend
cp .env.example .env        # Điền thông tin DB và JWT_SECRET
npm install
npm run dev                 # Chạy với nodemon (hot reload)
# hoặc: npm start
```

Server khởi động tại `http://localhost:3001`

Khi start lần đầu, schema tự tạo hai bảng:
- `Users` — tài khoản người dùng
- `DiaryEntries` — nhật ký cảm xúc

### 2. Frontend

Mở `frontend/index.html` bằng **VS Code Live Server** hoặc:

```bash
cd frontend
npx serve .         # http://localhost:3000
```

---

## Cấu hình `.env`

```env
PORT=3001
NODE_ENV=development

# JWT — THAY BẰNG CHUỖI RANDOM DÀI, bảo mật cao
JWT_SECRET=your_super_secret_key_change_this
JWT_EXPIRES_IN=7d

# SQL Server
DB_HOST=localhost          # hoặc IP VPS
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=your_password
DB_NAME=NhatKyCamXuc
DB_ENCRYPT=false           # true nếu dùng Azure SQL
DB_TRUST_SERVER_CERT=true  # false nếu production có cert hợp lệ

# CORS — domain frontend
FRONTEND_URL=http://localhost:5500
```

---

## Deploy lên VPS

### Bước 1: Chuẩn bị VPS

```bash
# Cài Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Cài PM2 (process manager)
npm install -g pm2

# Cài Nginx
sudo apt install -y nginx
```

### Bước 2: Upload code

```bash
# Từ máy local
scp -r nhat-ky-fullstack/ user@YOUR_VPS_IP:/var/www/

# Trên VPS
cd /var/www/nhat-ky-fullstack/backend
cp .env.example .env
nano .env           # Điền thông tin thực
npm install --production
```

### Bước 3: Cấu hình SQL Server

```sql
-- Tạo database (nếu chưa có)
CREATE DATABASE NhatKyCamXuc;
GO

-- Tạo user riêng (khuyến nghị, đừng dùng sa)
CREATE LOGIN nhatky_user WITH PASSWORD = 'StrongPassword123!';
USE NhatKyCamXuc;
CREATE USER nhatky_user FOR LOGIN nhatky_user;
ALTER ROLE db_owner ADD MEMBER nhatky_user;
GO
```

### Bước 4: Chạy backend với PM2

```bash
cd /var/www/nhat-ky-fullstack/backend
pm2 start server.js --name nhatky-api
pm2 startup    # Auto-start khi reboot
pm2 save
```

### Bước 5: Cấu hình Nginx

```nginx
# /etc/nginx/sites-available/nhatky
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend (static files)
    location / {
        root /var/www/nhat-ky-fullstack/frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nhatky /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Bước 6: Cập nhật config frontend

```javascript
// frontend/js/config.js
const CONFIG = {
  API_URL: 'https://yourdomain.com/api',  // ← Đổi thành domain thật
};
```

### Bước 7: HTTPS với Let's Encrypt (khuyến nghị)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## API Endpoints

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| POST | `/api/auth/register` | ❌ | Đăng ký tài khoản |
| POST | `/api/auth/login` | ❌ | Đăng nhập, trả về JWT |
| GET  | `/api/auth/me` | ✅ | Thông tin user hiện tại |
| PUT  | `/api/auth/profile` | ✅ | Cập nhật tên |
| GET  | `/api/diary` | ✅ | Danh sách nhật ký (phân trang) |
| POST | `/api/diary` | ✅ | Tạo nhật ký mới |
| PUT  | `/api/diary/:id` | ✅ | Sửa nhật ký |
| DELETE | `/api/diary/:id` | ✅ | Xóa nhật ký |
| GET  | `/api/diary/stats` | ✅ | Thống kê cho biểu đồ |

---

## Bảo mật đã tích hợp

- **bcryptjs** — hash mật khẩu với salt rounds = 12
- **JWT** — token hết hạn sau 7 ngày
- **Helmet** — bảo vệ các HTTP headers
- **Rate limiting** — giới hạn auth 20 req/15 phút, API 100 req/phút
- **Parameterized queries** — chống SQL injection hoàn toàn
- **CORS** — chỉ cho phép domain frontend đã cấu hình
- **Input validation** — kiểm tra phía server cho mọi input

---

## Kiến trúc chi tiết

### Backend (`backend/`)

- `server.js` — entry point Express. Mount route dưới `/api/*`, áp dụng `helmet`, `cors`, hai instance `express-rate-limit` (`authLimiter` cho `/api/auth`, `apiLimiter` cho phần còn lại), gọi `initSchema()` + `seedAdmin()` lúc khởi động trước khi listen.
- `db/index.js` — quản lý connection pool `mssql` (`getPool()`), **toàn bộ schema DB** (`initSchema()`), và `seedAdmin()`. **Config kết nối DB ở đây bị hardcode** (server/user/password/database), không đọc từ `.env` — các biến `DB_*` trong `.env` thực chất không dùng cho kết nối. Sửa `.env` sẽ không làm đổi nơi app kết nối tới.
- Schema **không có migration tool/file riêng** — `initSchema()` chạy mỗi lần boot và là nguồn sự thật duy nhất. Khi đổi schema, luôn dùng đúng pattern idempotent-guarded SQL:
  ```sql
  IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TableName' AND xtype='U') CREATE TABLE ...
  IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='X' AND COLUMN_NAME='y') ALTER TABLE X ADD y ...
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_...') CREATE INDEX ...
  ```
  (xem ví dụ bảng `Settings` / cột `Articles.type` trong `db/index.js`) — không viết migration script riêng lẻ, không giả định DB sạch.
- `routes/` — mỗi resource một router (`auth`, `diary`, `articles`, `admin`, `settings`, `features`, `checkin`). Route admin-only chain `authMiddleware, adminMiddleware`. Toàn bộ SQL dùng parameterized `db.request().input(...)`.
- `middleware/auth.js` — verify JWT, set `req.user = { id, username, email }`.
- `middleware/admin.js` — query lại `role` của user từ DB (không tin payload JWT), trả 403 nếu không phải admin.
- Role chỉ là cột string `Users.role` (`'user' | 'admin'`), không có bảng roles/permissions riêng.
- Với upsert (ví dụ `Settings`), dùng SQL `MERGE` (xem `routes/settings.js`) thay vì select-rồi-insert/update.

### Frontend (`frontend/`)

Vanilla JS, không build step, không framework. Mọi file được load qua `<script>` tag thuần trong `index.html` theo đúng thứ tự phụ thuộc: `config.js → data.js → api.js → auth.js → pages.js → admin.js → app.js`.

- Mỗi file expose đúng 1 global theo pattern IIFE-revealing-module: `const App = (() => { ...; return {...}; })();`. Method public mới phải thêm vào object `return {}`, nếu không sẽ không gọi được từ `onclick="App.xxx()"` trong template.
- `pages.js` — object `PAGES`: mỗi page một function trả về HTML string template (key trùng tên `data-page` / tham số `App.nav()`).
- `app.js` — `App.nav(page)` thay `#main-content.innerHTML = PAGES[page]()` rồi gọi hàm `init*`/`render*` riêng của page để gắn listener + fetch data. Khi thêm page mới, phải đăng ký ở cả `PAGES` và `switch` trong `nav()`.
- `api.js` — fetch wrapper mỏng (`API.xxx`); tập trung JWT bearer header, parse JSON, và xử lý 401 toàn cục → logout + reload.
- Trang admin chỉ là một page khác (`PAGES.admin`, `App.nav('admin')` → `Admin.initPage()`), không phải site riêng — dùng chung session `nhk_token`/`nhk_user`. Nút sidebar `#nav-admin` ẩn/hiện dựa vào `Auth.getUser()?.role === 'admin'` (route backend vẫn luôn enforce `adminMiddleware`). `admin.js` chứa module `Admin`: chuyển panel (Tổng quan/Bài viết/Người dùng/Cài đặt/🚀 Tính năng), editor CRUD bài viết/bài tập (EasyMDE, `#adm-editor-overlay`), promote/demote role, quản lý feature flag — toàn bộ CSS admin được scope dưới `#page-admin` (hoặc class prefix `adm-` cho editor overlay) để tránh đụng class trùng tên ở nơi khác.
- Nội dung untrusted/plain-text do admin nhập dùng `textContent` (kèm CSS `white-space:pre-wrap`), không dùng `innerHTML`, để tránh XSS — xem `renderSOSContacts`.

## Deploy (production hiện tại)

> ⚠️ Hướng dẫn "Deploy lên VPS" ở phần trên là tài liệu tham khảo chung (Linux + Nginx). **Trên thực tế, production hiện chạy trên Windows Server qua IIS + PM2**, và bản deploy là **một bản copy vật lý riêng**, không phải working directory này:

| Thành phần | Source (sửa ở đây) | Deploy/serve từ |
|---|---|---|
| Frontend | `frontend/` | `C:\inetpub\wwwroot\souldiary` (IIS site `souldiary`, binding `souldiary.work.gd`) |
| Backend | `backend/` | chạy tại chỗ, nhưng dưới PM2 process tên `souldiary-api` |

- **Sau khi sửa file frontend, phải copy file đã đổi vào `C:\inetpub\wwwroot\souldiary`** (đúng subpath, ví dụ `js/app.js`) — IIS sẽ tiếp tục serve file cũ nếu không, browser sẽ không thấy thay đổi dù hard refresh. `web.config` trong dir deploy xử lý rewrite `/api/*` → `http://localhost:3001/api/{R:1}` và SPA fallback về `index.html`.
- **Sau khi sửa file backend, phải restart PM2** (`pm2 restart souldiary-api`) để code mới có hiệu lực — `nodemon`/`npm run dev` chỉ dùng cho dev local.
- `app.set('trust proxy', 'loopback')` trong `server.js` là bắt buộc vì IIS đứng trước như reverse proxy và set `X-Forwarded-For`; bỏ dòng này sẽ làm hỏng `express-rate-limit`.

## Lịch sử phiên bản & tính năng đã build

### v1.0 — Ra mắt ứng dụng
- Đăng ký / đăng nhập JWT, nhật ký cảm xúc 1–10, tags, biểu đồ, thư viện bài viết, nhạc Jamendo, bài tập thở 4-7-8, streak hàng ngày, trang SOS.

### v1.01 — Hoàn thiện nền tảng
- Admin panel (Tổng quan/Bài viết/Người dùng/Cài đặt), CRUD bài viết EasyMDE, quản lý role, cài đặt SOS, ghi âm 30s, đính kèm ảnh, rate limiting.

### v1.2 — Giữ chân & Nâng cấp trải nghiệm
- **Streak đa mốc** — `streak_freeze` + `max_streak` (Users). Mốc 7/14/21/30/50/100 ngày tặng freeze. Modal celebration.
- **Weekly Recap** — computed frontend từ `GET /api/diary/stats?days=14`. So sánh 2 tuần.
- **Huy hiệu & Level** — 9 badges, 5 levels, computed frontend từ `totalEntries` + `max_streak`.
- **AI Weekly Summary** — Gemini `gemini-2.0-flash`, cache 1 lần/ngày vào `Users.ai_recap_text/ai_recap_date`. Rule-based fallback khi 429.
- **Web Push Notification** — bảng `PushSubscriptions`, VAPID, cron hourly `node-cron`, nhắc đúng giờ thói quen.
- 🐛 Sửa lỗi: hộp hướng dẫn cấp quyền microphone khi trình duyệt từ chối — phát hành ngay, không cần flag.
- UI: huy hiệu cuộn ngang, trang SOS thành cards, textarea tự resize.

### v1.3 — AI Thấu hiểu cảm xúc *(tính năng gate sau feature flags — bật trong admin)*
- **Feature Flag System** — bảng `FeatureFlags` (`flag_key`, `label`, `description`, `version`, `version_title`, `enabled`, `release_date`, `released_at`, `sort_order`). Route `GET/POST/PUT/DELETE /api/features/admin-list`. Frontend load `window.FEATURES` tại `App.init()`. Cron `5 17 * * *` (00:05 VN) tự bật flags đã hẹn ngày. Admin tab **🚀 Tính năng**: tạo version, thêm/toggle/xóa flag, phát hành ngay hoặc hẹn ngày.
- **AI Phân tích cảm xúc tự động** (`ai_emotion_analysis`) — cột `DiaryEntries.ai_emotion NVARCHAR(MAX)`. Endpoint `GET /api/diary/:id/emotion`: Gemini phân tích → JSON `{emotions:[{name,percent}], themes:[], intensity, suggestions:[]}`, cache vào DB. Rule-based fallback (`EMOTION_KW`/`THEME_KW`) khi Gemini quota hết. Sau lưu nhật ký, kích hoạt phân tích nền (fire-and-forget) nếu flag bật.
- **Dashboard sức khỏe tâm thần nâng cao** (`enhanced_mental_dashboard`) — endpoint `GET /api/diary/mental-health` trả 4 chỉ số: `topEmotion` (từ `ai_emotion` JSON hoặc tags), `stressDay` (ngày trong tuần avg mood thấp nhất, ≥2 mẫu), `topTheme` (chủ đề khi mood ≤ 5), `monthTrend` (`{this, last, diff}`). Section ẩn trên dashboard, hiện khi flag bật.
- **Viết nhật ký theo hướng dẫn CBT** (`cbt_guided_writing`) — cột `DiaryEntries.cbt_data NVARCHAR(MAX)` (JSON `{event, thoughts, feelings, behavior}`). Nút chọn chế độ ✍️ Tự do / 🧠 Hướng dẫn CBT trong diary page (ẩn nếu flag tắt). Entry CBT hiển thị badge `🧠 CBT` trong danh sách.

### v1.4 — Check-in Tâm lý *(tính năng gate sau feature flags — bật trong admin)*
- **Check-in Sức khỏe Tinh thần hàng tuần** (`weekly_checkin`) — bảng `CheckIns` (PHQ-9/GAD-7/PSS-10/WHO-5, 31 câu, kết quả + `ai_analysis` JSON). Route `routes/checkin.js`. Nhắc nhở mỗi Thứ 7, nav item ẩn cho đến khi flag bật.

### v1.5 — Nuôi dưỡng Tâm hồn *(tính năng gate sau feature flags — bật trong admin)*
- **Bản đồ thời tiết tâm hồn** (`mood_calendar`) — endpoint `GET /api/diary/calendar?month=YYYY-MM`. Lịch tháng hiển thị icon thời tiết (☀️🌤️⛅🌧️⛈️) suy từ `avg_mood` mỗi ngày. Toggle "📈 Biểu đồ / 📅 Lịch tâm trạng" trong trang Biểu đồ.
- **Trợ lý Tâm hồn AI** (`soul_companion`) — cột `DiaryEntries.ai_companion_message NVARCHAR(MAX)`. Endpoint `GET /api/diary/:id/companion`: Gemini trả 2-3 câu phản hồi ấm áp + câu hỏi gợi mở, fallback rule-based theo dải mood. Fire-and-forget sau khi lưu nhật ký, hiển thị trong `#companion-message-box` và khi mở lại entry. Kèm `GET /api/diary/daily-prompt` — gợi ý chủ đề viết hàng ngày (25 câu cố định theo ngày-trong-năm, không tốn quota Gemini).
- **Không gian theo cảm xúc** (`mood_ambience`) — frontend-only: nền `#diary-form-card` đổi gradient theo `MOOD_DATA[score].color` khi đổi mood; nút gợi nhạc map mood→category (`sleep/chill/focus/nature`) rồi tự chuyển sang trang Nhạc và phát đúng mood (tái dùng `GET /api/music/tracks`).
- **Hạt mầm tâm hồn** (`soul_seed`) — frontend-only: cây ảo trên dashboard, stage suy từ `user.streak` (🌰→🌱→🌿→🌳→🌳🌸→🌳🌺), héo 🥀 nếu `last_entry` cách hôm nay ≥2 ngày.

## Feature Flag — cách dùng

- `window.FEATURES` là object global được load tại `App.init()` → `loadFeatures()` từ `GET /api/features`.
- Kiểm tra trước khi hiển thị tính năng: `if (window.FEATURES && window.FEATURES.ten_flag) { ... }`
- **Không** dùng feature flag cho sửa lỗi hoặc cải tiến UI nhỏ — chỉ dùng cho tính năng mới có thể tắt/bật.
- Tên cột DB là `flag_key` (không phải `key` — `key` là reserved word trong SQL Server). SELECT dùng `flag_key AS [key]` để frontend nhận `f.key`.
- Thứ tự định nghĩa route trong `routes/features.js`: `/admin-list/release` và `/admin-list/schedule` phải đứng **trước** `/admin-list` (POST) để tránh Express match `release`/`schedule` như `:key` param.

## Lưu ý / Gotchas (đã từng gặp lỗi)

- `seedAdmin()` phải check trùng trên **cả** `email` và `username` (`WHERE email = @email OR username = @username`) — chỉ check email có thể đụng `UNIQUE` constraint trên `username` lúc khởi động, throw, trigger `process.exit(1)` → PM2 restart loop vô hạn → port 3001 không bao giờ mở → IIS trả 502 cho mọi user. Nếu thấy 502 + PM2 restart count cao, kiểm tra `pm2 logs souldiary-api` để tìm lỗi DB lúc khởi động trước.
- `server.js` log `process.env.DB_HOST` lúc boot, nhưng `db/index.js` không đọc `DB_HOST`/`DB_*` từ env, cũng không dùng key tên `DB_HOST` (key trong `.env` là `DB_SERVER`) — log line đó gây hiểu lầm/không có tác dụng, config kết nối thật chỉ nằm trong `db/index.js`.
- **SQL Server reserved keyword làm tên cột** — `key`, `value`, `name`, `type`, `order`, `group`, `index` đều là reserved word. Nếu dùng làm tên cột phải bọc `[brackets]` hoặc đặt tên khác (ví dụ `flag_key` thay vì `key`). Lỗi `Incorrect syntax near the keyword 'key'` trong `initSchema()` gây PM2 restart loop ngay khi khởi động.
- **Gemini 429 quota** — `gemini-2.0-flash` free tier bị giới hạn. Mọi endpoint gọi Gemini đều phải có rule-based fallback (xem `smart-recap` và `analyzeEntry` trong `routes/diary.js`). Không để lỗi Gemini làm crash request.
- **`window.FEATURES` chỉ load 1 lần** tại `App.init()` — nếu admin bật flag mới trong cùng phiên, user phải reload trang mới thấy tính năng. Đây là intentional để tránh race condition.

---

> ⚠️ **Tuyên bố miễn trừ trách nhiệm**: Ứng dụng không thay thế liệu pháp tâm lý chuyên môn.
