# Changelog — Nhật Ký Cảm Xúc Số (Soul Diary)

## v1.0 — Ra mắt ứng dụng
**Nền tảng cốt lõi**
- Đăng ký / đăng nhập JWT
- Nhật ký cảm xúc với thang điểm 1–10, tags
- Biểu đồ cảm xúc
- Thư viện bài viết
- Nhạc nền Jamendo
- Bài tập thở 4-7-8
- Streak hàng ngày
- Trang SOS khủng hoảng

---

## v1.01 — Hoàn thiện nền tảng
**Admin & Media**
- Admin panel đầy đủ (Tổng quan / Bài viết / Người dùng / Cài đặt)
- CRUD bài viết với EasyMDE (Markdown editor)
- Quản lý role người dùng (promote/demote)
- Cài đặt SOS contacts
- Ghi âm 30 giây
- Đính kèm ảnh vào nhật ký
- Rate limiting bảo vệ API

---

## v1.2 — Giữ chân & Nâng cấp trải nghiệm
**Gamification + AI đầu tiên**
- **Streak đa mốc** — freeze streak, mốc 7/14/21/30/50/100 ngày tặng phần thưởng, modal celebration
- **Weekly Recap** — so sánh 2 tuần liên tiếp
- **Huy hiệu & Level** — 9 huy hiệu, 5 cấp độ
- **AI Weekly Summary** — Gemini 2.0 Flash tóm tắt tuần, cache 1 lần/ngày, fallback rule-based khi hết quota
- **Web Push Notification** — nhắc nhở theo giờ thói quen, VAPID, cron hourly
- Sửa lỗi hướng dẫn quyền microphone

---

## v1.3 — AI Thấu hiểu cảm xúc *(feature-gated)*
**Feature Flag System + AI nâng cao**
- **Feature Flag System** — bảng `FeatureFlags`, admin quản lý bật/tắt/hẹn giờ phát hành, cron tự bật đúng ngày, thu hồi cập nhật
- **AI Phân tích cảm xúc tự động** (`ai_emotion_analysis`) — Gemini phân tích emotions/themes/intensity sau mỗi entry, cache vào DB
- **Dashboard sức khỏe tâm thần nâng cao** (`enhanced_mental_dashboard`) — 4 chỉ số: top emotion, stress day, top theme, month trend
- **Viết nhật ký CBT** (`cbt_guided_writing`) — chế độ hướng dẫn 4 bước CBT (sự kiện → suy nghĩ → cảm xúc → hành vi), badge 🧠 CBT

---

## v1.4 — Check-in Tâm lý *(feature-gated)*
**Đánh giá sức khỏe tâm thần có chuẩn**
- **Check-in hàng tuần** (`weekly_checkin`) — 31 câu hỏi chuẩn PHQ-9 / GAD-7 / PSS-10 / WHO-5
- Phân tích kết quả bằng AI
- Nhắc nhở mỗi Thứ 7
- Nav item ẩn đến khi flag bật

---

## v1.5 — Nuôi dưỡng Tâm hồn *(feature-gated)*
**Trải nghiệm cảm xúc trực quan**
- **Bản đồ thời tiết tâm hồn** (`mood_calendar`) — lịch tháng icon thời tiết (☀️🌤️⛅🌧️⛈️) theo mood từng ngày
- **Trợ lý Tâm hồn AI** (`soul_companion`) — Gemini phản hồi ấm áp 2-3 câu + câu hỏi gợi mở sau mỗi entry; gợi ý chủ đề viết hàng ngày (25 câu, không tốn quota)
- **Không gian theo cảm xúc** (`mood_ambience`) — nền gradient đổi theo mood, gợi nhạc tự động theo cảm xúc
- **Hạt mầm tâm hồn** (`soul_seed`) — cây ảo trên dashboard lớn theo streak (🌰→🌱→🌿→🌳→🌳🌸→🌳🌺), héo 🥀 nếu bỏ viết ≥2 ngày

---

## v1.7 — Bổ sung tính năng
4 tính năng bổ sung (commit `a34e02c`)

---

## v1.8 — Soul Chat & Học liệu Toàn diện
6 tính năng mới (commit `451db88`)

---

## v1.9 — Trải nghiệm Cá nhân hoá
**Sửa lỗi, tối ưu hiệu năng & 4 tính năng mới** (commit `6a90191`, `cea7a02`)

**Sửa lỗi:**
- XSS trong in PDF nhật ký — escape nội dung user trước khi inject vào print window
- Toast có thể click để đóng sớm, không chồng timer
- Timeout 15 giây cho mọi API call (AbortController) — tránh request treo khi mất mạng

**Tối ưu hiệu năng:**
- Cache nhạc Jamendo theo mood trong phiên — không gọi lại API khi đổi qua lại
- Backend search dùng parameterized SQL chuẩn + index `IX_DiaryEntries_tags`

**Tính năng mới:**
- **Dark Mode** — toggle 🌙/☀️ trong sidebar, lưu `localStorage`, áp dụng ngay khi tải trang
- **Tìm kiếm Nhật ký** — ô tìm từ khoá + bộ lọc ngày; backend `GET /api/diary/search` (TOP 50)
- **Theme System** — 6 theme màu sắc chọn qua nút 🎨 trong sidebar, lưu `localStorage`:

  | Theme | Màu chủ đạo | Cảm giác |
  |---|---|---|
  | Xanh Dương *(mặc định)* | `#2563eb` | Quen thuộc, tin cậy |
  | Tím Oải Hương | `#7C3AED` | Tĩnh lặng, chữa lành |
  | Hồng Đào | `#DB2777` | Ấm áp, nhẹ nhàng |
  | Xanh Lá Rừng | `#059669` | Tươi mát, tăng trưởng |
  | Nâu Ấm Nhật Ký | `#B45309` | Cozy, viết tay |
  | Xanh Biển Sâu | `#0891B2` | Trong sáng, tập trung |
  | Đêm Tím *(luôn tối)* | `#818CF8` | Thâm trầm, ban đêm |
