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

      <!-- Nhắc nhở tùy chỉnh (ẩn cho đến khi feature custom_reminder được bật) -->
      <div id="custom-reminder-section" style="display:none"></div>

      <!-- Recap tuần này -->
      <div id="weekly-recap"></div>

      <!-- Dashboard sức khỏe tâm thần nâng cao (v1.3, ẩn cho đến khi feature được bật) -->
      <div id="mental-health-section" style="display:none">
        <div class="section-label">Sức khỏe tâm thần 30 ngày qua</div>
        <div class="grid-4" id="mental-health-cards"></div>
      </div>

      <!-- Huy hiệu & Nhật ký gần đây -->
      <div class="grid-2">
        <div>
          <div class="section-label" id="badges-label" style="display:none">Huy hiệu của bạn</div>
          <div id="badges-grid"></div>
        </div>
        <div>
          <div class="section-label">Nhật ký gần đây</div>
          <div id="dash-recent-entries"><div class="loading-text">Đang tải...</div></div>
        </div>
      </div>
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

          <!-- Tìm kiếm nhật ký (v1.9) -->
          <div class="diary-search-bar">
            <input type="text" class="diary-search-input" id="diary-search-input" placeholder="🔍 Tìm theo từ khoá, cảm xúc, tag..." onkeydown="if(event.key==='Enter')App.searchDiary()" />
            <button class="diary-search-btn" onclick="App.searchDiary()">Tìm</button>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
            <input type="date" class="text-input" id="diary-search-from" style="flex:1;min-width:120px;padding:8px 10px;font-size:12px" title="Từ ngày" />
            <input type="date" class="text-input" id="diary-search-to"   style="flex:1;min-width:120px;padding:8px 10px;font-size:12px" title="Đến ngày" />
            <button class="btn-outline" onclick="App.clearSearch()" style="font-size:12px;padding:8px 12px">✕ Xoá</button>
          </div>
          <div id="search-result-label" class="search-result-label" style="display:none"></div>
          <div id="diary-entries-list"><div class="loading-text">Đang tải...</div></div>

          <!-- Xuất nhật ký (ẩn cho đến khi feature diary_export được bật) -->
          <div id="diary-export-section" style="display:none;margin-top:20px">
            <div class="section-label">Xuất nhật ký 📥</div>
            <div class="card" style="padding:16px">
              <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">
                <div class="form-group" style="margin:0;flex:1;min-width:130px">
                  <label class="form-label" style="font-size:12px">Từ ngày</label>
                  <input type="date" class="text-input" id="export-from" style="padding:8px 10px;font-size:13px" />
                </div>
                <div class="form-group" style="margin:0;flex:1;min-width:130px">
                  <label class="form-label" style="font-size:12px">Đến ngày</label>
                  <input type="date" class="text-input" id="export-to" style="padding:8px 10px;font-size:13px" />
                </div>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <button class="btn-outline" onclick="App.exportDiaryCSV()" style="font-size:13px">📋 Xuất CSV (Excel)</button>
                <button class="btn-outline" onclick="App.printDiaryPDF()" style="font-size:13px">🖨️ In PDF</button>
              </div>
            </div>
          </div>
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

      <!-- Toggle biểu đồ / lịch tâm trạng / heatmap -->
      <div id="chart-view-toggle" style="display:none;margin-bottom:16px">
        <button class="tag sel" id="chart-view-btn-chart"    onclick="App.switchChartView('chart',this)">📈 Biểu đồ</button>
        <button class="tag"     id="chart-view-btn-calendar" onclick="App.switchChartView('calendar',this)" style="display:none">📅 Lịch tâm trạng</button>
        <button class="tag"     id="chart-view-btn-heatmap"  onclick="App.switchChartView('heatmap',this)"  style="display:none">🗓 Heatmap năm</button>
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

      <!-- Heatmap cảm xúc năm (ẩn cho đến khi chọn view "Heatmap năm") -->
      <div id="mood-heatmap-section" style="display:none">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div style="font-size:15px;font-weight:600">Heatmap cảm xúc năm 🗓</div>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="btn-outline" onclick="App.heatmapYearNav(-1)" style="padding:5px 12px;font-size:12px">◀</button>
              <span id="heatmap-year-label" style="font-size:13px;font-weight:700;min-width:36px;text-align:center">—</span>
              <button class="btn-outline" onclick="App.heatmapYearNav(1)"  style="padding:5px 12px;font-size:12px">▶</button>
            </div>
          </div>
          <div id="heatmap-grid"></div>
          <div class="heatmap-legend">
            <span style="font-size:11px;color:var(--text-muted)">Chưa ghi</span>
            <span class="hm-cell hm-none"></span>
            <span class="hm-cell hm-1-4"></span>
            <span style="font-size:11px;color:var(--text-muted)">1–4</span>
            <span class="hm-cell hm-5-6"></span>
            <span style="font-size:11px;color:var(--text-muted)">5–6</span>
            <span class="hm-cell hm-7-8"></span>
            <span style="font-size:11px;color:var(--text-muted)">7–8</span>
            <span class="hm-cell hm-9-10"></span>
            <span style="font-size:11px;color:var(--text-muted)">9–10</span>
          </div>
        </div>
      </div>
    </div>`,

  challenges: () => `
    <div class="page active" id="page-challenges">
      <div class="page-header">
        <div class="page-title">Thử thách Sức khỏe Tâm thần 🏆</div>
        <div class="page-sub">7 – 21 ngày thay đổi thói quen — từng bước nhỏ, tác động lớn</div>
      </div>
      <div id="active-challenge-section" style="display:none"></div>
      <div class="section-label" style="margin-top:8px">Tất cả thử thách</div>
      <div id="challenges-list"><div class="loading-text">Đang tải...</div></div>
    </div>`,

  community: () => `
    <div class="page active" id="page-community">
      <div class="page-header">
        <div class="page-title">Góc Tâm sự 💙</div>
        <div class="page-sub">Chia sẻ ẩn danh — kết nối đồng cảm, không phán xét</div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="form-group">
          <label class="form-label">Điều bạn muốn chia sẻ hôm nay...</label>
          <textarea class="diary-textarea" id="community-post-input" maxlength="500"
            placeholder="Viết tự do — không ai biết đây là bạn. Tối đa 500 ký tự."
            style="min-height:90px" oninput="document.getElementById('community-char-count').textContent=this.value.length"></textarea>
          <div style="text-align:right;font-size:11px;color:var(--text-muted);margin-top:4px"><span id="community-char-count">0</span>/500</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" id="community-mood-tags"></div>
        <button class="btn-primary" onclick="App.submitCommunityPost()" style="max-width:200px">💙 Chia sẻ ẩn danh</button>
      </div>
      <div id="community-posts"><div class="loading-text">Đang tải...</div></div>
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

  inbox: () => `
    <div class="page active" id="page-inbox">
      <div class="page-header">
        <div class="page-title">💌 Hộp thư</div>
        <div class="page-sub">Tin nhắn từ counselor và quản trị viên</div>
      </div>
      <div id="inbox-list">
        <div class="skeleton" style="height:90px;margin-bottom:12px;border-radius:12px"></div>
        <div class="skeleton" style="height:90px;margin-bottom:12px;border-radius:12px"></div>
      </div>
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
        <button class="tag"     data-panel="report"    onclick="Admin.switchPanel('report',this)">📈 Báo cáo</button>
        <button class="tag"     data-panel="settings"  onclick="Admin.switchPanel('settings',this)">⚙️ Cài đặt</button>
        <button class="tag"     data-panel="features"  onclick="Admin.switchPanel('features',this)">🚀 Tính năng</button>
      </div>

      <!-- Dashboard panel -->
      <div class="panel active" id="adm-panel-dashboard">
        <div class="grid-4" style="margin-bottom:12px">
          <div class="stat-card"><div class="stat-val" id="adm-stat-users">—</div><div class="stat-lbl">Người dùng</div></div>
          <div class="stat-card"><div class="stat-val" id="adm-stat-entries">—</div><div class="stat-lbl">Nhật ký đã ghi</div></div>
          <div class="stat-card"><div class="stat-val" id="adm-stat-articles">—</div><div class="stat-lbl">Tổng bài viết</div></div>
          <div class="stat-card"><div class="stat-val" id="adm-stat-published">—</div><div class="stat-lbl">Đã xuất bản</div></div>
        </div>
        <div class="stat-card" style="margin-bottom:20px;border-color:#f59e0b;display:flex;align-items:center;gap:14px;text-align:left;padding:14px 18px">
          <div style="font-size:26px">⚠️</div>
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">Tâm trạng tiêu cực 7+ ngày liên tiếp</div>
            <div style="font-size:20px;font-weight:800;color:#d97706;font-family:'Nunito',sans-serif"><span id="adm-stat-at-risk">—</span> người dùng cần chú ý</div>
          </div>
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

      <!-- Report panel -->
      <div class="panel" id="adm-panel-report">
        <div id="adm-report-content"><div class="loading-text">Đang tải...</div></div>
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

  chat: () => `
    <div class="page active" id="page-chat">
      <div class="page-header">
        <div class="page-title">💬 Soul Chat</div>
        <div class="page-sub">Người bạn đồng hành tâm lý — lắng nghe không phán xét</div>
      </div>
      <div class="chat-disclaimer card" style="padding:10px 14px;margin-bottom:12px;border-left:3px solid var(--primary)">
        <span style="font-size:12px;color:var(--text-muted)">⚠️ Soul Chat là AI hỗ trợ cảm xúc, không thay thế chuyên gia tâm lý. Khi cần giúp đỡ khẩn cấp, hãy gọi <strong>1800 599 920</strong>.</span>
      </div>
      <div class="chat-wrap card" style="padding:0;overflow:hidden">
        <div class="chat-messages" id="chat-messages">
          <div class="chat-bubble assistant">
            <div class="chat-content">Xin chào! Mình là Soul 🌱 Bạn đang cảm thấy thế nào hôm nay? Cứ chia sẻ thoải mái nhé — mình ở đây lắng nghe.</div>
          </div>
        </div>
        <div class="chat-input-row">
          <textarea class="chat-input" id="chat-input" placeholder="Nhập tin nhắn..." rows="1" maxlength="1000" onkeydown="App.chatKeydown(event)"></textarea>
          <button class="chat-send-btn" onclick="App.sendChat()" id="chat-send-btn">➤</button>
        </div>
        <div class="chat-footer-info">
          <span id="chat-remaining" style="font-size:11px;color:var(--text-hint)"></span>
          <button class="auth-text-btn" style="font-size:11px" onclick="App.clearChat()">Xóa lịch sử</button>
        </div>
      </div>
    </div>`,

  study: () => `
    <div class="page active" id="page-study">
      <div class="page-header">
        <div class="page-title">📅 Lịch Học tập</div>
        <div class="page-sub">Ghi lịch thi, deadline, bài tập — không bao giờ quên nữa</div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="settings-section-title" style="margin-bottom:12px">Thêm sự kiện mới</div>
        <div class="grid-2" style="gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <input class="text-input" id="study-title" placeholder="Tên sự kiện (VD: Thi Toán giải tích)" maxlength="200" />
          </div>
          <div class="form-group" style="margin:0">
            <input class="text-input" type="date" id="study-date" />
          </div>
        </div>
        <div class="grid-2" style="gap:10px;margin-bottom:12px">
          <select class="text-input" id="study-type">
            <option value="exam">🔴 Thi / Kiểm tra</option>
            <option value="deadline">🟠 Deadline / Nộp bài</option>
            <option value="assignment">🟡 Bài tập / Thực hành</option>
            <option value="other">🔵 Khác</option>
          </select>
          <input class="text-input" id="study-notes" placeholder="Ghi chú (không bắt buộc)" maxlength="200" />
        </div>
        <button class="btn-primary" style="max-width:180px" onclick="App.createStudyEvent()">➕ Thêm sự kiện</button>
        <div id="study-form-msg" class="settings-msg" style="display:none;margin-top:8px"></div>
      </div>
      <div class="section-label">Sự kiện sắp tới</div>
      <div id="study-events-list"><div class="loading-text">Đang tải...</div></div>
    </div>`,

  courses: () => `
    <div class="page active" id="page-courses">
      <div class="page-header">
        <div class="page-title">🎓 Khóa học Tâm lý</div>
        <div class="page-sub">Học về tâm lý và cảm xúc qua những bài học ngắn, thực tiễn</div>
      </div>
      <div id="courses-list"><div class="loading-text">Đang tải...</div></div>
      <!-- Lesson viewer overlay -->
      <div class="modal-overlay" id="lesson-modal" style="display:none;align-items:flex-start;overflow-y:auto">
        <div class="modal" style="max-width:600px;width:95%;margin:40px auto">
          <div id="lesson-modal-content"></div>
          <div style="display:flex;gap:10px;margin-top:20px">
            <button class="btn-outline" id="lesson-prev-btn" onclick="App.lessonNav(-1)" style="display:none">← Trước</button>
            <button class="btn-primary" id="lesson-next-btn" onclick="App.lessonNav(1)">Tiếp theo →</button>
            <button class="btn-outline" style="margin-left:auto" onclick="App.closeLessonModal()">Đóng</button>
          </div>
        </div>
      </div>
    </div>`,

  goals: () => `
    <div class="page active" id="page-goals">
      <div class="page-header">
        <div class="page-title">🎯 Mục tiêu Cá nhân</div>
        <div class="page-sub">Đặt mục tiêu tâm lý và theo dõi tiến độ từng ngày</div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="settings-section-title" style="margin-bottom:12px">Tạo mục tiêu mới</div>
        <div class="form-group">
          <label class="form-label">Tên mục tiêu</label>
          <input class="text-input" id="goal-title" placeholder="VD: Duy trì mood ≥ 7 trong 30 ngày" maxlength="200" />
        </div>
        <div class="grid-2" style="gap:10px">
          <div class="form-group">
            <label class="form-label">Loại mục tiêu</label>
            <select class="text-input" id="goal-type" onchange="App.onGoalTypeChange()">
              <option value="mood_avg">📊 Mood trung bình ≥ X/10</option>
              <option value="streak">🔥 Duy trì chuỗi N ngày</option>
              <option value="entries">📖 Viết N nhật ký trong M ngày</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" id="goal-target-label">Mục tiêu</label>
            <input class="text-input" type="number" id="goal-target" placeholder="7" min="1" />
          </div>
        </div>
        <div class="form-group" id="goal-period-wrap">
          <label class="form-label">Trong vòng (ngày)</label>
          <input class="text-input" type="number" id="goal-period" placeholder="30" min="1" max="365" value="30" style="max-width:120px" />
        </div>
        <button class="btn-primary" style="max-width:180px" onclick="App.createGoal()">➕ Tạo mục tiêu</button>
        <div id="goal-form-msg" class="settings-msg" style="display:none;margin-top:8px"></div>
      </div>
      <div class="section-label">Mục tiêu đang theo dõi</div>
      <div id="goals-list"><div class="loading-text">Đang tải...</div></div>
    </div>`,

  'year-review': () => `
    <div class="page active" id="page-year-review">
      <div class="page-header">
        <div class="page-title">📆 Tổng kết Năm</div>
        <div class="page-sub">Nhìn lại hành trình cảm xúc của bạn</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <button class="btn-outline" style="padding:6px 12px" onclick="App.yearReviewNav(-1)">←</button>
        <span id="year-review-year" style="font-size:18px;font-weight:700"></span>
        <button class="btn-outline" style="padding:6px 12px" onclick="App.yearReviewNav(1)">→</button>
      </div>
      <div id="year-review-content"><div class="loading-text">Đang tải...</div></div>
    </div>`,

  settings: function() {
    // Precompute để tránh nested template literal gây lỗi trên iOS Safari
    var hourOpts = '<option value="">Tự động (hệ thống tính)</option>';
    for (var h = 0; h < 24; h++) {
      hourOpts += '<option value="' + h + '">' + (h < 10 ? '0' + h : h) + ':00</option>';
    }
    var dayLabels = ['CN','T2','T3','T4','T5','T6','T7'];
    var dayBtns = '';
    for (var d = 0; d < dayLabels.length; d++) {
      dayBtns += '<button class="notif-day-btn" data-day="' + d + '" onclick="App.toggleNotifDaySetting(this,' + d + ')">' + dayLabels[d] + '</button>';
    }
    return '<div class="page active" id="page-settings">' +
      '<div class="page-header"><div class="page-title">&#9881;&#65039; Cài đặt</div><div class="page-sub">Quản lý thông tin và tài khoản của bạn</div></div>' +
      '<div class="settings-tabs">' +
        '<button class="settings-tab active" onclick="App.switchSettingsTab(\'profile\',this)">&#128100; Hồ sơ</button>' +
        '<button class="settings-tab" onclick="App.switchSettingsTab(\'security\',this)">&#128272; Bảo mật</button>' +
        '<button class="settings-tab" onclick="App.switchSettingsTab(\'notifications\',this)">&#128276; Thông báo</button>' +
        '<button class="settings-tab" onclick="App.switchSettingsTab(\'account\',this)">&#9888;&#65039; Tài khoản</button>' +
      '</div>' +
      '<div id="settings-panel-profile" class="settings-panel card">' +
        '<div class="settings-section-title">Thông tin cá nhân</div>' +
        '<div class="form-group"><label class="form-label">Tên đăng nhập</label><input class="text-input" id="set-username" disabled style="opacity:.6;cursor:not-allowed" /></div>' +
        '<div class="form-group"><label class="form-label">Email</label><input class="text-input" id="set-email" disabled style="opacity:.6;cursor:not-allowed" /></div>' +
        '<div class="form-group"><label class="form-label">Tên hiển thị</label><input class="text-input" id="set-fullname" placeholder="Tên hiển thị của bạn" /></div>' +
        '<button class="btn-primary" style="max-width:200px" onclick="App.saveProfileSettings()">&#128190; Lưu thay đổi</button>' +
        '<div id="set-profile-msg" class="settings-msg" style="display:none"></div>' +
      '</div>' +
      '<div id="settings-panel-security" class="settings-panel card" style="display:none">' +
        '<div class="settings-section-title">Đổi mật khẩu</div>' +
        '<div class="form-group"><label class="form-label">Mật khẩu hiện tại</label><div class="input-wrap"><input class="text-input" type="password" id="set-current-pw" placeholder="Nhập mật khẩu hiện tại" autocomplete="current-password" /><button class="eye-btn" onclick="Auth.togglePwd(\'set-current-pw\',this)">&#128065;</button></div></div>' +
        '<div class="form-group"><label class="form-label">Mật khẩu mới (ít nhất 6 ký tự)</label><div class="input-wrap"><input class="text-input" type="password" id="set-new-pw" placeholder="Mật khẩu mới" autocomplete="new-password" /><button class="eye-btn" onclick="Auth.togglePwd(\'set-new-pw\',this)">&#128065;</button></div></div>' +
        '<div class="form-group"><label class="form-label">Xác nhận mật khẩu mới</label><input class="text-input" type="password" id="set-confirm-pw" placeholder="Nhập lại mật khẩu mới" autocomplete="new-password" /></div>' +
        '<button class="btn-primary" style="max-width:220px" onclick="App.changePasswordSettings()">&#128272; Đổi mật khẩu</button>' +
        '<div id="set-security-msg" class="settings-msg" style="display:none"></div>' +
      '</div>' +
      '<div id="settings-panel-notifications" class="settings-panel card" style="display:none">' +
        '<div class="settings-section-title">Push Notification</div>' +
        '<div id="set-push-section"></div>' +
        '<hr style="border:none;border-top:1px solid var(--border);margin:20px 0"/>' +
        '<div class="settings-section-title">Nhắc nhở tùy chỉnh</div>' +
        '<p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Chọn giờ và ngày bạn muốn nhận nhắc nhở viết nhật ký.</p>' +
        '<div class="form-group"><label class="form-label">Giờ nhắc nhở</label><select class="text-input" id="set-notif-hour" style="max-width:180px">' + hourOpts + '</select></div>' +
        '<div class="form-group"><label class="form-label">Ngày trong tuần</label><div class="notif-day-row" id="set-notif-days">' + dayBtns + '</div><div style="font-size:12px;color:var(--text-hint);margin-top:6px">Không chọn = nhắc tất cả các ngày</div></div>' +
        '<button class="btn-primary" style="max-width:200px" onclick="App.saveNotifSettings()">&#128190; Lưu cài đặt</button>' +
        '<div id="set-notif-msg" class="settings-msg" style="display:none"></div>' +
      '</div>' +
      '<div id="settings-panel-account" class="settings-panel card" style="display:none">' +
        '<div class="settings-section-title">Thông tin tài khoản</div>' +
        '<div id="set-account-info" style="color:var(--text-muted);font-size:14px;margin-bottom:20px"></div>' +
        '<hr style="border:none;border-top:1px solid var(--border);margin:20px 0"/>' +
        '<div class="danger-zone"><div class="danger-zone-title">&#9888;&#65039; Vùng nguy hiểm</div>' +
        '<p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Sau khi xóa, toàn bộ nhật ký, dữ liệu và tài khoản của bạn sẽ bị xóa vĩnh viễn và không thể khôi phục.</p>' +
        '<div class="form-group"><label class="form-label">Nhập mật khẩu để xác nhận xóa tài khoản</label><input class="text-input" type="password" id="set-delete-pw" placeholder="Mật khẩu của bạn" style="max-width:300px" /></div>' +
        '<button class="btn-danger" onclick="App.deleteAccountSettings()">&#128465;&#65039; Xóa tài khoản vĩnh viễn</button>' +
        '<div id="set-account-msg" class="settings-msg" style="display:none"></div></div>' +
      '</div>' +
    '</div>';
  },
};
