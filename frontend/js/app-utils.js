// app-utils.js — Tiện ích dùng chung (escape, format ngày)

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// Hiển thị thời gian tương đối: "Hôm nay · 21:30", "Hôm qua", "3 ngày trước"...
function formatDateRelative(iso) {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now - d) / 86400000);
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  if (diff === 0) return 'Hôm nay · ' + time;
  if (diff === 1) return 'Hôm qua · ' + time;
  if (diff < 7)  return diff + ' ngày trước · ' + time;
  if (diff < 30) return Math.floor(diff / 7)  + ' tuần trước';
  if (diff < 365) return Math.floor(diff / 30) + ' tháng trước';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
