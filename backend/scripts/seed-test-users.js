// Tạo 15 tài khoản TEST, mỗi tài khoản mang một kiểu cảm xúc chủ đạo, kèm nhật ký
// và kết quả test tâm lý khớp với cảm xúc đó. Dùng để thử biểu đồ / heatmap / radar /
// AI phân tích / Test tâm lý chuyên sâu (v3.7) mà không cần chờ người dùng thật.
//
// Nhật ký được rải ngẫu nhiên trong 15 ngày gần nhất, mỗi lần chạy ra dữ liệu khác nhau.
//
// Cách dùng:
//   node scripts/seed-test-users.js            — tạo (bỏ qua tài khoản đã tồn tại)
//   node scripts/seed-test-users.js --clean    — xoá sạch toàn bộ tài khoản test_*
//   node scripts/seed-test-users.js --seed=N   — dựng lại đúng dữ liệu của lần chạy có seed N
//   node scripts/seed-test-users.js --fill     — viết tiếp nhật ký từ bài cuối cùng đến HÔM NAY
//                                                (chạy lại định kỳ để dữ liệu demo không bị cũ)
//     · --fill --days=N   ép lấp từ N ngày gần nhất thay vì chỉ từ bài cuối
//     · --fill --no-tests chỉ thêm nhật ký, không thêm kết quả test tâm lý mới
//
// Mọi tài khoản đều có username tiền tố `test_` và email `@test.local` để lọc/xoá
// gọn về sau — KHÔNG trộn lẫn với dữ liệu người dùng thật.

require('dotenv').config();
// Máy chủ dùng chung nên truy vấn đôi khi chậm; nới timeout mặc định 15s của pool.
process.env.DB_REQUEST_TIMEOUT = process.env.DB_REQUEST_TIMEOUT || '120000';
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../db');
const { encryptField } = require('../utils/diary-crypto');
const { TESTS, scoreTest } = require('../routes/psych-tests');

const USER_PREFIX  = 'test_';
const EMAIL_DOMAIN = '@test.local';
const PASSWORD     = 'Test@2026';
const DAYS_BACK    = 14;   // nhật ký chỉ nằm trong 15 ngày gần nhất (hôm nay = 0)
const ENTRIES_MIN  = 10;
const ENTRIES_MAX  = 18;   // > 15 nên sẽ có vài ngày viết 2 lần, giống người thật

// Chế độ --fill: tỉ lệ ngày bỏ trống / ngày viết 2 bài, để chuỗi ngày trông tự nhiên
const FILL_SKIP_DAY   = 0.18;
const FILL_DOUBLE_DAY = 0.15;
const FILL_TEST_FRESH = 3;  // đã có kết quả test trong N ngày gần đây thì không thêm nữa

// ── RNG có seed — seed lấy ngẫu nhiên mỗi lần chạy để dữ liệu luôn khác nhau.
// Seed được in ra cuối; truyền --seed=<số> nếu cần dựng lại y hệt một lần chạy cũ.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const int  = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// Bốc ngẫu nhiên nhưng tránh trùng ngay bài liền trước — kho nội dung mỗi cảm xúc chỉ
// có 5 câu, nếu không tránh thì hai ngày liên tiếp dễ ra y hệt nhau.
function pickAvoiding(rnd, arr, avoid) {
  if (arr.length < 2) return arr[0];
  const pool = arr.filter(x => x !== avoid);
  return pick(rnd, pool.length ? pool : arr);
}

// ── Tiện ích ngày ───────────────────────────────────────────────────────
// Ngày được biểu diễn bằng chuỗi 'YYYY-MM-DD' cho đỡ nhầm múi giờ — khớp luôn với
// CONVERT(varchar(10), created_at, 120) khi đọc ngược từ DB.
//
// Kết nối đặt useUTC:false (xem db/index.js) nên mọi Date truyền xuống DB đều dùng
// giờ địa phương — cả DATETIME2 (created_at) lẫn DATE (last_entry). Tuyệt đối không
// dùng toISOString() để lấy ngày ở đây: nó trả về ngày theo UTC nên lệch từ 0h đến 7h.
const MS_PER_DAY = 86400000;
const pad2       = n => String(n).padStart(2, '0');
const parseDay   = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const dayKey     = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDayKey  = (key, n) => dayKey(new Date(parseDay(key).getTime() + n * MS_PER_DAY));
const todayKey   = () => dayKey(new Date());

// ── 15 kiểu cảm xúc ─────────────────────────────────────────────────────
// mood: khoảng điểm tâm trạng (1–10) đặc trưng cho cảm xúc đó
// tests: bài test tâm lý sẽ seed kèm, với mức độ kỳ vọng (low/moderate/high)
const PROFILES = [
  {
    key: 'vui_ve', name: 'Vui vẻ', avatar: 'VV', mood: [8, 10],
    tags: ['vui', 'năng lượng', 'bạn bè'],
    events: [
      'Hôm nay đi cà phê với nhóm bạn cũ, cười nhiều đến mức đau cả bụng.',
      'Bài thuyết trình trôi chảy hơn mình tưởng, cả nhóm vỗ tay.',
      'Trời nắng đẹp, đạp xe vòng quanh hồ buổi chiều, thấy nhẹ cả người.',
      'Nấu được món mới và nó ngon thật, mẹ khen làm mình vui cả tối.',
      'Nghe được bài nhạc hợp gu, mở đi mở lại suốt buổi làm việc.',
    ],
    thoughts: [
      'Mình nhận ra dạo này mình cười tự nhiên hơn, không phải cố.',
      'Có vẻ khi mình chủ động rủ mọi người ra ngoài thì tâm trạng tốt hẳn.',
      'Năng lượng hôm nay nhiều, muốn giữ nhịp này lâu hơn.',
    ],
    gratitude: [
      'Biết ơn vì có nhóm bạn luôn sẵn sàng nghe mình nói linh tinh.',
      'Biết ơn một ngày trời đẹp và cơ thể khoẻ mạnh.',
      'Biết ơn vì mình vẫn còn thấy vui vì những chuyện nhỏ.',
    ],
    tests: [{ key: 'depression', level: 'low' }, { key: 'anxiety', level: 'low' }],
  },
  {
    key: 'binh_yen', name: 'Bình yên', avatar: 'BY', mood: [7, 9],
    tags: ['bình yên', 'thiền', 'nghỉ ngơi'],
    events: [
      'Sáng dậy sớm pha trà, ngồi im nhìn ra ban công chừng hai mươi phút.',
      'Tắt điện thoại cả buổi tối, đọc hết một chương sách.',
      'Đi bộ chậm về nhà thay vì bắt xe, thấy đầu óc trống trải dễ chịu.',
      'Dọn lại góc học tập, mọi thứ gọn gàng làm mình dễ thở hơn.',
      'Ngồi thiền mười phút trước khi ngủ, hôm nay không bị suy nghĩ kéo đi.',
    ],
    thoughts: [
      'Mình không cần phải làm gì nhiều mới thấy ổn, chỉ cần chậm lại.',
      'Có vẻ mình sợ khoảng lặng ít hơn trước rồi.',
      'Ngày trôi qua nhẹ nhàng, không có gì đặc biệt mà cũng chẳng cần đặc biệt.',
    ],
    gratitude: [
      'Biết ơn vì một buổi tối yên tĩnh không ai làm phiền.',
      'Biết ơn căn phòng nhỏ nhưng đủ ấm của mình.',
      'Biết ơn vì hôm nay mình cho phép bản thân nghỉ.',
    ],
    tests: [{ key: 'anxiety', level: 'low' }],
  },
  {
    key: 'biet_on', name: 'Biết ơn', avatar: 'BO', mood: [7, 9],
    tags: ['biết ơn', 'gia đình', 'ấm áp'],
    events: [
      'Mẹ gọi điện hỏi ăn cơm chưa, chỉ vậy thôi mà thấy được thương.',
      'Đồng nghiệp giúp mình xử lý phần việc tồn đọng dù không ai nhờ.',
      'Nhận được tin nhắn cảm ơn từ một người mình từng giúp hồi năm ngoái.',
      'Bạn cùng phòng để dành phần cơm cho mình vì biết mình về muộn.',
      'Hôm nay ngồi liệt kê những thứ mình đang có, danh sách dài hơn mình nghĩ.',
    ],
    thoughts: [
      'Mình hay quên mất là mình đang được nhiều người quan tâm.',
      'Khi tập trung vào cái đang có, cái thiếu tự nhiên bớt gào lên.',
      'Muốn nói lời cảm ơn nhiều hơn thay vì giữ trong lòng.',
    ],
    gratitude: [
      'Biết ơn gia đình vẫn luôn ở đó dù mình ít gọi về.',
      'Biết ơn những người tử tế mình gặp hôm nay.',
      'Biết ơn vì mình còn khả năng cảm nhận sự tử tế đó.',
    ],
    tests: [{ key: 'depression', level: 'low' }],
  },
  {
    key: 'hy_vong', name: 'Hy vọng', avatar: 'HV', mood: [6, 8],
    tags: ['hy vọng', 'mục tiêu', 'tương lai'],
    events: [
      'Nộp xong hồ sơ ứng tuyển, hồi hộp nhưng thấy mình đã dám thử.',
      'Bắt đầu học lại tiếng Anh, mới ngày đầu nhưng thấy có động lực.',
      'Lên kế hoạch ba tháng tới, viết ra giấy thấy mọi thứ bớt mơ hồ.',
      'Gặp một người đi trước chia sẻ kinh nghiệm, thấy con đường rõ hơn.',
      'Hôm nay tiến bộ một chút thôi nhưng vẫn là tiến bộ.',
    ],
    thoughts: [
      'Mọi thứ chưa ổn nhưng mình tin là sẽ ổn dần.',
      'Mình không cần biết hết đường đi, chỉ cần bước tiếp bước sau.',
      'Thất bại lần trước hình như đang dạy mình cái gì đó thật.',
    ],
    gratitude: [
      'Biết ơn vì mình vẫn còn muốn cố gắng.',
      'Biết ơn những người tin mình kể cả khi mình chưa tin mình.',
      'Biết ơn vì hôm nay có thêm một lý do để mong ngày mai.',
    ],
    tests: [{ key: 'depression', level: 'low' }],
  },
  {
    key: 'yeu_thuong', name: 'Yêu thương', avatar: 'YT', mood: [7, 9],
    tags: ['yêu thương', 'kết nối', 'người thân'],
    events: [
      'Ngồi nói chuyện với em gái đến khuya, lâu rồi mới thân được vậy.',
      'Ôm mẹ một cái trước khi đi làm, tự nhiên thấy muốn khóc.',
      'Nấu ăn cho người mình thương, thấy vui khi thấy họ ăn ngon miệng.',
      'Bạn thân kể chuyện buồn, mình chỉ ngồi nghe và thấy mình có ích.',
      'Viết một lá thư tay cho người bạn ở xa.',
    ],
    thoughts: [
      'Được thương và thương ai đó hoá ra là chỗ dựa lớn nhất.',
      'Mình muốn học cách thể hiện tình cảm rõ ràng hơn.',
      'Ở cạnh người mình quý làm mọi thứ nhẹ đi hẳn.',
    ],
    gratitude: [
      'Biết ơn vì trong đời có vài người mình có thể gọi lúc nửa đêm.',
      'Biết ơn những cái ôm không cần lý do.',
      'Biết ơn vì mình vẫn còn dám mở lòng.',
    ],
    tests: [{ key: 'depression', level: 'low' }],
  },
  {
    key: 'binh_thuong', name: 'Bình thường', avatar: 'BT', mood: [5, 6],
    tags: ['bình thường', 'thói quen'],
    events: [
      'Một ngày như mọi ngày, đi làm rồi về, không có gì đáng nhớ.',
      'Làm xong việc được giao, không xuất sắc cũng không tệ.',
      'Ăn cơm, xem một tập phim, đi ngủ. Vậy thôi.',
      'Trời hơi âm u, tâm trạng cũng hơi âm u theo, nhưng không sao cả.',
      'Hôm nay không vui không buồn, chỉ là trôi qua.',
    ],
    thoughts: [
      'Không phải ngày nào cũng cần có ý nghĩa gì đó.',
      'Mình đang ổn, chỉ là hơi nhàn nhạt.',
      'Có lẽ mình cần thêm chút gì đó mới mẻ trong tuần tới.',
    ],
    gratitude: [
      'Biết ơn vì hôm nay không có chuyện gì tệ xảy ra.',
      'Biết ơn vì mình vẫn giữ được nếp sinh hoạt đều đặn.',
      'Biết ơn một ngày bình thường.',
    ],
    tests: [{ key: 'depression', level: 'low' }, { key: 'anxiety', level: 'low' }],
  },
  {
    key: 'mo_ho', name: 'Mơ hồ', avatar: 'MH', mood: [4, 6],
    tags: ['mơ hồ', 'phân vân', 'định hướng'],
    events: [
      'Ngồi nhìn màn hình cả tiếng mà không biết mình nên làm gì trước.',
      'Được hỏi năm sau định làm gì, mình ậm ừ không trả lời được.',
      'Đang phân vân giữa hai lựa chọn, cái nào cũng có lý và cũng đáng sợ.',
      'Thấy bạn bè ai cũng có hướng đi rõ ràng, còn mình thì chưa.',
      'Đọc mấy bài định hướng nghề nghiệp, đọc xong càng rối hơn.',
    ],
    thoughts: [
      'Mình không buồn, chỉ là không biết mình đang đi đâu.',
      'Có phải mình đang trì hoãn quyết định vì sợ chọn sai?',
      'Có lẽ chưa biết cũng không sao, nhưng cảm giác này khó chịu thật.',
    ],
    gratitude: [
      'Biết ơn vì mình vẫn còn thời gian để tìm hiểu.',
      'Biết ơn người bạn chịu ngồi nghe mình kể chuyện lằng nhằng.',
      'Biết ơn vì ít nhất mình biết là mình đang mơ hồ.',
    ],
    tests: [{ key: 'anxiety', level: 'moderate' }, { key: 'depression', level: 'moderate' }],
  },
  {
    key: 'co_don', name: 'Cô đơn', avatar: 'CD', mood: [3, 5],
    tags: ['cô đơn', 'một mình'],
    events: [
      'Cả ngày không nói chuyện với ai ngoài mấy câu xã giao ở chỗ làm.',
      'Mở danh bạ lướt hết một lượt rồi tắt máy, chẳng biết gọi ai.',
      'Cuối tuần mọi người đều bận, mình ở nhà một mình cả ngày.',
      'Ngồi giữa đám đông mà vẫn thấy mình ở ngoài cuộc.',
      'Nhắn tin cho bạn cũ nhưng xoá đi không gửi.',
    ],
    thoughts: [
      'Hình như mình sợ làm phiền người khác nên tự tách mình ra.',
      'Mình muốn được ai đó hỏi thăm mà không phải mở lời trước.',
      'Ở một mình khác với cô đơn, mà dạo này mình đang ở vế sau.',
    ],
    gratitude: [
      'Biết ơn vì vẫn có chỗ để về mỗi tối.',
      'Biết ơn cuốn sách hôm nay làm bạn với mình.',
      'Biết ơn vì mình vẫn đang cố kết nối, dù chậm.',
    ],
    tests: [{ key: 'depression', level: 'moderate' }],
  },
  {
    key: 'lo_au', name: 'Lo âu', avatar: 'LA', mood: [3, 5],
    tags: ['lo âu', 'bồn chồn', 'mất ngủ'],
    events: [
      'Nằm mãi không ngủ được, đầu cứ chạy đủ thứ kịch bản tệ nhất.',
      'Trước buổi họp tim đập nhanh, tay lạnh, phải ra ngoài hít thở.',
      'Kiểm tra lại email đã gửi năm lần vì sợ viết sai câu gì đó.',
      'Người ta nhắn "gặp nói chuyện chút" là mình lo cả buổi.',
      'Đặt chuông báo thức tận sáu lần vì sợ ngủ quên.',
    ],
    thoughts: [
      'Mình biết là mình đang lo quá mức mà vẫn không dừng lại được.',
      'Chuyện chưa xảy ra mà mình đã sống trước nó cả chục lần.',
      'Cơ thể mình phản ứng trước cả khi mình kịp nghĩ.',
    ],
    gratitude: [
      'Biết ơn vì hôm nay mình vẫn đi làm được dù trong lòng rối.',
      'Biết ơn bài tập thở đã giúp mình dịu lại mười phút.',
      'Biết ơn vì chuyện mình lo rốt cuộc đã không xảy ra.',
    ],
    tests: [{ key: 'anxiety', level: 'high' }, { key: 'depression', level: 'moderate' }],
  },
  {
    key: 'cang_thang', name: 'Căng thẳng', avatar: 'CT', mood: [3, 5],
    tags: ['căng thẳng', 'deadline', 'quá tải'],
    events: [
      'Ba deadline dồn vào một tuần, làm đến mười một giờ đêm vẫn chưa xong.',
      'Bỏ bữa trưa để kịp việc, chiều đau đầu không tập trung nổi.',
      'Sếp thêm việc mới trong khi việc cũ còn nguyên đó.',
      'Vừa học vừa làm thêm, hai bên đều đòi mình phải ưu tiên.',
      'Cuối tuần vẫn mở laptop, không nhớ lần cuối nghỉ hẳn là khi nào.',
    ],
    thoughts: [
      'Mình đang chạy mà không biết đích ở đâu.',
      'Có lẽ mình cần học cách từ chối bớt.',
      'Cơ thể đang báo động rồi mà mình vẫn cố phớt lờ.',
    ],
    gratitude: [
      'Biết ơn vì hôm nay cũng xong được một việc lớn.',
      'Biết ơn ly cà phê và mười lăm phút ngồi im giữa trưa.',
      'Biết ơn vì mình vẫn chưa gục.',
    ],
    tests: [{ key: 'anxiety', level: 'high' }],
  },
  {
    key: 'buon', name: 'Buồn bã', avatar: 'BB', mood: [2, 4],
    tags: ['buồn', 'hụt hẫng'],
    events: [
      'Nghe lại bài hát cũ rồi ngồi buồn không rõ lý do.',
      'Kết quả không như mình mong, cố tỏ ra bình thản nhưng về nhà thì hụt.',
      'Trời mưa cả ngày, tâm trạng cũng trĩu theo.',
      'Nhìn ảnh cũ và nhận ra nhiều thứ đã không còn như trước.',
      'Hôm nay khóc một chút trong nhà tắm rồi lau mặt đi ra như không có gì.',
    ],
    thoughts: [
      'Buồn thì cũng không sao, mình chỉ cần để nó đi qua.',
      'Mình đang cố mạnh mẽ hơi quá mức cần thiết.',
      'Có những nỗi buồn không gọi tên được, nhưng nó có thật.',
    ],
    gratitude: [
      'Biết ơn vì mình vẫn cho phép mình được buồn.',
      'Biết ơn người bạn nhắn hỏi một câu đúng lúc.',
      'Biết ơn vì ngày mai vẫn còn đó.',
    ],
    tests: [{ key: 'depression', level: 'moderate' }],
  },
  {
    key: 'tram_cam', name: 'Trầm cảm', avatar: 'TC', mood: [1, 3],
    tags: ['trầm cảm', 'mệt mỏi', 'mất hứng thú'],
    events: [
      'Nằm trên giường đến trưa, biết là nên dậy mà cơ thể nặng như đá.',
      'Những việc trước đây mình thích giờ chẳng còn thấy gì.',
      'Bỏ hai bữa trong ngày, không thấy đói cũng không thấy muốn ăn.',
      'Không trả lời tin nhắn của ai suốt mấy hôm nay.',
      'Ngồi trước bài tập cả tiếng mà không đọc nổi một đoạn.',
    ],
    thoughts: [
      'Mình thấy mình vô dụng, dù biết nghĩ vậy là không công bằng với bản thân.',
      'Mọi thứ đều tốn sức, kể cả việc tắm rửa.',
      'Mình nghĩ mình cần đi gặp chuyên gia, chỉ là chưa đủ sức đặt lịch.',
    ],
    gratitude: [
      'Biết ơn vì hôm nay mình đã ra khỏi giường, dù muộn.',
      'Biết ơn vì mình vẫn viết được vài dòng ở đây.',
      'Biết ơn người vẫn nhắn tin cho mình dù mình không trả lời.',
    ],
    tests: [{ key: 'depression', level: 'high' }, { key: 'anxiety', level: 'moderate' }],
  },
  {
    key: 'gian_du', name: 'Giận dữ', avatar: 'GD', mood: [2, 4],
    tags: ['giận', 'bực bội', 'xung đột'],
    events: [
      'Cãi nhau với người nhà vì chuyện không đâu, xong thấy mình quá lời.',
      'Bị đổ lỗi cho việc mình không làm, ức mà không nói được câu nào.',
      'Kẹt xe bốn mươi phút, về đến nhà là gắt với tất cả mọi người.',
      'Người ta hứa rồi thất hứa lần thứ ba, mình hết kiên nhẫn thật rồi.',
      'Đấm vào gối mấy cái cho hạ hoả, xong thấy mình trẻ con.',
    ],
    thoughts: [
      'Cơn giận của mình lên nhanh quá, mình muốn học cách chậm lại vài giây.',
      'Bên dưới cơn giận hình như là cảm giác không được tôn trọng.',
      'Mình giận chuyện hôm nay hay giận cả những chuyện dồn lại từ lâu?',
    ],
    gratitude: [
      'Biết ơn vì mình đã kịp đi ra ngoài trước khi nói điều tệ hơn.',
      'Biết ơn người đã nghe mình xả mà không phán xét.',
      'Biết ơn vì sau cơn giận mình vẫn muốn làm lành.',
    ],
    tests: [{ key: 'anxiety', level: 'moderate' }],
  },
  {
    key: 'so_hai', name: 'Sợ hãi', avatar: 'SH', mood: [2, 4],
    tags: ['sợ hãi', 'ám ảnh', 'giật mình'],
    events: [
      'Đêm qua mơ lại chuyện cũ, tỉnh dậy tim đập thình thịch, mồ hôi ướt áo.',
      'Nghe tiếng động lớn ngoài đường là giật bắn cả người.',
      'Tránh đi qua con đường đó vì cứ nhớ lại chuyện năm ngoái.',
      'Có người đứng sau lưng bất ngờ, mình phản ứng mạnh quá mức.',
      'Không dám xem tin tức về vụ việc giống chuyện mình từng trải qua.',
    ],
    thoughts: [
      'Chuyện xảy ra lâu rồi mà cơ thể mình vẫn nhớ như mới hôm qua.',
      'Mình đang tránh né nhiều thứ hơn mình thừa nhận.',
      'Mình muốn thấy an toàn trở lại, dù chỉ một chút.',
    ],
    gratitude: [
      'Biết ơn vì đêm qua mình đã ngủ được ba tiếng liền.',
      'Biết ơn vì hiện tại mình đang an toàn.',
      'Biết ơn vì mình đã dám viết chuyện này ra.',
    ],
    tests: [{ key: 'ptsd', level: 'high' }, { key: 'anxiety', level: 'high' }],
  },
  {
    key: 'trong_rong', name: 'Trống rỗng', avatar: 'TR', mood: [2, 4],
    tags: ['trống rỗng', 'vô cảm'],
    events: [
      'Xem hết một bộ phim mà không cảm thấy gì, vui buồn đều không.',
      'Bạn kể chuyện vui, mình cười theo nhưng bên trong phẳng lì.',
      'Ngồi nhìn trần nhà rất lâu, không nghĩ gì cụ thể cả.',
      'Làm mọi việc như cái máy, hết ngày thì không nhớ mình đã làm gì.',
      'Người ta hỏi mình thấy sao, mình không biết trả lời thế nào.',
    ],
    thoughts: [
      'Không buồn cũng không vui, chỉ là trống.',
      'Mình muốn cảm thấy gì đó, kể cả buồn cũng được.',
      'Hình như mình đã tắt cảm xúc đi để đỡ đau, và giờ không bật lại được.',
    ],
    gratitude: [
      'Biết ơn vì mình vẫn ngồi xuống viết được mấy dòng này.',
      'Biết ơn vì mình còn nhận ra là mình đang trống rỗng.',
      'Biết ơn vì hôm nay mình vẫn ăn được một bữa tử tế.',
    ],
    tests: [{ key: 'depression', level: 'high' }],
  },
];

// ── Sinh bộ câu trả lời cho một bài test sao cho rơi đúng mức mong muốn ──
// Không hardcode cutoffs — dựng ứng viên rồi chấm bằng scoreTest() thật của app,
// nên nếu thang điểm đổi thì dữ liệu seed vẫn tự bám theo.
function answersForLevel(def, targetLevel, rnd) {
  const n     = def.items.length;
  const maxes = def.items.map(it => (it.options || def.options).length - 1);
  const vMax  = Math.max(...maxes);

  const candidates = [];
  for (let k = 0; k <= n; k++) {
    for (let v = 0; v <= vMax; v++) {
      candidates.push(def.items.map((_, i) => (i < k ? Math.min(v, maxes[i]) : 0)));
    }
  }

  let matches = candidates.filter(a => scoreTest(def, a).items[0].level === targetLevel);
  if (!matches.length) return null;

  // Ưu tiên bộ trả lời KHÔNG kích hoạt cờ tự hại — dữ liệu test không nên tạo
  // cảnh báo giả trong app. Chỉ chấp nhận bộ có cờ nếu không còn lựa chọn nào khác.
  if (def.selfHarmIndex != null) {
    const safe = matches.filter(a => a[def.selfHarmIndex] === 0);
    if (safe.length) matches = safe;
  }
  return matches[Math.floor(rnd() * matches.length)];
}

// ── Sinh nội dung MỘT bài nhật ký đúng chất cảm xúc của profile ─────────
// `day` là chuỗi 'YYYY-MM-DD'; `avoid` là sự kiện của bài liền trước, để không lặp y nguyên.
function makeEntry(profile, rnd, day, avoid) {
  const at = randomTimeOn(day, rnd);
  // Tâm trạng dao động quanh khoảng đặc trưng, thỉnh thoảng lệch ±1 cho tự nhiên
  let mood = int(rnd, profile.mood[0], profile.mood[1]);
  if (rnd() < 0.18) mood += rnd() < 0.5 ? -1 : 1;
  mood = Math.min(10, Math.max(1, mood));

  const tags = profile.tags.filter(() => rnd() < 0.6);
  return {
    mood,
    event_text: pickAvoiding(rnd, profile.events, avoid),
    thoughts:   rnd() < 0.75 ? pick(rnd, profile.thoughts)  : '',
    gratitude:  rnd() < 0.65 ? pick(rnd, profile.gratitude) : '',
    tags: (tags.length ? tags : [profile.tags[0]]).join('|'),
    day,
    created_at: at,
  };
}

// Giờ viết ngẫu nhiên (giờ địa phương) trong ngày `day`; nếu rơi vào tương lai —
// chỉ xảy ra với ngày hôm nay — thì kéo về sát thời điểm hiện tại, không lùi quá 7h sáng.
const WRITE_HOUR_MIN = 7;
const WRITE_HOUR_MAX = 23;

function randomTimeOn(day, rnd) {
  const [y, m, d] = day.split('-').map(Number);
  const at  = new Date(y, m - 1, d, int(rnd, WRITE_HOUR_MIN, WRITE_HOUR_MAX), int(rnd, 0, 59), int(rnd, 0, 59), 0);
  const now = new Date();
  if (at > now) {
    const floor = new Date(y, m - 1, d, WRITE_HOUR_MIN, 0, 0, 0);
    at.setTime(Math.max(floor.getTime(), now.getTime() - int(rnd, 1, 90) * 60000));
  }
  return at;
}

// ── Sinh nhật ký cho một profile ────────────────────────────────────────
function buildEntries(profile, rnd) {
  const total   = int(rnd, ENTRIES_MIN, ENTRIES_MAX);
  const entries = [];
  // Tối đa 2 bài/ngày — vừa có ngày bỏ trống, vừa có ngày viết hai lần.
  const perDay  = new Map();

  for (let i = 0; i < total; i++) {
    let dayAgo = int(rnd, 0, DAYS_BACK);
    let guard  = 0;
    while ((perDay.get(dayAgo) || 0) >= 2 && guard++ < 60) dayAgo = int(rnd, 0, DAYS_BACK);
    if ((perDay.get(dayAgo) || 0) >= 2) continue;  // 15 ngày đã kín, dừng thêm bài
    perDay.set(dayAgo, (perDay.get(dayAgo) || 0) + 1);

    entries.push(makeEntry(profile, rnd, addDayKey(todayKey(), -dayAgo), null));
  }
  entries.sort((a, b) => a.created_at - b.created_at);
  return entries;
}

// ── Sinh nhật ký lấp khoảng trống từ ngày `fromDay` đến hôm nay ─────────
// `busyDays` = Set các ngày (YYYY-MM-DD) đã có bài, để không viết đè lên.
// Hôm nay luôn có ít nhất 1 bài — mục đích của --fill là dữ liệu demo chạm tới hiện tại.
function buildFillEntries(profile, rnd, fromDay, busyDays) {
  const entries = [];
  const endDay  = todayKey();
  let   avoid   = null;

  for (let day = fromDay; day <= endDay; day = addDayKey(day, 1)) {
    if (busyDays.has(day)) continue;
    if (day !== endDay && rnd() < FILL_SKIP_DAY) continue;

    const count = rnd() < FILL_DOUBLE_DAY ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const entry = makeEntry(profile, rnd, day, avoid);
      avoid = entry.event_text;
      entries.push(entry);
    }
  }
  entries.sort((a, b) => a.created_at - b.created_at);
  return entries;
}

// Chuỗi ngày hiện tại (tính đến hôm nay) và chuỗi dài nhất từ trước đến nay.
// Cùng ngữ nghĩa với cách routes/diary.js cộng streak khi người dùng lưu bài thật.
function computeStreaks(dayKeys) {
  const days = [...new Set(dayKeys)].sort();
  let best = 0, run = 0, prev = null;
  for (const key of days) {
    const d = parseDay(key);
    run  = (prev && (d - prev) === MS_PER_DAY) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const current = days.length && days[days.length - 1] === todayKey() ? run : 0;
  return { current, max: best };
}

// ── Ghi DB ──────────────────────────────────────────────────────────────
async function insertEntry(db, userId, e) {
  await db.request()
    .input('user_id',    sql.Int,       userId)
    .input('mood_score', sql.TinyInt,   e.mood)
    .input('event_text', sql.NVarChar,  encryptField(e.event_text))
    .input('thoughts',   sql.NVarChar,  encryptField(e.thoughts))
    .input('gratitude',  sql.NVarChar,  encryptField(e.gratitude))
    .input('tags',       sql.NVarChar,  e.tags)
    .input('created_at', sql.DateTime2, e.created_at)
    .query(`
      INSERT INTO DiaryEntries (user_id, mood_score, event_text, thoughts, gratitude, tags, created_at, updated_at)
      VALUES (@user_id, @mood_score, @event_text, @thoughts, @gratitude, @tags, @created_at, @created_at)
    `);
}

// Chấm bằng scoreTest() thật của app rồi lưu, nên dữ liệu seed luôn khớp thang điểm hiện hành.
async function insertTestResult(db, userId, def, level, at, rnd) {
  const answers = answersForLevel(def, level, rnd);
  if (!answers) { console.warn(`  ! Không dựng được đáp án mức '${level}' cho '${def.key}'.`); return false; }

  const scored = scoreTest(def, answers);
  await db.request()
    .input('user_id',     sql.Int,       userId)
    .input('test_key',    sql.NVarChar,  def.key)
    .input('raw_answers', sql.NVarChar,  JSON.stringify(answers))
    .input('total_score', sql.Int,       scored.total)
    .input('level',       sql.NVarChar,  scored.items[0].level)
    .input('created_at',  sql.DateTime2, at)
    .query(`
      INSERT INTO PsychTestResults (user_id, test_key, raw_answers, total_score, level, created_at)
      VALUES (@user_id, @test_key, @raw_answers, @total_score, @level, @created_at)
    `);
  return true;
}

// Đồng bộ last_entry/streak/max_streak theo toàn bộ nhật ký hiện có của user
async function syncStreak(db, userId) {
  const rows = await db.request().input('uid', sql.Int, userId).query(`
    SELECT DISTINCT CONVERT(varchar(10), created_at, 120) AS d
    FROM DiaryEntries WHERE user_id=@uid
  `);
  const days = rows.recordset.map(r => r.d);
  if (!days.length) return null;

  const { current, max } = computeStreaks(days);
  const lastDay = days.slice().sort().pop();
  await db.request()
    .input('uid',        sql.Int,      userId)
    .input('last_entry', sql.Date,     parseDay(lastDay))
    .input('streak',     sql.Int,      current)
    .input('max_streak', sql.Int,      max)
    .query(`UPDATE Users SET last_entry=@last_entry, streak=@streak,
            max_streak=CASE WHEN max_streak > @max_streak THEN max_streak ELSE @max_streak END,
            updated_at=GETDATE() WHERE id=@uid`);
  return { current, max, lastDay };
}

// ── Xoá sạch tài khoản test ─────────────────────────────────────────────
async function clean(db) {
  const users = await db.request()
    .input('p', sql.NVarChar, USER_PREFIX + '%')
    .query('SELECT id, username FROM Users WHERE username LIKE @p');

  if (!users.recordset.length) {
    console.log('Không có tài khoản test nào để xoá.');
    return;
  }

  // Xoá tường minh các bảng con không có ON DELETE CASCADE (DiaryMedia treo theo
  // entry, DiaryAuditLog cố tình không cascade) trước khi xoá Users.
  const ids = users.recordset.map(u => u.id).join(',');
  await db.request().query(`DELETE FROM DiaryMedia WHERE entry_id IN (SELECT id FROM DiaryEntries WHERE user_id IN (${ids}))`);
  await db.request().query(`DELETE FROM DiaryAuditLog WHERE user_id IN (${ids})`);
  await db.request().query(`DELETE FROM PsychTestResults WHERE user_id IN (${ids})`);
  await db.request().query(`DELETE FROM DiaryEntries WHERE user_id IN (${ids})`);
  await db.request().query(`DELETE FROM Users WHERE id IN (${ids})`);

  console.log(`Đã xoá ${users.recordset.length} tài khoản test: ${users.recordset.map(u => u.username).join(', ')}`);
}

// ── Viết tiếp nhật ký cho các tài khoản test đã có, đến hết hôm nay ─────
// Chỉ thêm vào những ngày còn trống nên chạy lại nhiều lần không sinh trùng.
async function fill(db, baseSeed) {
  const daysArg   = process.argv.find(a => a.startsWith('--days='));
  const forceFrom = daysArg ? addDayKey(todayKey(), -(Number(daysArg.split('=')[1]) - 1)) : null;
  const withTests = !process.argv.includes('--no-tests');
  const report    = [];

  for (let idx = 0; idx < PROFILES.length; idx++) {
    const profile  = PROFILES[idx];
    // Seed lệch theo ngày để mỗi lần chạy --fill ra nội dung khác lần trước
    const rnd      = mulberry32((baseSeed + idx * 7919) >>> 0);
    const username = USER_PREFIX + profile.key;

    const found = await db.request()
      .input('u', sql.NVarChar, username)
      .query('SELECT id FROM Users WHERE username=@u');

    if (!found.recordset.length) {
      console.log(`- Bỏ qua ${username} (chưa có tài khoản — chạy script không kèm --fill để tạo)`);
      report.push({ username, emotion: profile.name, added: '-', tests: '-', note: 'chưa có tài khoản' });
      continue;
    }
    const userId = found.recordset[0].id;

    const existing = await db.request().input('uid', sql.Int, userId).query(`
      SELECT DISTINCT CONVERT(varchar(10), created_at, 120) AS d
      FROM DiaryEntries WHERE user_id=@uid
    `);
    const busyDays = new Set(existing.recordset.map(r => r.d));
    const lastDay  = [...busyDays].sort().pop();
    const fromDay  = forceFrom
      || (lastDay ? addDayKey(lastDay, 1) : addDayKey(todayKey(), -DAYS_BACK));

    const entries = buildFillEntries(profile, rnd, fromDay, busyDays);
    for (const e of entries) await insertEntry(db, userId, e);

    // Thêm 1 lần đo mới trong 2 ngày gần đây để lịch sử test cũng chạm tới hiện tại,
    // trừ khi user đã đo gần đây rồi (tránh làm nhiễu biểu đồ tiến triển).
    let testCount = 0;
    if (withTests) {
      for (const t of profile.tests) {
        const def = TESTS[t.key];
        if (!def) continue;

        const recent = await db.request()
          .input('uid', sql.Int, userId)
          .input('key', sql.NVarChar, def.key)
          .input('days', sql.Int, FILL_TEST_FRESH)
          .query(`SELECT TOP 1 id FROM PsychTestResults
                  WHERE user_id=@uid AND test_key=@key AND created_at >= DATEADD(day, -@days, GETDATE())`);
        if (recent.recordset.length) continue;

        const at = randomTimeOn(addDayKey(todayKey(), -int(rnd, 0, 2)), rnd);
        if (await insertTestResult(db, userId, def, t.level, at, rnd)) testCount++;
      }
    }

    const streaks = await syncStreak(db, userId);
    console.log(`✓ ${username.padEnd(18)} ${profile.name.padEnd(12)} +${String(entries.length).padStart(2)} nhật ký`
      + `, +${testCount} test, streak ${streaks?.current ?? 0}`);
    report.push({
      username, emotion: profile.name,
      added: entries.length, tests: testCount,
      note: `${lastDay || 'trống'} → ${todayKey()}`,
    });
  }

  console.log('\n── Tổng kết (--fill) ────────────────────────');
  console.table(report);
  console.log(`Tổng số nhật ký thêm mới: ${report.reduce((s, r) => s + (Number(r.added) || 0), 0)}`);
  console.log(`Seed lần này: ${baseSeed}`);
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const db = await getPool();

  if (process.argv.includes('--clean')) {
    await clean(db);
    return;
  }

  const seedArg  = process.argv.find(a => a.startsWith('--seed='));
  const baseSeed = seedArg ? Number(seedArg.split('=')[1]) : (Math.random() * 0xFFFFFFFF) >>> 0;

  if (process.argv.includes('--fill')) {
    await fill(db, baseSeed);
    return;
  }

  const hashed = await bcrypt.hash(PASSWORD, 12);
  const report = [];

  for (let idx = 0; idx < PROFILES.length; idx++) {
    const profile  = PROFILES[idx];
    const rnd      = mulberry32((baseSeed + idx * 7919) >>> 0);
    const username = USER_PREFIX + profile.key;
    const email    = username + EMAIL_DOMAIN;

    const existing = await db.request()
      .input('u', sql.NVarChar, username)
      .query('SELECT id FROM Users WHERE username=@u');

    if (existing.recordset.length) {
      console.log(`- Bỏ qua ${username} (đã tồn tại)`);
      report.push({ username, emotion: profile.name, status: 'đã có', entries: '-', tests: '-' });
      continue;
    }

    const entries = buildEntries(profile, rnd);
    const lastDay = entries[entries.length - 1].day;

    const inserted = await db.request()
      .input('username',    sql.NVarChar, username)
      .input('email',       sql.NVarChar, email)
      .input('password',    sql.NVarChar, hashed)
      .input('full_name',   sql.NVarChar, `[TEST] ${profile.name}`)
      .input('avatar_text', sql.NVarChar, profile.avatar)
      .input('last_entry',  sql.Date,     parseDay(lastDay))
      .query(`
        INSERT INTO Users (username, email, password, full_name, avatar_text, role, last_entry)
        OUTPUT INSERTED.id
        VALUES (@username, @email, @password, @full_name, @avatar_text, 'user', @last_entry)
      `);
    const userId = inserted.recordset[0].id;

    for (const e of entries) await insertEntry(db, userId, e);

    // Kết quả test tâm lý — 2 lần đo cách nhau vài tuần để history có đường tiến triển
    let testCount = 0;
    for (const t of profile.tests) {
      const def = TESTS[t.key];
      if (!def) { console.warn(`  ! Không có bài test '${t.key}', bỏ qua.`); continue; }

      // Hai lần đo trong 15 ngày để màn hình lịch sử có đường tiến triển
      for (const dayAgo of [int(rnd, 11, 14), int(rnd, 0, 3)]) {
        const at = randomTimeOn(addDayKey(todayKey(), -dayAgo), rnd);
        if (!await insertTestResult(db, userId, def, t.level, at, rnd)) break;
        testCount++;
      }
    }
    await syncStreak(db, userId);

    console.log(`✓ ${username.padEnd(18)} ${profile.name.padEnd(12)} ${entries.length} nhật ký, ${testCount} kết quả test`);
    report.push({ username, emotion: profile.name, status: 'đã tạo', entries: entries.length, tests: testCount });
  }

  console.log('\n── Tổng kết ─────────────────────────────────');
  console.table(report);
  console.log(`Mật khẩu chung cho tất cả tài khoản test: ${PASSWORD}`);
  console.log(`Nhật ký nằm trong ${DAYS_BACK + 1} ngày gần nhất. Seed lần này: ${baseSeed}`);
  console.log(`  · Dựng lại y hệt: node scripts/seed-test-users.js --seed=${baseSeed}`);
  console.log(`  · Viết tiếp:      node scripts/seed-test-users.js --fill`);
  console.log(`  · Xoá sạch:       node scripts/seed-test-users.js --clean`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('Seed thất bại:', err); process.exit(1); });
