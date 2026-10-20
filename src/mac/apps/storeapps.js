import { h } from '../ui.js';
import { HOME } from '../vfs.js';
import { saveImage, dataURLToBlob } from '../imagestore.js';

const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } return v; };

// ====================================================================== Paint
export const paint = {
  id: 'paint', name: 'Paint', icon: 'paint', store: true, single: false,
  about: 'Paint — by Mr. Agent Labs.',
  launch(os) {
    const W = 900, H = 560;
    const cv = h('canvas.pt-canvas', { width: W, height: H });
    const x = cv.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, W, H);
    let tool = 'brush', color = '#1d1d1f', size = 6, start = null, snap = null;
    const undo = [];
    const pushUndo = () => { undo.push(x.getImageData(0, 0, W, H)); if (undo.length > 30) undo.shift(); };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      pushUndo();
      start = pos(e);
      snap = x.getImageData(0, 0, W, H);
      if (tool === 'fill') { flood(x, ...start.map(Math.round), color, W, H); start = null; return; }
      x.lineCap = x.lineJoin = 'round';
      x.beginPath();
      x.moveTo(...start);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!start) return;
      const p = pos(e);
      x.strokeStyle = tool === 'eraser' ? '#fff' : color;
      x.fillStyle = color;
      x.lineWidth = tool === 'eraser' ? size * 3 : size;
      if (tool === 'brush' || tool === 'eraser') { x.lineTo(...p); x.stroke(); return; }
      x.putImageData(snap, 0, 0);
      x.beginPath();
      if (tool === 'line') { x.moveTo(...start); x.lineTo(...p); x.stroke(); }
      if (tool === 'rect') x.strokeRect(start[0], start[1], p[0] - start[0], p[1] - start[1]);
      if (tool === 'ellipse') { x.ellipse((start[0] + p[0]) / 2, (start[1] + p[1]) / 2, Math.abs(p[0] - start[0]) / 2, Math.abs(p[1] - start[1]) / 2, 0, 0, Math.PI * 2); x.stroke(); }
    });
    cv.addEventListener('pointerup', () => { start = null; });
    const tools = [['brush', '🖌'], ['eraser', '⌫'], ['line', '╱'], ['rect', '▭'], ['ellipse', '◯'], ['fill', '🪣']];
    const toolBtns = tools.map(([t, ic]) => h('button.tb-btn', { text: ic, title: t, class: t === tool ? 'on' : '', onclick: (e) => { tool = t; toolBtns.forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }));
    const colors = ['#1d1d1f', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#49e3ff', '#0a84ff', '#a259ff', '#ff4fa0', '#ffffff'];
    const swatches = colors.map((c) => h('button.pt-sw', { style: { background: c }, 'aria-label': c, class: c === color ? 'on' : '', onclick: (e) => { color = c; swatches.forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }));
    const sizeIn = h('input', { type: 'range', min: '1', max: '40', value: '6', 'aria-label': 'Brush size', oninput: (e) => { size = +e.target.value; } });
    const save = async () => {
      const name = await os.prompt({ title: 'Save Painting', message: 'Saved to Pictures as:', value: 'Painting.png' });
      if (!name) return;
      const ref = await saveImage(dataURLToBlob(cv.toDataURL('image/png')));
      const p = os.vfs.uniqueName(`${HOME}/Pictures`, name.endsWith('.png') ? name : `${name}.png`);
      os.vfs.write(p, '', { imageRef: ref });
      os.notify({ app: 'paint', title: 'Saved', body: `${os.vfs.base(p)} is in Pictures and Photos.` });
    };
    const w = os.createWindow({
      app: this, title: 'Untitled Painting', width: 960, height: 690, minWidth: 520,
      body: (b) => b.append(h('div.pt', {}, h('div.pt-bar', {}, ...toolBtns, h('span.pt-sep'), ...swatches, h('span.pt-sep'), sizeIn, h('div.spacer'),
        h('button.btn', { text: 'Undo', onclick: () => { const u = undo.pop(); if (u) x.putImageData(u, 0, 0); } }),
        h('button.btn', { text: 'Clear', onclick: () => { pushUndo(); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); } }),
        h('button.btn.primary', { text: 'Save…', onclick: save })), h('div.pt-stage', {}, cv))),
      onKey: (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); const u = undo.pop(); if (u) x.putImageData(u, 0, 0); } },
    });
    return w;
  },
};

function flood(x, sx, sy, hex, W, H) {
  const img = x.getImageData(0, 0, W, H), d = img.data;
  const i0 = (sy * W + sx) * 4;
  const target = [d[i0], d[i0 + 1], d[i0 + 2]];
  const c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  if (target.every((v, i) => Math.abs(v - c[i]) < 2)) return;
  const stack = [[sx, sy]];
  const same = (i) => Math.abs(d[i] - target[0]) < 24 && Math.abs(d[i + 1] - target[1]) < 24 && Math.abs(d[i + 2] - target[2]) < 24;
  while (stack.length) {
    const [px, py] = stack.pop();
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const i = (py * W + px) * 4;
    if (!same(i)) continue;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  x.putImageData(img, 0, 0);
}

// ====================================================================== 2048
export const g2048 = {
  id: 'g2048', name: '2048', icon: 'g2048', store: true, single: true,
  about: '2048 — by Bit Studios.',
  launch(os) {
    let grid, score, best = store('mragent.2048.best') || 0, won = false;
    const board = h('div.g2-board');
    const scoreEl = h('b'), bestEl = h('b');
    const empty = () => grid.flatMap((r, y) => r.map((v, x2) => (v ? null : [x2, y]))).filter(Boolean);
    const add = () => { const e = empty(); if (!e.length) return; const [x2, y] = e[Math.floor(Math.random() * e.length)]; grid[y][x2] = Math.random() < 0.9 ? 2 : 4; };
    const reset = () => { grid = Array.from({ length: 4 }, () => [0, 0, 0, 0]); score = 0; won = false; add(); add(); draw(); };
    const slide = (row) => {
      const vals = row.filter(Boolean);
      for (let i = 0; i < vals.length - 1; i++) if (vals[i] === vals[i + 1]) { vals[i] *= 2; score += vals[i]; vals.splice(i + 1, 1); if (vals[i] === 2048 && !won) { won = true; os.notify({ app: 'g2048', title: '2048!', body: 'You did it. Mr. Agent is impressed.' }); } }
      return [...vals, 0, 0, 0, 0].slice(0, 4);
    };
    const move = (dir) => {
      const before = JSON.stringify(grid);
      const rot = (g) => g[0].map((_, i) => g.map((r) => r[i]).reverse());
      let g = grid;
      const turns = { left: 0, down: 1, right: 2, up: 3 }[dir];
      for (let i = 0; i < turns; i++) g = rot(g);
      g = g.map(slide);
      for (let i = 0; i < (4 - turns) % 4; i++) g = rot(g);
      grid = g;
      if (JSON.stringify(grid) !== before) { add(); os.audio.click(); }
      if (score > best) { best = score; store('mragent.2048.best', best); }
      draw();
    };
    const draw = () => {
      board.innerHTML = '';
      grid.flat().forEach((v) => board.append(h('div.g2-tile', { class: v ? `v${Math.min(v, 4096)}` : '', text: v || '' })));
      scoreEl.textContent = String(score);
      bestEl.textContent = String(best);
      const stuck = !empty().length && grid.every((r, y) => r.every((v, x2) => v !== r[x2 + 1] && v !== grid[y + 1]?.[x2]));
      if (stuck) board.append(h('div.g2-over', {}, h('b', { text: 'Game over' }), h('button.btn.primary', { text: 'Try again', onclick: reset })));
    };
    let touch = null;
    board.addEventListener('pointerdown', (e) => { touch = [e.clientX, e.clientY]; });
    board.addEventListener('pointerup', (e) => {
      if (!touch) return;
      const dx = e.clientX - touch[0], dy = e.clientY - touch[1];
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      touch = null;
    });
    const w = os.createWindow({
      app: this, title: '2048', width: 380, height: 520, resizable: false,
      body: (b) => b.append(h('div.g2', {}, h('div.g2-head', {}, h('h1', { text: '2048' }), h('div.g2-score', {}, h('small', { text: 'SCORE' }), scoreEl), h('div.g2-score', {}, h('small', { text: 'BEST' }), bestEl)),
        board, h('div.g2-foot', {}, h('small', { text: 'Arrow keys or swipe' }), h('button.btn', { text: 'New Game', onclick: reset })))),
      onKey: (e) => { const d = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }[e.key]; if (d) { e.preventDefault(); move(d); } },
    });
    reset();
    return w;
  },
};

// ====================================================================== Flappy Bot
export const flappy = {
  id: 'flappy', name: 'Flappy Bot', icon: 'flappy', store: true, single: true,
  about: 'Flappy Bot — by Pixel Bots.',
  launch(os) {
    const W = 360, H = 540;
    const cv = h('canvas.fb-canvas', { width: W, height: H });
    const x = cv.getContext('2d');
    let bot, pipes, score, state, t0, raf, best = store('mragent.flappy.best') || 0;
    const reset = () => { bot = { y: H / 2, v: 0 }; pipes = []; score = 0; state = 'ready'; t0 = 0; };
    const flap = () => {
      if (state === 'over') { reset(); return; }
      state = 'play';
      bot.v = -6.8;
      os.audio.tone({ freq: 660, slideTo: 990, dur: 0.08, type: 'square', gain: 0.03 });
    };
    const step = () => {
      raf = requestAnimationFrame(step);
      if (state === 'play') {
        bot.v += 0.38;
        bot.y += bot.v;
        t0++;
        if (t0 % 90 === 0) pipes.push({ x: W, gap: 120 + Math.random() * (H - 300), passed: false });
        for (const p of pipes) {
          p.x -= 2.4;
          if (!p.passed && p.x + 52 < 80) { p.passed = true; score++; os.audio.pop(); }
          if (p.x < 80 + 18 && p.x + 52 > 80 - 18 && (bot.y - 15 < p.gap - 70 || bot.y + 15 > p.gap + 70)) die();
        }
        pipes = pipes.filter((p) => p.x > -60);
        if (bot.y > H - 40 || bot.y < 0) die();
      }
      draw();
    };
    const die = () => {
      if (state === 'over') return;
      state = 'over';
      os.audio.error();
      if (score > best) { best = score; store('mragent.flappy.best', best); }
    };
    const draw = () => {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#7ad3ff'); g.addColorStop(1, '#d6f1ff');
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#30d158';
      for (const p of pipes) {
        x.fillRect(p.x, 0, 52, p.gap - 70);
        x.fillRect(p.x, p.gap + 70, 52, H);
        x.fillStyle = '#28b44c';
        x.fillRect(p.x - 4, p.gap - 86, 60, 16);
        x.fillRect(p.x - 4, p.gap + 70, 60, 16);
        x.fillStyle = '#30d158';
      }
      x.fillStyle = '#d9b78c';
      x.fillRect(0, H - 40, W, 40);
      x.save();
      x.translate(80, bot.y);
      x.rotate(Math.max(-0.5, Math.min(0.9, bot.v * 0.07)));
      x.fillStyle = '#f4f6fa';
      x.beginPath(); x.ellipse(0, 0, 19, 17, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#05070a';
      x.beginPath(); x.roundRect(-13, -6, 26, 11, 5.5); x.fill();
      x.fillStyle = '#49e3ff';
      x.beginPath(); x.arc(-6, -0.5, 2.4, 0, Math.PI * 2); x.arc(6, -0.5, 2.4, 0, Math.PI * 2); x.fill();
      x.restore();
      x.fillStyle = '#fff';
      x.strokeStyle = '#1d1d1f';
      x.lineWidth = 4;
      x.font = '800 44px -apple-system, Helvetica';
      x.textAlign = 'center';
      x.strokeText(String(score), W / 2, 70);
      x.fillText(String(score), W / 2, 70);
      if (state !== 'play') {
        x.font = '700 22px -apple-system, Helvetica';
        const msg = state === 'ready' ? 'Click or press Space to flap' : `Game over · best ${best}`;
        x.strokeText(msg, W / 2, H / 2 + 80);
        x.fillText(msg, W / 2, H / 2 + 80);
      }
    };
    cv.addEventListener('pointerdown', flap);
    reset();
    step();
    return os.createWindow({
      app: this, title: 'Flappy Bot', width: W, height: H + 38, resizable: false, onClose: () => cancelAnimationFrame(raf),
      body: (b) => b.append(cv),
      onKey: (e) => { if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); flap(); } },
    });
  },
};

// ====================================================================== Stickies
const STICKY_COLORS = ['#fff59a', '#a6f2b4', '#a7dcff', '#ffc4e1', '#d9c8ff', '#ffd6a5'];
export const stickies = {
  id: 'stickies', name: 'Stickies', icon: 'stickies', store: true, single: true,
  about: 'Stickies — by Mr. Agent Labs.',
  launch(os) {
    let notes = store('mragent.stickies') || [{ id: 1, text: 'Welcome to Stickies!\n\nType anything. Notes save automatically.', color: 0, x: 120, y: 60 }, { id: 2, text: 'Buy more coffee beans ☕', color: 1, x: 360, y: 120 }];
    const save = () => store('mragent.stickies', notes);
    const open = (n) => {
      const ta = h('textarea.st-note', { spellcheck: 'false', 'aria-label': 'Sticky note' });
      ta.value = n.text;
      ta.addEventListener('input', () => { n.text = ta.value; save(); });
      let w = null;
      w = os.createWindow({
        app: stickies, title: n.text.split('\n')[0].slice(0, 30) || 'Sticky', width: 220, height: 200, x: n.x, y: n.y, minWidth: 140, minHeight: 100, className: 'win-sticky', restorable: false,
        body: (b) => { b.style.background = STICKY_COLORS[n.color]; b.append(ta); },
        onClose: () => { const keep = n.text.trim(); if (!keep) { notes = notes.filter((m) => m !== n); save(); } },
        onResize: () => { n.x = w ? w.x : n.x; n.y = w ? w.y : n.y; save(); },
      });
      w.el.style.setProperty('--sticky', STICKY_COLORS[n.color]);
      w.toolbar.append(h('div.spacer'), ...STICKY_COLORS.map((c, i) => h('button.st-dot', { style: { background: c }, 'aria-label': `Colour ${i + 1}`, onclick: () => { n.color = i; w.body.style.background = c; w.el.style.setProperty('--sticky', c); save(); } })));
      return w;
    };
    let last = null;
    for (const n of notes) last = open(n);
    if (!notes.length) { const n = { id: Date.now(), text: '', color: 0, x: 140, y: 80 }; notes.push(n); save(); last = open(n); }
    stickies.newNote = () => { const n = { id: Date.now(), text: '', color: Math.floor(Math.random() * STICKY_COLORS.length), x: 160 + Math.random() * 200, y: 80 + Math.random() * 120 }; notes.push(n); save(); open(n); };
    return last;
  },
  menus: () => [{ title: 'File', items: [{ label: 'New Note', action: () => stickies.newNote?.() }] }],
};

// ====================================================================== Dictionary
const WORDS = {
  algorithm: 'a set of steps for solving a problem, such as finding the shortest way to the coffee machine.',
  bug: 'an error in a program; also, an undocumented feature.',
  coffee: 'a brewed drink made from roasted beans; the primary fuel of software engineers and at least one robot.',
  compiler: 'a program that turns source code into something a machine can run, and complains about semicolons.',
  freecad: 'an open-source parametric 3D modeller. Mr. Agent was designed in it.',
  latency: 'the delay before a transfer of data begins. See also: waiting for the espresso.',
  refactor: 'to restructure code without changing what it does, usually on a Friday (don’t).',
  robot: 'a machine capable of carrying out a complex series of actions automatically.',
  servo: 'a motor with feedback, used to move robot joints precisely.',
  typo: 'a mistake made while typing; Mr. Agent makes about one every eighty characters on purpose.',
};
export const dictionary = {
  id: 'dictionary', name: 'Dictionary', icon: 'dictionary', store: true, single: true,
  about: 'Dictionary — by Lexibot.',
  launch(os) {
    const list = h('div.dc-list.scroll');
    const def = h('div.dc-def.scroll');
    const show = (w) => {
      def.innerHTML = '';
      def.append(h('h1', { text: w }), h('p.dc-pron', { text: `| ${w.replace(/([aeiou])/g, '$1ˈ').slice(0, w.length + 1)} |  noun` }), h('p', { text: WORDS[w] || 'No definition found. Mr. Agent suggests writing one.' }));
      list.querySelectorAll('.sb-item').forEach((x) => x.classList.toggle('on', x.textContent === w));
    };
    const fill = (q = '') => { list.innerHTML = ''; Object.keys(WORDS).filter((w) => w.includes(q.toLowerCase())).forEach((w) => list.append(h('div.sb-item', { text: w, onclick: () => show(w) }))); };
    const w = os.createWindow({ app: this, title: 'Dictionary', width: 640, height: 420, sidebarWidth: 200, body: (b) => b.append(h('div.split', {}, h('div.sb', { style: { width: '200px' } }, h('input.tb-search', { placeholder: 'Search', style: { width: '100%', marginBottom: '6px' }, oninput: (e) => fill(e.target.value) }), list), def)) });
    fill();
    show('robot');
    return w;
  },
};
