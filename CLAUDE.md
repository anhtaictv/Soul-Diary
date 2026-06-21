# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Nhật Ký Cảm Xúc Số" (Soul Diary) — an emotional diary web app for students. Node.js/Express + MS SQL Server backend, vanilla JS frontend (no framework/bundler). All UI strings, comments, and commit-style messages in this repo are in Vietnamese — match that when editing.

## Commands

Backend (`backend/`):
```bash
npm install
npm run dev      # nodemon, hot reload, http://localhost:3001
npm start        # node server.js
```
There is no test suite, lint config, or build step in this project — don't invent one.

Frontend (`frontend/`): static files, no build step. Open `index.html` with VS Code Live Server, or:
```bash
npx serve .      # http://localhost:3000
```
`frontend/js/config.js` holds `CONFIG.API_URL` — must point at the right backend URL per environment (relative `/api` in production behind the IIS proxy, full localhost URL for local dev against a separately-running backend).

## Architecture

### Backend (`backend/`)
- `server.js` — Express entry point. Mounts routes under `/api/*`, applies `helmet`, `cors`, two `express-rate-limit` instances (`authLimiter` for `/api/auth`, `apiLimiter` for everything else), and calls `initSchema()` + `seedAdmin()` on startup before listening.
- `db/index.js` — owns the `mssql` connection pool (`getPool()`), the **entire DB schema** (`initSchema()`), and `seedAdmin()`. **The DB connection config here is hardcoded** (server/user/password/database), not read from `.env` — `.env`'s `DB_*` vars are effectively unused for the connection itself. Keep this in mind when debugging DB connectivity issues; editing `.env` alone won't change where the app connects.
- Schema has **no migration tool/files** — `initSchema()` runs on every boot and is the single source of truth. The pattern for any schema change is idempotent guarded SQL:
  ```sql
  IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TableName' AND xtype='U') CREATE TABLE ...
  IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='X' AND COLUMN_NAME='y') ALTER TABLE X ADD y ...
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_...') CREATE INDEX ...
  ```
  Follow this exact pattern (see `Settings` table / `Articles.type` column additions in `db/index.js`) — never write a one-off migration script or assume a clean DB.
- `routes/` — one router per resource (`auth`, `diary`, `articles`, `admin`, `settings`, `features`). Admin-only routes chain `authMiddleware, adminMiddleware`. All SQL uses parameterized `db.request().input(...)`.
- `middleware/auth.js` — verifies JWT, sets `req.user = { id, username, email }`.
- `middleware/admin.js` — re-queries the user's `role` from DB (doesn't trust the JWT payload) and 403s non-admins.
- Roles are just a `Users.role` string column (`'user' | 'admin'`); there's no separate roles/permissions table.
- For upserts (e.g. `Settings`), use SQL `MERGE` (see `routes/settings.js`) rather than select-then-insert/update.

### Frontend (`frontend/`)
Vanilla JS, no build step, no framework. Everything is loaded as plain `<script>` tags in `index.html` in dependency order: `config.js → data.js → api.js → auth.js → pages.js → admin.js → app.js`.
- Each file exposes a single global via the IIFE-revealing-module pattern: `const App = (() => { ...; return {...}; })();`. New public methods must be added to the `return {}` object or they're inaccessible from `onclick="App.xxx()"` handlers in templates.
- `pages.js` — `PAGES` object: one function per page returning an HTML string template (keyed by the same names as `data-page` attributes / `App.nav()` arguments).
- `app.js` — `App.nav(page)` swaps `#main-content.innerHTML = PAGES[page]()` then calls a page-specific `init*`/`render*` function to wire up listeners and fetch data. When adding a page, register it in both `PAGES` and the `switch` in `nav()`.
- `api.js` — thin `fetch` wrapper (`API.xxx`); centralizes the JWT bearer header, JSON parsing, and global 401 → logout-and-reload handling.
- The admin dashboard is just another page (`PAGES.admin`, `App.nav('admin')` → `Admin.initPage()`), not a separate site — it shares the single `nhk_token`/`nhk_user` session. The `#nav-admin` sidebar button is shown/hidden in `App.init()` based on `Auth.getUser()?.role === 'admin'` (server-side routes still enforce `adminMiddleware` regardless). `admin.js` houses the `Admin` module: panel switching (Tổng quan/Bài viết/Người dùng/Cài đặt/**🚀 Tính năng**), the article/exercise CRUD editor (EasyMDE-based, `#adm-editor-overlay` in `index.html`), user role promote/demote, và feature flag management — all admin-specific CSS is scoped under `#page-admin` (or `adm-` prefixed classes for the editor overlay) in `style.css` to avoid colliding with same-named classes elsewhere.
- Render untrusted/plain-text admin-authored content with `textContent` (paired with CSS `white-space:pre-wrap`), not `innerHTML`, to avoid XSS — see `renderSOSContacts`.

## Deployment (IMPORTANT — separate source vs. served copy)

Production runs on this same Windows Server via **IIS + PM2**, and the deployed files are a **separate physical copy**, not the working directory:

| Component | Source (edited here) | Deployed/served from |
|---|---|---|
| Frontend | `frontend/` | `C:\inetpub\wwwroot\souldiary` (IIS site `souldiary`, binding `souldiary.work.gd`) |
| Backend | `backend/` | runs in place, but as PM2 process named `souldiary-api` |

**After editing frontend files, you must copy the changed files into `C:\inetpub\wwwroot\souldiary` (matching subpaths, e.g. `js/app.js`) — IIS will keep serving stale files otherwise, and the browser will show no change even after a hard refresh.** `web.config` in the deployed dir handles `/api/*` → `http://localhost:3001/api/{R:1}` rewriting and SPA fallback to `index.html`.

After editing backend files, restart the PM2 process (`pm2 restart souldiary-api`) so the new code takes effect — `nodemon`/`npm run dev` is for local dev only.

`app.set('trust proxy', 'loopback')` in `server.js` is required because IIS sits in front as a reverse proxy and sets `X-Forwarded-For`; removing it breaks `express-rate-limit`.

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

## Gotchas learned the hard way

- `seedAdmin()` must check for collisions on **both** `email` and `username` (`WHERE email = @email OR username = @username`) — checking email alone can hit a `UNIQUE` constraint on `username` on startup, throw, and trigger `process.exit(1)` → an infinite PM2 restart loop → port 3001 never opens → IIS 502 to all users. If you see a 502 + high PM2 restart count, check `pm2 logs souldiary-api` for a startup-time DB error first.
- `server.js` logs `process.env.DB_HOST` at boot, but `db/index.js` neither reads `DB_HOST`/`DB_*` from env nor uses a key named `DB_HOST` (the `.env` key is `DB_SERVER`) — that log line is misleading/dead and the real connection settings live only in `db/index.js`.
- **SQL Server reserved keywords làm tên cột** — `key`, `value`, `name`, `type`, `order`, `group`, `index` đều là reserved words. Nếu dùng làm tên cột phải bọc trong `[brackets]` hoặc đặt tên khác (ví dụ `flag_key` thay vì `key`). Lỗi `Incorrect syntax near the keyword 'key'` trong `initSchema()` gây PM2 restart loop ngay khi khởi động.
- **Gemini 429 quota** — `gemini-2.0-flash` free tier bị giới hạn. Mọi endpoint gọi Gemini đều phải có rule-based fallback (xem `smart-recap` và `analyzeEntry` trong `routes/diary.js`). Không để lỗi Gemini làm crash request.
- **`window.FEATURES` chỉ load 1 lần** tại `App.init()` — nếu admin bật flag mới trong cùng phiên, user phải reload trang mới thấy tính năng. Đây là intentional để tránh race condition.
