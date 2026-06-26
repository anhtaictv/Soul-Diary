// routes/chat.js — Soul Chat AI (v1.8)
const express = require('express');
const { getPool, sql } = require('../db');
const authMiddleware  = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();
const genai  = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const DAILY_LIMIT = 20;

const CRISIS_KEYWORDS = [
  'tự tử','tự sát','muốn chết','không muốn sống','kết thúc tất cả','chấm dứt cuộc sống',
  'không muốn tồn tại','muốn biến mất','không còn muốn sống','sẽ tự làm hại',
];

function hasCrisis(text) {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some(k => lower.includes(k));
}

const SYSTEM_PROMPT = `Bạn là Soul — người bạn đồng hành tâm lý ấm áp trong ứng dụng Soul Diary, một ứng dụng nhật ký cảm xúc dành cho học sinh sinh viên Việt Nam.

Vai trò của bạn:
- Lắng nghe không phán xét, đồng cảm thật sự
- Đặt câu hỏi nhẹ nhàng để giúp người dùng hiểu cảm xúc của mình hơn
- Áp dụng các kỹ thuật CBT, chánh niệm, tâm lý học tích cực — nhưng không giáo điều
- Ngôn ngữ gần gũi, tự nhiên như người bạn chứ không phải bác sĩ
- KHÔNG đưa ra chẩn đoán y tế hoặc kê đơn thuốc
- Giữ câu trả lời ngắn gọn (2-4 câu), không dài dòng

Khi nhận diện dấu hiệu khủng hoảng (muốn tự làm hại bản thân): nhẹ nhàng thừa nhận cảm xúc, LUÔN gợi ý liên hệ đường dây hỗ trợ 1800 599 920 và khuyến khích mở trang SOS trong ứng dụng.

Trả lời HOÀN TOÀN bằng tiếng Việt. Không dùng emoji trừ khi người dùng dùng trước.`;

// ── GET /api/chat/history ─────────────────────────────────────────────────
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT TOP 50 id, role, content, created_at
        FROM SoulChatMessages
        WHERE user_id=@uid
        ORDER BY created_at DESC
      `);
    res.json({ messages: result.recordset.reverse() });
  } catch (err) {
    console.error('Chat history error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── POST /api/chat/message ────────────────────────────────────────────────
router.post('/message', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim())
      return res.status(400).json({ message: 'Nội dung không được để trống.' });
    if (content.length > 1000)
      return res.status(400).json({ message: 'Tin nhắn quá dài (tối đa 1000 ký tự).' });

    const db = await getPool();

    // Kiểm tra giới hạn tin nhắn hàng ngày
    const countRes = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT COUNT(*) AS cnt FROM SoulChatMessages
        WHERE user_id=@uid AND role='user'
          AND CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)
      `);
    if (countRes.recordset[0].cnt >= DAILY_LIMIT)
      return res.status(429).json({ message: `Bạn đã dùng hết ${DAILY_LIMIT} tin nhắn hôm nay. Quay lại vào ngày mai nhé 💙` });

    // Lưu tin nhắn user
    await db.request()
      .input('uid', sql.Int, req.user.id)
      .input('role', sql.NVarChar, 'user')
      .input('content', sql.NVarChar, content.trim())
      .query('INSERT INTO SoulChatMessages (user_id,role,content) VALUES (@uid,@role,@content)');

    // Kiểm tra từ khóa khủng hoảng
    const crisis = hasCrisis(content);

    // Lấy 10 tin nhắn gần nhất để làm context
    const histRes = await db.request()
      .input('uid', sql.Int, req.user.id)
      .query(`
        SELECT TOP 10 role, content FROM SoulChatMessages
        WHERE user_id=@uid ORDER BY created_at DESC
      `);
    const history = histRes.recordset.reverse();

    let replyText;

    if (!genai) {
      replyText = 'Mình hiểu bạn đang chia sẻ điều này. Hãy nói thêm để mình có thể lắng nghe tốt hơn nhé.';
    } else {
      try {
        const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const chat  = model.startChat({
          history: [
            { role: 'user',  parts: [{ text: SYSTEM_PROMPT }] },
            { role: 'model', parts: [{ text: 'Tôi đã hiểu vai trò của mình. Tôi sẵn sàng lắng nghe.' }] },
            ...history.slice(0, -1).map(m => ({
              role:  m.role === 'user' ? 'user' : 'model',
              parts: [{ text: m.content }],
            })),
          ],
        });
        const result = await chat.sendMessage(content.trim());
        replyText = result.response.text().trim();
        if (crisis) {
          replyText += '\n\nMình lo cho bạn. Nếu bạn đang trải qua giai đoạn rất khó khăn, hãy gọi **1800 599 920** (miễn phí, 24/7) hoặc mở trang **Đường dây hỗ trợ** trong ứng dụng — bạn không phải một mình.';
        }
      } catch (geminiErr) {
        if (crisis) {
          replyText = 'Mình nghe bạn và mình lo cho bạn. Điều bạn đang cảm thấy rất nặng nề. Hãy gọi ngay **1800 599 920** (miễn phí, 24/7) — có người sẵn sàng lắng nghe bạn ngay lúc này. Bạn không phải một mình.';
        } else {
          replyText = 'Mình đang gặp chút trục trặc kỹ thuật. Hãy thử lại sau một lát nhé — mình vẫn ở đây lắng nghe bạn 💙';
        }
      }
    }

    // Lưu tin nhắn AI
    await db.request()
      .input('uid', sql.Int, req.user.id)
      .input('role', sql.NVarChar, 'assistant')
      .input('content', sql.NVarChar, replyText)
      .query('INSERT INTO SoulChatMessages (user_id,role,content) VALUES (@uid,@role,@content)');

    const remaining = DAILY_LIMIT - countRes.recordset[0].cnt - 1;
    res.json({ reply: replyText, crisis, remaining });
  } catch (err) {
    console.error('Chat message error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── DELETE /api/chat/clear — xóa lịch sử chat ────────────────────────────
router.delete('/clear', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input('uid', sql.Int, req.user.id)
      .query('DELETE FROM SoulChatMessages WHERE user_id=@uid');
    res.json({ message: 'Đã xóa lịch sử trò chuyện.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;
