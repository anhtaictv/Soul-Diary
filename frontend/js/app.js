// js/app.js — Soul Diary App Controller
const App = (() => {

  let selectedMood  = 5;
  let selectedTags  = [];
  let currentChart  = null;
  let breathTimeout = null;
  let breathCycles  = 0;
  let boxBreathTimeout = null;
  let boxBreathCycles  = 0;
  let cachedEntries = [];
  let isRecording   = false;
  let mediaRecorder = null;
  let audioChunks   = [];
  let recordInterval= null;
  let recordSeconds = 0;
  let recordedAudioData = null;   // data URI base64 của bản ghi âm hiện tại — gửi kèm khi lưu nhật ký
  const MAX_RECORD_SECONDS = 30;  // giới hạn ghi âm cảm xúc tối đa 30 giây
  let uploadedPhotos= [];
  let lastWeeklySummary = null; // { thisDays, thisAvg, diff, topTags } — dữ liệu tuần gần nhất, dùng để vẽ thẻ Mood Wrapped
  let musicTracks     = [];
  let nowPlaying      = null;   // { id, name, artist, image, audio, duration } | null — bài đang phát, theo dõi bằng id ổn định (không phải index, vì musicTracks bị nạp lại mỗi lần đổi mood)
  let currentMood     = 'chill';
  let musicAudioBound = false;
  let diaryMode = 'free';   // 'free' hoặc 'cbt' — chỉ hiệu lực khi cbt_guided_writing được bật
  let checkinAnswers = [];  // mảng 31 phần tử của bài Check-in Sức khỏe Tinh thần đang làm dở
  let calendarMonth   = new Date(); // tháng đang xem ở Bản đồ thời tiết tâm hồn (mood_calendar)
  let pendingMusicMood = null;      // mood chờ tự phát khi chuyển sang trang Nhạc (mood_ambience)

  // ── Navigation ──────────────────────────────────────────────────────
  function nav(page) {
    // Lưu ý: KHÔNG dừng nhạc ở đây — thẻ <audio id="music-audio"> nằm ngoài #main-content
    // (xem index.html) nên nó không bị huỷ khi đổi trang, nhạc tiếp tục phát xuyên suốt SPA.
    document.getElementById('main-content').innerHTML = PAGES[page]();
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    switch (page) {
      case 'dashboard': initDashboard();              break;
      case 'diary':     initDiaryPage();              break;
      case 'chart':
        calendarMonth = new Date();
        setTimeout(() => {
          renderStreakCalendar('chart-streak-calendar');
          renderChart(14);
          const toggle = document.getElementById('chart-view-toggle');
          if (toggle) toggle.style.display = (window.FEATURES && window.FEATURES.mood_calendar) ? '' : 'none';
        }, 80);
        break;
      case 'library':   initLibrary(); break;
      case 'exercises': renderExercises();            break;
      case 'music':     initMusicPage();              break;
      case 'checkin':   initCheckinPage();            break;
      case 'inbox':     initInboxPage();               break;
      case 'sos':       renderSOSContacts();          break;
      case 'admin':     Admin.initPage();             break;
    }
  }

  // ── Mood icon scale builder ──────────────────────────────────────────
  function buildMoodScale(containerId, onSelect, defaultVal = 5) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
      const btn = document.createElement('button');
      btn.className = 'mood-icon-btn' + (i === defaultVal ? ' selected' : '');
      if (i === defaultVal) btn.style.background = MOOD_DATA[i].color + '22';
      btn.style.borderColor = i === defaultVal ? MOOD_DATA[i].color : '';
      btn.innerHTML = `<span class="mib-emoji">${MOOD_DATA[i].emoji}</span><span class="mib-num">${i}</span>`;
      btn.title = MOOD_DATA[i].label;
      btn.addEventListener('click', () => {
        c.querySelectorAll('.mood-icon-btn').forEach(b => { b.classList.remove('selected'); b.style.background=''; b.style.borderColor=''; });
        btn.classList.add('selected');
        btn.style.background = MOOD_DATA[i].color + '22';
        btn.style.borderColor = MOOD_DATA[i].color;
        onSelect(i);
      });
      c.appendChild(btn);
    }
  }

  // ── Streak calendar ──────────────────────────────────────────────────
  function renderStreakCalendar(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const user = Auth.getUser();
    const streak = user ? (user.streak || 0) : 0;
    const today  = new Date();
    const days   = ['CN','T2','T3','T4','T5','T6','T7'];
    // Build last 7 days
    let cells = '';
    const entryDates = new Set(cachedEntries.map(e => new Date(e.created_at).toDateString()));
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const isToday  = i === 0;
      const hasDiary = entryDates.has(d.toDateString());
      const dayName  = days[d.getDay()];
      cells += `<div class="streak-day ${hasDiary ? 'done' : ''} ${isToday ? 'today' : ''}">
        <div class="streak-day-name">${dayName}</div>
        <div class="streak-day-circle">${hasDiary ? '🔥' : (isToday ? '📝' : '')}</div>
        <div class="streak-day-num">${d.getDate()}</div>
      </div>`;
    }
    const freeze = user ? (user.streak_freeze || 0) : 0;
    el.innerHTML = `
      <div class="streak-cal-header">
        <span class="streak-cal-title">🔥 Chuỗi ngày của bạn</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="streak-cal-count">${streak} ngày liên tiếp</span>
          ${freeze > 0 ? `<span class="freeze-chip" title="${freeze} lượt cứu streak còn lại">🛡️ ×${freeze}</span>` : ''}
        </div>
      </div>
      <div class="streak-days-row">${cells}</div>
    `;
  }

  // ── Dashboard ────────────────────────────────────────────────────────
  async function initDashboard() {
    buildMoodScale('quick-mood-scale', v => { selectedMood = v; });
    try {
      const [entriesRes, userRes, statsRes] = await Promise.all([API.getDiary(1,20), API.getMe(), API.getStats(14)]);
      cachedEntries = entriesRes.entries || [];
      const user = userRes.user;
      Auth.updateSidebarUser(user);
      localStorage.setItem('nhk_user', JSON.stringify(user));

      const recent7 = cachedEntries.slice(0,7);
      const avg = recent7.length ? (recent7.reduce((a,e)=>a+e.mood_score,0)/recent7.length).toFixed(1) : '—';
      const today = new Date().toDateString();
      const todayEntry = cachedEntries.find(e => new Date(e.created_at).toDateString() === today);

      const totalEntries = entriesRes.pagination.total;
      document.getElementById('dash-entries').textContent = totalEntries;
      document.getElementById('dash-avg').textContent     = avg;
      document.getElementById('dash-streak').textContent  = user.streak || 0;
      document.getElementById('dash-today').textContent   = todayEntry ? `${todayEntry.mood_score}/10` : '—';

      renderStreakCalendar('streak-calendar-card');
      renderLevelBar(totalEntries);
      if (window.FEATURES && window.FEATURES.soul_seed) renderSoulSeed(user);
      renderRecommendations(todayEntry ? todayEntry.mood_score : null);
      initPushOptIn();
      renderWeeklyRecap(statsRes.stats || []);
      loadAndRenderSmartRecap();
      renderBadges(user, totalEntries, cachedEntries);
      loadAndRenderMentalHealth();
      renderRecentEntries('dash-recent-entries', cachedEntries.slice(0,3));
      if (!todayEntry && (user.streak || 0) >= 3)
        setTimeout(() => showToast(`⚠️ Chuỗi ${user.streak} ngày sắp hết! Đừng quên ghi nhật ký hôm nay.`), 1500);
    } catch(err) { showToast('⚠️ Không thể tải dữ liệu: ' + err.message); }
  }

  function renderRecommendations(mood) {
    const recs = getRecommendations(mood);
    const el = document.getElementById('recommendations');
    if (!el) return;
    el.innerHTML = recs.map(r => `
      <div class="rec-strip" onclick="App.nav('${r.nav}')">
        <div class="rec-emoji">${r.emoji}</div>
        <div class="rec-text"><div class="rec-title">${r.title}</div><div class="rec-sub">${r.sub}</div></div>
        <div style="color:var(--teal);font-size:16px">→</div>
      </div>`).join('');
  }

  function getRecommendations(mood) {
    if (!mood) return [
      {emoji:'💛',title:'Chấm điểm tâm trạng hôm nay',sub:'Mất chưa đến 30 giây',nav:'diary'},
      {emoji:'📚',title:'Đọc bài về quản lý stress',sub:'Thư viện kiến thức',nav:'library'},
      {emoji:'🌬️',title:'Thử bài tập thở 4-7-8',sub:'Giảm lo âu tức thì',nav:'exercises'},
    ];
    if (mood <= 3) return [
      {emoji:'📞',title:'Liên hệ đường dây hỗ trợ',sub:'Luôn có người lắng nghe bạn',nav:'sos'},
      {emoji:'🌬️',title:'Thử bài tập thở 4-7-8',sub:'Giảm căng thẳng ngay lập tức',nav:'exercises'},
      {emoji:'💙',title:'Đọc về nhận biết trầm cảm',sub:'Hiểu để vượt qua',nav:'library'},
    ];
    if (mood <= 6) return [
      {emoji:'🧘',title:'Chánh niệm 5-4-3-2-1',sub:'Đưa ý thức về hiện tại',nav:'exercises'},
      {emoji:'🧠',title:'Bài viết về quản lý stress',sub:'Chiến lược được chứng minh',nav:'library'},
      {emoji:'📖',title:'Viết nhật ký chi tiết hôm nay',sub:'Giải phóng cảm xúc qua ngôn từ',nav:'diary'},
    ];
    return [
      {emoji:'🙏',title:'Thực hành nhật ký biết ơn',sub:'Duy trì năng lượng tích cực',nav:'exercises'},
      {emoji:'😊',title:'Ghi lại khoảnh khắc đẹp',sub:'Nhật ký cảm xúc',nav:'diary'},
      {emoji:'📊',title:'Xem biểu đồ tâm trạng',sub:'Theo dõi xu hướng cảm xúc',nav:'chart'},
    ];
  }

  function renderRecentEntries(containerId, entries) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!entries.length) { el.innerHTML='<div style="text-align:center;color:var(--text-hint);font-size:13px;padding:20px 0">Chưa có nhật ký nào ✨</div>'; return; }
    el.innerHTML = entries.map(e => entryHTML(e)).join('');
  }

  function entryHTML(e, withDelete=false) {
    const tags = Array.isArray(e.tags) ? e.tags : (e.tags ? e.tags.split('|') : []);
    const hasCbt = !!e.cbt_data;
    const photos = Array.isArray(e.photos) ? e.photos : [];
    let cbtPreview = '';
    if (hasCbt) {
      try {
        const cbt = typeof e.cbt_data === 'string' ? JSON.parse(e.cbt_data) : e.cbt_data;
        if (cbt.event) cbtPreview = cbt.event;
      } catch {}
    }
    return `<div class="entry-item" onclick="App.openEntry(${e.id})">
      <div class="entry-meta">
        <div class="mood-dot" style="background:${MOOD_DATA[e.mood_score].color}">${MOOD_DATA[e.mood_score].emoji}</div>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${MOOD_DATA[e.mood_score].label}${hasCbt ? ' <span class="cbt-entry-badge">🧠 CBT</span>' : ''}</div>
          <div class="entry-date">${formatDate(e.created_at)}</div>
        </div>
        ${withDelete ? `<button onclick="event.stopPropagation();App.deleteEntry(${e.id},this)" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-hint);padding:4px">🗑</button>` : ''}
      </div>
      ${(cbtPreview || e.event_text) ? `<div class="entry-preview">${cbtPreview || e.event_text}</div>` : ''}
      ${tags.length ? `<div class="entry-tags">${tags.map(t=>`<span class="entry-tag">${t}</span>`).join('')}</div>` : ''}
      ${photos.length ? `<div class="entry-card-photos">${photos.slice(0,3).map((p,i)=>`<img src="${p}" class="entry-card-photo" />`).join('')}${photos.length>3?`<div class="entry-card-photo-more">+${photos.length-3}</div>`:''}</div>` : ''}
      ${e.audio_data ? `<audio controls src="${e.audio_data}" style="width:100%;margin-top:8px;height:32px" onclick="event.stopPropagation()"></audio>` : ''}
    </div>`;
  }

  // ── Xem chi tiết nhật ký đã lưu ──────────────────────────────────────
  function openEntry(id) {
    const e = cachedEntries.find(x => x.id === id);
    if (!e) return;
    const tags   = Array.isArray(e.tags) ? e.tags : (e.tags ? e.tags.split('|') : []);
    const photos = Array.isArray(e.photos) ? e.photos : [];
    let cbt = null;
    if (e.cbt_data) {
      try { cbt = typeof e.cbt_data === 'string' ? JSON.parse(e.cbt_data) : e.cbt_data; } catch {}
    }

    let bodyHtml = '';
    if (cbt) {
      bodyHtml += `<div class="cbt-entry-badge" style="margin-bottom:10px">🧠 Viết theo hướng dẫn CBT</div>`;
      const fields = [
        ['Sự kiện', cbt.event], ['Suy nghĩ', cbt.thoughts],
        ['Cảm xúc', cbt.feelings], ['Hành vi', cbt.behavior],
      ];
      fields.forEach(([label, val]) => {
        if (val) bodyHtml += `<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">${label}</div><div style="white-space:pre-wrap">${escapeHtml(val)}</div></div>`;
      });
    } else if (e.event_text) {
      bodyHtml += `<div style="white-space:pre-wrap;margin-bottom:12px">${escapeHtml(e.event_text)}</div>`;
    }
    if (e.gratitude) {
      bodyHtml += `<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">🙏 Biết ơn</div><div style="white-space:pre-wrap">${escapeHtml(e.gratitude)}</div></div>`;
    }
    if (e.ai_companion_message) {
      bodyHtml += `<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">💬 Lời nhắn từ AI</div><div style="white-space:pre-wrap;font-style:italic">${escapeHtml(e.ai_companion_message)}</div></div>`;
    }
    if (tags.length) {
      bodyHtml += `<div class="entry-tags" style="margin-bottom:12px">${tags.map(t=>`<span class="entry-tag">${escapeHtml(t)}</span>`).join('')}</div>`;
    }
    if (e.audio_data) {
      bodyHtml += `<audio controls src="${e.audio_data}" style="width:100%;margin-bottom:12px;height:36px"></audio>`;
    }
    if (photos.length) {
      bodyHtml += `<div class="entry-photo-gallery">${photos.map(p=>`<img src="${p}" class="entry-gallery-photo" onclick="App.openLightbox(this.src)" />`).join('')}</div>`;
    }
    if (!bodyHtml) bodyHtml = '<div style="color:var(--text-hint)">Không có nội dung.</div>';

    document.getElementById('entry-modal-title').innerHTML = `${MOOD_DATA[e.mood_score].emoji} ${MOOD_DATA[e.mood_score].label}`;
    document.getElementById('entry-modal-date').textContent = formatDate(e.created_at);
    document.getElementById('entry-modal-body').innerHTML = bodyHtml;
    document.getElementById('entry-modal').classList.add('open');
  }

  function closeEntryModal(e) {
    if (!e || e.target===document.getElementById('entry-modal'))
      document.getElementById('entry-modal').classList.remove('open');
  }

  function openLightbox(src) {
    document.getElementById('photo-lightbox-img').src = src;
    document.getElementById('photo-lightbox').classList.add('open');
  }

  function closeLightbox(e) {
    if (!e || e.target===document.getElementById('photo-lightbox'))
      document.getElementById('photo-lightbox').classList.remove('open');
  }

  function openAboutModal()  {
    const el = document.getElementById('about-version');
    if (el && window.CURRENT_VERSION) el.textContent = `${window.CURRENT_VERSION.version} — ${window.CURRENT_VERSION.title}`;
    document.getElementById('about-modal').classList.add('open');
  }
  function closeAboutModal() { document.getElementById('about-modal').classList.remove('open'); }

  // ── Diary ────────────────────────────────────────────────────────────

  // Gắn thang điểm mood của trang Nhật ký — tách riêng vì cần gọi lại y hệt từ resetDiaryForm()
  // sau khi lưu, để gradient/gợi ý nhạc theo cảm xúc (mood_ambience) không bị mất hook khi reset form.
  function bindDiaryMoodScale(defaultVal) {
    buildMoodScale('diary-mood-scale', v => {
      selectedMood = v;
      if (window.FEATURES && window.FEATURES.mood_ambience) { applyMoodAmbience(v); renderAmbienceSuggestion(v); }
    }, defaultVal);
    if (window.FEATURES && window.FEATURES.mood_ambience) { applyMoodAmbience(defaultVal); renderAmbienceSuggestion(defaultVal); }
  }

  async function initDiaryPage() {
    selectedTags = []; uploadedPhotos = []; diaryMode = 'free';
    bindDiaryMoodScale(selectedMood);
    document.getElementById('emotion-tags').innerHTML = EMOTION_TAGS.map(tag =>
      `<span class="tag" data-tag="${tag}" onclick="App.toggleTag(this)">${tag}</span>`).join('');
    const textarea = document.getElementById('diary-event');
    if (textarea) textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 380) + 'px';
    });
    // Hiện nút chọn chế độ nếu tính năng CBT đã được bật
    if (window.FEATURES && window.FEATURES.cbt_guided_writing) {
      const toggle = document.getElementById('diary-mode-toggle');
      if (toggle) toggle.style.display = '';
    }
    // Gợi ý chủ đề viết hôm nay (Trợ lý Tâm hồn AI)
    if (window.FEATURES && window.FEATURES.soul_companion) {
      const promptCard = document.getElementById('daily-prompt-card');
      if (promptCard) { promptCard.style.display = ''; loadDailyPrompt(); }
    }
    document.getElementById('companion-message-box').style.display = 'none';
    await loadDiaryEntries();
  }

  function setDiaryMode(mode, btn) {
    diaryMode = mode;
    document.querySelectorAll('#diary-mode-toggle .tag').forEach(b => b.classList.remove('sel'));
    if (btn) btn.classList.add('sel');
    const freeSection = document.getElementById('diary-free-section');
    const cbtForm     = document.getElementById('cbt-form');
    if (mode === 'cbt') {
      if (freeSection) freeSection.style.display = 'none';
      if (cbtForm) {
        cbtForm.style.display = 'block';
        ['cbt-event','cbt-thoughts','cbt-feelings','cbt-behavior'].forEach(id => {
          const ta = document.getElementById(id);
          if (ta && !ta.dataset.resizeBound) {
            ta.dataset.resizeBound = '1';
            ta.addEventListener('input', function() {
              this.style.height = 'auto';
              this.style.height = Math.min(this.scrollHeight, 380) + 'px';
            });
          }
        });
      }
    } else {
      if (freeSection) freeSection.style.display = '';
      if (cbtForm)     cbtForm.style.display     = 'none';
    }
  }

  // ── Trợ lý Tâm hồn AI — gợi ý chủ đề viết hôm nay ───────────────────
  async function loadDailyPrompt(refresh = false) {
    const el = document.getElementById('daily-prompt-text');
    if (!el) return;
    try {
      const res = await API.getDailyPrompt(refresh);
      el.textContent = res.prompt || '—';
    } catch (err) { /* giữ nguyên gợi ý cũ nếu lỗi tải */ }
  }
  function refreshDailyPrompt() { loadDailyPrompt(true); }

  function showCompanionMessage(msg) {
    const box = document.getElementById('companion-message-box');
    if (!box) return;
    box.innerHTML = `<div class="companion-msg-label">💬 Lời nhắn từ AI</div><div class="companion-msg-text">${escapeHtml(msg)}</div>`;
    box.style.display = '';
  }

  // ── Không gian theo cảm xúc — gradient nền + gợi ý nhạc theo mood đang chọn ──
  function ambienceMoodCategory(score) {
    if (score <= 3) return 'sleep';
    if (score <= 6) return 'chill';
    if (score <= 8) return 'focus';
    return 'nature';
  }
  function applyMoodAmbience(score) {
    const card = document.getElementById('diary-form-card');
    if (!card) return;
    card.style.transition = 'background .6s ease';
    card.style.background = `linear-gradient(135deg, ${MOOD_DATA[score].color}14, var(--bg) 60%)`;
  }
  function renderAmbienceSuggestion(score) {
    const box = document.getElementById('ambience-music-suggest');
    if (!box) return;
    const moodCat = ambienceMoodCategory(score);
    const labels  = { chill:'🌿 Thư giãn', focus:'📖 Tập trung học bài', sleep:'🌙 Dễ ngủ', nature:'🍃 Thiên nhiên' };
    box.style.display = '';
    box.innerHTML = `<button class="tag ambience-suggest-btn" onclick="App.suggestAmbienceMusic('${moodCat}')">🎵 Nghe nhạc ${labels[moodCat]} phù hợp tâm trạng này</button>`;
  }
  function suggestAmbienceMusic(moodCat) {
    pendingMusicMood = moodCat;
    nav('music');
  }

  async function loadDiaryEntries() {
    const el = document.getElementById('diary-entries-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-text">Đang tải...</div>';
    try {
      const res = await API.getDiary(1, 15);
      cachedEntries = res.entries || [];
      if (!cachedEntries.length) {
        el.innerHTML='<div style="text-align:center;color:var(--text-hint);font-size:13px;padding:40px 0">Chưa có nhật ký nào. Hãy viết nhật ký đầu tiên! 🌱</div>';
        return;
      }
      el.innerHTML = cachedEntries.map(e => entryHTML(e, true)).join('');
    } catch(err) { el.innerHTML=`<div class="loading-text" style="color:var(--rose)">Lỗi: ${err.message}</div>`; }
  }

  function toggleTag(el) {
    const tag = el.dataset.tag;
    el.classList.toggle('sel');
    if (el.classList.contains('sel')) { if (!selectedTags.includes(tag)) selectedTags.push(tag); }
    else selectedTags = selectedTags.filter(t=>t!==tag);
  }

  // Photo upload — tối đa MAX_PHOTOS ảnh, mỗi ảnh tối đa 2MB (giới hạn khớp với backend)
  const MAX_PHOTOS = 4;
  const MAX_PHOTO_FILE_SIZE = 2 * 1024 * 1024;
  const PHOTO_MAX_DIM      = 1280; // resize cạnh dài nhất xuống tối đa 1280px trước khi gửi lên server
  const PHOTO_JPEG_QUALITY = 0.72; // nén JPEG — giảm phần lớn dung lượng so với ảnh gốc từ camera điện thoại

  // Resize + nén ảnh qua canvas trước khi lưu — giảm tải dung lượng DB (server lưu nguyên bản gửi lên)
  function compressImage(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > PHOTO_MAX_DIM || height > PHOTO_MAX_DIM) {
          if (width > height) { height = Math.round(height * PHOTO_MAX_DIM / width); width = PHOTO_MAX_DIM; }
          else { width = Math.round(width * PHOTO_MAX_DIM / height); height = PHOTO_MAX_DIM; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function handlePhotoUpload(event) {
    const files = Array.from(event.target.files);
    const row = document.getElementById('photo-preview-row');
    files.forEach(async file => {
      if (!file.type.startsWith('image/')) return;
      if (uploadedPhotos.filter(Boolean).length >= MAX_PHOTOS) {
        showToast(`⚠️ Chỉ được đính kèm tối đa ${MAX_PHOTOS} ảnh.`);
        return;
      }
      if (file.size > MAX_PHOTO_FILE_SIZE) {
        showToast(`⚠️ Ảnh "${file.name}" quá lớn (tối đa 2MB).`);
        return;
      }
      const compressed = await compressImage(file);
      if (!compressed) { showToast(`⚠️ Không thể xử lý ảnh "${file.name}".`); return; }
      uploadedPhotos.push(compressed);
      const idx = uploadedPhotos.length - 1;
      const img = document.createElement('div');
      img.className = 'photo-thumb';
      img.innerHTML = `<img src="${compressed}" /><button onclick="App.removePhoto(this,${idx})">✕</button>`;
      row.appendChild(img);
      document.getElementById('photo-upload-area').querySelector('.photo-upload-text').textContent = `${uploadedPhotos.filter(Boolean).length} ảnh đã chọn`;
    });
    event.target.value = '';
  }

  function removePhoto(btn, idx) {
    uploadedPhotos[idx] = null;
    btn.parentElement.remove();
  }

  // Audio recording — giới hạn tối đa MAX_RECORD_SECONDS giây, lưu thành base64 để gửi kèm nhật ký
  async function toggleRecording() {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = []; recordSeconds = 0; recordedAudioData = null;
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          const blob = new Blob(audioChunks, {type: mimeType});
          const url  = URL.createObjectURL(blob);
          const audio = document.getElementById('audio-playback');
          audio.src = url; audio.style.display = 'block';
          stream.getTracks().forEach(t=>t.stop());
          // Chuyển sang base64 để gửi kèm lên server khi bấm "Lưu nhật ký"
          const reader = new FileReader();
          reader.onload = () => { recordedAudioData = reader.result; };
          reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        isRecording = true;
        document.getElementById('record-btn').classList.add('recording');
        document.getElementById('record-label').textContent = 'Đang ghi... Nhấn để dừng';
        document.getElementById('record-timer').style.display = 'flex';
        recordInterval = setInterval(() => {
          recordSeconds++;
          const m = Math.floor(recordSeconds/60), s = recordSeconds%60;
          document.getElementById('record-time').textContent = `${m}:${s.toString().padStart(2,'0')}`;
          if (recordSeconds >= MAX_RECORD_SECONDS) {
            showToast(`⏱ Đã đạt giới hạn ${MAX_RECORD_SECONDS} giây — tự động dừng ghi âm.`);
            stopRecording();
          }
        }, 1000);
      } catch(e) {
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.name === 'NotFoundError') {
          const recEl = document.getElementById('audio-recorder');
          if (recEl) {
            const box = document.createElement('div');
            box.className = 'mic-perm-box';
            const icon = document.createElement('div');
            icon.style.fontSize = '32px';
            icon.textContent = '🎙️';
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:13px;color:var(--text-muted);line-height:1.6';
            const title = document.createElement('strong');
            title.style.cssText = 'display:block;margin-bottom:4px;font-size:14px;color:var(--text)';
            title.textContent = 'Cần quyền truy cập microphone';
            msg.appendChild(title);
            const hint = document.createTextNode('Nhấn biểu tượng 🔒 trên thanh địa chỉ → chọn Microphone → Cho phép, sau đó tải lại trang.');
            msg.appendChild(hint);
            const btn = document.createElement('button');
            btn.className = 'btn-outline';
            btn.style.cssText = 'width:auto;font-size:12px;padding:6px 16px';
            btn.textContent = '🔄 Tải lại trang';
            btn.onclick = () => location.reload();
            box.appendChild(icon);
            box.appendChild(msg);
            box.appendChild(btn);
            recEl.replaceChildren(box);
          }
        } else {
          showToast('⚠️ Không thể truy cập microphone');
        }
      }
    } else {
      stopRecording();
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordInterval);
    document.getElementById('record-btn').classList.remove('recording');
    document.getElementById('record-label').textContent = 'Ghi âm xong ✅';
    document.getElementById('record-timer').style.display = 'none';
  }

  // Đưa form nhật ký về trạng thái trống — tạo hiệu ứng "đã lưu" rõ ràng sau khi bấm Lưu
  function resetDiaryForm() {
    const eventEl = document.getElementById('diary-event');
    if (eventEl) eventEl.value = '';
    ['cbt-event','cbt-thoughts','cbt-feelings','cbt-behavior'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.style.height = 'auto'; }
    });
    selectedTags = []; uploadedPhotos = [];
    document.querySelectorAll('#emotion-tags .tag').forEach(t=>t.classList.remove('sel'));

    const photoRow = document.getElementById('photo-preview-row');
    if (photoRow) photoRow.innerHTML = '';
    const photoText = document.querySelector('#photo-upload-area .photo-upload-text');
    if (photoText) photoText.textContent = 'Nhấn để thêm ảnh';

    if (isRecording) stopRecording();
    mediaRecorder = null; audioChunks = []; recordSeconds = 0; recordedAudioData = null;
    const recordLabel = document.getElementById('record-label');
    if (recordLabel) recordLabel.textContent = 'Nhấn để ghi âm';
    const recordTimer = document.getElementById('record-timer');
    if (recordTimer) recordTimer.style.display = 'none';
    const recordTime = document.getElementById('record-time');
    if (recordTime) recordTime.textContent = '0:00';
    const audioPlayback = document.getElementById('audio-playback');
    if (audioPlayback) { audioPlayback.pause(); audioPlayback.src = ''; audioPlayback.style.display = 'none'; }
    document.getElementById('record-btn')?.classList.remove('recording');

    selectedMood = 5;
    bindDiaryMoodScale(selectedMood);
    const companionBox = document.getElementById('companion-message-box');
    if (companionBox) companionBox.style.display = 'none';
  }

  async function saveDiaryEntry() {
    let event_text = '', cbt_data = null;

    if (diaryMode === 'cbt') {
      const cbtEvent    = document.getElementById('cbt-event')?.value.trim()    || '';
      const cbtThoughts = document.getElementById('cbt-thoughts')?.value.trim() || '';
      const cbtFeelings = document.getElementById('cbt-feelings')?.value.trim() || '';
      const cbtBehavior = document.getElementById('cbt-behavior')?.value.trim() || '';
      if (!cbtEvent && !cbtThoughts) {
        showToast('⚠️ Hãy điền ít nhất "Sự kiện" hoặc "Suy nghĩ"!');
        return;
      }
      cbt_data   = { event: cbtEvent, thoughts: cbtThoughts, feelings: cbtFeelings, behavior: cbtBehavior };
      event_text = cbtEvent || cbtThoughts;
    } else {
      event_text = document.getElementById('diary-event')?.value.trim() || '';
      if (!event_text) { showToast('⚠️ Hãy viết ít nhất một dòng nhật ký!'); return; }
    }

    const btn = document.getElementById('btn-save-diary');
    btn.disabled=true; btn.textContent='Đang lưu...';
    try {
      const res = await API.createEntry({
        mood_score: selectedMood,
        event_text,
        thoughts:   '',
        gratitude:  '',
        tags:       selectedTags,
        audio_data: recordedAudioData,
        cbt_data,
        photos:     uploadedPhotos.filter(Boolean),
      });
      resetDiaryForm();
      const user = Auth.getUser();
      if (user) {
        user.streak = res.streak;
        if (res.streak_freeze !== undefined) user.streak_freeze = res.streak_freeze;
        localStorage.setItem('nhk_user', JSON.stringify(user));
        Auth.updateSidebarUser(user);
      }
      if (res.freeze_used) showToast(`🛡️ Đã dùng 1 lượt cứu streak! Chuỗi ${res.streak} ngày được bảo vệ 🔥`);
      if ([3,7,14,21,30,50,100].includes(res.streak)) {
        setTimeout(() => showStreakCelebration(res.streak, res.freeze_granted || 0), res.freeze_used ? 1800 : 0);
      } else if (!res.freeze_used && res.freeze_granted > 0) {
        showToast(`🎁 Đạt mốc ${res.streak} ngày! +${res.freeze_granted} lượt cứu streak`);
      }
      // Kích hoạt phân tích AI cảm xúc nền sau khi lưu (fire and forget)
      if (window.FEATURES && window.FEATURES.ai_emotion_analysis && res.entry?.id) {
        API.getEntryEmotion(res.entry.id).catch(() => {});
      }
      // Trợ lý Tâm hồn AI — lấy lời phản hồi ấm áp sau khi lưu (fire and forget)
      if (window.FEATURES && window.FEATURES.soul_companion && res.entry?.id) {
        API.getEntryCompanion(res.entry.id).then(d => { if (d && d.message) showCompanionMessage(d.message); }).catch(() => {});
      }
      if (res.low_streak) setTimeout(showLowMoodAlert, 800);
      await loadDiaryEntries();
      showToast('✅ Đã lưu nhật ký!');
    } catch(err) { showToast('❌ Lỗi lưu nhật ký: '+err.message); }
    finally { btn.disabled=false; btn.textContent='💾 Lưu nhật ký'; }
  }

  async function deleteEntry(id, btn) {
    if (!confirm('Xóa nhật ký này?')) return;
    btn.textContent='...';
    try { await API.deleteEntry(id); await loadDiaryEntries(); showToast('🗑 Đã xóa.'); }
    catch(err) { showToast('❌ Không thể xóa: '+err.message); }
  }

  // ── Streak celebration ───────────────────────────────────────────────
  function showStreakCelebration(days, freezeGrant = 0) {
    document.getElementById('streak-badge-num').textContent = days;
    document.getElementById('streak-modal-title').textContent =
      days >= 100 ? '💎 Huyền thoại!' :
      days >= 50  ? '🌟 Xuất sắc lắm!' :
      days >= 30  ? '🏆 Tuyệt vời!' :
      days >= 14  ? '⭐ Ấn tượng!' :
      days >= 7   ? '🎉 Tốt lắm!' : '✨ Chuỗi mới!';
    document.getElementById('streak-modal-sub').textContent = `Bạn đã duy trì chuỗi ${days} ngày liên tiếp!`;
    const rewardEl = document.getElementById('streak-modal-reward');
    if (rewardEl) {
      rewardEl.innerHTML = freezeGrant > 0
        ? `<div class="streak-reward-box">🎁 Phần thưởng: <strong>+${freezeGrant} lượt cứu streak</strong> 🛡️</div>`
        : '';
    }
    document.getElementById('streak-modal').classList.add('open');
  }
  function closeStreakModal() { document.getElementById('streak-modal').classList.remove('open'); }

  // ── Inbox (Hộp thư hỗ trợ) ──────────────────────────────────────────────
  function fmtTimeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24) return `${hrs} giờ trước`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `${days} ngày trước`;
    return new Date(iso).toLocaleDateString('vi-VN');
  }

  async function loadInboxBadge() {
    try {
      const { count } = await API.getInboxUnread();
      const badge = document.getElementById('inbox-badge');
      if (badge) badge.style.display = count > 0 ? '' : 'none';
    } catch {}
  }

  async function initInboxPage() {
    try {
      const { messages } = await API.getInbox();
      const list = document.getElementById('inbox-list');
      if (!list) return;
      if (!messages.length) {
        list.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--text-muted)"><div style="font-size:40px;margin-bottom:12px">💌</div><div>Chưa có tin nhắn nào</div></div>';
        return;
      }
      const typeIcons   = { message:'💬', cheer:'✨', song:'🎵', article:'📖' };
      const typeLabels  = { message:'Tin nhắn', cheer:'Động viên', song:'Gợi ý nhạc', article:'Gợi ý bài viết' };
      const moodLabels  = { chill:'🌿 Thư giãn', focus:'📖 Tập trung', sleep:'🌙 Dễ ngủ', nature:'🍃 Thiên nhiên' };
      list.innerHTML = messages.map(m => {
        const meta = m.meta_json ? JSON.parse(m.meta_json) : {};
        const songBtn = m.type === 'song' && meta.mood
          ? `<div style="margin-top:10px"><button class="tag" onclick="event.stopPropagation();App.suggestAmbienceMusic('${meta.mood}')">🎵 Nghe ${moodLabels[meta.mood] || meta.mood}</button></div>`
          : '';
        return `
          <div class="card inbox-msg${m.is_read ? '' : ' inbox-unread'}" style="cursor:pointer;margin-bottom:12px" onclick="App.readInboxMsg(${m.id},this)">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <span style="font-size:24px;flex-shrink:0">${typeIcons[m.type] || '💌'}</span>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="font-size:12px;color:var(--text-muted)">${typeLabels[m.type] || 'Tin nhắn'} từ <strong>${escapeHtml(m.from_fullname || m.from_username)}</strong></span>
                  <span style="font-size:11px;color:var(--text-hint);margin-left:auto;flex-shrink:0">${fmtTimeAgo(m.created_at)}</span>
                  ${!m.is_read ? '<span style="width:8px;height:8px;background:var(--primary);border-radius:50%;display:inline-block;flex-shrink:0"></span>' : ''}
                </div>
                <div style="font-size:14px;color:var(--text);line-height:1.6;white-space:pre-wrap">${escapeHtml(m.content)}</div>
                ${songBtn}
              </div>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      const list = document.getElementById('inbox-list');
      if (list) list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Không thể tải tin nhắn.</div>';
    }
  }

  async function readInboxMsg(id, el) {
    if (!el.classList.contains('inbox-unread')) return;
    el.classList.remove('inbox-unread');
    el.querySelector('span[style*="background:var(--primary)"]')?.remove();
    await API.markInboxRead(id).catch(() => {});
    loadInboxBadge();
  }

  function showLowMoodAlert() { document.getElementById('lowmood-alert-modal').classList.add('open'); }
  function closeLowMoodAlert() { document.getElementById('lowmood-alert-modal').classList.remove('open'); }
  function navToSOS() { closeLowMoodAlert(); nav('sos'); }

  // ── Chart ────────────────────────────────────────────────────────────
  async function renderChart(days) {
    const canvas = document.getElementById('moodChart');
    if (!canvas) return;
    if (currentChart) { currentChart.destroy(); currentChart=null; }
    try {
      const res   = await API.getStats(days);
      const stats = res.stats || [];
      const labels=[], data=[], pointColors=[], pointSizes=[];
      const now = new Date();
      for (let i=days-1;i>=0;i--) {
        const d = new Date(now); d.setDate(d.getDate()-i);
        const ds = d.toISOString().split('T')[0];
        labels.push(`${d.getDate()}/${d.getMonth()+1}`);
        const row = stats.find(s=>s.entry_date&&s.entry_date.startsWith(ds));
        const avg = row ? Math.round(row.avg_mood*10)/10 : null;
        data.push(avg);
        pointColors.push(avg ? MOOD_DATA[Math.round(avg)].color : 'rgba(0,0,0,.1)');
        pointSizes.push(avg ? 8 : 4);
      }
      currentChart = new Chart(canvas.getContext('2d'), {
        type:'line',
        data:{labels,datasets:[{
          label:'Điểm tâm trạng', data,
          borderColor:'url(#chartGrad)',
          segment:{borderColor:ctx=>{
            const v=ctx.p1.parsed.y; if(!v) return '#e2e8f0';
            return MOOD_DATA[Math.round(v)]?.color||'#6366f1';
          }},
          backgroundColor:'rgba(99,102,241,.06)',
          pointBackgroundColor:pointColors, pointBorderColor:'#fff',
          pointBorderWidth:2, pointRadius:pointSizes, pointHoverRadius:10,
          fill:true, tension:.4, borderWidth:3, spanGaps:false
        }]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{
            backgroundColor:'#1e1b4b',titleColor:'#e0e7ff',bodyColor:'#c7d2fe',
            callbacks:{label:ctx=>`${MOOD_DATA[Math.round(ctx.parsed.y)]?.emoji||''} ${ctx.parsed.y} — ${MOOD_DATA[Math.round(ctx.parsed.y)]?.label||''}`}
          }},
          scales:{
            y:{min:0,max:11,ticks:{stepSize:1,callback:v=>v>0&&v<11?v:''},grid:{color:'rgba(99,102,241,.06)'},border:{display:false}},
            x:{grid:{display:false},border:{display:false}}
          }
        }
      });
      const valid = data.filter(v=>v!==null);
      document.getElementById('stat-avg').textContent  = valid.length?(valid.reduce((a,b)=>a+b,0)/valid.length).toFixed(1):'—';
      document.getElementById('stat-high').textContent = valid.length?Math.max(...valid):'—';
      document.getElementById('stat-low').textContent  = valid.length?Math.min(...valid):'—';
      // Emotion frequency
      const freq={};
      stats.forEach(s=>{if(s.all_tags)s.all_tags.split('|').filter(Boolean).forEach(t=>{freq[t]=(freq[t]||0)+1;});});
      const sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,8);
      const freqEl=document.getElementById('emotion-frequency');
      freqEl.innerHTML=sorted.length
        ?sorted.map(([tag,cnt])=>`<div class="card-sm" style="text-align:center"><div style="font-size:22px">${tag.split(' ')[0]}</div><div style="font-size:15px;font-weight:700;color:var(--primary)">${cnt}</div><div style="font-size:11px;color:var(--text-muted)">${tag.split(' ').slice(1).join(' ')}</div></div>`).join('')
        :'<div style="color:var(--text-hint);font-size:13px;grid-column:1/-1">Chưa có dữ liệu. Hãy thêm nhãn khi viết nhật ký!</div>';
    } catch(err) { showToast('⚠️ Không thể tải biểu đồ: '+err.message); }
  }

  // ── Bản đồ thời tiết tâm hồn (Mood Calendar) ───────────────────────────
  function switchChartView(view, btn) {
    document.querySelectorAll('#chart-view-toggle .tag').forEach(b => b.classList.remove('sel'));
    (btn || document.getElementById(`chart-view-btn-${view}`))?.classList.add('sel');
    const lineEl = document.getElementById('chart-line-section');
    const calEl  = document.getElementById('mood-calendar-section');
    if (view === 'calendar') {
      if (lineEl) lineEl.style.display = 'none';
      if (calEl)  calEl.style.display  = '';
      renderMoodCalendar();
    } else {
      if (lineEl) lineEl.style.display = '';
      if (calEl)  calEl.style.display  = 'none';
    }
  }

  function moodWeatherIcon(avg) {
    if (avg === null || avg === undefined) return null;
    if (avg >= 8) return '☀️';
    if (avg >= 6) return '🌤️';
    if (avg >= 4) return '⛅';
    if (avg >= 2) return '🌧️';
    return '⛈️';
  }

  async function renderMoodCalendar() {
    const grid  = document.getElementById('mood-calendar-grid');
    const label = document.getElementById('mood-cal-month-label');
    if (!grid) return;
    const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
    if (label) label.textContent = `Tháng ${month + 1}, ${year}`;
    const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
    grid.innerHTML = '<div class="loading-text">Đang tải...</div>';
    try {
      const res = await API.getMoodCalendar(ym);
      const byDate = {};
      (res.days || []).forEach(d => { byDate[(d.entry_date || '').split('T')[0]] = d; });

      const firstDow    = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const dowLabels    = ['CN','T2','T3','T4','T5','T6','T7'];
      let html = dowLabels.map(d => `<div class="mood-cal-dow">${d}</div>`).join('');
      for (let i = 0; i < firstDow; i++) html += `<div class="mood-cal-day empty"></div>`;
      for (let day = 1; day <= daysInMonth; day++) {
        const ds   = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const info = byDate[ds];
        const avg  = info ? Math.round(info.avg_mood * 10) / 10 : null;
        const icon = moodWeatherIcon(avg);
        const bg   = avg ? MOOD_DATA[Math.round(avg)].color + '1f' : '';
        const title = info ? `Mood TB: ${avg}/10 — ${info.entry_count} nhật ký` : 'Chưa có nhật ký';
        html += `<div class="mood-cal-day${info ? '' : ' empty'}" style="background:${bg}" title="${title}">
          <span class="mood-cal-daynum">${day}</span>
          ${icon ? `<span class="mood-cal-icon">${icon}</span>` : ''}
        </div>`;
      }
      grid.innerHTML = html;
    } catch (err) {
      grid.innerHTML = `<div class="loading-text" style="color:var(--rose)">Lỗi: ${err.message}</div>`;
    }
  }

  function calendarMonthNav(delta) {
    const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
    const now  = new Date();
    if (next.getFullYear() > now.getFullYear() ||
        (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth())) return;
    calendarMonth = next;
    renderMoodCalendar();
  }

  // ── Library (API-driven) ──────────────────────────────────────────────
  let allApiArticles = [];

  async function initLibrary() {
    try {
      const catRes = await API.getCategories();
      const catMap = {stress:'😤 Stress',sleep:'🌙 Giấc ngủ',depression:'💙 Trầm cảm',relationship:'💛 Mối quan hệ',study:'📚 Học tập',other:'📌 Khác'};
      const filterEl = document.getElementById('lib-filters');
      if (filterEl && catRes.categories?.length) {
        filterEl.innerHTML = `<button class="tag sel" onclick="App.filterArticles('all',this)">Tất cả</button>` +
          catRes.categories.map(c=>`<button class="tag" onclick="App.filterArticles('${c.category}',this)">${catMap[c.category]||c.category} <span style="color:var(--text-hint);font-size:10px">(${c.count})</span></button>`).join('');
      }
      const res = await API.getArticles('', '', 'library');
      allApiArticles = res.articles || [];
      renderApiArticles(allApiArticles);
    } catch(err) {
      const el=document.getElementById('lib-loading'); if(el) el.textContent='Không thể tải bài viết.';
    }
  }

  function articleCardHtml(a) {
    return `
      <div class="article-card" onclick="App.openArticle(${a.id})">
        <div class="article-thumb" style="background:${a.cover_color}">${a.thumbnail}</div>
        <div class="article-body">
          <span class="article-badge" style="background:${a.cover_color};color:var(--text-muted)">${a.category}</span>
          <div class="article-title">${a.title}</div>
          <div class="article-desc">${a.summary||''}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
            <div class="article-read">📖 ${a.read_time} đọc →</div>
            ${a.view_count?`<div style="font-size:11px;color:var(--text-hint)">👁 ${a.view_count}</div>`:''}
          </div>
        </div>
      </div>`;
  }

  function renderApiArticles(articles) {
    const loadEl=document.getElementById('lib-loading');
    const gridEl=document.getElementById('articles-grid');
    const emptyEl=document.getElementById('lib-empty');
    if (!gridEl) return;
    if (loadEl) loadEl.style.display='none';
    if (!articles.length) {
      gridEl.style.display='none';
      if (emptyEl) emptyEl.style.display='block';
      return;
    }
    if (emptyEl) emptyEl.style.display='none';
    gridEl.style.display='grid';
    gridEl.innerHTML=articles.map(articleCardHtml).join('');
  }

  function filterArticles(cat, btn) {
    document.querySelectorAll('#lib-filters .tag').forEach(b=>b.classList.remove('sel'));
    if(btn) btn.classList.add('sel');
    renderApiArticles(cat==='all'?allApiArticles:allApiArticles.filter(a=>a.category===cat));
  }

  function renderMarkdown(md) {
    if (!md) return '';
    return md
      .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;color:var(--text);margin:16px 0 6px">$1</h3>')
      .replace(/^## (.+)$/gm,  '<h2 style="font-size:17px;font-weight:700;color:var(--text);margin:20px 0 8px">$1</h2>')
      .replace(/^# (.+)$/gm,   '<h1 style="font-size:20px;font-weight:800;color:var(--text);margin:0 0 12px">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g,'<strong style="color:var(--text);font-weight:600">$1</strong>')
      .replace(/\*(.+?)\*/g,    '<em>$1</em>')
      .replace(/^> (.+)$/gm,   '<blockquote style="border-left:3px solid var(--primary);padding-left:14px;margin:12px 0;color:var(--text-hint);font-style:italic">$1</blockquote>')
      .replace(/^[-*] (.+)$/gm,'<li style="margin-bottom:4px;color:var(--text-muted)">$1</li>')
      .replace(/`(.+?)`/g,     '<code style="background:var(--surface);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
      .replace(/\n\n/g, '</p><p style="margin-bottom:12px">');
  }

  async function openArticle(id) {
    try {
      const data = await API.getArticle(id);
      const a = data.article;
      document.getElementById('article-modal-title').textContent = a.title;
      document.getElementById('article-modal-meta').textContent  = `${a.category} · ${a.read_time} · ${a.author_name||'Soul Diary'} · ${a.view_count} lượt xem`;
      document.getElementById('article-modal-body').innerHTML    = `<p style="margin-bottom:12px">${renderMarkdown(a.content)}</p>`;
      document.getElementById('article-modal').classList.add('open');
    } catch(err) { showToast('❌ Không thể tải bài viết.'); }
  }

  function closeArticleModal(e) {
    if (!e || e.target===document.getElementById('article-modal'))
      document.getElementById('article-modal').classList.remove('open');
  }

  // ── Exercises ────────────────────────────────────────────────────────
  async function renderExercises() {
    document.getElementById('exercises-grid').innerHTML=EXERCISES.map(ex=>`<div class="exercise-card"><div class="ex-icon" style="background:${ex.bg}">${ex.icon}</div><div class="ex-title">${ex.title}</div><span class="ex-duration" style="background:${ex.bg};color:var(--text-muted)">⏱ ${ex.duration}</span><div class="ex-desc">${ex.desc}</div><ol class="ex-steps">${ex.steps.map(s=>`<li class="ex-step">${s}</li>`).join('')}</ol>${ex.action==='breath'?`<button class="btn-outline" style="margin-top:14px;font-size:12px" onclick="App.openBreathModal()">▶ Bắt đầu có hướng dẫn</button>`:''}${ex.action==='box_breath'?`<button class="btn-outline" style="margin-top:14px;font-size:12px" onclick="App.openBoxBreathModal()">▶ Bắt đầu có hướng dẫn</button>`:''}${ex.action==='unsent_letter'?`<button class="btn-outline" style="margin-top:14px;font-size:12px" onclick="App.openLetterModal()">✍️ Viết thư</button>`:''}${ex.action==='evidence_testing'?`<button class="btn-outline" style="margin-top:14px;font-size:12px" onclick="App.openEvidenceModal()">⚖️ Bắt đầu</button>`:''}</div>`).join('');

    try {
      const res = await API.getArticles('', '', 'exercise');
      const articles = res.articles || [];
      const wrap = document.getElementById('exercises-articles');
      const grid = document.getElementById('exercises-articles-grid');
      if (wrap && grid) {
        wrap.style.display = articles.length ? 'block' : 'none';
        grid.innerHTML = articles.map(articleCardHtml).join('');
      }
    } catch(err) {}
  }

  // ── Music (thư viện nhạc thư giãn) ───────────────────────────────────
  // Thẻ <audio id="music-audio"> sống ngoài #main-content (xem index.html) nên không bị
  // huỷ khi điều hướng SPA → nhạc tiếp tục phát xuyên suốt khi chuyển trang trong app.
  // Rời khỏi web/đóng tab thì trình duyệt tự dừng phát — không cần code thêm.
  function initMusicPage() {
    const audio = document.getElementById('music-audio');
    if (audio && !musicAudioBound) {
      musicAudioBound = true;
      audio.addEventListener('ended', stopMusic);
    }
    const mood = pendingMusicMood || currentMood;
    pendingMusicMood = null;
    loadMusicMood(mood);
  }

  function fmtDuration(sec) {
    sec = parseInt(sec) || 0;
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function musicCardHtml(t, i) {
    return `
      <div class="music-card" id="music-card-${i}">
        <div class="music-cover" style="background-image:url('${t.image || ''}')">
          <button class="music-play-btn" id="music-btn-${i}" onclick="App.toggleTrack(${i})">▶</button>
        </div>
        <div class="music-info">
          <div class="music-name" title="${t.name}">${t.name}</div>
          <div class="music-artist" title="${t.artist}">${t.artist}</div>
          <div class="music-duration">⏱ ${fmtDuration(t.duration)}</div>
        </div>
      </div>`;
  }

  async function loadMusicMood(mood, btn) {
    currentMood = mood;
    document.querySelectorAll('#music-moods .tag').forEach(b => b.classList.remove('sel'));
    (btn || document.querySelector(`#music-moods [data-mood="${mood}"]`))?.classList.add('sel');
    // KHÔNG dừng nhạc ở đây — đổi mood hoặc quay lại trang không được làm gián đoạn bài đang phát

    const loadingEl = document.getElementById('music-loading');
    const gridEl    = document.getElementById('music-grid');
    const emptyEl   = document.getElementById('music-empty');
    loadingEl.style.display = 'block';
    gridEl.style.display    = 'none';
    emptyEl.style.display   = 'none';

    try {
      const res = await API.getMusicTracks(mood);
      musicTracks = res.tracks || [];
      loadingEl.style.display = 'none';
      if (!musicTracks.length) { emptyEl.style.display = 'block'; return; }
      gridEl.style.display = 'grid';
      gridEl.innerHTML = musicTracks.map(musicCardHtml).join('');
      syncPlayingUI();
    } catch (err) {
      loadingEl.style.display = 'none';
      emptyEl.style.display   = 'block';
    }
  }

  // Đồng bộ giao diện (thẻ đang phát + icon nút) theo `nowPlaying`, tra cứu lại bằng
  // track.id trong `musicTracks` mới render — vì index có thể đổi sau khi đổi mood/load lại.
  function syncPlayingUI() {
    document.querySelectorAll('#music-grid .music-card.playing').forEach(el => el.classList.remove('playing'));
    document.querySelectorAll('#music-grid .music-play-btn').forEach(btn => btn.textContent = '▶');
    if (!nowPlaying) return;
    const audio = document.getElementById('music-audio');
    const idx = musicTracks.findIndex(t => t.id === nowPlaying.id);
    if (idx === -1) return;
    document.getElementById(`music-card-${idx}`)?.classList.add('playing');
    const btn = document.getElementById(`music-btn-${idx}`);
    if (btn) btn.textContent = (audio && !audio.paused) ? '❚❚' : '▶';
  }

  function toggleTrack(i) {
    const t = musicTracks[i];
    const audio = document.getElementById('music-audio');
    if (!t || !t.audio || !audio) { showToast('⚠️ Không có nguồn phát cho bài này.'); return; }

    if (nowPlaying && nowPlaying.id === t.id) {
      // Cùng bài đang chọn → bấm để pause/resume (giữ nguyên vị trí đang nghe)
      if (audio.paused) audio.play().catch(() => {});
      else              audio.pause();
      syncPlayingUI();
      return;
    }

    nowPlaying = t;
    audio.src = t.audio;
    audio.play().catch(() => {});
    syncPlayingUI();
  }

  // Dừng hẳn (dùng khi bài hát kết thúc tự nhiên) — khác với pause: xoá nguồn phát luôn
  function stopMusic() {
    const audio = document.getElementById('music-audio');
    if (audio) { audio.pause(); audio.src = ''; }
    nowPlaying = null;
    syncPlayingUI();
  }

  // ── Check-in Sức khỏe Tinh thần hàng tuần ───────────────────────────
  const CHECKIN_LEVEL_LABEL = { low: 'Thấp', moderate: 'Trung bình', high: 'Cao' };

  // Escape nội dung do AI sinh ra (có thể chứa trích dẫn từ nhật ký người dùng) trước khi chèn bằng innerHTML
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  async function initCheckinPage() {
    const el = document.getElementById('checkin-content');
    el.innerHTML = '<div class="loading-text">Đang tải...</div>';
    try {
      const status = await API.getCheckinStatus();
      if (status.needsCheckin) renderCheckinIntro();
      else await renderCheckinDone(status.lastResult);
    } catch (e) {
      el.innerHTML = '<div class="loading-text">Không tải được dữ liệu check-in. Vui lòng thử lại sau.</div>';
    }
  }

  function renderCheckinIntro() {
    document.getElementById('checkin-content').innerHTML = `
      <div class="card">
        <div style="font-size:32px;margin-bottom:8px">🧪</div>
        <div style="font-weight:800;font-size:16px;margin-bottom:8px;font-family:'Nunito',sans-serif">Check-in tuần này</div>
        <div style="font-size:13px;color:var(--text-muted);line-height:1.7;margin-bottom:16px">
          Một bài sàng lọc ngắn gồm <b>${CHECKIN_QUESTIONS.length} câu hỏi</b> (~5 phút) giúp bạn nhìn lại cảm xúc, lo âu, căng thẳng
          và tinh thần tích cực của mình trong khoảng thời gian gần đây. Đây <b>không phải</b> công cụ chẩn đoán bệnh —
          chỉ giúp bạn theo dõi bản thân tốt hơn. Bạn có thể quay lại làm sau nếu chưa muốn làm bây giờ.
        </div>
        <button class="btn-primary" style="width:auto;padding:12px 28px" onclick="App.startCheckin()">Bắt đầu check-in</button>
      </div>`;
  }

  function startCheckin() {
    checkinAnswers = new Array(CHECKIN_QUESTIONS.length).fill(null);
    renderCheckinQuiz();
  }

  function renderCheckinQuiz() {
    let html = `<div class="checkin-progress-bar"><div class="checkin-progress-fill" id="checkin-progress-fill" style="width:0%"></div></div>`;
    let lastScale = null;
    CHECKIN_QUESTIONS.forEach((q, i) => {
      if (q.scale !== lastScale) {
        const info = CHECKIN_SCALE_INFO[q.scale];
        html += `<div class="checkin-section-title">${info.title}</div><div class="checkin-section-prompt">${info.prompt}</div>`;
        lastScale = q.scale;
      }
      const opts = CHECKIN_OPTIONS[CHECKIN_SCALE_INFO[q.scale].options];
      html += `<div class="checkin-question" data-q="${i}">
        <div class="checkin-question-text">${i + 1}. ${q.text}</div>
        <div class="checkin-options">
          ${opts.map(o => `<button type="button" class="checkin-option" onclick="App.selectCheckinAnswer(${i},${o.value},this)">${o.label}</button>`).join('')}
        </div>
      </div>`;
    });
    html += `<button class="btn-primary" id="checkin-submit-btn" disabled>Gửi (0/${CHECKIN_QUESTIONS.length})</button>`;
    document.getElementById('checkin-content').innerHTML = html;
    document.getElementById('checkin-submit-btn').addEventListener('click', submitCheckinQuiz);
  }

  function selectCheckinAnswer(i, value, btn) {
    checkinAnswers[i] = value;
    btn.parentElement.querySelectorAll('.checkin-option').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');

    const total    = CHECKIN_QUESTIONS.length;
    const answered = checkinAnswers.filter(a => a !== null).length;
    document.getElementById('checkin-progress-fill').style.width = `${Math.round(answered / total * 100)}%`;

    const submitBtn = document.getElementById('checkin-submit-btn');
    submitBtn.textContent = `Gửi (${answered}/${total})`;
    submitBtn.disabled = answered < total;
  }

  async function submitCheckinQuiz() {
    const submitBtn = document.getElementById('checkin-submit-btn');
    const total = CHECKIN_QUESTIONS.length;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang gửi...';
    try {
      const { result, weeklyAnalysis } = await API.submitCheckin(checkinAnswers);
      document.getElementById('checkin-content').innerHTML = renderCheckinResultHTML(result, weeklyAnalysis);
      const badge = document.getElementById('checkin-badge');
      if (badge) badge.style.display = 'none';
      showToast('Đã lưu kết quả check-in!');
    } catch (e) {
      showToast(e.message || 'Có lỗi xảy ra, vui lòng thử lại.');
      submitBtn.disabled = false;
      submitBtn.textContent = `Gửi (${checkinAnswers.filter(a => a !== null).length}/${total})`;
    }
  }

  function renderCheckinResultHTML(result, weeklyAnalysis) {
    const cards = result.items.map(it => `
      <div class="checkin-result-card checkin-level-${it.level}">
        <div class="checkin-result-head">
          <div class="checkin-result-name">${it.name}</div>
          <div class="checkin-result-score">${it.score}/${it.max} · ${CHECKIN_LEVEL_LABEL[it.level]}</div>
        </div>
        <div class="checkin-result-bar"><div class="checkin-result-bar-fill" style="width:${Math.round(it.score / it.max * 100)}%"></div></div>
        <div class="checkin-result-text">${it.text}</div>
      </div>`).join('');
    const recommend = result.recommendation
      ? `<div class="checkin-recommend">💙 <b>Khuyến nghị:</b> ${result.recommendation}</div>` : '';
    return `
      ${renderWeeklyAnalysisHTML(weeklyAnalysis)}
      <div class="card" style="margin-bottom:16px">
        <div style="font-weight:700;font-size:14px;margin-bottom:12px">${result.summary}</div>
        ${cards}
        ${recommend}
      </div>
      <div class="disclaimer">⚠️ ${result.disclaimer}</div>`;
  }

  // "Phần thưởng" cuối tuần — AI liên kết điểm số check-in với nhật ký để chỉ ra triggers/điểm sáng/gợi ý
  function renderWeeklyAnalysisHTML(analysis) {
    if (!analysis) return '';
    const trendMeta = {
      'Tăng':    { icon: '📈', cls: 'up' },
      'Giảm':    { icon: '📉', cls: 'down' },
      'Ổn định': { icon: '➖', cls: 'flat' },
    }[analysis.emotional_trend] || { icon: '➖', cls: 'flat' };

    const section = (title, items) => (Array.isArray(items) && items.length)
      ? `<div class="checkin-reward-section">
          <div class="checkin-reward-section-title">${title}</div>
          <ul class="checkin-reward-list">${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
        </div>` : '';

    return `
      <div class="checkin-reward-card">
        <div class="checkin-reward-header">
          <div class="checkin-reward-badge">🎁 Phần thưởng cuối tuần từ AI</div>
          <div class="checkin-reward-trend trend-${trendMeta.cls}">${trendMeta.icon} ${escapeHtml(analysis.emotional_trend)}</div>
        </div>
        <div class="checkin-reward-overview">${escapeHtml(analysis.weekly_overview)}</div>
        ${section('🔍 Điều có thể đã ảnh hưởng đến bạn', analysis.key_triggers)}
        ${section('✨ Khoảnh khắc tích cực', analysis.bright_spots)}
        ${section('🌱 Gợi ý cho tuần tới', analysis.ai_recommendations)}
      </div>`;
  }

  async function renderCheckinDone(lastResult) {
    let html = `
      <div class="card" style="margin-bottom:16px;text-align:center">
        <div style="font-size:28px;margin-bottom:6px">✅</div>
        <div style="font-weight:700;font-size:14px">Bạn đã hoàn thành check-in tuần này</div>
        <div style="font-size:12px;color:var(--text-hint);margin-top:4px">Hẹn gặp lại bạn vào Thứ 7 tuần sau nhé 🌱</div>
      </div>`;
    if (lastResult) html += renderCheckinResultHTML(lastResult, lastResult.weeklyAnalysis);

    try {
      const { history } = await API.getCheckinHistory();
      if (history && history.length > 1) {
        html += `<div class="card" style="margin-top:16px">
          <div style="font-weight:700;font-size:14px;margin-bottom:8px">Lịch sử check-in</div>
          ${history.map(h => `
            <div class="checkin-history-row">
              <span>Tuần ${h.weekNumber}/${h.year}</span>
              <span>PHQ-9: ${h.scores.phq9_score} · GAD-7: ${h.scores.gad7_score} · PSS-10: ${h.scores.pss10_score} · WHO-5: ${h.scores.who5_score}</span>
            </div>`).join('')}
        </div>`;
      }
    } catch (e) {}

    document.getElementById('checkin-content').innerHTML = html;
  }

  async function refreshCheckinBadge() {
    try {
      const status = await API.getCheckinStatus();
      const badge = document.getElementById('checkin-badge');
      if (badge) badge.style.display = status.needsCheckin ? '' : 'none';
    } catch (e) {}
  }

  // ── SOS ──────────────────────────────────────────────────────────────
  async function renderSOSContacts() {
    const el = document.getElementById('sos-contacts');
    if (!el) return;
    try {
      const data = await API.getSetting('sos_contacts');
      const text = (data.value || '').trim();
      if (!text) {
        el.innerHTML = '<p style="text-align:center;color:var(--text-hint);padding:30px 0;font-size:13px">Hiện chưa có thông tin đường dây hỗ trợ.</p>';
        return;
      }

      // Tách thành từng block theo dòng trống, mỗi block = 1 card
      const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
      const fragment = document.createDocumentFragment();

      blocks.forEach(block => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) return;

        // Dòng đầu: icon (từ đầu tiên nếu là non-ASCII) + tên
        const words    = lines[0].split(' ');
        const hasEmoji = words[0].length > 0 && words[0].codePointAt(0) > 127;
        const icon     = hasEmoji ? words[0] : '📞';
        const title    = hasEmoji ? words.slice(1).join(' ') : lines[0];

        const card = document.createElement('div');
        card.className = 'sos-card';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'sos-icon-wrap';
        iconWrap.style.background = '#fff1f2';
        iconWrap.textContent = icon;
        card.appendChild(iconWrap);

        const body = document.createElement('div');
        body.style.cssText = 'flex:1 1 0;min-width:0';

        const titleEl = document.createElement('div');
        titleEl.className = 'sos-name';
        titleEl.textContent = title;
        body.appendChild(titleEl);

        // Các dòng còn lại: thử parse CONTACT — MÔ TẢ (GIỜ)
        lines.slice(1).forEach(line => {
          const dashIdx = line.indexOf('—');
          const left    = dashIdx >= 0 ? line.slice(0, dashIdx).trim() : '';
          const right   = dashIdx >= 0 ? line.slice(dashIdx + 1).trim() : line;

          const isPhone = left.length > 0 && /^[\d\s\+\(\)]{6,}$/.test(left.replace(/[\-\.]/g, ''));
          const isEmail = left.length > 0 && /@\w/.test(left) && !left.includes(' ');

          if (isPhone || isEmail) {
            const link = document.createElement('a');
            link.className = 'sos-contact';
            link.textContent = left;
            link.href = isPhone ? `tel:${left.replace(/[^\d+]/g, '')}` : `mailto:${left}`;
            body.appendChild(link);

            const hoursM = right.match(/\(([^)]+)\)\s*$/);
            const desc   = hoursM ? right.slice(0, hoursM.index).trim().replace(/\.$/, '') : right;

            if (desc) {
              const descEl = document.createElement('div');
              descEl.className = 'sos-desc';
              descEl.textContent = desc;
              body.appendChild(descEl);
            }
            if (hoursM) {
              const hoursEl = document.createElement('div');
              hoursEl.className = 'sos-hours';
              hoursEl.textContent = '⏰ ' + hoursM[1];
              body.appendChild(hoursEl);
            }
          } else {
            const textEl = document.createElement('div');
            textEl.className = 'sos-desc';
            textEl.textContent = line;
            body.appendChild(textEl);
          }
        });

        card.appendChild(body);
        fragment.appendChild(card);
      });

      el.innerHTML = '';
      el.appendChild(fragment);
    } catch(err) {
      el.textContent = 'Không thể tải thông tin đường dây hỗ trợ.';
    }
  }

  // ── Breathing modal ──────────────────────────────────────────────────
  function openBreathModal()  { document.getElementById('breath-modal').classList.add('open'); }
  function closeBreathModal() {
    clearTimeout(breathTimeout); breathTimeout=null; breathCycles=0;
    document.getElementById('breath-modal').classList.remove('open');
    const c=document.getElementById('breath-circle');
    c.className='breath-circle'; c.textContent='Sẵn sàng';
    document.getElementById('breath-status').textContent='—';
    document.getElementById('breath-cycle-text').textContent='Nhấn bắt đầu để khởi động';
    document.getElementById('breath-start-btn').textContent='▶ Bắt đầu';
  }
  function startBreathing() {
    const btn=document.getElementById('breath-start-btn');
    if(breathTimeout){clearTimeout(breathTimeout);breathTimeout=null;btn.textContent='▶ Bắt đầu';return;}
    btn.textContent='⏸ Dừng'; breathCycles=0; runBreathPhase(0);
  }
  function runBreathPhase(pi) {
    const phases=[{label:'Hít vào...',dur:4000,cls:'inhale'},{label:'Nín thở...',dur:7000,cls:'hold'},{label:'Thở ra...',dur:8000,cls:'exhale'}];
    const p=phases[pi],c=document.getElementById('breath-circle'); if(!c)return;
    document.getElementById('breath-status').textContent=p.label;
    c.className='breath-circle '+p.cls; c.textContent=p.label;
    breathTimeout=setTimeout(()=>{
      const next=pi+1;
      if(next<phases.length){runBreathPhase(next);}
      else{breathCycles++;document.getElementById('breath-cycle-text').textContent=`Chu kỳ ${breathCycles} hoàn thành`;
        if(breathCycles<4)runBreathPhase(0);
        else{document.getElementById('breath-status').textContent='✅ Hoàn thành!';document.getElementById('breath-start-btn').textContent='▶ Bắt đầu';breathCycles=0;breathTimeout=null;}
      }
    },p.dur);
  }

  // ── Box Breathing modal (Hộp Thở 4-4-4-4) ────────────────────────────
  const BOX_BREATH_PHASES=[
    {label:'Hít vào...',edge:'bb-top'},
    {label:'Nín thở...',edge:'bb-right'},
    {label:'Thở ra...', edge:'bb-bottom'},
    {label:'Nín thở...',edge:'bb-left'},
  ];
  function openBoxBreathModal() { document.getElementById('box-breath-modal').classList.add('open'); }
  function closeBoxBreathModal() {
    clearTimeout(boxBreathTimeout); boxBreathTimeout=null; boxBreathCycles=0;
    document.getElementById('box-breath-modal').classList.remove('open');
    resetBoxBreathEdges();
    document.getElementById('box-breath-label').textContent='Sẵn sàng';
    document.getElementById('box-breath-status').textContent='—';
    document.getElementById('box-breath-cycle-text').textContent='Nhấn bắt đầu để khởi động';
    document.getElementById('box-breath-start-btn').textContent='▶ Bắt đầu';
  }
  function resetBoxBreathEdges() {
    document.querySelectorAll('#box-breath-square .bb-edge').forEach(el => {
      el.style.transition='none';
      el.classList.remove('active');
      void el.offsetWidth; // force reflow để áp dụng ngay, không hiệu ứng thu lại
      el.style.transition='';
    });
  }
  function startBoxBreathing() {
    const btn=document.getElementById('box-breath-start-btn');
    if(boxBreathTimeout){clearTimeout(boxBreathTimeout);boxBreathTimeout=null;btn.textContent='▶ Bắt đầu';return;}
    btn.textContent='⏸ Dừng'; boxBreathCycles=0; resetBoxBreathEdges(); runBoxBreathPhase(0);
  }
  function runBoxBreathPhase(pi) {
    const p=BOX_BREATH_PHASES[pi];
    const label=document.getElementById('box-breath-label'); if(!label)return;
    label.textContent=p.label;
    document.getElementById('box-breath-status').textContent=p.label;
    document.querySelector('#box-breath-square .'+p.edge).classList.add('active');
    boxBreathTimeout=setTimeout(()=>{
      const next=pi+1;
      if(next<BOX_BREATH_PHASES.length){runBoxBreathPhase(next);}
      else{boxBreathCycles++;document.getElementById('box-breath-cycle-text').textContent=`Chu kỳ ${boxBreathCycles} hoàn thành`;
        if(boxBreathCycles<4){resetBoxBreathEdges();runBoxBreathPhase(0);}
        else{document.getElementById('box-breath-status').textContent='✅ Hoàn thành!';document.getElementById('box-breath-start-btn').textContent='▶ Bắt đầu';boxBreathCycles=0;boxBreathTimeout=null;}
      }
    },4000);
  }

  // ── Bức thư chưa gửi (Unsent Letter) — viết rồi "đốt", không lưu lại ──
  function openLetterModal() { document.getElementById('letter-modal').classList.add('open'); }
  function closeLetterModal(e) {
    if (!e || e.target===document.getElementById('letter-modal')) {
      const paper = document.getElementById('letter-paper');
      paper.classList.remove('burning');
      document.getElementById('letter-textarea').value = '';
      document.getElementById('letter-modal').classList.remove('open');
    }
  }
  function burnLetter() {
    const ta    = document.getElementById('letter-textarea');
    const paper = document.getElementById('letter-paper');
    const btn   = document.getElementById('letter-burn-btn');
    if (!ta.value.trim()) { showToast('⚠️ Hãy viết điều bạn muốn nói trước khi đốt thư.'); return; }
    btn.disabled = true;
    paper.classList.add('burning');
    setTimeout(() => {
      ta.value = '';
      paper.classList.remove('burning');
      btn.disabled = false;
      showToast('🔥 Đã đốt bức thư — cảm xúc của bạn đã được giải phóng.');
    }, 1400);
  }

  // ── Thử thách Bằng chứng (Evidence Testing) — không lưu lại ──────────
  const EVIDENCE_FIELD_IDS = ['ev-thought','ev-support','ev-against','ev-conclusion'];
  function openEvidenceModal() { document.getElementById('evidence-modal').classList.add('open'); }
  function closeEvidenceModal(e) {
    if (!e || e.target===document.getElementById('evidence-modal')) {
      EVIDENCE_FIELD_IDS.forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('evidence-modal').classList.remove('open');
    }
  }
  function finishEvidenceTesting() {
    if (!document.getElementById('ev-thought').value.trim()) {
      showToast('⚠️ Hãy điền suy nghĩ hiện tại của bạn trước.');
      return;
    }
    showToast('✅ Tuyệt vời! Bạn vừa nhìn nhận lại suy nghĩ của mình một cách khách quan hơn.');
    closeEvidenceModal();
  }

  // ── Dashboard sức khỏe tâm thần nâng cao (v1.3) ─────────────────────────
  async function loadAndRenderMentalHealth() {
    const section = document.getElementById('mental-health-section');
    if (!section || !(window.FEATURES && window.FEATURES.enhanced_mental_dashboard)) return;
    section.style.display = '';
    const cardsEl = document.getElementById('mental-health-cards');
    if (cardsEl) cardsEl.innerHTML = '<div class="skeleton" style="height:80px;grid-column:1/-1;border-radius:12px"></div>';
    try {
      const data = await API.getMentalHealth();
      let trendHtml = '—';
      if (data.monthTrend) {
        const diff = data.monthTrend.diff;
        const arrow = diff > 0
          ? `<span style="color:#059669">↑ +${diff}</span>`
          : diff < 0
          ? `<span style="color:#dc2626">↓ ${diff}</span>`
          : '<span style="color:#6b7280">→</span>';
        trendHtml = `${arrow} <span style="font-size:11px;color:var(--text-muted)">${data.monthTrend.this}/10</span>`;
      }
      cardsEl.innerHTML = `
        <div class="stat-card"><div class="stat-val" style="font-size:16px">${data.topEmotion || '—'}</div><div class="stat-lbl">Cảm xúc chủ đạo</div></div>
        <div class="stat-card"><div class="stat-val" style="font-size:15px">${data.stressDay || '—'}</div><div class="stat-lbl">Ngày căng thẳng nhất</div></div>
        <div class="stat-card"><div class="stat-val" style="font-size:16px">${data.topTheme || '—'}</div><div class="stat-lbl">Chủ đề áp lực</div></div>
        <div class="stat-card"><div class="stat-val" style="font-size:15px">${trendHtml}</div><div class="stat-lbl">Xu hướng tháng</div></div>
      `;
    } catch(_) { section.style.display = 'none'; }
  }

  // ── AI Smart Recap (Gemini) ──────────────────────────────────────────
  async function loadAndRenderSmartRecap() {
    const box = document.getElementById('ai-insight-box');
    if (!box) return;
    box.innerHTML = '<div style="font-size:11px;color:#166534;margin-top:8px;opacity:.6">✨ Đang phân tích...</div>';
    try {
      const data = await API.getSmartRecap();
      if (data.insight) {
        box.innerHTML = `
          <div class="ai-insight-card">
            <div class="ai-insight-label">✨ Phân tích AI</div>
            <div class="ai-insight-text">${data.insight}</div>
          </div>`;
      } else {
        box.innerHTML = '';
      }
    } catch (_) { box.innerHTML = ''; }
  }

  // ── Web Push Notifications ────────────────────────────────────────────
  let pushVapidKey  = null;
  let pushSubscribed = false;

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  async function initPushOptIn() {
    const banner = document.getElementById('push-optin-banner');
    if (!banner) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;

    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      pushSubscribed = !!sub;
      if (pushSubscribed) return; // đã bật rồi, không hiện banner

      if (Notification.permission === 'default') {
        banner.innerHTML = `
          <div class="push-banner">
            <div class="push-banner-left">
              <div class="push-banner-title">🔔 Bật nhắc nhở thông minh</div>
              <div class="push-banner-sub">Nhắc đúng giờ bạn hay viết nhật ký nhất, dựa trên thói quen của bạn</div>
            </div>
            <button class="push-banner-btn" onclick="App.enablePush()">Bật</button>
            <button class="push-banner-close" onclick="this.parentElement.parentElement.remove()">✕</button>
          </div>`;
      }
    } catch (_) {}
  }

  async function enablePush() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { showToast('⚠️ Bạn đã từ chối thông báo.'); return; }

      if (!pushVapidKey) {
        const kRes = await API.getPushVapidKey();
        pushVapidKey = kRes.publicKey;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pushVapidKey),
      });

      await API.subscribePush(JSON.parse(JSON.stringify(sub)));
      pushSubscribed = true;
      document.getElementById('push-optin-banner')?.remove();
      showToast('✅ Đã bật thông báo nhắc nhở!');
    } catch (err) {
      showToast('⚠️ Không thể bật thông báo: ' + err.message);
    }
  }

  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await API.unsubscribePush();
      pushSubscribed = false;
      showToast('🔕 Đã tắt thông báo nhắc nhở.');
    } catch (err) {
      showToast('⚠️ Lỗi khi tắt thông báo.');
    }
  }

  // ── Level bar ────────────────────────────────────────────────────────
  function renderLevelBar(totalEntries) {
    const el = document.getElementById('dash-level-bar');
    if (!el) return;
    const levels = [
      { min:0,   max:9,   icon:'🌱', name:'Mầm non',         color:'#7c3aed' },
      { min:10,  max:29,  icon:'🌿', name:'Người quan sát',  color:'#059669' },
      { min:30,  max:99,  icon:'💙', name:'Người thấu cảm',  color:'#2563eb' },
      { min:100, max:299, icon:'✨', name:'Người chữa lành', color:'#d97706' },
      { min:300, max:Infinity, icon:'🌟', name:'Tâm hồn tự do', color:'#ec4899' },
    ];
    const lvl  = levels.find(l => totalEntries >= l.min && totalEntries <= l.max) || levels[4];
    const next = levels[levels.indexOf(lvl) + 1];
    const pct  = next ? Math.round(((totalEntries - lvl.min) / (next.min - lvl.min)) * 100) : 100;
    el.innerHTML = `
      <div class="level-bar-card">
        <div class="level-bar-header">
          <div class="level-badge">
            <span class="level-icon">${lvl.icon}</span>
            <div>
              <div class="level-name" style="color:${lvl.color}">${lvl.name}</div>
              <div class="level-count">${totalEntries} nhật ký</div>
            </div>
          </div>
          ${next ? `<span class="level-count">${totalEntries}/${next.min}</span>` : '<span class="level-count" style="color:#ec4899">Cấp tối đa 🌟</span>'}
        </div>
        <div class="level-track"><div class="level-fill" style="width:${pct}%;background:${lvl.color}"></div></div>
        ${next ? `<div class="level-next-text" style="color:${lvl.color}">Còn ${next.min - totalEntries} nhật ký nữa để đạt <strong>${next.icon} ${next.name}</strong></div>` : ''}
      </div>`;
  }

  // ── Hạt mầm tâm hồn (Soul Seed) ─────────────────────────────────────
  function renderSoulSeed(user) {
    const el = document.getElementById('soul-seed-section');
    if (!el) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const last  = user.last_entry ? new Date(user.last_entry) : null;
    if (last) last.setHours(0,0,0,0);
    const daysSince = last ? Math.round((today - last) / 86400000) : Infinity;
    const withered  = daysSince >= 2;
    const streak    = user.streak || 0;

    const STAGES = [
      { min:0,  icon:'🌰',   name:'Hạt giống',    desc:'Viết nhật ký hôm nay để gieo hạt!' },
      { min:1,  icon:'🌱',   name:'Mầm non',      desc:'Một mầm xanh đã nhô lên' },
      { min:3,  icon:'🌿',   name:'Cây non',      desc:'Cây đang lớn dần mỗi ngày' },
      { min:7,  icon:'🌳',   name:'Cây xanh tốt', desc:'Một cái cây vững chắc' },
      { min:14, icon:'🌳🌸', name:'Cây ra hoa',   desc:'Những bông hoa đầu tiên đã nở' },
      { min:30, icon:'🌳🌺', name:'Cây nở rộ',    desc:'Cây cổ thụ rực rỡ sắc hoa' },
    ];
    const stage = withered
      ? { icon:'🥀', name:'Cây đang héo', desc:`Đã ${daysSince} ngày chưa viết — hãy tưới nước cho cây nào!` }
      : [...STAGES].reverse().find(s => streak >= s.min) || STAGES[0];

    el.style.display = '';
    el.innerHTML = `
      <div class="soul-seed-card ${withered ? 'withered' : ''}">
        <div class="soul-seed-icon">${stage.icon}</div>
        <div>
          <div class="soul-seed-name">${stage.name}</div>
          <div class="soul-seed-desc">${stage.desc}</div>
        </div>
      </div>`;
  }

  // ── Weekly recap ─────────────────────────────────────────────────────
  function renderWeeklyRecap(stats14) {
    const el = document.getElementById('weekly-recap');
    if (!el) return;
    const now = new Date();
    const thisWeek = [], lastWeek = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const row = stats14.find(s => s.entry_date && s.entry_date.startsWith(ds)) || null;
      if (i < 7) thisWeek.push(row); else lastWeek.push(row);
    }
    const thisDays  = thisWeek.filter(Boolean).length;
    const thisMoods = thisWeek.filter(Boolean).map(r => r.avg_mood);
    const lastMoods = lastWeek.filter(Boolean).map(r => r.avg_mood);
    const thisAvg   = thisMoods.length ? (thisMoods.reduce((a,b) => a+b, 0) / thisMoods.length) : null;
    const lastAvg   = lastMoods.length ? (lastMoods.reduce((a,b) => a+b, 0) / lastMoods.length) : null;
    const tagFreq   = {};
    thisWeek.filter(Boolean).forEach(r => {
      if (r.all_tags) r.all_tags.split('|').filter(Boolean).forEach(t => { tagFreq[t] = (tagFreq[t]||0)+1; });
    });
    const topTags = Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t);
    let trendHtml = '';
    let diff = null;
    if (thisAvg !== null && lastAvg !== null) {
      diff = thisAvg - lastAvg;
      if (diff > 0.3)       trendHtml = `<span class="trend-up">↑ +${diff.toFixed(1)}</span>`;
      else if (diff < -0.3) trendHtml = `<span class="trend-down">↓ ${diff.toFixed(1)}</span>`;
      else                  trendHtml = `<span class="trend-same">→ ổn định</span>`;
    }
    lastWeeklySummary = { thisDays, thisAvg, diff, topTags };
    el.innerHTML = `
      <div class="weekly-recap-card">
        <div class="recap-header">
          <span class="recap-title">📊 Tổng kết tuần này</span>
          <span class="recap-sub">7 ngày gần nhất</span>
        </div>
        <div class="recap-stats-row">
          <div class="recap-stat">
            <div class="recap-val">${thisDays}<span style="font-size:13px">/7</span></div>
            <div class="recap-lbl">Ngày ghi nhật ký</div>
          </div>
          <div class="recap-stat">
            <div class="recap-val">${thisAvg !== null ? thisAvg.toFixed(1) : '—'} ${trendHtml}</div>
            <div class="recap-lbl">Tâm trạng TB</div>
          </div>
          <div class="recap-stat">
            <div class="recap-val" style="font-size:14px">${topTags.length ? topTags.map(t=>t.split(' ')[0]).join(' ') : '—'}</div>
            <div class="recap-lbl">Cảm xúc chính</div>
          </div>
        </div>
        ${thisDays === 0 ? '<div style="text-align:center;font-size:12px;color:#14532d;margin-top:8px;padding:8px;background:rgba(255,255,255,.5);border-radius:8px">Tuần này chưa có nhật ký nào — hãy bắt đầu hôm nay! 🌱</div>' : ''}
        <div id="ai-insight-box"></div>
        ${window.FEATURES && window.FEATURES.mood_wrapped_card && thisDays > 0
          ? '<button class="btn-outline" style="width:100%;margin-top:10px;font-size:13px" onclick="App.shareMoodWrapped()">📸 Tạo thẻ chia sẻ tâm trạng</button>'
          : ''}
      </div>`;
  }

  // ── Mood Wrapped — thẻ ảnh tổng kết tâm trạng tuần, vẽ bằng canvas, chỉ lưu/chia sẻ ──
  // máy người dùng, KHÔNG upload lên server (không tốn dung lượng DB).
  function shareMoodWrapped() {
    if (!lastWeeklySummary || !lastWeeklySummary.thisDays) {
      showToast('Chưa có dữ liệu tuần này để tạo thẻ.');
      return;
    }
    const { thisDays, thisAvg, diff, topTags } = lastWeeklySummary;
    const user = Auth.getUser();
    const moodRounded = thisAvg !== null ? Math.max(1, Math.min(10, Math.round(thisAvg))) : 5;
    const mood = MOOD_DATA[moodRounded];

    const W = 720, H = 960;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, mood.color);
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText('SOUL DIARY · TỔNG KẾT TUẦN', W/2, 90);

    ctx.font = '120px system-ui, sans-serif';
    ctx.fillText(mood.emoji, W/2, 280);

    ctx.fillStyle = '#fff';
    ctx.font = '700 56px system-ui, sans-serif';
    ctx.fillText(thisAvg !== null ? thisAvg.toFixed(1) : '—', W/2, 380);
    ctx.font = '400 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText('điểm tâm trạng trung bình', W/2, 415);

    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`📅 ${thisDays}/7 ngày ghi nhật ký`, W/2, 480);

    if (diff !== null) {
      const trendTxt = diff > 0.3  ? `↑ Cải thiện +${diff.toFixed(1)} so với tuần trước`
        :              diff < -0.3 ? `↓ Giảm ${diff.toFixed(1)} so với tuần trước`
        :                            '→ Ổn định so với tuần trước';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillText(trendTxt, W/2, 525);
    }

    if (topTags.length) {
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Cảm xúc nổi bật: ${topTags.join('  ')}`, W/2, 575);
    }

    ctx.font = '400 16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillText(`${user?.full_name || 'Một người viết nhật ký'} · ${new Date().toLocaleDateString('vi-VN')}`, W/2, H-50);

    canvas.toBlob(blob => {
      const file = new File([blob], 'soul-diary-tuan.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Soul Diary', text: 'Tổng kết tâm trạng tuần này của tôi 🌱' }).catch(() => {});
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'soul-diary-tuan.png';
        a.click();
        showToast('📥 Đã lưu ảnh chia sẻ!');
      }
    }, 'image/png');
  }

  // ── Badges ───────────────────────────────────────────────────────────
  const BADGE_DEFS = [
    { id:'first_step',  icon:'🌱', name:'Bước đầu tiên',   desc:'Viết nhật ký đầu tiên',      check:(u,tot,ent)=>tot>=1 },
    { id:'storyteller', icon:'📖', name:'Người kể chuyện', desc:'10 nhật ký đã ghi',           check:(u,tot,ent)=>tot>=10 },
    { id:'explorer',    icon:'📚', name:'Nhà thám hiểm',   desc:'50 nhật ký đã ghi',           check:(u,tot,ent)=>tot>=50 },
    { id:'centurion',   icon:'💯', name:'Kỷ lục 100',      desc:'100 nhật ký đã ghi',          check:(u,tot,ent)=>tot>=100 },
    { id:'week_fire',   icon:'🔥', name:'Tuần lửa',        desc:'7 ngày liên tiếp',            check:(u,tot,ent)=>(u.max_streak||0)>=7 },
    { id:'half_month',  icon:'⭐', name:'Nửa tháng',       desc:'14 ngày liên tiếp',           check:(u,tot,ent)=>(u.max_streak||0)>=14 },
    { id:'one_month',   icon:'🌙', name:'Một tháng',       desc:'30 ngày liên tiếp',           check:(u,tot,ent)=>(u.max_streak||0)>=30 },
    { id:'resilient',   icon:'💪', name:'Kiên cường',      desc:'Viết khi tâm trạng ≤ 3',      check:(u,tot,ent)=>ent.some(e=>e.mood_score<=3) },
    { id:'bright_day',  icon:'😊', name:'Ngày rực rỡ',     desc:'Đạt tâm trạng 9–10',          check:(u,tot,ent)=>ent.some(e=>e.mood_score>=9) },
  ];

  function renderBadges(user, totalEntries, entries) {
    const labelEl = document.getElementById('badges-label');
    const gridEl  = document.getElementById('badges-grid');
    if (!gridEl) return;
    const badges = BADGE_DEFS.map(b => ({ ...b, earned: b.check(user, totalEntries, entries) }));
    const earnedCount = badges.filter(b=>b.earned).length;
    if (labelEl) {
      labelEl.style.display = '';
      labelEl.textContent = `Huy hiệu của bạn (${earnedCount}/${badges.length})`;
    }
    gridEl.innerHTML = badges.map(b => `
      <div class="badge-item ${b.earned ? 'earned' : 'locked'}" title="${b.desc}">
        <span class="badge-icon">${b.icon}</span>
        <span class="badge-name">${b.name}</span>
      </div>`).join('');
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('vi-VN',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  function showToast(msg) {
    const t=document.getElementById('toast');
    t.textContent=msg; t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'),3500);
  }

  // ── Feature flags — tải tại khởi động, các tính năng mới dùng window.FEATURES.xxx ──
  async function loadFeatures() {
    try {
      const data = await API.getFeatures();
      window.FEATURES = {};
      (data.features || []).forEach(f => { window.FEATURES[f.key] = !!f.enabled; });
    } catch(e) { window.FEATURES = {}; }
    window.CURRENT_VERSION = computeCurrentVersion();
  }

  // Phiên bản hiện tại = mốc cao nhất trong VERSION_LADDER mà TẤT CẢ flag của nó đã bật
  // (mốc không có flags coi như baseline, luôn tính là active).
  function computeCurrentVersion() {
    let current = VERSION_LADDER[0];
    for (const v of VERSION_LADDER) {
      const allOn = v.flags.length === 0 || v.flags.every(k => window.FEATURES && window.FEATURES[k]);
      if (allOn) current = v;
    }
    return current;
  }

  // ── Init ─────────────────────────────────────────────────────────────
  async function init() {
    document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>nav(btn.dataset.page)));
    const navAdmin = document.getElementById('nav-admin');
    if (navAdmin) navAdmin.style.display = (Auth.getUser()?.role === 'admin') ? '' : 'none';
    document.getElementById('close-breath-modal').addEventListener('click',closeBreathModal);
    document.getElementById('breath-start-btn').addEventListener('click',startBreathing);
    document.getElementById('breath-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeBreathModal();});
    document.getElementById('close-box-breath-modal').addEventListener('click',closeBoxBreathModal);
    document.getElementById('box-breath-start-btn').addEventListener('click',startBoxBreathing);
    document.getElementById('box-breath-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeBoxBreathModal();});
    document.getElementById('close-letter-modal').addEventListener('click',()=>closeLetterModal());
    document.getElementById('letter-burn-btn').addEventListener('click',burnLetter);
    document.getElementById('letter-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeLetterModal(e);});
    document.getElementById('close-evidence-modal').addEventListener('click',()=>closeEvidenceModal());
    document.getElementById('evidence-done-btn').addEventListener('click',finishEvidenceTesting);
    document.getElementById('evidence-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeEvidenceModal(e);});
    document.getElementById('article-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeArticleModal();});
    document.getElementById('entry-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeEntryModal();});
    document.getElementById('photo-lightbox').addEventListener('click',e=>{if(e.target===e.currentTarget)closeLightbox();});
    await loadFeatures();
    loadInboxBadge();
    const navCheckin = document.getElementById('nav-checkin');
    if (navCheckin && window.FEATURES && window.FEATURES.weekly_checkin) {
      navCheckin.style.display = '';
      refreshCheckinBadge();
    }
    nav('dashboard');
  }

  return {init,nav,saveDiaryEntry,deleteEntry,toggleTag,renderChart,filterArticles,openArticle,closeArticleModal,openBreathModal,closeStreakModal,closeLowMoodAlert,navToSOS,readInboxMsg,handlePhotoUpload,removePhoto,toggleRecording,loadMusicMood,toggleTrack,enablePush,disablePush,setDiaryMode,startCheckin,selectCheckinAnswer,openEntry,closeEntryModal,openLightbox,closeLightbox,openBoxBreathModal,closeBoxBreathModal,openLetterModal,closeLetterModal,burnLetter,openEvidenceModal,closeEvidenceModal,finishEvidenceTesting,openAboutModal,closeAboutModal,switchChartView,calendarMonthNav,refreshDailyPrompt,suggestAmbienceMusic,shareMoodWrapped};
})();
