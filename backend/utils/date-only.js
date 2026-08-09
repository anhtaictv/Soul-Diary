// Tiện ích cho các cột kiểu DATE của SQL Server (last_entry, ai_recap_date, ...).
//
// Cột DATE chỉ lưu ngày, không mang múi giờ. Kết nối đặt `useUTC: false` (xem db/index.js)
// nên driver đọc/ghi bằng phần giờ ĐỊA PHƯƠNG của đối tượng Date — cùng múi giờ với
// GETDATE() và các phép so sánh CAST(GETDATE() AS DATE) phía SQL.
//
// Ba hàm dưới đây là ranh giới quy đổi duy nhất. Dùng chúng thay vì tự dựng Date tại
// chỗ, để nếu sau này `useUTC` có đổi thì chỉ phải sửa một nơi.

// Ngày lịch của `date` → Date nửa đêm giờ địa phương, dạng chuẩn để truyền vào sql.Date.
function toDateOnly(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Giá trị DATE đọc từ DB → Date nửa đêm giờ địa phương, so sánh trực tiếp được với
// new Date() đã setHours(0,0,0,0). Trả null nếu cột rỗng.
function fromDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Chuỗi 'YYYY-MM-DD' theo giờ địa phương. KHÔNG dùng toISOString() cho việc này:
// hàm đó trả về ngày theo UTC nên sai suốt từ 0h đến 7h sáng.
function localDayKey(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = { toDateOnly, fromDateOnly, localDayKey };
