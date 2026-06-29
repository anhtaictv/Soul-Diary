// js/app.js — Soul Diary App Controller
const App = (() => {

  let selectedMood  = 5;
  let selectedTags  = [];
  let currentChart  = null;
  let breathTimeout = null;
  let breathCycles  = 0;
  let boxBreathTimeout = null;
  let boxBreathCycles  = 0;
  let pmrInterval   = null; let pmrGroupIdx = 0; let pmrPhaseIdx = 0; let pmrCountdown = 0;
  let scanInterval  = null; let scanZoneIdx = 0;  let scanCountdown = 0;
  let groundingStep = 0;    let groundingChecked = [];
  let gratStep      = 0;
  let cachedEntries = [];
  let isRecording   = false;
  let mediaRecorder = null;
  let audioChunks   = [];
  let recordInterval= null;
  let recordSeconds = 0;
  let recordedAudioData = null;   // data URI base64 của bản ghi âm hiện tại — gửi kèm khi lưu nhật ký
  let MAX_RECORD_SECONDS = 30;  // được cập nhật theo flag long_recording khi init
  let uploadedPhotos= [];
  let lastWeeklySummary = null; // { thisDays, thisAvg, diff, topTags } — dữ liệu tuần gần nhất, dùng để vẽ thẻ Mood Wrapped
  let musicTracks     = [];
  let nowPlaying      = null;   // { id, name, artist, image, audio, duration } | null — bài đang phát, theo dõi bằng id ổn định (không phải index, vì musicTracks bị nạp lại mỗi lần đổi mood)
  let currentMood     = 'chill';
  let musicAudioBound = false;
  const musicCache    = {};     // { mood: tracks[] } — tránh gọi lại API Jamendo khi đổi mood qua lại
  let diaryMode = 'free';   // 'free' hoặc 'cbt' — chỉ hiệu lực khi cbt_guided_writing được bật
  let checkinAnswers = [];  // mảng 31 phần tử của bài Check-in Sức khỏe Tinh thần đang làm dở
  let calendarMonth   = new Date(); // tháng đang xem ở Bản đồ thời tiết tâm hồn (mood_calendar)
  let heatmapYear      = new Date().getFullYear(); // năm đang xem ở Heatmap cảm xúc
  let pendingMusicMood = null;      // mood chờ tự phát khi chuyển sang trang Nhạc (mood_ambience)
  let challengeList    = [];        // cache danh sách thử thách
  let communityPage    = 1;         // trang hiện tại của góc tâm sự
  let communityMoodTag = null;      // mood tag đang chọn khi đăng bài
  let notifDays        = [];        // ngày trong tuần đang bật nhắc nhở

  // ── Navigation ──────────────────────────────────────────────────────
  function nav(page) {
    // Lưu ý: KHÔNG dừng nhạc ở đây — thẻ <audio id="music-audio"> nằm ngoài #main-content
    // (xem index.html) nên nó không bị huỷ khi đổi trang, nhạc tiếp tục phát xuyên suốt SPA.
    if (!PAGES[page]) { console.error('Trang không tồn tại:', page); return; }
    startProgress();
    try {
      document.getElementById('main-content').innerHTML = PAGES[page]();
    } catch(e) {
      console.error('Lỗi render trang', page, e);
      doneProgress();
      return;
    }
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    document.querySelector('.nav-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'instant' });
    doneProgress();
    switch (page) {
      case 'dashboard': initDashboard();              break;
      case 'diary':     initDiaryPage();              break;
      case 'chart':
        calendarMonth = new Date();
        heatmapYear   = new Date().getFullYear();
        setTimeout(() => {
          renderStreakCalendar('chart-streak-calendar');
          renderChart(14);
          const hasCal     = !!(window.FEATURES && window.FEATURES.mood_calendar);
          const hasHeatmap = !!(window.FEATURES && window.FEATURES.mood_heatmap);
          const hasRadar   = !!(window.FEATURES && window.FEATURES.ai_emotion_analysis);
          const toggle     = document.getElementById('chart-view-toggle');
          if (toggle) toggle.style.display = (hasCal || hasHeatmap || hasRadar) ? '' : 'none';
          const calBtn    = document.getElementById('chart-view-btn-calendar');
          const hmBtn     = document.getElementById('chart-view-btn-heatmap');
          const radarBtn  = document.getElementById('chart-view-btn-radar');
          if (calBtn)   calBtn.style.display   = hasCal     ? '' : 'none';
          if (hmBtn)    hmBtn.style.display    = hasHeatmap ? '' : 'none';
          if (radarBtn) radarBtn.style.display = hasRadar   ? '' : 'none';
        }, 80);
        break;
      case 'library':   initLibrary(); break;
      case 'exercises': renderExercises();            break;
      case 'music':     initMusicPage();              break;
      case 'checkin':    initCheckinPage();        break;
      case 'inbox':      initInboxPage();          break;
      case 'challenges': initChallengePage();      break;
      case 'community':  initCommunityPage();      break;
      case 'settings':    initSettingsPage();       break;
      case 'sos':         renderSOSContacts();      break;
      case 'admin':       Admin.initPage();         break;
      case 'chat':        initChatPage();           break;
      case 'study':       initStudyPage();          break;
      case 'courses':     initCoursesPage();        break;
      case 'goals':         initGoalsPage();          break;
      case 'year-review':   initYearReviewPage();     break;
      case 'future-letter': initFutureLetterPage();   break;
      case 'missions':      initMissionsPage();        break;
      case 'friends':       initFriendsPage();         break;
      case 'templates':     initTemplatesPage();       break;
      case 'report':        initReportPage();          break;
      case 'reflection':    initReflectionPage();      break;
      case 'habits':        initHabitsPage();          break;
      case 'pomodoro':      initPomodoroPage();        break;
      case 'year-stats':    initYearStatsPage();       break;
      case 'gallery':       initGalleryPage();         break;
      case 'notes':         initNotesPage();           break;
      case 'mood-compare':    initMoodComparePage();       break;
      case 'notifications':   initNotificationsPage();    break;
      case 'profile':         initProfilePage();           break;
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
    // #6 skeleton stat cards while data loads
    ['dash-entries','dash-avg','dash-streak','dash-today'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span class="skeleton" style="display:inline-block;width:38px;height:22px;border-radius:4px"></span>';
    });
    // allSettled để 1 call thất bại không crash cả dashboard
    const [entriesSettled, userSettled, statsSettled] = await Promise.allSettled([
      API.getDiary(1,20), API.getMe(), API.getStats(14)
    ]);

    // ── User info (quan trọng nhất) ──
    const user = userSettled.status === 'fulfilled' ? userSettled.value.user : Auth.getUser();
    if (user) {
      Auth.updateSidebarUser(user);
      localStorage.setItem('nhk_user', JSON.stringify(user));
    }

    // ── Entries ──
    const entriesRes = entriesSettled.status === 'fulfilled' ? entriesSettled.value : null;
    cachedEntries = entriesRes ? (entriesRes.entries || []) : [];
    const totalEntries = entriesRes ? entriesRes.pagination.total : 0;
    const recent7    = cachedEntries.slice(0,7);
    const avg        = recent7.length ? (recent7.reduce((a,e)=>a+e.mood_score,0)/recent7.length).toFixed(1) : '—';
    const today      = new Date().toDateString();
    const todayEntry = cachedEntries.find(e => new Date(e.created_at).toDateString() === today);

    const elEntries = document.getElementById('dash-entries');
    const elAvg     = document.getElementById('dash-avg');
    const elStreak  = document.getElementById('dash-streak');
    const elToday   = document.getElementById('dash-today');
    if (elEntries) { if (totalEntries) animateCount(elEntries, totalEntries); else elEntries.textContent = '—'; }
    if (elAvg)     elAvg.textContent = avg;
    if (elStreak)  animateCount(elStreak, user ? (user.streak || 0) : 0);
    if (elToday)   elToday.textContent = todayEntry ? (todayEntry.mood_score + '/10') : '—';

    renderStreakCalendar('streak-calendar-card');
    if (totalEntries) renderLevelBar(totalEntries);
    if (user && window.FEATURES && window.FEATURES.soul_seed) renderSoulSeed(user);
    renderRecommendations(todayEntry ? todayEntry.mood_score : null);
    initPushOptIn();
    if (user && window.FEATURES && window.FEATURES.custom_reminder) renderCustomReminderCard(user);

    // ── Stats (không bắt buộc) ──
    const statsRes = statsSettled.status === 'fulfilled' ? statsSettled.value : null;
    renderWeeklyRecap(statsRes ? (statsRes.stats || []) : []);
    loadAndRenderSmartRecap();
    if (user) renderBadges(user, totalEntries, cachedEntries);
    loadAndRenderMentalHealth();
    renderRecentEntries('dash-recent-entries', cachedEntries.slice(0,3));

    if (user && !todayEntry && (user.streak || 0) >= 3)
      setTimeout(() => showToast('⚠️ Chuỗi ' + user.streak + ' ngày sắp hết! Đừng quên ghi nhật ký hôm nay.'), 1500);

    // Quick mood log widget (v2.4)
    if (window.FEATURES && window.FEATURES.quick_mood_log) renderQuickMoodWidget(todayEntry);
    // Habit tracker widget (v2.5)
    if (window.FEATURES && window.FEATURES.habit_tracker) renderHabitDashboardWidget();
    // Pinned entries (v2.5)
    if (window.FEATURES && window.FEATURES.pinned_entries) renderPinnedEntries(cachedEntries);
    // Daily quote (v2.6)
    if (window.FEATURES && window.FEATURES.daily_quote) loadDailyQuote();
    // Ghi chú nhanh widget (v2.7)
    if (window.FEATURES && window.FEATURES.quick_notes) _loadNotesDashboardWidget();
    // Cảnh báo sức khỏe (v2.7)
    _checkWellnessAlert();
    // AI Coach Tuần (v3.0)
    if (window.FEATURES && window.FEATURES.ai_weekly_coach) loadAICoach();
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
    let cbtPreview = '';
    if (hasCbt) {
      try {
        const cbt = typeof e.cbt_data === 'string' ? JSON.parse(e.cbt_data) : e.cbt_data;
        if (cbt.event) cbtPreview = cbt.event;
      } catch {}
    }
    // v2.8: dùng has_photos/photo_count/has_audio thay vì binary
    const mediaHints = [];
    if (e.has_photos || (Array.isArray(e.photos) && e.photos.length)) {
      const cnt = e.photo_count || (Array.isArray(e.photos) ? e.photos.length : 0);
      mediaHints.push(`📷 ${cnt > 1 ? cnt + ' ảnh' : '1 ảnh'}`);
    }
    if (e.has_audio || e.audio_data) mediaHints.push('🎙 Ghi âm');
    return `<div class="entry-item" onclick="App.openEntry(${e.id})">
      <div class="entry-meta">
        <div class="mood-dot" style="background:${MOOD_DATA[e.mood_score].color}">${MOOD_DATA[e.mood_score].emoji}</div>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${MOOD_DATA[e.mood_score].label}${hasCbt ? ' <span class="cbt-entry-badge">🧠 CBT</span>' : ''}</div>
          <div class="entry-date">${formatDateRelative(e.created_at)}</div>
        </div>
        ${withDelete ? `<button onclick="event.stopPropagation();App.deleteEntry(${e.id},this)" data-tooltip="Xóa nhật ký" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-hint);padding:4px">🗑</button>` : ''}
      </div>
      ${(cbtPreview || e.event_text) ? `<div class="entry-preview">${_searchActive && _lastSearchQ ? _highlightTerm(cbtPreview || e.event_text, _lastSearchQ) : escapeHtml(cbtPreview || e.event_text)}</div>` : ''}
      ${tags.length ? `<div class="entry-tags">${tags.map(t=>`<span class="entry-tag">${t}</span>`).join('')}</div>` : ''}
      ${mediaHints.length ? `<div style="font-size:12px;color:var(--text-hint);margin-top:6px">${mediaHints.join(' · ')}</div>` : ''}
    </div>`;
  }

  // ── Xem chi tiết nhật ký đã lưu ──────────────────────────────────────
  async function openEntry(id) {
    const e = cachedEntries.find(x => x.id === id);
    if (!e) return;
    const tags = Array.isArray(e.tags) ? e.tags : (e.tags ? e.tags.split('|') : []);
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

    // v2.8 — lazy load media: nếu entry cũ đã có binary thì render luôn;
    // nếu entry mới chỉ có cờ has_photos/has_audio thì chèn placeholder và fetch sau
    const cachedPhotos = Array.isArray(e.photos) && e.photos.length > 0 ? e.photos : null;
    const cachedAudio  = e.audio_data || null;
    const needsLazy    = !cachedPhotos && !cachedAudio && (e.has_photos || e.has_audio);

    if (cachedAudio) {
      bodyHtml += `<audio controls src="${cachedAudio}" style="width:100%;margin-bottom:12px;height:36px"></audio>`;
    }
    if (cachedPhotos) {
      bodyHtml += `<div class="entry-photo-gallery">${cachedPhotos.map(p=>`<img src="${p}" class="entry-gallery-photo" loading="lazy" onclick="App.openLightbox(this.src)" />`).join('')}</div>`;
    }
    if (needsLazy) {
      bodyHtml += `<div id="entry-media-placeholder" style="text-align:center;color:var(--text-hint);padding:12px;font-size:13px">⏳ Đang tải media…</div>`;
    }

    if (!bodyHtml) bodyHtml = '<div style="color:var(--text-hint)">Không có nội dung.</div>';

    _shareEntryId = e.id;
    document.getElementById('entry-modal-title').innerHTML = `${MOOD_DATA[e.mood_score].emoji} ${MOOD_DATA[e.mood_score].label}`;
    document.getElementById('entry-modal-date').textContent = formatDate(e.created_at);
    document.getElementById('entry-modal-body').innerHTML = bodyHtml;
    const shareBtn = document.getElementById('entry-share-btn');
    if (shareBtn) shareBtn.style.display = (window.FEATURES && window.FEATURES.share_entry) ? '' : 'none';
    const pinBtn = document.getElementById('entry-pin-btn');
    if (pinBtn) {
      if (window.FEATURES && window.FEATURES.pinned_entries) {
        pinBtn.style.display = '';
        pinBtn.textContent = e.is_pinned ? '📌 Bỏ ghim' : '📌 Ghim';
        pinBtn.dataset.pinned = e.is_pinned ? '1' : '0';
      } else {
        pinBtn.style.display = 'none';
      }
    }
    document.getElementById('entry-modal').classList.add('open');

    // Tải binary media sau khi modal đã hiển thị
    if (needsLazy) {
      try {
        const full     = await API.getDiaryEntry(id);
        const fe       = full.entry;
        const photos   = Array.isArray(fe.photos) ? fe.photos : [];
        let mediaHtml  = '';
        if (fe.audio_data) {
          mediaHtml += `<audio controls src="${fe.audio_data}" style="width:100%;margin-bottom:12px;height:36px"></audio>`;
        }
        if (photos.length) {
          mediaHtml += `<div class="entry-photo-gallery">${photos.map(p=>`<img src="${p}" class="entry-gallery-photo" loading="lazy" onclick="App.openLightbox(this.src)" />`).join('')}</div>`;
        }
        if (!mediaHtml) mediaHtml = '';
        const ph = document.getElementById('entry-media-placeholder');
        if (ph) ph.outerHTML = mediaHtml;
      } catch {
        const ph = document.getElementById('entry-media-placeholder');
        if (ph) ph.textContent = '⚠️ Không tải được media.';
      }
    }
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

  // ── Share Entry ──────────────────────────────────────────────────────
  let _shareEntryId = null;

  async function shareCurrentEntry() {
    if (!_shareEntryId) return;
    const btn = document.getElementById('entry-share-btn');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }
    try {
      const d = await API.shareEntry(_shareEntryId);
      const origin = window.location.origin;
      const link = `${origin}/share/${d.token}`;
      document.getElementById('share-link-input').value = link;
      document.getElementById('share-modal').classList.add('open');
    } catch (err) {
      showToast('❌ ' + err.message);
    } finally {
      if (btn) { btn.textContent = '🔗 Chia sẻ'; btn.disabled = false; }
    }
  }

  function closeShareModal() {
    document.getElementById('share-modal').classList.remove('open');
  }

  function copyShareLink() {
    const inp = document.getElementById('share-link-input');
    if (!inp) return;
    navigator.clipboard.writeText(inp.value).then(() => showToast('✅ Đã sao chép liên kết!')).catch(() => {
      inp.select();
      document.execCommand('copy');
      showToast('✅ Đã sao chép!');
    });
  }

  async function revokeCurrentShare() {
    if (!_shareEntryId) return;
    if (!await showConfirm('Thu hồi chia sẻ? Liên kết cũ sẽ không còn hoạt động.', '🔒')) return;
    try {
      await API.revokeShare(_shareEntryId);
      closeShareModal();
      showToast('🔒 Đã thu hồi chia sẻ.');
    } catch (err) {
      showToast('❌ ' + err.message);
    }
  }

  // ── Diary ────────────────────────────────────────────────────────────

  // #4 Recent tags from cached entries
  function _renderRecentTags() {
    const el = document.getElementById('diary-recent-tags');
    if (!el) return;
    const tagCount = {};
    cachedEntries.forEach(e => {
      const tags = Array.isArray(e.tags) ? e.tags : (e.tags ? e.tags.split('|') : []);
      tags.forEach(t => { if (t) tagCount[t] = (tagCount[t] || 0) + 1; });
    });
    const top = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
    if (!top.length) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = '<span style="font-size:11px;color:var(--text-muted);margin-right:4px;align-self:center">Dùng lại:</span>' +
      top.map(t => `<span class="tag recent-tag" onclick="App._addRecentTag('${escapeHtml(t)}')">${escapeHtml(t)}</span>`).join('');
  }

  function _addRecentTag(tag) {
    if (selectedTags.includes(tag)) return;
    selectedTags.push(tag);
    const tagEl = document.querySelector(`#emotion-tags [data-tag="${tag}"]`);
    if (tagEl) tagEl.classList.add('sel');
    else showToast('💡 Tag đã được thêm: ' + tag);
  }

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
    if (textarea) {
      const counter = document.getElementById('diary-event-count');
      textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 380) + 'px';
        if (counter) {
          const len = this.value.length;
          const words = this.value.trim() ? this.value.trim().split(/\s+/).length : 0;
          counter.textContent = `${words} từ · ${len} / 5000 ký tự`;
          counter.className = 'char-counter' + (len > 4500 ? ' danger' : len > 4000 ? ' warn' : '');
        }
      });
    }
    // Hiện nút template nếu flag bật và user đã có template
    if (window.FEATURES && window.FEATURES.diary_templates) {
      API.getTemplates().then(d => {
        _cachedTemplates = d.templates;
        const btnWrap = document.getElementById('diary-template-btn-wrap');
        if (btnWrap) btnWrap.style.display = d.templates.length ? '' : 'none';
      }).catch(() => {});
    }
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
    // Hiện nút lọc nâng cao nếu flag bật (v3.0)
    if (window.FEATURES && window.FEATURES.advanced_search) {
      const advBtn = document.getElementById('adv-search-toggle-btn');
      if (advBtn) advBtn.style.display = '';
    }
    // Xuất nhật ký (diary_export flag)
    if (window.FEATURES && window.FEATURES.diary_export) {
      const exportSec = document.getElementById('diary-export-section');
      if (exportSec) {
        exportSec.style.display = '';
        const today = new Date().toISOString().split('T')[0];
        const jan1  = `${new Date().getFullYear()}-01-01`;
        const fromEl = document.getElementById('export-from');
        const toEl   = document.getElementById('export-to');
        if (fromEl && !fromEl.value) fromEl.value = jan1;
        if (toEl   && !toEl.value)   toEl.value   = today;
      }
    }
    // Debounced real-time search
    const _srchInput = document.getElementById('diary-search-input');
    if (_srchInput) {
      let _srchTimer = null;
      _srchInput.addEventListener('input', () => {
        clearTimeout(_srchTimer);
        if (!_srchInput.value.trim()) { clearSearch(); return; }
        _srchTimer = setTimeout(() => searchDiary(), 450);
      });
    }
    await loadDiaryEntries();
    _renderRecentTags();
    // Auto-focus textarea khi mở trang (chỉ trên desktop)
    if (window.innerWidth > 720) setTimeout(() => document.getElementById('diary-event')?.focus(), 80);
    // Auto-draft (v2.6)
    _checkDraft();
    _startAutoDraft();
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

  const DIARY_PAGE_SIZE = 5;
  let _diaryPage = 1;
  let _diaryTotal = 0;

  async function loadDiaryEntries(reset = true) {
    const el = document.getElementById('diary-entries-list');
    if (!el) return;
    if (reset) {
      _diaryPage = 1;
      el.innerHTML = Array(3).fill(0).map(() => `
        <div class="entry-item" style="pointer-events:none;gap:8px">
          <div class="skeleton" style="height:14px;width:55%;margin-bottom:8px"></div>
          <div class="skeleton" style="height:12px;width:80%;margin-bottom:6px"></div>
          <div class="skeleton" style="height:12px;width:38%"></div>
        </div>`).join('');
    }
    try {
      const res = await API.getDiary(_diaryPage, DIARY_PAGE_SIZE);
      const entries = res.entries || [];
      _diaryTotal = res.pagination?.total || 0;
      if (reset) cachedEntries = entries;
      else cachedEntries = [...cachedEntries, ...entries];
      if (!cachedEntries.length) {
        el.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">📖</div>
          <div class="empty-state-title">Chưa có nhật ký nào</div>
          <div class="empty-state-sub">Hôm nay bạn cảm thấy thế nào?<br>Chỉ vài dòng thôi — không cần hoàn hảo!</div>
          <button class="btn-primary" style="width:auto;padding:10px 24px" onclick="document.getElementById('diary-event')?.focus()">✍️ Viết nhật ký đầu tiên</button>
        </div>`;
        return;
      }
      const hasMore = cachedEntries.length < _diaryTotal;
      el.innerHTML = cachedEntries.map(e => entryHTML(e, true)).join('') +
        (hasMore ? `<button class="btn-load-more" onclick="App.loadMoreDiary()">Xem thêm (còn ${_diaryTotal - cachedEntries.length})</button>` : '');
    } catch(err) { el.innerHTML = `<div class="loading-text" style="color:var(--rose)">Lỗi: ${err.message}</div>`; }
  }

  async function loadMoreDiary() {
    _diaryPage++;
    await loadDiaryEntries(false);
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
        _showFieldError('cbt-event', 'Hãy điền ít nhất "Sự kiện" hoặc "Suy nghĩ"!');
        return;
      }
      cbt_data   = { event: cbtEvent, thoughts: cbtThoughts, feelings: cbtFeelings, behavior: cbtBehavior };
      event_text = cbtEvent || cbtThoughts;
    } else {
      event_text = document.getElementById('diary-event')?.value.trim() || '';
      if (!event_text) { _showFieldError('diary-event', 'Hãy viết ít nhất một dòng nhật ký!'); return; }
    }

    const btn = document.getElementById('btn-save-diary');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Đang lưu...';
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
      // #2: save success pulse on form card
      const card = document.getElementById('diary-form-card');
      if (card) { card.classList.add('save-success-flash'); setTimeout(() => card.classList.remove('save-success-flash'), 700); }
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
      if (selectedMood <= 6 && window.FEATURES && window.FEATURES.exercise_suggest) {
        setTimeout(() => _showExerciseSuggest(selectedMood), 1000);
      }
      _clearDraft();
      await loadDiaryEntries();
      showToast('✅ Đã lưu nhật ký!');
    } catch(err) { showToast('❌ Lỗi lưu nhật ký: '+err.message); }
    finally { btn.disabled = false; btn.innerHTML = '💾 Lưu nhật ký'; }
  }

  async function deleteEntry(id, btn) {
    if (!await showConfirm('Xóa nhật ký này? Hành động không thể hoàn tác.', '🗑️')) return;
    // #5 animate out the entry row before actually deleting
    const row = btn?.closest('.entry-item');
    if (row) { row.classList.add('deleting'); await new Promise(r => setTimeout(r, 240)); }
    btn.textContent = '...';
    try { await API.deleteEntry(id); await loadDiaryEntries(); showToast('🗑 Đã xóa.'); }
    catch(err) { if (row) row.classList.remove('deleting'); showToast('❌ Không thể xóa: '+err.message); }
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

  // ── Bản đồ thời tiết tâm hồn (Mood Calendar) + Heatmap năm ─────────────
  function switchChartView(view, btn) {
    document.querySelectorAll('#chart-view-toggle .tag').forEach(b => b.classList.remove('sel'));
    (btn || document.getElementById(`chart-view-btn-${view}`))?.classList.add('sel');
    const lineEl    = document.getElementById('chart-line-section');
    const calEl     = document.getElementById('mood-calendar-section');
    const heatmapEl = document.getElementById('mood-heatmap-section');
    const radarEl   = document.getElementById('emotion-radar-section');
    if (lineEl)    lineEl.style.display    = view === 'chart'    ? '' : 'none';
    if (calEl)     calEl.style.display     = view === 'calendar' ? '' : 'none';
    if (heatmapEl) heatmapEl.style.display = view === 'heatmap'  ? '' : 'none';
    if (radarEl)   radarEl.style.display   = view === 'radar'    ? '' : 'none';
    if (view === 'calendar') renderMoodCalendar();
    if (view === 'heatmap')  renderHeatmap();
    if (view === 'radar')    renderEmotionRadar();
  }

  let _radarChart = null;
  async function renderEmotionRadar() {
    const canvas   = document.getElementById('emotionRadarChart');
    const emptyEl  = document.getElementById('emotion-radar-empty');
    if (!canvas) return;
    try {
      const { emotions, entryCount } = await API.getEmotionRadar();
      if (!emotions || !emotions.length) {
        canvas.style.display  = 'none';
        if (emptyEl) emptyEl.style.display = '';
        return;
      }
      canvas.style.display  = '';
      if (emptyEl) emptyEl.style.display = 'none';
      if (_radarChart) { _radarChart.destroy(); _radarChart = null; }
      const labels = emotions.map(e => e.name);
      const data   = emotions.map(e => e.avgPercent);
      const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563eb';
      _radarChart = new Chart(canvas, {
        type: 'radar',
        data: {
          labels,
          datasets: [{
            label: 'Tỉ lệ cảm xúc (%)',
            data,
            backgroundColor: primary + '33',
            borderColor:     primary,
            borderWidth: 2,
            pointBackgroundColor: primary,
            pointRadius: 4,
          }],
        },
        options: {
          responsive: true,
          scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20, font: { size: 11 } } } },
          plugins: { legend: { display: false } },
        },
      });
    } catch (err) {
      if (emptyEl) { emptyEl.style.display = ''; canvas.style.display = 'none'; }
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

  // ── Heatmap cảm xúc năm ─────────────────────────────────────────────
  async function renderHeatmap() {
    const grid  = document.getElementById('heatmap-grid');
    const label = document.getElementById('heatmap-year-label');
    if (!grid) return;
    if (label) label.textContent = heatmapYear;
    grid.innerHTML = '<div class="loading-text">Đang tải...</div>';
    try {
      const data   = await API.getHeatmap(heatmapYear);
      const dayMap = {};
      (data.days || []).forEach(d => {
        const key = (d.entry_date || '').split('T')[0];
        dayMap[key] = d;
      });

      // Tính ngày bắt đầu grid (Chủ nhật của tuần chứa 1/1)
      const jan1    = new Date(heatmapYear, 0, 1);
      const gridStart = new Date(jan1);
      gridStart.setDate(gridStart.getDate() - jan1.getDay());

      // Build weeks
      const weeks = [];
      const cur   = new Date(gridStart);
      while (true) {
        const week = [];
        for (let d = 0; d < 7; d++) {
          const iso    = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
          const inYear = cur.getFullYear() === heatmapYear;
          week.push({ iso, inYear, data: inYear ? (dayMap[iso] || null) : null });
          cur.setDate(cur.getDate() + 1);
        }
        weeks.push(week);
        // Dừng sau khi đi qua hết năm
        if (cur.getFullYear() > heatmapYear) break;
      }

      const MONTH_VI = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
      let lastMonth = -1;
      const monthMarks = [];
      weeks.forEach((week, wi) => {
        const first = week.find(d => d.inYear);
        if (first) {
          const mo = new Date(first.iso).getMonth();
          if (mo !== lastMonth) { lastMonth = mo; monthMarks.push({ wi, label: MONTH_VI[mo] }); }
        }
      });

      // Render
      const cellW = 14; // px (cell 12 + gap 2)
      let html = `<div class="hm-wrap">`;
      // Month labels
      html += `<div class="hm-months" style="width:${weeks.length * cellW + 28}px">`;
      monthMarks.forEach(m => {
        html += `<span class="hm-month-label" style="left:${28 + m.wi * cellW}px">${m.label}</span>`;
      });
      html += `</div>`;
      // Grid: day-of-week labels + columns
      html += `<div class="hm-grid">`;
      html += `<div class="hm-day-labels"><span></span><span>T2</span><span></span><span>T4</span><span></span><span>T6</span><span></span></div>`;
      html += `<div class="hm-cols">`;
      weeks.forEach(week => {
        html += `<div class="hm-col">`;
        week.forEach(day => {
          if (!day.inYear) {
            html += `<span class="hm-cell hm-empty"></span>`;
          } else if (!day.data) {
            html += `<span class="hm-cell hm-none" title="${day.iso}"></span>`;
          } else {
            const m   = Math.round(day.data.avg_mood * 10) / 10;
            const cls = m >= 9 ? 'hm-9-10' : m >= 7 ? 'hm-7-8' : m >= 5 ? 'hm-5-6' : 'hm-1-4';
            html += `<span class="hm-cell ${cls}" title="${day.iso}: ${m}/10 (${day.data.entry_count} nhật ký)"></span>`;
          }
        });
        html += `</div>`;
      });
      html += `</div></div></div>`;
      grid.innerHTML = html;
    } catch (e) {
      grid.innerHTML = `<div class="loading-text" style="color:var(--rose)">Lỗi: ${e.message}</div>`;
    }
  }

  function heatmapYearNav(delta) {
    const next = heatmapYear + delta;
    if (next > new Date().getFullYear()) return;
    heatmapYear = next;
    renderHeatmap();
  }

  // ── Xuất nhật ký ─────────────────────────────────────────────────────
  async function exportDiaryCSV() {
    const from = document.getElementById('export-from')?.value;
    const to   = document.getElementById('export-to')?.value;
    if (!from || !to) return showToast('Vui lòng chọn khoảng thời gian!');
    if (from > to)    return showToast('Ngày bắt đầu phải trước ngày kết thúc!');
    try {
      showToast('Đang xuất dữ liệu...');
      const token = Auth.getToken();
      const resp  = await fetch(`${CONFIG.API_URL}/diary/export?format=csv&from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('Lỗi xuất dữ liệu');
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `souldiary-${from}-den-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
      showToast('✅ Đã xuất CSV!');
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function printDiaryPDF() {
    const from = document.getElementById('export-from')?.value;
    const to   = document.getElementById('export-to')?.value;
    if (!from || !to) return showToast('Vui lòng chọn khoảng thời gian!');
    try {
      showToast('Đang chuẩn bị...');
      const token = Auth.getToken();
      const resp  = await fetch(`${CONFIG.API_URL}/diary/export?format=json&from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data    = await resp.json();
      if (!resp.ok) throw new Error(data.message || `Lỗi ${resp.status}`);
      const entries = data.entries || [];
      const EMOJIS  = ['','😢','😟','😕','😞','😐','🙂','😊','😄','🌟','✨'];
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Soul Diary — Nhật ký của tôi</title>
        <style>
          body{font-family:sans-serif;max-width:700px;margin:0 auto;padding:24px;color:#1f2937}
          h1{text-align:center;color:#6366f1;margin-bottom:4px}
          .sub{text-align:center;color:#6b7280;margin-bottom:24px;font-size:14px}
          .entry{border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:14px;page-break-inside:avoid}
          .eh{display:flex;align-items:center;gap:10px;margin-bottom:8px}
          .ed{font-weight:700;color:#6366f1}.em{font-size:22px}.et{color:#6b7280;font-size:13px;margin-left:4px}
          .lbl{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin:8px 0 3px}
          .txt{color:#374151;line-height:1.6;white-space:pre-wrap;font-size:14px}
          @media print{body{padding:0}h1{margin-top:0}}
        </style></head><body>
        <h1>📖 Nhật ký Soul Diary</h1>
        <div class="sub">Từ ${from} đến ${to} — ${entries.length} nhật ký</div>
        ${entries.map(e => `
          <div class="entry">
            <div class="eh"><span class="em">${EMOJIS[e.mood_score]||''}</span>
              <div><span class="ed">${escapeHtml(e.entry_date||'')}</span><span class="et">${escapeHtml(e.entry_time||'')} — ${e.mood_score}/10</span></div></div>
            ${e.event_text ? `<div class="lbl">Sự kiện / Cảm xúc</div><div class="txt">${escapeHtml(e.event_text)}</div>` : ''}
            ${e.thoughts   ? `<div class="lbl">Suy nghĩ</div><div class="txt">${escapeHtml(e.thoughts)}</div>` : ''}
            ${e.gratitude  ? `<div class="lbl">Lòng biết ơn</div><div class="txt">${escapeHtml(e.gratitude)}</div>` : ''}
          </div>`).join('')}
      </body></html>`;
      const w = window.open('', '_blank');
      w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 400);
    } catch (e) { showToast('❌ ' + e.message); }
  }

  // ── Nhắc nhở tùy chỉnh ───────────────────────────────────────────────
  function renderCustomReminderCard(user) {
    const sec = document.getElementById('custom-reminder-section');
    if (!sec) return;
    notifDays = user.notif_days ? user.notif_days.split(',').map(Number) : [];
    const DAYS = [
      {d:1,l:'T2'},{d:2,l:'T3'},{d:3,l:'T4'},{d:4,l:'T5'},{d:5,l:'T6'},{d:6,l:'T7'},{d:0,l:'CN'},
    ];
    const hour = user.notif_hour !== null && user.notif_hour !== undefined ? user.notif_hour : '';
    const options = Array.from({length:24}, (_,h) => `<option value="${h}" ${h==hour?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('');
    sec.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div style="font-size:14px;font-weight:700;margin-bottom:10px">⏰ Tùy chỉnh giờ nhắc nhở</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Hệ thống sẽ gửi push notification vào giờ bạn chọn. Nếu không chọn, hệ thống tự tính theo thói quen viết nhật ký.</div>
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">Giờ nhắc nhở</div>
            <select class="text-input" id="notif-hour-select" style="padding:8px 10px;font-size:13px;max-width:120px">
              <option value="">Tự động</option>${options}
            </select>
          </div>
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">Ngày trong tuần (bỏ trống = tất cả ngày)</div>
            <div id="notif-days-row" style="display:flex;gap:6px;flex-wrap:wrap">
              ${DAYS.map(({d,l}) => `<button class="tag ${notifDays.includes(d)?'sel':''}" onclick="App.toggleNotifDay(this,${d})" data-day="${d}">${l}</button>`).join('')}
            </div>
          </div>
        </div>
        <button class="btn-primary" onclick="App.saveNotifPrefs()" style="margin-top:14px;max-width:180px;font-size:13px">💾 Lưu cài đặt</button>
      </div>
    `;
  }

  function toggleNotifDay(btn, day) {
    day = parseInt(day);
    btn.classList.toggle('sel');
    if (notifDays.includes(day)) notifDays = notifDays.filter(d => d !== day);
    else notifDays.push(day);
  }

  async function saveNotifPrefs() {
    const hourEl = document.getElementById('notif-hour-select');
    const hour   = hourEl && hourEl.value !== '' ? parseInt(hourEl.value) : null;
    const days   = notifDays.length ? notifDays.join(',') : null;
    try {
      await API.updateNotifPrefs(hour, days);
      showToast('✅ Đã lưu cài đặt nhắc nhở!');
    } catch (e) { showToast('❌ ' + e.message); }
  }

  // ── Thử thách Sức khỏe Tâm thần ─────────────────────────────────────
  async function initChallengePage() {
    try {
      const data = await API.getChallenges();
      challengeList = data.challenges || [];
      renderChallenges();
    } catch (e) { showToast('❌ Lỗi tải thử thách: ' + e.message); }
  }

  function renderChallenges() {
    const listEl   = document.getElementById('challenges-list');
    const activeEl = document.getElementById('active-challenge-section');
    if (!listEl) return;

    const active    = challengeList.find(c => c.is_joined && !c.is_completed);
    const today     = new Date().toDateString();

    if (active && activeEl) {
      const tasks    = JSON.parse(active.tasks_json || '[]');
      const task     = tasks[active.current_day] || '🎉 Bạn đã hoàn thành!';
      const pct      = Math.round(active.current_day / active.duration_days * 100);
      const lastDate = active.last_checkin_at ? new Date(active.last_checkin_at).toDateString() : null;
      const canCheckin = lastDate !== today;
      activeEl.style.display = '';
      activeEl.innerHTML = `
        <div class="card challenge-active-card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <span style="font-size:32px">${active.badge_emoji}</span>
            <div>
              <div style="font-size:15px;font-weight:700">${active.title}</div>
              <div style="font-size:12px;color:var(--text-muted)">Ngày ${active.current_day}/${active.duration_days}</div>
            </div>
          </div>
          <div class="challenge-progress-wrap"><div class="challenge-progress-fill" style="width:${pct}%"></div></div>
          <div class="challenge-task-box">
            <div class="challenge-task-label">📋 Nhiệm vụ hôm nay — Ngày ${active.current_day + 1}</div>
            <div class="challenge-task-text">${task}</div>
          </div>
          ${canCheckin
            ? `<button class="btn-primary" style="margin-top:14px;max-width:240px" onclick="App.doChallengeCheckin(${active.id})">✅ Đã làm xong hôm nay</button>`
            : `<div style="color:#10b981;font-size:13px;margin-top:12px;font-weight:600">✅ Đã check-in hôm nay — quay lại ngày mai!</div>`}
          <div><button onclick="App.quitChallenge(${active.id})" style="background:none;border:none;color:var(--text-muted);font-size:12px;cursor:pointer;margin-top:10px;padding:0;text-decoration:underline">Bỏ thử thách này</button></div>
        </div>
      `;
    } else if (activeEl) { activeEl.style.display = 'none'; }

    listEl.innerHTML = challengeList.map(c => {
      const isActive    = c.is_joined && !c.is_completed;
      const isCompleted = c.is_joined &&  c.is_completed;
      const pct = isActive ? Math.round(c.current_day / c.duration_days * 100) : 0;
      return `
        <div class="challenge-card${isCompleted ? ' completed' : ''}">
          <div style="display:flex;align-items:flex-start;gap:14px">
            <div style="font-size:36px;flex-shrink:0">${c.badge_emoji}</div>
            <div style="flex:1">
              <div class="challenge-card-title">${c.title}</div>
              <div class="challenge-card-desc">${c.description}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                <span class="tag" style="background:var(--bg-secondary)">${c.duration_days} ngày</span>
                ${isCompleted ? `<span class="tag" style="background:#d1fae5;color:#065f46">✅ Hoàn thành</span>` : ''}
                ${isActive    ? `<span class="tag" style="background:#ede9fe;color:#5b21b6">🔄 ${c.current_day}/${c.duration_days} ngày</span>` : ''}
              </div>
              ${isActive ? `<div class="challenge-progress-wrap" style="margin-top:10px"><div class="challenge-progress-fill" style="width:${pct}%"></div></div>` : ''}
            </div>
          </div>
          <div style="margin-top:12px">
            ${isCompleted
              ? `<button class="btn-outline" style="font-size:12px" onclick="App.joinChallenge(${c.id})">🔁 Làm lại</button>`
              : isActive
                ? `<button class="btn-outline" style="font-size:12px" onclick="document.getElementById('active-challenge-section').scrollIntoView({behavior:'smooth'})">Xem tiến độ ↑</button>`
                : `<button class="btn-primary" style="font-size:12px;max-width:180px" onclick="App.joinChallenge(${c.id})">Bắt đầu thử thách</button>`}
          </div>
        </div>
      `;
    }).join('');
  }

  async function joinChallenge(id) {
    try {
      await API.joinChallenge(id);
      const data = await API.getChallenges();
      challengeList = data.challenges || [];
      renderChallenges();
      showToast('🎉 Đã tham gia thử thách!');
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function doChallengeCheckin(id) {
    try {
      const res = await API.challengeCheckin(id);
      showToast(res.message);
      if (res.completed) setTimeout(() => showToast('🏆 Bạn đã hoàn thành thử thách — xuất sắc lắm!'), 1200);
      const data = await API.getChallenges();
      challengeList = data.challenges || [];
      renderChallenges();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function quitChallenge(id) {
    if (!await showConfirm('Bạn có chắc muốn bỏ thử thách này không?', '🏳️')) return;
    try {
      await API.quitChallenge(id);
      showToast('Đã rời khỏi thử thách.');
      const data = await API.getChallenges();
      challengeList = data.challenges || [];
      renderChallenges();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  // ── Tâm sự Ẩn danh ───────────────────────────────────────────────────
  const COMMUNITY_MOOD_TAGS = ['😔 Buồn bã','😰 Lo lắng','😤 Căng thẳng','🤯 Quá tải','😶 Cô đơn','🙂 Bình yên','💪 Muốn chia sẻ'];

  async function initCommunityPage() {
    communityPage = 1;
    communityMoodTag = null;
    const tagsEl = document.getElementById('community-mood-tags');
    if (tagsEl) tagsEl.innerHTML = COMMUNITY_MOOD_TAGS.map(tag =>
      `<button class="tag" onclick="App.selectCommunityTag(this,'${tag}')" data-tag="${tag}">${tag}</button>`
    ).join('');
    await loadCommunityPosts(true);
  }

  async function loadCommunityPosts(reset) {
    if (reset) communityPage = 1;
    const el = document.getElementById('community-posts');
    if (!el) return;
    if (reset) el.innerHTML = '<div class="loading-text">Đang tải...</div>';
    try {
      const data  = await API.getCommunityPosts(communityPage);
      const posts = data.posts || [];
      const html  = posts.map(renderCommunityPost).join('');
      if (reset) {
        el.innerHTML = html || '<div class="loading-text">Chưa có tâm sự nào — hãy là người đầu tiên chia sẻ! 💙</div>';
      } else {
        const btn = el.querySelector('.community-loadmore');
        if (btn) btn.remove();
        el.insertAdjacentHTML('beforeend', html);
      }
      if (posts.length === 20) {
        el.insertAdjacentHTML('beforeend', `<div style="text-align:center;margin-top:16px" class="community-loadmore"><button class="btn-outline" onclick="App.loadMoreCommunityPosts()">Xem thêm</button></div>`);
      }
    } catch (e) {
      el.innerHTML = `<div class="loading-text" style="color:var(--rose)">Lỗi: ${e.message}</div>`;
    }
  }

  function renderCommunityPost(p) {
    const time = fmtTimeAgo(new Date(p.created_at));
    const esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `
      <div class="community-post-card" id="community-post-${p.id}">
        <div class="community-post-content">${esc(p.content)}</div>
        ${p.mood_tag ? `<span class="community-mood-tag">${p.mood_tag}</span>` : ''}
        <div class="community-post-footer">
          <span class="community-post-time">${time}</span>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="community-react-btn${p.has_reacted ? ' reacted' : ''}" onclick="App.reactPost(${p.id},this)">
              💙 <span class="react-count">${p.sympathy_count}</span>
            </button>
            ${p.is_own ? `<button class="community-delete-btn" onclick="App.deletePost(${p.id})" title="Xóa">✕</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function selectCommunityTag(btn, tag) {
    document.querySelectorAll('#community-mood-tags .tag').forEach(b => b.classList.remove('sel'));
    if (communityMoodTag === tag) { communityMoodTag = null; return; }
    btn.classList.add('sel');
    communityMoodTag = tag;
  }

  async function submitCommunityPost() {
    const input = document.getElementById('community-post-input');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return showToast('Vui lòng nhập nội dung!');
    try {
      const res = await API.createCommunityPost(content, communityMoodTag);
      input.value = '';
      document.getElementById('community-char-count').textContent = '0';
      communityMoodTag = null;
      document.querySelectorAll('#community-mood-tags .tag').forEach(b => b.classList.remove('sel'));
      showToast('💙 Đã chia sẻ!');
      const postsEl = document.getElementById('community-posts');
      if (postsEl) postsEl.insertAdjacentHTML('afterbegin', renderCommunityPost({ ...res.post, is_own: 1, has_reacted: 0 }));
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function reactPost(id, btn) {
    try {
      const data     = await API.reactCommunityPost(id);
      const countEl  = btn.querySelector('.react-count');
      const count    = parseInt(countEl.textContent);
      if (data.reacted) { btn.classList.add('reacted');    countEl.textContent = count + 1; }
      else              { btn.classList.remove('reacted'); countEl.textContent = Math.max(0, count - 1); }
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function deletePost(id) {
    if (!await showConfirm('Xóa bài tâm sự này?', '🗑️')) return;
    try {
      await API.deleteCommunityPost(id);
      document.getElementById(`community-post-${id}`)?.remove();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  function loadMoreCommunityPosts() {
    communityPage++;
    loadCommunityPosts(false);
  }

  // ── Library (API-driven) ──────────────────────────────────────────────
  let allApiArticles = [];

  async function initLibrary() {
    // Skeleton placeholder trong khi tải
    const gridElPre = document.getElementById('articles-grid');
    if (gridElPre) {
      gridElPre.style.display = 'grid';
      gridElPre.innerHTML = Array(6).fill(0).map(() =>
        `<div class="article-card" style="pointer-events:none">
          <div class="skeleton" style="height:120px"></div>
          <div style="padding:12px">
            <div class="skeleton" style="height:13px;width:65%;margin-bottom:8px"></div>
            <div class="skeleton" style="height:11px;width:40%"></div>
          </div>
        </div>`).join('');
    }
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
    const exBtn = (action,label,fn) => action?`<button class="btn-outline" style="margin-top:14px;font-size:12px" onclick="${fn}">${label}</button>`:'';
    document.getElementById('exercises-grid').innerHTML=EXERCISES.map(ex=>`<div class="exercise-card"><div class="ex-icon" style="background:${ex.bg}">${ex.icon}</div><div class="ex-title">${ex.title}</div><span class="ex-duration" style="background:${ex.bg};color:var(--text-muted)">⏱ ${ex.duration}</span><div class="ex-desc">${ex.desc}</div><ol class="ex-steps">${ex.steps.map(s=>`<li class="ex-step">${s}</li>`).join('')}</ol>${exBtn(ex.action==='breath','▶ Bắt đầu có hướng dẫn','App.openBreathModal()')}${exBtn(ex.action==='box_breath','▶ Bắt đầu có hướng dẫn','App.openBoxBreathModal()')}${exBtn(ex.action==='unsent_letter','✍️ Viết thư','App.openLetterModal()')}${exBtn(ex.action==='evidence_testing','⚖️ Bắt đầu','App.openEvidenceModal()')}${exBtn(ex.action==='pmr','💪 Bắt đầu có hướng dẫn','App.openPMRModal()')}${exBtn(ex.action==='bodyscan','🌊 Bắt đầu có hướng dẫn','App.openBodyScanModal()')}${exBtn(ex.action==='grounding','🧘 Bắt đầu','App.openGroundingModal()')}${exBtn(ex.action==='gratitude','🙏 Mở nhật ký','App.openGratitudeModal()')}</div>`).join('');

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
      if (!musicCache[mood]) {
        const res = await API.getMusicTracks(mood);
        musicCache[mood] = res.tracks || [];
      }
      musicTracks = musicCache[mood];
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

  // ── PMR Modal (Thư giãn cơ tiến triển) ──────────────────────────────
  const PMR_ZONES = [
    { name:'Bàn chân',       svgClass:'zone-feet',      tip:'Co chặt các ngón chân và bàn chân' },
    { name:'Bắp chân',       svgClass:'zone-calves',    tip:'Co bắp chân lên, nhón gót cao' },
    { name:'Đùi',            svgClass:'zone-thighs',    tip:'Ép chặt hai đùi vào nhau' },
    { name:'Ngực & Bụng',   svgClass:'zone-chest',     tip:'Hóp bụng, ép căng cơ ngực' },
    { name:'Tay & Cánh tay',svgClass:'zone-arms',      tip:'Nắm chặt tay, co cứng cánh tay' },
    { name:'Vai & Cổ',      svgClass:'zone-shoulders', tip:'Nhún vai lên tai, ép chặt cổ' },
    { name:'Mặt',           svgClass:'zone-face',      tip:'Nhắm chặt mắt, nhăn trán và mặt' },
  ];
  const BODY_SCAN_ZONES = [
    { name:'Bàn chân & Ngón chân', svgClass:'zone-feet',      prompt:'Chú ý mọi cảm giác ở ngón chân và bàn chân — ấm, lạnh, tê, hay ngứa ran.' },
    { name:'Bắp chân & Mắt cá',   svgClass:'zone-calves',    prompt:'Di chuyển sự chú ý lên bắp chân và mắt cá. Cảm nhận trọng lượng của chân.' },
    { name:'Đùi & Đầu gối',        svgClass:'zone-thighs',   prompt:'Chú ý vùng đùi và đầu gối. Thả lỏng mọi căng cứng bạn nhận ra.' },
    { name:'Bụng & Ngực',          svgClass:'zone-chest',    prompt:'Theo dõi nhịp thở. Bụng phồng lên khi hít, xẹp xuống khi thở. Cảm nhận tim đập.' },
    { name:'Tay & Cánh tay',       svgClass:'zone-arms',     prompt:'Chú ý bàn tay, cẳng tay, cánh tay. Thả lỏng ngón tay.' },
    { name:'Vai & Cổ',             svgClass:'zone-shoulders',prompt:'Cảm nhận vai và cổ — nơi thường chứa nhiều căng thẳng nhất. Thả lỏng từ từ.' },
    { name:'Mặt & Đầu',            svgClass:'zone-face',     prompt:'Thả lỏng hàm, lưỡi, quanh mắt, trán. Cho phép mặt hoàn toàn thư giãn.' },
  ];
  const GROUNDING_STEPS = [
    { n:5, sense:'Nhìn', icon:'👁️', hint:'Nhìn xung quanh và đặt tên 5 vật thể bạn thấy ngay lúc này.', count:5 },
    { n:4, sense:'Chạm', icon:'✋', hint:'Chạm vào 4 vật thể khác nhau. Chú ý kết cấu, nhiệt độ.', count:4 },
    { n:3, sense:'Nghe', icon:'👂', hint:'Lắng nghe và đặt tên 3 âm thanh xung quanh bạn.', count:3 },
    { n:2, sense:'Ngửi', icon:'👃', hint:'Ngửi và nhận biết 2 mùi hương bạn cảm nhận được.', count:2 },
    { n:1, sense:'Nếm',  icon:'👅', hint:'Chú ý 1 hương vị trong miệng bạn ngay lúc này.', count:1 },
  ];
  const GRATITUDE_PROMPTS = [
    { q:'Hôm nay, điều gì khiến bạn cảm thấy biết ơn?', hint:'Có thể là bất cứ điều gì — một bữa ăn ngon, một khoảnh khắc nhỏ, hay ai đó đã giúp bạn.' },
    { q:'Tại sao điều đó có ý nghĩa với bạn?',           hint:'Hãy đi sâu hơn — điều đó chạm đến nhu cầu hoặc giá trị nào của bạn?' },
    { q:'Nếu không có điều đó, cuộc sống sẽ thế nào?',  hint:'Tưởng tượng ngược lại để cảm nhận sâu hơn về sự biết ơn.' },
  ];

  function _updatePMRSvg(svgId, zones, activeIdx) {
    const svg = document.getElementById(svgId); if (!svg) return;
    zones.forEach((z, i) => {
      const el = svg.querySelector('.' + z.svgClass);
      if (!el) return;
      el.classList.remove('bz-active', 'bz-done');
      if (i < activeIdx) el.classList.add('bz-done');
      else if (i === activeIdx) el.classList.add('bz-active');
    });
  }
  function _clearPMRSvg(svgId) {
    const svg = document.getElementById(svgId); if (!svg) return;
    svg.classList.remove('pmr-tense','pmr-relax','bodyscan-active');
    svg.querySelectorAll('.body-zone').forEach(g => g.classList.remove('bz-active','bz-done'));
  }

  function openPMRModal()  { document.getElementById('pmr-modal').classList.add('open'); }
  function closePMRModal() {
    clearInterval(pmrInterval); pmrInterval=null; pmrGroupIdx=0; pmrPhaseIdx=0;
    document.getElementById('pmr-modal').classList.remove('open');
    _clearPMRSvg('pmr-svg');
    document.getElementById('pmr-phase-label').className='pmr-phase-label';
    document.getElementById('pmr-phase-label').textContent='Sẵn sàng';
    document.getElementById('pmr-countdown').textContent='—';
    document.getElementById('pmr-zone-name').textContent='—';
    document.getElementById('pmr-progress').textContent='Nhấn bắt đầu để khởi động';
    document.getElementById('pmr-start-btn').textContent='▶ Bắt đầu';
  }
  function startPMR() {
    const btn=document.getElementById('pmr-start-btn');
    if(pmrInterval){clearInterval(pmrInterval);pmrInterval=null;btn.textContent='▶ Bắt đầu';return;}
    btn.textContent='⏸ Dừng'; pmrGroupIdx=0; pmrPhaseIdx=0; _clearPMRSvg('pmr-svg'); runPMRPhase();
  }
  function runPMRPhase() {
    const grp=PMR_ZONES[pmrGroupIdx]; if(!grp){finishPMR();return;}
    const isTense=pmrPhaseIdx===0; const dur=isTense?5:15;
    const svg=document.getElementById('pmr-svg'); if(!svg)return;
    _updatePMRSvg('pmr-svg',PMR_ZONES,pmrGroupIdx);
    svg.classList.remove('pmr-tense','pmr-relax');
    svg.classList.add(isTense?'pmr-tense':'pmr-relax');
    document.getElementById('pmr-zone-name').textContent=isTense?grp.tip:grp.name+' — thả lỏng hoàn toàn';
    const lbl=document.getElementById('pmr-phase-label');
    lbl.textContent=isTense?'🔴 CO CƠ':'🟢 THẢ LỎNG'; lbl.className='pmr-phase-label '+(isTense?'tense':'relax');
    document.getElementById('pmr-progress').textContent=`Nhóm cơ ${pmrGroupIdx+1} / ${PMR_ZONES.length}`;
    pmrCountdown=dur; document.getElementById('pmr-countdown').textContent=pmrCountdown;
    clearInterval(pmrInterval);
    pmrInterval=setInterval(()=>{
      pmrCountdown--; const cd=document.getElementById('pmr-countdown'); if(cd)cd.textContent=pmrCountdown;
      if(pmrCountdown<=0){
        clearInterval(pmrInterval); pmrInterval=null;
        pmrPhaseIdx++; if(pmrPhaseIdx>=2){pmrPhaseIdx=0;pmrGroupIdx++;} runPMRPhase();
      }
    },1000);
  }
  function finishPMR() {
    clearInterval(pmrInterval); pmrInterval=null;
    const svg=document.getElementById('pmr-svg');
    if(svg){svg.classList.remove('pmr-tense','pmr-relax');svg.querySelectorAll('.body-zone').forEach(g=>g.classList.add('bz-done'));}
    document.getElementById('pmr-phase-label').textContent='✅ Hoàn thành!'; document.getElementById('pmr-phase-label').className='pmr-phase-label';
    document.getElementById('pmr-countdown').textContent='🎉';
    document.getElementById('pmr-zone-name').textContent='Toàn bộ cơ thể đã được thư giãn';
    document.getElementById('pmr-progress').textContent=`${PMR_ZONES.length}/${PMR_ZONES.length} nhóm cơ hoàn thành`;
    document.getElementById('pmr-start-btn').textContent='▶ Bắt đầu lại';
  }

  // ── Body Scan Modal ───────────────────────────────────────────────────
  function openBodyScanModal()  { document.getElementById('bodyscan-modal').classList.add('open'); }
  function closeBodyScanModal() {
    clearInterval(scanInterval); scanInterval=null; scanZoneIdx=0;
    document.getElementById('bodyscan-modal').classList.remove('open');
    _clearPMRSvg('bodyscan-svg');
    document.getElementById('scan-zone-name').textContent='—';
    document.getElementById('scan-prompt').textContent='Nhấn bắt đầu để bắt đầu quét cơ thể';
    document.getElementById('scan-countdown').textContent='—';
    document.getElementById('scan-progress').textContent='Nhấn bắt đầu để khởi động';
    document.getElementById('scan-start-btn').textContent='▶ Bắt đầu';
  }
  function startBodyScan() {
    const btn=document.getElementById('scan-start-btn');
    if(scanInterval){clearInterval(scanInterval);scanInterval=null;btn.textContent='▶ Bắt đầu';return;}
    btn.textContent='⏸ Dừng'; scanZoneIdx=0; _clearPMRSvg('bodyscan-svg'); runScanZone();
  }
  function runScanZone() {
    const zone=BODY_SCAN_ZONES[scanZoneIdx]; if(!zone){finishBodyScan();return;}
    const svg=document.getElementById('bodyscan-svg'); if(!svg)return;
    _updatePMRSvg('bodyscan-svg',BODY_SCAN_ZONES,scanZoneIdx);
    svg.classList.add('bodyscan-active');
    document.getElementById('scan-zone-name').textContent=zone.name;
    document.getElementById('scan-prompt').textContent=zone.prompt;
    document.getElementById('scan-progress').textContent=`Vùng ${scanZoneIdx+1} / ${BODY_SCAN_ZONES.length}`;
    scanCountdown=30; document.getElementById('scan-countdown').textContent=scanCountdown;
    clearInterval(scanInterval);
    scanInterval=setInterval(()=>{
      scanCountdown--; const cd=document.getElementById('scan-countdown'); if(cd)cd.textContent=scanCountdown;
      if(scanCountdown<=0){clearInterval(scanInterval);scanInterval=null;scanZoneIdx++;runScanZone();}
    },1000);
  }
  function finishBodyScan() {
    clearInterval(scanInterval); scanInterval=null;
    const svg=document.getElementById('bodyscan-svg');
    if(svg){svg.classList.remove('bodyscan-active');svg.querySelectorAll('.body-zone').forEach(g=>g.classList.add('bz-done'));}
    document.getElementById('scan-zone-name').textContent='Hoàn thành quét cơ thể';
    document.getElementById('scan-prompt').textContent='Nằm yên thêm vài giây để cảm nhận sự thư giãn trải khắp cơ thể bạn.';
    document.getElementById('scan-countdown').textContent='🌟';
    document.getElementById('scan-progress').textContent=`${BODY_SCAN_ZONES.length}/${BODY_SCAN_ZONES.length} vùng hoàn thành`;
    document.getElementById('scan-start-btn').textContent='▶ Bắt đầu lại';
  }

  // ── Grounding 5-4-3-2-1 Modal ────────────────────────────────────────
  function openGroundingModal()  { groundingStep=0; _renderGroundingStep(false); document.getElementById('grounding-modal').classList.add('open'); }
  function closeGroundingModal() { document.getElementById('grounding-modal').classList.remove('open'); groundingStep=0; }
  function _renderGroundingStep(started) {
    const step=GROUNDING_STEPS[groundingStep]; if(!step)return;
    groundingChecked=new Array(step.count).fill(false);
    // force re-animation by cloning the num element
    const numEl=document.getElementById('grounding-num');
    if(numEl){numEl.textContent=step.n; numEl.style.animation='none'; void numEl.offsetWidth; numEl.style.animation='';}
    document.getElementById('grounding-icon').textContent=step.icon;
    document.getElementById('grounding-sense').textContent=step.sense;
    document.getElementById('grounding-hint').textContent=started?step.hint:'Nhấn bắt đầu để khởi động bài tập chánh niệm';
    const items=document.getElementById('grounding-items');
    items.innerHTML=started?Array.from({length:step.count},(_,i)=>
      `<div class="grounding-item" id="gi-${i}" onclick="App.toggleGroundingItem(${i})"><span class="gi-check" id="gic-${i}">○</span><span class="gi-text">Vật thể / Cảm giác ${i+1}</span></div>`
    ).join(''):'';
    document.getElementById('grounding-next-btn').style.display=started?'inline-block':'none';
    document.getElementById('grounding-start-btn').style.display=started?'none':'inline-block';
    document.getElementById('grounding-start-btn').textContent='▶ Bắt đầu';
  }
  function startGrounding() { _renderGroundingStep(true); }
  function toggleGroundingItem(i) {
    groundingChecked[i]=!groundingChecked[i];
    const el=document.getElementById('gi-'+i); if(!el)return;
    el.classList.toggle('checked',groundingChecked[i]);
    document.getElementById('gic-'+i).textContent=groundingChecked[i]?'✓':'○';
  }
  function nextGroundingStep() {
    groundingStep++;
    if(groundingStep>=GROUNDING_STEPS.length){
      document.getElementById('grounding-num').textContent='✅';
      document.getElementById('grounding-icon').textContent='';
      document.getElementById('grounding-sense').textContent='Hoàn thành!';
      document.getElementById('grounding-hint').textContent='Bạn đã hoàn thành 5-4-3-2-1. Chú ý cảm giác hiện tại — có khác trước không?';
      document.getElementById('grounding-items').innerHTML='';
      document.getElementById('grounding-next-btn').style.display='none';
      const sb=document.getElementById('grounding-start-btn');
      sb.style.display='inline-block'; sb.textContent='▶ Làm lại';
      groundingStep=0;
    } else {
      _renderGroundingStep(true);
    }
  }

  // ── Gratitude Journal Modal ───────────────────────────────────────────
  function openGratitudeModal()  { gratStep=0; _renderGratitudeStep(); document.getElementById('gratitude-modal').classList.add('open'); }
  function closeGratitudeModal() {
    document.getElementById('gratitude-modal').classList.remove('open');
    gratStep=0; document.getElementById('gratitude-answer').value='';
  }
  function _renderGratitudeStep() {
    const p=GRATITUDE_PROMPTS[gratStep];
    document.getElementById('gratitude-step-label').textContent=`Câu ${gratStep+1} / ${GRATITUDE_PROMPTS.length}`;
    document.getElementById('gratitude-question').textContent=p.q;
    document.getElementById('gratitude-hint').textContent=p.hint;
    document.getElementById('gratitude-answer').value='';
    document.getElementById('gratitude-back-btn').style.display=gratStep>0?'inline-block':'none';
    document.getElementById('gratitude-next-btn').textContent=
      gratStep<GRATITUDE_PROMPTS.length-1?'Tiếp theo →':'✅ Hoàn thành';
  }
  function gratitudeNext() {
    if(gratStep<GRATITUDE_PROMPTS.length-1){gratStep++;_renderGratitudeStep();}
    else{showToast('🙏 Cảm ơn bạn đã dành thời gian biết ơn hôm nay!');closeGratitudeModal();}
  }
  function gratitudeBack() { if(gratStep>0){gratStep--;_renderGratitudeStep();} }

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
      // Cache 30 phút trong session — endpoint này chạy 4 DB query song song
      const CACHE_KEY = 'nhk_mh_cache';
      const CACHE_TTL = 30 * 60 * 1000;
      let data;
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { ts, payload } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) data = payload;
      }
      if (!data) {
        data = await API.getMentalHealth();
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload: data }));
      }
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
      // Server đã cache theo ngày — client cache trong session để tránh re-fetch khi nav qua lại
      const CACHE_KEY = 'nhk_recap_cache';
      const todayKey  = new Date().toISOString().slice(0, 10);
      let data;
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { date, payload } = JSON.parse(cached);
        if (date === todayKey) data = payload;
      }
      if (!data) {
        data = await API.getSmartRecap();
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ date: todayKey, payload: data }));
      }
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

  let _toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    // Auto-detect type từ emoji prefix
    t.className = 'toast';
    if (/^(✅|🎉|🌱|💚|🏆|🥇|🔓)/.test(msg)) { t.classList.add('toast-success'); haptic('success'); }
    else if (/^(❌|🚫)/.test(msg))             { t.classList.add('toast-error');   haptic('error'); }
    else if (/^(⚠️|🔒|⏳)/.test(msg))         { t.classList.add('toast-warn');    haptic('medium'); }
    else if (/^(ℹ️|💡|📌)/.test(msg))         { t.classList.add('toast-info');    haptic('light'); }
    else                                         { haptic('light'); }
    t.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
    t.onclick = () => { clearTimeout(_toastTimer); t.classList.remove('show'); };
  }

  // ── Count-up animation cho stat numbers ─────────────────────────────
  function animateCount(el, target, duration = 650) {
    if (!el || isNaN(target) || target === 0) { if (el) el.textContent = target; return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    };
    requestAnimationFrame(step);
  }

  // ── Tìm kiếm nhật ký (v1.9) ─────────────────────────────────────────
  let _searchActive = false, _lastSearchQ = '';

  async function searchDiary() {
    const q        = (document.getElementById('diary-search-input')?.value || '').trim();
    const from     = document.getElementById('diary-search-from')?.value || '';
    const to       = document.getElementById('diary-search-to')?.value   || '';
    const moodMin  = document.getElementById('adv-mood-min')?.value  || '';
    const moodMax  = document.getElementById('adv-mood-max')?.value  || '';
    const hasMedia = document.getElementById('adv-has-media')?.checked || false;
    const hasCbt   = document.getElementById('adv-has-cbt')?.checked  || false;
    const hasAdv   = moodMin || moodMax || hasMedia || hasCbt;
    if (!q && !from && !to && !hasAdv) return loadDiaryEntries();

    const el  = document.getElementById('diary-entries-list');
    const lbl = document.getElementById('search-result-label');
    if (el) el.innerHTML = '<div class="loading-text">Đang tìm...</div>';
    _searchActive = true; _lastSearchQ = q;
    try {
      const res     = hasAdv
        ? await API.searchDiaryAdvanced({ q, from, to, mood_min: moodMin, mood_max: moodMax, has_media: hasMedia, has_cbt: hasCbt })
        : await API.searchDiary(q, from, to);
      const entries = res.entries || [];
      if (lbl) { lbl.style.display = ''; lbl.textContent = `Tìm thấy ${entries.length} kết quả${q ? ' cho "' + escapeHtml(q) + '"' : ''}`; }
      if (!el) return;
      if (!entries.length) {
        el.innerHTML = '<div style="text-align:center;color:var(--text-hint);font-size:13px;padding:40px 0">Không tìm thấy nhật ký nào phù hợp 🔍</div>';
        return;
      }
      el.innerHTML = entries.map(e => entryHTML(e, true)).join('');
    } catch (err) {
      if (el) el.innerHTML = `<div class="loading-text" style="color:var(--rose)">Lỗi tìm kiếm: ${err.message}</div>`;
    }
  }

  function toggleAdvancedSearch() {
    const panel = document.getElementById('advanced-search-panel');
    const btn   = document.getElementById('adv-search-toggle-btn');
    if (!panel) return;
    const open = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = open ? '' : 'none';
    if (btn) btn.style.background = open ? 'var(--primary)' : '';
    if (btn) btn.style.color      = open ? '#fff' : '';
  }

  function clearSearch() {
    const q    = document.getElementById('diary-search-input');
    const from = document.getElementById('diary-search-from');
    const to   = document.getElementById('diary-search-to');
    const lbl  = document.getElementById('search-result-label');
    if (q)    q.value    = '';
    if (from) from.value = '';
    if (to)   to.value   = '';
    if (lbl)  { lbl.style.display = 'none'; lbl.textContent = ''; }
    _searchActive = false; _lastSearchQ = '';
    const mMin = document.getElementById('adv-mood-min');
    const mMax = document.getElementById('adv-mood-max');
    const hm   = document.getElementById('adv-has-media');
    const hc   = document.getElementById('adv-has-cbt');
    if (mMin) mMin.value   = '';
    if (mMax) mMax.value   = '';
    if (hm)   hm.checked  = false;
    if (hc)   hc.checked  = false;
    const panel = document.getElementById('advanced-search-panel');
    if (panel) panel.style.display = 'none';
    const btn = document.getElementById('adv-search-toggle-btn');
    if (btn) { btn.style.background = ''; btn.style.color = ''; }
    _searchActive = false;
    loadDiaryEntries();
  }

  // ── Dark Mode ─────────────────────────────────────────────────────────
  function applyDarkMode(on) {
    document.body.classList.toggle('dark-mode', on);
    const btn = document.getElementById('dark-mode-toggle');
    if (btn) btn.textContent = on ? '☀️' : '🌙';
  }
  function toggleDarkMode() {
    const on = !document.body.classList.contains('dark-mode');
    localStorage.setItem('nhk_dark', on ? '1' : '0');
    applyDarkMode(on);
  }

  // ── Themes ────────────────────────────────────────────────────────────
  const THEME_LIST = ['lavender','rose','emerald','warm','ocean','midnight'];
  const THEME_LABELS = { '':'Xanh Dương', lavender:'Tím Oải Hương', rose:'Hồng Đào', emerald:'Xanh Lá Rừng', warm:'Nâu Ấm', ocean:'Xanh Biển Sâu', midnight:'Đêm Tím' };
  function applyTheme(name) {
    THEME_LIST.forEach(t => document.body.classList.remove('theme-' + t));
    if (name) document.body.classList.add('theme-' + name);
    localStorage.setItem('nhk_theme', name || '');
    document.querySelectorAll('.theme-swatch').forEach(btn =>
      btn.classList.toggle('active', (btn.dataset.theme || '') === (name || ''))
    );
    const lbl = document.getElementById('theme-name-label');
    if (lbl) lbl.textContent = THEME_LABELS[name] || 'Xanh Dương';
    const popup = document.getElementById('theme-picker-popup');
    if (popup) popup.style.display = 'none';
  }
  function toggleThemePicker() {
    const popup = document.getElementById('theme-picker-popup');
    if (!popup) return;
    if (popup.style.display === 'none') {
      popup.style.display = 'block';
      const cur = localStorage.getItem('nhk_theme') || '';
      document.querySelectorAll('.theme-swatch').forEach(btn =>
        btn.classList.toggle('active', (btn.dataset.theme || '') === cur)
      );
      const lbl = document.getElementById('theme-name-label');
      if (lbl) lbl.textContent = THEME_LABELS[cur] || 'Xanh Dương';
      setTimeout(() => {
        function outsideClick(e) {
          if (!popup.contains(e.target) && e.target.id !== 'theme-picker-btn') {
            popup.style.display = 'none';
            document.removeEventListener('click', outsideClick);
          }
        }
        document.addEventListener('click', outsideClick);
      }, 10);
    } else {
      popup.style.display = 'none';
    }
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

  // ── Settings Page ────────────────────────────────────────────────────
  let settingsNotifDays = [];

  function switchSettingsTab(tab, btn) {
    document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.settings-tab').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById(`settings-panel-${tab}`);
    if (panel) panel.style.display = '';
    if (btn) btn.classList.add('active');
    if (tab === 'notifications') renderSettingsNotif();
  }

  let _pendingAvatarUrl = null;

  async function initSettingsPage() {
    const user = Auth.getUser();
    if (!user) return;
    _pendingAvatarUrl = null;

    const un = document.getElementById('set-username');
    const em = document.getElementById('set-email');
    const fn = document.getElementById('set-fullname');
    if (un) un.value = user.username  || '';
    if (em) em.value = user.email     || '';
    if (fn) fn.value = user.full_name || '';

    // Bio + avatar (gated)
    const hasAvatarBio = !!(window.FEATURES && window.FEATURES.avatar_bio);
    const avatarWrap = document.getElementById('settings-avatar-wrap');
    if (avatarWrap) avatarWrap.style.display = hasAvatarBio ? '' : 'none';
    const bioGroup = document.getElementById('settings-bio-group');
    if (bioGroup) bioGroup.style.display = hasAvatarBio ? '' : 'none';
    if (hasAvatarBio) {
      const bioEl = document.getElementById('set-bio');
      if (bioEl) {
        bioEl.value = user.bio || '';
        const cntEl = document.getElementById('set-bio-count');
        if (cntEl) cntEl.textContent = bioEl.value.length;
      }
      _renderAvatarPreview(user.avatar_url, user.avatar_text);
    }

    // Tài khoản info
    const ai = document.getElementById('set-account-info');
    if (ai) {
      const joined = user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '—';
      ai.innerHTML = `<div>Tên đăng nhập: <strong>${user.username}</strong></div>
        <div>Email: <strong>${user.email}</strong></div>
        <div>Ngày tham gia: <strong>${joined}</strong></div>
        <div>Tổng nhật ký: <strong>${user.totalEntries || '—'}</strong></div>`;
    }

    // PIN (gated)
    const pinWrap = document.getElementById('settings-pin-wrap');
    const hasPinMgmt = !!(window.FEATURES && window.FEATURES.pin_management);
    if (pinWrap) pinWrap.style.display = hasPinMgmt ? '' : 'none';
    if (hasPinMgmt) refreshPinStatus();

    // Đồng bộ notif prefs từ DB
    try {
      const fresh = await API.getMe();
      settingsNotifDays = fresh.user.notif_days ? fresh.user.notif_days.split(',').map(Number) : [];
      const hourSel = document.getElementById('set-notif-hour');
      if (hourSel) hourSel.value = fresh.user.notif_hour !== null && fresh.user.notif_hour !== undefined ? fresh.user.notif_hour : '';
    } catch {}

    // Gợi ý giờ viết (gated)
    const wpSection = document.getElementById('settings-writing-pattern-wrap');
    if (wpSection) wpSection.style.display = (window.FEATURES && window.FEATURES.smart_notification) ? '' : 'none';
    if (window.FEATURES && window.FEATURES.smart_notification) _loadWritingPattern();
  }

  function _renderAvatarPreview(url, text) {
    const textEl   = document.getElementById('set-avatar-text');
    const imgEl    = document.getElementById('set-avatar-img');
    const removeBtn = document.getElementById('set-avatar-remove-btn');
    if (!textEl || !imgEl) return;
    if (url) {
      imgEl.src         = url;
      imgEl.style.display = '';
      textEl.style.display = 'none';
      if (removeBtn) removeBtn.style.display = '';
    } else {
      imgEl.style.display = 'none';
      textEl.style.display = '';
      textEl.textContent = text || 'SV';
      if (removeBtn) removeBtn.style.display = 'none';
    }
  }

  function handleAvatarUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Ảnh quá lớn — tối đa 2MB'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(ev) {
      const img = new Image();
      img.onload = function() {
        const SIZE = 200;
        const canvas = document.createElement('canvas');
        canvas.width  = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        const sx   = (img.width  - side) / 2;
        const sy   = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        _pendingAvatarUrl = canvas.toDataURL('image/jpeg', 0.82);
        _renderAvatarPreview(_pendingAvatarUrl, null);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function removeAvatar() {
    _pendingAvatarUrl = '';
    const user = Auth.getUser();
    _renderAvatarPreview(null, user ? user.avatar_text : null);
  }

  async function _loadWritingPattern() {
    const el = document.getElementById('set-writing-pattern');
    if (!el) return;
    try {
      const d = await API.getWritingPattern();
      if (!d.suggestion && d.suggestion !== 0) {
        el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Chưa đủ dữ liệu — hãy viết thêm nhật ký để xem gợi ý.</p>';
        return;
      }
      const h    = d.suggestion;
      const ampm = h < 12 ? 'sáng' : h < 18 ? 'chiều' : 'tối';
      const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;background:var(--bg);border-radius:var(--radius);padding:12px 16px">
          <div style="font-size:28px">⏰</div>
          <div>
            <div style="font-weight:600;font-size:15px">${h12}:00 ${ampm}</div>
            <div style="font-size:12px;color:var(--text-muted)">Bạn hay viết nhất vào khung giờ này (dựa trên ${d.count || ''} lần ghi gần đây)</div>
          </div>
          <button class="btn-outline" style="margin-left:auto;font-size:12px;padding:6px 10px;white-space:nowrap" onclick="App._applyWritingHour(${h})">Áp dụng</button>
        </div>`;
    } catch {}
  }

  function _applyWritingHour(h) {
    const sel = document.getElementById('set-notif-hour');
    if (sel) { sel.value = h; showToast('Đã chọn ' + h + ':00 — nhớ bấm Lưu cài đặt!'); }
  }

  function renderSettingsNotif() {
    // Push opt-in section
    const pushSection = document.getElementById('set-push-section');
    if (pushSection) {
      const existing = document.getElementById('push-optin-banner');
      if (existing && existing.innerHTML) {
        pushSection.innerHTML = existing.innerHTML;
      } else {
        pushSection.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Bật push notification để nhận nhắc nhở viết nhật ký hàng ngày.</p>' +
          '<button class="btn-outline" onclick="App.enablePush()">🔔 Bật thông báo</button>';
      }
    }
    // Đánh dấu ngày đã chọn
    document.querySelectorAll('#set-notif-days .notif-day-btn').forEach(btn => {
      const day = parseInt(btn.dataset.day);
      btn.classList.toggle('sel', settingsNotifDays.includes(day));
    });
  }

  function toggleNotifDaySetting(btn, day) {
    const idx = settingsNotifDays.indexOf(day);
    if (idx >= 0) settingsNotifDays.splice(idx, 1);
    else settingsNotifDays.push(day);
    btn.classList.toggle('sel', settingsNotifDays.includes(day));
  }

  async function saveProfileSettings() {
    const fullName = (document.getElementById('set-fullname').value || '').trim();
    const bio      = (document.getElementById('set-bio')?.value || '').trim();
    const msgEl    = document.getElementById('set-profile-msg');
    if (!fullName) { showSettingsMsg(msgEl, 'Tên không được để trống.', false); return; }
    try {
      const hasAvatarBio = !!(window.FEATURES && window.FEATURES.avatar_bio);
      const payload = { full_name: fullName, bio: hasAvatarBio ? bio : undefined };
      if (hasAvatarBio && _pendingAvatarUrl !== null) payload.avatar_url = _pendingAvatarUrl;
      const d    = await API.updateProfile(payload);
      const user = Auth.getUser();
      if (user) {
        user.full_name  = fullName;
        user.bio        = bio;
        user.avatar_text = d.avatar_text;
        if (_pendingAvatarUrl !== null) user.avatar_url = _pendingAvatarUrl;
        localStorage.setItem('nhk_user', JSON.stringify(user));
        _pendingAvatarUrl = null;
      }
      Auth.updateSidebarUser(user);
      showSettingsMsg(msgEl, '✅ Đã cập nhật hồ sơ!', true);
    } catch (err) { showSettingsMsg(msgEl, '❌ ' + err.message, false); }
  }

  async function changePasswordSettings() {
    const curPw  = document.getElementById('set-current-pw').value;
    const newPw  = document.getElementById('set-new-pw').value;
    const conPw  = document.getElementById('set-confirm-pw').value;
    const msgEl  = document.getElementById('set-security-msg');
    if (!curPw || !newPw || !conPw) { showSettingsMsg(msgEl, 'Vui lòng điền đầy đủ thông tin.', false); return; }
    if (newPw !== conPw)            { showSettingsMsg(msgEl, 'Mật khẩu xác nhận không khớp.', false); return; }
    if (newPw.length < 6)          { showSettingsMsg(msgEl, 'Mật khẩu mới phải ít nhất 6 ký tự.', false); return; }
    try {
      const d = await API.changePassword(curPw, newPw);
      showSettingsMsg(msgEl, '✅ ' + (d.message || 'Đổi mật khẩu thành công!'), true);
      document.getElementById('set-current-pw').value = '';
      document.getElementById('set-new-pw').value     = '';
      document.getElementById('set-confirm-pw').value = '';
    } catch (err) { showSettingsMsg(msgEl, '❌ ' + err.message, false); }
  }

  async function saveNotifSettings() {
    const hourEl = document.getElementById('set-notif-hour');
    const msgEl  = document.getElementById('set-notif-msg');
    const h      = hourEl.value !== '' ? parseInt(hourEl.value) : null;
    const days   = settingsNotifDays.length > 0 ? settingsNotifDays.join(',') : null;
    try {
      const d = await API.updateNotifPrefs(h, days);
      showSettingsMsg(msgEl, '✅ ' + (d.message || 'Đã lưu!'), true);
    } catch (err) { showSettingsMsg(msgEl, '❌ ' + err.message, false); }
  }

  async function deleteAccountSettings() {
    const pw    = document.getElementById('set-delete-pw').value;
    const msgEl = document.getElementById('set-account-msg');
    if (!pw) { showSettingsMsg(msgEl, 'Vui lòng nhập mật khẩu để xác nhận.', false); return; }
    if (!confirm('Bạn có chắc muốn xóa toàn bộ tài khoản và dữ liệu? Hành động này KHÔNG THỂ hoàn tác!')) return;
    try {
      await API.deleteAccount(pw);
      localStorage.removeItem('nhk_token');
      localStorage.removeItem('nhk_user');
      alert('Tài khoản đã được xóa. Tạm biệt!');
      window.location.reload();
    } catch (err) { showSettingsMsg(msgEl, '❌ ' + err.message, false); }
  }

  function showSettingsMsg(el, msg, success) {
    if (!el) return;
    el.textContent = msg;
    el.className   = `settings-msg ${success ? 'success' : 'error'}`;
    el.style.display = '';
    setTimeout(() => { if (el) el.style.display = 'none'; }, 4000);
  }

  // ── Soul Chat (v1.8) ────────────────────────────────────────────────
  async function initChatPage() {
    const msgsEl = document.getElementById('chat-messages');
    const remEl  = document.getElementById('chat-remaining');
    try {
      const { messages, remaining } = await API.getChatHistory();
      if (messages && messages.length) {
        msgsEl.innerHTML = messages.map(m => `
          <div class="chat-bubble ${m.role}">
            <div class="chat-content">${escapeHtml(m.content)}</div>
          </div>`).join('');
      }
      if (remEl) remEl.textContent = remaining !== undefined ? `Còn ${remaining}/20 tin nhắn hôm nay` : '';
      msgsEl.scrollTop = msgsEl.scrollHeight;
    } catch(e) {}
    const input = document.getElementById('chat-input');
    if (input) input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }

  async function sendChat() {
    const input = document.getElementById('chat-input');
    const msgsEl = document.getElementById('chat-messages');
    const remEl  = document.getElementById('chat-remaining');
    const sendBtn= document.getElementById('chat-send-btn');
    const text = (input?.value || '').trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    msgsEl.innerHTML += `<div class="chat-bubble user"><div class="chat-content">${escapeHtml(text)}</div></div>`;
    msgsEl.innerHTML += `<div class="chat-bubble assistant typing" id="chat-typing"><div class="chat-content">...</div></div>`;
    msgsEl.scrollTop = msgsEl.scrollHeight;

    try {
      const { reply, remaining, crisis } = await API.sendChatMessage(text);
      document.getElementById('chat-typing')?.remove();
      msgsEl.innerHTML += `<div class="chat-bubble assistant"><div class="chat-content">${escapeHtml(reply)}</div></div>`;
      if (remEl) remEl.textContent = `Còn ${remaining}/20 tin nhắn hôm nay`;
      if (crisis) {
        msgsEl.innerHTML += `<div class="chat-crisis-banner">🆘 Nếu bạn đang trong tình trạng nguy hiểm, hãy gọi ngay <strong>1800 599 920</strong> hoặc đến <a href="#" onclick="App.nav('sos');return false">trang SOS</a>.</div>`;
      }
    } catch(e) {
      document.getElementById('chat-typing')?.remove();
      msgsEl.innerHTML += `<div class="chat-bubble assistant"><div class="chat-content" style="color:#dc2626">Xin lỗi, có lỗi xảy ra. Vui lòng thử lại.</div></div>`;
    }
    msgsEl.scrollTop = msgsEl.scrollHeight;
    sendBtn.disabled = false;
    input.focus();
  }

  function chatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  }

  async function clearChat() {
    if (!confirm('Xóa toàn bộ lịch sử trò chuyện?')) return;
    try {
      await API.clearChat();
      const msgsEl = document.getElementById('chat-messages');
      if (msgsEl) msgsEl.innerHTML = `<div class="chat-bubble assistant"><div class="chat-content">Xin chào! Mình là Soul 🌱 Bạn đang cảm thấy thế nào hôm nay?</div></div>`;
      const remEl = document.getElementById('chat-remaining');
      if (remEl) remEl.textContent = 'Còn 20/20 tin nhắn hôm nay';
      showToast('Đã xóa lịch sử trò chuyện.');
    } catch(e) { showToast('Lỗi: ' + e.message); }
  }

  // ── Lịch Học tập (v1.8) ───────────────────────────────────────────────
  const STUDY_TYPE_LABEL = { exam:'🔴 Thi/Kiểm tra', deadline:'🟠 Deadline', assignment:'🟡 Bài tập', other:'🔵 Khác' };

  async function initStudyPage() {
    const today = new Date().toISOString().split('T')[0];
    const todayInput = document.getElementById('study-date');
    if (todayInput) todayInput.value = today;
    await loadStudyEvents();
  }

  async function loadStudyEvents() {
    const listEl = document.getElementById('study-events-list');
    if (!listEl) return;
    try {
      const { events } = await API.getStudyEvents();
      if (!events || !events.length) {
        listEl.innerHTML = '<div style="text-align:center;color:var(--text-hint);padding:30px 0;font-size:13px">Chưa có sự kiện nào. Thêm lịch thi, deadline ngay nào! 📅</div>';
        return;
      }
      const now = new Date(); now.setHours(0,0,0,0);
      listEl.innerHTML = events.map(ev => {
        const d = new Date(ev.event_date);
        const diff = Math.round((d - now) / 86400000);
        const past = diff < 0;
        const urgent = !past && diff <= 3;
        const urgentCls = urgent ? 'study-event-urgent' : past ? 'study-event-past' : '';
        const dayLabel = past ? `${Math.abs(diff)} ngày trước` : diff === 0 ? 'Hôm nay' : `Còn ${diff} ngày`;
        return `<div class="study-event-card ${urgentCls} ${ev.is_done ? 'study-event-done' : ''}">
          <div class="study-event-left">
            <div class="study-event-type">${STUDY_TYPE_LABEL[ev.event_type] || ev.event_type}</div>
            <div class="study-event-title">${escapeHtml(ev.title)}</div>
            ${ev.notes ? `<div class="study-event-notes">${escapeHtml(ev.notes)}</div>` : ''}
          </div>
          <div class="study-event-right">
            <div class="study-event-date">${d.toLocaleDateString('vi-VN')}</div>
            <div class="study-event-days ${urgent?'urgent':''}">${dayLabel}</div>
            <div style="display:flex;gap:6px;margin-top:6px">
              ${!ev.is_done ? `<button class="btn-outline" style="padding:3px 8px;font-size:11px" onclick="App.doneStudy(${ev.id})">✅ Xong</button>` : '<span style="font-size:11px;color:#059669">✅ Hoàn thành</span>'}
              <button class="btn-outline" style="padding:3px 8px;font-size:11px;color:#dc2626;border-color:#dc2626" onclick="App.removeStudy(${ev.id})">🗑</button>
            </div>
          </div>
        </div>`;
      }).join('');
    } catch(e) { if (listEl) listEl.innerHTML = '<div class="loading-text">Không thể tải dữ liệu.</div>'; }
  }

  async function createStudyEvent() {
    const title = document.getElementById('study-title')?.value.trim();
    const date  = document.getElementById('study-date')?.value;
    const type  = document.getElementById('study-type')?.value;
    const notes = document.getElementById('study-notes')?.value.trim();
    const msgEl = document.getElementById('study-form-msg');
    if (!title || !date) { showSettingsMsg(msgEl, '⚠️ Vui lòng nhập tên và ngày sự kiện.', false); return; }
    try {
      await API.createStudyEvent({ title, event_date: date, event_type: type, notes });
      document.getElementById('study-title').value = '';
      document.getElementById('study-notes').value = '';
      showSettingsMsg(msgEl, '✅ Đã thêm sự kiện!', true);
      await loadStudyEvents();
    } catch(e) { showSettingsMsg(msgEl, '❌ ' + e.message, false); }
  }

  async function doneStudy(id) {
    try { await API.doneStudyEvent(id); await loadStudyEvents(); } catch(e) { showToast('Lỗi: ' + e.message); }
  }

  async function removeStudy(id) {
    if (!confirm('Xóa sự kiện này?')) return;
    try { await API.deleteStudyEvent(id); await loadStudyEvents(); } catch(e) { showToast('Lỗi: ' + e.message); }
  }

  // ── Mini Courses (v1.8) ───────────────────────────────────────────────
  let courseData = [];    // cache danh sách courses
  let lessonState = { courseId: null, lessonIdx: 0 };  // trạng thái lesson đang xem

  async function initCoursesPage() {
    const listEl = document.getElementById('courses-list');
    try {
      const { courses } = await API.getCourses();
      courseData = courses || [];
      if (!courseData.length) { listEl.innerHTML = '<div class="loading-text">Chưa có khóa học nào.</div>'; return; }
      listEl.innerHTML = courseData.map(c => {
        const pct = c.lessons ? Math.round((c.current_lesson / c.lessons.length) * 100) : 0;
        return `<div class="course-card card" onclick="App.openCourseLesson(${c.id}, ${c.current_lesson})">
          <div class="course-header">
            <div class="course-icon">${c.icon || '📘'}</div>
            <div class="course-info">
              <div class="course-title">${escapeHtml(c.title)}</div>
              <div class="course-desc">${escapeHtml(c.description || '')}</div>
            </div>
            ${c.completed ? '<div class="course-done-badge">✅ Hoàn thành</div>' : ''}
          </div>
          <div class="course-progress-row">
            <div class="course-progress-bar"><div class="course-progress-fill" style="width:${pct}%"></div></div>
            <span class="course-progress-label">${c.current_lesson}/${c.lessons ? c.lessons.length : 0} bài</span>
          </div>
        </div>`;
      }).join('');
    } catch(e) { if (listEl) listEl.innerHTML = '<div class="loading-text">Không thể tải khóa học.</div>'; }
  }

  function openCourseLesson(courseId, lessonIdx) {
    const course = courseData.find(c => c.id === courseId);
    if (!course || !course.lessons || !course.lessons.length) return;
    lessonState = { courseId, lessonIdx: Math.min(lessonIdx, course.lessons.length - 1) };
    renderLessonModal();
    document.getElementById('lesson-modal').style.display = 'flex';
  }

  function renderLessonModal() {
    const course = courseData.find(c => c.id === lessonState.courseId);
    if (!course || !course.lessons) return;
    const lesson = course.lessons[lessonState.lessonIdx];
    const total  = course.lessons.length;
    const isLast = lessonState.lessonIdx >= total - 1;
    document.getElementById('lesson-modal-content').innerHTML = `
      <div style="font-size:11px;color:var(--text-hint);margin-bottom:6px">${escapeHtml(course.title)} · Bài ${lessonState.lessonIdx + 1}/${total}</div>
      <div style="font-weight:700;font-size:16px;margin-bottom:12px">${escapeHtml(lesson.title)}</div>
      <div style="white-space:pre-wrap;font-size:13px;line-height:1.7;color:var(--text)">${escapeHtml(lesson.content)}</div>`;
    const prevBtn = document.getElementById('lesson-prev-btn');
    const nextBtn = document.getElementById('lesson-next-btn');
    prevBtn.style.display = lessonState.lessonIdx > 0 ? '' : 'none';
    nextBtn.textContent   = isLast ? '✅ Hoàn thành khóa học' : 'Tiếp theo →';
  }

  async function lessonNav(dir) {
    const course = courseData.find(c => c.id === lessonState.courseId);
    if (!course) return;
    const newIdx = lessonState.lessonIdx + dir;
    if (newIdx < 0) return;
    if (newIdx >= course.lessons.length) {
      // Đánh dấu hoàn thành
      try {
        await API.saveCourseProgress(course.id, lessonState.lessonIdx);
        showToast('🎉 Bạn đã hoàn thành khóa học này!');
        closeLessonModal();
        initCoursesPage();
      } catch(e) { showToast('Lỗi: ' + e.message); }
      return;
    }
    // Lưu tiến độ bài hiện tại khi next
    if (dir > 0) {
      try { await API.saveCourseProgress(course.id, newIdx); } catch(_) {}
    }
    lessonState.lessonIdx = newIdx;
    renderLessonModal();
  }

  function closeLessonModal() {
    document.getElementById('lesson-modal').style.display = 'none';
  }

  // ── Mục tiêu Cá nhân (v1.8) ──────────────────────────────────────────
  function onGoalTypeChange() {
    const type = document.getElementById('goal-type')?.value;
    const targetLabel = document.getElementById('goal-target-label');
    const periodWrap  = document.getElementById('goal-period-wrap');
    const targetInput = document.getElementById('goal-target');
    if (!targetLabel) return;
    if (type === 'mood_avg') {
      targetLabel.textContent = 'Mood trung bình ≥ (1-10)';
      targetInput.placeholder = '7';
      targetInput.max = '10';
      if (periodWrap) periodWrap.style.display = '';
    } else if (type === 'streak') {
      targetLabel.textContent = 'Số ngày liên tiếp';
      targetInput.placeholder = '7';
      targetInput.max = '365';
      if (periodWrap) periodWrap.style.display = 'none';
    } else {
      targetLabel.textContent = 'Số nhật ký cần viết';
      targetInput.placeholder = '10';
      targetInput.max = '999';
      if (periodWrap) periodWrap.style.display = '';
    }
  }

  async function initGoalsPage() {
    onGoalTypeChange();
    await loadGoals();
  }

  async function loadGoals() {
    const listEl = document.getElementById('goals-list');
    if (!listEl) return;
    try {
      const { goals } = await API.getGoals();
      if (!goals || !goals.length) {
        listEl.innerHTML = '<div style="text-align:center;color:var(--text-hint);padding:30px 0;font-size:13px">Chưa có mục tiêu nào. Đặt mục tiêu đầu tiên đi! 🎯</div>';
        return;
      }
      listEl.innerHTML = goals.map(g => {
        const pct = Math.min(100, Math.round((g.progress / g.target_value) * 100));
        const done = pct >= 100;
        return `<div class="goal-card card ${done ? 'goal-done' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div>
              <div class="goal-title">${escapeHtml(g.title)}</div>
              <div class="goal-type-label">${goalTypeLabel(g.goal_type, g.target_value, g.period_days)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              ${done ? '<span class="goal-done-badge">✅ Đạt rồi!</span>' : ''}
              <button onclick="App.removeGoal(${g.id})" style="background:none;border:none;cursor:pointer;color:var(--text-hint);font-size:15px">🗑</button>
            </div>
          </div>
          <div class="goal-progress-row">
            <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${pct}%;${done?'background:#059669':''}"></div></div>
            <span class="goal-progress-label">${g.progress}/${g.target_value}</span>
          </div>
        </div>`;
      }).join('');
    } catch(e) { if (listEl) listEl.innerHTML = '<div class="loading-text">Không thể tải dữ liệu.</div>'; }
  }

  function goalTypeLabel(type, target, period) {
    if (type === 'mood_avg') return `📊 Mood trung bình ≥ ${target}/10 trong ${period} ngày`;
    if (type === 'streak')   return `🔥 Chuỗi ${target} ngày`;
    return `📖 Viết ${target} nhật ký trong ${period} ngày`;
  }

  async function createGoal() {
    const title  = document.getElementById('goal-title')?.value.trim();
    const type   = document.getElementById('goal-type')?.value;
    const target = parseInt(document.getElementById('goal-target')?.value);
    const period = parseInt(document.getElementById('goal-period')?.value || 30);
    const msgEl  = document.getElementById('goal-form-msg');
    if (!title) { showSettingsMsg(msgEl, '⚠️ Vui lòng nhập tên mục tiêu.', false); return; }
    if (!target || target < 1) { showSettingsMsg(msgEl, '⚠️ Vui lòng nhập giá trị mục tiêu hợp lệ.', false); return; }
    if (type === 'mood_avg' && target > 10) { showSettingsMsg(msgEl, '⚠️ Mood không thể vượt quá 10.', false); return; }
    try {
      await API.createGoal({ title, goal_type: type, target_value: target, period_days: period });
      document.getElementById('goal-title').value = '';
      document.getElementById('goal-target').value = '';
      showSettingsMsg(msgEl, '✅ Đã tạo mục tiêu!', true);
      await loadGoals();
    } catch(e) { showSettingsMsg(msgEl, '❌ ' + e.message, false); }
  }

  async function removeGoal(id) {
    if (!confirm('Xóa mục tiêu này?')) return;
    try { await API.deleteGoal(id); await loadGoals(); } catch(e) { showToast('Lỗi: ' + e.message); }
  }

  // ── Tổng kết Năm (v1.8) ───────────────────────────────────────────────
  let yearReviewYear = new Date().getFullYear();

  async function initYearReviewPage() {
    yearReviewYear = new Date().getFullYear();
    const yearEl = document.getElementById('year-review-year');
    if (yearEl) yearEl.textContent = yearReviewYear;
    await loadYearReview();
  }

  function yearReviewNav(dir) {
    yearReviewYear += dir;
    const yearEl = document.getElementById('year-review-year');
    if (yearEl) yearEl.textContent = yearReviewYear;
    loadYearReview();
  }

  async function loadYearReview() {
    const el = document.getElementById('year-review-content');
    if (!el) return;
    el.innerHTML = '<div class="loading-text">Đang tải...</div>';
    try {
      const data = await API.getYearReview(yearReviewYear);
      renderYearReview(data, yearReviewYear);
    } catch(e) { el.innerHTML = '<div class="loading-text">Không thể tải dữ liệu.</div>'; }
  }

  function renderYearReview(data, year) {
    const el = document.getElementById('year-review-content');
    if (!el) return;
    const { summary, monthly, topTags, sleepCorrelation, bestMonth, worstMonth } = data;
    if (!summary || !summary.total_entries) {
      el.innerHTML = `<div style="text-align:center;color:var(--text-hint);padding:60px 0">Không có dữ liệu nhật ký cho năm ${year}.</div>`;
      return;
    }

    const monthNames = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
    const maxEntries = Math.max(...monthly.map(m => m.entries || 0), 1);

    const monthBars = monthly.map((m, i) => {
      const h = m.entries ? Math.round((m.entries / maxEntries) * 60) : 0;
      const isB = bestMonth  && m.month === bestMonth.month;
      const isW = worstMonth && m.month === worstMonth.month;
      return `<div class="yr-month-col" title="${monthNames[i]}: ${m.entries || 0} nhật ký, mood TB ${m.avg_mood ? m.avg_mood.toFixed(1) : '—'}">
        <div class="yr-month-bar" style="height:${h}px;background:${isB?'#059669':isW?'#dc2626':'var(--primary)'}"></div>
        <div class="yr-month-lbl">${monthNames[i]}</div>
      </div>`;
    }).join('');

    const tagsHtml = topTags && topTags.length
      ? topTags.map(t => `<span class="entry-tag">${escapeHtml(t.tag)} <strong>${t.count}</strong></span>`).join('')
      : '<span style="color:var(--text-hint)">Chưa có tag</span>';

    const sleepHtml = sleepCorrelation && sleepCorrelation.length
      ? `<div class="card" style="margin-bottom:16px">
          <div class="settings-section-title" style="margin-bottom:10px">😴 Giấc ngủ & Tâm trạng</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${sleepCorrelation.map(s => `<div class="stat-card" style="min-width:100px">
            <div class="stat-val" style="font-size:16px">${parseFloat(s.avg_mood).toFixed(1)}</div>
            <div class="stat-lbl">${s.sleep_band} giờ ngủ</div>
          </div>`).join('')}
          </div>
        </div>` : '';

    el.innerHTML = `
      <div class="grid-stats" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-val">${summary.total_entries}</div><div class="stat-lbl">Nhật ký đã viết</div></div>
        <div class="stat-card"><div class="stat-val">${summary.avg_mood ? parseFloat(summary.avg_mood).toFixed(1) : '—'}</div><div class="stat-lbl">Mood trung bình</div></div>
        <div class="stat-card"><div class="stat-val">${summary.max_streak || 0}</div><div class="stat-lbl">Chuỗi dài nhất</div></div>
        <div class="stat-card"><div class="stat-val">${summary.active_months || 0}</div><div class="stat-lbl">Tháng có nhật ký</div></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="settings-section-title" style="margin-bottom:12px">📊 Nhật ký mỗi tháng</div>
        <div class="yr-month-chart">${monthBars}</div>
        <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:var(--text-hint)">
          ${bestMonth  ? `<span>🌟 Tháng tốt nhất: T${bestMonth.month}  (${bestMonth.entries} nhật ký, mood ${parseFloat(bestMonth.avg_mood).toFixed(1)})</span>` : ''}
          ${worstMonth ? `<span>😔 Cần cải thiện: T${worstMonth.month} (${worstMonth.entries} nhật ký, mood ${parseFloat(worstMonth.avg_mood).toFixed(1)})</span>` : ''}
        </div>
      </div>
      ${sleepHtml}
      <div class="card">
        <div class="settings-section-title" style="margin-bottom:10px">🏷️ Tags phổ biến nhất</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${tagsHtml}</div>
      </div>`;
  }

  // ── PIN Lock (v2.0) ──────────────────────────────────────────────────
  let _pinBuf = '';

  async function _pinHash(pin) {
    const enc = new TextEncoder().encode(pin);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function pinInput(digit) {
    if (_pinBuf.length >= 4) return;
    _pinBuf += digit;
    _updatePinDots();
    if (_pinBuf.length === 4) setTimeout(_checkPin, 120);
  }

  function pinDelete() {
    _pinBuf = _pinBuf.slice(0, -1);
    _updatePinDots();
  }

  function _updatePinDots() {
    document.querySelectorAll('#pin-dots span').forEach((d, i) => {
      d.className = i < _pinBuf.length ? 'filled' : '';
    });
  }

  async function _checkPin() {
    const stored = localStorage.getItem('nhk_pin');
    if (!stored) { _hidePinOverlay(); return; }
    const hash = await _pinHash(_pinBuf);
    if (hash === stored) {
      _hidePinOverlay();
      sessionStorage.setItem('nhk_pin_ok', '1');
    } else {
      const dots = document.getElementById('pin-dots');
      if (dots) { dots.classList.add('shake'); setTimeout(() => dots.classList.remove('shake'), 500); }
      _pinBuf = '';
      _updatePinDots();
      const err = document.getElementById('pin-error');
      if (err) { err.textContent = 'Mã PIN không đúng. Thử lại.'; setTimeout(() => { err.textContent = ''; }, 2000); }
    }
  }

  function _hidePinOverlay() {
    const el = document.getElementById('pin-overlay');
    if (el) el.style.display = 'none';
  }

  function _showPinOverlay() {
    _pinBuf = '';
    _updatePinDots();
    const el = document.getElementById('pin-overlay');
    if (el) el.style.display = 'flex';
  }

  function _checkPinRequired() {
    if (!localStorage.getItem('nhk_pin')) return;
    if (!sessionStorage.getItem('nhk_pin_ok')) _showPinOverlay();
  }

  async function setPinLock(pin) {
    if (pin && pin.length === 4 && /^\d{4}$/.test(pin)) {
      const hash = await _pinHash(pin);
      localStorage.setItem('nhk_pin', hash);
      sessionStorage.setItem('nhk_pin_ok', '1');
      showToast('✅ Đã bật khóa PIN');
    } else if (!pin) {
      localStorage.removeItem('nhk_pin');
      sessionStorage.removeItem('nhk_pin_ok');
      showToast('✅ Đã tắt khóa PIN');
    } else {
      showToast('PIN phải là 4 chữ số');
    }
  }

  function refreshPinStatus() {
    const hasPIN = !!localStorage.getItem('nhk_pin');
    const statusEl = document.getElementById('set-pin-status');
    const removeBtn = document.getElementById('set-pin-remove-btn');
    if (statusEl) statusEl.innerHTML = hasPIN
      ? '<span style="color:#16a34a;font-weight:600">✅ Đang bật</span> — Nhật ký được bảo vệ bằng PIN 4 chữ số.'
      : '<span style="color:var(--text-muted)">🔓 Chưa bật</span> — Nhật ký không có khóa PIN.';
    if (removeBtn) removeBtn.style.display = hasPIN ? '' : 'none';
  }

  async function managePinLock(action) {
    const hasPIN = !!localStorage.getItem('nhk_pin');
    if (action === 'remove') {
      if (!hasPIN) return;
      if (!confirm('Xóa khóa PIN? Nhật ký sẽ không được bảo vệ nữa.')) return;
      await setPinLock(null);
      refreshPinStatus();
      return;
    }
    const pin = prompt(hasPIN ? 'Nhập PIN mới (4 chữ số):' : 'Tạo PIN mới (4 chữ số):');
    if (pin === null) return;
    if (!/^\d{4}$/.test(pin)) { showToast('PIN phải là đúng 4 chữ số'); return; }
    await setPinLock(pin);
    refreshPinStatus();
  }

  // ── Memory Card — Canvas → PNG (v2.0) ─────────────────────────────
  function showMemoryCard() {
    const user   = Auth.getUser();
    const streak = user ? (user.streak || 0) : 0;
    const entries = cachedEntries.length;
    const theme  = localStorage.getItem('nhk_theme') || '';
    const themeGrads = {
      '':         ['#2563eb','#8b5cf6'],
      lavender:   ['#7C3AED','#6366F1'],
      rose:       ['#DB2777','#9333EA'],
      emerald:    ['#059669','#0D9488'],
      warm:       ['#B45309','#D97706'],
      ocean:      ['#0891B2','#0D9488'],
      midnight:   ['#4338CA','#6366F1'],
    };
    const [c1, c2] = themeGrads[theme] || themeGrads[''];
    const mood = cachedEntries[0] ? MOOD_DATA[cachedEntries[0].mood_score] : null;
    const quotes = [
      '"Cảm xúc được gọi tên, tâm trí tìm thấy lối về."',
      '"Mỗi trang nhật ký là một bước chữa lành."',
      '"Hiểu mình hơn mỗi ngày — đó là dũng cảm."',
    ];

    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 480;
    const ctx = canvas.getContext('2d');

    // Background
    const grad = ctx.createLinearGradient(0, 0, 900, 480);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(0, 0, 900, 480, 24); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.roundRect(0, 0, 900, 480, 24); ctx.fill();

    // Watermark circles
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.arc(780, 80, 120, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(820, 400, 80, 0, Math.PI * 2); ctx.fill();

    // Header
    const VN_FONT = '"Segoe UI", "Noto Sans", system-ui, -apple-system, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = `bold 40px ${VN_FONT}`;
    ctx.fillText('Soul Diary', 60, 90);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `17px ${VN_FONT}`;
    ctx.fillText('Nhật ký cảm xúc số', 60, 118);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, 140); ctx.lineTo(840, 140); ctx.stroke();

    // Stats
    const stats = [
      { val: streak + ' ngày', lbl: '🔥 Chuỗi streak', x: 60  },
      { val: entries + ' trang', lbl: '📖 Nhật ký',     x: 320 },
      { val: mood ? mood.emoji + ' ' + mood.label : '—', lbl: '😊 Tâm trạng gần nhất', x: 580 },
    ];
    stats.forEach(s => {
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.font = `bold 38px ${VN_FONT}`;
      ctx.fillText(s.val, s.x, 240);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `14px ${VN_FONT}`;
      ctx.fillText(s.lbl, s.x, 266);
    });

    // Quote
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `italic 19px ${VN_FONT}`;
    ctx.fillText(quotes[Math.floor(Math.random() * quotes.length)], 60, 360);

    // Date footer
    const today = new Date().toLocaleDateString('vi-VN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `13px ${VN_FONT}`;
    ctx.fillText(today, 60, 438);

    const a = document.createElement('a');
    a.download = `soul-diary-${new Date().toISOString().split('T')[0]}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    showToast('✅ Đã tạo Memory Card!');
  }

  // ── Weekly Missions (v2.0) ──────────────────────────────────────────
  async function initMissionsPage() {
    const user   = Auth.getUser();
    const streak = user ? (user.streak || 0) : 0;
    const todayStr = new Date().toDateString();
    const wroteTodayEntry = cachedEntries.some(e => new Date(e.created_at).toDateString() === todayStr);
    const totalEntries = cachedEntries.length;

    const missions = [
      {
        title: '📖 Viết nhật ký hôm nay',
        desc:  'Ghi lại cảm xúc của bạn trong ngày hôm nay.',
        done:  wroteTodayEntry,
        action: "App.nav('diary')", actionLabel: 'Viết ngay',
      },
      {
        title: '🔥 Duy trì chuỗi 7 ngày',
        desc:  `Hiện tại bạn đang ở chuỗi ${streak} ngày. Tiếp tục để đạt mốc 7 ngày!`,
        done:  streak >= 7,
      },
      {
        title: '📚 Đọc 1 bài viết sức khoẻ tâm thần',
        desc:  'Tìm đọc một bài viết bổ ích trong thư viện kiến thức.',
        done:  false,
        action: "App.nav('library')", actionLabel: 'Xem thư viện',
      },
      {
        title: '🧘 Thực hiện bài tập thở',
        desc:  'Dành 5 phút thực hành kỹ thuật thở 4-7-8 hoặc Box Breathing.',
        done:  false,
        action: "App.nav('exercises')", actionLabel: 'Bài tập thở',
      },
      {
        title: '📝 Đạt 10 nhật ký tổng cộng',
        desc:  `Bạn đã viết ${totalEntries} nhật ký. ${totalEntries >= 10 ? 'Xuất sắc!' : 'Tiếp tục nhé!'}`,
        done:  totalEntries >= 10,
      },
    ];

    const doneCount = missions.filter(m => m.done).length;
    const pct = Math.round((doneCount / missions.length) * 100);
    const el = document.getElementById('missions-list');
    if (!el) return;

    el.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:700;color:var(--text)">Tiến độ tuần này</div>
          <div style="font-weight:700;color:var(--primary);font-size:15px">${doneCount}/${missions.length}</div>
        </div>
        <div style="background:var(--border);border-radius:8px;height:10px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--primary),var(--primary-dark));border-radius:8px;transition:width .6s ease"></div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:8px">${pct}% hoàn thành</div>
      </div>
      ${missions.map(m => `
        <div class="mission-card ${m.done ? 'done' : ''}">
          <div class="mission-check">${m.done ? '✅' : '⬜'}</div>
          <div class="mission-body">
            <div class="mission-title">${m.title}</div>
            <div class="mission-desc">${m.desc}</div>
            ${m.action && !m.done ? `<button class="btn-sm" style="margin-top:8px" onclick="${m.action}">${m.actionLabel}</button>` : ''}
          </div>
        </div>
      `).join('')}
    `;

    await loadAIPatterns();
  }

  async function loadAIPatterns() {
    const el = document.getElementById('ai-patterns-section');
    if (!el) return;
    if (!(window.FEATURES && window.FEATURES.ai_patterns)) {
      el.innerHTML = '<div style="color:var(--text-hint);font-size:13px;padding:8px 0">Tính năng phân tích AI chưa được bật. Vào Admin để bật.</div>';
      return;
    }
    try {
      const data = await API.getDiaryPatterns();
      if (!data || !data.total) {
        el.innerHTML = '<div style="color:var(--text-hint);font-size:13px;padding:8px 0">Cần ít nhất 7 nhật ký để phân tích xu hướng.</div>';
        return;
      }
      const days = ['CN','T2','T3','T4','T5','T6','T7'];
      const maxM = Math.max(...(data.by_dow || []).map(d => parseFloat(d.avg_mood) || 0), 1);
      el.innerHTML = `
        <div class="card" style="margin-bottom:14px">
          <div class="settings-section-title">📅 Tâm trạng theo ngày trong tuần</div>
          <div style="display:flex;gap:5px;align-items:flex-end;height:84px;margin-top:14px">
            ${(data.by_dow || []).map(d => {
              const pct = d.avg_mood ? Math.round((parseFloat(d.avg_mood) / 10) * 80) : 4;
              const isBest  = data.best_day  && d.day_of_week === data.best_day.day_of_week;
              const isWorst = data.worst_day && d.day_of_week === data.worst_day.day_of_week;
              return `<div style="flex:1;text-align:center">
                <div style="background:${isBest?'#059669':isWorst?'#dc2626':'var(--primary)'};height:${pct}px;border-radius:4px 4px 0 0;min-height:4px;opacity:.85;transition:height .5s"></div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${days[d.day_of_week]}</div>
              </div>`;
            }).join('')}
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            ${data.best_day  ? `<span class="entry-tag" style="background:#dcfce7;color:#166534">😊 Tốt nhất: ${days[data.best_day.day_of_week]}</span>`  : ''}
            ${data.worst_day ? `<span class="entry-tag" style="background:#fee2e2;color:#991b1b">😔 Khó nhất: ${days[data.worst_day.day_of_week]}</span>` : ''}
            ${data.top_tags && data.top_tags[0] ? `<span class="entry-tag">🏷️ Tag thường gặp: ${escapeHtml(data.top_tags[0].tag)}</span>` : ''}
          </div>
        </div>
        <div class="card">
          <div class="settings-section-title">📈 Xu hướng 3 tháng qua</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
            ${(data.monthly || []).map(m => `
              <div class="stat-card" style="min-width:90px;flex:1">
                <div class="stat-val" style="font-size:20px">${m.avg_mood ? parseFloat(m.avg_mood).toFixed(1) : '—'}</div>
                <div class="stat-lbl">${m.month}</div>
                <div class="stat-lbl" style="font-size:11px">${m.entries} nhật ký</div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:12px;font-size:13px;color:var(--text-muted)">
            Tổng: <strong>${data.total}</strong> nhật ký · Mood TB: <strong>${data.overall_avg ? parseFloat(data.overall_avg).toFixed(1) : '—'}</strong>/10
          </div>
        </div>
      `;
    } catch(e) {
      el.innerHTML = '<div style="color:var(--text-hint);font-size:13px;padding:8px 0">Không thể tải dữ liệu phân tích.</div>';
    }
  }

  // ── Thư gửi tương lai (v2.0) ───────────────────────────────────────
  async function initFutureLetterPage() {
    const dateEl = document.getElementById('fl-send-date');
    if (dateEl) {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const iso = tomorrow.toISOString().split('T')[0];
      dateEl.min = iso; dateEl.value = iso;
    }
    await loadFutureLetters();
  }

  async function loadFutureLetters() {
    const el = document.getElementById('fl-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-text">Đang tải...</div>';
    try {
      const data = await API.getLetters();
      const letters = data.letters || [];
      if (!letters.length) {
        el.innerHTML = `<div class="empty-state" style="padding:40px 0;text-align:center">
          <div style="font-size:48px;margin-bottom:12px">💌</div>
          <div style="color:var(--text-muted)">Chưa có thư nào. Hãy viết thư đầu tiên cho tương lai!</div>
        </div>`;
        return;
      }
      el.innerHTML = letters.map(l => `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;color:var(--text);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(l.subject)}</div>
              <div style="font-size:12px;color:var(--primary);font-weight:600;margin-bottom:8px">📅 Gửi vào: ${new Date(l.send_date).toLocaleDateString('vi-VN', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
              <div style="font-size:13px;color:var(--text-muted);white-space:pre-wrap;line-height:1.6">${escapeHtml((l.preview||'').slice(0,180))}${(l.preview||'').length >= 180 ? '…' : ''}</div>
            </div>
            <button onclick="App.deleteFutureLetter(${l.id})" title="Xóa thư" style="background:none;border:none;color:var(--text-hint);font-size:18px;cursor:pointer;padding:4px;flex-shrink:0;line-height:1">🗑️</button>
          </div>
        </div>
      `).join('');
    } catch(e) {
      el.innerHTML = '<div class="empty-state" style="padding:32px 0;text-align:center;color:var(--text-muted)">Không thể tải danh sách thư.</div>';
    }
  }

  async function createFutureLetter() {
    const subject  = (document.getElementById('fl-subject')?.value || '').trim();
    const content  = (document.getElementById('fl-content')?.value  || '').trim();
    const sendDate = document.getElementById('fl-send-date')?.value;
    if (!subject || !content || !sendDate) { showToast('Vui lòng điền đầy đủ tiêu đề, nội dung và ngày gửi.'); return; }
    try {
      await API.createLetter({ subject, content, send_date: sendDate });
      document.getElementById('fl-subject').value = '';
      document.getElementById('fl-content').value  = '';
      showToast('✅ Thư đã được lên lịch gửi!');
      await loadFutureLetters();
    } catch(e) { showToast('❌ ' + e.message); }
  }

  async function deleteFutureLetter(id) {
    if (!confirm('Xóa thư này? Không thể khôi phục.')) return;
    try { await API.deleteLetter(id); showToast('✅ Đã xóa thư.'); await loadFutureLetters(); }
    catch(e) { showToast('❌ ' + e.message); }
  }

  // ── Xuất dữ liệu (v2.0) ─────────────────────────────────────────────
  async function exportUserData() {
    try {
      showToast('⏳ Đang chuẩn bị dữ liệu...');
      const data = await API.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `soul-diary-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      showToast('✅ Đã xuất dữ liệu thành công!');
    } catch(e) { showToast('❌ ' + e.message); }
  }

  // ── PWA Install Prompt (v2.1) ────────────────────────────────────
  let _pwaPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _pwaPrompt = e;
    // Chỉ hiện nút khi flag pwa_install đã bật
    if (window.FEATURES && window.FEATURES.pwa_install) {
      const btn = document.getElementById('pwa-install-btn');
      if (btn) btn.style.display = '';
    }
  });
  window.addEventListener('appinstalled', () => {
    _pwaPrompt = null;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
    showToast('✅ Đã cài Soul Diary về máy!');
  });

  async function installPWA() {
    if (!_pwaPrompt) return;
    _pwaPrompt.prompt();
    const { outcome } = await _pwaPrompt.userChoice;
    if (outcome === 'accepted') _pwaPrompt = null;
  }

  // ── Mobile sidebar (v3.1 UX) ────────────────────────────────────────
  function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('sidebar-hamburger');
    const isOpen = sidebar.classList.toggle('sidebar-open');
    if (overlay) overlay.style.display = isOpen ? 'block' : 'none';
    if (hamburger) hamburger.textContent = isOpen ? '✕' : '☰';
  }

  function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('sidebar-hamburger');
    if (!sidebar) return;
    sidebar.classList.remove('sidebar-open');
    if (overlay) overlay.style.display = 'none';
    if (hamburger) hamburger.textContent = '☰';
  }

  // ── Keyboard shortcuts (v3.1 UX) ─────────────────────────────────────
  function _handleKeyboard(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    const tag  = document.activeElement?.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Ctrl+S — lưu nhật ký (kể cả khi đang trong textarea)
    if (ctrl && e.key === 's') {
      const saveBtn = document.getElementById('diary-save-btn');
      if (saveBtn && !saveBtn.disabled) { e.preventDefault(); saveBtn.click(); }
      return;
    }

    // Escape — đóng modal/overlay đang mở
    if (e.key === 'Escape') {
      // Photo lightbox
      const lightbox = document.getElementById('photo-lightbox');
      if (lightbox && lightbox.style.display === 'flex') { closeLightbox(); return; }
      // Admin editor overlay
      const admEditor = document.getElementById('adm-editor-overlay');
      if (admEditor && admEditor.style.display !== 'none') { admEditor.style.display = 'none'; return; }
      // Exercise suggest overlay
      const exSuggest = document.getElementById('exercise-suggest-overlay');
      if (exSuggest && exSuggest.style.display === 'flex') { exSuggest.style.display = 'none'; return; }
      // Bất kỳ .modal-overlay nào đang hiển thị (click backdrop để đóng)
      const visibleModal = document.querySelector('.modal-overlay[style*="flex"]');
      if (visibleModal) { visibleModal.click(); return; }
      // Mobile sidebar
      if (document.querySelector('.sidebar.sidebar-open')) { closeSidebar(); return; }
      return;
    }

    // Ctrl+K — focus ô tìm kiếm
    if (ctrl && e.key === 'k') {
      const searchInput = document.getElementById('diary-search-input');
      if (searchInput) { e.preventDefault(); searchInput.focus(); searchInput.select(); }
      return;
    }

    // / — focus tìm kiếm khi không đang nhập liệu
    if (e.key === '/' && !inInput) {
      const searchInput = document.getElementById('diary-search-input');
      if (searchInput) { e.preventDefault(); searchInput.focus(); }
      return;
    }

    // 1–9 — chọn mood nhanh khi đang ở trang nhật ký và không focus vào input
    if (!inInput && !ctrl && /^[1-9]$/.test(e.key)) {
      const scale = document.getElementById('diary-mood-scale');
      if (!scale) return;
      const score = parseInt(e.key, 10);
      const btn = scale.querySelector(`[data-mood="${score}"]`);
      if (btn) { btn.click(); e.preventDefault(); }
    }
  }

  // ── Haptic feedback (mobile) ─────────────────────────────────────────
  function haptic(type = 'light') {
    if (!navigator.vibrate) return;
    const p = { light: [8], medium: [18], success: [8, 40, 8], error: [80] };
    navigator.vibrate(p[type] || [8]);
  }

  // ── #3 Inline field error ─────────────────────────────────────────────
  function _showFieldError(fieldId, msg) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.add('field-has-error');
    let errEl = field.parentNode.querySelector('.field-error-msg');
    if (!errEl) { errEl = Object.assign(document.createElement('div'), { className: 'field-error-msg' }); field.after(errEl); }
    errEl.textContent = msg;
    errEl.classList.add('visible');
    field.addEventListener('input', function() {
      this.classList.remove('field-has-error');
      errEl.classList.remove('visible');
    }, { once: true });
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus();
  }

  // ── #8 Search term highlight ──────────────────────────────────────────
  function _highlightTerm(text, term) {
    if (!term || !text) return escapeHtml(text || '');
    const escaped = escapeHtml(text);
    const escapedTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp('(' + escapedTerm + ')', 'gi'), '<mark class="search-hl">$1</mark>');
  }

  // ── #9 Focus trap in modal ────────────────────────────────────────────
  function _trapFocus(modal) {
    const sel = 'button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
    const nodes = () => [...modal.querySelectorAll(sel)];
    function handler(e) {
      if (e.key !== 'Tab') return;
      const els = nodes();
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { last.focus(); e.preventDefault(); } }
      else            { if (document.activeElement === last)  { first.focus(); e.preventDefault(); } }
    }
    modal.__trap = handler;
    modal.addEventListener('keydown', handler);
    setTimeout(() => nodes()[0]?.focus(), 60);
  }
  function _releaseFocus(modal) {
    if (modal?.__trap) { modal.removeEventListener('keydown', modal.__trap); delete modal.__trap; }
  }

  // ── #14 Global error boundary ─────────────────────────────────────────
  function _initErrorBoundary() {
    window.onerror = (msg, src, line) => {
      console.error('[NHK Error]', msg, src, line);
      if (String(msg).includes('Script error') || String(src).includes('chrome-extension')) return;
      showToast('❌ Đã xảy ra lỗi không mong đợi. Vui lòng tải lại trang.');
    };
    window.addEventListener('unhandledrejection', e => {
      console.error('[NHK Unhandled]', e.reason);
      if (e.reason?.message === 'Unauthorized') return;
    });
  }

  // ── Top loading progress bar ──────────────────────────────────────────
  function startProgress() {
    const bar = document.getElementById('progress-bar');
    if (!bar) return;
    bar.className = '';
    void bar.offsetWidth;
    bar.classList.add('pb-loading');
  }
  function doneProgress() {
    const bar = document.getElementById('progress-bar');
    if (!bar) return;
    bar.className = 'pb-done';
    setTimeout(() => { bar.className = ''; bar.style.cssText = ''; }, 450);
  }

  // ── Modal entrance animation + focus trap (MutationObserver) ────────────
  function _initModalAnimations() {
    const replay = (overlay) => {
      const modal = overlay.querySelector('.modal');
      if (!modal) return;
      modal.style.animation = 'none';
      void modal.offsetWidth;
      modal.style.animation = '';
      _trapFocus(modal);
    };
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.attributeName !== 'style') continue;
        if (m.target.style.display === 'flex') {
          replay(m.target);
        } else {
          const modal = m.target.querySelector('.modal');
          if (modal) _releaseFocus(modal);
        }
      }
    });
    document.querySelectorAll('.modal-overlay').forEach(el =>
      obs.observe(el, { attributes: true, attributeFilter: ['style'] })
    );
  }

  // ── Swipe gesture: vuốt phải mở sidebar, vuốt trái đóng ────────────────
  function _initSwipeGesture() {
    let startX = 0, startY = 0;
    document.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < Math.abs(dy) * 1.5 || Math.abs(dx) < 55) return;
      const sidebarOpen = document.querySelector('.sidebar.sidebar-open');
      if (dx > 0 && startX < 45 && !sidebarOpen) toggleSidebar();
      else if (dx < 0 && sidebarOpen) closeSidebar();
    }, { passive: true });
  }

  // ── Ripple effect khi click nút ──────────────────────────────────────
  function _initRipple() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn-primary,.btn-outline,.btn-danger,.nav-item');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const r = document.createElement('span');
      r.className = 'ripple-fx';
      r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
      btn.appendChild(r);
      setTimeout(() => r.remove(), 650);
    });
  }

  // ── Custom confirm dialog (thay browser confirm()) ───────────────────
  let _confirmResolve = null;
  function showConfirm(message, icon = '⚠️') {
    return new Promise(resolve => {
      _confirmResolve = (val) => {
        document.getElementById('confirm-modal').style.display = 'none';
        _confirmResolve = null;
        resolve(val);
      };
      document.getElementById('confirm-message').textContent = message;
      document.getElementById('confirm-modal-icon').textContent = icon;
      document.getElementById('confirm-modal').style.display = 'flex';
      setTimeout(() => document.getElementById('confirm-ok-btn')?.focus(), 50);
    });
  }

  // ── Scroll-to-top FAB ────────────────────────────────────────────────
  function scrollToTop() {
    document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function _initScrollFAB() {
    const main = document.querySelector('.main');
    const fab  = document.getElementById('scroll-top-fab');
    if (!main || !fab) return;
    main.addEventListener('scroll', () => {
      fab.classList.toggle('visible', main.scrollTop > 280);
    }, { passive: true });
  }

  // ── Offline Detection (v2.0) ──────────────────────────────────────
  function initOfflineDetection() {
    function update() {
      const banner = document.getElementById('offline-banner');
      if (banner) banner.style.display = navigator.onLine ? 'none' : 'flex';
    }
    window.addEventListener('online',  update);
    window.addEventListener('offline', update);
    update();
  }

  // ── Init ─────────────────────────────────────────────────────────────
  async function init() {
    applyDarkMode(localStorage.getItem('nhk_dark') === '1');
    applyTheme(localStorage.getItem('nhk_theme') || '');
    document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
      nav(btn.dataset.page);
      closeSidebar();
    }));
    document.addEventListener('keydown', _handleKeyboard);
    // Auto-resize tất cả .diary-textarea khi gõ (event delegation)
    document.addEventListener('input', e => {
      if (e.target.classList.contains('diary-textarea')) {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 380) + 'px';
      }
    }, { passive: true });
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
    document.getElementById('close-pmr-modal').addEventListener('click',closePMRModal);
    document.getElementById('pmr-start-btn').addEventListener('click',startPMR);
    document.getElementById('pmr-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closePMRModal();});
    document.getElementById('close-bodyscan-modal').addEventListener('click',closeBodyScanModal);
    document.getElementById('scan-start-btn').addEventListener('click',startBodyScan);
    document.getElementById('bodyscan-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeBodyScanModal();});
    document.getElementById('close-grounding-modal').addEventListener('click',closeGroundingModal);
    document.getElementById('grounding-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeGroundingModal();});
    document.getElementById('close-gratitude-modal').addEventListener('click',closeGratitudeModal);
    document.getElementById('gratitude-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeGratitudeModal();});
    document.getElementById('article-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeArticleModal();});
    document.getElementById('entry-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeEntryModal();});
    document.getElementById('share-modal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeShareModal();});
    document.getElementById('template-picker-modal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeTemplatePicker();});
    document.getElementById('photo-lightbox').addEventListener('click',e=>{if(e.target===e.currentTarget)closeLightbox();});
    await loadFeatures();
    const navInbox = document.getElementById('nav-inbox');
    if (navInbox && window.FEATURES && window.FEATURES.inbox_support) {
      navInbox.style.display = '';
      loadInboxBadge();
    }
    const navCheckin = document.getElementById('nav-checkin');
    if (navCheckin && window.FEATURES && window.FEATURES.weekly_checkin) {
      navCheckin.style.display = '';
      refreshCheckinBadge();
    }
    if (window.FEATURES && window.FEATURES.challenge_system) {
      const el = document.getElementById('nav-challenges');
      if (el) el.style.display = '';
    }
    if (window.FEATURES && window.FEATURES.community_wall) {
      const el = document.getElementById('nav-community');
      if (el) el.style.display = '';
    }
    // v1.8 feature-gated nav items
    const v18 = { soul_chat:'nav-chat', sleep_tracking:null, study_calendar:'nav-study', mini_courses:'nav-courses', personal_goals:'nav-goals', year_review:'nav-year-review' };
    Object.entries(v18).forEach(([flag, navId]) => {
      if (!navId) return;
      if (window.FEATURES && window.FEATURES[flag]) {
        const el = document.getElementById(navId);
        if (el) el.style.display = '';
      }
    });
    // v2.0 feature-gated nav items
    const v20 = { future_letter:'nav-future-letter', weekly_missions:'nav-missions' };
    Object.entries(v20).forEach(([flag, navId]) => {
      if (window.FEATURES && window.FEATURES[flag]) {
        const el = document.getElementById(navId);
        if (el) el.style.display = '';
      }
    });
    // v2.0 init
    initOfflineDetection();
    _checkPinRequired();
    _initScrollFAB();
    _initSwipeGesture();
    _initRipple();
    _initModalAnimations();
    _initErrorBoundary();
    // v2.1 — PWA install button (chỉ hiện nếu flag bật VÀ trình duyệt đã ghi nhận beforeinstallprompt)
    if (window.FEATURES && window.FEATURES.pwa_install && _pwaPrompt) {
      const pwaBtn = document.getElementById('pwa-install-btn');
      if (pwaBtn) pwaBtn.style.display = '';
    }
    // v2.2 — cập nhật giới hạn ghi âm theo flag
    if (window.FEATURES && window.FEATURES.long_recording) MAX_RECORD_SECONDS = 120;
    // v2.3 — hiện nav sau flag
    if (window.FEATURES && window.FEATURES.friend_streaks) {
      const el = document.getElementById('nav-friends');
      if (el) el.style.display = '';
      loadFriendsBadge();
    }
    if (window.FEATURES && window.FEATURES.diary_templates) {
      const el = document.getElementById('nav-templates');
      if (el) el.style.display = '';
    }
    // v2.4 — hiện nav sau flag
    if (window.FEATURES && window.FEATURES.monthly_report) {
      const el = document.getElementById('nav-report');
      if (el) el.style.display = '';
    }
    if (window.FEATURES && window.FEATURES.weekly_reflection) {
      const el = document.getElementById('nav-reflection');
      if (el) el.style.display = '';
      loadReflectionBadge();
    }
    // v2.5 — hiện nav sau flag
    if (window.FEATURES && window.FEATURES.habit_tracker) {
      const el = document.getElementById('nav-habits');
      if (el) el.style.display = '';
    }
    // v2.6 — hiện nav sau flag
    if (window.FEATURES && window.FEATURES.pomodoro_timer) {
      const el = document.getElementById('nav-pomodoro');
      if (el) el.style.display = '';
    }
    if (window.FEATURES && window.FEATURES.year_stats) {
      const el = document.getElementById('nav-year-stats');
      if (el) el.style.display = '';
    }
    // v2.7 — hiện nav sau flag
    if (window.FEATURES && window.FEATURES.photo_gallery) {
      const el = document.getElementById('nav-gallery');
      if (el) el.style.display = '';
    }
    if (window.FEATURES && window.FEATURES.quick_notes) {
      const el = document.getElementById('nav-notes');
      if (el) el.style.display = '';
    }
    if (window.FEATURES && window.FEATURES.mood_compare) {
      const el = document.getElementById('nav-mood-compare');
      if (el) el.style.display = '';
    }
    // v3.0 — hiện nav sau flag
    if (window.FEATURES && window.FEATURES.notification_center) {
      const el = document.getElementById('nav-notifications');
      if (el) el.style.display = '';
      loadNotifBadge();
    }
    if (window.FEATURES && window.FEATURES.personal_profile) {
      const el = document.getElementById('nav-profile');
      if (el) el.style.display = '';
    }
    nav('dashboard');
  }

  // ── Streak bạn bè ─────────────────────────────────────────────────────
  async function loadFriendsBadge() {
    try {
      const d = await API.getFriendRequests();
      const badge = document.getElementById('friends-badge');
      if (badge) badge.style.display = d.requests.length > 0 ? '' : 'none';
    } catch {}
  }

  async function initFriendsPage() {
    loadFriendsBadge();
    _loadFriendRequests();
    _loadFriendsList();
  }

  async function _loadFriendRequests() {
    try {
      const d   = await API.getFriendRequests();
      const sec = document.getElementById('friend-requests-section');
      const lst = document.getElementById('friend-requests-list');
      if (!sec || !lst) return;
      if (!d.requests.length) { sec.style.display = 'none'; return; }
      sec.style.display = '';
      lst.innerHTML = d.requests.map(r => `
        <div class="friend-card" style="display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:8px">
          <div class="user-avatar" style="width:40px;height:40px;font-size:16px;flex-shrink:0">${r.avatar_text || r.username[0].toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-weight:600">${escapeHtml(r.full_name || r.username)}</div>
            <div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(r.username)}</div>
          </div>
          <button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="App.acceptFriendRequest(${r.friendship_id})">✓ Chấp nhận</button>
          <button class="btn-outline" style="font-size:12px;padding:6px 10px" onclick="App.rejectFriendRequest(${r.friendship_id})">✕</button>
        </div>`).join('');
    } catch {}
  }

  async function _loadFriendsList() {
    const el = document.getElementById('friends-list');
    if (!el) return;
    el.innerHTML = Array(3).fill(0).map(() =>
      `<div style="display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:8px;pointer-events:none">
        <div class="skeleton" style="width:44px;height:44px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1"><div class="skeleton" style="height:14px;width:55%;margin-bottom:8px"></div><div class="skeleton" style="height:11px;width:38%"></div></div>
        <div class="skeleton" style="height:24px;width:52px;border-radius:6px"></div>
      </div>`).join('');
    try {
      const d = await API.getFriends();
      if (!d.friends.length) {
        el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted)"><div style="font-size:36px;margin-bottom:12px">👥</div><div>Chưa có bạn bè nào. Thêm bạn bằng username của họ!</div></div>';
        return;
      }
      const me = Auth.getUser();
      el.innerHTML = d.friends.map((f, i) => {
        const avatarHtml = f.avatar_url
          ? `<img src="${f.avatar_url}" loading="lazy" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0">`
          : `<div class="user-avatar" style="width:44px;height:44px;font-size:18px;flex-shrink:0">${f.avatar_text || f.username[0].toUpperCase()}</div>`;
        const wroteToday = f.wrote_today ? '✅ Đã viết hôm nay' : '⏳ Chưa viết hôm nay';
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        return `
          <div style="display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:8px">
            <div style="font-size:20px;min-width:28px;text-align:center">${medal}</div>
            ${avatarHtml}
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f.full_name || f.username)}</div>
              <div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(f.username)} · ${wroteToday}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:18px;font-weight:700;color:var(--primary)">🔥 ${f.streak}</div>
              <div style="font-size:11px;color:var(--text-muted)">ngày</div>
            </div>
            <button onclick="App.removeFriend(${f.friendship_id},this)" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-hint);padding:4px" title="Xóa bạn">🗑</button>
          </div>`;
      }).join('');
    } catch (err) {
      el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:20px">Không tải được danh sách.</div>`;
    }
  }

  async function sendFriendRequest() {
    const inp = document.getElementById('friend-username-input');
    const msg = document.getElementById('friend-request-msg');
    const username = (inp?.value || '').trim();
    if (!username) return;
    try {
      const d = await API.sendFriendRequest(username);
      if (msg) { msg.textContent = '✅ ' + d.message; msg.style.color = 'var(--primary)'; }
      if (inp) inp.value = '';
    } catch (err) {
      if (msg) { msg.textContent = '❌ ' + err.message; msg.style.color = '#dc2626'; }
    }
  }

  async function acceptFriendRequest(id) {
    try {
      await API.acceptFriend(id);
      showToast('✅ Đã chấp nhận lời mời!');
      _loadFriendRequests();
      _loadFriendsList();
      loadFriendsBadge();
    } catch (err) { showToast('❌ ' + err.message); }
  }

  async function rejectFriendRequest(id) {
    try {
      await API.removeFriend(id);
      _loadFriendRequests();
      loadFriendsBadge();
    } catch {}
  }

  async function removeFriend(id, btn) {
    if (!confirm('Xóa bạn bè này?')) return;
    if (btn) btn.disabled = true;
    try {
      await API.removeFriend(id);
      _loadFriendsList();
    } catch (err) { showToast('❌ ' + err.message); if (btn) btn.disabled = false; }
  }

  // ── Nhật ký định kỳ (Templates) ──────────────────────────────────────
  let _cachedTemplates = null;

  async function initTemplatesPage() {
    _cachedTemplates = null;
    await _loadTemplates();
  }

  async function _loadTemplates() {
    const lst = document.getElementById('templates-list');
    try {
      const d = await API.getTemplates();
      _cachedTemplates = d.templates;

      // Cập nhật nút load template trong diary form
      const btnWrap = document.getElementById('diary-template-btn-wrap');
      if (btnWrap) btnWrap.style.display = d.templates.length ? '' : 'none';

      if (!lst) return;
      if (!d.templates.length) {
        lst.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted)">Chưa có template nào. Tạo template đầu tiên ngay!</div>';
        return;
      }
      lst.innerHTML = d.templates.map(t => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:8px">
          <div style="display:flex;align-items:flex-start;gap:8px">
            <div style="flex:1">
              <div style="font-weight:600;margin-bottom:4px">${escapeHtml(t.title)}</div>
              ${t.content ? `<div style="font-size:12px;color:var(--text-muted);white-space:pre-wrap;max-height:48px;overflow:hidden">${escapeHtml(t.content)}</div>` : ''}
              <div style="font-size:11px;color:var(--text-hint);margin-top:4px">Mood mặc định: ${t.default_mood}/10${t.tags ? ' · #' + t.tags.split('|').join(' #') : ''}</div>
            </div>
            <button onclick="App.applyTemplate(${t.id})" class="btn-outline" style="font-size:12px;padding:6px 10px;white-space:nowrap">📝 Dùng ngay</button>
            <button onclick="App.editTemplate(${t.id})" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-muted);padding:4px" title="Chỉnh sửa">✏️</button>
            <button onclick="App.deleteTemplate(${t.id},this)" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-hint);padding:4px" title="Xóa">🗑</button>
          </div>
        </div>`).join('');
    } catch (err) {
      if (lst) lst.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">Không tải được template.</div>';
    }
  }

  async function createTemplate() {
    const title     = (document.getElementById('tpl-title')?.value     || '').trim();
    const content   = (document.getElementById('tpl-content')?.value   || '').trim();
    const gratitude = (document.getElementById('tpl-gratitude')?.value || '').trim();
    const rawTags   = (document.getElementById('tpl-tags')?.value      || '').trim();
    const mood      = parseInt(document.getElementById('tpl-mood')?.value) || 5;
    const msg       = document.getElementById('tpl-msg');
    const tags = rawTags ? rawTags.split(',').map(s => s.trim()).filter(Boolean).join('|') : null;

    if (!title) { if (msg) { msg.textContent = 'Tên template không được để trống.'; msg.className = 'settings-msg error'; msg.style.display = ''; } return; }
    try {
      await API.createTemplate({ title, content: content || null, gratitude: gratitude || null, tags, default_mood: mood });
      if (msg) { msg.textContent = '✅ Đã lưu template!'; msg.className = 'settings-msg success'; msg.style.display = ''; }
      document.getElementById('tpl-title').value     = '';
      document.getElementById('tpl-content').value   = '';
      document.getElementById('tpl-gratitude').value = '';
      document.getElementById('tpl-tags').value      = '';
      _cachedTemplates = null;
      await _loadTemplates();
    } catch (err) {
      if (msg) { msg.textContent = '❌ ' + err.message; msg.className = 'settings-msg error'; msg.style.display = ''; }
    }
  }

  async function deleteTemplate(id, btn) {
    if (!confirm('Xóa template này?')) return;
    if (btn) btn.disabled = true;
    try {
      await API.deleteTemplate(id);
      _cachedTemplates = null;
      await _loadTemplates();
    } catch (err) { showToast('❌ ' + err.message); if (btn) btn.disabled = false; }
  }

  function editTemplate(id) {
    if (!_cachedTemplates) return;
    const t = _cachedTemplates.find(x => x.id === id);
    if (!t) return;
    // Điền vào form tạo template để chỉnh sửa
    const titleEl = document.getElementById('tpl-title');
    const contEl  = document.getElementById('tpl-content');
    const gratEl  = document.getElementById('tpl-gratitude');
    const tagsEl  = document.getElementById('tpl-tags');
    const moodEl  = document.getElementById('tpl-mood');
    if (titleEl) titleEl.value = t.title;
    if (contEl)  contEl.value  = t.content   || '';
    if (gratEl)  gratEl.value  = t.gratitude  || '';
    if (tagsEl)  tagsEl.value  = t.tags ? t.tags.split('|').join(', ') : '';
    if (moodEl)  moodEl.value  = t.default_mood || 5;
    // Đổi nút thành "Cập nhật" và đánh dấu đang sửa
    const saveBtn = document.querySelector('#page-templates .btn-primary[onclick="App.createTemplate()"]');
    if (saveBtn) {
      saveBtn.textContent = '💾 Cập nhật template';
      saveBtn.setAttribute('onclick', `App.saveEditTemplate(${id})`);
    }
    titleEl?.focus();
    titleEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function saveEditTemplate(id) {
    const title     = (document.getElementById('tpl-title')?.value     || '').trim();
    const content   = (document.getElementById('tpl-content')?.value   || '').trim();
    const gratitude = (document.getElementById('tpl-gratitude')?.value || '').trim();
    const rawTags   = (document.getElementById('tpl-tags')?.value      || '').trim();
    const mood      = parseInt(document.getElementById('tpl-mood')?.value) || 5;
    const msg       = document.getElementById('tpl-msg');
    // Chuyển dấu phẩy → dấu | để lưu đồng bộ với format tags nhật ký
    const tags = rawTags ? rawTags.split(',').map(s => s.trim()).filter(Boolean).join('|') : null;

    if (!title) { if (msg) { msg.textContent = 'Tên template không được để trống.'; msg.className = 'settings-msg error'; msg.style.display = ''; } return; }
    try {
      await API.updateTemplate(id, { title, content: content || null, gratitude: gratitude || null, tags, default_mood: mood });
      if (msg) { msg.textContent = '✅ Đã cập nhật!'; msg.className = 'settings-msg success'; msg.style.display = ''; }
      // Reset form về chế độ tạo mới
      document.getElementById('tpl-title').value     = '';
      document.getElementById('tpl-content').value   = '';
      document.getElementById('tpl-gratitude').value = '';
      document.getElementById('tpl-tags').value      = '';
      const saveBtn = document.querySelector('#page-templates .btn-primary[onclick*="saveEditTemplate"]');
      if (saveBtn) {
        saveBtn.textContent = '💾 Lưu template';
        saveBtn.setAttribute('onclick', 'App.createTemplate()');
      }
      _cachedTemplates = null;
      await _loadTemplates();
    } catch (err) {
      if (msg) { msg.textContent = '❌ ' + err.message; msg.className = 'settings-msg error'; msg.style.display = ''; }
    }
  }

  async function openTemplatePicker() {
    if (!_cachedTemplates) {
      try { const d = await API.getTemplates(); _cachedTemplates = d.templates; } catch { return; }
    }
    const lst = document.getElementById('template-picker-list');
    if (!lst) return;
    if (!_cachedTemplates.length) { showToast('Chưa có template — hãy tạo trong trang Nhật ký định kỳ.'); return; }
    lst.innerHTML = _cachedTemplates.map(t => `
      <button onclick="App.applyTemplate(${t.id})" style="text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;cursor:pointer;width:100%">
        <div style="font-weight:600;margin-bottom:2px">${escapeHtml(t.title)}</div>
        ${t.content ? `<div style="font-size:12px;color:var(--text-muted);white-space:pre-wrap;max-height:36px;overflow:hidden">${escapeHtml(t.content)}</div>` : ''}
        <div style="font-size:11px;color:var(--text-hint);margin-top:3px">Mood: ${t.default_mood}/10</div>
      </button>`).join('');
    document.getElementById('template-picker-modal').classList.add('open');
  }

  function closeTemplatePicker() {
    document.getElementById('template-picker-modal').classList.remove('open');
  }

  async function applyTemplate(id) {
    closeTemplatePicker();
    if (!_cachedTemplates) { try { const d = await API.getTemplates(); _cachedTemplates = d.templates; } catch { return; } }
    const t = _cachedTemplates.find(x => x.id === id);
    if (!t) return;

    // Áp dụng vào diary form
    nav('diary');
    setTimeout(() => {
      if (t.content) {
        const el = document.getElementById('diary-event');
        if (el) el.value = t.content;
      }
      if (t.gratitude) {
        const el = document.getElementById('diary-gratitude');
        if (el) el.value = t.gratitude;
      }
      if (t.default_mood && t.default_mood >= 1 && t.default_mood <= 10) {
        selectedMood = t.default_mood;
        document.querySelectorAll('#diary-mood-scale .mood-btn').forEach(b => {
          b.classList.toggle('selected', parseInt(b.dataset.val) === t.default_mood);
        });
      }
      showToast('📋 Đã áp dụng template: ' + t.title);
    }, 100);
  }

  // ── v2.4: Báo cáo tháng ──────────────────────────────────────────────────
  async function initReportPage() {
    const picker = document.getElementById('report-month-picker');
    if (picker && !picker.value) {
      picker.value = new Date().toISOString().slice(0, 7);
    }
    // Hiện nút Xuất PDF nếu flag bật (pdf_export)
    if (window.FEATURES && window.FEATURES.pdf_export) {
      const pdfBtn = document.getElementById('btn-export-pdf');
      if (pdfBtn) pdfBtn.style.display = '';
    }
    loadMonthlyReport();
  }

  async function loadMonthlyReport() {
    const picker  = document.getElementById('report-month-picker');
    const month   = picker ? picker.value : new Date().toISOString().slice(0, 7);
    const content = document.getElementById('report-content');
    if (!content) return;
    content.innerHTML = '<div class="loading-text">Đang tải báo cáo...</div>';
    try {
      const d = await API.getMonthlyReport(month);
      if (!d.totalEntries) {
        content.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--text-muted)"><div style="font-size:36px;margin-bottom:12px">📭</div><div>Không có nhật ký nào trong tháng ${month}.</div></div>`;
        return;
      }
      const moodColor = m => m >= 8 ? '#16a34a' : m >= 5 ? '#d97706' : '#dc2626';
      const weekBars  = d.moodByWeek.map(w => {
        const pct = Math.round((w.avg / 10) * 100);
        return `<div style="flex:1;text-align:center">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${w.week}</div>
          <div style="background:var(--border);border-radius:4px;height:80px;display:flex;align-items:flex-end;overflow:hidden">
            <div style="width:100%;height:${pct}%;background:${moodColor(w.avg)};border-radius:4px 4px 0 0;transition:height .4s"></div>
          </div>
          <div style="font-size:12px;font-weight:600;color:${moodColor(w.avg)};margin-top:4px">${w.avg}</div>
          <div style="font-size:10px;color:var(--text-hint)">${w.count} bài</div>
        </div>`;
      }).join('');

      const topTagsHtml = d.topTags.length
        ? d.topTags.map(t => `<span class="tag" style="cursor:default">#${escapeHtml(t.tag)} <span style="font-size:10px;opacity:.7">${t.count}</span></span>`).join(' ')
        : '<span style="color:var(--text-muted);font-size:13px">Chưa có tag nào.</span>';

      content.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${d.totalEntries}</div><div class="stat-label">Bài viết</div></div>
          <div class="stat-card"><div class="stat-value" style="color:${moodColor(d.avgMood)}">${d.avgMood}</div><div class="stat-label">Mood trung bình</div></div>
          <div class="stat-card"><div class="stat-value">${d.entryDays}</div><div class="stat-label">Ngày có nhật ký</div></div>
        </div>

        ${d.bestDay ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
          <div class="card" style="padding:14px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">🏆 Ngày tốt nhất</div>
            <div style="font-weight:700;font-size:18px;color:#16a34a">${d.bestDay.avg}/10</div>
            <div style="font-size:12px;color:var(--text-muted)">${new Date(d.bestDay.date).toLocaleDateString('vi-VN')}</div>
          </div>
          <div class="card" style="padding:14px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">💪 Ngày khó khăn nhất</div>
            <div style="font-weight:700;font-size:18px;color:#dc2626">${d.worstDay.avg}/10</div>
            <div style="font-size:12px;color:var(--text-muted)">${new Date(d.worstDay.date).toLocaleDateString('vi-VN')}</div>
          </div>
        </div>` : ''}

        <div class="card" style="margin-bottom:20px">
          <div class="settings-section-title" style="margin-bottom:12px">📈 Xu hướng theo tuần</div>
          <div style="display:flex;gap:8px;align-items:flex-end;height:100px">${weekBars || '<span style="color:var(--text-muted);font-size:13px">Không đủ dữ liệu.</span>'}</div>
        </div>

        <div class="card">
          <div class="settings-section-title" style="margin-bottom:10px">🏷️ Tags nhiều nhất</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${topTagsHtml}</div>
        </div>`;
    } catch (err) {
      content.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:24px">Không tải được báo cáo.</div>`;
    }
  }

  // ── v2.4: Phản tư cuối tuần ───────────────────────────────────────────────
  async function loadReflectionBadge() {
    try {
      const d     = await API.getReflectionCurrent();
      const badge = document.getElementById('reflection-badge');
      const today = new Date().getDay(); // 0=CN, 6=T7
      if (badge) badge.style.display = ((today === 0 || today === 6) && !d.reflection) ? '' : 'none';
    } catch {}
  }

  function _getMonday(d) {
    const day  = d.getUTCDay();
    const diff = (day === 0) ? -6 : 1 - day;
    const mon  = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
    return mon.toISOString().slice(0, 10);
  }

  async function initReflectionPage() {
    const weekStart = _getMonday(new Date());
    const label = document.getElementById('reflection-week-label');
    if (label) {
      const from = new Date(weekStart + 'T00:00:00');
      const to   = new Date(weekStart + 'T00:00:00');
      to.setDate(to.getDate() + 6);
      label.textContent = from.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' }) + ' – ' + to.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' });
    }
    try {
      const d = await API.getReflectionCurrent();
      if (d.reflection) {
        const r    = d.reflection;
        const fill = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        fill('ref-q1', r.q1); fill('ref-q2', r.q2); fill('ref-q3', r.q3); fill('ref-q4', r.q4); fill('ref-q5', r.q5);
        const banner = document.getElementById('reflection-done-banner');
        if (banner) banner.style.display = '';
      }
    } catch {}
    _loadReflectionHistory();
  }

  async function submitReflection() {
    const get = id => (document.getElementById(id)?.value || '').trim() || null;
    const msg = document.getElementById('ref-msg');
    try {
      await API.saveReflection({ q1: get('ref-q1'), q2: get('ref-q2'), q3: get('ref-q3'), q4: get('ref-q4'), q5: get('ref-q5') });
      if (msg) { msg.textContent = '✅ Đã lưu phản tư tuần!'; msg.className = 'settings-msg success'; msg.style.display = ''; }
      const banner = document.getElementById('reflection-done-banner');
      if (banner) banner.style.display = '';
      loadReflectionBadge();
      _loadReflectionHistory();
    } catch (err) {
      if (msg) { msg.textContent = '❌ ' + err.message; msg.className = 'settings-msg error'; msg.style.display = ''; }
    }
  }

  async function _loadReflectionHistory() {
    const el = document.getElementById('reflection-history');
    if (!el) return;
    el.innerHTML = Array(2).fill(0).map(() => `
      <div class="card" style="margin-bottom:12px;padding:14px 16px">
        <div class="skeleton" style="height:13px;width:40%;margin-bottom:12px"></div>
        <div class="skeleton" style="height:11px;width:90%;margin-bottom:6px"></div>
        <div class="skeleton" style="height:11px;width:70%;margin-bottom:6px"></div>
        <div class="skeleton" style="height:11px;width:80%"></div>
      </div>`).join('');
    try {
      const d = await API.getReflections();
      if (!d.reflections.length) {
        el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:13px">Chưa có phản tư nào được lưu.</div>';
        return;
      }
      const QS = ['Điều tốt nhất', 'Điều khó khăn', 'Biết ơn', 'Tuần tới làm khác', 'Một từ'];
      el.innerHTML = d.reflections.map(r => {
        const weekLabel = new Date(r.week_start + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const answers   = [r.q1, r.q2, r.q3, r.q4, r.q5];
        const html      = answers.map((a, i) => a
          ? `<div style="margin-bottom:8px"><div style="font-size:11px;color:var(--text-muted);font-weight:600">${i+1}. ${QS[i]}</div><div style="font-size:13px;white-space:pre-wrap">${escapeHtml(a)}</div></div>`
          : '').join('');
        return `<div class="card" style="margin-bottom:12px"><div style="font-weight:600;margin-bottom:10px;color:var(--primary)">📅 Tuần từ ${weekLabel}</div>${html}</div>`;
      }).join('');
    } catch {
      el.innerHTML = `<div style="text-align:center;padding:20px">
        <div style="color:var(--text-muted);margin-bottom:10px">Không tải được lịch sử.</div>
        <button class="btn-outline" style="width:auto;padding:6px 16px;font-size:12px" onclick="App._loadReflectionHistory()">🔄 Thử lại</button>
      </div>`;
    }
  }

  // ── v2.4: Quick Mood Log widget ────────────────────────────────────────────
  const QUICK_MOODS = [
    { score: 2, emoji: '😢', label: 'Tệ' },
    { score: 4, emoji: '😕', label: 'Buồn' },
    { score: 6, emoji: '😐', label: 'Bình thường' },
    { score: 8, emoji: '🙂', label: 'Tốt' },
    { score: 10, emoji: '😄', label: 'Tuyệt!' },
  ];

  function renderQuickMoodWidget(todayEntry) {
    const el = document.getElementById('quick-mood-widget');
    if (!el) return;
    if (todayEntry) {
      const m = QUICK_MOODS.reduce((best, cur) => Math.abs(cur.score - todayEntry.mood_score) < Math.abs(best.score - todayEntry.mood_score) ? cur : best);
      el.innerHTML = `<div class="card" style="text-align:center;padding:16px 12px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Mood hôm nay</div>
        <div style="font-size:32px">${m.emoji}</div>
        <div style="font-size:13px;font-weight:600;color:var(--primary)">${todayEntry.mood_score}/10 · ${m.label}</div>
      </div>`;
    } else {
      el.innerHTML = `<div class="card" style="padding:16px 12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px">⚡ Mood hôm nay thế nào?</div>
        <div style="display:flex;justify-content:space-around;gap:4px">
          ${QUICK_MOODS.map(m => `
            <button onclick="App.quickLogMood(${m.score})" style="background:none;border:none;cursor:pointer;text-align:center;padding:8px 4px;border-radius:var(--radius);transition:background .15s" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='none'">
              <div style="font-size:28px">${m.emoji}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${m.label}</div>
            </button>`).join('')}
        </div>
      </div>`;
    }
    el.style.display = '';
  }

  async function quickLogMood(score) {
    const el = document.getElementById('quick-mood-widget');
    try {
      await API.createEntry({ mood_score: score, event_text: '', tags: '', gratitude: '' });
      const m = QUICK_MOODS.find(x => x.score === score);
      showToast(`${m.emoji} Đã ghi mood ${score}/10!`);
      if (el) el.innerHTML = `<div class="card" style="text-align:center;padding:16px 12px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Mood hôm nay</div>
        <div style="font-size:32px">${m.emoji}</div>
        <div style="font-size:13px;font-weight:600;color:var(--primary)">${score}/10 · ${m.label}</div>
      </div>`;
      if (score <= 6 && window.FEATURES && window.FEATURES.exercise_suggest) {
        setTimeout(() => _showExerciseSuggest(score), 800);
      }
    } catch (err) { showToast('❌ ' + err.message); }
  }

  // ── v2.7: Gallery ảnh nhật ký ────────────────────────────────────────────
  async function initGalleryPage() {
    const el = document.getElementById('gallery-content');
    if (!el) return;
    el.innerHTML = '<div class="loading-text">Đang tải ảnh...</div>';
    try {
      const d = await API.getDiaryGallery();
      if (!d.entries.length) {
        el.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-muted)">
          <div style="font-size:40px;margin-bottom:12px">📷</div>
          <div>Chưa có ảnh nào được đính kèm trong nhật ký.</div>
          <div style="font-size:12px;margin-top:8px">Thêm ảnh khi viết nhật ký để xem ở đây.</div>
        </div>`;
        return;
      }
      const MOOD_COLORS = ['','#dc2626','#dc2626','#f97316','#f97316','#d97706','#d97706','#65a30d','#65a30d','#16a34a','#16a34a'];
      el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
        ${d.entries.map(e => `
          <div onclick="App.openEntry(${e.id})" style="cursor:pointer;border-radius:var(--radius);overflow:hidden;position:relative;aspect-ratio:1;background:var(--border)">
            <img src="${e.photo}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy" />
            <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.6));padding:8px 6px 6px">
              <span style="color:#fff;font-size:11px;font-weight:700">${new Date(e.created_at).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}</span>
              <span style="color:${MOOD_COLORS[e.mood_score]||'#fff'};font-size:11px;font-weight:700;float:right">${e.mood_score}/10</span>
            </div>
          </div>`).join('')}
      </div>
      <div style="text-align:center;color:var(--text-muted);font-size:12px;margin-top:16px">Hiển thị ${d.entries.length} ảnh gần nhất</div>`;
    } catch {
      el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:24px">Không tải được ảnh.</div>';
    }
  }

  // ── v2.7: Ghi chú nhanh ──────────────────────────────────────────────────
  let _selectedNoteColor = 'yellow';
  const NOTE_BG = { yellow:'#FEF08A', green:'#BBF7D0', blue:'#BFDBFE', pink:'#FBCFE8', white:'var(--surface)' };

  function selectNoteColor(color, btn) {
    _selectedNoteColor = color;
    document.querySelectorAll('[data-color]').forEach(b => b.style.border = '2px solid transparent');
    if (btn) btn.style.border = '2px solid var(--primary)';
    const hidden = document.getElementById('note-color');
    if (hidden) hidden.value = color;
  }

  async function initNotesPage() {
    _loadNotesList();
    // Set default color highlight
    const firstBtn = document.querySelector('[data-color="yellow"]');
    if (firstBtn) firstBtn.style.border = '2px solid var(--primary)';
  }

  async function _loadNotesList() {
    const el = document.getElementById('notes-list');
    if (!el) return;
    try {
      const d = await API.getNotes();
      if (!d.notes.length) {
        el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)">
          <div style="font-size:36px;margin-bottom:12px">📝</div>Chưa có ghi chú nào. Hãy thêm ghi chú đầu tiên!</div>`;
        return;
      }
      el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
        ${d.notes.map(n => `
          <div style="background:${NOTE_BG[n.color]||NOTE_BG.yellow};border-radius:var(--radius);padding:14px;position:relative;min-height:100px;box-shadow:0 2px 6px rgba(0,0,0,.08)">
            <button onclick="App.deleteNote(${n.id},this)" title="Xóa"
              style="position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;font-size:16px;color:rgba(0,0,0,.4);line-height:1">×</button>
            <div style="font-size:13px;color:#1e293b;white-space:pre-wrap;line-height:1.5;padding-right:20px">${escapeHtml(n.content)}</div>
            <div style="font-size:11px;color:rgba(0,0,0,.4);margin-top:10px">${new Date(n.created_at).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
          </div>`).join('')}
      </div>`;
    } catch {
      el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px">Không tải được ghi chú.</div>';
    }
  }

  async function createNote() {
    const content = (document.getElementById('note-content')?.value || '').trim();
    if (!content) { showToast('Nhập nội dung ghi chú!'); return; }
    try {
      await API.createNote({ content, color: _selectedNoteColor });
      const el = document.getElementById('note-content');
      if (el) el.value = '';
      showToast('📝 Đã thêm ghi chú!');
      _loadNotesList();
      _loadNotesDashboardWidget();
    } catch (err) { showToast('❌ ' + err.message); }
  }

  async function deleteNote(id, btn) {
    try {
      await API.deleteNote(id);
      showToast('Đã xóa ghi chú.');
      _loadNotesList();
      _loadNotesDashboardWidget();
    } catch (err) { showToast('❌ ' + err.message); }
  }

  async function _loadNotesDashboardWidget() {
    const el = document.getElementById('notes-dashboard-widget');
    if (!el) return;
    try {
      const d = await API.getNotes();
      if (!d.notes.length) { el.style.display = 'none'; return; }
      const preview = d.notes.slice(0, 3);
      el.innerHTML = `<div class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:600;font-size:13px">📝 Ghi chú của tôi</div>
          <button onclick="App.nav('notes')" style="font-size:12px;color:var(--primary);background:none;border:none;cursor:pointer">Xem tất cả →</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${preview.map(n => `<div style="background:${NOTE_BG[n.color]||NOTE_BG.yellow};border-radius:6px;padding:8px 10px;font-size:12px;color:#1e293b;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${escapeHtml(n.content)}</div>`).join('')}
        </div>
      </div>`;
      el.style.display = '';
    } catch { el.style.display = 'none'; }
  }

  // ── v2.7: So sánh tâm trạng ──────────────────────────────────────────────
  function initMoodComparePage() {
    const today = new Date().toISOString().slice(0, 10);
    const w7    = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const w14   = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const set = (id, val) => { const el = document.getElementById(id); if (el && !el.value) el.value = val; };
    set('cmp-from1', w14); set('cmp-to1', w7);
    set('cmp-from2', new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)); set('cmp-to2', today);
  }

  async function loadMoodCompare() {
    const from1 = document.getElementById('cmp-from1')?.value;
    const to1   = document.getElementById('cmp-to1')?.value;
    const from2 = document.getElementById('cmp-from2')?.value;
    const to2   = document.getElementById('cmp-to2')?.value;
    if (!from1 || !to1 || !from2 || !to2) { showToast('Chọn đủ 4 ngày để so sánh!'); return; }
    const el = document.getElementById('compare-result');
    if (el) el.innerHTML = '<div class="loading-text">Đang so sánh...</div>';
    try {
      const d = await API.compareMood({ from1, to1, from2, to2 });
      const moodColor = m => !m ? 'var(--text-muted)' : m >= 8 ? '#16a34a' : m >= 5 ? '#d97706' : '#dc2626';
      const renderPeriod = (p, label, accent) => {
        const tagHtml = p.topTags?.length
          ? p.topTags.map(t => `<span class="tag" style="cursor:default">#${escapeHtml(t.tag)}</span>`).join(' ')
          : '<span style="color:var(--text-muted);font-size:12px">Không có tag</span>';
        return `<div class="card" style="border-top:3px solid ${accent}">
          <div style="font-weight:700;font-size:14px;margin-bottom:12px;color:${accent}">${label}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">${p.from} → ${p.to}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
            <div class="stat-card" style="padding:10px"><div class="stat-value" style="color:${moodColor(p.avgMood)}">${p.avgMood ?? '-'}</div><div class="stat-label">Mood TB</div></div>
            <div class="stat-card" style="padding:10px"><div class="stat-value">${p.total ?? 0}</div><div class="stat-label">Bài viết</div></div>
          </div>
          ${p.total > 0 ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Min: <b>${p.minMood}</b> · Max: <b>${p.maxMood}</b></div>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:4px">${tagHtml}</div>
        </div>`;
      };
      const diff = (d.period1.avgMood && d.period2.avgMood)
        ? (d.period2.avgMood - d.period1.avgMood).toFixed(1)
        : null;
      const diffHtml = diff !== null
        ? `<div class="card" style="text-align:center;padding:14px;margin-bottom:12px">
            <div style="font-size:13px;color:var(--text-muted)">Thay đổi mood</div>
            <div style="font-size:28px;font-weight:700;color:${diff >= 0 ? '#16a34a' : '#dc2626'}">${diff >= 0 ? '+' : ''}${diff}</div>
            <div style="font-size:12px;color:var(--text-muted)">${diff >= 0 ? '📈 Cải thiện' : '📉 Giảm'} so với khoảng 1</div>
          </div>` : '';
      if (el) el.innerHTML = diffHtml +
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${renderPeriod(d.period1, '📅 Khoảng 1', 'var(--primary)')}
          ${renderPeriod(d.period2, '📅 Khoảng 2', '#d97706')}
        </div>`;
    } catch (err) {
      if (el) el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:20px">Không so sánh được.</div>`;
    }
  }

  // ── v2.7: Cảnh báo sức khỏe tâm thần nhẹ nhàng ───────────────────────────
  async function _checkWellnessAlert() {
    if (!window.FEATURES || !window.FEATURES.wellness_alert) return;
    if (sessionStorage.getItem('nhk_wellness_dismissed')) return;
    const banner = document.getElementById('wellness-alert-banner');
    if (!banner) return;
    try {
      const d = await API.getStats(7);
      if (!d.stats || d.stats.length < 3) return;
      const avgMood = d.stats.reduce((s, r) => s + r.avg_mood, 0) / d.stats.length;
      if (avgMood > 4) return;
      banner.innerHTML = `<div class="card" style="padding:14px 16px;background:linear-gradient(135deg,#fef2f2,#fff7ed);border-left:4px solid #f97316">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:24px;flex-shrink:0">💛</span>
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">Bạn đang trải qua giai đoạn khó khăn</div>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.5">Mood trung bình 7 ngày gần đây khá thấp. Hãy thử làm bài check-in tâm lý hoặc gọi đường dây hỗ trợ.</div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              <button onclick="App.nav('checkin')" style="padding:5px 12px;border-radius:6px;border:none;background:var(--primary);color:#fff;cursor:pointer;font-size:12px">📋 Check-in tâm lý</button>
              <button onclick="App.nav('sos')" style="padding:5px 12px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer;font-size:12px">📞 Hỗ trợ ngay</button>
              <button onclick="sessionStorage.setItem('nhk_wellness_dismissed','1');document.getElementById('wellness-alert-banner').style.display='none'" style="padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:12px">Đã hiểu</button>
            </div>
          </div>
        </div>
      </div>`;
      banner.style.display = '';
    } catch {}
  }

  // ── v3.0: Trung tâm Thông báo (notification_center) ─────────────────────
  async function loadNotifBadge() {
    if (!window.FEATURES || !window.FEATURES.notification_center) return;
    try {
      const d     = await API.getNotifUnread();
      const badge = document.getElementById('notif-badge');
      if (badge) {
        badge.textContent = d.count > 0 ? (d.count > 9 ? '9+' : d.count) : '';
        badge.style.display = d.count > 0 ? '' : 'none';
      }
    } catch {}
  }

  async function initNotificationsPage() {
    await loadNotifBadge(); // badge có thể giảm sau khi vào trang
    const el = document.getElementById('notif-list');
    if (!el) return;
    el.innerHTML = Array(4).fill(0).map(() => `
      <div class="card" style="margin-bottom:10px;padding:14px 16px;display:flex;gap:10px;align-items:flex-start">
        <div class="skeleton" style="width:32px;height:32px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1">
          <div class="skeleton" style="height:13px;width:55%;margin-bottom:8px"></div>
          <div class="skeleton" style="height:11px;width:80%;margin-bottom:6px"></div>
          <div class="skeleton" style="height:10px;width:30%"></div>
        </div>
      </div>`).join('');
    try {
      const d     = await API.getNotifications();
      const notifs = d.notifications || [];
      // Đánh dấu tất cả đã đọc ngay khi mở trang
      if (notifs.some(n => !n.is_read)) {
        API.markAllNotifsRead().catch(() => {});
      }
      if (!notifs.length) {
        el.innerHTML = `<div class="empty-state" style="padding:48px 0;text-align:center">
          <div style="font-size:48px;margin-bottom:12px">🔔</div>
          <div style="color:var(--text-muted)">Chưa có thông báo nào.</div>
        </div>`;
        loadNotifBadge();
        return;
      }
      const typeIcon = { welcome: '🌱', streak_milestone: '🔥', system: '📢' };
      el.innerHTML = notifs.map(n => `
        <div class="card" style="margin-bottom:10px;padding:14px 16px;${!n.is_read ? 'border-left:3px solid var(--primary);' : 'opacity:.75'}">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <span style="font-size:22px;flex-shrink:0">${typeIcon[n.type] || '📬'}</span>
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px;margin-bottom:3px">${escapeHtml(n.title)}</div>
              ${n.body ? `<div style="font-size:13px;color:var(--text-muted);line-height:1.5">${escapeHtml(n.body)}</div>` : ''}
              <div style="font-size:11px;color:var(--text-hint);margin-top:6px">${new Date(n.created_at).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
            </div>
          </div>
        </div>`).join('');
      // Reset badge
      const badge = document.getElementById('notif-badge');
      if (badge) { badge.textContent = ''; badge.style.display = 'none'; }
    } catch(e) {
      el.innerHTML = `<div class="empty-state" style="padding:40px 0">
        <div style="font-size:36px;margin-bottom:10px">😵</div>
        <div style="color:var(--text-muted);margin-bottom:12px">Không tải được thông báo.</div>
        <button class="btn-outline" style="width:auto;padding:8px 20px" onclick="App.nav('notifications')">🔄 Thử lại</button>
      </div>`;
    }
  }

  async function markAllNotifsRead() {
    try {
      await API.markAllNotifsRead();
      await initNotificationsPage();
    } catch(e) { showToast('❌ ' + e.message); }
  }

  // ── v3.0: Hồ sơ Cá nhân (personal_profile) ──────────────────────────────
  async function initProfilePage() {
    const el = document.getElementById('profile-content');
    if (!el) return;
    try {
      const user  = Auth.getUser();
      const d     = await API.getProfileStats();

      const level = [...LEVELS].reverse().find(l => d.totalEntries >= l.min) || LEVELS[0];
      const nextL = LEVELS[LEVELS.findIndex(l => l === level) + 1];
      const xp    = d.totalEntries;
      const xpNxt = nextL ? nextL.min : null;
      const pct   = xpNxt ? Math.round((xp - level.min) / (xpNxt - level.min) * 100) : 100;

      const earnedBadges  = BADGES.filter(b => b.cond(d));
      const lockedBadges  = BADGES.filter(b => !b.cond(d));

      const avatarHtml = d.avatarUrl
        ? `<img src="${d.avatarUrl}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--primary)">`
        : `<div class="user-avatar" style="width:80px;height:80px;font-size:28px">${escapeHtml(d.avatarText || 'SD')}</div>`;

      const moodDist  = d.moodDistribution || {};
      const maxCnt    = Math.max(...Object.values(moodDist), 1);
      const MOOD_COL  = ['','#ef4444','#f97316','#f97316','#facc15','#facc15','#a3e635','#4ade80','#4ade80','#22c55e','#16a34a'];
      const moodBars  = Array.from({length:10},(_,i)=>i+1).map(i => {
        const c = moodDist[i] || 0;
        return `<div style="flex:1;text-align:center">
          <div style="background:var(--border);border-radius:4px;height:50px;display:flex;align-items:flex-end;overflow:hidden">
            <div style="width:100%;height:${Math.round(c/maxCnt*100)}%;background:${MOOD_COL[i]};border-radius:4px 4px 0 0;transition:height .4s"></div>
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${i}</div>
        </div>`;
      }).join('');

      el.innerHTML = `
        <!-- Avatar + tên -->
        <div class="card" style="text-align:center;padding:24px;margin-bottom:16px">
          <div style="display:flex;justify-content:center;margin-bottom:12px">${avatarHtml}</div>
          <div style="font-weight:700;font-size:18px">${escapeHtml(d.fullName || user?.full_name || '')}</div>
          ${d.bio ? `<div style="font-size:13px;color:var(--text-muted);margin-top:4px;white-space:pre-wrap">${escapeHtml(d.bio)}</div>` : ''}
          <div style="margin-top:8px;color:var(--text-muted);font-size:12px">Tham gia: ${new Date(d.joinDate).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
        </div>

        <!-- Cấp độ -->
        <div class="card" style="margin-bottom:16px;padding:16px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
            <span style="font-size:32px">${level.emoji}</span>
            <div>
              <div style="font-weight:700;font-size:16px">${level.name}</div>
              ${xpNxt ? `<div style="font-size:12px;color:var(--text-muted)">${xp} / ${xpNxt} nhật ký → cấp tiếp theo</div>` : '<div style="font-size:12px;color:var(--primary);font-weight:600">Cấp độ cao nhất!</div>'}
            </div>
          </div>
          ${xpNxt ? `<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--primary);border-radius:4px;transition:width .6s"></div></div>` : ''}
        </div>

        <!-- Stats -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px">
          <div class="stat-card"><div class="stat-val">${d.totalEntries}</div><div class="stat-lbl">Tổng nhật ký</div></div>
          <div class="stat-card"><div class="stat-val">${d.avgMood ?? '—'}</div><div class="stat-lbl">Mood trung bình</div></div>
          <div class="stat-card"><div class="stat-val">🔥 ${d.maxStreak}</div><div class="stat-lbl">Streak dài nhất</div></div>
          <div class="stat-card"><div class="stat-val">${d.entryThisMonth}</div><div class="stat-lbl">Tháng này</div></div>
        </div>

        <!-- Phân bố mood -->
        <div class="card" style="margin-bottom:16px;padding:16px">
          <div class="settings-section-title" style="margin-bottom:10px">📊 Phân bố tâm trạng</div>
          <div style="display:flex;gap:3px;align-items:flex-end;height:60px">${moodBars}</div>
        </div>

        <!-- Huy hiệu -->
        <div class="card" style="margin-bottom:16px;padding:16px">
          <div class="settings-section-title" style="margin-bottom:12px">🏅 Huy hiệu đạt được (${earnedBadges.length}/${BADGES.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            ${earnedBadges.map(b => `
              <div title="${escapeHtml(b.name)}" style="text-align:center;background:linear-gradient(135deg,var(--primary),#8b5cf6);border-radius:12px;padding:10px 14px;color:#fff">
                <div style="font-size:24px">${b.emoji}</div>
                <div style="font-size:10px;font-weight:600;margin-top:3px">${escapeHtml(b.name)}</div>
              </div>`).join('')}
            ${lockedBadges.map(b => `
              <div title="${escapeHtml(b.name)}" style="text-align:center;background:var(--border);border-radius:12px;padding:10px 14px;opacity:.4">
                <div style="font-size:24px">${b.emoji}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${escapeHtml(b.name)}</div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Top Tags -->
        ${d.topTags.length ? `<div class="card" style="padding:16px">
          <div class="settings-section-title" style="margin-bottom:10px">🏷️ Tags hay dùng nhất</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${d.topTags.map(t => `<span class="tag" style="cursor:default">#${escapeHtml(t.tag)} <span style="font-size:10px;opacity:.7">${t.cnt}</span></span>`).join('')}
          </div>
        </div>` : ''}
      `;
    } catch(e) {
      el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px">Không tải được hồ sơ.</div>';
    }
  }

  // ── v3.0: AI Coach Tuần (ai_weekly_coach) ────────────────────────────────
  async function loadAICoach() {
    const el = document.getElementById('ai-coach-card');
    if (!el) return;
    if (!window.FEATURES || !window.FEATURES.ai_weekly_coach) return;
    try {
      const d = await API.getAICoach();
      if (!d.advice || !d.advice.length) return;
      el.innerHTML = `<div class="card" style="padding:16px;border-left:4px solid var(--primary)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-weight:700;font-size:14px">🤖 AI Coach tuần này</div>
          <div style="font-size:11px;color:var(--text-muted)">${d.cached ? '📋 Đã lưu' : '✨ Vừa phân tích'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${d.advice.map(a => `
            <div style="background:var(--bg);border-radius:var(--radius);padding:12px 14px;display:flex;gap:10px;align-items:flex-start">
              <span style="font-size:22px;flex-shrink:0">${a.emoji || '💡'}</span>
              <div>
                <div style="font-weight:600;font-size:13px;margin-bottom:3px">${escapeHtml(a.title || '')}</div>
                <div style="font-size:12px;color:var(--text-muted);line-height:1.5">${escapeHtml(a.body || '')}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
      el.style.display = '';
    } catch {}
  }

  // ── v3.0: Xuất PDF báo cáo (pdf_export) ─────────────────────────────────
  async function exportPDF() {
    const monthPicker = document.getElementById('report-month-picker');
    const month = monthPicker ? monthPicker.value : new Date().toISOString().slice(0,7);
    showToast('⏳ Đang chuẩn bị PDF...');
    try {
      const d = await API.getMonthlyReport(month);
      if (!d.totalEntries) { showToast('Không có dữ liệu để xuất.'); return; }
      const moodColor = m => m >= 8 ? '#16a34a' : m >= 5 ? '#d97706' : '#dc2626';
      const user = Auth.getUser();
      const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
        <title>Báo cáo tháng ${month} — Soul Diary</title>
        <style>
          body{font-family:'Segoe UI',sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#1e293b;background:#fff}
          h1{color:#2563eb;margin-bottom:4px;font-size:22px}
          .sub{color:#64748b;font-size:13px;margin-bottom:24px}
          .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
          .stat{background:#f8fafc;border-radius:10px;padding:14px;text-align:center;border:1px solid #e2e8f0}
          .stat-v{font-size:24px;font-weight:700;color:#2563eb}
          .stat-l{font-size:12px;color:#64748b;margin-top:4px}
          .card{background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:16px;border:1px solid #e2e8f0}
          .card-title{font-weight:700;font-size:14px;margin-bottom:10px;color:#374151}
          .tag{display:inline-block;background:#ede9fe;color:#6d28d9;border-radius:20px;padding:3px 10px;font-size:12px;margin:2px}
          @media print{body{padding:16px}}
        </style></head><body>
        <h1>Báo cáo tháng ${month}</h1>
        <div class="sub">Soul Diary · ${escapeHtml(user?.full_name || user?.username || '')} · In ngày ${new Date().toLocaleDateString('vi-VN')}</div>
        <div class="stats">
          <div class="stat"><div class="stat-v">${d.totalEntries}</div><div class="stat-l">Bài viết</div></div>
          <div class="stat"><div class="stat-v" style="color:${moodColor(d.avgMood)}">${d.avgMood}</div><div class="stat-l">Mood trung bình</div></div>
          <div class="stat"><div class="stat-v">${d.entryDays}</div><div class="stat-l">Ngày có nhật ký</div></div>
        </div>
        ${d.bestDay ? `<div class="card"><div class="card-title">📈 Ngày nổi bật</div>
          <p>🏆 Tốt nhất: ${new Date(d.bestDay.date).toLocaleDateString('vi-VN')} — mood <strong>${d.bestDay.avg}/10</strong></p>
          ${d.worstDay ? `<p>💪 Khó nhất: ${new Date(d.worstDay.date).toLocaleDateString('vi-VN')} — mood <strong>${d.worstDay.avg}/10</strong></p>` : ''}
        </div>` : ''}
        ${d.topTags.length ? `<div class="card"><div class="card-title">🏷️ Tags nhiều nhất</div>
          ${d.topTags.map(t => `<span class="tag">#${t.tag} (${t.count})</span>`).join(' ')}
        </div>` : ''}
        <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:32px">Soul Diary — Nhật ký cảm xúc số</p>
      </body></html>`;
      const w = window.open('', '_blank', 'width=800,height=600');
      if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    } catch(e) { showToast('❌ ' + e.message); }
  }

  // ── v2.6: Pomodoro Timer ─────────────────────────────────────────────────
  let _pmState = { mode: 'pomodoro', timeLeft: 25 * 60, running: false, interval: null };
  let _pmTimes = { pomodoro: 25, short: 5, long: 15 };
  let _pmSessions = 0;

  function initPomodoroPage() {
    const todayKey = 'nhk_pomo_' + new Date().toISOString().slice(0, 10);
    _pmSessions = parseInt(localStorage.getItem(todayKey) || '0');
    _updatePomodoroDisplay();
    _syncPomodoroModeButtons();
    const sessEl = document.getElementById('pm-sessions');
    if (sessEl) sessEl.textContent = _pmSessions;
    const inputs = ['pm-custom-pomo', 'pm-custom-short', 'pm-custom-long'];
    const keys   = ['pomodoro', 'short', 'long'];
    inputs.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.value = _pmTimes[keys[i]];
    });
  }

  function setPomodoroMode(mode) {
    if (_pmState.interval) clearInterval(_pmState.interval);
    _pmState = { mode, timeLeft: _pmTimes[mode] * 60, running: false, interval: null };
    _updatePomodoroDisplay();
    _syncPomodoroModeButtons();
    const btn = document.getElementById('pm-start-btn');
    if (btn) btn.textContent = '▶ Bắt đầu';
  }

  function togglePomodoro() {
    if (_pmState.running) {
      clearInterval(_pmState.interval);
      _pmState.running  = false;
      _pmState.interval = null;
      const btn = document.getElementById('pm-start-btn');
      if (btn) btn.textContent = '▶ Tiếp tục';
    } else {
      _pmState.running  = true;
      _pmState.interval = setInterval(_pomodoroTick, 1000);
      const btn = document.getElementById('pm-start-btn');
      if (btn) btn.textContent = '⏸ Tạm dừng';
    }
  }

  function resetPomodoro() {
    if (_pmState.interval) clearInterval(_pmState.interval);
    _pmState.timeLeft = _pmTimes[_pmState.mode] * 60;
    _pmState.running  = false;
    _pmState.interval = null;
    _updatePomodoroDisplay();
    const btn = document.getElementById('pm-start-btn');
    if (btn) btn.textContent = '▶ Bắt đầu';
  }

  function updatePomodoroTimes() {
    _pmTimes.pomodoro = parseInt(document.getElementById('pm-custom-pomo')?.value)  || 25;
    _pmTimes.short    = parseInt(document.getElementById('pm-custom-short')?.value) || 5;
    _pmTimes.long     = parseInt(document.getElementById('pm-custom-long')?.value)  || 15;
    if (!_pmState.running) {
      _pmState.timeLeft = _pmTimes[_pmState.mode] * 60;
      _updatePomodoroDisplay();
    }
  }

  function _pomodoroTick() {
    _pmState.timeLeft--;
    _updatePomodoroDisplay();
    if (_pmState.timeLeft <= 0) {
      clearInterval(_pmState.interval);
      _pmState.running  = false;
      _pmState.interval = null;
      _pomodoroComplete();
    }
  }

  function _updatePomodoroDisplay() {
    const el = document.getElementById('pm-display');
    if (!el) return;
    const m = Math.floor(_pmState.timeLeft / 60);
    const s = _pmState.timeLeft % 60;
    el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function _syncPomodoroModeButtons() {
    const modes = { pomodoro: 'pm-mode-pomo', short: 'pm-mode-short', long: 'pm-mode-long' };
    Object.entries(modes).forEach(([m, id]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.className = m === _pmState.mode ? 'btn-primary' : 'btn-outline';
      btn.style.padding = '8px 18px';
      btn.style.fontSize = '13px';
    });
  }

  function _pomodoroComplete() {
    _beepSound();
    const isPomodoro = _pmState.mode === 'pomodoro';
    if (isPomodoro) {
      _pmSessions++;
      const todayKey = 'nhk_pomo_' + new Date().toISOString().slice(0, 10);
      localStorage.setItem(todayKey, _pmSessions);
      const sessEl = document.getElementById('pm-sessions');
      if (sessEl) sessEl.textContent = _pmSessions;
    }
    const msg = isPomodoro
      ? `🍅 Hoàn thành phiên ${_pmSessions}! Nghỉ ngơi một chút nhé.`
      : '✅ Hết giờ nghỉ! Sẵn sàng tập trung tiếp chưa?';
    showToast(msg);
    const nextMode = isPomodoro ? (_pmSessions % 4 === 0 ? 'long' : 'short') : 'pomodoro';
    setPomodoroMode(nextMode);
  }

  function _beepSound() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const freq = [800, 600, 800];
      freq.forEach((f, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = f;
        const t0 = ctx.currentTime + i * 0.2;
        gain.gain.setValueAtTime(0.4, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
        osc.start(t0);
        osc.stop(t0 + 0.15);
      });
    } catch {}
  }

  // ── v2.6: Câu truyền cảm hứng ────────────────────────────────────────────
  async function loadDailyQuote() {
    const el = document.getElementById('daily-quote-card');
    if (!el) return;
    try {
      // Quote chỉ thay đổi 1 lần/ngày — cache trong sessionStorage theo ngày
      const todayKey  = new Date().toISOString().slice(0, 10);
      const CACHE_KEY = 'nhk_quote_' + todayKey;
      let d;
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        d = JSON.parse(cached);
      } else {
        d = await API.getQuoteToday();
        if (d.quote) sessionStorage.setItem(CACHE_KEY, JSON.stringify(d));
      }
      if (!d.quote) return;
      el.innerHTML = `<div class="card" style="padding:16px;border-left:4px solid var(--primary);background:linear-gradient(135deg,var(--surface),var(--bg))">
        <div style="font-size:13px;color:var(--text);font-style:italic;line-height:1.6;margin-bottom:8px">"${escapeHtml(d.quote.text)}"</div>
        ${d.quote.author ? `<div style="font-size:11px;color:var(--text-muted);font-weight:600;text-align:right">— ${escapeHtml(d.quote.author)}</div>` : ''}
      </div>`;
      el.style.display = '';
    } catch {}
  }

  // ── v2.6: Thống kê năm ───────────────────────────────────────────────────
  function initYearStatsPage() {
    const picker = document.getElementById('year-stats-picker');
    if (picker && !picker.options.length) {
      const thisYear = new Date().getFullYear();
      for (let y = thisYear; y >= thisYear - 5; y--) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        picker.appendChild(opt);
      }
    }
    loadYearStats();
  }

  async function loadYearStats() {
    const picker  = document.getElementById('year-stats-picker');
    const year    = picker ? picker.value : new Date().getFullYear();
    const content = document.getElementById('year-stats-content');
    if (!content) return;
    content.innerHTML = '<div class="loading-text">Đang tải...</div>';
    try {
      const d = await API.getYearStats(year);
      if (!d.totalEntries) {
        content.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--text-muted)">
          <div style="font-size:36px;margin-bottom:12px">📭</div>
          <div>Không có nhật ký nào trong năm ${year}.</div>
        </div>`;
        return;
      }
      const MONTHS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
      const moodColor = m => !m ? 'var(--border)' : m >= 8 ? '#16a34a' : m >= 5 ? '#d97706' : '#dc2626';
      const maxCount  = Math.max(...d.moodByMonth.map(m => m.count), 1);

      const bars = d.moodByMonth.map((m, i) => {
        const pct = Math.round((m.count / maxCount) * 100);
        return `<div style="flex:1;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">${MONTHS[i]}</div>
          <div style="background:var(--border);border-radius:4px;height:70px;display:flex;align-items:flex-end;overflow:hidden">
            <div style="width:100%;height:${pct}%;background:${moodColor(m.avg)};border-radius:4px 4px 0 0;transition:height .4s"></div>
          </div>
          <div style="font-size:10px;font-weight:600;color:${moodColor(m.avg)};margin-top:3px">${m.avg ?? '-'}</div>
        </div>`;
      }).join('');

      const topTagsHtml = d.topTags?.length
        ? d.topTags.map(t => `<span class="tag" style="cursor:default">#${escapeHtml(t.tag)} <span style="opacity:.7;font-size:10px">${t.count}</span></span>`).join(' ')
        : '<span style="color:var(--text-muted);font-size:13px">Chưa dùng tag nào.</span>';

      content.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${d.totalEntries}</div><div class="stat-label">Bài viết cả năm</div></div>
          <div class="stat-card"><div class="stat-value" style="color:${moodColor(d.avgMood)}">${d.avgMood}</div><div class="stat-label">Mood trung bình</div></div>
          <div class="stat-card"><div class="stat-value">🔥 ${d.maxStreak}</div><div class="stat-label">Streak dài nhất</div></div>
        </div>

        ${d.bestMonth || d.busyMonth ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
          ${d.bestMonth ? `<div class="card" style="padding:14px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">🏆 Tháng mood cao nhất</div>
            <div style="font-weight:700;font-size:20px;color:#16a34a">${MONTHS[d.bestMonth.month-1]} · ${d.bestMonth.avg}/10</div>
          </div>` : ''}
          ${d.busyMonth ? `<div class="card" style="padding:14px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">✍️ Tháng viết nhiều nhất</div>
            <div style="font-weight:700;font-size:20px;color:var(--primary)">${MONTHS[d.busyMonth.month-1]} · ${d.busyMonth.count} bài</div>
          </div>` : ''}
        </div>` : ''}

        <div class="card" style="margin-bottom:20px">
          <div class="settings-section-title" style="margin-bottom:12px">📈 Mood trung bình theo tháng</div>
          <div style="display:flex;gap:4px;align-items:flex-end;height:80px">${bars}</div>
          <div style="margin-top:8px;font-size:11px;color:var(--text-hint)">Chiều cao cột = số bài viết · Màu = mood trung bình</div>
        </div>

        <div class="card">
          <div class="settings-section-title" style="margin-bottom:10px">🏷️ Tags dùng nhiều nhất</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${topTagsHtml}</div>
        </div>`;
    } catch {
      content.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:24px">Không tải được thống kê.</div>';
    }
  }

  // ── v2.6: Tự động lưu nháp nhật ký ───────────────────────────────────────
  let _draftInterval = null;

  function _startAutoDraft() {
    if (!window.FEATURES || !window.FEATURES.auto_draft) return;
    if (_draftInterval) clearInterval(_draftInterval);
    _draftInterval = setInterval(_saveDraft, 30000);
  }

  function _saveDraft() {
    const eventText = document.getElementById('event-text')?.value || '';
    const gratitude = document.getElementById('gratitude-text')?.value || '';
    if (!eventText.trim() && !gratitude.trim()) return;
    const selectedTags = Array.from(document.querySelectorAll('.tag-btn.selected')).map(b => b.dataset.tag).join('|');
    localStorage.setItem('nhk_draft', JSON.stringify({
      mood: selectedMood,
      event_text: eventText,
      gratitude,
      tags: selectedTags,
      ts: Date.now(),
    }));
  }

  function _clearDraft() {
    localStorage.removeItem('nhk_draft');
    if (_draftInterval) { clearInterval(_draftInterval); _draftInterval = null; }
    const banner = document.getElementById('draft-restore-banner');
    if (banner) banner.style.display = 'none';
  }

  function _checkDraft() {
    if (!window.FEATURES || !window.FEATURES.auto_draft) return;
    const raw = localStorage.getItem('nhk_draft');
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (Date.now() - d.ts > 24 * 3600 * 1000) { _clearDraft(); return; }
      const banner = document.getElementById('draft-restore-banner');
      if (!banner) return;
      const ago = Math.round((Date.now() - d.ts) / 60000);
      const agoStr = ago < 1 ? 'vừa rồi' : ago + ' phút trước';
      banner.innerHTML = `<div class="card" style="padding:12px 16px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <span style="font-size:13px">📝 Bản nháp chưa lưu (${agoStr})</span>
        <div style="display:flex;gap:8px">
          <button onclick="App.restoreDraft()" style="padding:4px 12px;border-radius:6px;border:2px solid #fff;background:transparent;color:#fff;cursor:pointer;font-size:12px;font-weight:600">Khôi phục</button>
          <button onclick="App.discardDraft()" style="padding:4px 10px;border-radius:6px;border:none;background:rgba(0,0,0,.2);color:#fff;cursor:pointer;font-size:12px">Bỏ qua</button>
        </div>
      </div>`;
      banner.style.display = '';
    } catch { _clearDraft(); }
  }

  function restoreDraft() {
    const raw = localStorage.getItem('nhk_draft');
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.event_text) { const el = document.getElementById('event-text'); if (el) el.value = d.event_text; }
      if (d.gratitude)  { const el = document.getElementById('gratitude-text'); if (el) el.value = d.gratitude; }
      if (d.mood && d.mood !== selectedMood) {
        selectedMood = d.mood;
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.mood) === d.mood));
      }
      if (d.tags) {
        d.tags.split('|').filter(Boolean).forEach(tag => {
          const btn = document.querySelector(`.tag-btn[data-tag="${tag}"]`);
          if (btn && !btn.classList.contains('selected')) btn.click();
        });
      }
      _clearDraft();
      showToast('📝 Đã khôi phục bản nháp!');
    } catch { _clearDraft(); }
  }

  function discardDraft() { _clearDraft(); }

  // ── v2.5: Habit Tracker ───────────────────────────────────────────────────
  let _habitsCache = null;

  async function initHabitsPage() {
    _loadHabitsList();
  }

  async function _loadHabitsList() {
    const el = document.getElementById('habits-list');
    if (!el) return;
    el.innerHTML = Array(3).fill(0).map(() => `
      <div class="card" style="margin-bottom:14px;padding:14px 16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div class="skeleton" style="width:36px;height:36px;border-radius:50%;flex-shrink:0"></div>
          <div style="flex:1"><div class="skeleton" style="height:14px;width:45%"></div></div>
          <div class="skeleton" style="width:52px;height:28px;border-radius:6px"></div>
        </div>
        <div style="display:flex;gap:6px">
          ${Array(7).fill(0).map(() => `<div class="skeleton" style="flex:1;height:28px;border-radius:50%"></div>`).join('')}
        </div>
      </div>`).join('');
    try {
      const d = await API.getHabits();
      _habitsCache = d.habits;
      if (!d.habits.length) {
        el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)">
          <div style="font-size:36px;margin-bottom:12px">🌱</div>
          <div>Chưa có thói quen nào. Thêm thói quen đầu tiên!</div>
        </div>`;
        return;
      }
      const today = new Date();
      const days7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return d.toISOString().slice(0, 10);
      });
      const dayLabels = ['T2','T3','T4','T5','T6','T7','CN','T2','T3','T4','T5','T6','T7','CN'];

      el.innerHTML = d.habits.map(h => {
        const grid = h.days.map((done, i) => {
          const label = dayLabels[new Date(days7[i]).getDay()];
          return `<div style="text-align:center;flex:1">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">${label}</div>
            <div style="width:28px;height:28px;border-radius:50%;margin:0 auto;
              background:${done ? 'var(--primary)' : 'var(--border)'};
              display:flex;align-items:center;justify-content:center;font-size:14px">
              ${done ? '✓' : ''}
            </div>
          </div>`;
        }).join('');

        const streakBadge = h.streak > 0
          ? `<span style="background:var(--primary);color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">🔥 ${h.streak} ngày</span>`
          : '';

        return `<div class="card" style="margin-bottom:12px;padding:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:24px">${escapeHtml(h.icon)}</span>
              <span style="font-weight:600;font-size:15px">${escapeHtml(h.name)}</span>
              ${streakBadge}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button onclick="App.toggleHabit(${h.id}, this)" style="padding:6px 14px;border-radius:var(--radius);border:2px solid var(--primary);
                background:${h.done_today ? 'var(--primary)' : 'transparent'};
                color:${h.done_today ? '#fff' : 'var(--primary)'};
                font-size:13px;font-weight:600;cursor:pointer">
                ${h.done_today ? '✅ Xong' : '○ Làm'}
              </button>
              <button onclick="App.deleteHabit(${h.id},this)" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;padding:4px" title="Xóa">🗑</button>
            </div>
          </div>
          <div style="display:flex;gap:4px">${grid}</div>
        </div>`;
      }).join('');
    } catch (err) {
      if (el) el.innerHTML = `<div class="empty-state" style="padding:32px 0">
        <div style="font-size:32px;margin-bottom:10px">😵</div>
        <div style="color:var(--text-muted);margin-bottom:12px">Không tải được danh sách.</div>
        <button class="btn-outline" style="width:auto;padding:8px 20px" onclick="App._loadHabitsList()">🔄 Thử lại</button>
      </div>`;
    }
  }

  async function createHabit() {
    const icon = (document.getElementById('habit-icon')?.value || '').trim() || '✅';
    const name = (document.getElementById('habit-name')?.value || '').trim();
    if (!name) { showToast('Nhập tên thói quen!'); return; }
    const btn = document.querySelector('#habits-list + div button, button[onclick="App.createHabit()"]');
    try {
      await API.createHabit({ icon, name });
      const iconEl = document.getElementById('habit-icon');
      const nameEl = document.getElementById('habit-name');
      if (iconEl) iconEl.value = '';
      if (nameEl) nameEl.value = '';
      showToast('✅ Đã thêm thói quen!');
      _loadHabitsList();
    } catch (err) { showToast('❌ ' + err.message); }
  }

  async function deleteHabit(id, btn) {
    if (!confirm('Xóa thói quen này và toàn bộ lịch sử?')) return;
    try {
      await API.deleteHabit(id);
      showToast('Đã xóa thói quen.');
      _loadHabitsList();
    } catch (err) { showToast('❌ ' + err.message); }
  }

  async function toggleHabit(id, btn) {
    try {
      const d = await API.toggleHabitLog(id);
      if (_habitsCache) {
        const h = _habitsCache.find(x => x.id === id);
        if (h) {
          h.done_today = d.done;
          if (d.done) h.streak = (h.streak || 0) + 1;
          else h.streak = Math.max(0, (h.streak || 1) - 1);
        }
      }
      if (btn) {
        btn.style.background   = d.done ? 'var(--primary)' : 'transparent';
        btn.style.color        = d.done ? '#fff' : 'var(--primary)';
        btn.textContent        = d.done ? '✅ Xong' : '○ Làm';
      }
      if (d.done && window.FEATURES && window.FEATURES.exercise_suggest) {
        _showExerciseSuggest();
      }
    } catch (err) { showToast('❌ ' + err.message); }
  }

  async function renderHabitDashboardWidget() {
    const el = document.getElementById('habit-dashboard-widget');
    if (!el) return;
    try {
      const d = await API.getHabits();
      if (!d.habits.length) { el.style.display = 'none'; return; }
      const total = d.habits.length;
      const done  = d.habits.filter(h => h.done_today).length;
      el.innerHTML = `<div class="card" style="padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-weight:600;font-size:13px">📋 Thói quen hôm nay</div>
          <span style="font-size:12px;color:var(--text-muted)">${done}/${total} hoàn thành</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${d.habits.map(h => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:var(--radius);background:var(--border)">
              <div style="display:flex;align-items:center;gap:6px">
                <span>${escapeHtml(h.icon)}</span>
                <span style="font-size:13px">${escapeHtml(h.name)}</span>
              </div>
              <button onclick="App.toggleHabit(${h.id},this)" style="width:28px;height:28px;border-radius:50%;border:2px solid var(--primary);
                background:${h.done_today ? 'var(--primary)' : 'transparent'};color:${h.done_today ? '#fff' : 'var(--primary)'};
                font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center">
                ${h.done_today ? '✓' : ''}
              </button>
            </div>`).join('')}
        </div>
        <div style="margin-top:10px;height:4px;background:var(--border);border-radius:2px">
          <div style="width:${Math.round(done/total*100)}%;height:100%;background:var(--primary);border-radius:2px;transition:width .4s"></div>
        </div>
      </div>`;
      el.style.display = '';
    } catch { el.style.display = 'none'; }
  }

  // ── v2.5: Ghim nhật ký ────────────────────────────────────────────────────
  function renderPinnedEntries(entries) {
    const section = document.getElementById('pinned-entries-section');
    if (!section) return;
    const pinned = (entries || []).filter(e => e.is_pinned);
    if (!pinned.length) { section.style.display = 'none'; return; }
    const MOOD_ICONS = ['','😢','😢','😕','😕','😐','😐','🙂','🙂','😄','😄'];
    section.innerHTML = `<div style="font-weight:700;font-size:15px;margin-bottom:10px;display:flex;align-items:center;gap:6px">📌 Nhật ký đã ghim <span style="font-size:12px;color:var(--text-muted);font-weight:400">(${pinned.length})</span></div>
      ${pinned.map(e => `
        <div class="entry-item" onclick="App.openEntry(${e.id})" style="cursor:pointer;margin-bottom:8px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:12px;color:var(--text-muted)">${new Date(e.created_at).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
            <div style="font-size:18px">${MOOD_ICONS[e.mood_score] || ''} <span style="font-size:12px;color:var(--primary);font-weight:700">${e.mood_score}/10</span></div>
          </div>
          ${e.event_text ? `<div style="font-size:13px;color:var(--text);margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${escapeHtml(e.event_text.slice(0,80))}</div>` : ''}
        </div>`).join('')}`;
    section.style.display = '';
  }

  async function togglePinEntry() {
    if (!_shareEntryId) return;
    const btn = document.getElementById('entry-pin-btn');
    try {
      const d = await API.pinEntry(_shareEntryId);
      const pinned = d.is_pinned;
      if (btn) {
        btn.textContent        = pinned ? '📌 Bỏ ghim' : '📌 Ghim';
        btn.dataset.pinned     = pinned ? '1' : '0';
      }
      showToast(pinned ? '📌 Đã ghim nhật ký!' : '📌 Đã bỏ ghim.');
      if (cachedEntries) {
        const idx = cachedEntries.findIndex(e => e.id === _shareEntryId);
        if (idx !== -1) cachedEntries[idx].is_pinned = pinned ? 1 : 0;
      }
      if (window.FEATURES && window.FEATURES.pinned_entries) renderPinnedEntries(cachedEntries);
    } catch (err) { showToast('❌ ' + err.message); }
  }

  // ── v2.5: Gợi ý bài tập cảm xúc ─────────────────────────────────────────
  const EXERCISE_SUGGEST_MAP = [
    { maxScore: 3, label: '😢 Mood thấp', exercises: [
        { icon: '🧘', name: 'Body Scan', action: "App.openBodyScanModal()" },
        { icon: '🌬️', name: 'Thở 4-7-8',  action: "App.openBreathModal()" },
      ]},
    { maxScore: 5, label: '😕 Mood buồn', exercises: [
        { icon: '📦', name: 'Thở hộp',     action: "App.openBoxBreathModal()" },
        { icon: '🤸', name: 'PMR',          action: "App.openPMRModal()" },
      ]},
    { maxScore: 6, label: '😐 Bình thường', exercises: [
        { icon: '🌿', name: '5-4-3-2-1',   action: "App.openGroundingModal()" },
        { icon: '🙏', name: 'Biết ơn',      action: "App.openGratitudeModal()" },
      ]},
  ];

  function _showExerciseSuggest(score) {
    const bucket = EXERCISE_SUGGEST_MAP.find(b => !score || score <= b.maxScore);
    if (!bucket) return;
    const overlay = document.createElement('div');
    overlay.id = 'exercise-suggest-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `<div class="card" style="max-width:360px;width:100%;padding:24px;text-align:center">
      <div style="font-size:28px;margin-bottom:8px">💆</div>
      <div style="font-weight:700;font-size:16px;margin-bottom:6px">Bài tập thư giãn</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:18px">Thử bài tập nhỏ để cải thiện tâm trạng nhé!</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-bottom:18px">
        ${bucket.exercises.map(ex => `
          <button onclick="${ex.action};document.getElementById('exercise-suggest-overlay').remove()" style="flex:1;padding:14px 8px;border-radius:var(--radius);border:2px solid var(--primary);background:transparent;color:var(--primary);cursor:pointer;font-size:13px;font-weight:600">
            <div style="font-size:26px;margin-bottom:4px">${ex.icon}</div>${ex.name}
          </button>`).join('')}
      </div>
      <button onclick="document.getElementById('exercise-suggest-overlay').remove()" style="color:var(--text-muted);background:none;border:none;cursor:pointer;font-size:13px">Bỏ qua</button>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  return {init,nav,saveDiaryEntry,deleteEntry,toggleTag,renderChart,filterArticles,openArticle,closeArticleModal,openBreathModal,closeStreakModal,closeLowMoodAlert,navToSOS,readInboxMsg,handlePhotoUpload,removePhoto,toggleRecording,loadMusicMood,toggleTrack,enablePush,disablePush,setDiaryMode,startCheckin,selectCheckinAnswer,openEntry,closeEntryModal,openLightbox,closeLightbox,openBoxBreathModal,closeBoxBreathModal,openLetterModal,closeLetterModal,burnLetter,openEvidenceModal,closeEvidenceModal,finishEvidenceTesting,openAboutModal,closeAboutModal,switchChartView,calendarMonthNav,renderHeatmap,heatmapYearNav,refreshDailyPrompt,suggestAmbienceMusic,shareMoodWrapped,exportDiaryCSV,printDiaryPDF,toggleNotifDay,saveNotifPrefs,joinChallenge,doChallengeCheckin,quitChallenge,selectCommunityTag,submitCommunityPost,reactPost,deletePost,loadMoreCommunityPosts,switchSettingsTab,saveProfileSettings,changePasswordSettings,saveNotifSettings,toggleNotifDaySetting,deleteAccountSettings,sendChat,chatKeydown,clearChat,createStudyEvent,doneStudy,removeStudy,openCourseLesson,lessonNav,closeLessonModal,onGoalTypeChange,createGoal,removeGoal,yearReviewNav,toggleDarkMode,searchDiary,clearSearch,toggleAdvancedSearch,applyTheme,toggleThemePicker,loadMoreDiary,
    pinInput,pinDelete,setPinLock,managePinLock,installPWA,showMemoryCard,createFutureLetter,deleteFutureLetter,exportUserData,
    openPMRModal,openBodyScanModal,openGroundingModal,startGrounding,toggleGroundingItem,nextGroundingStep,openGratitudeModal,gratitudeNext,gratitudeBack,
    handleAvatarUpload,removeAvatar,_applyWritingHour,renderEmotionRadar,
    shareCurrentEntry,closeShareModal,copyShareLink,revokeCurrentShare,
    sendFriendRequest,acceptFriendRequest,rejectFriendRequest,removeFriend,
    createTemplate,deleteTemplate,editTemplate,saveEditTemplate,openTemplatePicker,closeTemplatePicker,applyTemplate,
    loadMonthlyReport,submitReflection,quickLogMood,
    initHabitsPage,createHabit,deleteHabit,toggleHabit,togglePinEntry,
    initPomodoroPage,setPomodoroMode,togglePomodoro,resetPomodoro,updatePomodoroTimes,
    loadYearStats,restoreDraft,discardDraft,
    initGalleryPage,initNotesPage,selectNoteColor,createNote,deleteNote,
    initMoodComparePage,loadMoodCompare,
    initNotificationsPage,markAllNotifsRead,
    initProfilePage,
    exportPDF,
    toggleSidebar,closeSidebar,scrollToTop,animateCount,haptic,
    _loadReflectionHistory,_loadHabitsList,
    _addRecentTag,_renderRecentTags,
    _confirmResolve: (val) => _confirmResolve && _confirmResolve(val)};
})();
