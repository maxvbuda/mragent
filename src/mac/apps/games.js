import { h } from '../ui.js';

export const minesweeper = {
  id: 'minesweeper', name: 'Minesweeper', icon: 'minesweeper', single: true,
  about: 'Minesweeper — a classic, now with robot mines.',
  launch(os) {
    const LEVELS = { Beginner: [9, 9, 10], Intermediate: [16, 16, 40] };
    let level = 'Beginner', W, H, M, cells, over, first, flags, timer = 0, iv = null;
    const board = h('div.ms-board');
    const face = h('button.ms-face', { 'aria-label': 'New game', onclick: () => reset() });
    const mines = h('span.ms-lcd');
    const clock = h('span.ms-lcd');
    const reset = () => {
      [W, H, M] = LEVELS[level];
      cells = Array.from({ length: W * H }, () => ({ mine: false, open: false, flag: false, n: 0 }));
      over = false; first = true; flags = 0; timer = 0;
      clearInterval(iv); iv = null;
      face.textContent = '🙂';
      render();
    };
    const nb = (i) => { const x = i % W, y = (i / W) | 0, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(ny * W + nx); } return out; };
    const plant = (safe) => {
      let k = 0;
      while (k < M) { const i = Math.floor(Math.random() * W * H); if (i === safe || nb(safe).includes(i) || cells[i].mine) continue; cells[i].mine = true; k++; }
      cells.forEach((c, i) => { c.n = nb(i).filter((j) => cells[j].mine).length; });
    };
    const open = (i) => {
      const c = cells[i];
      if (c.open || c.flag || over) return;
      if (first) { plant(i); first = false; iv = setInterval(() => { timer++; clock.textContent = String(Math.min(999, timer)).padStart(3, '0'); }, 1000); }
      c.open = true;
      if (c.mine) { over = true; c.boom = true; cells.forEach((x) => { if (x.mine) x.open = true; }); face.textContent = '😵'; clearInterval(iv); os.audio.error(); return; }
      if (!c.n) nb(i).forEach(open);
      if (cells.filter((x) => !x.open).length === M) { over = true; face.textContent = '😎'; clearInterval(iv); os.audio.happy(); os.notify({ app: 'minesweeper', title: 'You win!', body: `Cleared ${level} in ${timer}s. Mr. Agent is impressed.` }); }
    };
    const render = () => {
      board.style.gridTemplateColumns = `repeat(${W}, 24px)`;
      board.innerHTML = '';
      mines.textContent = String(M - flags).padStart(3, '0');
      clock.textContent = String(timer).padStart(3, '0');
      cells.forEach((c, i) => {
        const b = h('button.ms-cell', { class: [c.open ? 'open' : '', c.boom ? 'boom' : '', c.open && c.n ? `n${c.n}` : ''].join(' '), text: c.open ? (c.mine ? '🤖' : c.n || '') : c.flag ? '🚩' : '' });
        b.addEventListener('click', () => { open(i); render(); });
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (c.open || over) return; c.flag = !c.flag; flags += c.flag ? 1 : -1; render(); });
        b.addEventListener('pointerdown', () => { if (!over) face.textContent = '😮'; });
        b.addEventListener('pointerup', () => { if (!over) face.textContent = '🙂'; });
        board.append(b);
      });
    };
    const w = os.createWindow({
      app: this, title: 'Minesweeper', width: 300, height: 380, resizable: false, onClose: () => clearInterval(iv),
      body: (b) => b.append(h('div.ms', {}, h('div.ms-top', {}, mines, face, clock), board, h('small.ms-hint', { text: 'Right-click to flag a robot mine' }))),
    });
    w.toolbar.append(h('div.spacer'), h('select.field', { 'aria-label': 'Difficulty', onchange: (e) => { level = e.target.value; reset(); w.w = level === 'Beginner' ? 300 : 460; w.h = level === 'Beginner' ? 380 : 540; w.place(); } }, ...Object.keys(LEVELS).map((l) => h('option', { text: l }))));
    reset();
    return w;
  },
};

export const snake = {
  id: 'snake', name: 'Snake', icon: 'snake', single: true,
  about: 'Snake — eat the matcha leaves.',
  launch(os) {
    const N = 20, S = 18;
    const canvas = h('canvas.sn-canvas', { width: N * S, height: N * S });
    const x = canvas.getContext('2d');
    const score = h('b');
    let best = +(safeGet('mragent.snake.best') || 0);
    let body, dir, next, food, alive, pts, iv;
    const place = () => { do { food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; } while (body.some(([a, b]) => a === food[0] && b === food[1])); };
    const start = () => {
      body = [[8, 10], [7, 10], [6, 10]]; dir = [1, 0]; next = dir; alive = true; pts = 0;
      place();
      clearInterval(iv);
      iv = setInterval(step, 110);
      draw();
    };
    const step = () => {
      dir = next;
      const head = [(body[0][0] + dir[0] + N) % N, (body[0][1] + dir[1] + N) % N];
      if (body.some(([a, b]) => a === head[0] && b === head[1])) {
        alive = false; clearInterval(iv); os.audio.error();
        if (pts > best) { best = pts; safeSet('mragent.snake.best', String(best)); }
        draw(); return;
      }
      body.unshift(head);
      if (head[0] === food[0] && head[1] === food[1]) { pts++; os.audio.pop(); place(); } else body.pop();
      draw();
    };
    const draw = () => {
      x.fillStyle = '#0f1a12';
      x.fillRect(0, 0, N * S, N * S);
      x.font = `${S - 2}px serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('🍵', food[0] * S + S / 2, food[1] * S + S / 2 + 1);
      body.forEach(([a, b], i) => { x.fillStyle = i ? `hsl(140 70% ${50 - Math.min(25, i)}%)` : '#5dff8a'; x.beginPath(); x.roundRect(a * S + 1, b * S + 1, S - 2, S - 2, 5); x.fill(); });
      score.textContent = `Score ${pts} · Best ${best}`;
      if (!alive) { x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, 0, N * S, N * S); x.fillStyle = '#fff'; x.font = '600 22px -apple-system, sans-serif'; x.fillText('Game over — press Space', N * S / 2, N * S / 2); }
    };
    const w = os.createWindow({
      app: this, title: 'Snake', width: N * S + 40, height: N * S + 110, resizable: false, className: 'win-snake', dark: true, onClose: () => clearInterval(iv),
      body: (b) => b.append(h('div.sn', {}, canvas, h('div.sn-bar', {}, score, h('small', { text: 'Arrow keys / WASD · Space restarts' })))),
      onKey: (e) => {
        const k = e.key.toLowerCase();
        const m = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
        if (m) { e.preventDefault(); if (m[0] !== -dir[0] || m[1] !== -dir[1]) next = m; }
        if (k === ' ') { e.preventDefault(); if (!alive) start(); }
      },
    });
    start();
    return w;
  },
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } }
