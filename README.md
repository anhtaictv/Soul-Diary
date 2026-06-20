# 🌱 Nhật Ký Cảm Xúc Số — Full Stack

**Stack:** Node.js + Express · Microsoft SQL Server · Vanilla JS Frontend

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

> ⚠️ **Tuyên bố miễn trừ trách nhiệm**: Ứng dụng không thay thế liệu pháp tâm lý chuyên môn.
