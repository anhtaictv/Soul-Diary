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
- **Feature Flag System** — bảng `FeatureFlags` (`flag_key`, `label`, `description`, `version`, `version_title`, `enabled`, `release_date`, `released_at`, `sort_order`). Route `GET/POST/PUT/DELETE /api/features/admin-list`, cộng `POST /api/features/admin-list/release|schedule|revoke`. Frontend load `window.FEATURES` tại `App.init()`. Cron `5 17 * * *` (00:05 VN) tự bật flags đã hẹn ngày. Admin tab **🚀 Tính năng**: tạo version, thêm/toggle/xóa flag, phát hành ngay hoặc hẹn ngày, và **thu hồi cập nhật** (tắt toàn bộ flag của 1 version, xoá `released_at`/`release_date` để quay lại bản nháp — phát hành lại bất cứ lúc nào qua nút 🚀 Phát hành).
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

### v1.9 — Trải nghiệm Cá nhân hoá
*Bao gồm: sửa lỗi tồn đọng, tối ưu hiệu năng, cải thiện UI/UX, và 4 tính năng mới*

**Sửa lỗi:**
- XSS trong `printDiaryPDF`: escape nội dung user (`escapeHtml`) trước khi inject vào print window + thêm `resp.ok` check
- Toast message: có thể click để đóng sớm; không bị chồng timer khi gọi liên tiếp
- API timeout 15 giây (AbortController) — tránh request treo vô hạn khi mất mạng

**Tối ưu hiệu năng:**
- Music cache (`musicCache[mood]`) — không gọi lại API Jamendo khi đổi mood qua lại trong cùng phiên
- Backend endpoint `GET /api/diary/search` dùng tham số hóa SQL đúng chuẩn, kèm index `IX_DiaryEntries_tags`

**Tính năng mới (enabled=1 ngay từ đầu, không cần admin bật):**
- **Dark Mode** (`dark_mode`) — toggle 🌙/☀️ trong sidebar footer, lưu vào `localStorage('nhk_dark')`. CSS variables override qua `body.dark-mode`. Áp dụng ngay khi `App.init()`.
- **Tìm kiếm Nhật ký** (`diary_search`) — ô tìm kiếm + bộ lọc ngày trong trang Nhật ký. Backend `GET /api/diary/search?q=&from=&to=` (TOP 50, LIKE search trên event_text/thoughts/gratitude/tags). `App.searchDiary()` / `App.clearSearch()`.
- **Theme System** — 6 theme màu sắc chọn qua nút 🎨 trong sidebar footer. Lưu vào `localStorage('nhk_theme')`, áp dụng ngay tại `App.init()` qua `applyTheme()`. Mỗi theme ghi đè `--primary`, `--primary-light`, `--primary-dark`, `--sidebar-bg`, `--shadow-md` trên `:root` bằng `body.theme-xxx`. Theme **Đêm Tím** (`midnight`) tự set dark bg/surface/text (luôn tối, không phụ thuộc dark mode toggle). Theme **Nâu Ấm** (`warm`) cũng tint `--bg`/`--surface` thành kem ấm. 5 theme còn lại compose được với Dark Mode.

  | key | Tên | `--primary` | `--sidebar-bg` |
  |---|---|---|---|
  | `` (mặc định) | Xanh Dương | `#2563eb` | `#1a2744` |
  | `lavender` | Tím Oải Hương | `#7C3AED` | `#2D1B69` |
  | `rose` | Hồng Đào | `#DB2777` | `#500724` |
  | `emerald` | Xanh Lá Rừng | `#059669` | `#064E3B` |
  | `warm` | Nâu Ấm Nhật Ký | `#B45309` | `#451A03` |
  | `ocean` | Xanh Biển Sâu | `#0891B2` | `#164E63` |
  | `midnight` | Đêm Tím | `#818CF8` | `#0F0F23` |

  CSS: các block `body.theme-xxx { ... }` ở cuối `style.css`, kèm `.theme-picker-popup` / `.theme-swatch` widget styles. JS: `App.applyTheme(name)`, `App.toggleThemePicker()` trong `app.js`.

  **Mỗi theme override đầy đủ:** body background (gradient), `--surface`, `--border`, `.stat-card`, `.tag`, `.entry-item:hover`, auth screen blobs — không chỉ primary + sidebar. Dark mode có 4 lớp phân tầng: `#0D1117 → #161B22 → #21262D → #2D333B`.

- **Phân trang Nhật ký** — mặc định hiện 5 entry mới nhất (`DIARY_PAGE_SIZE = 5`). Nút `.btn-load-more` hiện số còn lại và load thêm 5 cái tiếp theo, cộng dồn vào `cachedEntries`. Dùng pagination sẵn có của backend (`GET /api/diary?page=&limit=`, trả về `pagination.total`). `App.loadMoreDiary()` tăng `_diaryPage` rồi gọi lại `loadDiaryEntries(false)`.

### v2.0 — Phiên bản Đột phá

- **PWA & Offline** (`offline_mode`) — Service Worker v2 (`sw.js`): cache-first cho static, network-first cho API, trả 503 JSON khi offline. `manifest.webmanifest` nâng cấp: shortcuts, categories, orientation. Banner offline phát hiện `navigator.onLine` qua events. `initOfflineDetection()` gọi trong `App.init()`.
- **Memory Card** (`memory_card`) — Canvas API 900×480px tạo PNG với gradient theo theme đang chọn, hiển thị streak/số nhật ký/mood gần nhất + quote ngẫu nhiên. `App.showMemoryCard()` → download PNG.
- **Thư gửi tương lai** (`future_letter`) — bảng `FutureLetters` (user_id, subject, content, send_date, sent). Route `GET/POST/DELETE /api/letters`. Cron 1h UTC gửi email qua `utils/mailer.js` (nodemailer + SMTP env vars). Frontend: trang `future-letter` với form tạo thư + danh sách thư chờ. `App.createFutureLetter()`, `App.deleteFutureLetter(id)`.
- **PIN Lock** (`pin_lock`) — overlay 4 chữ số, hash SHA-256 lưu `localStorage('nhk_pin')`, session unlock lưu `sessionStorage('nhk_pin_ok')`. Không cần backend. `App.pinInput(digit)`, `App.pinDelete()`, `App.setPinLock(pin)`. Gọi `_checkPinRequired()` mỗi lần `App.init()`.
- **Xuất dữ liệu** (`data_export`) — `GET /api/user/export` trả JSON gồm tất cả diary entries, check-in, future letters, goals. Frontend: `App.exportUserData()` → Blob → download JSON. Nằm trong trang `missions`.
- **AI Pattern Insights** (`ai_patterns`) — `GET /api/diary/patterns`: mood trung bình theo ngày trong tuần (90 ngày), xu hướng monthly (3 tháng), overall stats, top tags. Frontend: biểu đồ bar đơn giản bằng div CSS, hiển thị trong trang `missions`.
- **Nhiệm vụ tuần** (`weekly_missions`) — 5 nhiệm vụ tính từ trạng thái user hiện tại (wrote today, streak ≥7, read article, breathing, 10 entries total). Thanh tiến độ `doneCount/5`. Không persist — computed each visit. Trang `missions` gộp cả Memory Card + AI Patterns + Data Export.

  **Backend mới:** `backend/routes/letters.js`, `backend/routes/user.js`, `backend/utils/mailer.js`.  
  **Frontend mới:** `PAGES['future-letter']`, `PAGES['missions']` trong `pages.js`. Nav items `#nav-future-letter`, `#nav-missions` (hidden, reveal by flags).  
  **CSS mới:** `.pin-overlay`, `.pin-card`, `.pin-key`, `.mission-card`, `.offline-banner`, `.btn-sm`, `.btn-secondary` trong `style.css`.

### v2.1 — Sửa lỗi & Cải tiến UX

- **PWA install button** — nút 📲 trong sidebar footer, ẩn cho đến khi `beforeinstallprompt` kích hoạt. `App.installPWA()`.
- **PIN management trong Settings** — tab Bảo mật > phần Khóa PIN với nút Đặt/Đổi PIN và Xóa PIN. `App.managePinLock(action)`, `App.refreshPinStatus()`.
- **Canvas font fix** — Memory Card dùng `"Segoe UI", "Noto Sans", system-ui` thay Georgia/Times New Roman để hiển thị tiếng Việt đúng dấu.

### v2.2 — Nâng cấp Cá nhân hoá & Kết nối

- **Avatar & Tiểu sử** (`enabled=1 ngay`) — cột `Users.bio NVARCHAR(300)` + `Users.avatar_url NVARCHAR(MAX)`. Route `PUT /api/auth/profile` cập nhật cả hai. Settings > Hồ sơ có avatar upload (canvas resize 200×200 → base64 JPEG) + bio textarea. Sidebar hiện ảnh thay text khi `avatar_url` tồn tại.
- **Ghi âm 120s** — `MAX_RECORD_SECONDS` nâng từ 30 → 120 giây.
- **Nhắc nhở thông minh** — `GET /api/auth/writing-pattern`: tìm giờ hay viết nhất trong 90 ngày (SQL `DATEPART(HOUR, created_at)`). Settings > Thông báo hiện gợi ý + nút "Áp dụng" vào `set-notif-hour`.
- **Radar chart cảm xúc** (`ai_emotion_analysis` flag) — `GET /api/diary/emotion-radar`: tổng hợp `ai_emotion` JSON từ 30 entry gần nhất, trả `{emotions:[{name,avgPercent}], entryCount}`. Toggle "🕸 Radar cảm xúc" trong trang Biểu đồ. `App.renderEmotionRadar()` dùng Chart.js `type:'radar'`.
- **Chia sẻ entry** — cột `DiaryEntries.share_token NVARCHAR(64)`. Routes: `POST /api/diary/:id/share` (sinh token bằng `crypto.randomBytes(32).toString('hex')`), `GET /api/diary/share/:token` (public, **đứng trước** `router.use(authMiddleware)` trong diary.js), `DELETE /api/diary/:id/share` (thu hồi). Frontend: nút 🔗 trong entry modal → `shareCurrentEntry()` → share modal với copy link + thu hồi. Public view `/share/<token>` được handle trong `auth.js` `bootstrap()` — detect URL pattern, gọi `API.getSharedEntry(token)`, render inline HTML không cần login.

  **Gotcha share routes**: `GET /api/diary/share/:token` phải đăng ký **trước** `router.use(authMiddleware)` trong `routes/diary.js` vì router đó áp auth cho toàn bộ. `POST /api/diary/:id/share` và `DELETE /api/diary/:id/share` đăng ký sau auth bình thường.

### v2.3 — Streak Bạn bè & Nhật ký Định kỳ *(gate sau feature flags — bật trong admin)*

- **Streak bạn bè** (`friend_streaks`) — bảng `Friendships` (user_id, friend_id, status 'pending'|'accepted', UNIQUE constraint + index `IX_Friendships_friend`). Route `routes/friends.js`:
  - `GET /api/friends` — danh sách bạn bè đã chấp nhận + streak, sorted theo streak DESC
  - `GET /api/friends/requests` — lời mời đang chờ gửi đến mình
  - `POST /api/friends/request` — gửi lời mời theo username (kiểm tra tồn tại 2 chiều)
  - `PUT /api/friends/:id/accept` — chấp nhận lời mời
  - `DELETE /api/friends/:id` — xóa bạn hoặc từ chối lời mời
  - Frontend: trang `friends` với bảng xếp hạng streak (🥇🥈🥉), form thêm bạn bằng username, section lời mời đang chờ ẩn khi trống.
  - Badge `#friends-badge` (`.nav-badge-dot`) trên nav-friends, load tại `App.init()` và cập nhật sau mỗi chấp nhận/từ chối. `App.loadFriendsBadge()`.

- **Nhật ký định kỳ (Templates)** (`diary_templates`) — bảng `DiaryTemplates` (user_id, title, content, gratitude, tags, default_mood). Route `routes/templates.js`:
  - `GET /api/templates` — danh sách template của user
  - `POST /api/templates` — tạo mới (giới hạn 20/user)
  - `PUT /api/templates/:id` — cập nhật template
  - `DELETE /api/templates/:id` — xóa template
  - Frontend: trang `templates` với form tạo/sửa template (title, content, gratitude, tags bằng dấu phẩy → lưu `|`, mood 1-10). Nút ✏️ Sửa điền lại form + đổi nút thành "Cập nhật". Nút 📋 Dùng template trong diary form (ẩn khi user chưa có template) → modal picker chọn và áp vào form nhật ký. `App.createTemplate()`, `App.editTemplate(id)`, `App.saveEditTemplate(id)`, `App.openTemplatePicker()`, `App.applyTemplate(id)`.

### v2.4 — Báo cáo Cá nhân & Phản tư Tuần *(gate sau feature flags — bật trong admin)*

- **Báo cáo tháng** (`monthly_report`) — endpoint `GET /api/diary/monthly-report?month=YYYY-MM` trả: `totalEntries`, `avgMood`, `entryDays`, `bestDay/worstDay` (date + avg), `topTags[5]` (sort by count), `moodByWeek[]` (avg + count per DATEPART week). Frontend: trang `report` với month picker, stats cards, biểu đồ bar tuần (CSS div), top tags. `App.loadMonthlyReport()`.

- **Phản tư cuối tuần** (`weekly_reflection`) — bảng `WeeklyReflections` (user_id, week_start DATE UNIQUE, q1..q5 NVARCHAR(MAX)). Route `routes/reflections.js`: `GET /current` (tuần hiện tại), `GET /` (10 tuần gần nhất), `POST /` (upsert qua SQL MERGE). Week start = Thứ Hai (ISO). Badge `#reflection-badge` trên nav-reflection hiện vào Thứ 7/CN nếu chưa phản tư tuần này. Trang `reflection`: form 5 câu hỏi, banner "đã làm rồi" khi reload, lịch sử xếp theo tuần. `App.submitReflection()`, `App.loadReflectionBadge()`.

- **Quick Mood Log** (`quick_mood_log`) — frontend-only widget `#quick-mood-widget` trên dashboard. 5 emoji (😢😕😐🙂😄 → mood 2/4/6/8/10). Click → `App.quickLogMood(score)` gọi `POST /api/diary` với entry minimal (mood_score, event_text rỗng). Nếu đã viết nhật ký hôm nay, hiện mood hiện tại thay vì emoji picker. Widget ẩn mặc định (`display:none`), chỉ render khi flag bật.

### v2.5 — Habit Tracker & Kỷ niệm *(gate sau feature flags — bật trong admin)*

- **Habit Tracker** (`habit_tracker`) — bảng `Habits` (id, user_id, name, icon, sort_order, created_at) + `HabitLogs` (id, habit_id, user_id, log_date DATE, UNIQUE UQ_HabitLog). Route `routes/habits.js`: `GET /api/habits` (list + 7-day done[] + streak + done_today), `POST /api/habits` (create, max 5), `DELETE /api/habits/:id`, `POST /api/habits/:id/log` (toggle: insert nếu chưa có, delete nếu rồi). Frontend: trang `habits` (nav `#nav-habits`, ẩn mặc định) với form tạo (icon + name) + danh sách 7-day dot grid + streak badge + toggle button. Dashboard widget `#habit-dashboard-widget` (compact checklist hôm nay + progress bar). `App.initHabitsPage()`, `App.createHabit()`, `App.deleteHabit(id)`, `App.toggleHabit(id,btn)`, `App.renderHabitDashboardWidget()`.

- **Gợi ý bài tập cảm xúc** (`exercise_suggest`) — frontend-only modal overlay `#exercise-suggest-overlay` xuất hiện khi mood ≤ 6 sau khi lưu nhật ký (`saveDiaryEntry`) hoặc quick mood log (`quickLogMood`). Bảng gợi ý theo nhóm mood: ≤3 → Body Scan + Thở 4-7-8, ≤5 → Thở hộp + PMR, ≤6 → 5-4-3-2-1 + Biết ơn. Mỗi bài tập là nút gọi trực tiếp modal tương ứng rồi đóng overlay. `_showExerciseSuggest(score)` (internal).

- **Ghim nhật ký** (`pinned_entries`) — cột `DiaryEntries.is_pinned BIT NOT NULL DEFAULT 0`. Endpoint `PATCH /api/diary/:id/pin` toggle is_pinned (max 5 pinned enforced server-side, trả `{is_pinned}`). Section `#pinned-entries-section` trên dashboard hiện các entry đã ghim (click → openEntry). Nút `#entry-pin-btn` trong entry modal (ẩn nếu flag tắt) → `App.togglePinEntry()` cập nhật button text + cache + re-render section. `App.renderPinnedEntries(entries)`, `App.togglePinEntry()`.

  **Backend mới:** `backend/routes/habits.js`.  
  **Frontend mới:** `PAGES['habits']` trong `pages.js`. Nav item `#nav-habits` (hidden, reveal by flag). Dashboard: `#habit-dashboard-widget`, `#pinned-entries-section`.

### v2.6 — Năng lượng & Sáng tạo *(gate sau feature flags — bật trong admin)*

- **Pomodoro Timer** (`pomodoro_timer`) — Frontend-only: trang `pomodoro` với 3 chế độ (Pomodoro 25', Nghỉ ngắn 5', Nghỉ dài 15'), thời gian tùy chỉnh, đếm phiên hôm nay lưu `localStorage('nhk_pomo_YYYY-MM-DD')`, tự chuyển chế độ sau khi hết giờ, âm thanh beep 3 nốt qua Web Audio API. Sau 4 phiên tự đề xuất nghỉ dài. `App.initPomodoroPage()`, `App.togglePomodoro()`, `App.resetPomodoro()`, `App.setPomodoroMode(mode)`, `App.updatePomodoroTimes()`.

- **Câu truyền cảm hứng hàng ngày** (`daily_quote`) — Bảng `Quotes` (id, text, author, category). Seed 30 câu tiếng Việt. Route `GET /api/quotes/today` (auth, trả câu theo `dayOfYear % totalCount`). Card `#daily-quote-card` trên dashboard, hiện khi flag bật. `loadDailyQuote()` (internal).

- **Thống kê năm** (`year_stats`) — Route `GET /api/diary/year-stats?year=YYYY` trả: `totalEntries`, `avgMood`, `maxStreak` (từ `Users.max_streak`), `bestMonth/busyMonth`, `moodByMonth[12]` (avg + count per tháng), `topTags[5]`. Frontend: trang `year-stats` với year picker (5 năm gần nhất), stats cards, biểu đồ bar 12 tháng (chiều cao = số bài, màu = mood), top tags. `App.initYearStatsPage()`, `App.loadYearStats()`.

- **Tự động lưu nháp** (`auto_draft`) — Frontend-only. Khi vào trang Nhật ký: check `localStorage('nhk_draft')`, nếu có hiện banner "Khôi phục / Bỏ qua" (`#draft-restore-banner`). setInterval 30s tự lưu form state (mood, event_text, gratitude, tags). Xóa nháp khi lưu thành công hoặc user bỏ qua. Draft hết hạn sau 24h. `App.restoreDraft()`, `App.discardDraft()`.

  **Backend mới:** `backend/routes/quotes.js`.  
  **Frontend mới:** `PAGES.pomodoro`, `PAGES['year-stats']` trong `pages.js`. Nav items `#nav-pomodoro`, `#nav-year-stats` (hidden, reveal by flag). Dashboard: `#daily-quote-card`.

## Feature Flag — quy tắc bắt buộc

### Nguyên tắc cốt lõi (QUAN TRỌNG — áp dụng cho mọi lần nâng cấp sau này)

> **Mọi tính năng mới đều phải nằm sau feature flag, tắt mặc định (`enabled=0`), chỉ bật được qua admin panel. Không bao giờ áp dụng tính năng mới trực tiếp lên production.**
>
> **Ngoại lệ duy nhất: sửa lỗi (bug fix) — áp dụng ngay, không cần flag.**

Lý do: user cần kiểm soát hoàn toàn những gì được kích hoạt trên production. Tính năng mới được code sẵn nhưng ở trạng thái "chờ" — khi nào sẵn sàng mới bật từ admin panel (🚀 Tính năng).

### Checklist cho mỗi tính năng mới

1. **DB seed** — thêm vào mảng seed trong `initSchema()` của `db/index.js`:
   ```js
   { key: 'ten_flag', label: 'Tên hiển thị', desc: 'Mô tả ngắn', ver: 'vX.Y', title: 'Tên version', sort: XYZ }
   // enabled=0 mặc định — KHÔNG đặt enabled=1
   ```
   Pattern: `IF NOT EXISTS (SELECT * FROM FeatureFlags WHERE flag_key=@k) INSERT INTO FeatureFlags(..., enabled, ...) VALUES(..., 0, ...)`

2. **Backend** — viết đầy đủ route/logic nhưng không cần thêm guard server-side (flag chỉ ẩn UI; nếu cần bảo vệ cả API thì kiểm tra flag từ DB).

3. **Frontend gate** — bọc mọi UI của tính năng trong điều kiện:
   ```js
   if (window.FEATURES && window.FEATURES.ten_flag) { /* hiện UI */ }
   ```
   Các phần tử HTML ẩn mặc định bằng `style="display:none"`, JS show/hide sau khi check flag.

4. **Nav item** — nếu tính năng có trang riêng, thêm nav item với `display:none` trong `index.html`, chỉ hiện trong `App.init()` khi flag bật.

5. **Không tự bật flag** — không đặt `enabled=1` trong seed, không hardcode `true`, không bỏ qua gate. Tất cả đều chờ admin bật.

### Phân loại

| Loại | Xử lý |
|---|---|
| Tính năng mới (trang, chức năng, AI) | Flag bắt buộc, `enabled=0` |
| Cải thiện UX đáng kể (thay đổi flow, UI lớn) | Flag bắt buộc, `enabled=0` |
| Sửa lỗi (bug fix, crash, security) | Áp dụng ngay, **không cần flag** |
| Cải tiến UI nhỏ (style, wording, spacing) | Áp dụng ngay, **không cần flag** |

### Kỹ thuật

- `window.FEATURES` là object global được load tại `App.init()` → `loadFeatures()` từ `GET /api/features`.
- Kiểm tra trước khi hiển thị tính năng: `if (window.FEATURES && window.FEATURES.ten_flag) { ... }`
- **`window.FEATURES` chỉ load 1 lần** khi khởi động — user phải reload trang nếu admin bật flag mới trong cùng phiên.
- Tên cột DB là `flag_key` (không phải `key` — `key` là reserved word trong SQL Server). SELECT dùng `flag_key AS [key]` để frontend nhận `f.key`.
- Thứ tự định nghĩa route trong `routes/features.js`: `/admin-list/release` và `/admin-list/schedule` phải đứng **trước** `/admin-list` (POST) để tránh Express match `release`/`schedule` như `:key` param.

## Gotchas learned the hard way

- `seedAdmin()` must check for collisions on **both** `email` and `username` (`WHERE email = @email OR username = @username`) — checking email alone can hit a `UNIQUE` constraint on `username` on startup, throw, and trigger `process.exit(1)` → an infinite PM2 restart loop → port 3001 never opens → IIS 502 to all users. If you see a 502 + high PM2 restart count, check `pm2 logs souldiary-api` for a startup-time DB error first.
- `server.js` logs `process.env.DB_HOST` at boot, but `db/index.js` neither reads `DB_HOST`/`DB_*` from env nor uses a key named `DB_HOST` (the `.env` key is `DB_SERVER`) — that log line is misleading/dead and the real connection settings live only in `db/index.js`.
- **SQL Server reserved keywords làm tên cột** — `key`, `value`, `name`, `type`, `order`, `group`, `index` đều là reserved words. Nếu dùng làm tên cột phải bọc trong `[brackets]` hoặc đặt tên khác (ví dụ `flag_key` thay vì `key`). Lỗi `Incorrect syntax near the keyword 'key'` trong `initSchema()` gây PM2 restart loop ngay khi khởi động.
- **Gemini 429 quota** — `gemini-2.0-flash` free tier bị giới hạn. Mọi endpoint gọi Gemini đều phải có rule-based fallback (xem `smart-recap` và `analyzeEntry` trong `routes/diary.js`). Không để lỗi Gemini làm crash request.
- **`window.FEATURES` chỉ load 1 lần** tại `App.init()` — nếu admin bật flag mới trong cùng phiên, user phải reload trang mới thấy tính năng. Đây là intentional để tránh race condition.
