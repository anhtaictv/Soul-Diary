// utils/rateLimitKey.js — keyGenerator dùng chung cho mọi rate limiter
//
// Một số request đến với X-Forwarded-For dạng "IP:PORT" (proxy/bot gửi sai định dạng)
// → req.ip trả về chuỗi không phải IP hợp lệ, khiến express-rate-limit ném ValidationError
// (ERR_ERL_INVALID_IP_ADDRESS) chưa được bắt → unhandled rejection → crash toàn bộ tiến trình.
// Cắt bỏ phần ":port" thừa trước khi đưa cho rate limiter để tránh ném lỗi.
function safeKeyGenerator(req) {
  const ip = req.ip || '';
  const m  = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/);
  return m ? m[1] : ip;
}

module.exports = { safeKeyGenerator };
