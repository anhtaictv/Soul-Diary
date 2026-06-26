// js/api.js — Tất cả HTTP calls đến backend
const API = (() => {

  function getToken() {
    return localStorage.getItem('nhk_token');
  }

  async function request(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${CONFIG.API_URL}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      // Token hết hạn → đăng xuất
      localStorage.removeItem('nhk_token');
      localStorage.removeItem('nhk_user');
      window.location.reload();
      return;
    }

    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    return data;
  }

  return {
    // Auth
    register: (body) => request('/auth/register', { method: 'POST', body }),
    login:    (body) => request('/auth/login',    { method: 'POST', body }),
    getMe:    ()     => request('/auth/me'),
    updateProfile: (body) => request('/auth/profile', { method: 'PUT', body }),

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
    getStats:         (days = 14)            => request(`/diary/stats?days=${days}`),
    getMoodCalendar:  (month)                => request(`/diary/calendar${month ? '?month='+month : ''}`),
    getHeatmap:       (year)                 => request(`/diary/heatmap?year=${year || new Date().getFullYear()}`),
    getDailyPrompt:   (refresh)              => request(`/diary/daily-prompt${refresh ? '?refresh=1' : ''}`),
    getEntryCompanion:(id)                   => request(`/diary/${id}/companion`),
    getSmartRecap:    ()                     => request('/diary/smart-recap'),
    getMentalHealth:  ()                     => request('/diary/mental-health'),
    getEntryEmotion:  (id)                   => request(`/diary/${id}/emotion`),
    createEntry:      (body)                 => request('/diary',       { method: 'POST',   body }),
    updateEntry:      (id, body)             => request(`/diary/${id}`,  { method: 'PUT',    body }),
    deleteEntry:      (id)                   => request(`/diary/${id}`,  { method: 'DELETE' }),

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

    // Check-in Sức khỏe Tinh thần hàng tuần
    getCheckinStatus:  ()        => request('/check-in/status'),
    submitCheckin:     (answers) => request('/check-in/submit', { method: 'POST', body: { answers } }),
    getCheckinHistory: ()        => request('/check-in/history'),

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
  };
})();
