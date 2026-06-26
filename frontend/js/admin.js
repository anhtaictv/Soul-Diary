// js/admin.js — Trang Quản trị (CRUD bài viết, quản lý người dùng, cài đặt SOS)
const Admin = (() => {

  let allArticles = [];
  let mdeInstance = null;
  let bound       = false;
  let changelogExpanded = false;

  // ── Lịch sử phiên bản ────────────────────────────────────────────────
  const CHANGELOG = [
    {
      version: 'v1.3',
      date: '09/06/2026',
      title: 'AI Thấu hiểu cảm xúc',
      latest: true,
      items: [
        'AI Phân tích cảm xúc tự động: phân tích từng nhật ký (cảm xúc %, chủ đề, gợi ý) ngay sau khi lưu',
        'Dashboard sức khỏe tâm thần nâng cao: 4 chỉ số mới (cảm xúc chủ đạo, ngày căng thẳng nhất, chủ đề áp lực, xu hướng tháng)',
        'Viết nhật ký có hướng dẫn CBT: chế độ 4 bước Sự kiện → Suy nghĩ → Cảm xúc → Hành vi',
        'Feature flag system: admin kiểm soát phát hành tính năng theo phiên bản, hẹn ngày tự động',
      ],
    },
    {
      version: 'v1.2',
      date: '08/06/2026',
      title: 'Giữ chân & Nâng cấp trải nghiệm',
      latest: false,
      items: [
        'Streak đa mốc (7/14/21/30/50/100 ngày) — tặng lượt cứu streak tự động',
        'Lượt cứu streak: tự động bảo vệ khi bỏ đúng 1 ngày',
        'Weekly Recap so sánh 2 tuần tâm trạng trên dashboard',
        'Huy hiệu 9 loại + Level bar 5 bậc (tính toán frontend)',
        'AI Weekly Summary tóm tắt cảm xúc tuần (Google Gemini, cache 1 lần/ngày)',
        'Web Push Notification nhắc nhở đúng giờ thói quen cá nhân',
        'UI: huy hiệu cuộn ngang — gọn, không chiếm chiều cao',
        'UI: trang Đường dây hỗ trợ thiết kế lại thành cards có số điện thoại bấm được',
        '🐛 Sửa lỗi: hộp hướng dẫn cấp quyền microphone khi trình duyệt từ chối — phát hành ngay, không cần bật flag',
        'UI: textarea nhật ký tự resize theo nội dung',
      ],
    },
    {
      version: 'v1.01',
      date: 'Tháng 4/2026',
      title: 'Hoàn thiện nền tảng',
      latest: false,
      items: [
        'Trang quản trị (Admin panel): Tổng quan / Bài viết / Người dùng / Cài đặt',
        'CRUD bài viết & bài tập với EasyMDE editor, hỗ trợ emoji & màu sắc',
        'Quản lý người dùng: nâng/hạ quyền admin',
        'Cài đặt nội dung trang (đường dây hỗ trợ SOS)',
        'Ghi âm nhật ký tối đa 30 giây, lưu kèm audio',
        'Đính kèm ảnh trong nhật ký',
        'Giới hạn tốc độ API (rate limiting) + bảo mật helmet',
      ],
    },
    {
      version: 'v1.0',
      date: 'Tháng 3/2026',
      title: 'Ra mắt ứng dụng',
      latest: false,
      items: [
        'Đăng ký / đăng nhập bảo mật với JWT',
        'Ghi nhật ký cảm xúc hàng ngày với thang đo 1–10',
        'Tags cảm xúc phân loại nhật ký',
        'Biểu đồ xu hướng tâm trạng 7/14/30 ngày',
        'Thư viện bài viết kiến thức tâm lý',
        'Nhạc thư giãn tích hợp (Jamendo API)',
        'Bài tập thở 4-7-8 có hướng dẫn hoạt ảnh',
        'Streak ghi nhật ký liên tiếp hàng ngày',
        'Trang đường dây hỗ trợ khủng hoảng',
      ],
    },
  ];

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ── Entry point — gọi mỗi khi App.nav('admin') ───────────────────────
  function initPage() {
    if (!bound) {
      bound = true;
      document.getElementById('adm-editor-overlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeEditor();
      });
    }
    switchPanel('dashboard');
  }

  // ── Panel switching ───────────────────────────────────────────────────
  function switchPanel(name, btn) {
    document.querySelectorAll('#page-admin .panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('#adm-tabs .tag').forEach(b => b.classList.remove('sel'));
    document.getElementById(`adm-panel-${name}`)?.classList.add('active');
    (btn || document.querySelector(`#adm-tabs [data-panel="${name}"]`))?.classList.add('sel');

    if (name === 'dashboard') loadDashboard();
    if (name === 'articles')  loadArticles();
    if (name === 'users')     loadUsers();
    if (name === 'settings')  loadSettingsPanel();
    if (name === 'features')  loadFeaturesPanel();
  }

  // ── Dashboard ─────────────────────────────────────────────────────────
  async function loadDashboard() {
    try {
      const data = await API.getAdminStats();
      document.getElementById('adm-stat-users').textContent    = data.users;
      document.getElementById('adm-stat-entries').textContent  = data.diary_entries;
      document.getElementById('adm-stat-articles').textContent = data.articles_total;
      document.getElementById('adm-stat-published').textContent= data.articles_published;
      const atRiskEl = document.getElementById('adm-stat-at-risk');
      if (atRiskEl) atRiskEl.textContent = data.at_risk_users ?? '—';
    } catch (e) {}
    await renderChangelog();
  }

  async function renderChangelog() {
    const el = document.getElementById('adm-changelog');
    if (!el) return;

    // Ghép changelog DB (phiên bản mới từ FeatureFlags) + hardcoded (lịch sử cũ)
    let dbVersions = [];
    try {
      const { features } = await API.getAdminFeatures();
      if (features && features.length) {
        const vMap = new Map();
        features.forEach(f => {
          if (!vMap.has(f.version))
            vMap.set(f.version, { title: f.version_title || '', items: [], hasReleased: false, date: null });
          const v = vMap.get(f.version);
          v.items.push(f.label + (f.description ? ' — ' + f.description : ''));
          if (f.enabled && !v.hasReleased) { v.hasReleased = true; v.date = f.released_at ? f.released_at.slice(0,10) : '—'; }
        });
        dbVersions = [...vMap.entries()]
          .filter(([, vd]) => vd.hasReleased)
          .map(([ver, vd]) => ({ version: ver, date: vd.date, title: vd.title, items: vd.items }))
          .sort((a, b) => b.version.localeCompare(a.version));
      }
    } catch (e) {}

    // Loại bỏ những version đã có trong hardcoded để tránh trùng
    const existing = new Set(CHANGELOG.map(v => v.version));
    const merged   = [
      ...dbVersions.filter(v => !existing.has(v.version)),
      ...CHANGELOG,
    ];
    if (!merged.length) return;

    const versionHTML = (v, isLatest) => `
      <div class="chg-version${isLatest ? '' : ' chg-old'}"${!isLatest && !changelogExpanded ? ' style="display:none"' : ''}>
        <div class="chg-ver-header">
          <span class="chg-badge${isLatest ? ' chg-badge-new' : ''}">${v.version}</span>
          <span class="chg-date">${v.date}</span>
          <span class="chg-ver-title">${v.title}</span>
          ${isLatest ? '<span class="chg-new-tag">mới nhất</span>' : ''}
        </div>
        <ul class="chg-list">${v.items.map(i => `<li>${i}</li>`).join('')}</ul>
      </div>`;

    el.innerHTML = `
      <div class="card chg-card">
        <div class="chg-card-header">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:16px">📋</span>
            <span style="font-size:14px;font-weight:700;color:var(--text)">Lịch sử phiên bản</span>
          </div>
          <button class="adm-btn adm-btn-outline" style="font-size:11px;padding:4px 12px" onclick="Admin.toggleChangelog()">
            ${changelogExpanded ? 'Thu gọn ▲' : 'Xem tất cả ▼'}
          </button>
        </div>
        ${merged.map((v, i) => versionHTML(v, i === 0)).join('')}
      </div>`;
  }

  function toggleChangelog() {
    changelogExpanded = !changelogExpanded;
    document.querySelectorAll('#adm-changelog .chg-old').forEach(el => {
      el.style.display = changelogExpanded ? 'block' : 'none';
    });
    const btn = document.querySelector('#adm-changelog .adm-btn');
    if (btn) btn.textContent = changelogExpanded ? 'Thu gọn ▲' : 'Xem tất cả ▼';
  }

  // ── Features Panel ────────────────────────────────────────────────────
  async function loadFeaturesPanel() {
    const el = document.getElementById('adm-panel-features');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-hint)">⏳ Đang tải...</div>';
    try {
      const { features } = await API.getAdminFeatures();
      renderFeaturesPanel(el, features || []);
    } catch (e) {
      el.innerHTML = `<div style="color:var(--rose);padding:20px">Lỗi: ${e.message}</div>`;
    }
  }

  function renderFeaturesPanel(el, features) {
    // Nhóm theo version
    const vMap = new Map();
    features.forEach(f => {
      if (!vMap.has(f.version)) vMap.set(f.version, { title: f.version_title || '', flags: [] });
      vMap.get(f.version).flags.push(f);
    });
    const versions = [...vMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

    const flagRow = f => {
      const statusIcon = f.enabled ? '✅' : (f.release_date ? `🗓 ${f.release_date.slice(0,10)}` : '🔒');
      return `
        <div class="feat-flag-row" id="feat-row-${f.key}">
          <div class="feat-flag-left">
            <span class="feat-flag-status-icon">${statusIcon}</span>
            <div class="feat-flag-info">
              <span class="feat-flag-label">${f.label}</span>
              ${f.description ? `<span class="feat-flag-desc">${f.description}</span>` : ''}
              <code class="feat-flag-key">${f.key}</code>
            </div>
          </div>
          <div class="feat-flag-right">
            ${!f.enabled ? `
              <label class="feat-toggle" title="Bật tính năng ngay">
                <input type="checkbox" onchange="Admin.toggleFlag('${f.key}',this.checked)">
                <span class="feat-toggle-track"><span class="feat-toggle-thumb"></span></span>
              </label>` : `<span class="feat-released-time">${f.released_at ? f.released_at.slice(0,10) : ''}</span>`}
            <button class="feat-del-btn" onclick="Admin.deleteFlag('${f.key}')" title="Xóa">✕</button>
          </div>
        </div>`;
    };

    let html = `
      <div class="adm-panel-header">
        <div>
          <div style="font-size:15px;font-weight:700">Tính năng & Phiên bản phát hành</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Tạo phiên bản → thêm tính năng → phát hành khi sẵn sàng</div>
        </div>
        <button class="adm-btn adm-btn-primary" onclick="Admin.showNewVersionForm()">+ Phiên bản mới</button>
      </div>
      <div id="feat-new-version-wrap"></div>`;

    if (!versions.length) {
      html += `<div class="feat-empty-state">Chưa có phiên bản nào. Nhấn <strong>+ Phiên bản mới</strong> để tạo v1.3 hay bất kỳ phiên bản tiếp theo.</div>`;
    }

    versions.forEach(([ver, vData]) => {
      const allOn     = vData.flags.length > 0 && vData.flags.every(f => f.enabled);
      const scheduled = vData.flags.find(f => !f.enabled && f.release_date);
      const verId     = ver.replace(/\./g, '_');

      let badge = allOn
        ? `<span class="feat-badge feat-released">✅ Đã phát hành</span>`
        : scheduled
          ? `<span class="feat-badge feat-scheduled">🗓 Hẹn ${scheduled.release_date.slice(0,10)}</span>`
          : `<span class="feat-badge feat-draft">🔒 Bản nháp</span>`;

      html += `
        <div class="feat-version-card">
          <div class="feat-version-head">
            <div class="feat-version-meta">
              <span class="feat-version-num">${ver}</span>
              <span class="feat-version-name">${vData.title}</span>
              ${badge}
            </div>
            ${allOn ? `
            <div class="feat-version-actions">
              <button class="adm-btn adm-btn-danger feat-btn-sm" onclick="Admin.revokeAll('${ver}')">↩️ Thu hồi cập nhật</button>
            </div>` : `
            <div class="feat-version-actions">
              <input type="date" class="feat-date-inp" id="sched-${verId}" title="Ngày phát hành tự động">
              <button class="adm-btn adm-btn-outline feat-btn-sm" onclick="Admin.scheduleRelease('${ver}','${verId}')">🗓 Hẹn ngày</button>
              <button class="adm-btn adm-btn-primary feat-btn-sm" onclick="Admin.releaseAll('${ver}')">🚀 Phát hành</button>
            </div>`}
          </div>

          <div class="feat-flags-list">
            ${vData.flags.length
              ? vData.flags.map(flagRow).join('')
              : `<div class="feat-empty-flags">Chưa có tính năng nào trong phiên bản này</div>`}
          </div>

          <div id="feat-add-wrap-${verId}"></div>
          <button class="feat-add-flag-btn" onclick="Admin.showAddFlagForm('${ver}','${vData.title}','${verId}')">
            + Thêm tính năng vào ${ver}
          </button>
        </div>`;
    });

    el.innerHTML = html;
  }

  function showNewVersionForm() {
    const wrap = document.getElementById('feat-new-version-wrap');
    if (!wrap) return;
    if (wrap.innerHTML) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="feat-form-card">
        <div class="feat-form-title">Tạo phiên bản mới</div>
        <div class="feat-form-row">
          <input class="text-input" id="nv-num"   placeholder="Số phiên bản  (vd: v1.3)" style="max-width:160px">
          <input class="text-input" id="nv-title" placeholder="Tiêu đề phiên bản  (vd: Tính năng cộng đồng)" style="flex:1">
        </div>
        <div class="feat-form-title" style="margin-top:12px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)">Tính năng đầu tiên</div>
        <div class="feat-form-row">
          <input class="text-input" id="nv-key" placeholder="Key  (vd: community_feed)" style="max-width:200px">
          <input class="text-input" id="nv-lbl" placeholder="Tên tính năng" style="flex:1">
        </div>
        <input class="text-input" id="nv-desc" placeholder="Mô tả ngắn (tuỳ chọn)" style="margin-bottom:12px">
        <div class="feat-form-actions">
          <button class="adm-btn adm-btn-primary" onclick="Admin.submitNewVersion()">Tạo phiên bản</button>
          <button class="adm-btn adm-btn-outline" onclick="document.getElementById('feat-new-version-wrap').innerHTML=''">Hủy</button>
        </div>
      </div>`;
  }

  async function submitNewVersion() {
    const version = document.getElementById('nv-num')?.value.trim();
    const title   = document.getElementById('nv-title')?.value.trim();
    const key     = document.getElementById('nv-key')?.value.trim();
    const label   = document.getElementById('nv-lbl')?.value.trim();
    const desc    = document.getElementById('nv-desc')?.value.trim();
    if (!version || !title || !key || !label)
      return showToast('⚠️ Nhập đủ: số phiên bản, tiêu đề, key và tên tính năng đầu tiên');
    try {
      await API.createFeature({ key, label, description: desc || null, version, version_title: title });
      showToast(`✅ Đã tạo phiên bản ${version}`);
      document.getElementById('feat-new-version-wrap').innerHTML = '';
      loadFeaturesPanel();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  function showAddFlagForm(version, versionTitle, verId) {
    const wrapId = `feat-add-wrap-${verId}`;
    const wrap   = document.getElementById(wrapId);
    if (!wrap) return;
    if (wrap.innerHTML) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="feat-form-card">
        <div class="feat-form-title">Thêm tính năng vào ${version}</div>
        <input type="hidden" id="ff-ver-${verId}" value="${version}">
        <input type="hidden" id="ff-vtl-${verId}" value="${versionTitle}">
        <div class="feat-form-row">
          <input class="text-input" id="ff-key-${verId}" placeholder="Key  (vd: ai_summary)" style="max-width:200px">
          <input class="text-input" id="ff-lbl-${verId}" placeholder="Tên tính năng" style="flex:1">
        </div>
        <input class="text-input" id="ff-desc-${verId}" placeholder="Mô tả ngắn (tuỳ chọn)" style="margin-bottom:12px">
        <div class="feat-form-actions">
          <button class="adm-btn adm-btn-primary" onclick="Admin.submitAddFlag('${verId}')">Thêm tính năng</button>
          <button class="adm-btn adm-btn-outline" onclick="document.getElementById('${wrapId}').innerHTML=''">Hủy</button>
        </div>
      </div>`;
  }

  async function submitAddFlag(verId) {
    const version = document.getElementById(`ff-ver-${verId}`)?.value;
    const vtitle  = document.getElementById(`ff-vtl-${verId}`)?.value;
    const key     = document.getElementById(`ff-key-${verId}`)?.value.trim();
    const label   = document.getElementById(`ff-lbl-${verId}`)?.value.trim();
    const desc    = document.getElementById(`ff-desc-${verId}`)?.value.trim();
    if (!key || !label) return showToast('⚠️ Nhập key và tên tính năng');
    try {
      await API.createFeature({ key, label, description: desc || null, version, version_title: vtitle });
      showToast('✅ Đã thêm tính năng');
      loadFeaturesPanel();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function toggleFlag(key, enabled) {
    try {
      await API.updateFeature(key, { enabled });
      showToast(enabled ? '✅ Đã bật tính năng — người dùng thấy ngay' : '🔒 Đã tắt tính năng');
      loadFeaturesPanel();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function deleteFlag(key) {
    if (!confirm(`Xóa tính năng "${key}"?\nHành động này không thể hoàn tác.`)) return;
    try {
      await API.deleteFeature(key);
      showToast('🗑 Đã xóa tính năng');
      loadFeaturesPanel();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function releaseAll(version) {
    if (!confirm(`Phát hành tất cả tính năng trong ${version}?\nNgười dùng sẽ thấy ngay sau khi tải lại trang.`)) return;
    try {
      await API.releaseVersion({ version });
      showToast(`🚀 Đã phát hành ${version}`);
      loadFeaturesPanel();
      renderChangelog();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function revokeAll(version) {
    if (!confirm(`Thu hồi cập nhật ${version}?\nTất cả tính năng trong phiên bản này sẽ tắt ngay, người dùng sẽ không còn thấy nữa. Bạn có thể phát hành lại bất cứ lúc nào.`)) return;
    try {
      await API.revokeVersion({ version });
      showToast(`↩️ Đã thu hồi ${version}`);
      loadFeaturesPanel();
      renderChangelog();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  async function scheduleRelease(version, verId) {
    const date = document.getElementById(`sched-${verId}`)?.value;
    if (!date) return showToast('⚠️ Chọn ngày phát hành trước');
    if (!confirm(`Hẹn tự động phát hành ${version} vào ${date}?\nServer sẽ bật tính năng lúc 00:05 giờ VN ngày đó.`)) return;
    try {
      await API.scheduleVersion({ version, release_date: date });
      showToast(`🗓 Đã hẹn phát hành ${version} vào ${date}`);
      loadFeaturesPanel();
    } catch (e) { showToast('❌ ' + e.message); }
  }

  // ── Articles ──────────────────────────────────────────────────────────
  async function loadArticles() {
    try {
      const data = await API.getAdminArticles();
      allArticles = data.articles || [];
      filterArticles();
    } catch (err) { showToast('❌ ' + err.message); }
  }

  function filterArticles() {
    const q      = (document.getElementById('adm-art-search')?.value || '').toLowerCase();
    const type   = document.getElementById('adm-art-filter-type')?.value || '';
    const status = document.getElementById('adm-art-filter-status')?.value || '';
    renderArticles(allArticles.filter(a =>
      (!type   || a.type === type) &&
      (!status || (status === 'published' ? a.is_published : !a.is_published)) &&
      (!q || a.title.toLowerCase().includes(q) || (a.summary || '').toLowerCase().includes(q))
    ));
  }

  function renderArticles(list) {
    const tbody = document.getElementById('adm-articles-tbody');
    tbody.innerHTML = list.length ? list.map(a => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:20px">${a.thumbnail}</span>
            <div>
              <div style="font-weight:600;color:var(--text)">${a.title}</div>
              <div style="font-size:11px;color:var(--text-hint)">${(a.summary || '').substring(0, 60)}…</div>
            </div>
          </div>
        </td>
        <td>${a.type === 'exercise'
          ? '<span class="badge badge-orange">🧘 Bài tập</span>'
          : '<span class="badge badge-green">📚 Thư viện</span>'}</td>
        <td><span class="badge badge-blue">${a.category}</span></td>
        <td>${a.is_published
          ? '<span class="badge badge-green">✅ Đã đăng</span>'
          : '<span class="badge badge-gray">📝 Nháp</span>'}</td>
        <td style="color:var(--text-muted)">${a.view_count || 0}</td>
        <td style="color:var(--text-hint);font-size:12px">${fmtDate(a.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="Admin.editArticle(${a.id})">✏️ Sửa</button>
            <button class="btn btn-sm" style="background:${a.is_published ? '#fff7ed' : '#f0fdf4'};color:${a.is_published ? '#c2410c' : '#16a34a'};border:1px solid ${a.is_published ? '#fed7aa' : '#bbf7d0'}" onclick="Admin.togglePublish(${a.id})">
              ${a.is_published ? '📝 Nháp' : '🚀 Đăng'}
            </button>
            <button class="btn btn-sm" style="background:var(--rose-light);color:var(--rose);border:1px solid #fecdd3" onclick="Admin.deleteArticle(${a.id})">🗑</button>
          </div>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;color:var(--text-hint);padding:40px">Chưa có bài viết nào. Hãy viết bài đầu tiên!</td></tr>`;
  }

  async function togglePublish(id) {
    try {
      const data = await API.togglePublish(id);
      showToast(data.message);
      loadArticles();
      loadDashboard();
    } catch (err) { showToast('❌ ' + err.message); }
  }

  async function deleteArticle(id) {
    if (!confirm('Xóa bài viết này?')) return;
    try {
      await API.deleteArticle(id);
      showToast('🗑 Đã xóa.');
      loadArticles();
      loadDashboard();
    } catch (err) { showToast('❌ ' + err.message); }
  }

  // ── Editor ────────────────────────────────────────────────────────────
  function openEditor(article = null) {
    document.getElementById('adm-editor-overlay').classList.add('open');
    document.getElementById('adm-editor-mode-title').textContent = article ? '✏️ Sửa bài viết' : '✏️ Viết bài mới';
    document.getElementById('adm-editing-id').value    = article?.id        || '';
    document.getElementById('adm-art-title').value     = article?.title     || '';
    document.getElementById('adm-art-type').value      = article?.type      || 'library';
    document.getElementById('adm-art-category').value  = article?.category  || 'stress';
    document.getElementById('adm-art-readtime').value  = article?.read_time || '5 phút';
    document.getElementById('adm-art-summary').value   = article?.summary   || '';
    document.getElementById('adm-art-thumbnail').value = article?.thumbnail || '🧠';
    document.getElementById('adm-art-color').value     = article?.cover_color || '#eef2ff';

    document.querySelectorAll('#adm-emoji-grid .adm-emoji-opt').forEach(el => {
      el.classList.toggle('sel', el.dataset.emoji === (article?.thumbnail || '🧠'));
    });
    document.querySelectorAll('#adm-color-grid .adm-color-opt').forEach(el => {
      el.classList.toggle('sel', el.dataset.color === (article?.cover_color || '#eef2ff'));
    });

    if (mdeInstance) { mdeInstance.toTextArea(); mdeInstance = null; }
    const textarea = document.getElementById('adm-art-content');
    textarea.value = article?.content || '';
    mdeInstance = new EasyMDE({
      element: textarea,
      spellChecker: false,
      autofocus: true,
      placeholder: '# Tiêu đề bài viết\n\nViết nội dung bằng Markdown...\n\n## Mục 1\n\nNội dung...',
      toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', '|', 'preview', 'side-by-side', 'fullscreen', '|', 'guide'],
    });
  }

  async function editArticle(id) {
    try {
      const data = await API.getAdminArticle(id);
      openEditor(data.article);
    } catch (err) { showToast('❌ ' + err.message); }
  }

  function closeEditor() {
    document.getElementById('adm-editor-overlay').classList.remove('open');
    if (mdeInstance) { mdeInstance.toTextArea(); mdeInstance = null; }
  }

  async function saveArticle(publish) {
    const id      = document.getElementById('adm-editing-id').value;
    const title   = document.getElementById('adm-art-title').value.trim();
    const content = mdeInstance ? mdeInstance.value() : '';

    if (!title)   { showToast('⚠️ Vui lòng nhập tiêu đề.'); return; }
    if (!content) { showToast('⚠️ Vui lòng nhập nội dung.'); return; }

    const body = {
      title,
      type:         document.getElementById('adm-art-type').value,
      category:     document.getElementById('adm-art-category').value,
      summary:      document.getElementById('adm-art-summary').value,
      content,
      thumbnail:    document.getElementById('adm-art-thumbnail').value,
      cover_color:  document.getElementById('adm-art-color').value,
      read_time:    document.getElementById('adm-art-readtime').value,
      is_published: publish,
    };

    try {
      const data = id
        ? await API.updateArticle(id, body)
        : await API.createArticle(body);
      showToast(data.message);
      closeEditor();
      loadArticles();
      loadDashboard();
    } catch (err) { showToast('❌ ' + err.message); }
  }

  function selectEmoji(el) {
    document.querySelectorAll('#adm-emoji-grid .adm-emoji-opt').forEach(e => e.classList.remove('sel'));
    el.classList.add('sel');
    document.getElementById('adm-art-thumbnail').value = el.dataset.emoji;
  }

  function selectColor(el) {
    document.querySelectorAll('#adm-color-grid .adm-color-opt').forEach(e => e.classList.remove('sel'));
    el.classList.add('sel');
    document.getElementById('adm-art-color').value = el.dataset.color;
  }

  // ── Users ─────────────────────────────────────────────────────────────
  async function loadUsers() {
    try {
      const data  = await API.getAdminUsers();
      const tbody = document.getElementById('adm-users-tbody');
      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700">${u.avatar_text || 'SV'}</div>
              <div style="font-weight:600">${u.full_name || u.username}</div>
            </div>
          </td>
          <td style="color:var(--text-muted)">${u.email}</td>
          <td>${u.role === 'admin'
            ? '<span class="badge badge-orange">👑 Admin</span>'
            : '<span class="badge badge-gray">User</span>'}</td>
          <td><span style="color:#f97316;font-weight:600">🔥 ${u.streak}</span></td>
          <td style="color:var(--text-muted)">${u.diary_count}</td>
          <td style="color:var(--text-hint);font-size:12px">${fmtDate(u.created_at)}</td>
          <td>
            ${u.role !== 'admin'
              ? `<button class="btn btn-outline btn-sm" onclick="Admin.promoteUser(${u.id})">👑 Cấp Admin</button>`
              : `<button class="btn btn-sm" style="background:var(--rose-light);color:var(--rose);border:1px solid #fecdd3" onclick="Admin.demoteUser(${u.id})">Thu hồi</button>`}
          </td>
        </tr>`).join('');
    } catch (err) { showToast('❌ ' + err.message); }
  }

  async function promoteUser(id) {
    if (!confirm('Cấp quyền Admin cho người dùng này?')) return;
    try { const d = await API.updateUserRole(id, 'admin'); showToast(d.message); loadUsers(); }
    catch (err) { showToast('❌ ' + err.message); }
  }
  async function demoteUser(id) {
    if (!confirm('Thu hồi quyền Admin?')) return;
    try { const d = await API.updateUserRole(id, 'user'); showToast(d.message); loadUsers(); }
    catch (err) { showToast('❌ ' + err.message); }
  }

  // ── Settings ──────────────────────────────────────────────────────────
  async function loadSettingsPanel() {
    try {
      const data = await API.getSetting('sos_contacts');
      document.getElementById('adm-sos-textarea').value = data.value || '';
    } catch (err) { showToast('❌ ' + err.message); }
  }

  async function saveSOSSetting() {
    try {
      const value = document.getElementById('adm-sos-textarea').value;
      const data  = await API.updateSetting('sos_contacts', value);
      showToast(data.message || '💾 Đã lưu.');
    } catch (err) { showToast('❌ ' + err.message); }
  }

  return {
    initPage, switchPanel, filterArticles,
    openEditor, editArticle, closeEditor, saveArticle,
    selectEmoji, selectColor,
    togglePublish, deleteArticle,
    promoteUser, demoteUser,
    saveSOSSetting,
    toggleChangelog,
    showNewVersionForm, submitNewVersion,
    showAddFlagForm, submitAddFlag,
    toggleFlag, deleteFlag, releaseAll, scheduleRelease, revokeAll,
  };
})();
