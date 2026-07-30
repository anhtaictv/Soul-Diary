// js/game.js — Mèo đuổi chuột (canvas game, sprite chạy pixel-art, v3.7)
const Game = (() => {
  let canvas, ctx, audioCtx = null;
  let animationFrameId = null;
  let handleKeyDown = null;
  let handleResize = null;
  let onGameOver = null;

  // Sprite chạy nạp 1 lần, dùng lại cho mọi ván chơi
  const RUN_FRAMES = [0, 1, 2, 3, 4, 5, 6];
  const JUMP_FRAME = 10;
  const frames = [];
  for (let i = 0; i < 15; i++) {
    const img = new Image();
    img.src = 'img/game/cat_' + String(i).padStart(2, '0') + '.png';
    frames.push(img);
  }
  const CAT_ASPECT = 209 / 238;
  // hộp alpha thật (tight) [x,y,w,h] của từng frame trong canvas gốc 209x238 -
  // sprite có viền trong suốt để không giật khi đổi frame, nhưng viền đó
  // không được tính là va chạm
  const CAT_META_W = 209, CAT_META_H = 238;
  const CAT_META = [
    [1, 15, 207, 223], [10, 11, 189, 227], [5, 6, 199, 232], [7, 0, 195, 238], [7, 6, 195, 232],
    [6, 6, 196, 232], [7, 5, 194, 233], [6, 30, 197, 208], [0, 3, 209, 235], [17, 10, 175, 228],
    [22, 10, 164, 228], [24, 7, 160, 231], [17, 4, 174, 234], [4, 5, 200, 233], [8, 30, 193, 208],
  ];

  // nền đổi theo điểm số
  const SCORE_PER_THEME = 200;
  const THEMES = [
    { name: 'Làng quê',  shape: 'hill',     sky: ['#bdeeff', '#eafff0'], ground: '#8bc34a', dash: '#5d8a34', obstacles: ['🌾', '🐄', '🚜', '🐓'] },
    { name: 'Thành phố', shape: 'building', sky: ['#a9c6d8', '#dfe9ee'], ground: '#6b6b6b', dash: '#ffd54f', obstacles: ['🗑️', '🚮', '🚗'] },
    { name: 'Rừng rậm',  shape: 'tree',     sky: ['#8fd3a0', '#d9f2d0'], ground: '#7a5230', dash: '#4e3520', obstacles: ['🌲', '🐦', '🍄'] },
    { name: 'Sa mạc',    shape: 'dune',     sky: ['#ffd98a', '#ffe9c2'], ground: '#e0b361', dash: '#b8863f', obstacles: ['🌵', '🦴'] },
    { name: 'Biển',      shape: 'wave',     sky: ['#5fb0d6', '#bfe6f2'], ground: '#e8d29a', dash: '#c9ad6c', obstacles: ['⛵', '🐟', '🦀'] },
  ];
  function rand01(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }
  function hex2rgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lerpColor(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
  }

  function playSound(freq, type, duration) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function start(canvasEl, gameOverCallback) {
    stop();
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    onGameOver = gameOverCallback;

    // Canvas co giãn theo bề rộng khung chứa (giống bản gốc full-viewport) thay vì
    // cố định 600x200 — cố định quá nhỏ khiến cụm chướng ngại vật bị dồn cục, rối mắt.
    let W, H, S, GROUND_Y, CAT_H, CAT_W, CAT_X, GRAVITY, JUMP_V, BASE_SPEED, OBSTACLE_SIZE, DECOR_SPACING;
    let state = 'waiting'; // waiting | playing | over
    const cat = { y: 0, vy: 0, jumping: false };

    function applyScale() {
      W = canvas.width  = Math.max(320, Math.round(canvas.clientWidth || canvas.parentElement.clientWidth || 600));
      H = canvas.height = Math.round(Math.min(340, Math.max(200, W * 0.4)));
      S = H / 300; // baseline thiết kế cao 300px
      GROUND_Y = H - 40 * S;
      CAT_H = 70 * S; CAT_W = CAT_H * CAT_ASPECT; CAT_X = 20 * S;
      GRAVITY = 0.9 * S; JUMP_V = -16 * S; BASE_SPEED = 3.2 * S;
      OBSTACLE_SIZE = 50 * S; DECOR_SPACING = 100 * S;
      if (state !== 'playing') cat.y = GROUND_Y - CAT_H;
    }

    let score = 0;
    let best = Number(localStorage.getItem('meoduoichuot_best') || 0);
    let groundOffset = 0, bgDist = 0;
    let runTick = 0, runFrameIdx = 0;
    let speed = 0;
    let obstacles = [];
    let spawnTimer = 0;
    let clusterLeft = 0;

    applyScale();
    speed = BASE_SPEED;
    cat.y = GROUND_Y - CAT_H;
    handleResize = () => applyScale();
    window.addEventListener('resize', handleResize);

    function currentFrameIndex() {
      return cat.jumping ? JUMP_FRAME : RUN_FRAMES[runFrameIdx];
    }
    function currentTheme() {
      return THEMES[Math.floor(score / SCORE_PER_THEME) % THEMES.length];
    }

    function jumpDistance(spd) {
      return ((2 * Math.abs(JUMP_V)) / GRAVITY) * spd;
    }
    function minSafeGap() {
      return jumpDistance(speed) * 1.15 + OBSTACLE_SIZE * 1.5;
    }
    function nextGap() {
      const minSafe = minSafeGap();
      if (clusterLeft > 0) { clusterLeft--; return minSafe * (1 + Math.random() * 0.3); }
      if (Math.random() < 0.45) { clusterLeft = 1 + Math.floor(Math.random() * 2); return minSafe * (1 + Math.random() * 0.3); }
      return minSafe * (2.8 + Math.random() * 3.2);
    }

    function resetGame() {
      state = 'playing';
      speed = BASE_SPEED;
      score = 0;
      cat.y = GROUND_Y - CAT_H;
      cat.vy = 0;
      cat.jumping = false;
      obstacles = [];
      groundOffset = 0;
      bgDist = 0;
      clusterLeft = 0;
      spawnTimer = minSafeGap() * 2;
    }

    function jump() {
      if (state === 'waiting' || state === 'over') { resetGame(); return; }
      if (!cat.jumping) { cat.vy = JUMP_V; cat.jumping = true; playSound(440, 'square', 0.15); }
    }

    function spawnObstacle() {
      const theme = currentTheme();
      const emoji = theme.obstacles[Math.floor(Math.random() * theme.obstacles.length)];
      obstacles.push({ x: W + OBSTACLE_SIZE, w: OBSTACLE_SIZE, h: OBSTACLE_SIZE, emoji });
    }

    function update() {
      if (state !== 'playing') return;

      cat.vy += GRAVITY;
      cat.y += cat.vy;
      if (cat.y >= GROUND_Y - CAT_H) { cat.y = GROUND_Y - CAT_H; cat.vy = 0; cat.jumping = false; }

      runTick++;
      if (runTick % 5 === 0) runFrameIdx = (runFrameIdx + 1) % RUN_FRAMES.length;

      speed += 0.0015 * S;
      score += 0.1;

      groundOffset = (groundOffset + speed) % (20 * S);
      bgDist += speed * 0.3;

      spawnTimer -= speed;
      if (spawnTimer <= 0) { spawnObstacle(); spawnTimer = nextGap(); }
      for (const o of obstacles) o.x -= speed;
      obstacles = obstacles.filter(o => o.x + o.w > 0);

      // va chạm: dùng hộp thật (tight) của frame hiện tại, bỏ viền trong suốt
      const m = CAT_META[currentFrameIndex()];
      const scaleX = CAT_W / CAT_META_W, scaleY = CAT_H / CAT_META_H;
      const innerPad = 4 * S;
      const cx = CAT_X + m[0] * scaleX + innerPad;
      const cy = cat.y + m[1] * scaleY + innerPad;
      const cw = m[2] * scaleX - innerPad * 2;
      const ch = m[3] * scaleY - innerPad * 2;
      for (const o of obstacles) {
        const oSide = o.w * 0.16, oTop = o.h * 0.32, oBottom = o.h * 0.06;
        const ox = o.x + oSide, oy = GROUND_Y - o.h + oTop, ow = o.w - oSide * 2, oh = o.h - oTop - oBottom;
        if (state === 'playing' && cx < ox + ow && cx + cw > ox && cy < oy + oh && cy + ch > oy) {
          state = 'over';
          playSound(150, 'sawtooth', 0.4);
          if (score > best) { best = score; localStorage.setItem('meoduoichuot_best', String(Math.floor(best))); }
          if (onGameOver) onGameOver(Math.floor(score));
        }
      }
    }

    function drawSky(sky0, sky1) {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      g.addColorStop(0, sky0); g.addColorStop(1, sky1);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, GROUND_Y);
    }

    function drawClouds() {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ffffff';
      const spacing = DECOR_SPACING * 2.2;
      const dist = bgDist * 0.35; // chậm hơn nền chính -> đọc thành lớp xa hơn
      const first = Math.floor(dist / spacing) - 1;
      const last = first + Math.ceil(W / spacing) + 2;
      for (let t = first; t <= last; t++) {
        const x = t * spacing - dist;
        const r = rand01(t * 7.13);
        const y = (25 + r * 55) * S;
        const cw = (55 + r * 45) * S;
        ctx.beginPath();
        ctx.ellipse(x + spacing * 0.3, y, cw * 0.5, cw * 0.28, 0, 0, Math.PI * 2);
        ctx.ellipse(x + spacing * 0.3 + cw * 0.4, y + cw * 0.06, cw * 0.35, cw * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function pixelDome(cx, baseY, w, h, color) {
      const bands = 5;
      ctx.fillStyle = color;
      for (let i = 0; i < bands; i++) {
        const t = i / bands, bw = w * (1 - t * 0.85);
        ctx.fillRect(cx - bw / 2, baseY - h + i * (h / bands), bw, h / bands + 1);
      }
    }

    function sceneVillage(x, unitW, seed) {
      pixelDome(x + unitW * 0.5, GROUND_Y, unitW * 1.3, (70 + rand01(seed * 3) * 40) * S, 'rgba(120,180,90,0.55)');
      const cw = unitW * 0.5, ch = (46 + rand01(seed * 2) * 14) * S, cx0 = x + unitW * 0.28;
      ctx.fillStyle = rand01(seed * 4) > 0.5 ? '#e8d9b0' : '#cdbfa8';
      ctx.fillRect(cx0, GROUND_Y - ch, cw, ch);
      ctx.fillStyle = '#a5432c';
      const roofH = ch * 0.55;
      for (let i = 0; i < 4; i++) {
        const bw = cw * (1 - (i / 4) * 0.92);
        ctx.fillRect(cx0 + cw / 2 - bw / 2, GROUND_Y - ch - roofH + roofH * i / 4, bw, roofH / 4 + 1);
      }
    }
    function sceneCity(x, unitW, seed) {
      const palette = ['#7d8592', '#8f97a3', '#6b7482', '#9aa3ad'];
      const h = (60 + rand01(seed) * 110) * S, w = unitW * 0.7, bx = x + unitW * 0.15;
      ctx.fillStyle = palette[Math.floor(rand01(seed * 9) * palette.length)];
      ctx.fillRect(bx, GROUND_Y - h, w, h);
    }
    function sceneForest(x, unitW, seed) {
      const trunkW = 8 * S, trunkH = (18 + rand01(seed * 2) * 14) * S, tx = x + unitW * 0.5;
      ctx.fillStyle = '#5a3d22';
      ctx.fillRect(tx - trunkW / 2, GROUND_Y - trunkH, trunkW, trunkH);
      pixelDome(tx, GROUND_Y - trunkH, unitW * 0.9, (50 + rand01(seed * 3) * 45) * S, '#2f6b3a');
    }
    function sceneDesert(x, unitW, seed) {
      pixelDome(x + unitW * 0.5, GROUND_Y, unitW * 1.2, (40 + rand01(seed * 2) * 45) * S, 'rgba(200,140,70,0.55)');
    }
    function sceneSea(x, unitW, seed) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      for (let dx = 0; dx <= unitW; dx += 8 * S) ctx.lineTo(x + dx, GROUND_Y - 24 * S + Math.sin((x + dx) * 0.04) * 6 * S);
      ctx.stroke();
    }
    const SCENE_FN = { hill: sceneVillage, building: sceneCity, tree: sceneForest, dune: sceneDesert, wave: sceneSea };

    function drawThemeScene(theme, alpha) {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      const unitW = DECOR_SPACING;
      const first = Math.floor(bgDist / unitW) - 1;
      const last = first + Math.ceil(W / unitW) + 2;
      const fn = SCENE_FN[theme.shape];
      for (let i = first; i <= last; i++) fn(i * unitW - bgDist, unitW, i);
      ctx.restore();
    }

    function drawGround(groundColor, dashColor) {
      ctx.fillStyle = groundColor;
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
      ctx.fillStyle = dashColor;
      const step = 20 * S;
      for (let x = -groundOffset; x < W; x += step) ctx.fillRect(x, GROUND_Y + 6 * S, step / 2, 3 * S);
    }

    function drawCat() {
      const img = frames[currentFrameIndex()];
      if (img.complete && img.naturalWidth) ctx.drawImage(img, CAT_X, cat.y, CAT_W, CAT_H);
    }

    function drawObstacles() {
      ctx.font = `${Math.round(OBSTACLE_SIZE)}px sans-serif`;
      ctx.textBaseline = 'bottom';
      for (const o of obstacles) ctx.fillText(o.emoji, o.x, GROUND_Y + 2);
    }

    function drawScore(theme) {
      const pad = 12 * S;
      ctx.fillStyle = '#333';
      ctx.font = `bold ${Math.round(14 * S)}px monospace`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText(`ĐIỂM ${Math.floor(score)}`, W - pad, pad);
      ctx.textAlign = 'left';
      ctx.fillText(theme.name, pad, pad);
    }

    function drawOverlay() {
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      if (state === 'waiting') {
        ctx.font = `bold ${Math.round(20 * S)}px sans-serif`;
        ctx.fillText('NHẤN SPACE / BẤM MÀN HÌNH ĐỂ BẮT ĐẦU', W / 2, H / 2);
      } else if (state === 'over') {
        ctx.font = `bold ${Math.round(20 * S)}px sans-serif`;
        ctx.fillText('BẠN ĐÃ VA PHẢI CHƯỚNG NGẠI VẬT!', W / 2, H / 2 - 12 * S);
        ctx.font = `${Math.round(13 * S)}px sans-serif`;
        ctx.fillStyle = '#666';
        ctx.fillText('Nhấn Space hoặc chạm màn hình để chơi lại', W / 2, H / 2 + 12 * S);
      }
      ctx.textAlign = 'left';
    }

    function themeBlend() {
      const idx = Math.floor(score / SCORE_PER_THEME);
      const themeA = THEMES[idx % THEMES.length];
      const within = (score % SCORE_PER_THEME) / SCORE_PER_THEME;
      const FADE = 0.2;
      if (within <= 1 - FADE) return { themeA, themeB: themeA, t: 0 };
      const themeB = THEMES[(idx + 1) % THEMES.length];
      return { themeA, themeB, t: (within - (1 - FADE)) / FADE };
    }

    function draw() {
      const { themeA, themeB, t } = themeBlend();
      ctx.clearRect(0, 0, W, H);
      drawSky(lerpColor(themeA.sky[0], themeB.sky[0], t), lerpColor(themeA.sky[1], themeB.sky[1], t));
      drawClouds();
      drawThemeScene(themeA, 1 - t);
      drawThemeScene(themeB, t);
      drawGround(lerpColor(themeA.ground, themeB.ground, t), lerpColor(themeA.dash, themeB.dash, t));
      drawObstacles();
      drawCat();
      drawScore(themeA);
      drawOverlay();
    }

    const gameLoop = () => {
      update();
      draw();
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    handleKeyDown = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
    };
    canvas.onclick = jump;
    window.addEventListener('keydown', handleKeyDown);
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  function stop() {
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    if (handleKeyDown) { window.removeEventListener('keydown', handleKeyDown); handleKeyDown = null; }
    if (handleResize) { window.removeEventListener('resize', handleResize); handleResize = null; }
    if (canvas) canvas.onclick = null;
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
  }

  return { start, stop };
})();
