import { h, drag } from './ui.js';
import { robotAvatar } from './os.js';

/** Desktop widgets (clock, Mr. Agent status, calendar, weather, battery, now playing). */
const TYPES = {
  clock: { name: 'Clock', w: 156, h: 156 },
  agent: { name: 'Mr. Agent', w: 328, h: 156 },
  calendar: { name: 'Calendar', w: 156, h: 156 },
  weather: { name: 'Weather', w: 156, h: 156 },
  battery: { name: 'Batteries', w: 156, h: 156 },
  music: { name: 'Now Playing', w: 328, h: 156 },
};

export class Widgets {
  constructor(os) {
    this.os = os;
    this.layer = h('div.widget-layer');
    os.desktop.prepend(this.layer);
    this.render();
    setInterval(() => this.update(), 1000);
  }

  get list() { return this.os.prefs.widgets || []; }
  save() { this.os.savePrefs(); }

  render() {
    this.layer.innerHTML = '';
    this.els = this.list.map((wd, i) => {
      const t = TYPES[wd.type];
      if (!t) return null;
      const el = h(`div.widget.wg-${wd.type}`, { style: { left: `${wd.x}px`, top: `${wd.y}px`, width: `${t.w}px`, height: `${t.h}px` } });
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const x0 = wd.x, y0 = wd.y;
        drag(e, (dx, dy) => {
          wd.x = Math.round((x0 + dx) / 8) * 8;
          wd.y = Math.max(32, Math.round((y0 + dy) / 8) * 8);
          el.style.left = `${wd.x}px`;
          el.style.top = `${wd.y}px`;
          el.classList.add('dragging');
        }, () => { el.classList.remove('dragging'); this.save(); });
      });
      el.addEventListener('contextmenu', (e) => this.os.contextMenu(e, [
        { label: 'Remove Widget', action: () => { this.list.splice(i, 1); this.save(); this.render(); } },
        { label: 'Edit Widgets…', action: () => this.gallery() },
      ]));
      el.addEventListener('dblclick', () => {
        const map = { clock: 'clock', agent: 'findmy', calendar: 'calendar', weather: 'weather', music: 'music', battery: 'settings' };
        this.os.launch(map[wd.type], wd.type === 'battery' ? { pane: 'battery' } : {});
      });
      this.layer.append(el);
      return { el, wd };
    });
    this.update();
  }

  update() {
    if (!this.els) return;
    for (const item of this.els) if (item) this.paint(item.el, item.wd.type);
  }

  paint(el, type) {
    const os = this.os, d = new Date();
    if (type === 'clock') {
      const s = d.getSeconds(), m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60;
      const hand = (deg, len, w, c) => `<line x1="50" y1="50" x2="${50 + Math.sin(deg) * len}" y2="${50 - Math.cos(deg) * len}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
      const ticks = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<text x="${50 + Math.sin(a) * 37}" y="${53.5 - Math.cos(a) * 37}" text-anchor="middle" font-size="9" font-weight="600" fill="currentColor" font-family="-apple-system">${i || 12}</text>`; }).join('');
      el.innerHTML = `<svg viewBox="0 0 100 100" class="wg-clock-face"><circle cx="50" cy="50" r="47" fill="var(--wg-face)"/>${ticks}${hand((hr / 12) * Math.PI * 2, 22, 3.4, 'currentColor')}${hand((m / 60) * Math.PI * 2, 32, 2.4, 'currentColor')}${hand((s / 60) * Math.PI * 2, 36, 1.1, '#ff9f0a')}<circle cx="50" cy="50" r="2.4" fill="#ff9f0a"/></svg><small>Cupertino</small>`;
    } else if (type === 'agent') {
      const r = os.ctx.robot, b = os.ctx.brain, s = os.ctx.screen;
      el.replaceChildren(
        h('div.wg-row', {}, h('span.wg-av', { html: robotAvatar() }), h('div', {}, h('small', { text: 'MR. AGENT' }), h('b', { text: b.activity }))),
        h('div.wg-stats', {}, ...[['Battery', `${Math.round(r.energy * 100)}%`], ['Lines', s.linesToday.toLocaleString()], ['Coffees', String(b.stats.coffees)], ['Steps', String(b.stats.steps)]].map(([k, v]) => h('div', {}, h('small', { text: k }), h('b', { text: v })))),
        h('div.wg-bar', {}, h('i', { style: { width: `${Math.round(r.energy * 100)}%` } })));
    } else if (type === 'calendar') {
      const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
      const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (el.dataset.day === String(d.getDate())) return;
      el.dataset.day = String(d.getDate());
      el.replaceChildren(h('b.wg-cal-m', { text: d.toLocaleDateString([], { month: 'long' }).toUpperCase() }),
        h('div.wg-cal', {}, ...'SMTWTFS'.split('').map((c) => h('i', { text: c })), ...Array.from({ length: first }, () => h('span')),
          ...Array.from({ length: days }, (_, i) => h('span', { class: i + 1 === d.getDate() ? 'today' : '', text: String(i + 1) }))));
    } else if (type === 'weather') {
      const hrs = os.ctx.world.hours ?? d.getHours();
      const night = os.ctx.world.night > 0.5;
      el.classList.toggle('night', night);
      el.replaceChildren(h('small', { text: 'Silicon Valley' }), h('div.wg-temp', { text: `${Math.round(18 + 6 * Math.sin(((hrs - 9) / 24) * Math.PI * 2))}°` }), h('span.wg-wx', { text: night ? '🌙' : '☀️' }), h('small', { text: night ? 'Clear' : 'Sunny' }), h('small', { text: 'H:24° L:13°' }));
    } else if (type === 'battery') {
      const ring = (pct, label, icon) => h('div.wg-ring', { style: { '--p': `${pct}%` } }, h('span', { text: icon }), h('small', { text: label }));
      el.replaceChildren(ring(100, '∞%', '💻'), ring(Math.round(os.ctx.robot.energy * 100), `${Math.round(os.ctx.robot.energy * 100)}%`, '🤖'), ring(82, '82%', '⌨️'), ring(64, '64%', '🖱'));
    } else if (type === 'music') {
      const m = os.music;
      const key = `${m.playing}${m.track}`;
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      el.replaceChildren(h('div.wg-art', { style: { background: `linear-gradient(135deg, hsl(${m.track * 80} 80% 60%), hsl(${m.track * 80 + 60} 80% 45%))` } }),
        h('div.wg-np', {}, h('small', { text: m.playing ? 'NOW PLAYING' : 'MUSIC' }), h('b', { text: m.info.title }), h('small', { text: m.info.artist }),
          h('button.btn', { text: m.playing ? 'Pause' : 'Play', onclick: (e) => { e.stopPropagation(); m.toggle(); delete el.dataset.key; this.update(); } })));
    }
  }

  gallery() {
    const os = this.os;
    const box = h('div.wg-gallery', {}, h('b', { text: 'Add Widgets' }), h('p', { text: 'Click a widget to put it on your desktop. Drag widgets to move them, right-click to remove.' }),
      h('div.wg-gallery-grid', {}, ...Object.entries(TYPES).map(([type, t]) => h('button.wg-gallery-item', { onclick: () => {
        const L = os.layerSize();
        this.list.push({ type, x: Math.round(L.w / 2 - t.w / 2), y: 120 });
        this.save();
        this.render();
      } }, h('span', { text: { clock: '🕘', agent: '🤖', calendar: '📅', weather: '⛅', battery: '🔋', music: '🎵' }[type] }), t.name))),
      h('button.btn.primary', { text: 'Done', onclick: () => wrap.remove() }));
    const wrap = h('div.dlg-wrap', {}, box);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    os.layer.append(wrap);
  }
}
