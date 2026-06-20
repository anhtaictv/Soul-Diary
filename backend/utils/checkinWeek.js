// utils/checkinWeek.js — xác định "tuần check-in" cho Check-in Sức khỏe Tinh thần
//
// Một tuần check-in chạy từ Thứ 7 đến hết Thứ 6 tuần sau (giờ VN, UTC+7), neo theo
// ngày Thứ 7 gần nhất (tính cả hôm nay nếu hôm nay là Thứ 7). Nhờ đó mục check-in
// xuất hiện liên tục từ Thứ 7 -> Thứ 2,3,4... và chỉ đổi sang tuần mới vào Thứ 7 kế tiếp.

// Số tuần ISO 8601 + năm ISO của một ngày (dựa trên Thứ Năm của tuần đó)
function isoWeekInfo(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Thứ 2 = 0 ... Chủ nhật = 6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thứ 5 của tuần chứa `date`
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNumber = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return { year: d.getUTCFullYear(), weekNumber };
}

// Trả về { year, weekNumber } của ngày Thứ 7 gần nhất (giờ VN, UTC+7)
function getCheckinWeek(date = new Date()) {
  const vn  = new Date(date.getTime() + 7 * 3600 * 1000); // quy đổi sang giờ VN
  const day = vn.getUTCDay(); // 0 = Chủ nhật ... 6 = Thứ 7
  const diffToSat = (day - 6 + 7) % 7;
  const anchor = new Date(vn);
  anchor.setUTCDate(anchor.getUTCDate() - diffToSat);
  return isoWeekInfo(anchor);
}

module.exports = { getCheckinWeek };
