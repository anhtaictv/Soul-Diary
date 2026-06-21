// js/pages.js — HTML templates (Soul Diary updated)
const PAGES = {

  dashboard: () => `
    <div class="page active" id="page-dashboard">
      <div class="page-header">
        <div class="page-title">Chào mừng trở lại 👋</div>
        <div class="page-sub">Khi cảm xúc được gọi tên, tâm trí sẽ tìm thấy lối về.</div>
      </div>
      <div class="disclaimer">⚠️ <span><strong>Tuyên bố miễn trừ trách nhiệm:</strong> Ứng dụng không thay thế liệu pháp tâm lý chuyên môn.</span></div>
      <div class="grid-4" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-val" id="dash-entries"><div class="skeleton"></div></div><div class="stat-lbl">Nhật ký đã ghi</div></div>
        <div class="stat-card"><div class="stat-val" id="dash-avg">—</div><div class="stat-lbl">Điểm TB 7 ngày</div></div>
        <div class="stat-card"><div class="stat-val" id="dash-streak">—</div><div class="stat-lbl">Chuỗi ngày 🔥</div></div>
        <div class="stat-card"><div class="stat-val" id="dash-today">—</div><div class="stat-lbl">Hôm nay</div></div>
      </div>

      <!-- Weekly streak calendar -->
      <div class="streak-calendar-card" id="streak-calendar-card"></div>

      <!-- Thanh cấp độ cảm xúc -->
      <div id="dash-level-bar"></div>

      <!-- Hạt mầm tâm hồn (ẩn cho đến khi feature soul_seed được bật) -->
      <div id="soul-seed-section" style="display:none"></div>

      <div class="quick-mood-section">
        <div class="quick-mood-title">Chấm điểm nhanh hôm nay</div>
        <div class="quick-mood-sub">Mất chưa đến 30 giây</div>
        <div class="mood-icon-scale" id="quick-mood-scale"></div>
        <div class="mood-label-row"><span>😔 Rất tệ</span><span>😊 Rất tốt</span></div>
        <button class="btn-primary" style="margin-top:12px;max-width:200px" onclick="App.nav('diary')">✍️ Viết nhật ký</button>
      </div>
      <div class="section-label">Gợi ý dành cho bạn</div>
      <div id="recommendations"></div>

      <!-- Push notification opt-in -->
      <div id="push-optin-banner"></div>

      <!-- Recap tuần này -->
      <div id="weekly-recap"></div>

      <!-- Dashboard sức khỏe tâm thần nâng cao (v1.3, ẩn cho đến khi feature được bật) -->
      <div id="mental-health-section" style="display:none">
        <div class="section-label">Sức khỏe tâm thần 30 ngày qua</div>
        <div class="grid-4" id="mental-health-cards"></div>
      </div>

      <!-- Huy hiệu -->
      <div class="section-label" id="badges-label" style="display:none">Huy hiệu của bạn</div>
      <div id="badges-grid"></div>

      <div class="section-label">Nhật ký gần đây</div>
      <div id="dash-recent-entries"><div class="loading-text">Đang tải...</div></div>
    </div>`,

  diary: () => `
    <div class="page active" id="page-diary">
      <div class="page-header">
        <div class="page-title">Hôm nay của bạn thế nào? 📖</div>
        <div class="page-sub">Không gian riêng tư — an toàn — chỉ dành cho bạn</div>
      </div>
      <div class="grid-2">
        <div>
          <div class="card" id="diary-form-card">
            <div class="form-group">
              <label class="form-label">Điểm tâm trạng hôm nay</label>
              <div class="mood-icon-scale" id="diary-mood-scale" style="justify-content:flex-start;gap:4px;flex-wrap:wrap;margin:8px 0"></div>
              <div id="ambience-music-suggest" style="display:none;margin-top:6px"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Cảm xúc chủ đạo</label>
              <div class="tag-row" id="emotion-tags"></div>
            </div>

            <!-- Gợi ý chủ đề viết hôm nay (ẩn cho đến khi feature soul_companion được bật) -->
            <div class="daily-prompt-card" id="daily-prompt-card" style="display:none">
              <div class="daily-prompt-label">💭 Gợi ý hôm nay</div>
              <div class="daily-prompt-text" id="daily-prompt-text">—</div>
              <button class="daily-prompt-refresh" onclick="App.refreshDailyPrompt()" title="Gợi ý khác">🔄</button>
            </div>

            <!-- Chọn chế độ viết (ẩn cho đến khi feature cbt_guided_writing được bật) -->
            <div id="diary-mode-toggle" style="display:none;margin-bottom:16px">
              <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px">Chế độ viết nhật ký</div>
              <div style="display:flex;gap:8px">
                <button class="tag sel" id="mode-free" onclick="App.setDiaryMode('free',this)">✍️ Tự do</button>
                <button class="tag"     id="mode-cbt"  onclick="App.setDiaryMode('cbt',this)">🧠 Hướng dẫn CBT</button>
              </div>
            </div>

            <!-- Bắt đầu viết nhật ký (tự do) -->
            <div class="form-group" id="diary-free-section">
              <label class="form-label">Bắt đầu viết nhật ký</label>
              <textarea class="diary-textarea" id="diary-event" placeholder="Viết tự do bất cứ điều gì bạn muốn..."></textarea>
            </div>

            <!-- Form viết nhật ký theo hướng dẫn CBT (4 bước) -->
            <div id="cbt-form" style="display:none">
              <div class="cbt-intro-box">
                <strong>Phương pháp CBT</strong> giúp bạn nhận ra mối liên hệ giữa <em>sự kiện → suy nghĩ → cảm xúc → hành vi</em>, từ đó thay đổi các vòng suy nghĩ tiêu cực.
              </div>
              <div class="form-group">
                <label class="form-label">1. Sự kiện <span class="cbt-step-hint">Điều gì đã xảy ra?</span></label>
                <textarea class="diary-textarea" id="cbt-event" placeholder="Mô tả ngắn gọn sự kiện hoặc tình huống đã xảy ra..."></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">2. Suy nghĩ <span class="cbt-step-hint">Bạn đã nghĩ gì?</span></label>
                <textarea class="diary-textarea" id="cbt-thoughts" placeholder="Những suy nghĩ tự động xuất hiện trong đầu bạn lúc đó..."></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">3. Cảm xúc <span class="cbt-step-hint">Bạn cảm thấy thế nào? (mức 1–10)</span></label>
                <textarea class="diary-textarea" id="cbt-feelings" placeholder="Những cảm xúc bạn trải nghiệm (buồn, lo, tức...) và cường độ từ 1–10..."></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">4. Hành vi <span class="cbt-step-hint">Bạn đã làm gì sau đó?</span></label>
                <textarea class="diary-textarea" id="cbt-behavior" placeholder="Bạn đã phản ứng hoặc hành động thế nào?..."></textarea>
              </div>
            </div>

            <!-- Upload ảnh (thay "Suy nghĩ & cảm xúc") -->
            <div class="form-group">
              <label class="form-label">Thêm ảnh cảm xúc</label>
              <div class="photo-upload-area" id="photo-upload-area" onclick="document.getElementById('photo-input').click()">
                <div class="photo-upload-icon">📷</div>
                <div class="photo-upload-text">Nhấn để thêm ảnh</div>
                <div class="photo-upload-sub">JPG, PNG — tối đa 2MB/ảnh, 4 ảnh</div>
                <input type="file" id="photo-input" accept="image/*" multiple style="display:none" onchange="App.handlePhotoUpload(event)" />
              </div>
              <div class="photo-preview-row" id="photo-preview-row"></div>
            </div>

            <!-- Ghi âm (thay "1 điều tốt đẹp") -->
            <div class="form-group">
              <label class="form-label">Ghi âm cảm xúc</label>
              <div class="audio-recorder" id="audio-recorder">
                <button class="record-btn" id="record-btn" onclick="App.toggleRecording()">
                  <span class="record-icon">🎙️</span>
                  <span id="record-label">Nhấn để ghi âm</span>
                </button>
                <div class="record-timer" id="record-timer" style="display:none">⏱ <span id="record-time">0:00</span></div>
                <audio id="audio-playback" controls style="display:none;width:100%;margin-top:8px"></audio>
              </div>
            </div>

            <button class="btn-primary" id="btn-save-diary" onclick="App.saveDiaryEntry()">💾 Lưu nhật ký</button>
            <div class="companion-message-box" id="companion-message-box" style="display:none"></div>
          </div>
        </div>
        <div>
          <div class="section-label">Các nhật ký đã lưu</div>
          <div id="diary-entries-list"><div class="loading-text">Đang tải...</div></div>
        </div>
      </div>
    </div>`,

  chart: () => `
    <div class="page active" id="page-chart">
      <div class="page-header">
        <div class="page-title">Biểu đồ tâm trạng 📊</div>
        <div class="page-sub">Theo dõi xu hướng cảm xúc theo thời gian</div>
      </div>

      <!-- Streak calendar full -->
      <div class="streak-calendar-card" id="chart-streak-calendar" style="margin-bottom:16px"></div>

      <!-- Toggle biểu đồ / lịch tâm trạng (ẩn cho đến khi feature mood_calendar được bật) -->
      <div id="chart-view-toggle" style="display:none;margin-bottom:16px">
        <button class="tag sel" id="chart-view-btn-chart"    onclick="App.switchChartView('chart',this)">📈 Biểu đồ</button>
        <button class="tag"     id="chart-view-btn-calendar" onclick="App.switchChartView('calendar',this)">📅 Lịch tâm trạng</button>
      </div>

      <div id="chart-line-section">
        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div style="font-size:15px;font-weight:600">Điểm tâm trạng theo ngày</div>
            <div style="display:flex;gap:8px">
              <button class="btn-outline" onclick="App.renderChart(7)"  style="padding:6px 14px;font-size:12px">7 ngày</button>
              <button class="btn-outline" onclick="App.renderChart(14)" style="padding:6px 14px;font-size:12px">14 ngày</button>
              <button class="btn-outline" onclick="App.renderChart(30)" style="padding:6px 14px;font-size:12px">30 ngày</button>
            </div>
          </div>
          <div class="chart-wrapper"><canvas id="moodChart"></canvas></div>
        </div>

        <!-- Colorful stat cards -->
        <div class="grid-3" style="margin-bottom:16px">
          <div class="stat-card-colored" style="background:linear-gradient(135deg,#6366f1,#818cf8)">
            <div class="stat-val-white" id="stat-avg">—</div><div class="stat-lbl-white">Điểm trung bình</div>
          </div>
          <div class="stat-card-colored" style="background:linear-gradient(135deg,#10b981,#34d399)">
            <div class="stat-val-white" id="stat-high">—</div><div class="stat-lbl-white">Điểm cao nhất</div>
          </div>
          <div class="stat-card-colored" style="background:linear-gradient(135deg,#f97316,#fb923c)">
            <div class="stat-val-white" id="stat-low">—</div><div class="stat-lbl-white">Điểm thấp nhất</div>
          </div>
        </div>

        <div class="section-label">Tần suất cảm xúc</div>
        <div id="emotion-frequency" class="grid-4"></div>
      </div>

      <!-- Bản đồ thời tiết tâm hồn (ẩn cho đến khi chọn view "Lịch tâm trạng") -->
      <div id="mood-calendar-section" style="display:none">
        <div class="card">
          <div class="mood-cal-nav">
            <button class="btn-outline" style="padding:6px 12px;font-size:12px" onclick="App.calendarMonthNav(-1)">◀</button>
            <div class="mood-cal-month-label" id="mood-cal-month-label">—</div>
            <button class="btn-outline" style="padding:6px 12px;font-size:12px" onclick="App.calendarMonthNav(1)">▶</button>
          </div>
          <div class="mood-calendar-grid" id="mood-calendar-grid"></div>
        </div>
      </div>
    </div>`,

  library: () => `
    <div class="page active" id="page-library">
      <div class="page-header">
        <div class="page-title">Thư viện kiến thức 📚</div>
        <div class="page-sub">Tâm lý học ứng dụng cho sinh viên đại học</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap" id="lib-filters">
        <button class="tag sel" onclick="App.filterArticles('all',this)">Tất cả</button>
        <button class="tag"     onclick="App.filterArticles('stress',this)">Stress</button>
        <button class="tag"     onclick="App.filterArticles('sleep',this)">Giấc ngủ</button>
        <button class="tag"     onclick="App.filterArticles('relationship',this)">Mối quan hệ</button>
        <button class="tag"     onclick="App.filterArticles('study',this)">Học tập</button>
        <button class="tag"     onclick="App.filterArticles('depression',this)">Trầm cảm</button>
      </div>
      <div class="grid-3" id="articles-grid"></div>
    </div>`,

  exercises: () => `
    <div class="page active" id="page-exercises">
      <div class="page-header">
        <div class="page-title">Bài tập thực hành 🧘</div>
        <div class="page-sub">Các kỹ thuật dựa trên bằng chứng khoa học</div>
      </div>
      <div class="grid-2" id="exercises-grid"></div>
      <div id="exercises-articles" style="display:none;margin-top:28px">
        <div style="font-family:'Nunito',sans-serif;font-weight:800;font-size:17px;margin-bottom:14px">📰 Hướng dẫn thêm từ đội ngũ Soul Diary</div>
        <div class="grid-3" id="exercises-articles-grid"></div>
      </div>
    </div>`,

  music: () => `
    <div class="page active" id="page-music">
      <div class="page-header">
        <div class="page-title">Nhạc thư giãn 🎧</div>
        <div class="page-sub">Giai điệu nhẹ nhàng từ Jamendo giúp bạn thư giãn, tập trung và ngủ ngon hơn</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap" id="music-moods">
        <button class="tag sel" data-mood="chill"  onclick="App.loadMusicMood('chill',this)">🌿 Thư giãn</button>
        <button class="tag"     data-mood="focus"  onclick="App.loadMusicMood('focus',this)">📖 Tập trung học bài</button>
        <button class="tag"     data-mood="sleep"  onclick="App.loadMusicMood('sleep',this)">🌙 Dễ ngủ</button>
        <button class="tag"     data-mood="nature" onclick="App.loadMusicMood('nature',this)">🍃 Thiên nhiên</button>
      </div>
      <div id="music-loading" style="text-align:center;color:var(--text-hint);padding:50px 20px">⏳ Đang tải nhạc…</div>
      <div class="grid-3" id="music-grid" style="display:none"></div>
      <div id="music-empty" style="display:none;text-align:center;color:var(--text-hint);padding:50px 20px">Không tải được danh sách nhạc lúc này. Vui lòng thử lại sau.</div>
    </div>`,

  checkin: () => `
    <div class="page active" id="page-checkin">
      <div class="page-header">
        <div class="page-title">Check-in Sức khỏe Tinh thần 🧪</div>
        <div class="page-sub">Bài sàng lọc ngắn mỗi tuần giúp bạn theo dõi cảm xúc, lo âu và căng thẳng của bản thân</div>
      </div>
      <div id="checkin-content"></div>
    </div>`,

  sos: () => `
    <div class="page active" id="page-sos">
      <div class="page-header">
        <div class="page-title">Các đường dây hỗ trợ 📞</div>
        <div class="page-sub">Luôn có người sẵn sàng lắng nghe bạn</div>
      </div>
      <div class="sos-banner">
        <div class="sos-banner-icon">❤️</div>
        <div>
          <div class="sos-banner-title">Bạn không một mình</div>
          <div class="sos-banner-text">Nếu bạn đang trong tình trạng khẩn cấp hoặc có ý định tự hại, xin hãy liên hệ ngay các đường dây bên dưới.</div>
        </div>
      </div>
      <div id="sos-contacts"></div>
    </div>`,

  admin: () => `
    <div class="page active" id="page-admin">
      <div class="page-header">
        <div class="page-title">Quản trị hệ thống 🛠️</div>
        <div class="page-sub">Quản lý bài viết, người dùng và cấu hình ứng dụng</div>
      </div>

      <div class="adm-tabs" id="adm-tabs">
        <button class="tag sel" data-panel="dashboard" onclick="Admin.switchPanel('dashboard',this)">📊 Tổng quan</button>
        <button class="tag"     data-panel="articles"  onclick="Admin.switchPanel('articles',this)">📝 Bài viết</button>
        <button class="tag"     data-panel="users"     onclick="Admin.switchPanel('users',this)">👥 Người dùng</button>
        <button class="tag"     data-panel="settings"  onclick="Admin.switchPanel('settings',this)">⚙️ Cài đặt</button>
        <button class="tag"     data-panel="features"  onclick="Admin.switchPanel('features',this)">🚀 Tính năng</button>
      </div>

      <!-- Dashboard panel -->
      <div class="panel active" id="adm-panel-dashboard">
        <div class="grid-4" style="margin-bottom:20px">
          <div class="stat-card"><div class="stat-val" id="adm-stat-users">—</div><div class="stat-lbl">Người dùng</div></div>
          <div class="stat-card"><div class="stat-val" id="adm-stat-entries">—</div><div class="stat-lbl">Nhật ký đã ghi</div></div>
          <div class="stat-card"><div class="stat-val" id="adm-stat-articles">—</div><div class="stat-lbl">Tổng bài viết</div></div>
          <div class="stat-card"><div class="stat-val" id="adm-stat-published">—</div><div class="stat-lbl">Đã xuất bản</div></div>
        </div>
        <div class="card">
          <div style="font-size:15px;font-weight:600;margin-bottom:6px">Thao tác nhanh</div>
          <div style="font-size:12px;color:var(--text-muted)">Viết bài viết hoặc bài tập mới cho thư viện kiến thức</div>
          <div class="adm-quick-actions">
            <button class="adm-btn adm-btn-primary" onclick="Admin.openEditor()">✏️ Viết bài mới</button>
            <button class="adm-btn adm-btn-outline" onclick="Admin.switchPanel('articles')">📝 Quản lý bài viết</button>
            <button class="adm-btn adm-btn-outline" onclick="Admin.switchPanel('users')">👥 Quản lý người dùng</button>
          </div>
        </div>
        <div id="adm-changelog"></div>
      </div>

      <!-- Articles panel -->
      <div class="panel" id="adm-panel-articles">
        <div class="adm-panel-header">
          <div style="font-size:15px;font-weight:700">Quản lý bài viết &amp; bài tập</div>
          <button class="adm-btn adm-btn-primary" onclick="Admin.openEditor()">✏️ Viết bài mới</button>
        </div>
        <div class="adm-search-row">
          <input class="text-input" type="text" id="adm-art-search" placeholder="Tìm theo tiêu đề..." oninput="Admin.filterArticles()" />
          <select class="text-input" id="adm-art-filter-type" style="max-width:180px" onchange="Admin.filterArticles()">
            <option value="">Tất cả mục</option>
            <option value="library">📚 Thư viện</option>
            <option value="exercise">🧘 Bài tập</option>
          </select>
          <select class="text-input" id="adm-art-filter-status" style="max-width:180px" onchange="Admin.filterArticles()">
            <option value="">Tất cả trạng thái</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Bản nháp</option>
          </select>
        </div>
        <div class="card">
          <div class="tbl-wrap">
            <table>
              <thead><tr>
                <th>Tiêu đề</th><th>Mục</th><th>Danh mục</th><th>Trạng thái</th><th>Lượt xem</th><th>Ngày tạo</th><th>Thao tác</th>
              </tr></thead>
              <tbody id="adm-articles-tbody"><tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Đang tải...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Users panel -->
      <div class="panel" id="adm-panel-users">
        <div class="adm-panel-header">
          <div style="font-size:15px;font-weight:700">Quản lý người dùng</div>
        </div>
        <div class="card">
          <div class="tbl-wrap">
            <table>
              <thead><tr>
                <th>Người dùng</th><th>Email</th><th>Role</th><th>Streak</th><th>Nhật ký</th><th>Ngày tham gia</th><th>Thao tác</th>
              </tr></thead>
              <tbody id="adm-users-tbody"><tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Đang tải...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Features panel -->
      <div class="panel" id="adm-panel-features"></div>

      <!-- Settings panel -->
      <div class="panel" id="adm-panel-settings">
        <div class="adm-panel-header">
          <div style="font-size:15px;font-weight:700">Cài đặt đường dây hỗ trợ (SOS)</div>
        </div>
        <div class="card">
          <div class="form-group">
            <label class="form-label">Nội dung hiển thị ở trang "Đường dây hỗ trợ"</label>
            <textarea class="diary-textarea" id="adm-sos-textarea" style="min-height:220px" placeholder="Nhập nội dung các đường dây hỗ trợ..."></textarea>
          </div>
          <button class="adm-btn adm-btn-primary" onclick="Admin.saveSOSSetting()">💾 Lưu cài đặt</button>
        </div>
      </div>
    </div>`,
};
