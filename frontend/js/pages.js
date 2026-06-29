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
      <!-- Quick Mood Log widget (v2.4, ẩn cho đến khi quick_mood_log flag bật) -->
      <div id="quick-mood-widget" style="display:none;margin-bottom:16px"></div>

      <!-- Habit Tracker widget (v2.5, ẩn cho đến khi habit_tracker flag bật) -->
      <div id="habit-dashboard-widget" style="display:none;margin-bottom:16px"></div>

      <!-- Nhật ký đã ghim (v2.5, ẩn cho đến khi pinned_entries flag bật) -->
      <div id="pinned-entries-section" style="display:none"></div>

      <!-- Câu truyền cảm hứng (v2.6, ẩn cho đến khi daily_quote flag bật) -->
      <div id="daily-quote-card" style="display:none;margin-bottom:16px"></div>

      <!-- Cảnh báo sức khỏe nhẹ nhàng (v2.7, ẩn mặc định) -->
      <div id="wellness-alert-banner" style="display:none;margin-bottom:16px"></div>

      <!-- Ghi chú nhanh widget (v2.7) -->
      <div id="notes-dashboard-widget" style="display:none;margin-bottom:16px"></div>

      <!-- AI Coach Tuần (v3.0, ẩn cho đến khi ai_weekly_coach flag bật) -->
      <div id="ai-coach-card" style="display:none;margin-bottom:16px"></div>

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
      <!-- Banner khôi phục nháp (v2.6 auto_draft, ẩn mặc định) -->
      <div id="draft-restore-banner" style="display:none"></div>
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

            <!-- Nút load template nhanh (ẩn khi chưa có template) -->
            <div id="diary-template-btn-wrap" style="display:none;margin-bottom:12px">
              <button class="btn-outline" style="font-size:12px;padding:6px 12px" onclick="App.openTemplatePicker()">📋 Dùng template</button>
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
          <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <input type="date" class="text-input" id="diary-search-from" style="flex:1;min-width:120px;padding:8px 10px;font-size:12px" title="Từ ngày" />
            <input type="date" class="text-input" id="diary-search-to"   style="flex:1;min-width:120px;padding:8px 10px;font-size:12px" title="Đến ngày" />
            <button id="adv-search-toggle-btn" class="btn-outline" onclick="App.toggleAdvancedSearch()" style="display:none;font-size:12px;padding:8px 12px">🔧 Lọc</button>
            <button class="btn-outline" onclick="App.clearSearch()" style="font-size:12px;padding:8px 12px">✕ Xoá</button>
          </div>
          <!-- Bộ lọc nâng cao (v3.0 — advanced_search flag) -->
          <div id="advanced-search-panel" style="display:none;padding:10px 12px;margin-bottom:10px;background:var(--surface);border:1px solid var(--border);border-radius:10px">
            <div style="font-size:11px;font-weight:600;color:var(--text-hint);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Bộ lọc nâng cao</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:12px;color:var(--text-hint)">Mood:</span>
                <input type="number" id="adv-mood-min" min="1" max="10" placeholder="Từ" style="width:52px;padding:5px 7px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)" />
                <span style="font-size:12px;color:var(--text-hint)">–</span>
                <input type="number" id="adv-mood-max" min="1" max="10" placeholder="Đến" style="width:52px;padding:5px 7px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)" />
              </div>
              <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:var(--text)">
                <input type="checkbox" id="adv-has-media" /> 📷 Có ảnh/âm thanh
              </label>
              <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:var(--text)">
                <input type="checkbox" id="adv-has-cbt" /> 🧠 CBT
              </label>
            </div>
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
        <button class="tag"     id="chart-view-btn-radar"    onclick="App.switchChartView('radar',this)"    style="display:none">🕸 Radar cảm xúc</button>
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

      <!-- Radar chart cảm xúc (ẩn cho đến khi chọn view "Radar cảm xúc") -->
      <div id="emotion-radar-section" style="display:none">
        <div class="card">
          <div style="font-size:15px;font-weight:600;margin-bottom:4px">Radar cảm xúc 🕸</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Tỉ lệ trung bình các cảm xúc trong 30 nhật ký gần nhất có AI phân tích</div>
          <div style="position:relative;max-width:340px;margin:0 auto">
            <canvas id="emotionRadarChart" style="display:block"></canvas>
          </div>
          <div id="emotion-radar-empty" style="display:none;text-align:center;padding:32px 0;color:var(--text-muted);font-size:14px">
            Chưa đủ dữ liệu — hãy bật tính năng <strong>AI Phân tích cảm xúc</strong> và viết thêm nhật ký.
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
        // Avatar (hidden by default, shown when avatar_bio flag on)
        '<div id="settings-avatar-wrap" style="display:none;align-items:center;gap:16px;margin-bottom:20px">' +
          '<div id="set-avatar-preview" class="avatar-upload-circle" onclick="document.getElementById(\'set-avatar-file\').click()" title="Nhấp để đổi ảnh">' +
            '<span id="set-avatar-text">SD</span>' +
            '<img id="set-avatar-img" src="" style="display:none;width:100%;height:100%;border-radius:50%;object-fit:cover" />' +
          '</div>' +
          '<div>' +
            '<div style="font-size:14px;font-weight:600;margin-bottom:6px">Ảnh đại diện</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
              '<button class="btn-outline" style="font-size:12px;padding:6px 12px" onclick="document.getElementById(\'set-avatar-file\').click()">📷 Đổi ảnh</button>' +
              '<button id="set-avatar-remove-btn" class="btn-danger" style="font-size:12px;padding:6px 10px;display:none" onclick="App.removeAvatar()">✕ Xóa</button>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-hint);margin-top:5px">Ảnh vuông, tối đa 2MB</div>' +
          '</div>' +
          '<input type="file" id="set-avatar-file" accept="image/*" style="display:none" onchange="App.handleAvatarUpload(this)">' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Tên đăng nhập</label><input class="text-input" id="set-username" disabled style="opacity:.6;cursor:not-allowed" /></div>' +
        '<div class="form-group"><label class="form-label">Email</label><input class="text-input" id="set-email" disabled style="opacity:.6;cursor:not-allowed" /></div>' +
        '<div class="form-group"><label class="form-label">Tên hiển thị</label><input class="text-input" id="set-fullname" placeholder="Tên hiển thị của bạn" /></div>' +
        '<div class="form-group" id="settings-bio-group" style="display:none">' +
          '<label class="form-label">Tiểu sử <span style="color:var(--text-hint);font-size:11px">(tối đa 300 ký tự)</span></label>' +
          '<textarea class="text-input" id="set-bio" rows="3" placeholder="Giới thiệu ngắn về bản thân..." style="resize:vertical" maxlength="300" oninput="document.getElementById(\'set-bio-count\').textContent=this.value.length"></textarea>' +
          '<div style="text-align:right;font-size:11px;color:var(--text-hint);margin-top:3px"><span id="set-bio-count">0</span>/300</div>' +
        '</div>' +
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
        '<div id="settings-pin-wrap" style="display:none">' +
          '<hr style="border:none;border-top:1px solid var(--border);margin:24px 0"/>' +
          '<div class="settings-section-title">&#128274; Khóa PIN</div>' +
          '<p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Bảo vệ nhật ký bằng mã PIN 4 chữ số. Yêu cầu nhập PIN mỗi khi mở lại ứng dụng.</p>' +
          '<div id="set-pin-status" style="margin-bottom:14px;font-size:14px"></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn-primary" style="max-width:180px" onclick="App.managePinLock(\'set\')">&#128274; Đặt / Đổi PIN</button>' +
            '<button id="set-pin-remove-btn" class="btn-danger" style="max-width:160px;display:none" onclick="App.managePinLock(\'remove\')">&#128275; Xóa PIN</button>' +
          '</div>' +
        '</div>' +
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
        '<div id="settings-writing-pattern-wrap" style="display:none">' +
          '<hr style="border:none;border-top:1px solid var(--border);margin:20px 0"/>' +
          '<div class="settings-section-title">&#129302; Gợi ý giờ viết nhật ký</div>' +
          '<p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Dựa trên thói quen viết của bạn trong 90 ngày qua.</p>' +
          '<div id="set-writing-pattern"></div>' +
        '</div>' +
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

  'future-letter': () => `
    <div class="page active" id="page-future-letter">
      <div class="page-header">
        <div class="page-title">💌 Thư gửi tương lai</div>
        <div class="page-sub">Viết thư cho chính mình trong tương lai — ứng dụng sẽ gửi email vào ngày bạn chọn.</div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="settings-section-title" style="margin-bottom:16px">✍️ Viết thư mới</div>
        <div class="form-group">
          <label class="form-label">Tiêu đề thư</label>
          <input class="text-input" id="fl-subject" placeholder="Vd: Gửi mình vào ngày tốt nghiệp..." />
        </div>
        <div class="form-group">
          <label class="form-label">Nội dung thư</label>
          <textarea class="diary-textarea" id="fl-content" rows="7" placeholder="Bạn ơi, khi đọc thư này bạn đang ở đâu trong cuộc đời...&#10;&#10;Hôm nay mình muốn nhắn với bạn rằng..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Gửi vào ngày</label>
          <input class="text-input" type="date" id="fl-send-date" style="max-width:220px" />
        </div>
        <button class="btn-primary" style="max-width:220px" onclick="App.createFutureLetter()">💌 Gửi thư đi</button>
      </div>
      <div class="section-label">Hộp thư đang chờ gửi</div>
      <div id="fl-list"><div class="loading-text">Đang tải...</div></div>
    </div>
  `,

  missions: () => `
    <div class="page active" id="page-missions">
      <div class="page-header">
        <div class="page-title">🎯 Nhiệm vụ & Thẻ kỷ niệm</div>
        <div class="page-sub">Hoàn thành nhiệm vụ hàng tuần để chăm sóc sức khoẻ tâm thần</div>
      </div>

      <div id="missions-list"><div class="loading-text">Đang tải nhiệm vụ...</div></div>

      <div class="section-label" style="margin-top:24px">🃏 Memory Card</div>
      <div class="card" style="text-align:center;padding:28px 16px;margin-bottom:20px">
        <div style="font-size:40px;margin-bottom:12px">✨</div>
        <div style="font-weight:700;color:var(--text);margin-bottom:6px">Tạo ảnh kỷ niệm</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:18px">Xuất thẻ ảnh đẹp với thống kê tâm trạng của bạn để chia sẻ</div>
        <button class="btn-primary" style="max-width:240px;margin:0 auto" onclick="App.showMemoryCard()">✨ Tạo Memory Card</button>
      </div>

      <div class="section-label">📊 Phân tích xu hướng AI</div>
      <div id="ai-patterns-section"><div class="loading-text">Đang phân tích...</div></div>

      <div class="section-label" style="margin-top:24px">💾 Quản lý dữ liệu</div>
      <div class="card" style="padding:20px">
        <div style="font-weight:600;color:var(--text);margin-bottom:6px">Xuất toàn bộ dữ liệu</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">Tải về file JSON chứa tất cả nhật ký, check-in và dữ liệu cá nhân.</div>
        <button class="btn-secondary" onclick="App.exportUserData()">⬇️ Xuất dữ liệu (JSON)</button>
      </div>
    </div>
  `,

  friends: () => `
    <div class="page active" id="page-friends">
      <div class="page-header">
        <div class="page-title">👥 Bạn bè</div>
        <div class="page-sub">So sánh streak và cổ vũ nhau duy trì thói quen</div>
      </div>

      <!-- Gửi lời mời -->
      <div class="card" style="margin-bottom:20px">
        <div class="settings-section-title" style="margin-bottom:12px">➕ Thêm bạn</div>
        <div style="display:flex;gap:8px">
          <input class="text-input" id="friend-username-input" placeholder="Nhập username của bạn bè..." style="flex:1" onkeydown="if(event.key==='Enter')App.sendFriendRequest()" />
          <button class="btn-primary" style="padding:0 18px;white-space:nowrap" onclick="App.sendFriendRequest()">Gửi lời mời</button>
        </div>
        <div id="friend-request-msg" style="margin-top:8px;font-size:13px"></div>
      </div>

      <!-- Lời mời đang chờ -->
      <div id="friend-requests-section" style="display:none;margin-bottom:20px">
        <div class="section-label">📬 Lời mời đang chờ</div>
        <div id="friend-requests-list"></div>
      </div>

      <!-- Danh sách bạn bè -->
      <div class="section-label">🔥 Bảng xếp hạng streak bạn bè</div>
      <div id="friends-list">
        <div class="loading-text">Đang tải...</div>
      </div>
    </div>
  `,

  templates: () => `
    <div class="page active" id="page-templates">
      <div class="page-header">
        <div class="page-title">📋 Nhật ký định kỳ</div>
        <div class="page-sub">Lưu template để viết nhanh, áp dụng cho các ngày cố định</div>
      </div>

      <!-- Tạo template mới -->
      <div class="card" style="margin-bottom:20px">
        <div class="settings-section-title" style="margin-bottom:14px">✨ Tạo template mới</div>
        <div class="form-group">
          <label class="form-label">Tên template</label>
          <input class="text-input" id="tpl-title" placeholder="VD: Nhật ký sáng thứ Hai, Nhật ký cuối tuần..." maxlength="200" />
        </div>
        <div class="form-group">
          <label class="form-label">Nội dung mẫu <span style="color:var(--text-hint);font-size:11px">(tùy chọn)</span></label>
          <textarea class="text-input" id="tpl-content" rows="3" placeholder="Hôm nay tôi cảm thấy...&#10;Điều tôi muốn tập trung hôm nay là..." style="resize:vertical"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Biết ơn mẫu <span style="color:var(--text-hint);font-size:11px">(tùy chọn)</span></label>
          <textarea class="text-input" id="tpl-gratitude" rows="2" placeholder="Tôi biết ơn vì..." style="resize:vertical"></textarea>
        </div>
        <div class="grid-2" style="gap:10px">
          <div class="form-group" style="margin:0">
            <label class="form-label">Tags mẫu</label>
            <input class="text-input" id="tpl-tags" placeholder="VD: sáng tạo, học tập" />
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Mood mặc định</label>
            <select class="text-input" id="tpl-mood">
              ${[1,2,3,4,5,6,7,8,9,10].map(v=>`<option value="${v}"${v===5?' selected':''}>${v}/10</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn-primary" style="max-width:200px;margin-top:4px" onclick="App.createTemplate()">💾 Lưu template</button>
        <div id="tpl-msg" class="settings-msg" style="display:none;margin-top:10px"></div>
      </div>

      <!-- Danh sách template -->
      <div class="section-label">📂 Template đã lưu</div>
      <div id="templates-list">
        <div class="loading-text">Đang tải...</div>
      </div>
    </div>
  `,

  report: () => `
    <div class="page active" id="page-report">
      <div class="page-header">
        <div class="page-title">📊 Báo cáo tháng</div>
        <div class="page-sub">Nhìn lại hành trình cảm xúc của bạn trong tháng</div>
      </div>

      <!-- Chọn tháng -->
      <div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <label class="form-label" style="margin:0;white-space:nowrap">Xem tháng:</label>
        <input type="month" id="report-month-picker" class="text-input" style="max-width:180px" />
        <button class="btn-primary" style="padding:8px 18px;white-space:nowrap" onclick="App.loadMonthlyReport()">📊 Xem báo cáo</button>
        <button id="btn-export-pdf" class="btn-outline" style="padding:8px 18px;white-space:nowrap;display:none" onclick="App.exportPDF()">📄 Xuất PDF</button>
      </div>

      <div id="report-content">
        <div class="loading-text">Chọn tháng và nhấn Xem báo cáo...</div>
      </div>
    </div>
  `,

  reflection: () => `
    <div class="page active" id="page-reflection">
      <div class="page-header">
        <div class="page-title">🪞 Phản tư tuần</div>
        <div class="page-sub">5 câu hỏi giúp bạn nhìn lại và phát triển mỗi tuần</div>
      </div>

      <!-- Form phản tư tuần này -->
      <div class="card" id="reflection-form-card" style="margin-bottom:24px">
        <div class="settings-section-title" style="margin-bottom:4px">✍️ Tuần này (<span id="reflection-week-label">...</span>)</div>
        <div id="reflection-done-banner" style="display:none;background:var(--primary-light,#dbeafe);color:var(--primary);border-radius:var(--radius);padding:10px 14px;font-size:13px;margin-bottom:14px">
          ✅ Bạn đã phản tư tuần này rồi. Chỉnh sửa bên dưới nếu muốn cập nhật.
        </div>

        <div class="form-group">
          <label class="form-label">1. Điều tốt nhất tuần này là gì?</label>
          <textarea class="text-input" id="ref-q1" rows="2" placeholder="Kể một khoảnh khắc, sự kiện hoặc cảm xúc tích cực..." style="resize:vertical"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">2. Điều gì khiến bạn khó khăn hoặc mệt mỏi?</label>
          <textarea class="text-input" id="ref-q2" rows="2" placeholder="Thách thức, lo lắng, hoặc điều chưa giải quyết được..." style="resize:vertical"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">3. Bạn biết ơn điều gì trong tuần này?</label>
          <textarea class="text-input" id="ref-q3" rows="2" placeholder="Có thể là người, sự vật, khoảnh khắc nhỏ..." style="resize:vertical"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">4. Tuần tới bạn muốn làm khác điều gì?</label>
          <textarea class="text-input" id="ref-q4" rows="2" placeholder="Một thay đổi nhỏ cụ thể là đủ..." style="resize:vertical"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">5. Nếu dùng 1 từ để mô tả tuần này, đó là từ gì?</label>
          <input class="text-input" id="ref-q5" placeholder="VD: bận rộn, ấm áp, trưởng thành, mệt mỏi..." maxlength="50" />
        </div>

        <button class="btn-primary" style="max-width:220px" onclick="App.submitReflection()">💾 Lưu phản tư tuần</button>
        <div id="ref-msg" class="settings-msg" style="display:none;margin-top:10px"></div>
      </div>

      <!-- Lịch sử phản tư -->
      <div class="section-label">📚 Phản tư các tuần trước</div>
      <div id="reflection-history">
        <div class="loading-text">Đang tải...</div>
      </div>
    </div>
  `,

  habits: () => `
    <div class="page active" id="page-habits">
      <div class="page-header">
        <div class="page-title">🌱 Thói quen của tôi</div>
        <div class="page-sub">Xây dựng thói quen tốt mỗi ngày, theo dõi streak 7 ngày</div>
      </div>

      <!-- Tạo habit mới -->
      <div class="card" style="margin-bottom:20px">
        <div class="settings-section-title" style="margin-bottom:14px">➕ Thêm thói quen mới <span style="color:var(--text-hint);font-size:12px;font-weight:400">(tối đa 5)</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:0 0 60px">
            <label class="form-label">Icon</label>
            <input class="text-input" id="habit-icon" value="✅" maxlength="2" style="text-align:center;font-size:18px;padding:8px" />
          </div>
          <div style="flex:1;min-width:160px">
            <label class="form-label">Tên thói quen</label>
            <input class="text-input" id="habit-name" placeholder="VD: Uống đủ nước, Đọc sách 15 phút..." maxlength="100"
              onkeydown="if(event.key==='Enter')App.createHabit()" />
          </div>
          <button class="btn-primary" style="padding:10px 18px;white-space:nowrap;flex-shrink:0" onclick="App.createHabit()">Thêm</button>
        </div>
        <div id="habit-create-msg" style="margin-top:8px;font-size:13px"></div>
      </div>

      <!-- Danh sách habit + lịch 7 ngày -->
      <div class="section-label">📅 Theo dõi 7 ngày gần nhất</div>
      <div id="habits-list">
        <div class="loading-text">Đang tải...</div>
      </div>
    </div>
  `,

  // ── v2.7: Gallery ảnh nhật ký ────────────────────────────────────────────
  gallery: () => `
    <div class="page active" id="page-gallery">
      <div class="page-header">
        <div class="page-title">🖼 Gallery ảnh</div>
        <div class="page-subtitle">Tất cả ảnh đính kèm trong nhật ký của bạn</div>
      </div>
      <div id="gallery-content">
        <div class="loading-text">Đang tải...</div>
      </div>
    </div>
  `,

  // ── v2.7: Ghi chú nhanh ───────────────────────────────────────────────────
  notes: () => `
    <div class="page active" id="page-notes">
      <div class="page-header">
        <div class="page-title">📝 Ghi chú nhanh</div>
        <div class="page-subtitle">Sticky notes của riêng bạn · Tối đa 10 ghi chú</div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="settings-section-title" style="margin-bottom:12px">➕ Thêm ghi chú mới</div>
        <textarea class="text-input" id="note-content" rows="3"
          placeholder="Viết ghi chú, ý tưởng, nhắc nhở..." maxlength="500"
          style="resize:vertical;margin-bottom:10px"></textarea>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:13px;color:var(--text-muted)">Màu:</span>
            ${[['yellow','#FEF08A'],['green','#BBF7D0'],['blue','#BFDBFE'],['pink','#FBCFE8'],['white','var(--surface)']].map(([c,bg])=>
              `<button onclick="App.selectNoteColor('${c}',this)" data-color="${c}"
                style="width:24px;height:24px;border-radius:50%;background:${bg};border:2px solid transparent;cursor:pointer"
                title="${c}"></button>`).join('')}
          </div>
          <input type="hidden" id="note-color" value="yellow" />
          <button class="btn-primary" onclick="App.createNote()" style="margin-left:auto;padding:8px 20px">Thêm</button>
        </div>
      </div>

      <div id="notes-list">
        <div class="loading-text">Đang tải...</div>
      </div>
    </div>
  `,

  // ── v2.7: So sánh tâm trạng ──────────────────────────────────────────────
  'mood-compare': () => `
    <div class="page active" id="page-mood-compare">
      <div class="page-header">
        <div class="page-title">⚖️ So sánh tâm trạng</div>
        <div class="page-subtitle">Chọn 2 khoảng thời gian để so sánh mood</div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div class="settings-section-title" style="margin-bottom:10px;color:var(--primary)">📅 Khoảng thời gian 1</div>
            <div style="display:flex;gap:8px;flex-direction:column">
              <div><label class="form-label">Từ ngày</label><input class="text-input" type="date" id="cmp-from1" /></div>
              <div><label class="form-label">Đến ngày</label><input class="text-input" type="date" id="cmp-to1" /></div>
            </div>
          </div>
          <div>
            <div class="settings-section-title" style="margin-bottom:10px;color:#d97706">📅 Khoảng thời gian 2</div>
            <div style="display:flex;gap:8px;flex-direction:column">
              <div><label class="form-label">Từ ngày</label><input class="text-input" type="date" id="cmp-from2" /></div>
              <div><label class="form-label">Đến ngày</label><input class="text-input" type="date" id="cmp-to2" /></div>
            </div>
          </div>
        </div>
        <button class="btn-primary" onclick="App.loadMoodCompare()" style="margin-top:16px;width:100%">So sánh</button>
      </div>

      <div id="compare-result"></div>
    </div>
  `,

  // ── v2.6: Pomodoro Timer ─────────────────────────────────────────────────
  pomodoro: () => `
    <div class="page active" id="page-pomodoro">
      <div class="page-header">
        <div class="page-title">⏱ Pomodoro</div>
        <div class="page-subtitle">Tập trung học tập · Nghỉ ngơi đúng lúc</div>
      </div>

      <div class="card" style="text-align:center;padding:28px 24px;margin-bottom:16px">
        <!-- Mode buttons -->
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:28px;flex-wrap:wrap">
          <button id="pm-mode-pomo"  onclick="App.setPomodoroMode('pomodoro')" class="btn-primary" style="padding:8px 18px;font-size:13px">🍅 Pomodoro</button>
          <button id="pm-mode-short" onclick="App.setPomodoroMode('short')"    class="btn-outline" style="padding:8px 18px;font-size:13px">☕ Nghỉ ngắn</button>
          <button id="pm-mode-long"  onclick="App.setPomodoroMode('long')"     class="btn-outline" style="padding:8px 18px;font-size:13px">🌿 Nghỉ dài</button>
        </div>

        <!-- Timer display -->
        <div id="pm-display" style="font-size:88px;font-weight:800;font-variant-numeric:tabular-nums;
          letter-spacing:-3px;color:var(--primary);line-height:1;margin-bottom:24px;
          transition:color .3s">25:00</div>

        <!-- Controls -->
        <div style="display:flex;gap:12px;justify-content:center;margin-bottom:20px">
          <button id="pm-start-btn" onclick="App.togglePomodoro()" class="btn-primary"
            style="padding:12px 36px;font-size:16px;font-weight:700">▶ Bắt đầu</button>
          <button onclick="App.resetPomodoro()" class="btn-outline"
            style="padding:12px 20px;font-size:16px">↺</button>
        </div>

        <!-- Session count -->
        <div style="color:var(--text-muted);font-size:13px">
          🍅 Phiên hôm nay: <span id="pm-sessions" style="font-weight:700;color:var(--primary)">0</span>
        </div>
      </div>

      <!-- Custom time settings -->
      <div class="card">
        <div class="settings-section-title" style="margin-bottom:14px">⚙️ Thời gian tùy chỉnh (phút)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div>
            <label class="form-label">🍅 Pomodoro</label>
            <input class="text-input" id="pm-custom-pomo"  type="number" min="1" max="90"  value="25" onchange="App.updatePomodoroTimes()" />
          </div>
          <div>
            <label class="form-label">☕ Nghỉ ngắn</label>
            <input class="text-input" id="pm-custom-short" type="number" min="1" max="30"  value="5"  onchange="App.updatePomodoroTimes()" />
          </div>
          <div>
            <label class="form-label">🌿 Nghỉ dài</label>
            <input class="text-input" id="pm-custom-long"  type="number" min="1" max="60"  value="15" onchange="App.updatePomodoroTimes()" />
          </div>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-hint)">
          💡 Sau 4 phiên Pomodoro liên tiếp nên nghỉ dài 15 phút để não bộ phục hồi.
        </div>
      </div>
    </div>
  `,

  // ── v2.6: Thống kê năm ────────────────────────────────────────────────────
  'year-stats': () => `
    <div class="page active" id="page-year-stats">
      <div class="page-header">
        <div class="page-title">📆 Thống kê năm</div>
        <div class="page-subtitle">Nhìn lại hành trình cả năm của bạn</div>
      </div>

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <select class="text-input" id="year-stats-picker" onchange="App.loadYearStats()" style="width:110px;flex-shrink:0"></select>
        <span style="color:var(--text-muted);font-size:13px">Chọn năm để xem thống kê tổng quan</span>
      </div>

      <div id="year-stats-content">
        <div class="loading-text">Đang tải...</div>
      </div>
    </div>
  `,

  // ── v3.0: Trung tâm Thông báo ────────────────────────────────────────────
  notifications: () => `
    <div class="page active" id="page-notifications">
      <div class="page-header">
        <div class="page-title">🔔 Thông báo</div>
        <div class="page-subtitle">Cập nhật từ Soul Diary</div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button onclick="App.markAllNotifsRead()" class="btn-outline" style="font-size:13px;padding:6px 14px">✓ Đánh dấu tất cả đã đọc</button>
      </div>
      <div id="notif-list"><div class="loading-text">Đang tải...</div></div>
    </div>
  `,

  // ── v3.0: Hồ sơ Cá nhân ─────────────────────────────────────────────────
  profile: () => `
    <div class="page active" id="page-profile">
      <div class="page-header">
        <div class="page-title">👤 Hồ sơ Cá nhân</div>
        <div class="page-subtitle">Hành trình cảm xúc của bạn</div>
      </div>
      <div id="profile-content"><div class="loading-text">Đang tải...</div></div>
    </div>
  `,
};
