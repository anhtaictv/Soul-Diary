// js/games-extra.js — 4 mini game giải trí thêm: Rắn săn mồi, 2048, Caro, Flappy Mèo (v3.7)
// Mỗi game là 1 module { start(el, onGameOver), stop() } giống hệt contract của Game (game.js).

// ── Rắn săn mồi ────────────────────────────────────────────────────────────
const SnakeGame = (() => {
  let timer = null, handleKey = null, canvas, ctx, onGameOver;
  const COLS = 30, ROWS = 10, CELL = 20;

  function start(canvasEl, gameOverCallback) {
    stop();
    canvas = canvasEl; ctx = canvas.getContext('2d'); onGameOver = gameOverCallback;
    canvas.width = COLS * CELL; canvas.height = ROWS * CELL;
    canvas.style.width = canvas.width + 'px'; canvas.style.height = canvas.height + 'px'; canvas.style.maxWidth = '100%';

    let snake, dir, nextDir, food, score, state = 'waiting';

    function reset() {
      snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
      dir = { x: 1, y: 0 }; nextDir = dir; score = 0; state = 'playing';
      placeFood();
    }
    function placeFood() {
      do { food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
      while (snake.some(s => s.x === food.x && s.y === food.y));
    }
    function tick() {
      if (state !== 'playing') { draw(); return; }
      dir = nextDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS || snake.some(s => s.x === head.x && s.y === head.y)) {
        state = 'over';
        if (onGameOver) onGameOver(score);
        draw();
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) { score += 10; placeFood(); }
      else snake.pop();
      draw();
    }
    function draw() {
      ctx.fillStyle = '#f7f4ee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#e05656';
      ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#2e7d32' : '#66bb6a';
        ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      });
      ctx.fillStyle = '#333'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('ĐIỂM ' + score, canvas.width - 10, 6);
      ctx.textAlign = 'center';
      if (state === 'waiting') ctx.fillText('Bấm phím mũi tên để bắt đầu', canvas.width / 2, canvas.height / 2 - 6);
      if (state === 'over') { ctx.fillText('Thua rồi! Bấm mũi tên để chơi lại', canvas.width / 2, canvas.height / 2 - 6); }
    }

    reset(); state = 'waiting'; draw();
    const DIRS = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
    handleKey = (e) => {
      if (!DIRS[e.code]) return;
      e.preventDefault();
      if (state !== 'playing') { reset(); return; }
      const d = DIRS[e.code];
      if (d.x === -dir.x && d.y === -dir.y) return; // không cho quay đầu 180°
      nextDir = d;
    };
    window.addEventListener('keydown', handleKey);
    timer = setInterval(tick, 130);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (handleKey) { window.removeEventListener('keydown', handleKey); handleKey = null; }
  }
  return { start, stop };
})();

// ── 2048 ─────────────────────────────────────────────────────────────────
const Game2048 = (() => {
  let handleKey = null, el, onGameOver;
  const SIZE = 4;

  function start(container, gameOverCallback) {
    stop();
    el = container; onGameOver = gameOverCallback;
    el.innerHTML = `
      <div id="g2048-score" style="font-weight:700;margin-bottom:8px">ĐIỂM 0</div>
      <div id="g2048-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;background:#bbada0;padding:8px;border-radius:8px"></div>
      <div id="g2048-msg" style="margin-top:8px;font-size:13px;color:var(--text-muted,#888)"></div>
    `;
    const gridEl = el.querySelector('#g2048-grid');
    const scoreEl = el.querySelector('#g2048-score');
    const msgEl = el.querySelector('#g2048-msg');

    let board, score, over;
    const COLORS = { 2:'#eee4da',4:'#ede0c8',8:'#f2b179',16:'#f59563',32:'#f67c5f',64:'#f65e3b',128:'#edcf72',256:'#edcc61',512:'#edc850',1024:'#edc53f',2048:'#edc22e' };

    function reset() {
      board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      score = 0; over = false;
      addTile(); addTile();
      render();
    }
    function addTile() {
      const empty = [];
      board.forEach((row, r) => row.forEach((v, c) => { if (!v) empty.push([r, c]); }));
      if (!empty.length) return;
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      board[r][c] = Math.random() < 0.9 ? 2 : 4;
    }
    function slideLine(line) {
      const vals = line.filter(v => v);
      const merged = [];
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] === vals[i + 1]) { merged.push(vals[i] * 2); score += vals[i] * 2; i++; }
        else merged.push(vals[i]);
      }
      while (merged.length < SIZE) merged.push(0);
      return merged;
    }
    function move(dir) { // 'up'|'down'|'left'|'right'
      const before = JSON.stringify(board);
      if (dir === 'left') board = board.map(row => slideLine(row));
      if (dir === 'right') board = board.map(row => slideLine([...row].reverse()).reverse());
      if (dir === 'up' || dir === 'down') {
        for (let c = 0; c < SIZE; c++) {
          let col = board.map(row => row[c]);
          if (dir === 'down') col = col.reverse();
          col = slideLine(col);
          if (dir === 'down') col = col.reverse();
          for (let r = 0; r < SIZE; r++) board[r][c] = col[r];
        }
      }
      if (JSON.stringify(board) !== before) { addTile(); render(); checkOver(); }
    }
    function canMove() {
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        if (!board[r][c]) return true;
        if (c < SIZE - 1 && board[r][c] === board[r][c + 1]) return true;
        if (r < SIZE - 1 && board[r][c] === board[r + 1][c]) return true;
      }
      return false;
    }
    function checkOver() {
      if (over || canMove()) return;
      over = true;
      msgEl.textContent = 'Hết nước đi! Bấm phím mũi tên để chơi lại.';
      if (onGameOver) onGameOver(score);
    }
    function render() {
      scoreEl.textContent = 'ĐIỂM ' + score;
      gridEl.innerHTML = board.map(row => row.map(v => `
        <div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:6px;font-weight:700;font-size:18px;
             background:${v ? COLORS[v] || '#3c3a32' : '#cdc1b4'};color:${v && v <= 4 ? '#776e65' : '#fff'}">${v || ''}</div>
      `).join('')).join('');
    }

    reset();
    handleKey = (e) => {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (!map[e.code]) return;
      e.preventDefault();
      if (over) { reset(); return; }
      move(map[e.code]);
    };
    window.addEventListener('keydown', handleKey);
  }
  function stop() {
    if (handleKey) { window.removeEventListener('keydown', handleKey); handleKey = null; }
  }
  return { start, stop };
})();

// ── Caro (Gomoku 9x9, chơi với máy) ─────────────────────────────────────────
const CaroGame = (() => {
  let el, onGameOver;
  const N = 9, WIN = 5;

  function start(container, gameOverCallback) {
    stop();
    el = container; onGameOver = gameOverCallback;
    el.innerHTML = `
      <div id="caro-msg" style="font-weight:700;margin-bottom:8px">Chuỗi thắng: <span id="caro-streak">0</span> — Lượt của bạn (●)</div>
      <div id="caro-grid" style="display:grid;grid-template-columns:repeat(${N},minmax(0,1fr));gap:3px;max-width:460px;margin:0 auto;background:#ccc;padding:3px;border-radius:6px;overflow:hidden"></div>
    `;
    const gridEl = el.querySelector('#caro-grid');
    const msgEl = el.querySelector('#caro-msg');
    const streakEl = el.querySelector('#caro-streak');

    let board, over, streak = 0, thinking = false;
    const DIRS = [[1,0],[0,1],[1,1],[1,-1]];

    function reset() {
      board = Array.from({ length: N }, () => Array(N).fill(0)); // 0 trống, 1 người, 2 máy
      over = false; thinking = false;
      render();
    }
    function checkWin(b, r, c, p) {
      for (const [dr, dc] of DIRS) {
        let count = 1;
        for (let s = 1; s < WIN; s++) { const rr = r + dr*s, cc = c + dc*s; if (rr<0||rr>=N||cc<0||cc>=N||b[rr][cc]!==p) break; count++; }
        for (let s = 1; s < WIN; s++) { const rr = r - dr*s, cc = c - dc*s; if (rr<0||rr>=N||cc<0||cc>=N||b[rr][cc]!==p) break; count++; }
        if (count >= WIN) return true;
      }
      return false;
    }
    function lineScore(b, r, c, p) {
      let best = 0;
      for (const [dr, dc] of DIRS) {
        let count = 1;
        for (let s = 1; s < WIN; s++) { const rr=r+dr*s, cc=c+dc*s; if (rr<0||rr>=N||cc<0||cc>=N||b[rr][cc]!==p) break; count++; }
        for (let s = 1; s < WIN; s++) { const rr=r-dr*s, cc=c-dc*s; if (rr<0||rr>=N||cc<0||cc>=N||b[rr][cc]!==p) break; count++; }
        if (count > best) best = count;
      }
      return best;
    }
    // AI đơn giản: chọn ô trống có tổng điểm tấn công (máy) + phòng thủ (chặn người) cao nhất, ưu tiên gần trung tâm
    function aiMove() {
      let bestCell = null, bestScore = -1;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (board[r][c]) continue;
        board[r][c] = 2; const atk = lineScore(board, r, c, 2); board[r][c] = 0;
        board[r][c] = 1; const def = lineScore(board, r, c, 1); board[r][c] = 0;
        const centerBonus = -((Math.abs(r - N/2) + Math.abs(c - N/2)) * 0.1);
        const s = atk * 1.1 + def + centerBonus;
        if (s > bestScore) { bestScore = s; bestCell = [r, c]; }
      }
      if (!bestCell) return;
      const [r, c] = bestCell;
      board[r][c] = 2;
      if (checkWin(board, r, c, 2)) endRound(false);
    }
    function endRound(won) {
      over = true;
      streak = won ? streak + 1 : 0;
      streakEl.textContent = streak;
      msgEl.innerHTML = (won ? '🎉 Bạn thắng!' : '💀 Bạn thua rồi!') + ' Bấm ô bất kỳ để chơi ván mới.';
      if (onGameOver) onGameOver(streak);
    }
    function render() {
      gridEl.innerHTML = board.map((row, r) => row.map((v, c) => `
        <div data-r="${r}" data-c="${c}" style="aspect-ratio:1;min-width:0;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;
             font-size:clamp(14px,5.5vw,36px);font-weight:900;cursor:pointer;color:${v===1?'#2563eb':'#e05656'}">${v===1?'●':v===2?'○':''}</div>
      `).join('')).join('');
    }
    gridEl.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-r]');
      if (!cell) return;
      if (over) { reset(); return; }
      if (thinking) return; // máy đang "suy nghĩ" — chặn click để người không đi liền 2 nước
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (board[r][c]) return;
      board[r][c] = 1;
      if (checkWin(board, r, c, 1)) { render(); endRound(true); return; }
      render();
      if (board.some(row => row.some(v => !v))) {
        thinking = true;
        setTimeout(() => { aiMove(); thinking = false; render(); }, 150);
      }
    });

    reset();
  }
  function stop() {}
  return { start, stop };
})();

// ── Flappy Mèo ───────────────────────────────────────────────────────────
const FlappyGame = (() => {
  let raf = null, handleKey = null, canvas, ctx, onGameOver;

  function start(canvasEl, gameOverCallback) {
    stop();
    canvas = canvasEl; ctx = canvas.getContext('2d'); onGameOver = gameOverCallback;
    const W = canvas.width, H = canvas.height;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; canvas.style.maxWidth = '100%';
    const GRAVITY = 0.22, FLAP_V = -4.6, BIRD_X = 80, BIRD_R = 12;
    const GAP = 110, PIPE_W = 40, PIPE_SPEED = 1.5;

    let birdY, vy, pipes, score, state = 'waiting';

    function reset() {
      birdY = H / 2; vy = 0; pipes = []; score = 0; state = 'playing';
      spawnPipe();
    }
    function spawnPipe() {
      const top = 20 + Math.random() * (H - GAP - 40);
      pipes.push({ x: W + PIPE_W, top, passed: false });
    }
    function flap() {
      if (state !== 'playing') { reset(); return; }
      vy = FLAP_V;
    }
    function update() {
      if (state !== 'playing') return;
      vy += GRAVITY; birdY += vy;
      if (birdY - BIRD_R < 0 || birdY + BIRD_R > H) { gameOver(); return; }
      pipes.forEach(p => p.x -= PIPE_SPEED);
      if (pipes.length && pipes[0].x < -PIPE_W) pipes.shift();
      if (!pipes.length || pipes[pipes.length - 1].x < W - 260) spawnPipe();
      for (const p of pipes) {
        if (!p.passed && p.x + PIPE_W < BIRD_X) { p.passed = true; score++; }
        const withinX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
        const hitsGap = birdY - BIRD_R < p.top || birdY + BIRD_R > p.top + GAP;
        if (withinX && hitsGap) { gameOver(); return; }
      }
    }
    function gameOver() {
      state = 'over';
      if (onGameOver) onGameOver(score);
    }
    function draw() {
      ctx.fillStyle = '#bdeeff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#4e8a3f';
      pipes.forEach(p => {
        ctx.fillRect(p.x, 0, PIPE_W, p.top);
        ctx.fillRect(p.x, p.top + GAP, PIPE_W, H - p.top - GAP);
      });
      ctx.fillStyle = '#333'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🐱', BIRD_X, birdY);
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.font = 'bold 14px monospace';
      ctx.fillText('ĐIỂM ' + score, W - 10, 6);
      ctx.textAlign = 'center';
      if (state === 'waiting') ctx.fillText('Bấm Space / click để bay', W / 2, H / 2 - 20);
      if (state === 'over') ctx.fillText('Va vào ống rồi! Bấm để chơi lại', W / 2, H / 2 - 20);
    }
    function loop() { update(); draw(); raf = requestAnimationFrame(loop); }

    state = 'waiting'; pipes = []; score = 0; birdY = H / 2; vy = 0;
    handleKey = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); } };
    canvas.onclick = flap;
    window.addEventListener('keydown', handleKey);
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (handleKey) { window.removeEventListener('keydown', handleKey); handleKey = null; }
    if (canvas) canvas.onclick = null;
  }
  return { start, stop };
})();
