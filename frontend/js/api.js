// js/api.js — Tất cả HTTP calls đến backend
const API = (() => {

  function getToken() {
    return localStorage.getItem('nhk_token');
  }

  async function request(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`${CONFIG.API_URL}${path}`, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));

      // Chỉ coi là "phiên hết hạn" với các endpoint CẦN đăng nhập sẵn — không phải
      // dựa vào việc localStorage có token cũ hay không (token cũ/hỏng vẫn có thể
      // còn sót lại dù đang gọi chính /auth/login). 401 từ login/register/quên mật khẩu
      // luôn là "sai thông tin", phải rơi xuống throw bên dưới để hiện đúng thông báo.
      const isPublicAuthCall = path.startsWith('/auth/login') || path.startsWith('/auth/register')
        || path.startsWith('/auth/forgot-password') || path.startsWith('/auth/reset-password');
      if (res.status === 401 && !isPublicAuthCall) {
        localStorage.removeItem('nhk_token');
        localStorage.removeItem('nhk_user');
        window.location.reload();
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('Yêu cầu quá thời gian chờ. Vui lòng thử lại.');
        timeoutErr.isNetworkError = true; // timeout cũng tính là lỗi kết nối, không phải lỗi hợp lệ từ server
        throw timeoutErr;
      }
      if (err instanceof TypeError) err.isNetworkError = true; // fetch() thất bại thẳng (mất mạng/DNS/CORS)
      throw err;
    }
  }

  // ── Hàng đợi thao tác offline (v3.3, flag offline_draft_queue) ──────────
  // Khi mất mạng, nhật ký mới/xoá nhật ký được lưu tạm ở localStorage thay vì báo lỗi mất trắng,
  // và tự đồng bộ lên server khi có mạng lại (App.js gọi flushPendingEntries/flushPendingDeletes
  // qua sự kiện 'online'). Không áp dụng cho sửa nhật ký (updateEntry) vì tính năng đó hiện chưa
  // có UI nào gọi tới.
  const PENDING_ENTRIES_KEY = 'nhk_pending_entries';
  const PENDING_DELETES_KEY = 'nhk_pending_deletes';

  function _getPending(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
  }
  function _savePending(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); return true; }
    catch (_) { return false; } // vd QuotaExceededError khi localStorage đầy
  }
  function _queuePendingEntry(body) {
    const list = _getPending(PENDING_ENTRIES_KEY);
    const tempId = 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    list.push({ tempId, body, ts: Date.now() });
    if (!_savePending(PENDING_ENTRIES_KEY, list))
      throw new Error('Không thể lưu nháp offline (bộ nhớ đầy). Vui lòng thử lại khi có mạng.');
    return { queued: true, tempId };
  }
  function _queuePendingDelete(id) {
    const list = _getPending(PENDING_DELETES_KEY);
    list.push({ id, ts: Date.now() });
    if (!_savePending(PENDING_DELETES_KEY, list))
      throw new Error('Không thể lưu thao tác xoá offline (bộ nhớ đầy). Vui lòng thử lại khi có mạng.');
    return { queued: true };
  }
  async function flushPendingEntries() {
    const list = _getPending(PENDING_ENTRIES_KEY);
    if (!list.length || !navigator.onLine) return { synced: 0, remaining: list.length };
    let synced = 0;
    const remaining = [];
    for (const item of list) {
      try { await request('/diary', { method: 'POST', body: item.body }); synced++; }
      catch (_) { remaining.push(item); } // vẫn lỗi (mất mạng giữa chừng hoặc lỗi thật) — giữ lại thử sau
    }
    _savePending(PENDING_ENTRIES_KEY, remaining);
    return { synced, remaining: remaining.length };
  }
  async function flushPendingDeletes() {
    const list = _getPending(PENDING_DELETES_KEY);
    if (!list.length || !navigator.onLine) return { synced: 0, remaining: list.length };
    let synced = 0;
    const remaining = [];
    for (const item of list) {
      try { await request(`/diary/${item.id}`, { method: 'DELETE' }); synced++; }
      catch (_) { remaining.push(item); }
    }
    _savePending(PENDING_DELETES_KEY, remaining);
    return { synced, remaining: remaining.length };
  }

  return {
    // Auth
    register: (body) => request('/auth/register', { method: 'POST', body }),
    login:    (body) => request('/auth/login',    { method: 'POST', body }),
    getMe:    ()     => request('/auth/me'),
    updateProfile:      (body) => request('/auth/profile',        { method: 'PUT', body }),
    getWritingPattern:  ()     => request('/auth/writing-pattern'),
    getReferral:        ()     => request('/user/referral'),
    getEmergencyContact:  ()     => request('/user/emergency-contact'),
    saveEmergencyContact: (body) => request('/user/emergency-contact', { method: 'PUT', body }),

    // Articles
    getArticles:    (cat='', search='', type='') => request(`/articles?category=${cat}&search=${encodeURIComponent(search)}&type=${type}`),
    getArticle:     (id)                => request(`/articles/${id}`),
    getCategories:  ()                  => request('/articles/categories'),

    // Settings (vd: đường dây hỗ trợ)
    getSetting:    (key)        => request(`/settings/${key}`),
    updateSetting: (key, value) => request(`/settings/${key}`, { method: 'PUT', body: { value } }),

    // Music (thư viện nhạc thư giãn — proxy Jamendo)
    getMusicTracks: (mood='chill') => request(`/music/tracks?mood=${encodeURIComponent(mood)}`),

    // Admin
    getAdminStats:    ()          => request('/admin/stats'),
    getAdminUsers:    ()          => request('/admin/users'),
    updateUserRole:   (id, role)  => request(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
    getAdminArticles: ()          => request('/articles/admin/all'),
    getAdminArticle:  (id)        => request(`/articles/admin/${id}`),
    createArticle:    (body)      => request('/articles',             { method: 'POST',   body }),
    updateArticle:    (id, body)  => request(`/articles/${id}`,       { method: 'PUT',    body }),
    deleteArticle:    (id)        => request(`/articles/${id}`,       { method: 'DELETE' }),
    togglePublish:    (id)        => request(`/articles/${id}/publish`, { method: 'PATCH' }),

    getDiary:         (page = 1, limit = 20) => request(`/diary?page=${page}&limit=${limit}`),
    searchDiary:      (q, from, to)          => request(`/diary/search?q=${encodeURIComponent(q)}${from?'&from='+from:''}${to?'&to='+to:''}`),
    getDiaryPatterns: ()                     => request('/diary/patterns'),
    getStats:         (days = 14)            => request(`/diary/stats?days=${days}`),
    getMoodCalendar:  (month)                => request(`/diary/calendar${month ? '?month='+month : ''}`),
    getHeatmap:       (year)                 => request(`/diary/heatmap?year=${year || new Date().getFullYear()}`),
    getDailyPrompt:   (refresh)              => request(`/diary/daily-prompt${refresh ? '?refresh=1' : ''}`),
    getEntryCompanion:(id)                   => request(`/diary/${id}/companion`),
    getSmartRecap:    ()                     => request('/diary/smart-recap'),
    getMoodForecast:  ()                     => request('/diary/mood-forecast'),
    getRoleplay:      ()                     => request('/diary/roleplay'),
    getRoleplayFeedback: (scenario, response) => request('/diary/roleplay-feedback', { method: 'POST', body: { scenario, response } }),
    getSchoolMoodMap: ()                     => request('/user/school-mood-map'),
    getMentalHealth:  ()                     => request('/diary/mental-health'),
    getEntryEmotion:  (id)                   => request(`/diary/${id}/emotion`),
    getEmotionRadar:  ()                     => request('/diary/emotion-radar'),
    getOnThisDay:     ()                     => request('/diary/on-this-day'),
    shareEntry:       (id)                   => request(`/diary/${id}/share`, { method: 'POST' }),
    revokeShare:      (id)                   => request(`/diary/${id}/share`, { method: 'DELETE' }),
    getSharedEntry:   (token)                => request(`/diary/share/${token}`),
    createEntry:      async (body) => {
      const offlineQueueOn = window.FEATURES && window.FEATURES.offline_draft_queue;
      if (offlineQueueOn && !navigator.onLine) return _queuePendingEntry(body);
      try {
        return await request('/diary', { method: 'POST', body });
      } catch (err) {
        if (offlineQueueOn && err.isNetworkError) return _queuePendingEntry(body);
        throw err;
      }
    },
    flushPendingEntries:    flushPendingEntries,
    getPendingEntryCount:   () => _getPending(PENDING_ENTRIES_KEY).length,
    flushPendingDeletes:    flushPendingDeletes,
    getPendingDeleteCount:  () => _getPending(PENDING_DELETES_KEY).length,
    updateEntry:      (id, body)             => request(`/diary/${id}`,  { method: 'PUT',    body }),
    deleteEntry:      async (id) => {
      const offlineQueueOn = window.FEATURES && window.FEATURES.offline_draft_queue;
      if (offlineQueueOn && !navigator.onLine) return _queuePendingDelete(id);
      try {
        return await request(`/diary/${id}`, { method: 'DELETE' });
      } catch (err) {
        if (offlineQueueOn && err.isNetworkError) return _queuePendingDelete(id);
        throw err;
      }
    },

    // Web Push
    getPushVapidKey:  ()    => request('/push/vapid-public-key'),
    getPushStatus:    ()    => request('/push/status'),
    subscribePush:    (sub) => request('/push/subscribe',  { method: 'POST',   body: sub }),
    unsubscribePush:  ()    => request('/push/subscribe',  { method: 'DELETE' }),

    // Feature flags
    getFeatures:      ()           => request('/features'),
    getAdminFeatures: ()           => request('/features/admin-list'),
    createFeature:    (body)       => request('/features/admin-list',               { method: 'POST',   body }),
    updateFeature:    (key, body)  => request(`/features/admin-list/${key}`,        { method: 'PUT',    body }),
    deleteFeature:    (key)        => request(`/features/admin-list/${key}`,        { method: 'DELETE' }),
    releaseVersion:   (body)       => request('/features/admin-list/release',       { method: 'POST',   body }),
    scheduleVersion:  (body)       => request('/features/admin-list/schedule',      { method: 'POST',   body }),
    revokeVersion:    (body)       => request('/features/admin-list/revoke',        { method: 'POST',   body }),

    // Thông báo hệ thống (banner)
    getActiveAnnouncements:  ()          => request('/announcements/active'),
    getAdminAnnouncements:   ()          => request('/announcements/admin-list'),
    createAnnouncement:      (body)      => request('/announcements',      { method: 'POST',   body }),
    updateAnnouncement:      (id, body)  => request(`/announcements/${id}`, { method: 'PUT',    body }),
    deleteAnnouncement:      (id)        => request(`/announcements/${id}`, { method: 'DELETE' }),

    // Check-in Sức khỏe Tinh thần hàng tuần
    getCheckinStatus:  ()        => request('/check-in/status'),
    submitCheckin:     (answers) => request('/check-in/submit', { method: 'POST', body: { answers } }),
    getCheckinHistory: ()        => request('/check-in/history'),

    // Test tâm lý chuyên sâu (11 bài, on-demand)
    getPsychTests:        ()          => request('/psych-tests'),
    getPsychTestDetail:   (key)       => request(`/psych-tests/${key}`),
    submitPsychTest:      (key, answers) => request(`/psych-tests/${key}/submit`, { method: 'POST', body: { answers } }),
    getPsychTestHistory:  (key)       => request(`/psych-tests/${key}/history`),

    // Hộp thư hỗ trợ
    getInbox:       ()          => request('/inbox'),
    getInboxUnread: ()          => request('/inbox/unread-count'),
    markInboxRead:  (id)        => request(`/inbox/${id}/read`, { method: 'PATCH' }),
    sendOutreach:   (to_user_id, type, content, meta) =>
      request('/admin/outreach', { method: 'POST', body: { to_user_id, type, content, meta } }),

    // Báo cáo hệ thống (admin)
    getAdminReport: () => request('/admin/report'),

    // Nhắc nhở tùy chỉnh
    updateNotifPrefs: (notif_hour, notif_days) =>
      request('/auth/notification-prefs', { method: 'PUT', body: { notif_hour, notif_days } }),

    // Cài đặt tài khoản
    changePassword:  (currentPassword, newPassword) =>
      request('/auth/change-password', { method: 'PUT', body: { currentPassword, newPassword } }),
    forgotPassword:  (email)              => request('/auth/forgot-password',  { method: 'POST', body: { email } }),
    resetPassword:   (token, newPassword) => request('/auth/reset-password',   { method: 'POST', body: { token, newPassword } }),
    deleteAccount:   (password)           => request('/auth/account',           { method: 'DELETE', body: { password } }),

    // Admin reset mật khẩu user
    adminResetUserPassword: (id) => request(`/admin/users/${id}/reset-password`, { method: 'POST' }),

    // Thử thách Sức khỏe Tâm thần
    getChallenges:    ()  => request('/challenges'),
    joinChallenge:    (id) => request(`/challenges/${id}/join`,   { method: 'POST' }),
    challengeCheckin: (id) => request(`/challenges/${id}/checkin`, { method: 'POST' }),
    quitChallenge:    (id) => request(`/challenges/${id}/quit`,    { method: 'DELETE' }),

    // Tâm sự Ẩn danh
    getCommunityPosts:   (page = 1) => request(`/community?page=${page}`),
    createCommunityPost: (content, mood_tag) => request('/community', { method: 'POST', body: { content, mood_tag } }),
    reactCommunityPost:  (id) => request(`/community/${id}/react`, { method: 'POST' }),
    deleteCommunityPost: (id) => request(`/community/${id}`,       { method: 'DELETE' }),
    getCommunityAdmin:   ()   => request('/community/admin-list'),
    hideCommunityPost:   (id) => request(`/community/${id}/hide`,  { method: 'PATCH' }),

    // v1.8 — Soul Chat AI
    getChatHistory:  ()        => request('/chat/history'),
    sendChatMessage: (content) => request('/chat/message', { method: 'POST', body: { content } }),
    clearChat:       ()        => request('/chat/clear',   { method: 'DELETE' }),

    // v1.8 — Lịch Học tập
    getStudyEvents:   (from, to) => request(`/study${from ? `?from=${from}&to=${to}` : ''}`),
    getUpcomingStudy: ()         => request('/study/upcoming'),
    createStudyEvent: (body)     => request('/study',            { method: 'POST',   body }),
    doneStudyEvent:   (id)       => request(`/study/${id}/done`, { method: 'PATCH' }),
    deleteStudyEvent: (id)       => request(`/study/${id}`,      { method: 'DELETE' }),

    // v1.8 — Mini Courses
    getCourses:         ()         => request('/courses'),
    saveCourseProgress: (id, idx)  => request(`/courses/${id}/progress`, { method: 'POST', body: { lesson_index: idx } }),

    // v1.8 — Mục tiêu Cá nhân
    getGoals:    ()     => request('/goals'),
    createGoal:  (body) => request('/goals',      { method: 'POST',   body }),
    deleteGoal:  (id)   => request(`/goals/${id}`, { method: 'DELETE' }),

    // v1.8 — Tổng kết Năm & Giấc ngủ
    getYearReview: (year) => request(`/diary/year-review?year=${year || new Date().getFullYear()}`),
    getSleepStats: ()     => request('/diary/sleep-stats'),

    // v2.0 — Thư gửi tương lai
    getLetters:    ()     => request('/letters'),
    createLetter:  (body) => request('/letters',      { method: 'POST',   body }),
    deleteLetter:  (id)   => request(`/letters/${id}`, { method: 'DELETE' }),

    // v2.0 — Xuất dữ liệu
    exportData: () => request('/user/export'),

    // v2.3 — Streak bạn bè
    getFriends:         ()         => request('/friends'),
    getFriendRequests:  ()         => request('/friends/requests'),
    sendFriendRequest:  (username) => request('/friends/request', { method: 'POST', body: { username } }),
    acceptFriend:       (id)       => request(`/friends/${id}/accept`, { method: 'PUT' }),
    removeFriend:       (id)       => request(`/friends/${id}`,        { method: 'DELETE' }),

    // v2.3 — Nhật ký định kỳ (templates)
    // v2.5 — Ghim nhật ký
    pinEntry:         (id)        => request(`/diary/${id}/pin`, { method: 'PATCH' }),

    // v2.5 — Habit Tracker
    getHabits:        ()          => request('/habits'),
    createHabit:      (body)      => request('/habits',             { method: 'POST',   body }),
    deleteHabit:      (id)        => request(`/habits/${id}`,       { method: 'DELETE' }),
    toggleHabitLog:   (id)        => request(`/habits/${id}/log`,   { method: 'POST' }),

    // v3.6 — Mèo đuổi chuột: bảng xếp hạng
    getGameLeaderboard: (gameKey = 'catmouse') => request(`/game/${gameKey}/leaderboard`),
    submitGameScore:    (score, gameKey = 'catmouse') => request(`/game/${gameKey}/score`, { method: 'POST', body: { score } }),

    // v2.4 — Báo cáo tháng
    getMonthlyReport: (month) => request(`/diary/monthly-report${month ? '?month='+month : ''}`),

    // v2.4 — Phản tư cuối tuần
    getReflectionCurrent: ()        => request('/reflections/current'),
    getReflections:       ()        => request('/reflections'),
    saveReflection:       (body)    => request('/reflections', { method: 'POST', body }),

    getTemplates:    ()          => request('/templates'),
    createTemplate:  (body)      => request('/templates',       { method: 'POST',   body }),
    updateTemplate:  (id, body)  => request(`/templates/${id}`, { method: 'PUT',    body }),
    deleteTemplate:  (id)        => request(`/templates/${id}`, { method: 'DELETE' }),

    // v2.6
    getQuoteToday: ()      => request('/quotes/today'),
    getYearStats:  (year)  => request(`/diary/year-stats${year ? '?year='+year : ''}`),

    // v2.7
    getDiaryGallery: ()           => request('/diary/gallery'),
    compareMood:     (p)          => request(`/diary/compare?from1=${p.from1}&to1=${p.to1}&from2=${p.from2}&to2=${p.to2}`),
    getNotes:        ()           => request('/notes'),
    createNote:      (body)       => request('/notes',       { method: 'POST',   body }),
    deleteNote:      (id)         => request(`/notes/${id}`, { method: 'DELETE' }),

    // v2.8 — Tải đầy đủ 1 entry kèm ảnh/âm thanh (lazy load)
    getDiaryEntry:   (id)         => request('/diary/' + id),

    // v3.0 — Trung tâm Thông báo (notification_center)
    getNotifications:    ()    => request('/notifications'),
    getNotifUnread:      ()    => request('/notifications/unread-count'),
    markNotifRead:       (id)  => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllNotifsRead:   ()    => request('/notifications/read-all',   { method: 'PATCH' }),

    // v3.0 — Hồ sơ Cá nhân (personal_profile)
    getProfileStats: () => request('/auth/profile-stats'),

    // v3.0 — Tìm kiếm Nâng cao (advanced_search) — searchDiary đã được mở rộng với params mới
    // Dùng lại API.searchDiary nhưng với extra params
    searchDiaryAdvanced: (params) => {
      const q = new URLSearchParams();
      if (params.q)        q.set('q',        params.q);
      if (params.from)     q.set('from',     params.from);
      if (params.to)       q.set('to',       params.to);
      if (params.mood_min) q.set('mood_min', params.mood_min);
      if (params.mood_max) q.set('mood_max', params.mood_max);
      if (params.has_media) q.set('has_media', 'true');
      if (params.has_cbt)   q.set('has_cbt',   'true');
      return request('/diary/search?' + q.toString());
    },

    // v3.0 — AI Coach Tuần (ai_weekly_coach)
    getAICoach: () => request('/diary/ai-coach'),
  };
})();
