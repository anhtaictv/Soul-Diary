// middleware/admin.js — Kiểm tra quyền admin
const { getPool, sql } = require('../db');

async function adminMiddleware(req, res, next) {
  // req.user đã được set bởi authMiddleware trước đó
  if (!req.user) {
    return res.status(401).json({ message: 'Chưa đăng nhập.' });
  }

  try {
    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, req.user.id)
      .query('SELECT role FROM Users WHERE id = @id');

    if (!result.recordset.length || result.recordset[0].role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập trang này.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Lỗi kiểm tra quyền.' });
  }
}

module.exports = adminMiddleware;
