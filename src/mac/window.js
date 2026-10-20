import { h, drag } from './ui.js';

export const MENU_H = 25;
let winId = 0;

const TILE_ICONS = {
  left: '<svg viewBox="0 0 24 16"><rect x="1" y="1" width="22" height="14" rx="2" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="9" height="11" rx="1" fill="currentColor"/></svg>',
  right: '<svg viewBox="0 0 24 16"><rect x="1" y="1" width="22" height="14" rx="2" fill="none" stroke="currentColor"/><rect x="12.5" y="2.5" width="9" height="11" rx="1" fill="currentColor"/></svg>',
  top: '<svg viewBox="0 0 24 16"><rect x="1" y="1" width="22" height="14" rx="2" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="19" height="5" rx="1" fill="currentColor"/></svg>',
  bottom: '<svg viewBox="0 0 24 16"><rect x="1" y="1" width="22" height="14" rx="2" fill="none" stroke="currentColor"/><rect x="2.5" y="8.5" width="19" height="5" rx="1" fill="currentColor"/></svg>',
  fill: '<svg viewBox="0 0 24 16"><rect x="1" y="1" width="22" height="14" rx="2" fill="none" stroke="currentColor"/><rect x="2.5" y="2.5" width="19" height="11" rx="1" fill="currentColor"/></svg>',
  center: '<svg viewBox="0 0 24 16"><rect x="1" y="1" width="22" height="14" rx="2" fill="none" stroke="currentColor"/><rect x="6.5" y="4" width="11" height="8" rx="1" fill="currentColor"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 16"><path d="M3 6V3h4M21 6V3h-4M3 10v3h4M21 10v3h-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

/** A window: title bar with traffic lights, drag/resize, tiling, full screen and Spaces. */
export class Win {
  constructor(os, o) {
    this.os = os;
    this.id = ++winId;
    this.app = o.app;
    this.title = o.title || o.app.name;
    this.space = os.spaceId;
    this.opts = o;
    const L = os.layerSize();
    this.w = Math.min(o.width || 720, L.w - 40);
    this.h = Math.min(o.height || 480, L.h - 90);
    const n = os.windows.length;
    this.x = o.x ?? Math.max(10, (L.w - this.w) / 2 + ((n % 6) - 2) * 26);
    this.y = o.y ?? Math.max(6, (L.h - this.h) / 2.6 + ((n % 6) - 2) * 22);
    this.minW = o.minWidth || 260;
    this.minH = o.minHeight || 160;
    this.resizable = o.resizable !== false;
    this.minimized = false;
    this.tiled = null; // 'left' | 'right' | 'fill' | ... while snapped
    this.fs = false;
    this.onClose = o.onClose;
    this.onKey = o.onKey;
    this.onArgs = o.onArgs;
    this.onResize = o.onResize;
    this.getState = o.state;

    this.maxBtn = h('button.tl.max', { 'aria-label': 'Full Screen', disabled: !this.resizable, onclick: (e) => { e.stopPropagation(); if (e.altKey) this.tile(this.tiled === 'fill' ? null : 'fill'); else this.toggleFullscreen(); } });
    const tl = h('div.traffic', {},
      h('button.tl.close', { 'aria-label': 'Close', onclick: (e) => { e.stopPropagation(); this.close(); } }),
      h('button.tl.min', { 'aria-label': 'Minimize', onclick: (e) => { e.stopPropagation(); this.minimize(); } }),
      this.maxBtn);
    this.maxBtn.addEventListener('mouseenter', () => { this.hoverT = setTimeout(() => this.tileMenu(), 550); });
    this.maxBtn.addEventListener('mouseleave', () => clearTimeout(this.hoverT));
    this.titleEl = h('div.win-title', { text: this.title });
    this.toolbar = h('div.win-tools');
    this.bar = h('div.win-bar', { class: o.unified ? 'unified' : '' }, tl, this.titleEl, this.toolbar);
    if (o.sidebarWidth) this.bar.style.setProperty('--sbw', `${o.sidebarWidth}px`);
    this.body = h('div.win-body');
    this.el = h('div.win', { class: [o.className, o.sidebarWidth ? 'has-sb' : '', o.dark ? 'win-dark' : ''].filter(Boolean).join(' '), role: 'dialog', 'aria-label': this.title }, this.bar, this.body);
    if (this.resizable) for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) this.el.append(h(`div.rz.rz-${d}`, { onpointerdown: (e) => this.resizeStart(e, d) }));
    this.place();
    this.bar.addEventListener('pointerdown', (e) => this.dragStart(e));
    this.bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button, input, select')) this.tile(this.tiled === 'fill' ? null : 'fill'); });
    this.el.addEventListener('pointerdown', () => this.focus(), true);
    os.winLayer.append(this.el);
    this.el.classList.add('opening');
    setTimeout(() => this.el.classList.remove('opening'), 260);
    o.body?.(this.body, this);
  }

  place() {
    Object.assign(this.el.style, { left: `${this.x}px`, top: `${this.y}px`, width: `${this.w}px`, height: `${this.h}px` });
    this.onResize?.(this.w, this.h);
    this.os.saveSessionSoon();
  }

  setTitle(t) { if (t === this.title) return; this.title = t; this.titleEl.textContent = t; this.el.setAttribute('aria-label', t); this.os.renderAppMenus(); }
  focus() {
    if (this.os.overlay?.kind === 'mc') return;
    if (this.space !== this.os.spaceId && !this.fs) this.os.switchSpace(this.os.spaces.indexOf(this.space));
    this.os.focusWin(this);
  }

  animate(ms = 280) {
    this.el.classList.add('animating');
    clearTimeout(this.animT);
    this.animT = setTimeout(() => this.el.classList.remove('animating'), ms);
  }

  // ------------------------------------------------------------ dragging & snapping
  dragStart(e) {
    if (e.button !== 0 || e.target.closest('button, input, select, a, textarea, .no-drag')) return;
    if (this.fs) return;
    const sr = this.os.screen.getBoundingClientRect();
    let x0 = this.x, y0 = this.y, started = false, snap = null;
    const preview = this.os.snapPreview;
    drag(e, (dx, dy, m) => {
      if (!started) {
        if (Math.hypot(dx, dy) < 4) return;
        started = true;
        if (this.tiled) { // un-snap: restore size, keep the grab point under the cursor
          const rel = (m.clientX - sr.left - this.x) / this.w;
          const prev = this.prev || { w: this.w, h: this.h };
          this.w = prev.w; this.h = prev.h;
          x0 = m.clientX - sr.left - rel * this.w - dx;
          y0 = Math.max(0, this.y);
          this.tiled = null;
          this.el.classList.remove('tiled');
        }
      }
      this.x = x0 + dx;
      this.y = Math.max(0, y0 + dy);
      this.place();
      if (!this.resizable) return;
      const px = m.clientX - sr.left, py = m.clientY - sr.top;
      snap = px <= 4 ? 'left' : px >= sr.width - 5 ? 'right' : py <= MENU_H + 2 ? 'fill' : null;
      if (snap) {
        const r = this.os.tileRect(snap);
        Object.assign(preview.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        preview.classList.add('on');
      } else preview.classList.remove('on');
    }, () => {
      preview.classList.remove('on');
      if (snap) this.tile(snap);
    });
  }

  resizeStart(e, d) {
    e.stopPropagation();
    if (this.fs) return;
    const { x, y, w, h: hh } = this;
    this.tiled = null;
    this.el.classList.remove('tiled');
    drag(e, (dx, dy) => {
      if (d.includes('e')) this.w = Math.max(this.minW, w + dx);
      if (d.includes('s')) this.h = Math.max(this.minH, hh + dy);
      if (d.includes('w')) { const nw = Math.max(this.minW, w - dx); this.x = x + (w - nw); this.w = nw; }
      if (d.includes('n')) { const nh = Math.max(this.minH, hh - dy); this.y = Math.max(0, y + (hh - nh)); this.h = nh; }
      this.place();
    });
  }

  /** Snap to part of the screen; null restores the size it had before. */
  tile(kind) {
    if (!this.resizable || this.fs) return;
    if (!kind || kind === this.tiled) {
      if (this.prev) Object.assign(this, this.prev);
      this.tiled = null;
    } else if (kind === 'center') {
      const L = this.os.layerSize();
      if (this.tiled && this.prev) Object.assign(this, { w: this.prev.w, h: this.prev.h });
      this.tiled = null;
      this.x = (L.w - this.w) / 2;
      this.y = Math.max(0, (L.h - this.h) / 2.4);
    } else {
      if (!this.tiled) this.prev = { x: this.x, y: this.y, w: this.w, h: this.h };
      Object.assign(this, this.os.tileRect(kind));
      this.tiled = kind;
    }
    this.el.classList.toggle('tiled', !!this.tiled);
    this.animate();
    this.place();
  }
  zoom() { this.tile(this.tiled === 'fill' ? null : 'fill'); }
  center() { this.tile('center'); }

  toggleFullscreen() {
    if (!this.resizable) return;
    const os = this.os;
    if (!this.fs) {
      this.fsPrev = { x: this.x, y: this.y, w: this.w, h: this.h, tiled: this.tiled };
      const sr = os.screen.getBoundingClientRect();
      Object.assign(this, { x: 0, y: -MENU_H, w: sr.width, h: sr.height, fs: true });
      this.el.classList.add('fs');
      os.screen.classList.add('has-fs');
    } else {
      Object.assign(this, this.fsPrev, { fs: false });
      this.el.classList.remove('fs');
      if (!os.windows.some((w) => w.fs && w !== this && !w.minimized)) os.screen.classList.remove('has-fs');
    }
    this.animate(420);
    this.place();
    this.focus();
  }

  tileMenu() {
    if (!this.resizable || this.os.menuOpen) return;
    const r = this.maxBtn.getBoundingClientRect();
    const pick = (k) => { this.os.closeMenus(); if (k === 'fullscreen') this.toggleFullscreen(); else this.tile(k); };
    const btn = (k, label) => h('button.tile-btn', { title: label, 'aria-label': label, html: TILE_ICONS[k], onclick: () => pick(k) });
    const menu = h('div.mac-menu.tile-menu', {},
      h('div.mac-menu-header', { text: 'Move & Resize' }),
      h('div.tile-row', {}, btn('left', 'Left'), btn('right', 'Right'), btn('top', 'Top'), btn('bottom', 'Bottom')),
      h('div.mac-menu-header', { text: 'Fill & Arrange' }),
      h('div.tile-row', {}, btn('fill', 'Fill'), btn('center', 'Center'), btn('fullscreen', this.fs ? 'Exit Full Screen' : 'Full Screen')),
      this.tiled ? h('div.mac-menu-item', { onclick: () => pick(null) }, h('span.check'), h('span.label', { text: 'Return to Previous Size' })) : null);
    const sr = this.os.screen.getBoundingClientRect();
    menu.style.left = `${r.left - sr.left - 8}px`;
    menu.style.top = `${r.bottom - sr.top + 6}px`;
    this.os.screen.append(menu);
    this.os.menuOpen = { btn: null, menu };
    menu.addEventListener('mouseleave', () => setTimeout(() => { if (this.os.menuOpen?.menu === menu && !menu.matches(':hover')) this.os.closeMenus(); }, 400));
  }

  // ------------------------------------------------------------ minimise / restore / close
  minimize() {
    if (this.minimized) return;
    if (this.fs) this.toggleFullscreen();
    this.minimized = true;
    this.os.renderDock();
    const target = this.os.dock.querySelector(`[data-key="min-${this.id}"]`) || this.os.dock;
    const tr = target.getBoundingClientRect(), wr = this.el.getBoundingClientRect();
    const s = Math.max(0.05, tr.width / wr.width);
    this.el.classList.add('animating', 'genie');
    this.el.style.transformOrigin = '0 0';
    this.el.style.transform = `translate(${tr.left - wr.left}px, ${tr.top - wr.top}px) scale(${s}, ${s * 0.6})`;
    this.el.style.opacity = '0';
    setTimeout(() => { if (this.minimized) this.el.hidden = true; this.el.classList.remove('animating', 'genie'); }, 380);
    if (this.os.active === this) {
      this.os.active = null;
      this.el.classList.remove('active');
      const next = this.os.topWindow(this);
      if (next) next.focus(); else this.os.renderAppMenus();
    }
    this.os.saveSessionSoon();
  }

  restore() {
    if (!this.minimized) { this.focus(); return; }
    this.minimized = false;
    this.el.hidden = false;
    this.el.classList.add('animating');
    requestAnimationFrame(() => { this.el.style.transform = ''; this.el.style.opacity = '1'; });
    setTimeout(() => this.el.classList.remove('animating'), 380);
    this.focus();
    this.os.renderDock();
  }

  close(force = false) {
    if (this.closed) return;
    if (!force && this.beforeClose && this.beforeClose() === false) return;
    this.closed = true;
    this.onClose?.();
    if (this.fs) { this.fs = false; if (!this.os.windows.some((w) => w.fs && w !== this)) this.os.screen.classList.remove('has-fs'); }
    this.el.classList.add('closing');
    setTimeout(() => this.el.remove(), 180);
    this.os.removeWin(this);
  }
}
