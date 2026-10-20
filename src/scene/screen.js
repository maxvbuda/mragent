import * as THREE from 'three';
import { SNIPPETS, tokenize, THEME, PROJECT } from './code.js';

const W = 1600, H = 1024;
const FONT = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const UI = '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';

/**
 * The MacBook's display. Draws an editor where the robot's keystrokes appear,
 * runs tests and commits when a file is finished, then opens the next file.
 */
export class LaptopScreen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = false; // re-uploaded often; mipmaps would cost more than they help
    this.texture.minFilter = THREE.LinearFilter;
    this.lastDraw = 0;
    this.mode = 'code'; // 'code' | 'inuse' | 'saver'
    this.index = 0;
    this.history = SNIPPETS.map((s) => ({ ...s, typed: '' }));
    this.linesToday = 1204;
    this.commits = 37;
    // start part-way through a file, as if he'd been at it for a while
    this.reset(Math.floor(Math.random() * SNIPPETS.length));
    const lines = this.snip.code.split('\n');
    const upTo = Math.floor(lines.length * (0.25 + Math.random() * 0.3));
    this.correct = lines.slice(0, upTo).join('\n').length + 1;
    this.history[this.index].typed = this.typed;
    this.blink = 0;
    this.dirty = true;
    this.listeners = {};
    this.t = 0;
    this.saverPos = { x: 300, y: 300, vx: 140, vy: 100 };
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, ...a) { (this.listeners[evt] || []).forEach((f) => f(...a)); }

  reset(i) {
    this.index = i % SNIPPETS.length;
    this.snip = SNIPPETS[this.index];
    this.correct = 0;
    this.wrong = '';
    this.typo = null; // { left: chars of wrong text still to type } or 'delete'
    this.phase = 'typing';
    this.phaseT = 0;
    this.term = [`~/${PROJECT} on main`];
    this.scroll = 0;
    this.dirty = true;
  }

  get typed() { return this.snip.code.slice(0, this.correct) + this.wrong; }
  get progress() { return this.correct / this.snip.code.length; }
  get busy() { return this.phase !== 'typing'; }

  /** One key press from the robot. Returns the kind of key for sound/finger choice. */
  keystroke() {
    if (this.mode !== 'code' || this.phase !== 'typing') return null;
    this.dirty = true;
    this.blink = 0;
    const code = this.snip.code;
    if (this.typo === 'delete') {
      this.wrong = this.wrong.slice(0, -1);
      if (!this.wrong) this.typo = null;
      return 'backspace';
    }
    if (this.typo) {
      this.wrong += randomLetter();
      if (--this.typo.left <= 0) this.typo = 'delete';
      return 'key';
    }
    const ch = code[this.correct];
    if (/[a-z]/i.test(ch) && Math.random() < 0.012) {
      this.wrong = randomLetter();
      this.typo = { left: Math.floor(Math.random() * 3) };
      if (this.typo.left === 0) this.typo = 'delete';
      return 'key';
    }
    this.correct++;
    if (ch === '\n') {
      this.linesToday++;
      while (code[this.correct] === ' ') this.correct++; // robots don't type indentation
    }
    if (this.correct >= code.length) {
      this.phase = 'testing';
      this.phaseT = 0;
      this.history[this.index].typed = code;
      this.emit('fileDone', this.snip);
    }
    this.history[this.index].typed = this.typed;
    return ch === '\n' ? 'enter' : ch === ' ' ? 'space' : 'key';
  }

  update(dt) {
    this.t += dt;
    this.blink += dt;
    if (this.mode === 'saver') { this.drawSaver(dt); return; }
    if (this.phase === 'testing') {
      this.phaseT += dt;
      const n = Math.min(this.snip.test.length, Math.floor(this.phaseT / 0.28));
      if (this.term.length - 1 !== n) {
        this.term = [`~/${PROJECT} on main`, ...this.snip.test.slice(0, n)];
        this.dirty = true;
      }
      if (n >= this.snip.test.length && this.phaseT > this.snip.test.length * 0.28 + 0.8) {
        this.phase = 'commit';
        this.phaseT = 0;
        this.commits++;
        this.term.push(`$ git commit -am "${this.snip.commit}"`, `[main ${hash()}] ${this.snip.commit}`, ' 1 file changed, ' + this.snip.code.split('\n').length + ' insertions(+)');
        this.dirty = true;
        this.emit('testsPassed', this.snip);
      }
    } else if (this.phase === 'commit') {
      this.phaseT += dt;
      if (this.phaseT > 2.4) {
        this.reset(this.index + 1);
        this.emit('nextFile', this.snip);
      }
    }
    if (this.blink > 0.53) { this.blink = 0; this.cursorOn = !this.cursorOn; this.dirty = true; }
    // redraw at most ~15 times a second, however fast he types
    if (this.dirty && this.t - this.lastDraw > 1 / 15) { this.lastDraw = this.t; this.draw(); }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.dirty = true;
    if (mode !== 'saver') this.draw();
  }

  // ------------------------------------------------------------------ drawing
  draw() {
    this.dirty = false;
    const x = this.ctx;
    if (this.mode === 'inuse') return this.drawInUse();
    x.fillStyle = THEME.bg;
    x.fillRect(0, 0, W, H);
    this.drawMenuBar(x, 'Code');

    const top = 34, title = 40, tabs = 42, termH = 230, status = 28;
    // window title bar
    x.fillStyle = '#1b1e25';
    x.fillRect(0, top, W, title);
    [['#ff5f57', 26], ['#febc2e', 50], ['#28c840', 74]].forEach(([c, px]) => {
      x.fillStyle = c; x.beginPath(); x.arc(px, top + title / 2, 7.5, 0, Math.PI * 2); x.fill();
    });
    x.fillStyle = '#9aa5b8';
    x.font = `500 19px ${UI}`;
    x.textAlign = 'center';
    x.fillText(`${this.snip.path.split('/').pop()} — ${PROJECT}`, W / 2, top + 27);
    x.textAlign = 'left';

    // activity bar + explorer
    const bodyTop = top + title;
    const bodyH = H - bodyTop - status;
    x.fillStyle = THEME.side;
    x.fillRect(0, bodyTop, 58, bodyH);
    ['⧉', '⌕', '⑂', '▷', '⚙'].forEach((g, i) => {
      x.fillStyle = i === 0 ? '#e6e9ef' : '#58606e';
      x.font = `28px ${UI}`;
      x.fillText(g, 16, bodyTop + 46 + i * 58);
    });
    x.fillStyle = THEME.panel;
    x.fillRect(58, bodyTop, 270, bodyH);
    x.fillStyle = '#7f8899';
    x.font = `600 15px ${UI}`;
    x.fillText('EXPLORER', 76, bodyTop + 30);
    x.font = `600 17px ${UI}`;
    x.fillStyle = '#c9cfda';
    x.fillText(`▾ ${PROJECT.toUpperCase()}`, 70, bodyTop + 62);
    const files = SNIPPETS.map((s) => s.path).sort();
    let fy = bodyTop + 94;
    let lastDir = '';
    x.font = `17px ${UI}`;
    for (const f of files) {
      const dir = f.split('/').slice(0, -1).join('/');
      if (dir !== lastDir) {
        x.fillStyle = '#9aa5b8';
        x.fillText(`▾ ${dir}`, 84, fy);
        fy += 29;
        lastDir = dir;
      }
      const active = f === this.snip.path;
      if (active) { x.fillStyle = '#232a36'; x.fillRect(58, fy - 21, 270, 29); }
      x.fillStyle = active ? '#ffffff' : '#aeb6c4';
      x.fillText(`${fileIcon(f)}  ${f.split('/').pop()}`, 104, fy);
      fy += 29;
    }

    // tabs
    const ex = 328;
    x.fillStyle = THEME.panel;
    x.fillRect(ex, bodyTop, W - ex, tabs);
    const prev = SNIPPETS[(this.index + SNIPPETS.length - 1) % SNIPPETS.length];
    [[prev.path, false], [this.snip.path, true]].forEach(([p, act], i) => {
      const tx = ex + i * 250;
      x.fillStyle = act ? THEME.bg : THEME.panel;
      x.fillRect(tx, bodyTop, 248, tabs);
      if (act) { x.fillStyle = THEME.accent; x.fillRect(tx, bodyTop, 248, 2); }
      x.fillStyle = act ? '#fff' : '#7f8899';
      x.font = `17px ${UI}`;
      x.fillText(`${fileIcon(p)}  ${p.split('/').pop()}${act && this.phase === 'typing' ? '  ●' : ''}`, tx + 16, bodyTop + 27);
    });

    // code
    const codeTop = bodyTop + tabs;
    const codeH = bodyH - tabs - termH;
    const lh = 30;
    x.font = `20px ${FONT}`;
    const cw = x.measureText('M').width;
    const lines = this.typed.split('\n');
    const visible = Math.floor((codeH - 16) / lh);
    const cursorLine = lines.length - 1;
    if (cursorLine - this.scroll > visible - 3) this.scroll = cursorLine - visible + 3;
    if (cursorLine < this.scroll) this.scroll = Math.max(0, cursorLine - 2);
    x.save();
    x.beginPath();
    x.rect(ex, codeTop, W - ex - 110, codeH);
    x.clip();
    for (let li = this.scroll; li < Math.min(lines.length, this.scroll + visible + 1); li++) {
      const y = codeTop + 30 + (li - this.scroll) * lh;
      if (li === cursorLine) { x.fillStyle = THEME.line; x.fillRect(ex, y - 22, W - ex, lh); }
      x.fillStyle = li === cursorLine ? '#c6cbd6' : THEME.gutter;
      x.textAlign = 'right';
      x.fillText(String(li + 1), ex + 56, y);
      x.textAlign = 'left';
      let px = ex + 82;
      const isLast = li === cursorLine;
      const toks = tokenize(lines[li], this.snip.lang);
      const wrongStart = isLast && this.wrong ? lines[li].length - this.wrong.length : Infinity;
      let col = 0;
      for (const [kind, text] of toks) {
        for (const ch of text) {
          x.fillStyle = col >= wrongStart ? '#ff6b6b' : THEME[kind] || THEME.text;
          x.fillText(ch, px, y);
          px += cw;
          col++;
        }
      }
      if (isLast && this.wrong) { // red squiggle under the typo
        x.strokeStyle = '#ff6b6b';
        x.lineWidth = 2;
        x.beginPath();
        const sx = ex + 82 + wrongStart * cw;
        for (let k = 0; k <= this.wrong.length * cw; k += 4) x.lineTo(sx + k, y + 6 + (k % 8 ? 2 : -1));
        x.stroke();
      }
      if (isLast && this.cursorOn !== false && this.phase === 'typing') {
        x.fillStyle = THEME.accent;
        x.fillRect(px + 1, y - 21, 3, 27);
      }
    }
    x.restore();

    // minimap
    x.fillStyle = '#12141a';
    x.fillRect(W - 110, codeTop, 110, codeH);
    lines.slice(0, 120).forEach((l, i) => {
      const toks = tokenize(l, this.snip.lang);
      let mx = W - 102;
      for (const [kind, text] of toks) {
        x.fillStyle = THEME[kind] || THEME.text;
        x.globalAlpha = 0.55;
        x.fillRect(mx, codeTop + 8 + i * 4, text.length * 1.6, 2.4);
        mx += text.length * 1.6;
      }
    });
    x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,255,255,0.06)';
    x.fillRect(W - 110, codeTop + 8 + this.scroll * 4, 110, visible * 4);

    // terminal
    const tt = codeTop + codeH;
    x.fillStyle = THEME.panel;
    x.fillRect(ex, tt, W - ex, termH);
    x.fillStyle = '#262a33';
    x.fillRect(ex, tt, W - ex, 1);
    x.font = `600 15px ${UI}`;
    ['PROBLEMS', 'OUTPUT', 'TERMINAL', 'PORTS'].forEach((t, i) => {
      x.fillStyle = i === 2 ? '#e6e9ef' : '#6c7586';
      x.fillText(t, ex + 20 + i * 120, tt + 30);
      if (i === 2) { x.fillStyle = THEME.accent; x.fillRect(ex + 20, tt + 38, 82, 2); }
    });
    x.font = `18px ${FONT}`;
    const tl = this.term.slice(-6);
    tl.forEach((l, i) => {
      x.fillStyle = l.startsWith('$') ? '#e6e9ef' : /✓|ok|PASS|passed|OK/.test(l) ? THEME.ok : l.startsWith('~') ? THEME.accent : '#9aa5b8';
      x.fillText(l, ex + 20, tt + 70 + i * 26);
    });
    if (this.phase === 'typing') {
      x.fillStyle = '#e6e9ef';
      x.fillText('$ ', ex + 20, tt + 70 + tl.length * 26);
    }

    // status bar
    x.fillStyle = this.phase === 'typing' ? '#1f6feb' : '#238636';
    x.fillRect(0, H - status, W, status);
    x.fillStyle = '#fff';
    x.font = `16px ${UI}`;
    const ln = cursorLine + 1, colN = lines[cursorLine].length + 1;
    x.fillText(`⑂ main   ⟳ ${this.commits} commits today   ✓ 0 problems`, 16, H - 9);
    x.textAlign = 'right';
    x.fillText(`Ln ${ln}, Col ${colN}    ${langName(this.snip.lang)}    🤖 Mr. Agent · ${this.linesToday.toLocaleString()} lines today`, W - 16, H - 9);
    x.textAlign = 'left';
    this.texture.needsUpdate = true;
  }

  drawMenuBar(x, app) {
    x.fillStyle = '#0b0c10';
    x.fillRect(0, 0, W, 34);
    x.fillStyle = '#e8ebf0';
    x.font = `600 18px ${UI}`;
    x.fillText('', 22, 24);
    x.fillText(app, 56, 24);
    x.font = `18px ${UI}`;
    ['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Window', 'Help'].forEach((m, i) => x.fillText(m, 120 + i * 78, 24));
    x.fillStyle = '#000'; // notch
    roundRect(x, W / 2 - 110, -10, 220, 44, 14);
    x.fill();
    const d = new Date();
    x.fillStyle = '#e8ebf0';
    x.textAlign = 'right';
    x.fillText(`∞%  ◉  ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}  ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, W - 22, 24);
    x.textAlign = 'left';
  }

  drawInUse() {
    const x = this.ctx;
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2a1b5e');
    g.addColorStop(0.5, '#c2457a');
    g.addColorStop(1, '#ffb46b');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    this.drawMenuBar(x, 'Finder');
    x.fillStyle = 'rgba(255,255,255,0.9)';
    x.font = `600 64px ${UI}`;
    x.textAlign = 'center';
    x.fillText('You’re using Mr. Agent’s Mac', W / 2, H / 2);
    x.font = `28px ${UI}`;
    x.fillText('He’s on a coffee break. Be nice to his files.', W / 2, H / 2 + 56);
    x.textAlign = 'left';
    this.texture.needsUpdate = true;
  }

  drawSaver(dt) {
    const x = this.ctx, p = this.saverPos;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < 0 || p.x > W - 360) p.vx *= -1;
    if (p.y < 40 || p.y > H - 120) p.vy *= -1;
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
    x.font = `700 60px ${UI}`;
    x.fillStyle = `hsl(${(this.t * 40) % 360},90%,65%)`;
    x.fillText('</> brb ☕', p.x, p.y + 60);
    this.texture.needsUpdate = true;
  }
}

function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}
const randomLetter = () => 'asdfghjklqwertyuiopzxcvbnm'[Math.floor(Math.random() * 26)];
const hash = () => Math.random().toString(16).slice(2, 9);
const fileIcon = (p) => ({ ts: 'TS', tsx: '⚛', rs: '⚙', py: '🐍', glsl: '◈' })[p.split('.').pop()] || '·';
const langName = (l) => ({ ts: 'TypeScript', rs: 'Rust', py: 'Python', glsl: 'GLSL' })[l] || l;
