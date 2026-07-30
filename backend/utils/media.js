// utils/media.js — chuyển đổi data URI (base64) <-> Buffer nhị phân
// Dùng để lưu ảnh/audio dạng VARBINARY thay vì base64 text (tiết kiệm ~2.7x dung lượng DB)

// Whitelist chặt cho mime — mime được lưu lại nguyên văn rồi ghép thẳng vào
// `<img src="data:${mime};base64,...">` / `<audio src="...">` ở frontend (template
// literal, không escape). Nếu không chặn ký tự ở đây, mime tuỳ ý (vd chứa dấu `"` `>`)
// có thể thoát khỏi thuộc tính src và chèn HTML/JS — stored XSS qua ảnh/audio đính kèm.
const SAFE_MIME_RE = /^(image\/(jpeg|png|webp|gif)|audio\/(webm|mp4|mpeg|ogg|wav|x-wav)(;codecs=[a-zA-Z0-9.-]+)?)$/;

function dataUriToBuffer(dataUri) {
  if (typeof dataUri !== 'string') return null;
  const idx = dataUri.indexOf(';base64,');
  if (idx === -1 || !dataUri.startsWith('data:')) return null;
  const mime = dataUri.slice(5, idx);          // 'data:' → đến ';base64,' (giữ cả params như ;codecs=opus)
  const b64  = dataUri.slice(idx + 8);
  if (!mime || !b64 || !SAFE_MIME_RE.test(mime)) return null;
  return { mime, buffer: Buffer.from(b64, 'base64') };
}

function bufferToDataUri(mime, buffer) {
  if (!buffer) return null;
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

module.exports = { dataUriToBuffer, bufferToDataUri, SAFE_MIME_RE };
