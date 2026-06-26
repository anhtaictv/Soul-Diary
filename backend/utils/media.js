// utils/media.js — chuyển đổi data URI (base64) <-> Buffer nhị phân
// Dùng để lưu ảnh/audio dạng VARBINARY thay vì base64 text (tiết kiệm ~2.7x dung lượng DB)

function dataUriToBuffer(dataUri) {
  if (typeof dataUri !== 'string') return null;
  const idx = dataUri.indexOf(';base64,');
  if (idx === -1 || !dataUri.startsWith('data:')) return null;
  const mime = dataUri.slice(5, idx);          // 'data:' → đến ';base64,' (giữ cả params như ;codecs=opus)
  const b64  = dataUri.slice(idx + 8);
  if (!mime || !b64) return null;
  return { mime, buffer: Buffer.from(b64, 'base64') };
}

function bufferToDataUri(mime, buffer) {
  if (!buffer) return null;
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

module.exports = { dataUriToBuffer, bufferToDataUri };
