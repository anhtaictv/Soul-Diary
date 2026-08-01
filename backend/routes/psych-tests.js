// routes/psych-tests.js — 11 bài test sàng lọc tâm lý chuyên sâu (on-demand, không theo tuần)
// Dựa trên các thang đo lâm sàng đã được kiểm chứng khoa học (dịch sang tiếng Việt), CÙNG mức độ
// tin cậy với PHQ-9/GAD-7/PSS-10/WHO-5 đang dùng ở check-in hàng tuần (xem routes/checkin.js).
// TUYỆT ĐỐI KHÔNG chẩn đoán bệnh — chỉ sàng lọc, theo dõi và khuyến khích tìm hỗ trợ chuyên môn.
const express          = require('express');
const { getPool, sql } = require('../db');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const DISCLAIMER = 'Kết quả chỉ mang tính chất sàng lọc và theo dõi tiến triển cá nhân, không thay thế cho kết luận chẩn đoán y khoa từ bác sĩ chuyên khoa.';
const GENERIC_RECOMMENDATION = 'Hãy thử trò chuyện với một người bạn tin tưởng hoặc người thân, hoặc đặt lịch gặp chuyên gia tâm lý/tư vấn học đường để được hỗ trợ thêm nhé.';

// ── Bộ lựa chọn trả lời dùng chung ──────────────────────────────────────
const OPTIONS = {
  freq4: [
    { value: 0, label: 'Không ngày nào' },
    { value: 1, label: 'Vài ngày' },
    { value: 2, label: 'Hơn nửa số ngày' },
    { value: 3, label: 'Gần như mỗi ngày' },
  ],
  freq5: [
    { value: 0, label: 'Hoàn toàn không' },
    { value: 1, label: 'Một chút' },
    { value: 2, label: 'Vừa phải' },
    { value: 3, label: 'Khá nhiều' },
    { value: 4, label: 'Rất nhiều' },
  ],
  yesno: [
    { value: 0, label: 'Không' },
    { value: 1, label: 'Có' },
  ],
  sdq3: [
    { value: 0, label: 'Không đúng' },
    { value: 1, label: 'Đúng một phần' },
    { value: 2, label: 'Chắc chắn đúng' },
  ],
  eat6: [
    { value: 0, label: 'Không bao giờ' },
    { value: 1, label: 'Hiếm khi' },
    { value: 2, label: 'Thỉnh thoảng' },
    { value: 3, label: 'Khá thường xuyên' },
    { value: 4, label: 'Thường xuyên' },
    { value: 5, label: 'Luôn luôn' },
  ],
  mdqSeverity: [
    { value: 0, label: 'Không gây vấn đề gì' },
    { value: 1, label: 'Vấn đề nhỏ' },
    { value: 2, label: 'Vấn đề vừa phải' },
    { value: 3, label: 'Vấn đề nghiêm trọng' },
  ],
};

const epdsOptions = (labels) => labels.map((label, value) => ({ value, label }));

// ── 1. Test trầm cảm — PHQ-9 (Patient Health Questionnaire-9) ───────────
const TEST_DEPRESSION = {
  key: 'depression', name: 'Test trầm cảm', icon: '💙',
  shortDesc: 'Sàng lọc các dấu hiệu trầm cảm phổ biến trong 2 tuần gần đây.',
  instrument: 'PHQ-9 (Patient Health Questionnaire-9)',
  preface: 'Trong 2 tuần qua, bạn có thường xuyên gặp phải những vấn đề sau không?',
  type: 'sum', options: OPTIONS.freq4, maxScore: 27, selfHarmIndex: 8,
  items: [
    { text: 'Ít hứng thú hoặc không còn thấy vui thích khi làm việc' },
    { text: 'Cảm thấy buồn chán, chán nản hoặc tuyệt vọng' },
    { text: 'Khó ngủ, ngủ không ngon giấc, hoặc ngủ quá nhiều' },
    { text: 'Cảm thấy mệt mỏi hoặc có rất ít năng lượng' },
    { text: 'Ăn không ngon miệng hoặc ăn quá nhiều' },
    { text: 'Cảm thấy bản thân tồi tệ, là người thất bại, hoặc làm bản thân/gia đình thất vọng' },
    { text: 'Khó tập trung vào việc gì đó, ví dụ đọc sách hoặc xem video' },
    { text: 'Di chuyển/nói chậm chạp đến mức người khác nhận thấy, hoặc ngược lại bồn chồn, đứng ngồi không yên hơn bình thường' },
    { text: 'Có ý nghĩ rằng thà mình chết đi hoặc muốn tự làm tổn thương bản thân theo cách nào đó' },
  ],
  cutoffs: [
    { max: 4,  level: 'low',      text: 'Mức độ biểu hiện triệu chứng trầm cảm của bạn đang ở mức thấp. Bạn đang quản lý cảm xúc khá tốt.' },
    { max: 14, level: 'moderate', text: 'Mức độ biểu hiện triệu chứng trầm cảm của bạn đang ở mức trung bình. Hãy chú ý chăm sóc bản thân nhiều hơn nhé.' },
    { max: 27, level: 'high',     text: 'Mức độ biểu hiện triệu chứng trầm cảm của bạn đang ở mức cao.' },
  ],
};

// ── 2. Test rối loạn lo âu — GAD-7 ───────────────────────────────────────
const TEST_ANXIETY = {
  key: 'anxiety', name: 'Test rối loạn lo âu', icon: '😰',
  shortDesc: 'Sàng lọc các dấu hiệu lo âu lan toả trong 2 tuần gần đây.',
  instrument: 'GAD-7 (Generalized Anxiety Disorder-7)',
  preface: 'Trong 2 tuần qua, bạn có thường xuyên gặp phải những vấn đề sau không?',
  type: 'sum', options: OPTIONS.freq4, maxScore: 21,
  items: [
    { text: 'Cảm thấy lo lắng, bồn chồn hoặc căng thẳng' },
    { text: 'Không thể ngừng hoặc kiểm soát được sự lo lắng' },
    { text: 'Lo lắng quá nhiều về những điều khác nhau' },
    { text: 'Khó thư giãn' },
    { text: 'Bồn chồn đến mức khó ngồi yên' },
    { text: 'Dễ bực bội hoặc cáu kỉnh' },
    { text: 'Cảm thấy sợ hãi như thể điều gì đó tồi tệ sắp xảy ra' },
  ],
  cutoffs: [
    { max: 4,  level: 'low',      text: 'Mức độ biểu hiện triệu chứng lo âu của bạn đang ở mức thấp.' },
    { max: 14, level: 'moderate', text: 'Mức độ biểu hiện triệu chứng lo âu của bạn đang ở mức trung bình. Một vài kỹ thuật thư giãn có thể giúp ích cho bạn.' },
    { max: 21, level: 'high',     text: 'Mức độ biểu hiện triệu chứng lo âu của bạn đang ở mức cao.' },
  ],
};

// ── 3. Test rối loạn lưỡng cực — MDQ (Mood Disorder Questionnaire) ──────
const TEST_BIPOLAR = {
  key: 'bipolar', name: 'Test rối loạn lưỡng cực', icon: '🎭',
  shortDesc: 'Sàng lọc các biểu hiện hưng cảm/hưng cảm nhẹ từng có trong quá khứ.',
  instrument: 'MDQ (Mood Disorder Questionnaire)',
  preface: 'Đã bao giờ có một giai đoạn mà bạn KHÔNG phải là chính mình như bình thường, và...',
  type: 'mdq', options: OPTIONS.yesno, maxScore: 13,
  items: [
    { text: '...bạn cảm thấy phấn khích/tự tin thái quá đến mức người khác nghĩ bạn không bình thường hoặc gây rắc rối?' },
    { text: '...bạn dễ cáu gắt đến mức quát mắng người khác, gây gổ hoặc đánh nhau?' },
    { text: '...bạn cảm thấy tự tin hơn bình thường rất nhiều?' },
    { text: '...bạn ngủ ít hơn nhiều so với bình thường mà vẫn không thấy mệt?' },
    { text: '...bạn nói nhiều hơn hoặc nói nhanh hơn thường lệ?' },
    { text: '...suy nghĩ trong đầu bạn dồn dập, không thể làm chậm lại?' },
    { text: '...bạn dễ bị phân tâm bởi những thứ xung quanh, khó tập trung?' },
    { text: '...bạn có nhiều năng lượng hơn bình thường rất nhiều?' },
    { text: '...bạn hoạt động/làm nhiều việc hơn bình thường (công việc, bạn bè, sở thích...)?' },
    { text: '...bạn chủ động bắt chuyện với người lạ nhiều hơn bình thường?' },
    { text: '...bạn có ham muốn tình dục nhiều hơn bình thường?' },
    { text: '...bạn làm những việc bất thường, hoặc người khác cho là quá đáng, ngớ ngẩn hay rủi ro?' },
    { text: '...bạn tiêu tiền nhiều đến mức gây rắc rối cho bản thân hoặc gia đình?' },
    { text: 'Nếu bạn chọn "Có" cho nhiều hơn 1 câu ở trên: những biểu hiện đó có từng xảy ra CÙNG MỘT LÚC, trong cùng một giai đoạn không?', options: OPTIONS.yesno },
    { text: 'Những biểu hiện đó đã gây ảnh hưởng đến cuộc sống của bạn (công việc, tiền bạc, gia đình, pháp lý...) ở mức độ nào?', options: OPTIONS.mdqSeverity },
  ],
};

// ── 4. Test OCD — OCI-R (Obsessive-Compulsive Inventory-Revised) ───────
const TEST_OCD = {
  key: 'ocd', name: 'Test rối loạn ám ảnh cưỡng chế (OCD)', icon: '🔁',
  shortDesc: 'Sàng lọc các suy nghĩ ám ảnh và hành vi cưỡng chế lặp lại.',
  instrument: 'OCI-R (Obsessive-Compulsive Inventory-Revised)',
  preface: 'Trong tháng qua, bạn bị làm phiền hoặc khó chịu bởi những điều sau ở mức nào?',
  type: 'sum', options: OPTIONS.freq5, maxScore: 72,
  items: [
    { text: 'Tôi đã tích trữ nhiều thứ đến mức chúng gây vướng víu trong nhà' },
    { text: 'Sau khi chạm vào vật gì đó, tôi phải rửa tay hoặc lau tay' },
    { text: 'Tôi kiểm tra mọi thứ nhiều lần hơn mức cần thiết' },
    { text: 'Tôi thấy khó kiểm soát suy nghĩ của chính mình' },
    { text: 'Tôi cất giữ quá nhiều đồ đến mức chúng gây cản trở' },
    { text: 'Tôi kiểm tra bếp ga, vòi nước, khóa cửa nhiều lần sau khi rời khỏi nhà' },
    { text: 'Tôi có những suy nghĩ khó chịu, không mong muốn cứ hiện lên trong đầu dù tôi không muốn' },
    { text: 'Tôi tránh chạm vào tay nắm cửa, vòi nước công cộng vì sợ bị nhiễm bẩn' },
    { text: 'Tôi thấy khó kiểm soát các xung động của bản thân' },
    { text: 'Tôi kiểm tra cửa, cửa sổ, ngăn kéo... nhiều lần' },
    { text: 'Tôi có những suy nghĩ hung hăng hướng đến bản thân hoặc người khác mà tôi không mong muốn' },
    { text: 'Tôi thấy mình phải đếm khi thực hiện một việc gì đó' },
    { text: 'Tôi rửa tay lâu hơn và kỹ hơn mức cần thiết' },
    { text: 'Tôi có những suy nghĩ khó chịu về tình dục lặp đi lặp lại' },
    { text: 'Tôi thấy phiền nếu người khác sắp xếp lại đồ đạc của mình' },
    { text: 'Tôi cảm thấy phải lặp lại một số hành động nhất định nhiều lần' },
    { text: 'Tôi bị ám ảnh bởi sự sạch sẽ' },
    { text: 'Tôi thấy khó quyết định ngay cả với những việc nhỏ nhặt' },
  ],
  cutoffs: [
    { max: 10, level: 'low',      text: 'Các biểu hiện ám ảnh - cưỡng chế của bạn hiện ở mức thấp.' },
    { max: 20, level: 'moderate', text: 'Bạn có một số biểu hiện ám ảnh - cưỡng chế ở mức trung bình, đáng để bạn quan sát thêm.' },
    { max: 72, level: 'high',     text: 'Điểm số của bạn ở mức cao (≥21 là ngưỡng tham khảo thường dùng), gợi ý nên trao đổi với chuyên gia tâm lý để được đánh giá kỹ hơn.' },
  ],
};

// ── 5. Test rối loạn tâm thần — PQ-16 (Prodromal Questionnaire, rút gọn) ─
const TEST_PSYCHOSIS = {
  key: 'psychosis', name: 'Test rối loạn tâm thần', icon: '🌀',
  shortDesc: 'Sàng lọc những trải nghiệm bất thường về nhận thức và giác quan.',
  instrument: 'PQ-16 (Prodromal Questionnaire – 16 item)',
  preface: 'Bạn đã bao giờ trải qua những điều sau đây chưa?',
  type: 'sum', options: OPTIONS.yesno, maxScore: 16,
  items: [
    { text: 'Tôi cảm thấy nhiều thứ trên TV hoặc quảng cáo như có ẩn ý nói riêng cho mình' },
    { text: 'Tôi cảm thấy như có ai đó đang bám theo hoặc theo dõi mình' },
    { text: 'Tôi cảm thấy như mình có khả năng đặc biệt để cảm nhận hoặc biết trước những điều mà người khác không thể' },
    { text: 'Tôi từng nghe thấy âm thanh hoặc giọng nói kỳ lạ mà không ai khác nghe thấy' },
    { text: 'Tôi cảm thấy như có giọng nói đang thì thầm hoặc bình luận về việc mình đang làm' },
    { text: 'Tôi cảm thấy như suy nghĩ của mình bị người khác đọc được hoặc can thiệp vào' },
    { text: 'Tôi cảm thấy cơ thể mình thay đổi theo cách kỳ lạ mà không giải thích được' },
    { text: 'Tôi cảm thấy mọi thứ xung quanh trở nên xa lạ, như không có thực' },
    { text: 'Tôi thấy khó diễn đạt suy nghĩ thành lời, người khác nói tôi nói chuyện khó hiểu' },
    { text: 'Tôi từng ngửi hoặc nếm thấy những mùi vị lạ mà người khác không nhận ra' },
    { text: 'Tôi từng nhìn thấy những thứ mà người khác không thấy' },
    { text: 'Tôi cảm thấy mất hứng thú với hầu hết mọi thứ xung quanh mình' },
    { text: 'Tôi cảm thấy bản thân mình hoặc thế giới xung quanh không có thực, như trong một giấc mơ' },
    { text: 'Tôi có những suy nghĩ kỳ lạ xuất hiện mà không rõ từ đâu' },
    { text: 'Tôi thấy khó khăn để tin tưởng bất kỳ ai' },
    { text: 'Tôi thấy mình phản ứng cảm xúc rất khác thường so với trước đây' },
  ],
  cutoffs: [
    { max: 2,  level: 'low',      text: 'Bạn có rất ít trải nghiệm bất thường trong danh sách này.' },
    { max: 5,  level: 'moderate', text: 'Bạn có một vài trải nghiệm đáng chú ý — không có nghĩa là bạn mắc bệnh gì, nhưng đáng để tìm hiểu thêm cùng chuyên gia.' },
    { max: 16, level: 'high',     text: 'Bạn có khá nhiều trải nghiệm trùng khớp với thang sàng lọc này (≥6 là ngưỡng tham khảo thường dùng). Đây KHÔNG phải là chẩn đoán — rất nên gặp bác sĩ tâm thần hoặc chuyên gia tâm lý để được đánh giá đầy đủ, càng sớm càng tốt.' },
  ],
};

// ── 6. Test rối loạn ăn uống — EAT-26 (Eating Attitudes Test) ───────────
const TEST_EATING = {
  key: 'eating', name: 'Test rối loạn ăn uống', icon: '🍽️',
  shortDesc: 'Sàng lọc các suy nghĩ và hành vi ăn uống bất thường (Anorexia & Bulimia).',
  instrument: 'EAT-26 (Eating Attitudes Test)',
  preface: 'Hãy chọn mức độ đúng với bạn cho từng câu sau:',
  type: 'eat26', options: OPTIONS.eat6, maxScore: 78,
  items: [
    { text: 'Tôi rất sợ bị tăng cân' },
    { text: 'Tôi tránh ăn khi đói' },
    { text: 'Tôi thấy bản thân bị ám ảnh bởi thức ăn' },
    { text: 'Tôi từng ăn quá nhiều trong thời gian ngắn rồi cảm thấy không kiểm soát được' },
    { text: 'Tôi cắt thức ăn thành từng miếng nhỏ' },
    { text: 'Tôi biết rõ lượng calo trong thức ăn mình ăn' },
    { text: 'Tôi đặc biệt tránh những thức ăn nhiều tinh bột (bánh mì, cơm, khoai...)' },
    { text: 'Tôi cảm thấy người khác muốn tôi ăn nhiều hơn' },
    { text: 'Tôi nôn ra sau khi ăn' },
    { text: 'Tôi cảm thấy cực kỳ tội lỗi sau khi ăn' },
    { text: 'Tôi bị ám ảnh muốn gầy hơn' },
    { text: 'Tôi nghĩ về việc đốt calo khi tập thể dục' },
    { text: 'Người khác nghĩ tôi quá gầy' },
    { text: 'Tôi bị ám ảnh bởi ý nghĩ có mỡ thừa trên cơ thể' },
    { text: 'Tôi mất nhiều thời gian hơn người khác để ăn xong bữa' },
    { text: 'Tôi tránh những thức ăn có đường' },
    { text: 'Tôi ăn thức ăn kiêng/ít calo' },
    { text: 'Tôi cảm thấy thức ăn kiểm soát cuộc sống của mình' },
    { text: 'Tôi thể hiện khả năng tự kiềm chế với thức ăn' },
    { text: 'Tôi cảm thấy người khác gây áp lực bắt tôi phải ăn' },
    { text: 'Tôi dành quá nhiều thời gian và suy nghĩ cho thức ăn' },
    { text: 'Tôi cảm thấy khó chịu sau khi ăn đồ ngọt' },
    { text: 'Tôi từng tham gia ăn kiêng' },
    { text: 'Tôi thích cảm giác bụng trống rỗng' },
    { text: 'Tôi có xu hướng nôn sau bữa ăn' },
    { text: 'Tôi thích thử những món ăn mới lạ, ngon', reverse: true },
  ],
  cutoffs: [
    { max: 9,  level: 'low',      text: 'Thái độ ăn uống của bạn hiện ở mức thấp về nguy cơ.' },
    { max: 19, level: 'moderate', text: 'Bạn có một số suy nghĩ/hành vi ăn uống đáng chú ý ở mức trung bình.' },
    { max: 78, level: 'high',     text: 'Điểm số của bạn ở mức cao (≥20 là ngưỡng tham khảo thường dùng), gợi ý nên trao đổi với bác sĩ hoặc chuyên gia dinh dưỡng/tâm lý để được đánh giá kỹ hơn.' },
  ],
};

// ── 7. Test trầm cảm cho cặp bố mẹ trẻ — EPDS (dùng được cho cả bố & mẹ) ─
const TEST_POSTPARTUM = {
  key: 'postpartum', name: 'Test trầm cảm cho cặp bố mẹ trẻ', icon: '👶',
  shortDesc: 'Sàng lọc trầm cảm sau sinh, áp dụng cho cả bố và mẹ có con nhỏ.',
  instrument: 'EPDS (Edinburgh Postnatal Depression Scale)',
  preface: 'Trong 7 ngày qua, không chỉ hôm nay:',
  type: 'sum', maxScore: 30, selfHarmIndex: 9,
  items: [
    { text: 'Tôi có thể cười và nhìn thấy sự hài hước của sự việc', options: epdsOptions(['Nhiều như trước','Không nhiều như trước','Rõ ràng ít hơn trước','Hoàn toàn không']) },
    { text: 'Tôi mong chờ những điều thú vị sắp tới', options: epdsOptions(['Nhiều như trước','Ít hơn trước một chút','Rõ ràng ít hơn trước','Hầu như không']) },
    { text: 'Tôi tự trách bản thân một cách không cần thiết khi có chuyện không suôn sẻ', options: epdsOptions(['Không, không bao giờ','Không thường xuyên','Có, đôi khi','Có, hầu hết thời gian']) },
    { text: 'Tôi cảm thấy lo lắng hoặc bồn chồn mà không có lý do rõ ràng', options: epdsOptions(['Không, không hề','Hiếm khi','Có, đôi khi','Có, rất thường xuyên']) },
    { text: 'Tôi cảm thấy sợ hãi hoặc hoảng loạn mà không có lý do rõ ràng', options: epdsOptions(['Không, không hề','Không, không nhiều','Có, đôi khi','Có, khá thường xuyên']) },
    { text: 'Mọi việc trở nên quá sức đối với tôi', options: epdsOptions(['Không, tôi vẫn xoay xở tốt như bình thường','Không, hầu hết tôi vẫn xoay xở tốt','Có, đôi khi tôi không xoay xở tốt như bình thường','Có, hầu như tôi không xoay xở được']) },
    { text: 'Tôi cảm thấy bất hạnh đến mức khó ngủ', options: epdsOptions(['Không, không hề','Không thường xuyên lắm','Có, thỉnh thoảng','Có, hầu hết các đêm']) },
    { text: 'Tôi cảm thấy buồn bã hoặc khổ sở', options: epdsOptions(['Không, không hề','Không thường xuyên lắm','Có, khá thường xuyên','Có, hầu như lúc nào cũng vậy']) },
    { text: 'Tôi cảm thấy bất hạnh đến mức phát khóc', options: epdsOptions(['Không, không bao giờ','Chỉ đôi khi','Có, khá thường xuyên','Có, hầu như lúc nào cũng vậy']) },
    { text: 'Ý nghĩ tự làm hại bản thân đã xuất hiện trong đầu tôi', options: epdsOptions(['Không bao giờ','Hiếm khi','Đôi khi','Khá thường xuyên']) },
  ],
  cutoffs: [
    { max: 8,  level: 'low',      text: 'Các dấu hiệu trầm cảm sau sinh của bạn hiện ở mức thấp.' },
    { max: 12, level: 'moderate', text: 'Bạn có một số dấu hiệu đáng chú ý ở mức trung bình — hãy chú ý chăm sóc bản thân và chia sẻ với người thân nhiều hơn.' },
    { max: 30, level: 'high',     text: 'Điểm số của bạn ở mức cao (≥13 là ngưỡng tham khảo thường dùng cho cả bố và mẹ), rất nên trao đổi với bác sĩ sản khoa/nhi khoa hoặc chuyên gia tâm lý sớm.' },
  ],
};

// ── SDQ (Strengths and Difficulties Questionnaire) — dùng chung cho #8, #9 ─
const SDQ_CUTOFFS_PARENT = [
  { max: 13, level: 'low',      text: 'Tổng điểm khó khăn của con bạn hiện ở mức bình thường.' },
  { max: 16, level: 'moderate', text: 'Tổng điểm khó khăn của con bạn ở mức ranh giới — nên tiếp tục quan sát thêm.' },
  { max: 40, level: 'high',     text: 'Tổng điểm khó khăn của con bạn ở mức cao, gợi ý nên trao đổi với chuyên gia tâm lý trẻ em/thanh thiếu niên để được hỗ trợ sớm.' },
];
const SDQ_CUTOFFS_SELF = [
  { max: 15, level: 'low',      text: 'Tổng điểm khó khăn của bạn hiện ở mức bình thường.' },
  { max: 19, level: 'moderate', text: 'Tổng điểm khó khăn của bạn ở mức ranh giới — nên tiếp tục quan sát thêm.' },
  { max: 40, level: 'high',     text: 'Tổng điểm khó khăn của bạn ở mức cao, gợi ý nên trao đổi với chuyên gia tâm lý hoặc tư vấn học đường để được hỗ trợ sớm.' },
];

function sdqItems(subject) { // subject: 'Con bạn' (parent) | 'Tôi' (self)
  const S = subject;
  const s = subject === 'Tôi' ? 'Tôi' : 'Con bạn';
  return [
    { text: `${s} quan tâm đến cảm xúc của người khác`, subscale: 'prosocial' },
    { text: `${s} bồn chồn, hiếu động thái quá, không ngồi yên lâu được`, subscale: 'hyperactivity' },
    { text: `${s} thường than phiền đau đầu, đau bụng hoặc buồn nôn`, subscale: 'emotional' },
    { text: `${s} sẵn sàng chia sẻ với người khác (đồ chơi, bánh kẹo, bút...)`, subscale: 'prosocial' },
    { text: `${s} thường nổi cơn giận dữ hoặc nóng tính`, subscale: 'conduct' },
    { text: `${s} khá đơn độc, có xu hướng chơi/làm việc một mình`, subscale: 'peer' },
    { text: `${s} nhìn chung ngoan ngoãn, thường làm theo yêu cầu của người lớn`, subscale: 'conduct', reverse: true },
    { text: `${s} có nhiều lo lắng, thường tỏ ra lo sợ`, subscale: 'emotional' },
    { text: `${s} sẵn lòng giúp đỡ nếu có ai đó bị đau, buồn hoặc không khỏe`, subscale: 'prosocial' },
    { text: `${s} liên tục cựa quậy hoặc vặn vẹo`, subscale: 'hyperactivity' },
    { text: `${s} có ít nhất một người bạn thân`, subscale: 'peer', reverse: true },
    { text: `${s} hay đánh nhau với người khác hoặc bắt nạt họ`, subscale: 'conduct' },
    { text: `${s} thường không vui, chán nản hoặc hay khóc`, subscale: 'emotional' },
    { text: `${s} nhìn chung được người khác yêu thích`, subscale: 'peer', reverse: true },
    { text: `${s} dễ bị phân tâm, khó tập trung`, subscale: 'hyperactivity' },
    { text: `${s} hồi hộp hoặc bám dính người lớn trong tình huống mới, dễ mất tự tin`, subscale: 'emotional' },
    { text: `${s} tốt bụng với người nhỏ hơn mình`, subscale: 'prosocial' },
    { text: `${s} hay nói dối hoặc gian lận`, subscale: 'conduct' },
    { text: `${s} bị người khác bắt nạt, chọc ghẹo`, subscale: 'peer' },
    { text: `${s} thường tự nguyện giúp đỡ người khác`, subscale: 'prosocial' },
    { text: `${s} suy nghĩ trước khi hành động`, subscale: 'hyperactivity', reverse: true },
    { text: `${s} lấy đồ không phải của mình ở nhà, trường học hoặc nơi khác`, subscale: 'conduct' },
    { text: `${s} hòa hợp với người lớn hơn tốt hơn là với người cùng tuổi`, subscale: 'peer' },
    { text: `${s} có nhiều nỗi sợ, dễ hoảng sợ`, subscale: 'emotional' },
    { text: `${s} hoàn thành công việc đến cùng, khả năng chú ý tốt`, subscale: 'hyperactivity', reverse: true },
  ];
}

// ── 8. Kiểm tra sức khỏe tinh thần cho con — SDQ (phụ huynh đánh giá) ────
const TEST_CHILD = {
  key: 'child', name: 'Kiểm tra sức khỏe tinh thần cho con', icon: '🧒',
  shortDesc: 'Dành cho phụ huynh đánh giá sức khoẻ tinh thần của con (4–17 tuổi).',
  instrument: 'SDQ (Strengths and Difficulties Questionnaire) — bản phụ huynh',
  preface: 'Với mỗi câu, hãy chọn mức độ đúng với con bạn trong 6 tháng qua:',
  type: 'sdq', options: OPTIONS.sdq3, maxScore: 40, cutoffs: SDQ_CUTOFFS_PARENT,
  items: sdqItems('Con bạn'),
};

// ── 9. Test sức khỏe tâm thần thanh thiếu niên — SDQ (tự đánh giá) ──────
const TEST_TEEN = {
  key: 'teen', name: 'Test sức khỏe tâm thần thanh thiếu niên', icon: '🎒',
  shortDesc: 'Dành cho các bạn 11–17 tuổi tự đánh giá sức khoẻ tinh thần của mình.',
  instrument: 'SDQ (Strengths and Difficulties Questionnaire) — bản tự đánh giá',
  preface: 'Với mỗi câu, hãy chọn mức độ đúng với bạn trong 6 tháng qua:',
  type: 'sdq', options: OPTIONS.sdq3, maxScore: 40, cutoffs: SDQ_CUTOFFS_SELF,
  items: sdqItems('Tôi'),
};

// ── 10. Test PTSD — PCL-5 (PTSD Checklist for DSM-5) ────────────────────
const TEST_PTSD = {
  key: 'ptsd', name: 'Test rối loạn stress sau sang chấn (PTSD)', icon: '🌪️',
  shortDesc: 'Sàng lọc các dấu hiệu PTSD sau một sự kiện gây sang chấn tâm lý.',
  instrument: 'PCL-5 (PTSD Checklist for DSM-5)',
  preface: 'Trong 1 THÁNG qua, bạn bị làm phiền bởi những điều sau ở mức nào?',
  type: 'sum', options: OPTIONS.freq5, maxScore: 80,
  items: [
    { text: 'Những ký ức lặp đi lặp lại, gây khó chịu và không mong muốn về sự kiện đau buồn' },
    { text: 'Những giấc mơ lặp đi lặp lại, gây khó chịu về sự kiện đau buồn' },
    { text: 'Đột nhiên cảm thấy hoặc hành động như thể sự kiện đau buồn đang xảy ra lại' },
    { text: 'Cảm thấy rất khó chịu khi có điều gì đó nhắc bạn nhớ về sự kiện đau buồn' },
    { text: 'Có phản ứng cơ thể mạnh (tim đập nhanh, khó thở, đổ mồ hôi) khi có điều gì đó nhắc nhớ về sự kiện' },
    { text: 'Tránh né những ký ức, suy nghĩ hoặc cảm xúc liên quan đến sự kiện đau buồn' },
    { text: 'Tránh né những thứ gợi nhớ bên ngoài về sự kiện (người, địa điểm, cuộc trò chuyện, hoạt động, đồ vật)' },
    { text: 'Khó nhớ lại những phần quan trọng của sự kiện đau buồn' },
    { text: 'Có những niềm tin tiêu cực mạnh mẽ về bản thân, người khác hoặc thế giới' },
    { text: 'Tự đổ lỗi cho bản thân hoặc người khác về sự kiện đau buồn hoặc những gì xảy ra sau đó' },
    { text: 'Có cảm xúc tiêu cực mạnh mẽ như sợ hãi, kinh hoàng, tức giận, tội lỗi hoặc xấu hổ' },
    { text: 'Mất hứng thú với những hoạt động mà bạn từng thích' },
    { text: 'Cảm thấy xa cách hoặc tách biệt với mọi người xung quanh' },
    { text: 'Khó trải nghiệm cảm xúc tích cực (không thể cảm thấy hạnh phúc hoặc yêu thương)' },
    { text: 'Hành xử cáu kỉnh, bộc phát cơn giận hoặc hành động hung hăng' },
    { text: 'Có những hành vi liều lĩnh hoặc tự huỷ hoại bản thân' },
    { text: 'Luôn cảnh giác hoặc đề phòng' },
    { text: 'Dễ giật mình' },
    { text: 'Khó tập trung' },
    { text: 'Khó ngủ hoặc ngủ không sâu giấc' },
  ],
  cutoffs: [
    { max: 15, level: 'low',      text: 'Các dấu hiệu PTSD của bạn hiện ở mức thấp.' },
    { max: 30, level: 'moderate', text: 'Bạn có một số dấu hiệu đáng chú ý ở mức trung bình.' },
    { max: 80, level: 'high',     text: 'Điểm số của bạn ở mức cao (≥31 là ngưỡng tham khảo thường dùng), rất nên trao đổi với chuyên gia tâm lý về sang chấn để được hỗ trợ.' },
  ],
};

// ── 11. Test độ nghiện — DAST-10 (Drug Abuse Screening Test) ────────────
const TEST_ADDICTION = {
  key: 'addiction', name: 'Test độ nghiện', icon: '🚬',
  shortDesc: 'Sàng lọc mức độ sử dụng và phụ thuộc vào rượu, bia, thuốc lá, chất kích thích.',
  instrument: 'DAST-10 (Drug Abuse Screening Test)',
  preface: 'Trong 12 tháng qua:',
  type: 'sum', options: OPTIONS.yesno, maxScore: 10,
  items: [
    { text: 'Bạn đã sử dụng chất kích thích/chất gây nghiện ngoài mục đích y tế cần thiết chưa?' },
    { text: 'Bạn có lạm dụng nhiều hơn một loại chất kích thích cùng lúc không?' },
    { text: 'Bạn có thể dừng sử dụng chất kích thích bất cứ khi nào bạn muốn không?', reverse: true },
    { text: 'Bạn đã từng có những khoảng mất trí nhớ hoặc hồi tưởng ngược do sử dụng chất kích thích chưa?' },
    { text: 'Bạn có bao giờ cảm thấy tồi tệ hoặc tội lỗi về việc sử dụng chất kích thích của mình không?' },
    { text: 'Người thân, bạn bè của bạn có bao giờ than phiền về việc bạn sử dụng chất kích thích không?' },
    { text: 'Bạn có xao nhãng gia đình vì sử dụng chất kích thích không?' },
    { text: 'Bạn có từng tham gia vào các hoạt động không hợp pháp để có được chất kích thích không?' },
    { text: 'Bạn có từng gặp triệu chứng khó chịu khi ngừng sử dụng chất kích thích không?' },
    { text: 'Bạn có gặp vấn đề sức khoẻ do sử dụng chất kích thích không (mất trí nhớ, viêm gan, co giật...)?' },
  ],
  cutoffs: [
    { max: 2,  level: 'low',      text: 'Mức độ liên quan đến sử dụng chất kích thích của bạn hiện ở mức thấp.' },
    { max: 5,  level: 'moderate', text: 'Bạn có một số dấu hiệu ở mức trung bình, đáng để bạn nhìn lại thói quen của mình.' },
    { max: 10, level: 'high',     text: 'Điểm số của bạn ở mức đáng chú ý đến nghiêm trọng, rất nên trao đổi với bác sĩ hoặc chuyên gia tư vấn về vấn đề này.' },
  ],
};

const TESTS = {};
[TEST_DEPRESSION, TEST_ANXIETY, TEST_BIPOLAR, TEST_OCD, TEST_PSYCHOSIS, TEST_EATING,
 TEST_POSTPARTUM, TEST_CHILD, TEST_TEEN, TEST_PTSD, TEST_ADDICTION].forEach(t => { TESTS[t.key] = t; });

// ── Engine chấm điểm chung ───────────────────────────────────────────────
function itemMax(def, item) { return (item.options || def.options).length - 1; }

function validateAnswers(def, answers) {
  if (!Array.isArray(answers) || answers.length !== def.items.length) return false;
  return def.items.every((item, i) => {
    const v = answers[i];
    return Number.isInteger(v) && v >= 0 && v <= itemMax(def, item);
  });
}

function classifyByCutoffs(score, cutoffs) {
  return cutoffs.find(c => score <= c.max) || cutoffs[cutoffs.length - 1];
}

function scoreSum(def, answers) {
  let total = 0;
  def.items.forEach((item, i) => {
    const max = itemMax(def, item);
    total += item.reverse ? (max - answers[i]) : answers[i];
  });
  const { level, text } = classifyByCutoffs(total, def.cutoffs);
  const selfHarmAlert = def.selfHarmIndex != null && answers[def.selfHarmIndex] > 0;
  return {
    total,
    items: [{ key: def.key, name: def.name, score: total, max: def.maxScore, level, text }],
    summary: level === 'high' ? 'Kết quả tuần này đang ở mức cần chú ý.' : 'Kết quả hiện tại của bạn ở mức ổn.',
    recommendation: level === 'low' ? null : GENERIC_RECOMMENDATION,
    disclaimer: DISCLAIMER,
    selfHarmAlert,
  };
}

// EAT-26: chỉ 3 mức trả lời cực đoan nhất mới được tính điểm (0-1-2-3), giống thang gốc
function scoreEAT26(def, answers) {
  let total = 0;
  def.items.forEach((item, i) => {
    const raw = item.reverse ? (itemMax(def, item) - answers[i]) : answers[i];
    total += Math.max(0, raw - 2);
  });
  const { level, text } = classifyByCutoffs(total, def.cutoffs);
  return {
    total,
    items: [{ key: def.key, name: def.name, score: total, max: def.maxScore, level, text }],
    summary: level === 'high' ? 'Kết quả tuần này đang ở mức cần chú ý.' : 'Kết quả hiện tại của bạn ở mức ổn.',
    recommendation: level === 'low' ? null : GENERIC_RECOMMENDATION,
    disclaimer: DISCLAIMER,
    selfHarmAlert: false,
  };
}

function scoreMDQ(def, answers) {
  const part1Yes = answers.slice(0, 13).reduce((s, v) => s + v, 0);
  const part2 = answers[13];
  const part3 = answers[14];
  const positive = part1Yes >= 7 && part2 === 1 && part3 >= 2;
  const level = positive ? 'high' : 'low';
  const text = positive
    ? 'Bạn có nhiều biểu hiện trùng khớp với các giai đoạn hưng cảm/hưng cảm nhẹ, từng xảy ra cùng lúc và gây ảnh hưởng thực sự đến cuộc sống. Đây là dấu hiệu nên trao đổi với bác sĩ tâm thần để được đánh giá kỹ hơn.'
    : 'Các biểu hiện hiện tại chưa cho thấy dấu hiệu rõ ràng của rối loạn lưỡng cực theo thang sàng lọc này.';
  return {
    total: part1Yes,
    items: [{ key: def.key, name: def.name, score: part1Yes, max: 13, level, text }],
    summary: positive ? 'Kết quả sàng lọc dương tính — nên tìm hiểu thêm.' : 'Kết quả sàng lọc âm tính.',
    recommendation: positive ? GENERIC_RECOMMENDATION : null,
    disclaimer: DISCLAIMER,
    selfHarmAlert: false,
  };
}

function scoreSDQ(def, answers) {
  const sub = { emotional: 0, conduct: 0, hyperactivity: 0, peer: 0, prosocial: 0 };
  def.items.forEach((item, i) => {
    const v = item.reverse ? (2 - answers[i]) : answers[i];
    sub[item.subscale] += v;
  });
  const total = sub.emotional + sub.conduct + sub.hyperactivity + sub.peer;
  const { level, text } = classifyByCutoffs(total, def.cutoffs);
  const breakdown = `Cảm xúc: ${sub.emotional}/10 · Hành vi: ${sub.conduct}/10 · Tăng động - giảm chú ý: ${sub.hyperactivity}/10 · `
    + `Quan hệ bạn bè: ${sub.peer}/10 · Ứng xử tích cực: ${sub.prosocial}/10 (điểm này càng cao càng tốt).`;
  return {
    total,
    items: [{ key: def.key, name: 'Tổng điểm khó khăn (Total Difficulties)', score: total, max: 40, level, text: `${text} ${breakdown}` }],
    summary: level === 'high' ? 'Một vài lĩnh vực đang ở mức cần chú ý.' : 'Nhìn chung các chỉ số đang ở mức ổn.',
    recommendation: level === 'low' ? null : GENERIC_RECOMMENDATION,
    disclaimer: DISCLAIMER,
    selfHarmAlert: false,
  };
}

function scoreTest(def, answers) {
  if (def.type === 'mdq')   return scoreMDQ(def, answers);
  if (def.type === 'sdq')   return scoreSDQ(def, answers);
  if (def.type === 'eat26') return scoreEAT26(def, answers);
  return scoreSum(def, answers);
}

function serializeCatalogEntry(def) {
  return {
    key: def.key, name: def.name, icon: def.icon, shortDesc: def.shortDesc,
    instrument: def.instrument, questionCount: def.items.length,
  };
}

function serializeDetail(def) {
  return {
    key: def.key, name: def.name, icon: def.icon, shortDesc: def.shortDesc,
    instrument: def.instrument, preface: def.preface, disclaimer: DISCLAIMER,
    items: def.items.map(item => ({ text: item.text, options: item.options || def.options })),
  };
}

// ── GET /api/psych-tests — danh mục 11 bài test ─────────────────────────
router.get('/', (req, res) => {
  res.json({ tests: Object.values(TESTS).map(serializeCatalogEntry) });
});

// ── GET /api/psych-tests/:key — câu hỏi + lựa chọn trả lời ──────────────
router.get('/:key', (req, res) => {
  const def = TESTS[req.params.key];
  if (!def) return res.status(404).json({ message: 'Không tìm thấy bài test.' });
  res.json(serializeDetail(def));
});

// ── POST /api/psych-tests/:key/submit ───────────────────────────────────
router.post('/:key/submit', async (req, res) => {
  const def = TESTS[req.params.key];
  if (!def) return res.status(404).json({ message: 'Không tìm thấy bài test.' });

  const { answers } = req.body;
  if (!validateAnswers(def, answers)) {
    return res.status(400).json({ message: `Dữ liệu trả lời không hợp lệ. Cần đủ ${def.items.length} câu trả lời hợp lệ.` });
  }

  try {
    const result = scoreTest(def, answers);
    const db = await getPool();
    await db.request()
      .input('user_id',     sql.Int,      req.user.id)
      .input('test_key',    sql.NVarChar, def.key)
      .input('raw_answers', sql.NVarChar, JSON.stringify(answers))
      .input('total_score', sql.Int,      result.total)
      .input('level',       sql.NVarChar, result.items[0].level)
      .query(`
        INSERT INTO PsychTestResults (user_id, test_key, raw_answers, total_score, level)
        VALUES (@user_id, @test_key, @raw_answers, @total_score, @level)
      `);

    res.status(201).json({ message: 'Đã lưu kết quả!', result });
  } catch (err) {
    console.error('Psych test submit error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

// ── GET /api/psych-tests/:key/history ───────────────────────────────────
router.get('/:key/history', async (req, res) => {
  const def = TESTS[req.params.key];
  if (!def) return res.status(404).json({ message: 'Không tìm thấy bài test.' });

  try {
    const db = await getPool();
    const result = await db.request()
      .input('user_id',  sql.Int,      req.user.id)
      .input('test_key', sql.NVarChar, def.key)
      .query(`SELECT TOP 10 total_score, level, created_at FROM PsychTestResults
              WHERE user_id=@user_id AND test_key=@test_key ORDER BY created_at DESC`);
    res.json({ history: result.recordset });
  } catch (err) {
    console.error('Psych test history error:', err);
    res.status(500).json({ message: 'Lỗi server.' });
  }
});

module.exports = router;

// Định nghĩa test + engine chấm điểm dùng lại được ngoài HTTP (scripts/seed-test-users.js),
// để dữ liệu seed đi qua đúng thang điểm lâm sàng thay vì chép lại cutoffs.
module.exports.TESTS = TESTS;
module.exports.scoreTest = scoreTest;
module.exports.validateAnswers = validateAnswers;
