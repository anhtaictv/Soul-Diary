// js/data.js — Dữ liệu tĩnh
const MOOD_DATA = {
  1:  { emoji:'😭', color:'#ef4444', label:'Rất tệ' },
  2:  { emoji:'😢', color:'#f97316', label:'Tệ' },
  3:  { emoji:'😔', color:'#f59e0b', label:'Không tốt' },
  4:  { emoji:'😕', color:'#eab308', label:'Hơi buồn' },
  5:  { emoji:'😐', color:'#84cc16', label:'Bình thường' },
  6:  { emoji:'🙂', color:'#22c55e', label:'Khá tốt' },
  7:  { emoji:'😊', color:'#10b981', label:'Tốt' },
  8:  { emoji:'😄', color:'#06b6d4', label:'Rất tốt' },
  9:  { emoji:'😁', color:'#6366f1', label:'Tuyệt vời' },
  10: { emoji:'🤩', color:'#8b5cf6', label:'Xuất sắc' },
};

const EMOTION_TAGS = ['😊 Vui vẻ','😔 Buồn bã','😰 Lo lắng','😤 Tức giận','😴 Mệt mỏi','😌 Bình yên','🤩 Hứng khởi','😕 Bối rối'];

// Lịch sử phiên bản — dùng để tính "phiên bản hiện tại" hiển thị ở modal Giới thiệu.
// Bản không có flags (v1.0/v1.01/v1.2) là baseline luôn active. Bản có flags chỉ được
// tính là "hiện tại" khi TẤT CẢ flag của bản đó đã được bật trong Admin > Tính năng.
const VERSION_LADDER = [
  { version:'v1.0',  title:'Ra mắt ứng dụng',                 flags:[] },
  { version:'v1.01', title:'Hoàn thiện nền tảng',              flags:[] },
  { version:'v1.2',  title:'Giữ chân & Nâng cấp trải nghiệm',  flags:[] },
  { version:'v1.3',  title:'AI Thấu hiểu cảm xúc',             flags:['ai_emotion_analysis','enhanced_mental_dashboard','cbt_guided_writing'] },
  { version:'v1.4',  title:'Check-in Tâm lý',                  flags:['weekly_checkin'] },
  { version:'v1.5',  title:'Nuôi dưỡng Tâm hồn',               flags:['mood_calendar','soul_companion','mood_ambience','soul_seed'] },
  { version:'v1.6',  title:'Lan tỏa Tâm hồn',                  flags:['mood_wrapped_card'] },
  { version:'v1.7',  title:'Thử thách & Cộng đồng',             flags:['challenge_system','diary_export','custom_reminder','community_wall'] },
  { version:'v1.8',  title:'Soul Chat & Học liệu Toàn diện',    flags:['soul_chat','sleep_tracking','study_calendar','mini_courses','year_review','personal_goals'] },
];

const ARTICLES = [
  { id:1, cat:'stress',       emoji:'🧠', bg:'#eef2ff', title:'Stress học đường: Nhận biết và vượt qua',     desc:'Phân biệt stress lành mạnh và stress độc hại. 5 chiến lược CBT được chứng minh giúp sinh viên quản lý áp lực.', time:'8 phút' },
  { id:2, cat:'sleep',        emoji:'🌙', bg:'#f0fdfa', title:'Vệ sinh giấc ngủ cho sinh viên',             desc:'Tại sao thiếu ngủ làm giảm 40% hiệu suất học tập? Quy trình 10 bước để ngủ đủ và sâu hơn.', time:'6 phút' },
  { id:3, cat:'depression',   emoji:'💙', bg:'#eff6ff', title:'Nhận biết dấu hiệu trầm cảm sớm',           desc:'Sự khác biệt giữa buồn bã bình thường và trầm cảm lâm sàng. Khi nào cần tìm kiếm sự hỗ trợ chuyên nghiệp.', time:'10 phút' },
  { id:4, cat:'relationship', emoji:'💛', bg:'#fffbeb', title:'Thiết lập ranh giới lành mạnh',             desc:'Cách nói không mà không cảm thấy tội lỗi. Kỹ năng giao tiếp quyết đoán trong môi trường đại học.', time:'7 phút' },
  { id:5, cat:'study',        emoji:'📚', bg:'#f0fdf4', title:'Kỹ thuật Pomodoro và khoa học não bộ',      desc:'Tại sao não bạn không thể tập trung liên tục 3 tiếng? Lịch học được tối ưu hóa theo nhịp sinh học.', time:'5 phút' },
  { id:6, cat:'stress',       emoji:'🎯', bg:'#fff1f2', title:'Kỹ thuật tư duy lại (Cognitive Reframing)', desc:'Thay đổi cách nhìn nhận tình huống căng thẳng. Bài tập thực hành từ liệu pháp nhận thức hành vi.', time:'9 phút' },
  { id:7, cat:'relationship', emoji:'🤝', bg:'#fdf4ff', title:'Đối phó với áp lực đồng trang lứa',        desc:'FOMO, so sánh mạng xã hội và tác động lên sức khỏe tâm lý. Xây dựng bản sắc vững chắc trong thời đại số.', time:'8 phút' },
  { id:8, cat:'sleep',        emoji:'⏰', bg:'#ecfdf5', title:'Chronotype và lịch học tối ưu',             desc:'Bạn là chim sớm hay cú đêm? Cách sắp xếp lịch học theo đồng hồ sinh học cá nhân.', time:'6 phút' },
  { id:9, cat:'depression',   emoji:'🌱', bg:'#f7fee7', title:'Hành động ngược (Behavioral Activation)',   desc:'Khi trầm cảm khiến bạn không muốn làm gì, kỹ thuật này giúp phá vỡ vòng xoáy tiêu cực từng bước nhỏ.', time:'11 phút' },
];

// ── Check-in Sức khỏe Tinh thần hàng tuần — 31 câu (PHQ-9 + GAD-7 + PSS-10 + WHO-5) ──
// Thứ tự PHẢI khớp với backend/routes/checkin.js (SCALES): phq9(0-8) → gad7(9-15) → pss10(16-25) → who5(26-30)
const CHECKIN_SCALE_INFO = {
  phq9:  { title: 'Phần 1 — Cảm xúc & năng lượng', prompt: 'Trong 2 tuần qua, bạn có thường xuyên gặp phải vấn đề sau không?', options: 'freq4' },
  gad7:  { title: 'Phần 2 — Lo âu',                prompt: 'Trong 2 tuần qua, bạn có thường xuyên gặp phải vấn đề sau không?', options: 'freq4' },
  pss10: { title: 'Phần 3 — Căng thẳng',           prompt: 'Trong tháng vừa qua, bạn có thường xuyên...',                      options: 'pss10' },
  who5:  { title: 'Phần 4 — Tinh thần tích cực',   prompt: 'Trong 2 tuần qua...',                                              options: 'who5' },
};

const CHECKIN_OPTIONS = {
  freq4: [
    { value: 0, label: 'Không ngày nào' },
    { value: 1, label: 'Vài ngày' },
    { value: 2, label: 'Hơn nửa số ngày' },
    { value: 3, label: 'Gần như mỗi ngày' },
  ],
  pss10: [
    { value: 0, label: 'Không bao giờ' },
    { value: 1, label: 'Hầu như không' },
    { value: 2, label: 'Thỉnh thoảng' },
    { value: 3, label: 'Khá thường xuyên' },
    { value: 4, label: 'Rất thường xuyên' },
  ],
  who5: [
    { value: 0, label: 'Không lúc nào' },
    { value: 1, label: 'Thỉnh thoảng' },
    { value: 2, label: 'Chưa đến nửa thời gian' },
    { value: 3, label: 'Hơn nửa thời gian' },
    { value: 4, label: 'Phần lớn thời gian' },
    { value: 5, label: 'Toàn bộ thời gian' },
  ],
};

const CHECKIN_QUESTIONS = [
  // PHQ-9 (0-8)
  { scale: 'phq9', text: 'Ít hứng thú hoặc không còn thấy vui thích khi làm việc' },
  { scale: 'phq9', text: 'Cảm thấy buồn chán, chán nản hoặc tuyệt vọng' },
  { scale: 'phq9', text: 'Khó ngủ, ngủ không ngon giấc, hoặc ngủ quá nhiều' },
  { scale: 'phq9', text: 'Cảm thấy mệt mỏi hoặc có rất ít năng lượng' },
  { scale: 'phq9', text: 'Ăn không ngon miệng hoặc ăn quá nhiều' },
  { scale: 'phq9', text: 'Cảm thấy bản thân tồi tệ, là người thất bại, hoặc làm bản thân/gia đình thất vọng' },
  { scale: 'phq9', text: 'Khó tập trung vào việc gì đó, ví dụ đọc sách hoặc xem video' },
  { scale: 'phq9', text: 'Di chuyển/nói chậm chạp đến mức người khác nhận thấy, hoặc ngược lại bồn chồn, đứng ngồi không yên hơn bình thường' },
  { scale: 'phq9', text: 'Có ý nghĩ rằng thà mình chết đi hoặc muốn tự làm tổn thương bản thân theo cách nào đó' },

  // GAD-7 (9-15)
  { scale: 'gad7', text: 'Cảm thấy lo lắng, bồn chồn hoặc căng thẳng' },
  { scale: 'gad7', text: 'Không thể ngừng hoặc kiểm soát được sự lo lắng' },
  { scale: 'gad7', text: 'Lo lắng quá nhiều về những điều khác nhau' },
  { scale: 'gad7', text: 'Khó thư giãn' },
  { scale: 'gad7', text: 'Bồn chồn đến mức khó ngồi yên' },
  { scale: 'gad7', text: 'Dễ bực bội hoặc cáu kỉnh' },
  { scale: 'gad7', text: 'Cảm thấy sợ hãi như thể điều gì đó tồi tệ sắp xảy ra' },

  // PSS-10 (16-25) — câu 4,5,7,8 (index 19,20,22,23) đảo điểm khi tính tổng
  { scale: 'pss10', text: 'Cảm thấy bị ảnh hưởng bởi những điều xảy ra ngoài ý muốn?' },
  { scale: 'pss10', text: 'Cảm thấy không thể kiểm soát những điều quan trọng trong cuộc sống của mình?' },
  { scale: 'pss10', text: 'Cảm thấy lo lắng và căng thẳng?' },
  { scale: 'pss10', text: 'Cảm thấy tự tin vào khả năng giải quyết các vấn đề cá nhân của mình?' },
  { scale: 'pss10', text: 'Cảm thấy mọi việc đang diễn ra theo đúng ý mình?' },
  { scale: 'pss10', text: 'Nhận thấy mình không thể giải quyết hết những việc cần làm?' },
  { scale: 'pss10', text: 'Có thể kiểm soát được những điều bực bội trong cuộc sống?' },
  { scale: 'pss10', text: 'Cảm thấy mình đang làm chủ được tình hình?' },
  { scale: 'pss10', text: 'Cảm thấy tức giận vì những việc nằm ngoài tầm kiểm soát của mình?' },
  { scale: 'pss10', text: 'Cảm thấy khó khăn chồng chất đến mức không thể vượt qua?' },

  // WHO-5 (26-30)
  { scale: 'who5', text: 'Tôi cảm thấy vui vẻ và thoải mái' },
  { scale: 'who5', text: 'Tôi cảm thấy bình tĩnh và thư thái' },
  { scale: 'who5', text: 'Tôi cảm thấy tích cực và tràn đầy năng lượng' },
  { scale: 'who5', text: 'Tôi thức dậy với cảm giác sảng khoái và được nghỉ ngơi đầy đủ' },
  { scale: 'who5', text: 'Cuộc sống hàng ngày của tôi tràn đầy những điều thú vị' },
];

const EXERCISES = [
  { icon:'⚖️', bg:'#f5f3ff', title:'Thử thách Bằng chứng',         duration:'10–15 phút', desc:'Gỡ rối suy nghĩ tiêu cực, tự ti bằng cách đưa nó ra "tòa án lý trí" — biến mình thành luật sư bào chữa cho chính mình thay vì để não bộ làm quan tòa bất công.', steps:['Viết ra suy nghĩ độc hại đang lặp lại trong đầu (VD: "Mình là kẻ thất bại")','Tìm bằng chứng thực tế CHỨNG MINH suy nghĩ này đúng — chỉ ghi sự thật, không ghi cảm xúc','Tìm bằng chứng thực tế PHẢN BÁC suy nghĩ này','Viết lại suy nghĩ ban đầu một cách công bằng hơn dựa trên bằng chứng phản bác'], action:'evidence_testing' },
  { icon:'✉️', bg:'#fef2f2', title:'Bức thư chưa gửi',             duration:'10–15 phút', desc:'Viết ra mọi tức giận, thất vọng dành cho một người mà bạn không thể nói thẳng — rồi "đốt" đi để giải phóng cảm xúc một cách an toàn, không làm hỏng mối quan hệ.', steps:['Viết một bức thư cho người khiến bạn tổn thương/tức giận — đừng quan tâm ngữ pháp hay sự lịch sự','Dùng từ ngữ chân thật nhất, bộc lộ toàn bộ cảm xúc hiện tại','Đừng gửi nó — mục đích là giải phóng cảm xúc cho bạn, không phải thay đổi người khác','Nhấn "Đốt thư" để tượng trưng cho việc buông bỏ cục tức ra khỏi tâm trí'], action:'unsent_letter' },
  { icon:'🔲', bg:'#e0f2fe', title:'Hộp Thở (Box Breathing)',      duration:'2 phút',     desc:'Kỹ thuật được lực lượng đặc nhiệm Navy SEAL sử dụng để giữ bình tĩnh trong môi trường áp lực cao — đưa cơ thể từ "báo động đỏ" về thư giãn chỉ trong 2 phút.', steps:['Hít vào thật sâu bằng mũi trong 4 giây','Nín thở, giữ hơi trong phổi trong 4 giây','Thở ra từ từ bằng miệng trong 4 giây','Nín thở, giữ phổi trống rỗng trong 4 giây','Lặp lại chu kỳ 4 lần'], action:'box_breath' },
  { icon:'🌬️', bg:'#eef2ff', title:'Thở 4-7-8',                    duration:'5 phút',     desc:'Kỹ thuật của Tiến sĩ Andrew Weil, kích hoạt hệ thần kinh phó giao cảm tức thì.',          steps:['Thở ra hoàn toàn qua miệng','Hít vào qua mũi trong 4 giây','Nín thở trong 7 giây','Thở ra qua miệng trong 8 giây','Lặp lại 3–4 lần'], action:'breath' },
  { icon:'🙏', bg:'#f0fdfa', title:'Nhật ký biết ơn',              duration:'5–10 phút',  desc:'Nghiên cứu Emmons & McCullough (2003): viết nhật ký biết ơn tăng hạnh phúc 25%.',          steps:['Tìm không gian yên tĩnh','Viết 3 điều bạn biết ơn hôm nay','Mô tả lý do tại sao chúng quan trọng','Hình dung nếu không có chúng','Đọc lại và cảm nhận'], action:'gratitude' },
  { icon:'💪', bg:'#fff7ed', title:'Thư giãn cơ tiến triển (PMR)',  duration:'15–20 phút', desc:'Kỹ thuật của Edmund Jacobson giúp giảm căng thẳng thể chất bằng cách co và thả từng nhóm cơ.', steps:['Nằm xuống, nhắm mắt','Co chặt bàn chân 5 giây rồi thả','Di chuyển lên bắp chân, đùi, bụng','Tiếp tục lên tay, vai, mặt','Cảm nhận sự giải phóng từng nhóm cơ'], action:'pmr' },
  { icon:'🧘', bg:'#fdf4ff', title:'Chánh niệm 5-4-3-2-1',         duration:'5 phút',     desc:'Kỹ thuật grounding giúp đưa ý thức về hiện tại, hiệu quả khi lo âu hoặc hoảng loạn.',      steps:['Nhìn 5 vật thể xung quanh','Chạm vào 4 vật thể khác nhau','Lắng nghe 3 âm thanh','Ngửi 2 mùi hương','Nếm 1 hương vị'], action:'grounding' },
  { icon:'📝', bg:'#fffbeb', title:'Viết không cấu trúc',           duration:'10–15 phút', desc:'Free writing — viết liên tục 10 phút không dừng lại, giải phóng những suy nghĩ bị chôn vùi.', steps:['Chuẩn bị giấy hoặc ứng dụng ghi chú','Đặt hẹn giờ 10 phút','Bắt đầu viết không được xóa','Không lo ngữ pháp hay ý nghĩa','Đọc lại và nhận ra pattern tâm lý'], action:'freewrite' },
  { icon:'🚶', bg:'#f0fdf4', title:'Đi bộ chánh niệm',             duration:'10–30 phút', desc:'Kết hợp vận động nhẹ với chánh niệm — nghiên cứu Harvard giảm 20% triệu chứng lo âu.',     steps:['Chọn tuyến đường quen thuộc','Tắt điện thoại hoặc để im lặng','Chú ý từng bước chân chạm đất','Quan sát xung quanh bằng con mắt mới','Hít thở sâu đều đặn theo nhịp bước'], action:'walk' },
  { icon:'🌊', bg:'#f0f9ff', title:'Quét Cơ thể (Body Scan)',      duration:'10–15 phút', desc:'Thiền định dựa trên MBSR của Jon Kabat-Zinn — đưa sự chú ý lần lượt qua từng vùng cơ thể để giải phóng căng thẳng tích lũy mà bạn không nhận ra.',    steps:['Nằm xuống hoặc ngồi thoải mái, nhắm mắt','Bắt đầu từ ngón chân — chú ý mọi cảm giác: ấm, lạnh, tê, căng','Di chuyển chậm lên bàn chân, mắt cá, bắp chân','Tiếp tục lên đầu gối, đùi, hông — thở sâu khi gặp vùng căng','Lên bụng, ngực, vai, tay, cổ, mặt — dừng 30 giây mỗi vùng'], action:'bodyscan' },
];
