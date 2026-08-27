<div align="center">

# 🌱 Soul Diary — Nhật Ký Cảm Xúc Số

**Không gian riêng tư để lắng nghe tâm hồn mình**

[![Phiên bản](https://img.shields.io/badge/Phiên_bản-v3.10.3-6366f1?style=flat-square&logo=github&logoColor=white)](https://github.com/anhtaictv/Soul-Diary)
[![Deploy](https://img.shields.io/github/actions/workflow/status/anhtaictv/Soul-Diary/soul-diary-deploy-windows.yml?style=flat-square&label=Deploy&logo=githubactions&logoColor=white)](https://github.com/anhtaictv/Soul-Diary/actions/workflows/soul-diary-deploy-windows.yml)
[![Stack](https://img.shields.io/badge/Node.js_+_MSSQL-339933?style=flat-square&logo=nodedotjs&logoColor=white)]()
[![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=flat-square&logo=javascript&logoColor=black)]()
[![License](https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square)]()

<br/>

*Ứng dụng nhật ký cảm xúc dành cho học sinh — sinh viên Việt Nam.*
*Ghi lại cảm xúc mỗi ngày, theo dõi sức khoẻ tinh thần, và lớn lên cùng AI đồng hành.*

</div>

---

## ✨ Tính năng nổi bật

<table>
<tr>
<td width="50%">

### 📖 Nhật ký & Cảm xúc
- Ghi nhật ký với thang cảm xúc 1–10
- Chế độ viết **tự do** hoặc **hướng dẫn CBT**
- Phân tích cảm xúc tự động bằng **AI Gemini**
- Tìm kiếm & bộ lọc nhật ký theo ngày
- Đính kèm ảnh, ghi âm giọng nói 30s
- Xuất nhật ký ra PDF
- **Mã hoá at-rest AES-256-GCM** — nội dung nhật ký không đọc được kể cả khi truy cập thẳng DB

</td>
<td width="50%">

### 🧠 Sức khoẻ Tinh thần
- **Check-in hàng tuần** — PHQ-9, GAD-7, PSS-10, WHO-5
- **Dashboard nâng cao** — xu hướng mood, ngày stress cao
- **Trợ lý Tâm hồn AI** — phản hồi ấm áp, câu hỏi gợi mở
- **Bản đồ cảm xúc tháng** — lịch thời tiết tâm hồn ☀️🌤️⛈️
- Bài tập thở 4-7-8, PMR, Body Scan, 5-4-3-2-1
- **Thư viện kiến thức** — bài viết + bài tập có trích dẫn nghiên cứu khoa học
- **Liên hệ khẩn cấp** — tự lưu người thân tin tưởng; khi phát hiện 7 ngày mood thấp liên tiếp, hệ thống báo họ qua email (không kèm nội dung nhật ký), chỉ kích hoạt khi user tự đồng ý
- **Dự báo tâm trạng chủ động** — đối chiếu Lịch học tập (kỳ thi/deadline sắp tới) với pattern mood lịch sử của chính bạn, cảnh báo *trước* giai đoạn dễ tuột mood thay vì chỉ báo sau khi đã xuống
- **Bản đồ cảm xúc trường học** — mood trung bình ẩn danh của các bạn cùng trường tuần này, giảm cảm giác cô đơn (chỉ hiện khi đủ 5 người trở lên)
- **Luyện phản ứng tình huống** — AI dựng tình huống "nếu gặp lại thì sao" từ chính nhật ký gần nhất, luyện cách phản ứng và nhận góp ý theo hướng CBT

</td>
</tr>
<tr>
<td width="50%">

### 🏆 Gamification
- **Streak hàng ngày** — mốc 7/14/21/30/50/100 ngày
- **Huy hiệu & Level** — 9 huy hiệu, 5 cấp độ
- **Hạt mầm tâm hồn** 🌰→🌱→🌿→🌳→🌳🌺
- **Nhiệm vụ tuần** — 5 nhiệm vụ, thanh tiến độ
- **Memory Card** — tạo ảnh kỷ niệm chia sẻ
- **Giới thiệu bạn bè** — link mời, thưởng khi bạn được mời đạt streak 7 ngày

</td>
<td width="50%">

### 🚀 Công nghệ & UX
- **7 theme màu sắc** — Tím Lavender, Hồng Đào, Xanh Rừng...
- **Dark Mode** — dịu mắt ban đêm
- **PWA & Offline** — dùng được khi mất mạng, hàng đợi nháp offline
- **Thư gửi Tương lai** — viết thư gửi cho bản thân
- **PIN Lock** — bảo vệ nhật ký riêng tư
- **AI Pattern Insights** — xu hướng mood 90 ngày
- **Trợ năng** — cỡ chữ 3 mức (zoom tới 1.6x), tương phản cao, giảm hiệu ứng chuyển động, giãn cách chữ (WCAG 1.4.12)

</td>
</tr>
<tr>
<td width="50%">

### 🎮 Giải trí — 5 Mini Game
- 🐱 **Mèo đuổi chuột** — chạy né chướng ngại vật kiểu Chrome Dino
- 🐍 **Rắn săn mồi** (Snake)
- 🔢 **2048**
- ⭕ **Caro** (Gomoku) — chơi với máy
- 🐦 **Flappy Mèo**
- Mỗi game có **bảng xếp hạng điểm cao** riêng

</td>
<td width="50%">

### 🔒 Bảo mật & Vận hành
- Mã hoá at-rest **AES-256-GCM** cho nội dung nhật ký
- **CI/CD tự động** — push vào `master` là tự deploy cả frontend & backend
- Helmet, rate limiting, JWT + bcrypt
- Re-verify quyền admin từ DB ở mọi request (không tin JWT payload)
- Lazy-load `admin.js`/`game.js` — chỉ tải khi vào đúng trang, giảm tải trang chính
- Cache 30s cho API ít đổi nhưng gọi mỗi lần tải trang (`/features`, `/announcements/active`)

</td>
</tr>
</table>

---

## 📸 Ảnh chụp màn hình

<div align="center">

> <img width="536" height="643" alt="image" src="https://github.com/user-attachments/assets/194f8266-8a1b-454f-9fa8-010c5b8ba062" />
<img width="1137" height="947" alt="image" src="https://github.com/user-attachments/assets/27ca37c8-3939-4d84-8fd7-84ef91a44000" />
<img width="1121" height="808" alt="image" src="https://github.com/user-attachments/assets/00b19581-d671-467e-b8b6-47c9cfa693ee" />
<img width="1135" height="939" alt="image" src="https://github.com/user-attachments/assets/24c7b89b-51ab-4dbe-b0e2-938d70983d83" />
<img width="1131" height="759" alt="image" src="https://github.com/user-attachments/assets/9210f2b1-a965-4208-9686-1152969196ca" />

</div>

<!-- Thêm ảnh chụp màn hình vào đây -->

---

## 🛠️ Tech Stack

| Lớp | Công nghệ |
|-----|-----------|
| **Backend** | Node.js 18+, Express 4, JWT, bcryptjs |
| **Database** | Microsoft SQL Server (schema tự khởi tạo, không cần migration) |
| **Frontend** | Vanilla JS (IIFE modules), HTML5, CSS3 — không framework, không build step |
| **Mini Game** | Canvas 2D thuần, không dùng game engine — 5 game trong `game.js` + `games-extra.js` |
| **AI** | Google Gemini 2.0 Flash (phân tích cảm xúc, trợ lý tâm hồn, recap tuần) |
| **Bảo mật dữ liệu** | AES-256-GCM mã hoá at-rest nội dung nhật ký |
| **Push** | Web Push API + VAPID (nhắc nhở thói quen) |
| **Email** | Nodemailer + SMTP (thư gửi tương lai) |
| **CI/CD** | GitHub Actions (self-hosted runner) — auto deploy khi push `master` |
| **Process** | PM2 (production), Nodemon (dev) |
| **Proxy** | IIS (Windows Server) |

---

## 🚀 Chạy local

### 1. Backend

```bash
cd backend
cp .env.example .env      # Điền DB + JWT_SECRET + ENCRYPTION_KEY + GEMINI_API_KEY
npm install
npm run dev               # http://localhost:3001  (nodemon, hot reload)
```

> Schema DB tự tạo khi khởi động — không cần chạy script SQL tay.
> `ENCRYPTION_KEY` là bắt buộc — server sẽ không start nếu thiếu (xem mục cấu hình bên dưới).

### 2. Frontend

```bash
cd frontend
npx serve .               # http://localhost:3000
```

Hoặc mở `frontend/index.html` bằng **VS Code Live Server**.
Đảm bảo `frontend/js/config.js` trỏ đúng `API_URL` về backend đang chạy.

---

<details>
<summary><b>⚙️ Cấu hình <code>.env</code> đầy đủ</b> (bấm để xem)</summary>

```env
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=your_super_secret_key_change_this
JWT_EXPIRES_IN=7d

# Mã hoá at-rest nội dung nhật ký (AES-256-GCM) — BẮT BUỘC
# Tạo bằng: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# ⚠️ Mất key này = mất vĩnh viễn toàn bộ nội dung đã mã hoá, không khôi phục được.
# Local và production PHẢI dùng cùng 1 giá trị.
ENCRYPTION_KEY=change_this_generate_with_the_command_above

# SQL Server
DB_SERVER=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=your_password
DB_NAME=NhatKyCamXuc

# AI & Push
GEMINI_API_KEY=your_gemini_key
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:you@example.com

# Email (thư gửi tương lai)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
```

</details>

---

<details>
<summary><b>🏗️ Kiến trúc thư mục</b> (bấm để xem)</summary>

```
nhat-ky-fullstack/
├── .github/workflows/
│   └── soul-diary-deploy-windows.yml   # CI/CD — auto deploy khi push master
├── content/
│   └── danh-sach-bai-da-dang.md        # Bảng đối chiếu bài viết thư viện (skill /dang-bai)
├── backend/
│   ├── server.js              # Express entry point — helmet, cors, rate-limit, routes
│   ├── db/
│   │   └── index.js           # Pool MSSQL + initSchema() + seedAdmin()
│   ├── middleware/
│   │   ├── auth.js            # Verify JWT → req.user
│   │   └── admin.js           # Re-query role từ DB, 403 nếu không phải admin
│   ├── routes/
│   │   ├── auth.js            # Đăng ký / đăng nhập / profile
│   │   ├── diary.js           # CRUD nhật ký + AI emotion + AI companion + stats (mã hoá AES-256-GCM)
│   │   ├── articles.js        # Thư viện bài viết + bài tập
│   │   ├── game.js            # Điểm cao & bảng xếp hạng mini game
│   │   ├── admin.js           # Dashboard admin
│   │   ├── settings.js        # Cài đặt SOS (MERGE upsert)
│   │   ├── features.js        # Feature flag CRUD + release/schedule
│   │   ├── checkin.js         # Check-in sức khoẻ tuần
│   │   ├── letters.js         # Thư gửi tương lai
│   │   └── user.js            # Export dữ liệu, liên hệ khẩn cấp (người thân)
│   ├── scripts/
│   │   └── post-article.js    # Đăng bài (nháp) qua API — dùng bởi skill /dang-bai
│   └── utils/
│       └── mailer.js          # Nodemailer — gửi thư đến tương lai
└── frontend/
    ├── index.html
    ├── css/style.css          # Toàn bộ styles — theme, dark mode, animations
    ├── sw.js                  # Service Worker (PWA, offline)
    ├── manifest.webmanifest
    └── js/
        ├── config.js          # API_URL — đổi khi deploy
        ├── data.js            # Dữ liệu tĩnh (mood, badges, missions...)
        ├── api.js             # Fetch wrapper — JWT header, 401 handler
        ├── auth.js            # Login / register / logout
        ├── pages.js           # HTML templates (PAGES object)
        ├── admin.js           # Admin module — panel, CRUD, feature flags
        ├── game.js            # Mini game: Mèo đuổi chuột (engine + leaderboard chung)
        ├── games-extra.js     # 4 mini game: Rắn săn mồi, 2048, Caro, Flappy Mèo
        └── app.js             # App controller — nav, init, theme, dark mode
```

**Quy tắc quan trọng:**
- Schema thay đổi → chỉ sửa `db/index.js`, dùng pattern `IF NOT EXISTS` idempotent
- Tính năng mới → gate sau feature flag (`window.FEATURES.ten_flag`)
- Frontend public method mới → phải thêm vào `return {}` của IIFE module
- Mini game mới → module `{ start(canvasEl, onGameOver), stop() }` giống contract của `Game` (`game.js`)

</details>

---

## 🌐 Deploy (production hiện tại)

Production chạy trên **Windows Server** qua **IIS + PM2**, tại domain [`souldiary.work.gd`](https://souldiary.work.gd).

**Push vào `master` là tự động deploy** — GitHub Actions (self-hosted runner đặt ngay trên VPS) sync code, chạy `npm ci`, restart PM2 cho backend và đồng bộ file tĩnh vào IIS cho frontend. Không cần copy tay hay SSH thủ công nữa.

| Thành phần | Source | Serve từ |
|---|---|---|
| Frontend | `frontend/` | `C:\inetpub\wwwroot\souldiary` (IIS) |
| Backend | `backend/` | PM2 process `souldiary-api`, port 3001 |

<details>
<summary>Chi tiết workflow / chạy tay khi cần</summary>

Xem toàn bộ pipeline tại [`.github/workflows/soul-diary-deploy-windows.yml`](.github/workflows/soul-diary-deploy-windows.yml). Có thể trigger tay từ tab **Actions** (`workflow_dispatch`).

```powershell
# Chỉ dùng khi cần chạy tay trực tiếp trên VPS (bỏ qua CI/CD)
pm2 restart souldiary-api
```

</details>

---

## 📋 Lịch sử phiên bản

| Phiên bản | Tên | Tính năng chính |
|-----------|-----|-----------------|
| v3.6 | Giải trí | 5 mini game: Mèo đuổi chuột, Rắn săn mồi, 2048, Caro (vs máy), Flappy Mèo — đồ hoạ sprite thực tế, bảng xếp hạng điểm cao riêng từng game |
| v3.6.1 | Bảo mật & UX | Fix stored XSS qua media nhật ký, CORS fail-safe, rate limit + khoá tài khoản sau 5 lần đăng nhập sai, audit log CRUD nhật ký · Gom 24 mục sidebar thành 5 nhóm thu gọn được, animation trượt mượt |
| v3.6.2 | Bản vá | Fix Mèo đuổi chuột: tăng tầm nhảy (JUMP_V) để mèo qua được chướng ngại vật ở tốc độ cao, khoảng cách chướng ngại tự giãn theo đúng công thức vật lý |
| v3.7 | Test tâm lý chuyên sâu | Tách 11 bài sàng lọc tâm lý (PHQ-9, GAD-7, MDQ, OCI-R, PQ-16, EAT-26, EPDS, SDQ x2, PCL-5, DAST-10) thành mục riêng, bỏ trang danh mục gộp chung |
| v3.7.1 | Bản vá bảo mật | Fix crash `ERR_ERL_INVALID_IP_ADDRESS`: rate limiter đăng nhập (`/api/auth/login`) crash lặp lại khi nhận IP dạng "IP:PORT" từ proxy/bot gửi sai định dạng, khiến site thỉnh thoảng không vào được — áp dụng `keyGenerator` an toàn dùng chung cho mọi rate limiter |
| v3.7.2 | Bản vá độ ổn định | Fix `NODE-CRON missed execution`: gửi push nhắc nhở song song thay vì tuần tự, tránh chặn event loop · Retry kết nối SQL Server lúc khởi động (5 lần, backoff tăng dần) thay vì exit ngay — chịu được VPS reboot mà không cần PM2 restart-loop |
| v3.8 | Liên hệ khẩn cấp & Trợ năng | User tự lưu người thân + đồng ý → email báo tự động khi 7 ngày mood thấp liên tiếp (không kèm nội dung nhật ký) · Cỡ chữ trợ năng phóng to rõ rệt hơn (zoom 1.3x/1.6x), thêm Giảm chuyển động + Giãn cách chữ · Lazy-load `admin.js`, cache 30s cho API feature flags/thông báo |
| v3.9 | Dự báo chủ động | Đối chiếu Lịch học tập (StudyEvents) với pattern mood lịch sử của chính user quanh các kỳ thi/deadline tương tự trước đây — cảnh báo trước thay vì chỉ báo sau khi mood đã xuống, kèm gợi ý bài tập phù hợp từ thư viện |
| v3.10 | Kết nối ẩn danh | Bản đồ cảm xúc trường học: mood trung bình ẩn danh của các bạn cùng trường (chỉ hiện khi ≥5 người, bảo vệ danh tính) · Luyện phản ứng tình huống: AI dựng tình huống từ nhật ký gần nhất để luyện phản ứng, góp ý theo hướng CBT |
| v3.10.1 | Bản vá AI | Fix Gemini fallback: model `gemini-2.0-flash` đã bị Google gỡ bỏ (404), đổi sang `gemini-3.6-flash` — ảnh hưởng toàn bộ 8 điểm gọi Gemini fallback trong app · AI Coach: cache theo ngày thay vì 7 ngày, khớp với Smart Recap |
| v3.10.2 | Bản vá hiệu năng | Thêm index `(user_id, created_at DESC)` cho `DiaryEntries` — list/search/on-this-day/streak đang table scan, càng nặng khi nhật ký tăng · Bật GitHub Dependabot theo dõi cập nhật bảo mật cho `backend/` |
| **v3.10.3** | **Bản vá độ ổn định** | **Thêm `uncaughtException` handler, hoàn thiện cặp chốt chặn với `unhandledRejection` đã có — lỗi đồng bộ lọt khỏi try/catch (vd trong cron callback) giờ log rõ nguyên nhân trước khi PM2 restart sạch · Thêm self-check cho logic đảo điểm PSS-10 trong check-in tuần, tránh sai điểm hiển thị mức căng thẳng cho người dùng** |

<details>
<summary><b>Xem đầy đủ lịch sử từ v1.0</b> (bấm để xem)</summary>

| Phiên bản | Tên | Tính năng chính |
|-----------|-----|-----------------|
| v1.0 | Ra mắt | JWT auth, nhật ký cảm xúc, biểu đồ, nhạc, thở 4-7-8, SOS |
| v1.1 | Nền tảng | Admin panel, CRUD bài viết EasyMDE, ghi âm 30s, đính kèm ảnh, rate limiting |
| v1.2 | Giữ chân | Streak đa mốc, Weekly Recap, Huy hiệu & Level, AI Recap tuần, Web Push |
| v1.3 | AI Cảm xúc | Feature Flags, AI phân tích cảm xúc tự động, Dashboard sức khoẻ nâng cao, CBT |
| v1.4 | Check-in | Check-in tâm lý hàng tuần: PHQ-9 / GAD-7 / PSS-10 / WHO-5 |
| v1.5 | Tâm hồn | Lịch cảm xúc, AI Trợ lý, Không gian mood, Hạt mầm tâm hồn 🌱 |
| v1.6 | Chăm sóc | Cảnh báo chuỗi tâm trạng tiêu cực, push SOS tự động, sửa lỗi ghi âm |
| v1.7 | Admin | Hộp thư hỗ trợ, Heatmap cảm xúc năm, Thử thách sức khoẻ, Tâm sự ẩn danh |
| v1.8 | Học liệu | Soul Chat AI, Lịch học tập, Mini Courses tâm lý, Mục tiêu cá nhân |
| v1.9 | Cá nhân hoá | Dark Mode, 6 Themes màu, Tìm kiếm nhật ký, Phân trang, fix XSS/timeout |
| v2.0 | Đột phá | PWA Offline, Memory Card, Thư Tương Lai, PIN Lock, Xuất dữ liệu, AI Patterns |
| v2.1 | Tinh chỉnh | PWA install button, PIN management trong Settings, Canvas font tiếng Việt |
| v2.2 | Kết nối | Avatar & Bio, Ghi âm 120s, Nhắc nhở thông minh, Radar cảm xúc, Chia sẻ entry |
| v2.3 | Bạn bè | Streak bạn bè & bảng xếp hạng, Nhật ký định kỳ (Templates) |
| v2.4 | Báo cáo | Báo cáo tháng, Phản tư cuối tuần, Quick Mood Log 5 emoji |
| v2.5 | Thói quen | Habit Tracker, Gợi ý bài tập cảm xúc, Ghim nhật ký |
| v2.6 | Năng lượng | Pomodoro Timer, Câu cảm hứng hàng ngày, Thống kê năm, Tự động lưu nháp |
| v2.7 | Sáng tạo | Gallery ảnh, Ghi chú nhanh, So sánh tâm trạng, Cảnh báo sức khoẻ |
| v2.8 | Bảo mật | Lazy-load media, Input validation, Dọn dẹp DB tự động |
| v2.9 | Hiệu năng | HTTP Compression, Batch DB ops, Pool tuning, Promise.all song song |
| v3.0 | Cộng đồng | Trung tâm Thông báo, Hồ sơ cá nhân, Tìm kiếm nâng cao, AI Coach tuần |
| v3.1 | UX | 40 cải tiến UX: skeleton, animation, swipe, ripple, focus trap, reduced motion… |
| v3.2 | Đa thiết bị | Tối ưu iOS PWA (safe-area, status bar), breakpoint tablet, touch target 44px, hover chỉ áp dụng khi có chuột thật |
| v3.3 | Trợ năng & Bền vững | Speech-to-text ghi âm, Sổ tổng kết cuối năm (ảnh), Hàng đợi nháp offline, cỡ chữ & tương phản cao, phiên bản Giới thiệu tự cập nhật theo Feature Flags |
| v3.3.1 | Bản vá | Sửa 10 lỗi từ code review: timeout offline queue, mất dữ liệu âm thầm khi đầy bộ nhớ, log mood trùng khi mất mạng, sai version hiển thị, race condition xuất ảnh năm, cỡ chữ lớn không phủ modal/toast, giới hạn dung lượng không khớp, mở rộng hàng đợi sang xoá nhật ký, dọn flag trùng, gộp bảng màu thông báo |
| v3.4 | Giữ chân người dùng | Nhắc quay lại (push/email tự động cho user không hoạt động 5–60 ngày), Giới thiệu bạn bè (link mời + thưởng lượt cứu streak khi bạn được mời đạt 7 ngày), Hôm nay năm ngoái (hồi tưởng nhật ký cùng ngày các năm trước trên trang chủ) |
| v3.5 | Bảo mật | Mã hoá at-rest nội dung nhật ký bằng AES-256-GCM, CI/CD tự động deploy qua self-hosted GitHub Actions runner |
| v3.6 | Giải trí | 5 mini game: Mèo đuổi chuột, Rắn săn mồi, 2048, Caro (vs máy), Flappy Mèo — đồ hoạ sprite thực tế, bảng xếp hạng điểm cao riêng từng game |
| v3.6.1 | Bảo mật & UX | Fix stored XSS qua mime ảnh/audio đính kèm nhật ký, CORS fail-safe khi thiếu `CORS_ORIGIN`, rate limit riêng + khoá tài khoản 15 phút sau 5 lần đăng nhập sai, audit log CRUD nhật ký (`DiaryAuditLog`) · Gom 24/33 mục sidebar thành 5 nhóm bấm-để-mở (nhớ trạng thái, tự mở theo trang đang xem, badge thông báo không "mất tích" khi thu gọn), animation trượt bằng CSS Grid mượt hơn |
| v3.6.2 | Bản vá | Fix Mèo đuổi chuột: tăng `JUMP_V` từ -14 lên -16 để mèo nhảy xa hơn, qua được chướng ngại vật ở tốc độ cao — khoảng cách tối thiểu giữa chướng ngại vật tự giãn theo vì tính từ cùng công thức `JUMP_V`/`GRAVITY` |
| v3.7 | Test tâm lý chuyên sâu | Tách 11 bài sàng lọc tâm lý (PHQ-9, GAD-7, MDQ, OCI-R, PQ-16, EAT-26, EPDS, SDQ x2, PCL-5, DAST-10) thành mục riêng, bỏ trang danh mục gộp chung |
| v3.7.1 | Bản vá bảo mật | Fix crash `ERR_ERL_INVALID_IP_ADDRESS`: rate limiter đăng nhập (`/api/auth/login`) dùng `keyGenerator` mặc định của `express-rate-limit`, ném lỗi validate chưa được bắt khi `req.ip` có dạng "IP:PORT" (proxy/bot gửi sai định dạng) → unhandled rejection → crash tiến trình lặp lại. Chuyển `safeKeyGenerator` (đã có ở `server.js`) ra `utils/rateLimitKey.js` dùng chung, áp dụng cho cả `loginLimiter` |
| v3.7.2 | Bản vá độ ổn định | Fix `NODE-CRON missed execution`: 2 cron job chạy mỗi giờ gửi `webpush.sendNotification` tuần tự từng user, chuỗi round-trip mạng nối tiếp chặn event loop đủ lâu khiến node-cron báo lỡ tick kế tiếp — chuyển sang `Promise.allSettled` gửi song song. Thêm retry-with-backoff (5 lần, 5s/10s/15s/20s) khi kết nối SQL Server thất bại lúc khởi động, thay vì `process.exit(1)` ngay gây PM2 restart-loop khi VPS reboot (SQL Server cùng máy khởi động chậm hơn PM2) |
| v3.8 | Liên hệ khẩn cấp & Trợ năng | Thêm Liên hệ khẩn cấp: user tự lưu tên/SĐT/email người thân (mã hoá AES-256-GCM như nhật ký) + tự bật đồng ý; cron `lowmood_alert` gửi thêm email báo người thân khi phát hiện 7 ngày mood thấp liên tiếp — không kèm nội dung/điểm mood nhật ký, gate sau feature flag `emergency_contact`. Fix cỡ chữ trợ năng: `zoom` 1.15x/1.3x quá nhẹ trên nền chữ 11-13px nên chỉ thấy khoảng cách giãn chứ chữ không rõ lớn hơn — tăng lên 1.3x/1.6x; thêm 2 toggle mới **Giảm chuyển động** (tắt animation/transition, WCAG 2.3.3) và **Giãn cách chữ** (letter/word-spacing, WCAG 1.4.12). Hiệu năng: `admin.js` (48KB) không còn nạp eager cho mọi user — chỉ tải khi vào trang Quản trị, giống pattern `game.js`; cache 30s cho `GET /api/features` và `GET /api/announcements/active` (gọi lại mỗi lần tải trang, dữ liệu ít đổi) |
| v3.9 | Dự báo chủ động | Tận dụng `StudyEvents` (Lịch học tập) đã có sẵn: đối chiếu kỳ thi/deadline sắp tới (≤21 ngày) với mood trung bình 5 ngày trước các mốc tương tự đã qua của chính user, so với mood trung bình chung — nếu lệch ≥0.5 điểm thì cảnh báo trước kèm gợi ý 1 bài tập phù hợp từ thư viện, thay vì chỉ phát hiện *sau* khi mood đã xuống như cơ chế `lowmood_alert` 7 ngày liên tiếp hiện có. Endpoint `GET /api/diary/mood-forecast`, gate sau feature flag `mood_forecast` |
| v3.10 | Kết nối ẩn danh | **Bản đồ cảm xúc trường học**: thêm field `school_name` optional trong hồ sơ; khi có ≥5 người cùng trường (bảo vệ ẩn danh), hiện mood trung bình + % lượt ghi mood thấp 7 ngày qua của cả trường (`GET /api/user/school-mood-map`, flag `school_mood_map`). **Luyện phản ứng tình huống**: AI đọc nhật ký gần nhất, dựng tình huống "nếu gặp lại thì sao" để luyện phản ứng rồi góp ý theo hướng CBT — cá nhân hoá theo đúng chuyện user vừa kể thay vì bài tập tĩnh trong thư viện (`GET/POST /api/diary/roleplay*`, flag `roleplay_cbt`) |
| v3.10.1 | Bản vá AI | Google đã gỡ model `gemini-2.0-flash` (API trả 404 "no longer available") — mọi nhánh fallback Gemini trong app (smart-recap, ai-coach, roleplay, chat, checkin, daily-prompt...) đều fail và rơi về nội dung mặc định dù đã cấu hình `GEMINI_API_KEY` đúng. Đổi toàn bộ 8 điểm gọi sang `gemini-3.6-flash`. Cũng đổi cache `ai-coach` từ 7 ngày rolling sang theo ngày lịch (giống `smart-recap`) để nội dung mới xuất hiện sớm hơn |
| v3.10.2 | Bản vá hiệu năng | `DiaryEntries` chưa có index nào ngoài khoá chính — mọi query list/search/on-this-day/tính streak đều lọc `user_id` rồi sắp xếp `created_at`, hiện đang table scan toàn bảng, càng chậm khi số nhật ký tăng lên. Thêm index `IX_DiaryEntries_user_created (user_id, created_at DESC)` vào `initSchema()`, tự tạo ở lần deploy kế tiếp, không cần chạy script tay. Bật GitHub Dependabot cho `backend/` (theo dõi cập nhật bảo mật npm hàng tuần) |
| v3.10.3 | Bản vá độ ổn định | Server có sẵn `unhandledRejection` nhưng thiếu `uncaughtException` — nếu 1 lỗi đồng bộ lọt khỏi try/catch (vd trong callback cron) thì process crash không log rõ nguyên nhân trước khi PM2 restart-loop. Thêm handler còn thiếu, log lỗi rồi thoát sạch. Thêm `test_checkin_scoring.js` (self-check assert, không cần DB) bảo vệ logic đảo điểm 4 câu reverse-scoring của PSS-10 trong check-in tuần — sai 1 index là sai điểm mức căng thẳng hiển thị cho người dùng, dạng bug im lặng khó phát hiện bằng mắt |

</details>

---

## ⚠️ Lưu ý quan trọng

- **`ENCRYPTION_KEY` là tối quan trọng**: mất key này = mất vĩnh viễn toàn bộ nội dung nhật ký đã mã hoá, không thể khôi phục. Lưu bản sao ở nơi an toàn ngoài server (password manager), không chỉ trong `.env`.
- **Bảo mật**: Không dùng `sa` trong production — tạo SQL login riêng với quyền tối thiểu
- **Gemini quota**: Free tier giới hạn — mọi endpoint AI đều có rule-based fallback
- **PM2 restart loop**: Nếu thấy IIS 502 + restart count cao → `pm2 logs souldiary-api` tìm lỗi DB startup
- **SQL reserved words**: `key`, `value`, `name`, `type`, `order`... phải bọc `[brackets]` nếu dùng làm tên cột

---

## 🗺️ Hướng phát triển bảo mật tương lai

Các mục dưới đây **không ảnh hưởng trực tiếp** đến bảo mật hiện tại của app (đã xử lý các lỗ hổng thực tế: stored XSS qua media, CORS, rate limit + account lockout login, audit log nhật ký — xem lịch sử phiên bản). Đây là nâng cấp hạ tầng/quy trình để cân nhắc khi app lớn hơn quy mô cá nhân hiện tại — cần quyết định, chi phí, hoặc quyền truy cập hạ tầng, không phải sửa bằng code trong repo.

| Hạng mục | Là gì | Cần gì để làm | Mức ưu tiên |
|---|---|---|---|
| **reCAPTCHA v3** | Chặn bot spam form login/đăng ký | Tài khoản Google (miễn phí) đăng ký site key tại [google.com/recaptcha](https://www.google.com/recaptcha/admin) | Thấp — rẻ, dễ, làm được sớm nếu muốn |
| **OAuth2/OIDC + MFA** | Đăng nhập bằng Google/Facebook, xác thực 2 lớp (mã 6 số) | Đăng ký OAuth app (miễn phí) + code luồng login mới, thư viện MFA (`speakeasy`) | Trung bình — tính năng thật, vài giờ code |
| **Windows Authentication cho SQL Server** | App xác thực bằng tài khoản Windows thay vì user/pass SQL trong `.env` | Cấu hình lại SQL Server + đổi driver kết nối, cần truy cập trực tiếp VPS | Trung bình — việc hạ tầng, cần quyền VPS |
| **TDE (Transparent Data Encryption)** | SQL Server tự mã hoá file `.mdf`/`.ldf` trên đĩa | Nâng cấp license SQL Server (Standard/Enterprise) — **không khả dụng ở bản Express** đang dùng | Thấp — nội dung nhạy cảm đã mã hoá AES-256-GCM ở tầng app rồi |
| **KMS/HSM** (AWS KMS, Azure Key Vault, HashiCorp Vault) | Dịch vụ/thiết bị chuyên quản lý key mã hoá thay vì file `.env` | Tài khoản cloud trả phí (~$1-5/key/tháng) hoặc tự vận hành Vault | Thấp — quy mô công ty có đội bảo mật riêng |
| **Centralized logging** (ELK/Splunk/CloudWatch) | Gom log nhiều server vào 1 hệ thống tìm kiếm + cảnh báo tự động | Hạ tầng riêng (Elasticsearch cần vài GB RAM) hoặc SaaS trả phí | Thấp — quá nặng cho 1 VPS cá nhân, `pm2 logs` là đủ ở quy mô này |
| **Pentest thuê ngoài định kỳ** | Chuyên gia chủ động tấn công thử để tìm lỗ hổng | Chi phí vài trăm–vài nghìn USD/lần | Thấp — thay thế miễn phí: bật GitHub Dependabot/CodeQL |

---

<div align="center">

*Ứng dụng không thay thế liệu pháp tâm lý chuyên môn.*
*Nếu bạn đang gặp khó khăn nghiêm trọng, hãy tìm đến chuyên gia.*

**Made with ❤️ by Tài Đầu Bạc**

</div>
