// Self-check cho fix bảo mật baomat.txt — chạy: node test_security_fixes.js
// Không cần DB/server. Kiểm tra SAFE_MIME_RE chặn đúng chuỗi mime độc hại (stored XSS
// qua ảnh/audio đính kèm nhật ký) mà vẫn chấp nhận mime hợp lệ thật sự dùng trong app.
const assert = require('assert');
const { dataUriToBuffer, SAFE_MIME_RE } = require('./utils/media');

// Mime hợp lệ frontend thực sự gửi (canvas.toDataURL('image/jpeg'), MediaRecorder audio/webm)
assert.strictEqual(SAFE_MIME_RE.test('image/jpeg'), true);
assert.strictEqual(SAFE_MIME_RE.test('image/png'), true);
assert.strictEqual(SAFE_MIME_RE.test('audio/webm'), true);
assert.strictEqual(SAFE_MIME_RE.test('audio/webm;codecs=opus'), true);

// Chuỗi mime cố tình thoát khỏi thuộc tính src="..." trong <img>/<audio> ở frontend
assert.strictEqual(SAFE_MIME_RE.test('image/png" onerror="alert(1)'), false);
assert.strictEqual(SAFE_MIME_RE.test('image/svg+xml'), false); // SVG có thể chứa <script>
assert.strictEqual(SAFE_MIME_RE.test('text/html'), false);

// dataUriToBuffer phải từ chối toàn bộ payload nếu mime không hợp lệ, kể cả base64 hợp lệ
const malicious = 'data:image/png" onerror="alert(1);base64,QQ==';
assert.strictEqual(dataUriToBuffer(malicious), null);

// Nhưng vẫn parse đúng data URI hợp lệ
const legit = dataUriToBuffer('data:image/jpeg;base64,QQ==');
assert.ok(legit && legit.mime === 'image/jpeg' && Buffer.isBuffer(legit.buffer));

console.log('✅ Tất cả test bảo mật (SAFE_MIME_RE / dataUriToBuffer) đều pass.');
