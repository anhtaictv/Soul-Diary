// js/auth.js — Xử lý đăng nhập / đăng ký / đăng xuất
const Auth = (() => {

  function showTab(tab) {
    document.getElementById('form-login').style.display           = tab === 'login'    ? 'block' : 'none';
    document.getElementById('form-register').style.display        = tab === 'register' ? 'block' : 'none';
    document.getElementById('form-forgot-password').style.display = 'none';
    document.getElementById('form-reset-password').style.display  = 'none';
    document.querySelector('.auth-tabs').style.display = '';
    document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    clearAlert();
  }

  function showForgot() {
    document.getElementById('form-login').style.display           = 'none';
    document.getElementById('form-register').style.display        = 'none';
    document.getElementById('form-forgot-password').style.display = 'block';
    document.getElementById('form-reset-password').style.display  = 'none';
    document.querySelector('.auth-tabs').style.display = 'none';
    clearAlert();
  }

  function showReset(token) {
    document.getElementById('form-login').style.display           = 'none';
    document.getElementById('form-register').style.display        = 'none';
    document.getElementById('form-forgot-password').style.display = 'none';
    document.getElementById('form-reset-password').style.display  = 'block';
    document.querySelector('.auth-tabs').style.display = 'none';
    document.getElementById('reset-token-value').value = token;
    clearAlert();
  }

  function showAlert(msg, type = 'error') {
    const el = document.getElementById('auth-alert');
    el.textContent = msg;
    el.className   = `auth-alert show ${type}`;
  }

  function clearAlert() {
    const el = document.getElementById('auth-alert');
    el.className = 'auth-alert';
    el.textContent = '';
  }

  function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    btn.disabled    = loading;
    btn.querySelector('span').textContent = loading
      ? (btnId === 'btn-login' ? 'Đang đăng nhập...' : 'Đang tạo tài khoản...')
      : (btnId === 'btn-login' ? 'Đăng nhập'         : 'Tạo tài khoản');
  }

  function saveSession(token, user) {
    localStorage.setItem('nhk_token', token);
    localStorage.setItem('nhk_user',  JSON.stringify(user));
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem('nhk_user')) || null; }
    catch { return null; }
  }

  function isLoggedIn() {
    return !!localStorage.getItem('nhk_token');
  }

  async function login() {
    clearAlert();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
      showAlert('Vui lòng điền đầy đủ thông tin.');
      return;
    }

    setLoading('btn-login', true);
    try {
      const data = await API.login({ username, password });
      saveSession(data.token, data.user);
      showApp(data.user);
    } catch (err) {
      showAlert(err.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading('btn-login', false);
    }
  }

  async function register() {
    clearAlert();
    const full_name = document.getElementById('reg-fullname').value.trim();
    const username  = document.getElementById('reg-username').value.trim();
    const email     = document.getElementById('reg-email').value.trim();
    const password  = document.getElementById('reg-password').value;
    const confirm   = document.getElementById('reg-confirm').value;

    if (!full_name || !username || !email || !password) {
      showAlert('Vui lòng điền đầy đủ thông tin.');
      return;
    }
    if (password !== confirm) {
      showAlert('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (password.length < 6) {
      showAlert('Mật khẩu phải ít nhất 6 ký tự.');
      return;
    }

    setLoading('btn-register', true);
    try {
      const data = await API.register({ full_name, username, email, password });
      saveSession(data.token, data.user);
      showApp(data.user);
    } catch (err) {
      showAlert(err.message || 'Đăng ký thất bại.');
    } finally {
      setLoading('btn-register', false);
    }
  }

  function showApp(user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display  = 'block';
    updateSidebarUser(user);
    App.init();
  }

  function updateSidebarUser(user) {
    if (!user) return;
    const el = document.getElementById('user-avatar');
    if (el) {
      if (user.avatar_url) {
        el.innerHTML = `<img src="${user.avatar_url}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
      } else {
        el.textContent = user.avatar_text || 'SV';
      }
    }
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.textContent = user.full_name || user.username;
    const streakEl = document.getElementById('streak-display');
    if (streakEl) streakEl.textContent = `🔥 ${user.streak || 0} ngày liên tiếp`;
  }

  function logout() {
    if (!confirm('Bạn có chắc muốn đăng xuất?')) return;
    localStorage.removeItem('nhk_token');
    localStorage.removeItem('nhk_user');
    document.getElementById('app-screen').style.display  = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    // Reset form
    ['login-username','login-password','reg-fullname','reg-username','reg-email','reg-password','reg-confirm']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    showTab('login');
  }

  async function forgotPassword() {
    clearAlert();
    const email = document.getElementById('forgot-email').value.trim();
    if (!email) { showAlert('Vui lòng nhập email.'); return; }
    const btn = document.getElementById('btn-forgot');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Đang gửi...';
    try {
      const data = await API.forgotPassword(email);
      showAlert(data.message || 'Đã gửi!', 'success');
    } catch (err) {
      showAlert(err.message || 'Lỗi server.');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Gửi link đặt lại';
    }
  }

  async function resetPassword() {
    clearAlert();
    const token    = document.getElementById('reset-token-value').value;
    const newPass  = document.getElementById('reset-password-input').value;
    const confirm  = document.getElementById('reset-confirm-input').value;
    if (!newPass || !confirm) { showAlert('Vui lòng điền đầy đủ thông tin.'); return; }
    if (newPass !== confirm)  { showAlert('Mật khẩu xác nhận không khớp.'); return; }
    if (newPass.length < 6)   { showAlert('Mật khẩu phải ít nhất 6 ký tự.'); return; }
    const btn = document.getElementById('btn-reset');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Đang cập nhật...';
    try {
      const data = await API.resetPassword(token, newPass);
      showAlert(data.message || 'Thành công!', 'success');
      setTimeout(() => {
        // Xóa token khỏi URL và hiển thị form đăng nhập
        history.replaceState(null, '', window.location.pathname);
        showTab('login');
      }, 2000);
    } catch (err) {
      showAlert(err.message || 'Link không hợp lệ hoặc đã hết hạn.');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Đặt lại mật khẩu';
    }
  }

  function togglePwd(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') { input.type = 'text';     btn.textContent = '🙈'; }
    else                           { input.type = 'password'; btn.textContent = '👁';  }
  }

  // ── Auto-login nếu đã có token ─────────────────────────────────────────
  async function bootstrap() {
    // Kiểm tra URL /share/<token> — public view, không cần login
    const sharePath = window.location.pathname.match(/^\/share\/([a-f0-9]{64})$/);
    if (sharePath) {
      _showPublicShareView(sharePath[1]);
      return;
    }

    // Kiểm tra URL có token đặt lại mật khẩu không
    const urlParams  = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('reset');
    if (resetToken) {
      showReset(resetToken);
      return;
    }

    if (!isLoggedIn()) return; // Hiển thị auth screen (mặc định)

    // Xác thực token với server
    try {
      const data = await API.getMe();
      saveSession(localStorage.getItem('nhk_token'), data.user);
      showApp(data.user);
    } catch {
      // Token không hợp lệ → hiển thị auth screen
      localStorage.removeItem('nhk_token');
      localStorage.removeItem('nhk_user');
    }
  }

  async function _showPublicShareView(token) {
    const authScreen = document.getElementById('auth-screen');
    const appScreen  = document.getElementById('app-screen');
    if (authScreen) authScreen.style.display = 'none';
    if (appScreen)  appScreen.style.display  = 'none';

    const MOOD_LABEL = ['','Rất tệ','Tệ','Khá tệ','Không tốt','Bình thường','Khá ổn','Tốt','Rất tốt','Tuyệt vời','Xuất sắc'];
    const MOOD_EMOJI = ['','😞','😟','😔','😕','😐','🙂','😊','😄','🤩','🥳'];

    const box = document.createElement('div');
    box.style.cssText = 'min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:24px;font-family:inherit';
    box.innerHTML = '<div style="text-align:center;color:var(--text-muted)">Đang tải...</div>';
    document.body.appendChild(box);

    try {
      const d = await API.getSharedEntry(token);
      const e = d.entry;
      const tagsArr = e.tags ? (Array.isArray(e.tags) ? e.tags : e.tags.split('|')) : [];
      const mood = e.mood_score || 5;
      box.innerHTML = `
        <div style="max-width:520px;width:100%">
          <div style="text-align:center;margin-bottom:20px">
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px">📖 Nhật ký được chia sẻ</div>
            <div style="font-size:32px;margin-bottom:4px">${MOOD_EMOJI[mood]}</div>
            <div style="font-weight:700;font-size:18px">${MOOD_LABEL[mood]}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${new Date(e.created_at).toLocaleDateString('vi-VN',{year:'numeric',month:'long',day:'numeric'})} — ${e.full_name || e.username}</div>
          </div>
          <div style="background:var(--surface,#fff);border-radius:16px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
            ${e.event_text ? `<div style="white-space:pre-wrap;line-height:1.8;margin-bottom:16px;color:var(--text)">${e.event_text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
            ${e.gratitude ? `<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text)">🙏 Biết ơn</div><div style="white-space:pre-wrap;color:var(--text-muted)">${e.gratitude.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div></div>` : ''}
            ${tagsArr.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">${tagsArr.map(t=>`<span style="background:var(--primary-light,#dbeafe);color:var(--primary,#2563eb);border-radius:20px;padding:3px 10px;font-size:12px">${t}</span>`).join('')}</div>` : ''}
          </div>
          <div style="text-align:center;margin-top:20px;font-size:12px;color:var(--text-muted)">
            Tạo nhật ký của bạn tại <a href="/" style="color:var(--primary,#2563eb)">Soul Diary</a>
          </div>
        </div>`;
    } catch {
      box.innerHTML = '<div style="text-align:center"><div style="font-size:48px;margin-bottom:12px">🔒</div><div style="font-weight:600;color:var(--text)">Liên kết không hợp lệ</div><div style="color:var(--text-muted);font-size:13px;margin-top:6px">Nhật ký này chưa được chia sẻ hoặc đã bị thu hồi.</div><a href="/" style="display:inline-block;margin-top:16px;color:var(--primary,#2563eb);font-size:13px">← Về trang chủ</a></div>';
    }
  }

  return { showTab, showForgot, showReset, forgotPassword, resetPassword, login, register, logout, togglePwd, updateSidebarUser, getUser, bootstrap };
})();

document.addEventListener('DOMContentLoaded', () => {
  // Enter key submit
  ['login-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') Auth.login(); });
  });
  ['reg-confirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') Auth.register(); });
  });
  document.getElementById('about-modal').addEventListener('click', e => { if (e.target === e.currentTarget) App.closeAboutModal(); });

  Auth.bootstrap();
});
