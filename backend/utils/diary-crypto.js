// utils/diary-crypto.js — mã hoá/giải mã nội dung nhạy cảm (nhật ký) at-rest bằng AES-256-GCM
// Key lấy từ ENCRYPTION_KEY (base64, 32 byte) — thiếu/sai độ dài thì server từ chối start
// (fail-fast: tuyệt đối không được âm thầm rơi về lưu plaintext).

const crypto = require('crypto');

const PREFIX = 'enc1:';
const ALGO   = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

const raw = process.env.ENCRYPTION_KEY;
if (!raw) throw new Error('ENCRYPTION_KEY chưa được cấu hình trong .env — cần chuỗi base64 32 byte (xem .env.example).');
const KEY = Buffer.from(raw, 'base64');
if (KEY.length !== 32) throw new Error(`ENCRYPTION_KEY phải là base64 của đúng 32 byte, hiện là ${KEY.length} byte.`);

function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  const iv     = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, ciphertext, tag]).toString('base64');
}

function decryptField(value) {
  if (value === null || value === undefined || value === '' || !value.startsWith(PREFIX)) return value;
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv         = buf.subarray(0, IV_LEN);
  const tag        = buf.subarray(buf.length - TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Giải mã nhiều field cùng lúc trên 1 row — trả về bản sao, không sửa row gốc
function decryptRow(row, fields) {
  if (!row) return row;
  const out = { ...row };
  for (const f of fields) out[f] = decryptField(out[f]);
  return out;
}

function decryptRows(records, fields) {
  return records.map(r => decryptRow(r, fields));
}

module.exports = { encryptField, decryptField, decryptRow, decryptRows };
