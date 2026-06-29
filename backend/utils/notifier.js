// utils/notifier.js — Tạo thông báo in-app (dùng cho notification_center)
const { getPool, sql } = require('../db');

async function createNotification(userId, type, title, body, link) {
  try {
    const db = await getPool();
    await db.request()
      .input('user_id', sql.Int,      userId)
      .input('type',    sql.NVarChar, type)
      .input('title',   sql.NVarChar, title)
      .input('body',    sql.NVarChar, body || null)
      .input('link',    sql.NVarChar, link || null)
      .query(`
        INSERT INTO Notifications (user_id, type, title, body, link)
        VALUES (@user_id, @type, @title, @body, @link)
      `);
  } catch (err) {
    // Fire-and-forget — không để lỗi notification làm crash request chính
    console.error('[notifier] Lỗi tạo thông báo:', err.message);
  }
}

module.exports = { createNotification };
