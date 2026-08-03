// utils/ai-client.js — Lớp gọi AI dùng chung cho toàn app (v3.8)
//
// Thứ tự ưu tiên ở MỌI nghiệp vụ AI:
//   1. AI Gateway trên VPS (C:\ai-gateway, cổng 8080) — chuẩn OpenAI, phía sau là
//      Ollama trên máy cá nhân qua Tailscale, tự fallback Claude khi máy đó tắt.
//   2. Gemini gọi thẳng (code cũ, giữ nguyên) — dùng khi gateway chưa cấu hình/đang hỏng.
//   3. Rule-based fallback sẵn có trong từng route.
//
// Hàm chat() dưới đây KHÔNG bao giờ throw: gateway hỏng thì trả null để chỗ gọi
// tự rơi xuống bước 2 rồi bước 3 — người dùng không bao giờ thấy lỗi trắng trang.

const BASE_URL   = (process.env.AI_GATEWAY_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const API_KEY    = process.env.AI_GATEWAY_API_KEY || '';
// Tắt cứng bằng AI_GATEWAY_ENABLED=0 mà không cần xoá key (để rollback nhanh về Gemini).
const ENABLED    = process.env.AI_GATEWAY_ENABLED !== '0' && API_KEY.length > 0;

// Ollama nạp model lần đầu (hoặc đổi qua lại giữa 2 model) có thể mất 30-60s, lúc model
// đã nằm sẵn trong RAM chỉ ~1.6s. Để timeout thấp sẽ hiểu nhầm thành "gateway chết".
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_GATEWAY_TIMEOUT_MS) || 90000;
// Khi máy Ollama tắt, mỗi request phải chờ hết timeout của gateway rồi mới trả 503.
// Nhớ trạng thái "đang hỏng" trong COOLDOWN_MS để các request sau đi thẳng xuống Gemini,
// tránh việc cả app chậm thêm 12s mỗi lần chỉ để nhận lại đúng một lỗi đã biết.
const COOLDOWN_MS = Number(process.env.AI_GATEWAY_COOLDOWN_MS) || 120000;

let downUntil    = 0;
let lastDownLog  = '';

function isConfigured() {
  return ENABLED;
}

/** Gateway có đang được phép gọi không (đã cấu hình và không trong thời gian cooldown). */
function isAvailable() {
  return ENABLED && Date.now() >= downUntil;
}

function markDown(label, reason) {
  downUntil = Date.now() + COOLDOWN_MS;
  // Chỉ log khi lý do đổi — tránh spam log mỗi lần cooldown gia hạn.
  if (lastDownLog !== reason) {
    lastDownLog = reason;
    console.warn(`[ai-gateway] tạm ngưng ${Math.round(COOLDOWN_MS / 1000)}s (${label}): ${reason}`);
  }
}

function markUp() {
  downUntil   = 0;
  lastDownLog = '';
}

/** GET /health — { ollama, fallbackProvider } hoặc null nếu không gọi được. */
async function health(timeoutMs = 6000) {
  if (!ENABLED) return null;
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Gọi POST /v1/chat/completions của gateway.
 *
 * @param {object}   o
 * @param {string}  [o.system]      System prompt (gateway tự dịch sang shape Claude khi fallback).
 * @param {string}  [o.prompt]      Prompt một lượt — tương đương messages:[{role:'user',...}].
 * @param {Array}   [o.messages]    Hội thoại nhiều lượt [{role:'user'|'assistant', content}].
 * @param {boolean} [o.json]        Yêu cầu JSON thuần (bật response_format cho Ollama).
 * @param {number}  [o.maxTokens]
 * @param {number}  [o.temperature]
 * @param {number}  [o.timeoutMs]
 * @param {string}  [o.label]       Tên nghiệp vụ, chỉ dùng để ghi log.
 * @returns {Promise<string|null>}  Nội dung trả lời, hoặc null khi gateway không dùng được.
 */
async function chat({
  system, prompt, messages,
  json = false, maxTokens = 1024, temperature,
  timeoutMs = DEFAULT_TIMEOUT_MS, label = 'ai',
} = {}) {
  if (!isAvailable()) return null;

  const body = { messages: [], max_tokens: maxTokens };
  if (system) body.messages.push({ role: 'system', content: system });
  if (Array.isArray(messages) && messages.length) {
    body.messages.push(...messages.map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })));
  }
  if (prompt) body.messages.push({ role: 'user', content: prompt });
  if (!body.messages.some(m => m.role !== 'system')) return null;

  if (temperature !== undefined) body.temperature = temperature;
  // Ollama hiểu response_format; nhánh fallback Claude của gateway bỏ qua field này
  // (prompt của từng nghiệp vụ vẫn tự yêu cầu "trả JSON thuần") nên gửi kèm là an toàn.
  if (json) body.response_format = { type: 'json_object' };

  let res;
  try {
    res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    markDown(label, err.name === 'TimeoutError' ? `quá ${timeoutMs}ms không phản hồi` : err.message);
    return null;
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const msg    = detail?.error?.message || `HTTP ${res.status}`;
    // 401 = sai/thiếu AI_GATEWAY_API_KEY: lỗi cấu hình, không tự khỏi. Vẫn cooldown để
    // khỏi bắn liên tục, nhưng log rõ ràng để sửa .env.
    if (res.status === 401) markDown(label, `401 — sai hoặc thiếu AI_GATEWAY_API_KEY trong .env`);
    else markDown(label, msg);
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    markDown(label, `phản hồi không phải JSON: ${err.message}`);
    return null;
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    markDown(label, 'phản hồi không có choices[0].message.content');
    return null;
  }

  markUp();
  return text.trim();
}

/** Bóc ```json ... ``` rồi JSON.parse — model local hay bọc markdown quanh JSON. */
function parseJson(text) {
  if (!text) return null;
  const raw = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Model đôi khi thêm một câu dẫn trước JSON — vớt khối { ... } dài nhất.
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  }
}

if (ENABLED) {
  console.log(`[ai-gateway] bật — ${BASE_URL} (timeout ${DEFAULT_TIMEOUT_MS}ms, cooldown ${COOLDOWN_MS}ms)`);
} else {
  console.log('[ai-gateway] tắt — thiếu AI_GATEWAY_API_KEY hoặc AI_GATEWAY_ENABLED=0, dùng Gemini trực tiếp');
}

module.exports = { chat, parseJson, health, isConfigured, isAvailable, BASE_URL };
