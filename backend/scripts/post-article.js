// Đăng bài (nháp) vào thư viện kiến thức qua API — dùng bởi skill /dang-bai.
// Luôn tạo bài ở trạng thái is_published=false; admin tự duyệt & publish qua trang admin.
//
// Cách dùng:
//   node scripts/post-article.js path/to/bai-viet.json
//   node scripts/post-article.js path/to/danh-sach-bai.json   (mảng nhiều bài)
//
// Yêu cầu .env có ADMIN_USERNAME và ADMIN_PASSWORD (tài khoản role=admin).

require('dotenv').config();
const fs = require('fs');

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';

async function login() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error('Thiếu ADMIN_USERNAME / ADMIN_PASSWORD trong .env');
  }
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Đăng nhập admin thất bại: ' + (data.message || res.status));
  return data.token;
}

async function postArticle(token, article) {
  const payload = { ...article, is_published: false }; // luôn ép nháp, không publish tự động
  const res = await fetch(`${API_BASE}/articles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Đăng bài thất bại: ' + (data.message || res.status));
  return data.article;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Dùng: node scripts/post-article.js <file.json>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const articles = Array.isArray(raw) ? raw : [raw];

  const token = await login();

  for (const article of articles) {
    const created = await postArticle(token, article);
    console.log(`💾 Đã lưu nháp: #${created.id} [${created.type}] ${created.title}`);
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
