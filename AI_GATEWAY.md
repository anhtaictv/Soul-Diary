# Soul Diary ↔ AI Gateway

Toàn bộ nghiệp vụ AI của Soul Diary gọi qua **AI Gateway** dùng chung trên VPS
(`C:\ai-gateway`, service `AIGateway` chạy bằng NSSM, cổng `8080`, chỉ lắng nghe
`127.0.0.1` và IP Tailscale — không expose ra internet).

## Chuỗi ưu tiên

Mỗi lần cần AI, backend đi lần lượt 3 bước và **không bao giờ trả lỗi ra người dùng**:

| # | Nguồn | Khi nào dùng |
|---|-------|--------------|
| 1 | **AI Gateway** → Ollama (`qwen2.5:7b`) qua Tailscale, gateway tự fallback Claude | Mặc định, khi có `AI_GATEWAY_API_KEY` và gateway đang sống |
| 2 | **Gemini** (`gemini-2.0-flash`) gọi thẳng | Gateway chưa cấu hình / đang hỏng / trả JSON sai schema |
| 3 | **Rule-based** viết sẵn trong từng route | Cả 2 nguồn trên đều không dùng được |

Muốn bỏ hẳn Gemini: xoá `GEMINI_API_KEY` khỏi `.env` — code tự bỏ qua bước 2, đi thẳng
từ gateway xuống rule-based. Muốn tắt gateway để quay về Gemini: đặt `AI_GATEWAY_ENABLED=0`.

## Cấu hình (`backend/.env`)

```
AI_GATEWAY_URL=http://127.0.0.1:8080
AI_GATEWAY_API_KEY=<đúng bằng GATEWAY_API_KEY trong C:\ai-gateway\.env>
AI_GATEWAY_ENABLED=1
AI_GATEWAY_TIMEOUT_MS=90000
AI_GATEWAY_COOLDOWN_MS=120000
```

## Hợp đồng gọi

`backend/utils/ai-client.js` là nơi duy nhất biết mặt gateway. Nó gọi:

```
POST http://127.0.0.1:8080/v1/chat/completions
Authorization: Bearer <AI_GATEWAY_API_KEY>
{ "messages": [{"role":"system"|"user"|"assistant","content":"..."}],
  "max_tokens": 600, "temperature": 0.8,
  "response_format": {"type":"json_object"}   // chỉ khi cần JSON
}
```

Không gửi `model` — gateway tự ép model theo cấu hình phía nó (`OLLAMA_CHAT_MODEL`),
client không cần biết máy chạy Ollama đang pull model gì. Kết quả đọc ở
`choices[0].message.content` (nhánh fallback Claude cũng đã được gateway dịch về đúng
shape OpenAI này).

API dùng trong code:

```js
const gateway = require('../utils/ai-client');

const text = await gateway.chat({ system, prompt, messages, json, maxTokens, temperature, timeoutMs, label });
// -> string, hoặc null khi gateway không dùng được (KHÔNG throw)
const obj  = gateway.parseJson(text);   // bóc ```json ... ``` rồi JSON.parse, lỗi -> null
```

## Các điểm gọi AI trong app

| Nghiệp vụ | File | Kiểu | Ghi chú |
|-----------|------|------|---------|
| Phân tích cảm xúc bài nhật ký | `backend/utils/diary-helpers.js` → `analyzeEntry` | JSON | fallback `ruleBasedAnalysis` |
| Trợ lý Tâm hồn (phản hồi ấm áp) | `backend/utils/diary-helpers.js` → `companionMessage` | text | fallback `ruleBasedCompanion` |
| Tóm tắt tuần (smart recap) | `backend/routes/diary-ai.js` | text | cache 1 lần/ngày trong `Users.ai_recap_text` |
| AI Coach (3 lời khuyên) | `backend/routes/diary-ai.js` | JSON | cache 7 ngày trong `Users.ai_coach_text` |
| Soul Chat | `backend/routes/chat.js` | chat nhiều lượt | timeout riêng 45s, có nhánh khủng hoảng |
| Phân tích tâm lý hàng tuần | `backend/routes/checkin.js` | JSON | validate bằng `validateAnalysis()` trước khi lưu |

## Hai điều dễ vấp

**Cooldown.** Khi máy Ollama tắt, gateway phải chờ hết timeout của nó rồi mới trả `503`
(đo thực tế ~12s). Nếu request nào cũng thử gateway trước thì mọi tính năng AI đều chậm
thêm 12s một cách vô ích. `ai-client.js` vì vậy nhớ trạng thái "gateway đang hỏng" trong
`AI_GATEWAY_COOLDOWN_MS` và cho các request kế tiếp đi thẳng xuống Gemini/rule-based.
Hệ quả cần biết: sau khi bật lại máy Ollama, app có thể mất tới 2 phút mới tự dùng lại
gateway — muốn nhanh thì `pm2 restart` backend.

**Không có `responseSchema`.** Gemini ép được JSON theo schema, gateway thì không.
Với các nghiệp vụ JSON, prompt phải tự mô tả schema bằng lời và code **bắt buộc** validate
lại kết quả trước khi lưu (`validateAnalysis`, kiểm tra `Array.isArray`), vì model local
không đảm bảo đúng shape như Gemini.

## Kiểm tra nhanh

```powershell
# gateway còn sống không, Ollama có kết nối được không
Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing | Select-Object -Expand Content

# log gateway
Get-Content C:\ai-gateway\logs\gateway.log -Tail 30

# log app (dòng [ai-gateway] ... khi bị ngưng tạm)
pm2 logs souldiary-api --lines 50
```
