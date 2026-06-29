<div align="center">

# 🌱 Soul Diary — Nhật Ký Cảm Xúc Số

**Không gian riêng tư để lắng nghe tâm hồn mình**

[![Phiên bản](https://img.shields.io/badge/Phiên_bản-v3.1-6366f1?style=for-the-badge&logo=github)](https://github.com/anhtaictv/Soul-Diary)
[![Stack](https://img.shields.io/badge/Node.js_+_MSSQL-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)]()
[![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)]()
[![License](https://img.shields.io/badge/License-MIT-f59e0b?style=for-the-badge)]()

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

</td>
<td width="50%">

### 🧠 Sức khoẻ Tinh thần
- **Check-in hàng tuần** — PHQ-9, GAD-7, PSS-10, WHO-5
- **Dashboard nâng cao** — xu hướng mood, ngày stress cao
- **Trợ lý Tâm hồn AI** — phản hồi ấm áp, câu hỏi gợi mở
- **Bản đồ cảm xúc tháng** — lịch thời tiết tâm hồn ☀️🌤️⛈️
- Bài tập thở 4-7-8, PMR, Body Scan, 5-4-3-2-1

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

</td>
<td width="50%">

### 🚀 Công nghệ & UX
- **7 theme màu sắc** — Tím Lavender, Hồng Đào, Xanh Rừng...
- **Dark Mode** — dịu mắt ban đêm
- **PWA & Offline** — dùng được khi mất mạng
- **Thư gửi Tương lai** — viết thư gửi cho bản thân
- **PIN Lock** — bảo vệ nhật ký riêng tư
- **AI Pattern Insights** — xu hướng mood 90 ngày

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
| **AI** | Google Gemini 2.0 Flash (phân tích cảm xúc, trợ lý tâm hồn, recap tuần) |
| **Push** | Web Push API + VAPID (nhắc nhở thói quen) |
| **Email** | Nodemailer + SMTP (thư gửi tương lai) |
| **Process** | PM2 (production), Nodemon (dev) |
| **Proxy** | IIS (Windows Server) hoặc Nginx (Linux) |

---

## 🚀 Chạy local

### 1. Backend

```bash
cd backend
cp .env.example .env      # Điền thông tin DB + JWT_SECRET + GEMINI_API_KEY
npm install
npm run dev               # http://localhost:3001  (nodemon, hot reload)
```

> Schema DB tự tạo khi khởi động — không cần chạy script SQL tay.

### 2. Frontend

```bash
cd frontend
npx serve .               # http://localhost:3000
```

Hoặc mở `frontend/index.html` bằng **VS Code Live Server**.  
Đảm bảo `frontend/js/config.js` trỏ đúng `API_URL` về backend đang chạy.

---

## ⚙️ Cấu hình `.env`

```env
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=your_super_secret_key_change_this
JWT_EXPIRES_IN=7d

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

---

## 🏗️ Kiến trúc

```
nhat-ky-fullstack/
├── backend/
│   ├── server.js              # Express entry point — helmet, cors, rate-limit, routes
│   ├── db/
│   │   └── index.js           # Pool MSSQL + initSchema() + seedAdmin()
│   ├── middleware/
│   │   ├── auth.js            # Verify JWT → req.user
│   │   └── admin.js           # Re-query role từ DB, 403 nếu không phải admin
│   ├── routes/
│   │   ├── auth.js            # Đăng ký / đăng nhập / profile
│   │   ├── diary.js           # CRUD nhật ký + AI emotion + AI companion + stats
│   │   ├── articles.js        # Thư viện bài viết
│   │   ├── admin.js           # Dashboard admin
│   │   ├── settings.js        # Cài đặt SOS (MERGE upsert)
│   │   ├── features.js        # Feature flag CRUD + release/schedule
│   │   ├── checkin.js         # Check-in sức khoẻ tuần
│   │   ├── letters.js         # Thư gửi tương lai
│   │   └── user.js            # Export dữ liệu
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
        └── app.js             # App controller — nav, init, theme, dark mode
```

**Quy tắc quan trọng:**
- Schema thay đổi → chỉ sửa `db/index.js`, dùng pattern `IF NOT EXISTS` idempotent
- Tính năng mới → gate sau feature flag (`window.FEATURES.ten_flag`)
- Frontend public method mới → phải thêm vào `return {}` của IIFE module

---

## 🌐 Deploy (production hiện tại)

Production chạy trên **Windows Server** qua **IIS + PM2**. Deployed files là bản copy riêng, không phải working directory này.

| Thành phần | Source | Serve từ |
|---|---|---|
| Frontend | `frontend/` | `C:\inetpub\wwwroot\souldiary` (IIS, domain `souldiary.work.gd`) |
| Backend | `backend/` | PM2 process `souldiary-api` tại port 3001 |

```bash
# Sau khi sửa frontend — copy file vào IIS dir
Copy-Item frontend\js\app.js C:\inetpub\wwwroot\souldiary\js\app.js

# Sau khi sửa backend — restart PM2
pm2 restart souldiary-api
```

---

## 📋 Lịch sử phiên bản

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
| **v3.1** | **UX** | **40 cải tiến UX: skeleton, animation, swipe, ripple, focus trap, reduced motion…** |

---

## ⚠️ Lưu ý quan trọng

- **Bảo mật**: Không dùng `sa` trong production — tạo SQL login riêng với quyền tối thiểu
- **Gemini quota**: Free tier giới hạn — mọi endpoint AI đều có rule-based fallback
- **PM2 restart loop**: Nếu thấy IIS 502 + restart count cao → `pm2 logs souldiary-api` tìm lỗi DB startup
- **SQL reserved words**: `key`, `value`, `name`, `type`, `order`... phải bọc `[brackets]` nếu dùng làm tên cột

---

<div align="center">

*Ứng dụng không thay thế liệu pháp tâm lý chuyên môn.*  
*Nếu bạn đang gặp khó khăn nghiêm trọng, hãy tìm đến chuyên gia.*

**Made with ❤️ by Tài Đầu Bạc**

</div>
