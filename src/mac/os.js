import './mac.css';
import { h, buildMenu, drag, imageURL, isImage } from './ui.js';
import { VFS, HOME, kindOf } from './vfs.js';
import { appIcon, trashIcon, glyph, folderIcon, fileIcon, diskIcon } from './icons.js';
import { WALLPAPERS, ACCENTS } from './wallpapers.js';
import { APPS, DOCK, isInstalled } from './apps/index.js';
import { Win, MENU_H } from './window.js';
import { loadImages } from './imagestore.js';
import { Widgets } from './widgets.js';
import { Shots } from './shots.js';
import { Assistant } from './assistant.js';
import { unreadTotal, sendMessage } from './agentchat.js';

const PREFS_KEY = 'mragent.mac.prefs.v1';
const DEFAULTS = {
  dark: false, accent: 'blue', wallpaper: 'dunes', dockSize: 50, magnify: true, brightness: 1, nightShift: false,
  wifi: true, network: 'BotNet 6G', bluetooth: true, airdrop: true, focus: false, iconPos: {}, volume: 0.7, hotCorners: true,
  dock: null, dockAutohide: false, installed: [], reopen: true, session: [], spaces: 1,
  widgets: [{ type: 'agent', x: 22, y: 40 }, { type: 'clock', x: 22, y: 214 }, { type: 'calendar', x: 194, y: 214 }],
};

/** Mr. Agent's Mac: a macOS-style desktop that runs inside the browser. */
export class MacOS {
  constructor(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    this.audio = ctx.audio;
    this.music = ctx.music;
    this.vfs = new VFS();
    this.vfs.liveFiles = () => {
      const s = ctx.screen;
      return s.history.map((f, i) => ({ path: f.path, content: i === s.index ? s.typed : f.code, live: i === s.index }));
    };
    this.prefs = { ...DEFAULTS };
    try { Object.assign(this.prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch { /* storage blocked */ }
    this.state = 'off';
    this.windows = [];
    this.z = 10;
    this.active = null;
    this.notifs = [];
    this.badges = {};
    this.clipboard = null; // Finder copy/paste: { paths, cut }
    this.timeHook = null;
    this.apps = APPS;
    this.listeners = {};
    this.spaces = Array.from({ length: Math.max(1, this.prefs.spaces || 1) }, (_, i) => i + 1);
    this.spaceId = 1;
    this.build();
    this.widgets = new Widgets(this);
    this.shots = new Shots(this);
    this.assistant = new Assistant(this);
    this.applyPrefs();
    this.vfs.onChange(() => { this.renderDesktop(); this.renderDock(); this.emit('fs'); });
    this.music.onChange(() => { this.renderDock(); this.emit('music'); });
    loadImages().then(() => { this.renderDesktop(); this.emit('fs'); });
    this.badges.messages = unreadTotal();
    setInterval(() => this.tickClock(), 1000);
  }

  on(evt, fn) { (this.listeners[evt] ||= new Set()).add(fn); return () => this.listeners[evt].delete(fn); }
  emit(evt, ...a) { this.listeners[evt]?.forEach((f) => f(...a)); }
  setTimeHook(fn) { this.timeHook = fn; }
  savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* storage blocked */ } }
  setPref(k, v) {
    const old = this.prefs[k];
    this.prefs[k] = v;
    this.savePrefs();
    this.applyPrefs();
    this.emit('prefs', k, v);
    if (k === 'volume' && old !== v) this.hud('volume', v);
    if (k === 'brightness' && old !== v) this.hud('brightness', (v - 0.35) / 0.65);
  }
  setBadge(id, n) { this.badges[id] = n; this.renderDock(); }
  dockIds() { return (this.prefs.dock || DOCK).filter((id) => APPS[id] && isInstalled(this, id)); }

  // ================================================================== DOM
  build() {
    this.el.innerHTML = '';
    this.device = h('div.mac-device');
    this.screen = h('div.mac-screen');
    this.wall = h('div.mac-wall');
    this.desktop = h('div.mac-desktop');
    this.winLayer = h('div.mac-windows');
    this.snapPreview = h('div.snap-preview');
    this.winLayer.append(this.snapPreview);
    this.menubar = h('div.mac-menubar');
    this.dockWrap = h('div.mac-dock-wrap');
    this.dock = h('div.mac-dock');
    this.dockWrap.append(this.dock);
    this.layer = h('div.mac-layer');
    this.toasts = h('div.mac-toasts');
    this.hudEl = h('div.mac-hud');
    this.dim = h('div.mac-dim');
    this.shift = h('div.mac-nightshift');
    this.screen.append(this.wall, this.desktop, this.winLayer, this.dockWrap, this.menubar, this.toasts, this.hudEl, this.layer, this.shift, this.dim);
    this.device.append(this.screen, h('div.mac-notch', {}, h('i')));
    this.leaveBtn = h('button.mac-leave', { title: 'Go back to the room', onclick: () => this.close() }, '↩ Leave Mr. Agent’s Mac');
    this.el.append(this.device, this.leaveBtn);

    this.buildMenubar();
    this.renderDock();
    this.renderDesktop();
    this.setupDesktopEvents();
    this.dock.addEventListener('mousemove', (e) => this.magnify(e.clientX));
    this.dock.addEventListener('mouseleave', () => this.magnify(null));
    this.screen.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.mac-menu, .mac-menubar, .mac-panel, .dock-stack')) this.closeMenus();
    }, true);
    this.screen.addEventListener('mousemove', (e) => this.edges(e));
    this.screen.addEventListener('contextmenu', (e) => this.textMenu(e), true);
    this.keyHandler = (e) => this.onKey(e);
  }

  applyPrefs() {
    const p = this.prefs;
    this.screen.classList.toggle('dark', !!p.dark);
    this.screen.style.setProperty('--accent', ACCENTS[p.accent] || ACCENTS.blue);
    const wp = WALLPAPERS.find((w) => w.id === p.wallpaper) || WALLPAPERS[0];
    this.wall.style.background = wp.css;
    this.screen.style.setProperty('--dock-size', `${p.dockSize}px`);
    this.screen.classList.toggle('dock-autohide', !!p.dockAutohide);
    this.dim.style.opacity = String(1 - p.brightness);
    this.shift.style.opacity = p.nightShift ? '1' : '0';
    this.audio.setVolume(p.volume);
    this.widgets?.render();
  }

  layerSize() {
    const r = this.winLayer.getBoundingClientRect();
    return { w: r.width || innerWidth, h: r.height || innerHeight - MENU_H };
  }

  /** Rectangles for window tiling, in window-layer coordinates. */
  tileRect(kind) {
    const L = this.layerSize();
    const g = 6;
    const bottom = this.prefs.dockAutohide ? 0 : this.prefs.dockSize + 18;
    const H = L.h - bottom;
    const half = (L.w - g * 3) / 2;
    return {
      left: { x: g, y: g, w: half, h: H - g * 2 },
      right: { x: g * 2 + half, y: g, w: half, h: H - g * 2 },
      top: { x: g, y: g, w: L.w - g * 2, h: (H - g * 3) / 2 },
      bottom: { x: g, y: g * 2 + (H - g * 3) / 2, w: L.w - g * 2, h: (H - g * 3) / 2 },
      fill: { x: g, y: g, w: L.w - g * 2, h: H - g * 2 },
    }[kind];
  }

  // ================================================================== open / close / power
  open(rect) {
    this.el.hidden = false;
    this.openRect = rect;
    this.applyFrom(rect);
    this.device.getBoundingClientRect();
    requestAnimationFrame(() => {
      this.device.classList.add('anim');
      this.device.style.transform = '';
      this.device.style.opacity = '1';
    });
    window.addEventListener('keydown', this.keyHandler, true);
    this.unloadGuard = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', this.unloadGuard);
    setTimeout(() => {
      this.device.classList.remove('anim');
      if (this.state === 'off') this.boot();
      else if (this.state === 'sleep') this.lock();
      else if (this.state === 'desktop') this.notify({ app: 'finder', title: 'Welcome back', body: 'Mr. Agent kept your windows right where you left them.' });
    }, 650);
  }

  applyFrom(rect) {
    if (!rect) { this.device.style.opacity = '0'; return; }
    const sx = rect.width / innerWidth, sy = rect.height / innerHeight;
    this.device.style.transformOrigin = '0 0';
    this.device.style.transform = `translate(${rect.left}px, ${rect.top}px) scale(${sx}, ${sy})`;
    this.device.style.opacity = '0.2';
  }

  close() {
    this.closeMenus();
    this.closeOverlay();
    this.assistant.toggle(false);
    window.removeEventListener('keydown', this.keyHandler, true);
    window.removeEventListener('beforeunload', this.unloadGuard);
    this.device.classList.add('anim');
    this.applyFrom(this.openRect);
    setTimeout(() => {
      this.device.classList.remove('anim');
      this.el.hidden = true;
      this.ctx.onExit();
    }, 520);
  }

  get isOpen() { return !this.el.hidden; }

  boot() {
    this.state = 'boot';
    const scr = h('div.mac-boot', {}, h('div.boot-logo', { html: glyph.apple }), h('div.boot-bar', {}, h('i')));
    this.layer.append(scr);
    this.audio.unlock();
    setTimeout(() => this.audio.chime(), 250);
    const bar = scr.querySelector('i');
    let p = 0;
    const step = () => {
      p += 4 + Math.random() * 14;
      bar.style.width = `${Math.min(100, p)}%`;
      if (p < 100) setTimeout(step, 90 + Math.random() * 180);
      else setTimeout(() => { scr.classList.add('fade'); setTimeout(() => scr.remove(), 500); this.lock(true); }, 350);
    };
    setTimeout(step, 600);
  }

  lock(fromBoot = false) {
    this.state = 'login';
    this.closeOverlay();
    this.closeMenus();
    const time = h('div.login-time');
    const date = h('div.login-date');
    const upd = () => {
      const d = new Date();
      time.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
      date.textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    };
    upd();
    const iv = setInterval(upd, 1000);
    const input = h('input.login-pass', { type: 'password', placeholder: 'Enter Password', 'aria-label': 'Password' });
    const hint = h('div.login-hint', { text: 'Any password works. Hint: what do robots say?' });
    const scr = h('div.mac-login', {},
      h('div.login-wall', { style: { background: this.wall.style.background } }),
      h('div.login-top', {}, date, time),
      h('div.login-user', {},
        h('div.login-avatar', { html: robotAvatar() }),
        h('div.login-name', { text: 'Mr. Agent' }),
        h('form.login-form', { onsubmit: (e) => { e.preventDefault(); unlock(); } }, input, h('button', { type: 'submit', 'aria-label': 'Log in', text: '→' })),
        hint,
        h('div.login-touchid', { text: 'Touch ID or Enter Password' })),
      h('div.login-bottom', {}, h('button', { onclick: () => this.shutdown(), html: '⏻<span>Shut Down</span>' }), h('button', { onclick: () => this.restart(), html: '↻<span>Restart</span>' })));
    const unlock = () => {
      if (input.value.trim().toLowerCase().includes('beep')) this.audio.happy();
      clearInterval(iv);
      scr.classList.add('fade');
      this.audio.pop();
      setTimeout(() => scr.remove(), 500);
      const wasEmpty = !this.windows.length;
      this.state = 'desktop';
      if (wasEmpty && this.prefs.reopen) this.restoreSession();
      if (fromBoot) {
        setTimeout(() => this.notify({ app: 'messages', title: 'Mr. Agent', body: 'Welcome to my Mac! My files are in ~/Projects. Don’t touch the coffee settings.', reply: (t) => sendMessage(this, 'agent', t), open: { to: 'agent' } }), 900);
        setTimeout(() => this.notify({ app: 'about', title: 'About this Mac', body: '1,024-core M7 Ultra Max · 8 TB memory · 1 PB SSD. Have fun.' }), 4200);
      }
    };
    this.layer.append(scr);
    setTimeout(() => input.focus(), 600);
  }

  sleep() {
    this.state = 'sleep';
    this.closeOverlay();
    const s = h('div.mac-sleep', { onclick: () => { s.remove(); this.lock(); } });
    this.layer.append(s);
  }

  async shutdown(then = 'exit') {
    const dirty = this.windows.length;
    this.closeOverlay();
    this.saveSession();
    this.quitting = true;
    for (const w of [...this.windows]) w.close(true);
    this.quitting = false;
    const s = h('div.mac-sleep.shutting');
    this.layer.innerHTML = '';
    this.layer.append(s);
    this.state = 'off';
    await new Promise((r) => setTimeout(r, dirty ? 1400 : 900));
    s.remove();
    if (then === 'restart') this.boot();
    else this.close();
  }
  restart() { this.shutdown('restart'); }

  logOut() {
    this.saveSession();
    this.quitting = true;
    for (const w of [...this.windows]) w.close(true);
    this.quitting = false;
    this.lock();
  }

  // ================================================================== session (reopen windows after login)
  saveSessionSoon() {
    if (this.quitting || this.restoring) return;
    clearTimeout(this.sessionT);
    this.sessionT = setTimeout(() => this.saveSession(), 500);
  }

  saveSession() {
    if (this.quitting || this.restoring) return;
    this.prefs.session = this.windows.filter((w) => w.opts.restorable !== false && !w.app.hidden).map((w) => ({
      app: w.app.id, args: w.getState?.() || {}, x: w.x, y: w.y, w: w.w, h: w.h, min: w.minimized, space: w.space,
    }));
    this.prefs.spaces = this.spaces.length;
    this.savePrefs();
  }

  restoreSession() {
    const list = this.prefs.session || [];
    if (!list.length) return;
    this.restoring = true;
    for (const s of list) {
      if (!APPS[s.app] || !isInstalled(this, s.app)) continue;
      try {
        this.spaceId = this.spaces.includes(s.space) ? s.space : 1;
        const w = this.launch(s.app, { ...s.args, newWindow: true, silent: true });
        if (w && w.place) { Object.assign(w, { x: s.x, y: s.y, w: s.w, h: s.h }); w.place(); if (s.min) w.minimize(); }
      } catch (err) { console.warn('restore failed', s.app, err); }
    }
    this.spaceId = 1;
    this.applySpaces();
    this.restoring = false;
  }

  // ================================================================== menubar
  buildMenubar() {
    const mb = this.menubar;
    mb.innerHTML = '';
    this.mbLeft = h('div.mb-left');
    this.mbRight = h('div.mb-right');
    mb.append(this.mbLeft, this.mbRight);
    this.clockEl = h('button.mb-item.mb-clock', { onclick: (e) => this.togglePanel('nc', e.currentTarget) });
    const item = (html, title, fn) => h('button.mb-item', { html, title, 'aria-label': title, onclick: (e) => fn(e.currentTarget) });
    this.nowPlayingEl = h('button.mb-item.mb-np', { title: 'Now Playing', onclick: (e) => this.togglePanel('cc', e.currentTarget) });
    this.mbRight.append(
      this.nowPlayingEl,
      item(glyph.robot, 'Mr. Agent', (b) => this.openMenu(b, this.robotMenu())),
      item(`<span class="mb-batt">${glyph.battery}<em>∞%</em></span>`, 'Battery', (b) => this.openMenu(b, [
        { header: 'Battery' }, { label: 'Power Source: Coffee ☕', disabled: true }, { label: 'Charge: ∞% · Condition: Immortal', disabled: true }, { sep: true },
        { label: 'Battery Settings…', action: () => this.launch('settings', { pane: 'battery' }) }])),
      item(glyph.wifi, 'Wi-Fi', (b) => this.openMenu(b, this.wifiMenu())),
      item(glyph.search, 'Spotlight', () => this.spotlight()),
      item(glyph.control, 'Control Center', (b) => this.togglePanel('cc', b)),
      item('<span class="mb-orb"></span>', 'Ask Mr. Agent', () => this.assistant.toggle()),
      this.clockEl,
    );
    this.tickClock();
    this.renderAppMenus();
  }

  tickClock() {
    if (!this.clockEl) return;
    const d = new Date();
    this.clockEl.textContent = `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}  ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    const np = this.music.playing ? `♫ ${this.music.info.title}` : '';
    if (this.nowPlayingEl.textContent !== np) { this.nowPlayingEl.textContent = np; this.nowPlayingEl.hidden = !np; }
  }

  currentApp() { return this.active ? this.active.app : APPS.finder; }

  renderAppMenus() {
    const app = this.currentApp();
    const win = this.active;
    this.mbLeft.innerHTML = '';
    const appleBtn = h('button.mb-item.mb-apple', { html: glyph.apple, 'aria-label': 'Apple menu' });
    const entries = [[appleBtn, () => this.appleMenu()]];
    this.menusFor(app, win).forEach((m, i) => entries.push([h(`button.mb-item${i === 0 ? '.mb-app' : ''}`, { text: m.title }), () => m.items]));
    this.menuEntries = entries;
    for (const [b, items] of entries) {
      b.addEventListener('click', () => this.openMenu(b, items()));
      b.addEventListener('mouseenter', () => { if (this.menuOpen?.btn && this.menuOpen.btn !== b) this.openMenu(b, items()); });
      this.mbLeft.append(b);
    }
  }

  menusFor(app, win) {
    const base = [
      { title: app.name, items: [
        { label: `About ${app.name}`, action: () => this.alert({ title: app.name, message: app.about || `${app.name} for Mr. Agent’s Mac.\nVersion 31.0 (build 1024)`, icon: appIcon(app.icon || app.id) }) },
        { sep: true },
        { label: 'Settings…', shortcut: '⌃,', action: () => this.launch('settings') },
        { sep: true },
        { label: `Hide ${app.name}`, action: () => this.windows.filter((w) => w.app === app).forEach((w) => w.minimize()) },
        { label: 'Hide Others', action: () => this.windows.filter((w) => w.app !== app).forEach((w) => w.minimize()) },
        { sep: true },
        { label: `Quit ${app.name}`, shortcut: '⌃Q', disabled: app.id === 'finder', action: () => this.quit(app.id) },
      ] },
      { title: 'File', items: [
        { label: 'New Window', shortcut: '⌃N', action: () => this.launch(app.id, { newWindow: true }) },
        { label: 'Open…', action: () => this.launch('finder') },
        { sep: true },
        { label: 'Close Window', shortcut: '⌃W', disabled: !win, action: () => win?.close() },
      ] },
      { title: 'Edit', items: [
        { label: 'Undo', shortcut: '⌘Z', action: () => document.execCommand('undo') },
        { label: 'Redo', shortcut: '⇧⌘Z', action: () => document.execCommand('redo') },
        { sep: true },
        { label: 'Cut', shortcut: '⌘X', action: () => document.execCommand('cut') },
        { label: 'Copy', shortcut: '⌘C', action: () => document.execCommand('copy') },
        { label: 'Paste', shortcut: '⌘V', action: () => this.pasteText() },
        { label: 'Select All', shortcut: '⌘A', action: () => document.execCommand('selectAll') },
        { sep: true },
        { label: 'Emoji & Symbols', action: () => this.emojiPicker() },
      ] },
      { title: 'View', items: [
        { label: win?.fs ? 'Exit Full Screen' : 'Enter Full Screen', shortcut: '⌃⌘F', disabled: !win, action: () => win?.toggleFullscreen() },
        { sep: true },
        { label: 'Mission Control', shortcut: '⌃↑', action: () => this.missionControl() },
        { label: 'Launchpad', shortcut: 'F4', action: () => this.launchpad() },
      ] },
      { title: 'Window', items: [
        { label: 'Minimize', shortcut: '⌃M', disabled: !win, action: () => win?.minimize() },
        { label: 'Zoom', disabled: !win, action: () => win?.zoom() },
        { label: 'Fill', disabled: !win, action: () => win?.tile('fill') },
        { label: 'Center', disabled: !win, action: () => win?.tile('center') },
        { label: 'Move & Resize', disabled: !win, submenu: [['Left', 'left'], ['Right', 'right'], ['Top', 'top'], ['Bottom', 'bottom'], ['Return to Previous Size', null]].map(([l, k]) => ({ label: l, action: () => win?.tile(k) })) },
        { sep: true },
        { label: 'Move to Desktop', disabled: !win || this.spaces.length < 2, submenu: this.spaces.map((s, i) => ({ label: `Desktop ${i + 1}`, checked: win?.space === s, action: () => { if (win) { win.space = s; this.applySpaces(); this.saveSessionSoon(); } } })) },
        { label: 'Bring All to Front', action: () => this.windows.filter((w) => w.app === app).forEach((w) => w.restore()) },
        { sep: true },
        ...this.windows.filter((w) => !w.minimized).map((w) => ({ label: w.title, checked: w === win, action: () => w.focus() })),
      ] },
      { title: 'Help', items: [
        { label: `${app.name} Help`, action: () => this.help() },
        { label: 'Keyboard Shortcuts', action: () => this.help() },
        { sep: true },
        { label: 'Ask Mr. Agent…', action: () => this.assistant.toggle(true) },
      ] },
    ];
    const extra = app.menus ? app.menus(this, win) : [];
    for (const m of extra) {
      const i = base.findIndex((b) => b.title === m.title);
      if (i >= 0) base[i] = { title: m.title, items: m.replace ? m.items : [...m.items, { sep: true }, ...base[i].items] };
      else base.splice(base.length - 2, 0, m);
    }
    return base;
  }

  appleMenu() {
    return [
      { label: 'About This Mac', action: () => this.launch('about') },
      { sep: true },
      { label: 'System Settings…', action: () => this.launch('settings') },
      { label: `App Store…${this.badges.appstore ? `  (${this.badges.appstore} update${this.badges.appstore > 1 ? 's' : ''})` : ''}`, action: () => this.launch('appstore') },
      { sep: true },
      { label: 'Recent Items', submenu: this.windows.length ? this.windows.map((w) => ({ label: w.title, action: () => w.focus() })) : [{ label: 'No recent items', disabled: true }] },
      { sep: true },
      { label: 'Force Quit…', shortcut: '⌥⌃⎋', action: () => this.forceQuit() },
      { sep: true },
      { label: 'Sleep', action: () => this.sleep() },
      { label: 'Restart…', action: () => this.confirm('Are you sure you want to restart your computer now?', 'Restart').then((ok) => ok && this.restart()) },
      { label: 'Shut Down…', action: () => this.confirm('Are you sure you want to shut down your computer now?', 'Shut Down').then((ok) => ok && this.shutdown()) },
      { sep: true },
      { label: 'Lock Screen', shortcut: '⌃⌘Q', action: () => this.lock() },
      { label: 'Log Out Mr. Agent…', action: () => this.logOut() },
      { sep: true },
      { label: 'Leave Mr. Agent’s Mac', action: () => this.close() },
    ];
  }

  wifiMenu() {
    const nets = ['BotNet 6G', 'Pretty Fly for a Wi-Fi', 'FBI Surveillance Van', 'Bill Wi the Science Fi', 'Coffee Machine (IoT)', 'Loading…'];
    return [
      { header: 'Wi-Fi' },
      { label: this.prefs.wifi ? 'Turn Wi-Fi Off' : 'Turn Wi-Fi On', action: () => this.setPref('wifi', !this.prefs.wifi) },
      { sep: true },
      { header: 'Known Network' },
      ...(this.prefs.wifi ? nets.map((n) => ({ label: n, checked: n === this.prefs.network, action: () => { this.setPref('network', n); this.notify({ app: 'settings', title: 'Wi-Fi', body: `Connected to “${n}”. 10 Gbps, 0.2 ms ping.` }); } })) : [{ label: 'Wi-Fi is off', disabled: true }]),
      { sep: true },
      { label: 'Wi-Fi Settings…', action: () => this.launch('settings', { pane: 'wifi' }) },
    ];
  }

  robotMenu() {
    const r = this.ctx.robot, b = this.ctx.brain;
    return [
      { header: 'Mr. Agent' },
      { label: `Status: ${b.activity}`, disabled: true },
      { label: `Battery: ${Math.round(r.energy * 100)}% · Coffees today: ${b.stats.coffees}`, disabled: true },
      { label: `Steps walked: ${b.stats.steps}`, disabled: true },
      { sep: true },
      { label: 'Ask Mr. Agent…', action: () => this.assistant.toggle(true) },
      { label: 'Message Mr. Agent…', action: () => this.launch('messages', { to: 'agent' }) },
      { label: 'Find Mr. Agent', action: () => this.launch('findmy') },
      { label: 'Watch him code (live)', action: () => this.launch('code', { live: true }) },
      { label: 'Make him dance (play music)', action: () => { this.music.play(); this.notify({ app: 'music', title: 'Now Playing', body: `${this.music.info.title}. Mr. Agent is dancing.` }); } },
      { sep: true },
      { label: 'Robot Settings…', action: () => this.launch('settings', { pane: 'robot' }) },
    ];
  }

  // ------------------------------------------------------------------ menus
  openMenu(btn, items) {
    if (this.menuOpen?.btn === btn) { this.closeMenus(); return; }
    this.closeMenus();
    const close = () => this.closeMenus();
    const menu = buildMenu(items, close);
    const r = btn.getBoundingClientRect(), sr = this.screen.getBoundingClientRect();
    menu.style.left = `${r.left - sr.left}px`;
    menu.style.top = `${MENU_H}px`;
    menu.classList.add('from-bar');
    this.screen.append(menu);
    if (r.left - sr.left + menu.offsetWidth > sr.width) menu.style.left = `${sr.width - menu.offsetWidth - 6}px`;
    btn.classList.add('open');
    this.menuOpen = { btn, menu, hl: -1 };
    this.audio.click();
  }

  contextMenu(e, items) {
    e.preventDefault();
    e.stopPropagation();
    this.closeMenus();
    const menu = buildMenu(items, () => this.closeMenus());
    const sr = this.screen.getBoundingClientRect();
    this.screen.append(menu);
    let x = e.clientX - sr.left, y = e.clientY - sr.top;
    if (x + menu.offsetWidth > sr.width) x -= menu.offsetWidth;
    if (y + menu.offsetHeight > sr.height) y = Math.max(MENU_H, y - menu.offsetHeight);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    this.menuOpen = { btn: null, menu, hl: -1 };
  }

  closeMenus() {
    if (!this.menuOpen) return;
    this.menuOpen.menu.remove();
    this.menuOpen.btn?.classList.remove('open');
    this.menuOpen = null;
  }

  /** Arrow keys, Enter and Escape inside an open menu; ←/→ move along the menu bar. */
  menuKey(e) {
    const m = this.menuOpen;
    const rows = [...m.menu.querySelectorAll(':scope > .mac-menu-item:not(.disabled)')];
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows.length) {
      e.preventDefault();
      m.hl = (m.hl + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('hl', i === m.hl));
    } else if (e.key === 'Enter' && rows[m.hl]) {
      e.preventDefault();
      rows[m.hl].click();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && m.btn && this.menuEntries) {
      e.preventDefault();
      const i = this.menuEntries.findIndex(([b]) => b === m.btn);
      const [b, items] = this.menuEntries[(i + (e.key === 'ArrowRight' ? 1 : -1) + this.menuEntries.length) % this.menuEntries.length];
      this.openMenu(b, items());
    } else if (e.key === 'Escape') { e.preventDefault(); this.closeMenus(); }
  }

  /** Right-click inside text fields: the usual editing menu. */
  textMenu(e) {
    const field = e.target.closest?.('input:not([type=range]):not([type=radio]):not([type=checkbox]), textarea, [contenteditable="true"]');
    if (!field || this.state !== 'desktop') return;
    const sel = (field.value !== undefined ? field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0) : getSelection().toString()).trim();
    this.contextMenu(e, [
      sel ? { label: `Look Up “${sel.slice(0, 24)}”`, action: () => this.spotlight(sel) } : null,
      sel ? { label: 'Search With Gooble', action: () => this.launch('safari', { url: `gooble://search?q=${encodeURIComponent(sel)}` }) } : null,
      sel ? { sep: true } : null,
      { label: 'Cut', disabled: !sel || field.readOnly, action: () => { field.focus(); document.execCommand('cut'); } },
      { label: 'Copy', disabled: !sel, action: () => { field.focus(); document.execCommand('copy'); } },
      { label: 'Paste', disabled: field.readOnly, action: () => { field.focus(); this.pasteText(); } },
      { sep: true },
      { label: 'Select All', action: () => { field.focus(); if (field.select) field.select(); else document.execCommand('selectAll'); } },
      { sep: true },
      { label: 'Speech', submenu: [
        { label: 'Start Speaking', action: () => { try { const u = new SpeechSynthesisUtterance(sel || field.value || field.innerText || ''); u.pitch = 0.7; speechSynthesis.speak(u); } catch { /* no speech */ } } },
        { label: 'Stop Speaking', action: () => { try { speechSynthesis.cancel(); } catch { /* no speech */ } } },
      ] },
      { label: 'Emoji & Symbols', action: () => this.emojiPicker(field) },
    ]);
  }

  pasteText() {
    navigator.clipboard?.readText?.().then((t) => document.execCommand('insertText', false, t))
      .catch(() => this.notify({ app: 'finder', title: 'Paste', body: 'Press ⌘V to paste. The browser doesn’t let menus read the clipboard.' }));
  }

  emojiPicker(target = document.activeElement) {
    const emojis = '😀 😂 🥹 😍 🤖 👾 💻 ⌨️ 🖱 ☕ 🍵 🚀 ✨ 🔥 💡 ✅ ❌ ⚠️ 🎉 🎶 🐛 🧠 🔧 ⚙️ 📦 📁 🗂 📝 📎 🔒 🌙 ☀️ 🌈 🌿 🌵 🍕 🍩 🧁 ❤️ 💙 💚 👍 👋 🙏 🤝 👀 🫡'.split(' ');
    const wrap = h('div.overlay-click');
    const grid = h('div.emoji-grid', {}, ...emojis.map((em) => h('button', { text: em, onclick: () => { target?.focus?.(); document.execCommand('insertText', false, em); wrap.remove(); } })));
    wrap.append(h('div.emoji-box', {}, h('b', { text: 'Emoji & Symbols' }), grid));
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) wrap.remove(); });
    this.layer.append(wrap);
  }

  // ================================================================== HUD (volume / brightness)
  hud(kind, value) {
    const icon = kind === 'volume' ? (value < 0.01 ? '🔇' : value < 0.5 ? '🔉' : '🔊') : '☀︎';
    this.hudEl.innerHTML = '';
    this.hudEl.append(h('span.hud-ico', { text: icon }), h('div.hud-txt', {}, h('b', { text: kind === 'volume' ? 'Sound' : 'Display' }), h('div.hud-bar', {}, h('i', { style: { width: `${Math.round(value * 100)}%` } }))));
    this.hudEl.classList.add('in');
    clearTimeout(this.hudT);
    this.hudT = setTimeout(() => this.hudEl.classList.remove('in'), 1400);
  }

  // ================================================================== dock
  renderDock() {
    const d = this.dock;
    d.innerHTML = '';
    const running = new Set(this.windows.map((w) => w.app.id));
    if (this.music.playing) running.add('music');
    const pinned = this.dockIds();
    const ids = [...pinned, ...[...running].filter((id) => !pinned.includes(id) && APPS[id] && !APPS[id].hidden)];
    for (const id of ids) {
      const app = APPS[id];
      if (!app) continue;
      const it = this.dockItem(app.name, appIcon(app.icon || id), running.has(id), () => this.dockClick(id), (e) => this.dockMenu(e, id), id);
      const badge = this.badges[id];
      if (badge) it.append(h('span.dock-badge', { text: badge > 99 ? '99+' : String(badge) }));
      d.append(it);
    }
    d.append(h('div.dock-sep'));
    for (const w of this.windows.filter((x) => x.minimized)) {
      const it = this.dockItem(w.title, appIcon(w.app.icon || w.app.id), false, () => w.restore(), null, `min-${w.id}`);
      it.classList.add('dock-min');
      d.append(it);
    }
    const dl = this.dockItem('Downloads', folderIcon('downloads'), false, () => this.stack(dl), (e) => this.contextMenu(e, [
      { label: 'Open “Downloads”', action: () => this.launch('finder', { path: `${HOME}/Downloads` }) },
    ]), 'downloads');
    d.append(dl);
    const full = Object.keys(this.vfs.node(`${HOME}/.Trash`)?.children || {}).length > 0;
    const trash = this.dockItem('Trash', trashIcon(full), false, () => this.launch('finder', { path: `${HOME}/.Trash` }), (e) => this.contextMenu(e, [
      { label: 'Open', action: () => this.launch('finder', { path: `${HOME}/.Trash` }) },
      { label: 'Empty Trash', disabled: !full, action: () => this.emptyTrash() },
    ]), 'trash');
    trash.classList.add('dock-trash');
    this.trashEl = trash;
    d.append(trash);
  }

  dockItem(label, iconHtml, running, onClick, onMenu, key) {
    const it = h('div.dock-item', { dataset: { key }, role: 'button', tabindex: '-1', 'aria-label': label },
      h('div.dock-tip', { text: label }),
      h('div.dock-icon', { html: iconHtml }),
      h('div.dock-dot', { class: running ? 'on' : '' }));
    it.addEventListener('click', onClick);
    if (onMenu) it.addEventListener('contextmenu', onMenu);
    return it;
  }

  dockClick(id) {
    if (id === 'launchpad') return this.launchpad();
    const wins = this.windows.filter((w) => w.app.id === id);
    if (!wins.length) { this.launch(id); return; }
    const visible = wins.filter((w) => !w.minimized);
    if (!visible.length) wins.at(-1).restore();
    else {
      const inSpace = visible.filter((w) => w.space === this.spaceId);
      (inSpace.length ? inSpace : visible).forEach((w) => w.focus());
    }
  }

  dockMenu(e, id) {
    const app = APPS[id];
    const wins = this.windows.filter((w) => w.app.id === id);
    const pinned = this.dockIds().includes(id);
    this.contextMenu(e, [
      ...wins.map((w) => ({ label: w.title, action: () => w.restore() })),
      wins.length ? { sep: true } : null,
      app.single === false || !wins.length ? { label: 'New Window', action: () => this.launch(id, { newWindow: true }) } : null,
      { label: 'Options', submenu: [
        { label: 'Keep in Dock', checked: pinned, action: () => this.pin(id, !pinned) },
        { label: 'Open at Login', checked: id === 'finder' },
        { label: 'Show in Finder', action: () => this.launch('finder', { path: '/Applications' }) },
      ] },
      { sep: true },
      wins.length && id !== 'finder' ? { label: 'Quit', action: () => this.quit(id) } : { label: 'Open', action: () => this.launch(id) },
      pinned && !wins.length && id !== 'finder' ? { label: 'Remove from Dock', action: () => this.pin(id, false) } : null,
    ]);
  }

  pin(id, on) {
    const list = this.dockIds().filter((x) => x !== id);
    if (on) list.push(id);
    this.prefs.dock = list;
    this.savePrefs();
    this.renderDock();
  }

  /** Downloads stack: a grid of files that fans out of the Dock. */
  stack(anchor) {
    if (this.overlay?.kind === 'stack') return this.closeOverlay();
    this.closeOverlay();
    const files = this.vfs.ls(`${HOME}/Downloads`);
    const grid = h('div.stack-grid', {}, ...files.map((e) => h('button.stack-item', { onclick: () => { this.closeOverlay(); this.openPath(e.path); } }, h('span.stack-ic', { html: this.iconFor(e) }), h('span', { text: e.name }))));
    const pop = h('div.dock-stack', {}, h('b', { text: 'Downloads' }), files.length ? grid : h('p', { text: 'No downloads' }),
      h('button.btn', { text: 'Open in Finder', onclick: () => { this.closeOverlay(); this.launch('finder', { path: `${HOME}/Downloads` }); } }));
    const wrap = h('div.overlay-click', {}, pop);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) this.closeOverlay(); });
    this.layer.append(wrap);
    const r = anchor.getBoundingClientRect(), sr = this.screen.getBoundingClientRect();
    pop.style.left = `${Math.min(sr.width - pop.offsetWidth - 8, Math.max(8, r.left - sr.left + r.width / 2 - pop.offsetWidth / 2))}px`;
    pop.style.bottom = `${sr.bottom - r.top + 10}px`;
    requestAnimationFrame(() => pop.classList.add('in'));
    this.overlay = { kind: 'stack', close: () => wrap.remove() };
  }

  magnify(mx) {
    const items = [...this.dock.querySelectorAll('.dock-item')];
    const size = this.prefs.dockSize;
    for (const it of items) {
      let s = 1;
      if (mx != null && this.prefs.magnify) {
        const r = it.getBoundingClientRect();
        const d = Math.abs(mx - (r.left + r.width / 2));
        s = 1 + 0.75 * Math.max(0, 1 - d / (size * 2.6)) ** 2;
      }
      it.style.setProperty('--s', s.toFixed(3));
    }
    this.dock.classList.toggle('magnifying', mx != null);
  }

  bounce(id) {
    const it = this.dock.querySelector(`[data-key="${id}"]`);
    if (!it) return;
    it.classList.remove('bounce');
    void it.offsetWidth;
    it.classList.add('bounce');
    setTimeout(() => it.classList.remove('bounce'), 1300);
  }

  /** Drops from Finder/the desktop: onto the Trash, Downloads or an app icon. */
  dropOnDock(e, paths) {
    const it = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('dock-item'));
    if (!it) return false;
    const key = it.dataset.key;
    try {
      if (key === 'trash') { paths.forEach((p) => this.vfs.trash(p)); this.audio.trash(); return true; }
      if (key === 'downloads') { paths.forEach((p) => this.vfs.mv(p, `${HOME}/Downloads`)); return true; }
      if (APPS[key]) { paths.forEach((p) => this.openWith(key, p)); return true; }
    } catch (err) { this.alert({ title: 'The operation can’t be completed', message: err.message }); return true; }
    return false;
  }

  highlightDock(e) {
    const it = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('dock-item'));
    this.dock.querySelectorAll('.drop').forEach((x) => x !== it && x.classList.remove('drop'));
    it?.classList.add('drop');
  }
  clearDockHighlight() { this.dock.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop')); }

  // ================================================================== apps & windows
  launch(id, args = {}) {
    const app = APPS[id];
    if (!app) return null;
    if (id === 'launchpad') return this.launchpad();
    if (!isInstalled(this, id)) { this.launch('appstore', { show: id }); return null; }
    const existing = this.windows.filter((w) => w.app.id === id);
    if (existing.length && app.single !== false && !args.newWindow) {
      const w = existing.at(-1);
      w.restore();
      w.onArgs?.(args);
      return w;
    }
    if (existing.length && app.single !== false && args.silent) return existing.at(-1);
    if (!existing.length && !args.silent) this.bounce(id);
    if (!args.silent) this.audio.pop();
    const res = app.launch(this, args);
    this.renderDock();
    return res;
  }

  openWith(appId, path) {
    if (['textedit', 'preview', 'finder'].includes(appId)) return this.launch(appId, { path, newWindow: true });
    if (appId === 'code') return this.launch('code', { path });
    if (appId === 'mail') return this.launch('mail', { attach: path });
    return this.launch(appId);
  }

  quit(id) {
    for (const w of this.windows.filter((x) => x.app.id === id)) w.close(true);
    if (id === 'music') this.music.pause();
    this.renderDock();
  }

  forceQuit() {
    const running = [...new Set(this.windows.map((w) => w.app.id))];
    const list = h('div.fq-list', {}, ...running.map((id) => h('label.fq-row', {}, h('input', { type: 'radio', name: 'fq', value: id }), h('span.fq-icon', { html: appIcon(APPS[id].icon || id) }), APPS[id].name)));
    if (!running.length) list.append(h('p', { text: 'No apps are running.' }));
    this.alert({
      title: 'Force Quit Applications',
      message: 'If an app doesn’t respond for a while, select its name and click Force Quit.',
      body: list,
      buttons: [{ label: 'Cancel' }, { label: 'Force Quit', primary: true, action: () => { const v = list.querySelector('input:checked')?.value; if (v) this.quit(v); } }],
    });
  }

  createWindow(opts) {
    const w = new Win(this, opts);
    this.windows.push(w);
    w.focus();
    this.renderDock();
    this.saveSessionSoon();
    return w;
  }

  focusWin(w) {
    if (this.active === w) return;
    this.active?.el.classList.remove('active');
    this.active = w;
    if (w) { w.el.classList.add('active'); w.el.style.zIndex = String(++this.z); }
    this.screen.classList.toggle('has-fs', !!w?.fs);
    this.renderAppMenus();
    this.emit('focus', w);
  }

  topWindow(except) {
    return this.windows.filter((x) => !x.minimized && x !== except && x.space === this.spaceId).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex)[0];
  }

  removeWin(w) {
    this.windows = this.windows.filter((x) => x !== w);
    if (this.active === w) {
      this.active = null;
      const next = this.topWindow();
      if (next) next.focus(); else { this.renderAppMenus(); this.screen.classList.remove('has-fs'); }
    }
    this.renderDock();
    this.saveSessionSoon();
  }

  // ================================================================== Spaces (multiple desktops)
  applySpaces() {
    for (const w of this.windows) w.el.classList.toggle('off-space', w.space !== this.spaceId);
  }

  switchSpace(i) {
    if (i < 0 || i >= this.spaces.length) return;
    const id = this.spaces[i];
    if (id === this.spaceId) return;
    const dir = i > this.spaces.indexOf(this.spaceId) ? 1 : -1;
    const L = this.winLayer;
    L.classList.add('space-slide');
    L.style.transform = `translateX(${-dir * 100}%)`;
    this.showSpaceHud(i);
    setTimeout(() => {
      this.spaceId = id;
      this.applySpaces();
      L.classList.remove('space-slide');
      L.style.transform = `translateX(${dir * 100}%)`;
      void L.offsetWidth;
      L.classList.add('space-slide');
      L.style.transform = '';
      setTimeout(() => L.classList.remove('space-slide'), 320);
      this.focusWin(this.topWindow() || null);
    }, 260);
  }

  showSpaceHud(i) {
    const hud = h('div.space-hud', {}, ...this.spaces.map((_, k) => h('i', { class: k === i ? 'on' : '' })));
    this.layer.append(hud);
    setTimeout(() => hud.remove(), 900);
  }

  addSpace() {
    const id = Math.max(...this.spaces) + 1;
    this.spaces.push(id);
    this.saveSessionSoon();
    return id;
  }

  removeSpace(id) {
    if (this.spaces.length < 2) return;
    this.spaces = this.spaces.filter((s) => s !== id);
    for (const w of this.windows) if (w.space === id) w.space = this.spaces[0];
    if (this.spaceId === id) this.spaceId = this.spaces[0];
    this.applySpaces();
    this.saveSessionSoon();
  }

  // ================================================================== files
  /** Open a file with the right app, Finder-style. */
  openPath(path) {
    const v = this.vfs;
    const n = v.node(path);
    if (!n) return this.alert({ title: 'The item can’t be opened', message: `“${v.base(path)}” could not be found.` });
    if (n.type === 'dir') return this.launch('finder', { path, newWindow: true });
    const ext = v.ext(path);
    if (isImage(n) || ['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return this.launch('preview', { path, newWindow: true });
    if (n.track != null || ext === 'mp3') { this.music.play(n.track || 0); return this.launch('music'); }
    if (ext === 'dmg') return this.alert({ title: 'freecad-1.1.dmg', message: 'FreeCAD is already installed. It’s how Mr. Agent was built!', icon: fileIcon('x.dmg') });
    if (ext === 'zip') return this.alert({ title: v.base(path), message: 'Archive Utility: it’s just more robots, compressed.', icon: fileIcon(path) });
    if (['js', 'ts', 'tsx', 'py', 'rs', 'glsl', 'json', 'html', 'css'].includes(ext)) return this.launch('code', { path });
    return this.launch('textedit', { path, newWindow: true });
  }

  /** Apps that can open a given file (for "Open With"). */
  openersFor(path) {
    const n = this.vfs.node(path);
    if (!n || n.type === 'dir') return [];
    const ext = this.vfs.ext(path);
    if (isImage(n)) return ['preview', 'mail'];
    if (['js', 'ts', 'tsx', 'py', 'rs', 'glsl', 'json', 'html', 'css'].includes(ext)) return ['code', 'textedit', 'mail'];
    return ['textedit', 'code', 'mail'];
  }

  iconFor(entry) {
    if (entry.path === '/' || entry.disk) return diskIcon();
    if (entry.type === 'dir') {
      const n = entry.name.toLowerCase();
      return folderIcon(['projects', 'downloads', 'documents', 'pictures', 'music', 'desktop', 'applications'].includes(n) ? n : '');
    }
    if (entry.image || entry.imageRef) return `<img src="${imageURL(entry, 160, 110)}" alt="" class="thumb">`;
    return fileIcon(entry.name);
  }

  emptyTrash() {
    this.confirm('Are you sure you want to permanently erase the items in the Trash?', 'Empty Trash').then((ok) => {
      if (!ok) return;
      this.vfs.emptyTrash();
      this.audio.trash();
    });
  }

  compress(path) {
    const target = this.vfs.uniqueName(this.vfs.parent(path), `${this.vfs.base(path)}.zip`);
    this.vfs.write(target, `PK (compressed ${this.vfs.base(path)})`);
  }

  quickLook(path) {
    const n = this.vfs.node(path);
    if (!n || n.type !== 'file') return;
    const name = this.vfs.base(path);
    const content = isImage(n) ? h('img.ql-img', { src: imageURL(n, 900, 600), alt: name }) : h('pre.ql-text', { text: (n.content || '').slice(0, 5000) || '(empty)' });
    const wrap = h('div.dlg-wrap.ql');
    const box = h('div.ql-box', {}, h('div.ql-bar', {}, h('b', { text: name }), h('button.btn', { text: `Open with ${APPS[this.openersFor(path)[0]]?.name || 'App'}`, onclick: () => { wrap.remove(); this.openPath(path); } })), content);
    wrap.append(box);
    wrap.addEventListener('click', (ev) => { if (ev.target === wrap) wrap.remove(); });
    this.layer.append(wrap);
    const off = (ev) => { if (ev.key === ' ' || ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); wrap.remove(); window.removeEventListener('keydown', off, true); } };
    setTimeout(() => window.addEventListener('keydown', off, true), 0);
  }

  copyFiles(paths, cut = false) { this.clipboard = { paths: [...paths], cut }; }
  pasteFiles(dir) {
    if (!this.clipboard) return;
    try {
      for (const p of this.clipboard.paths) {
        if (!this.vfs.exists(p)) continue;
        const dest = this.vfs.uniqueName(dir, this.vfs.base(p));
        if (this.clipboard.cut) this.vfs.mv(p, dest); else this.vfs.cp(p, dest);
      }
      if (this.clipboard.cut) this.clipboard = null;
    } catch (err) { this.alert({ title: 'The operation can’t be completed', message: err.message }); }
  }

  // ================================================================== desktop
  renderDesktop() {
    const d = this.desktop;
    d.querySelectorAll('.desk-icon').forEach((e) => e.remove());
    const entries = [{ name: 'Macintosh HD', path: '/', type: 'dir', disk: true }, ...this.vfs.ls(`${HOME}/Desktop`)];
    const W = this.screen.clientWidth || innerWidth;
    entries.forEach((e, i) => {
      const pos = this.prefs.iconPos[e.name] || { x: W - 112 - Math.floor(i / 6) * 104, y: 38 + (i % 6) * 104 };
      const el = h('div.desk-icon', { dataset: { path: e.path }, style: { left: `${pos.x}px`, top: `${pos.y}px` } },
        h('div.di-img', { html: this.iconFor(e) }),
        h('div.di-label', { text: e.name }));
      el.addEventListener('pointerdown', (ev) => this.iconDown(ev, el, e));
      el.addEventListener('dblclick', () => this.openPath(e.path));
      el.addEventListener('contextmenu', (ev) => this.contextMenu(ev, [
        { label: 'Open', action: () => this.openPath(e.path) },
        !e.disk && e.type !== 'dir' ? { label: 'Open With', submenu: this.openersFor(e.path).map((id) => ({ label: APPS[id].name, icon: appIcon(APPS[id].icon || id), action: () => this.openWith(id, e.path) })) } : null,
        { label: 'Get Info', action: () => this.getInfo(e.path) },
        { sep: true },
        { label: 'Rename', disabled: !!e.disk, action: () => this.rename(e.path) },
        { label: 'Duplicate', disabled: !!e.disk || e.type === 'dir', action: () => this.vfs.cp(e.path, this.vfs.uniqueName(`${HOME}/Desktop`, `${e.name.replace(/(\.[^.]+)?$/, ' copy$1')}`)) },
        { label: `Compress “${e.name}”`, disabled: !!e.disk, action: () => this.compress(e.path) },
        { label: 'Quick Look', disabled: e.type === 'dir', action: () => this.quickLook(e.path) },
        { label: 'Copy', disabled: !!e.disk, action: () => this.copyFiles([e.path]) },
        { sep: true },
        { label: 'Move to Trash', disabled: !!e.disk, action: () => { this.vfs.trash(e.path); this.audio.trash(); } },
      ]));
      d.append(el);
    });
  }

  iconDown(ev, el, entry) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    this.focusWin(null);
    if (!ev.shiftKey && !ev.metaKey) this.desktop.querySelectorAll('.desk-icon.sel').forEach((x) => x !== el && x.classList.remove('sel'));
    el.classList.add('sel');
    const x0 = el.offsetLeft, y0 = el.offsetTop;
    let moved = false;
    drag(ev, (dx, dy, e) => {
      if (Math.hypot(dx, dy) > 4) moved = true;
      if (!moved) return;
      el.style.left = `${x0 + dx}px`;
      el.style.top = `${Math.max(MENU_H + 4, y0 + dy)}px`;
      el.classList.add('dragging');
      this.highlightDock(e);
    }, (dx, dy, e) => {
      el.classList.remove('dragging');
      this.clearDockHighlight();
      if (!moved) return;
      if (!entry.disk && this.dropOnDock(e, [entry.path])) { this.renderDesktop(); return; }
      const under = document.elementsFromPoint(e.clientX, e.clientY);
      const target = under.find((n) => n !== el && n.dataset?.path && (n.classList?.contains('desk-icon') || n.classList?.contains('f-item') || n.classList?.contains('sb-item')));
      const folderWin = under.find((n) => n.classList?.contains('f-content') && n.dataset.path);
      const dest = target && this.vfs.isDir(target.dataset.path) ? target.dataset.path : folderWin ? folderWin.dataset.path : null;
      if (dest && !entry.disk) {
        try { this.vfs.mv(entry.path, dest); } catch (err) { this.alert({ title: 'Can’t move', message: err.message }); }
        return;
      }
      this.prefs.iconPos[entry.name] = { x: el.offsetLeft, y: el.offsetTop };
      this.savePrefs();
    });
  }

  overTrash(e) {
    if (!this.trashEl) return false;
    const r = this.trashEl.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 10 && e.clientY <= r.bottom;
  }

  setupDesktopEvents() {
    const d = this.desktop;
    d.addEventListener('pointerdown', (e) => {
      if (e.target !== d || e.button !== 0) return;
      this.focusWin(null);
      d.querySelectorAll('.desk-icon.sel').forEach((x) => x.classList.remove('sel'));
      const sr = this.screen.getBoundingClientRect();
      const sx = e.clientX - sr.left, sy = e.clientY - sr.top;
      const band = h('div.sel-band');
      d.append(band);
      drag(e, (dx, dy) => {
        const x = Math.min(sx, sx + dx), y = Math.min(sy, sy + dy), w = Math.abs(dx), hh = Math.abs(dy);
        Object.assign(band.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px` });
        d.querySelectorAll('.desk-icon').forEach((ic) => {
          const r = ic.getBoundingClientRect();
          const ix = r.left - sr.left, iy = r.top - sr.top;
          ic.classList.toggle('sel', ix < x + w && ix + r.width > x && iy < y + hh && iy + r.height > y);
        });
      }, () => band.remove());
    });
    d.addEventListener('contextmenu', (e) => {
      if (e.target !== d) return;
      this.contextMenu(e, [
        { label: 'New Folder', action: () => { const p = this.vfs.uniqueName(`${HOME}/Desktop`, 'untitled folder'); this.vfs.mkdir(p); } },
        { label: 'New Text File', action: () => { const p = this.vfs.uniqueName(`${HOME}/Desktop`, 'untitled.txt'); this.vfs.write(p, ''); this.openPath(p); } },
        this.clipboard ? { label: `Paste ${this.clipboard.paths.length} Item${this.clipboard.paths.length > 1 ? 's' : ''}`, action: () => this.pasteFiles(`${HOME}/Desktop`) } : null,
        { sep: true },
        { label: 'Get Info', action: () => this.getInfo('/') },
        { label: 'Change Desktop Background…', action: () => this.launch('settings', { pane: 'wallpaper' }) },
        { label: 'Edit Widgets…', action: () => this.widgets.gallery() },
        { sep: true },
        { label: 'Clean Up', action: () => { this.prefs.iconPos = {}; this.savePrefs(); this.renderDesktop(); } },
        { label: 'Take Screenshot', shortcut: '⌃⇧3', action: () => this.shots.full() },
      ]);
    });
  }

  rename(path) {
    const name = this.vfs.base(path);
    this.prompt({ title: 'Rename', message: `Enter a new name for “${name}”:`, value: name }).then((v) => {
      if (!v || v === name) return;
      try {
        const dest = this.vfs.mv(path, `${this.vfs.parent(path)}/${v}`);
        if (this.prefs.iconPos[name]) { this.prefs.iconPos[v] = this.prefs.iconPos[name]; delete this.prefs.iconPos[name]; this.savePrefs(); }
        return dest;
      } catch (err) { this.alert({ title: 'Can’t rename', message: err.message }); }
    });
  }

  getInfo(path) {
    const v = this.vfs;
    const n = v.node(path);
    if (!n) return;
    const info = v.info(n);
    const isRoot = path === '/';
    const rows = isRoot
      ? [['Kind', 'Volume'], ['Capacity', '1 PB'], ['Available', '999.98 TB'], ['Used', '19.7 GB'], ['Format', 'APFS (Encrypted, Caffeinated)']]
      : [['Kind', kindOf(v.base(path), info.type)], ['Size', info.type === 'dir' ? `${info.size} items` : `${info.size.toLocaleString()} bytes`], ['Where', v.pretty(v.parent(path))], ['Created', new Date(info.created).toLocaleString()], ['Modified', new Date(info.modified).toLocaleString()], ['Permissions', info.readonly ? 'Read only (Mr. Agent is writing this)' : 'Read & Write']];
    this.createWindow({
      app: APPS.finder, title: `${isRoot ? 'Macintosh HD' : v.base(path)} Info`, width: 300, height: 360, resizable: false, restorable: false,
      body: (b) => b.append(h('div.info-pane', {},
        h('div.info-head', {}, h('div.info-icon', { html: this.iconFor({ ...info, name: v.base(path), path, disk: isRoot }) }), h('div', {}, h('b', { text: isRoot ? 'Macintosh HD' : v.base(path) }), h('small', { text: isRoot ? '1 PB' : kindOf(v.base(path), info.type) }))),
        h('dl.info-rows', {}, ...rows.flatMap(([k, val]) => [h('dt', { text: k }), h('dd', { text: val })])))),
    });
  }

  // ================================================================== overlays
  closeOverlay() {
    if (this.overlay) { const o = this.overlay; this.overlay = null; o.close(); }
  }

  spotlight(initial = '') {
    if (this.state !== 'desktop') return;
    if (this.overlay?.kind === 'spotlight') return this.closeOverlay();
    this.closeOverlay();
    const input = h('input.sp-input', { placeholder: 'Spotlight Search', 'aria-label': 'Spotlight Search', autocomplete: 'off', spellcheck: 'false', value: initial });
    const results = h('div.sp-results');
    const preview = h('div.sp-preview');
    const box = h('div.mac-spotlight', {}, h('div.sp-bar', {}, h('span.sp-glyph', { html: glyph.search }), input), h('div.sp-body', {}, results, preview));
    const wrap = h('div.overlay-click', {}, box);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) this.closeOverlay(); });
    this.layer.append(wrap);
    let items = [], sel = 0;
    const showPreview = () => {
      preview.innerHTML = '';
      const it = items[sel];
      if (!it) return;
      preview.append(h('div.sp-pv-icon', { html: it.big || it.icon }), h('b', { text: it.label }), it.detail ? h('p', { text: it.detail }) : null, it.snippet ? h('pre', { text: it.snippet }) : null);
    };
    const paint = () => {
      results.innerHTML = '';
      let lastGroup = null;
      items.forEach((it, i) => {
        if (it.group !== lastGroup) { results.append(h('div.sp-group', { text: it.group })); lastGroup = it.group; }
        const row = h('div.sp-row', { class: i === sel ? 'sel' : '' }, h('span.sp-icon', { html: it.icon }), h('span.sp-label', { text: it.label }), it.sub ? h('span.sp-sub', { text: it.sub }) : null);
        row.addEventListener('mouseenter', () => { sel = i; results.querySelectorAll('.sp-row').forEach((r, k) => r.classList.toggle('sel', k === i)); showPreview(); });
        row.addEventListener('click', () => { this.closeOverlay(); it.run(); });
        results.append(row);
      });
      results.querySelector('.sp-row.sel')?.scrollIntoView({ block: 'nearest' });
      showPreview();
    };
    const run = () => {
      const q = input.value.trim();
      items = [];
      if (!q) { box.classList.remove('has'); results.innerHTML = ''; preview.innerHTML = ''; return; }
      const ql = q.toLowerCase();
      const calc = spotlightMaths(q);
      if (calc) items.push({ group: 'Calculator', label: calc, icon: appIcon('calculator'), detail: 'Press Return to copy the result.', run: () => { navigator.clipboard?.writeText(calc.split('= ').pop()).catch(() => {}); } });
      const conv = convert(q);
      if (conv) items.push({ group: 'Conversion', label: conv, icon: appIcon('calculator'), detail: 'Press Return to copy the result.', run: () => { navigator.clipboard?.writeText(conv.split('= ').pop()).catch(() => {}); } });
      Object.values(APPS).filter((a) => !a.hidden && isInstalled(this, a.id) && a.name.toLowerCase().includes(ql)).forEach((a, i) => items.push({ group: i === 0 && !calc && !conv ? 'Top Hit' : 'Applications', label: a.name, icon: appIcon(a.icon || a.id), big: appIcon(a.icon || a.id), detail: a.about || 'Application', run: () => this.launch(a.id) }));
      const files = [];
      this.vfs.walk(HOME, (e) => { if (e.name.toLowerCase().includes(ql) && files.length < 10) files.push(e); });
      this.vfs.walk(HOME, (e) => { if (e.type === 'file' && files.length < 14 && !files.some((f) => f.path === e.path) && !isImage(e) && (this.vfs.read(e.path) || '').toLowerCase().includes(ql)) files.push(e); });
      files.forEach((e) => {
        const body = e.type === 'file' && !isImage(e) ? (this.vfs.read(e.path) || '') : '';
        const at = body.toLowerCase().indexOf(ql);
        items.push({ group: e.type === 'dir' ? 'Folders' : isImage(e) ? 'Images' : 'Documents', label: e.name, sub: this.vfs.pretty(this.vfs.parent(e.path)), icon: this.iconFor(e), big: isImage(e) ? `<img src="${imageURL(e, 320, 220)}" alt="">` : this.iconFor(e), detail: `${kindOf(e.name, e.type)} · ${this.vfs.pretty(e.path)}`, snippet: body ? body.slice(Math.max(0, at - 60), Math.max(0, at) + 200) : '', run: () => this.openPath(e.path) });
      });
      const defs = { robot: 'a machine capable of carrying out a complex series of actions automatically, such as writing code and drinking coffee it cannot taste.', coffee: 'a hot drink made from roasted seeds; primary fuel of Mr. Agent.', bug: 'an undocumented feature.', agent: 'one who acts. See: Mr. Agent.', mac: 'a computer that, in this case, has 1,024 cores.', freecad: 'an open-source parametric 3D modeller. Mr. Agent was built with it.' };
      if (defs[ql]) items.push({ group: 'Definition', label: `${ql}: ${defs[ql]}`, icon: appIcon('notes'), detail: `${ql} (noun): ${defs[ql]}`, run: () => {} });
      items.push({ group: 'Siri Suggestions', label: `Ask Mr. Agent “${q}”`, icon: '<span class="sp-orb"></span>', run: () => this.assistant.ask(q) });
      items.push({ group: 'Search the web', label: `Search for “${q}”`, icon: appIcon('safari'), run: () => this.launch('safari', { url: `gooble://search?q=${encodeURIComponent(q)}` }) });
      box.classList.add('has');
      paint();
    };
    input.addEventListener('input', () => { sel = 0; run(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); paint(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      if (e.key === 'Enter' && items[sel]) { const it = items[sel]; this.closeOverlay(); it.run(); }
    });
    this.overlay = { kind: 'spotlight', close: () => wrap.remove() };
    if (initial) run();
    setTimeout(() => input.focus(), 10);
  }

  launchpad() {
    if (this.state !== 'desktop') return;
    if (this.overlay?.kind === 'launchpad') return this.closeOverlay();
    this.closeOverlay();
    const search = h('input.lp-search', { placeholder: 'Search', 'aria-label': 'Search apps' });
    const grid = h('div.lp-grid');
    const fill = () => {
      grid.innerHTML = '';
      const q = search.value.toLowerCase();
      Object.values(APPS).filter((a) => !a.hidden && a.id !== 'launchpad' && isInstalled(this, a.id) && a.name.toLowerCase().includes(q)).forEach((a) => {
        grid.append(h('button.lp-app', { onclick: () => { this.closeOverlay(); this.launch(a.id); } }, h('span.lp-icon', { html: appIcon(a.icon || a.id) }), h('span', { text: a.name })));
      });
    };
    fill();
    search.addEventListener('input', fill);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') grid.querySelector('.lp-app')?.click(); });
    const lp = h('div.mac-launchpad', {}, search, grid);
    lp.addEventListener('click', (e) => { if (e.target === lp || e.target === grid) this.closeOverlay(); });
    this.layer.append(lp);
    requestAnimationFrame(() => lp.classList.add('in'));
    this.overlay = { kind: 'launchpad', close: () => { lp.classList.remove('in'); setTimeout(() => lp.remove(), 250); } };
    setTimeout(() => search.focus(), 50);
  }

  missionControl() {
    if (this.state !== 'desktop') return;
    if (this.overlay?.kind === 'mc') return this.closeOverlay();
    this.closeOverlay();
    const wins = this.windows.filter((w) => !w.minimized && w.space === this.spaceId);
    const bar = h('div.mc-bar');
    const renderBar = () => {
      bar.innerHTML = '';
      this.spaces.forEach((s, i) => {
        const sp = h('div.mc-space', { class: s === this.spaceId ? 'on' : '', dataset: { space: s } },
          h('div.mc-thumb', { style: { background: this.wall.style.background } }, h('span', { text: String(this.windows.filter((w) => w.space === s && !w.minimized).length || '') })),
          `Desktop ${i + 1}`);
        sp.addEventListener('click', (e) => { e.stopPropagation(); if (s !== this.spaceId) { this.closeOverlay(); this.switchSpace(i); } });
        if (this.spaces.length > 1) sp.append(h('button.mc-x', { text: '×', 'aria-label': `Close Desktop ${i + 1}`, onclick: (e) => { e.stopPropagation(); this.removeSpace(s); this.closeOverlay(); this.missionControl(); } }));
        bar.append(sp);
      });
      const add = h('div.mc-space', {}, h('div.mc-thumb.add', { text: '+' }), 'Add Desktop');
      add.addEventListener('click', (e) => { e.stopPropagation(); this.addSpace(); renderBar(); });
      bar.append(add);
    };
    renderBar();
    const back = h('div.mac-mc', {}, bar, wins.length ? null : h('p.mc-empty', { text: 'No open windows on this desktop' }));
    back.addEventListener('click', () => this.closeOverlay());
    this.winLayer.prepend(back);
    this.winLayer.classList.add('mc');
    const L = this.winLayer.getBoundingClientRect();
    const n = wins.length;
    const cols = Math.ceil(Math.sqrt(n * (L.width / L.height))) || 1;
    const rows = Math.ceil(n / cols) || 1;
    const cw = L.width / cols, ch = (L.height - 150) / rows;
    const saved = new Map();
    wins.forEach((w, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const s = Math.min((cw - 40) / w.w, (ch - 50) / w.h, 1);
      const tx = c * cw + cw / 2 - (w.x + w.w / 2);
      const ty = 140 + r * ch + ch / 2 - (w.y + w.h / 2);
      saved.set(w, w.el.style.transform);
      w.mcT = `translate(${tx}px, ${ty}px) scale(${s})`;
      w.el.style.transform = w.mcT;
      w.el.style.zIndex = String(9000 + i);
      w.el.dataset.mcTitle = w.title;
      w.mcPick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        let moved = false;
        const sx = e.clientX, sy = e.clientY;
        drag(e, (dx, dy) => {
          if (Math.hypot(dx, dy) > 6) moved = true;
          if (moved) w.el.style.transform = `translate(${tx + dx}px, ${ty + dy}px) scale(${s * 0.8})`;
          bar.querySelectorAll('.mc-space[data-space]').forEach((sp) => { const rr = sp.getBoundingClientRect(); sp.classList.toggle('drop', sx + dx > rr.left && sx + dx < rr.right && sy + dy > rr.top && sy + dy < rr.bottom); });
        }, () => {
          const hit = [...bar.querySelectorAll('.mc-space[data-space]')].find((sp) => sp.classList.contains('drop'));
          bar.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
          if (moved && hit) {
            w.space = +hit.dataset.space;
            this.closeOverlay();
            this.applySpaces();
            this.saveSessionSoon();
            this.missionControl();
            return;
          }
          if (moved) { w.el.style.transform = w.mcT; return; }
          this.closeOverlay();
          w.focus();
        });
      };
      w.el.addEventListener('pointerdown', w.mcPick, true);
    });
    this.overlay = {
      kind: 'mc',
      close: () => {
        back.remove();
        wins.forEach((w) => {
          w.el.style.transform = saved.get(w) || '';
          w.el.removeEventListener('pointerdown', w.mcPick, true);
          w.el.style.zIndex = String(++this.z);
        });
        if (this.active) this.active.el.style.zIndex = String(++this.z);
        setTimeout(() => this.winLayer.classList.remove('mc'), 300);
      },
    };
  }

  switcher(dir = 1) {
    const ids = [...new Set([...this.windows].sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex).map((w) => w.app.id))];
    if (!ids.length) return;
    if (this.overlay?.kind !== 'switch') {
      this.closeOverlay();
      const row = h('div.sw-row');
      const box = h('div.mac-switcher', {}, row);
      this.layer.append(box);
      this.overlay = { kind: 'switch', idx: 0, ids, row, close: () => box.remove() };
    }
    const o = this.overlay;
    o.idx = (o.idx + dir + o.ids.length) % o.ids.length;
    o.row.innerHTML = '';
    o.ids.forEach((id, i) => o.row.append(h('div.sw-app', { class: i === o.idx ? 'sel' : '' }, h('span.sw-icon', { html: appIcon(APPS[id].icon || id) }), h('span', { text: APPS[id].name }))));
  }

  togglePanel(kind, btn) {
    if (this.overlay?.kind === kind) return this.closeOverlay();
    this.closeOverlay();
    this.closeMenus();
    const panel = kind === 'cc' ? this.controlCenter() : this.notificationCenter();
    const wrap = h('div.overlay-click', {}, panel);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) this.closeOverlay(); });
    this.layer.append(wrap);
    btn?.classList.add('open');
    requestAnimationFrame(() => panel.classList.add('in'));
    this.overlay = { kind, close: () => { btn?.classList.remove('open'); panel.classList.remove('in'); setTimeout(() => wrap.remove(), 200); } };
  }

  controlCenter() {
    const p = this.prefs;
    const tile = (label, sub, on, icon, fn) => {
      const b = h('button.cc-tile', { class: on ? 'on' : '' }, h('span.cc-ico', { html: icon }), h('span.cc-txt', {}, h('b', { text: label }), h('small', { text: sub })));
      b.addEventListener('click', () => { fn(); b.classList.toggle('on'); });
      return b;
    };
    const slider = (label, value, fn, icon) => {
      const input = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(value), 'aria-label': label });
      input.addEventListener('input', () => fn(+input.value));
      return h('div.cc-slider', {}, h('b', { text: label }), h('div.cc-range', {}, h('span', { html: icon }), input));
    };
    const np = h('div.cc-np');
    const renderNp = () => {
      np.innerHTML = '';
      const m = this.music;
      np.append(h('div.cc-art', { style: { background: `linear-gradient(135deg, hsl(${m.track * 80} 80% 60%), hsl(${m.track * 80 + 60} 80% 45%))` } }),
        h('div.cc-np-txt', {}, h('b', { text: m.playing ? m.info.title : 'Not Playing' }), h('small', { text: m.playing ? m.info.artist : 'Music' })),
        h('button', { html: glyph.prev, 'aria-label': 'Previous', onclick: () => { m.prev(); renderNp(); } }),
        h('button', { html: m.playing ? glyph.pause : glyph.play, 'aria-label': 'Play or pause', onclick: () => { m.toggle(); renderNp(); } }),
        h('button', { html: glyph.next, 'aria-label': 'Next', onclick: () => { m.next(); renderNp(); } }));
    };
    renderNp();
    return h('div.mac-panel.mac-cc', {},
      h('div.cc-grid', {},
        h('div.cc-group', {},
          tile('Wi-Fi', p.wifi ? p.network : 'Off', p.wifi, glyph.wifi, () => this.setPref('wifi', !this.prefs.wifi)),
          tile('Bluetooth', p.bluetooth ? 'On' : 'Off', p.bluetooth, '<b>ᛒ</b>', () => this.setPref('bluetooth', !this.prefs.bluetooth)),
          tile('AirDrop', p.airdrop ? 'Everyone' : 'Off', p.airdrop, glyph.airdrop, () => this.setPref('airdrop', !this.prefs.airdrop))),
        h('div.cc-group', {},
          tile('Focus', p.focus ? 'Do Not Disturb' : 'Off', p.focus, '☾', () => this.setPref('focus', !this.prefs.focus)),
          tile('Dark Mode', p.dark ? 'On' : 'Off', p.dark, '◐', () => this.setPref('dark', !this.prefs.dark)),
          tile('Night Shift', p.nightShift ? 'On' : 'Off', p.nightShift, '☀', () => this.setPref('nightShift', !this.prefs.nightShift)))),
      slider('Display', (p.brightness - 0.35) / 0.65, (v) => this.setPref('brightness', 0.35 + v * 0.65), '☼'),
      slider('Sound', p.volume, (v) => { this.setPref('volume', v); }, '🔊'),
      np,
      h('div.cc-row', {},
        h('button.cc-small', { onclick: () => { this.closeOverlay(); this.shots.toolbar(); }, html: '<span>⌗</span>Screenshot' }),
        h('button.cc-small', { onclick: () => { this.closeOverlay(); this.missionControl(); }, html: '<span>▦</span>Mission Control' }),
        h('button.cc-small', { onclick: () => { this.closeOverlay(); this.lock(); }, html: '<span>🔒</span>Lock Screen' })));
  }

  notificationCenter() {
    const d = new Date();
    const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const cal = h('div.nc-cal', {}, h('b', { text: d.toLocaleDateString([], { month: 'long' }).toUpperCase() }),
      h('div.nc-cal-grid', {}, ...'SMTWTFS'.split('').map((c) => h('i', { text: c })), ...Array.from({ length: first }, () => h('span')),
        ...Array.from({ length: days }, (_, i) => h('span', { class: i + 1 === d.getDate() ? 'today' : '', text: String(i + 1) }))));
    const r = this.ctx.robot, b = this.ctx.brain;
    const robo = h('div.nc-widget.nc-robot', {},
      h('div.nc-w-title', { text: 'MR. AGENT' }),
      h('div.nc-robot-row', {}, h('span.nc-avatar', { html: robotAvatar() }),
        h('div', {}, h('b', { text: b.activity }), h('small', { text: `Battery ${Math.round(r.energy * 100)}% · ${this.ctx.screen.linesToday.toLocaleString()} lines today` }))));
    const hrs = this.ctx.world.hours ?? d.getHours();
    const night = this.ctx.world.night > 0.5;
    const weather = h('div.nc-widget.nc-weather', { class: night ? 'night' : '' },
      h('div.nc-w-title', { text: 'SILICON VALLEY' }),
      h('div.nc-temp', { text: `${Math.round(18 + 6 * Math.sin(((hrs - 9) / 24) * Math.PI * 2))}°` }),
      h('small', { text: night ? 'Clear night · stars visible' : 'Mostly sunny · H:24° L:13°' }));
    const list = h('div.nc-list');
    const fillList = () => {
      list.innerHTML = '';
      if (!this.notifs.length) { list.append(h('p.nc-empty', { text: 'No Notifications' })); return; }
      list.append(h('div.nc-list-h', {}, h('b', { text: 'Notifications' }), h('button', { text: 'Clear', onclick: () => { this.notifs = []; fillList(); } })));
      for (const n of this.notifs.slice().reverse().slice(0, 8)) {
        const row = h('div.nc-note', {}, h('span.nc-n-icon', { html: appIcon(APPS[n.app]?.icon || n.app) }), h('div', {}, h('b', { text: n.title }), h('small', { text: n.body })));
        row.addEventListener('click', () => { this.closeOverlay(); if (APPS[n.app]) this.launch(n.app, n.open || {}); });
        list.append(row);
      }
    };
    fillList();
    return h('div.mac-panel.mac-nc', {}, list, h('div.nc-widgets', {}, h('div.nc-widget', {}, cal), weather, robo));
  }

  /** Banner notification; `reply` adds an inline reply field, `open` is passed to the app on click. */
  notify({ app = 'finder', title, body, icon, reply, open }) {
    this.notifs.push({ app, title, body, t: Date.now(), open });
    if (this.prefs.focus || this.state !== 'desktop') return;
    let hold = false;
    const t = h('div.mac-toast', {},
      h('span.toast-icon', { html: icon || appIcon(APPS[app]?.icon || app) }),
      h('div.toast-txt', {}, h('b', { text: title }), h('span', { text: body })),
      h('small', { text: 'now' }));
    const dismiss = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); };
    t.append(h('button.toast-x', { text: '×', 'aria-label': 'Dismiss', onclick: (e) => { e.stopPropagation(); dismiss(); } }));
    t.addEventListener('click', (e) => { if (e.target.closest('.toast-reply, .toast-replybtn')) return; dismiss(); if (APPS[app]) this.launch(app, open || {}); });
    if (reply) {
      const input = h('input.toast-input', { placeholder: 'Reply…', 'aria-label': 'Reply' });
      const send = () => { const v = input.value.trim(); if (v) { reply(v); this.audio.pop(); } dismiss(); };
      const row = h('div.toast-reply', {}, input, h('button', { text: 'Send', onclick: (e) => { e.stopPropagation(); send(); } }));
      const btn = h('button.toast-replybtn', { text: 'Reply', onclick: (e) => { e.stopPropagation(); hold = true; t.classList.add('replying'); input.focus(); } });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); if (e.key === 'Escape') dismiss(); });
      t.append(btn, row);
    }
    t.addEventListener('mouseenter', () => { hold = true; });
    t.addEventListener('mouseleave', () => { if (!t.classList.contains('replying')) { hold = false; setTimeout(() => { if (!hold) dismiss(); }, 2500); } });
    this.toasts.append(t);
    this.audio.message();
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { if (!hold) dismiss(); }, 5200);
  }

  // ================================================================== dialogs
  alert({ title, message = '', body = null, icon = null, buttons = [{ label: 'OK', primary: true }] }) {
    return new Promise((resolve) => {
      const wrap = h('div.dlg-wrap');
      const close = (b) => { wrap.remove(); b?.action?.(); resolve(b?.label); };
      const btns = h('div.dlg-btns', {}, ...buttons.map((b) => h(`button.dlg-btn${b.primary ? '.primary' : ''}`, { onclick: () => close(b), text: b.label })));
      const dlg = h('div.mac-dialog', { role: 'dialog', 'aria-label': title },
        h('div.dlg-icon', { html: icon || appIcon('about') }),
        h('b.dlg-title', { text: title }),
        h('p.dlg-msg', { text: message }),
        body, btns);
      wrap.append(dlg);
      this.layer.append(wrap);
      dlg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.target.matches('textarea')) { e.preventDefault(); close(buttons.find((b) => b.primary) || buttons[0]); }
        if (e.key === 'Escape') { e.stopPropagation(); close(buttons.find((b) => !b.primary)); }
      });
      setTimeout(() => (dlg.querySelector('input') || btns.querySelector('.primary') || btns.lastChild)?.focus(), 30);
    });
  }

  confirm(message, okLabel = 'OK') {
    return this.alert({ title: message, message: '', buttons: [{ label: 'Cancel' }, { label: okLabel, primary: true }] }).then((l) => l === okLabel);
  }

  prompt({ title, message, value = '' }) {
    const input = h('input.dlg-input', { value, 'aria-label': title });
    setTimeout(() => { const dot = value.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : value.length); }, 40);
    return this.alert({ title, message, body: input, buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true }] })
      .then((l) => (l === 'OK' ? input.value.trim() : null));
  }

  help() {
    this.alert({
      title: 'Keyboard Shortcuts',
      message: 'Browsers keep ⌘W, ⌘Q, ⌘N and ⌘M for themselves, so this Mac uses Control (⌃) instead.',
      body: h('dl.help-keys', {}, ...[
        ['⌃Space', 'Spotlight'], ['⌃↑ or F3', 'Mission Control'], ['⌃← ⌃→', 'Switch desktops'], ['F4', 'Launchpad'], ['⌥Tab', 'Switch apps'],
        ['⌃W', 'Close window'], ['⌃Q', 'Quit app'], ['⌃N', 'New window'], ['⌃M', 'Minimize'], ['⌃⌘F', 'Full screen'],
        ['⌃⇧3 / 4 / 5', 'Screenshot: screen / area / toolbar'], ['⌘C ⌘V ⌘D ⌘I', 'Finder: copy, paste, duplicate, info'], ['Space', 'Quick Look'], ['Drag to edge', 'Tile a window'], ['F1 F2 · F10–F12', 'Brightness · sound'], ['Esc', 'Close menus & overlays'],
      ].flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      icon: appIcon('settings'),
    });
  }

  /** Hot corners, plus revealing the menu bar / Dock when they're hidden. */
  edges(e) {
    if (this.state !== 'desktop') return;
    const r = this.screen.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    this.screen.classList.toggle('reveal-top', y < 8 || !!e.target.closest?.('.mac-menubar, .mac-menu'));
    this.screen.classList.toggle('reveal-dock', y > r.height - 8 || !!e.target.closest?.('.mac-dock-wrap'));
    if (!this.prefs.hotCorners) return;
    const corner = x < 3 && y > r.height - 3 ? 'bl' : x > r.width - 3 && y > r.height - 3 ? 'br' : null;
    if (corner && !this.cornerArmed) {
      this.cornerArmed = true;
      if (corner === 'bl') this.missionControl(); else this.launchpad();
      setTimeout(() => { this.cornerArmed = false; }, 1200);
    }
  }

  // ================================================================== keys
  onKey(e) {
    if (this.state !== 'desktop') {
      if (e.key === 'Escape' && this.state === 'sleep') this.lock();
      return;
    }
    const k = e.key;
    if (this.menuOpen && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(k)) { this.menuKey(e); return; }
    if (k === 'Escape') {
      if (this.shots.busy) { this.shots.cancel(); e.preventDefault(); return; }
      if (this.overlay && this.overlay.kind !== 'switch') { this.closeOverlay(); e.preventDefault(); return; }
      if (this.assistant.open) { this.assistant.toggle(false); e.preventDefault(); return; }
      if (this.active?.fs) { this.active.toggleFullscreen(); e.preventDefault(); return; }
    }
    const typing = e.target.closest?.('input, textarea, [contenteditable]');
    if (e.ctrlKey && (k === ' ' || e.code === 'Space')) { e.preventDefault(); this.spotlight(); return; }
    if ((e.ctrlKey && k === 'ArrowUp') || k === 'F3') { e.preventDefault(); this.missionControl(); return; }
    if (e.ctrlKey && (k === 'ArrowLeft' || k === 'ArrowRight') && !typing) {
      e.preventDefault();
      this.closeOverlay();
      this.switchSpace(this.spaces.indexOf(this.spaceId) + (k === 'ArrowRight' ? 1 : -1));
      return;
    }
    if (e.ctrlKey && !e.shiftKey && /^[1-9]$/.test(k)) { e.preventDefault(); this.switchSpace(+k - 1); return; }
    if (k === 'F4') { e.preventDefault(); this.launchpad(); return; }
    if (k === 'F1' || k === 'F2') { e.preventDefault(); this.setPref('brightness', Math.max(0.35, Math.min(1, this.prefs.brightness + (k === 'F2' ? 0.08 : -0.08)))); return; }
    if (k === 'F10' || k === 'F11' || k === 'F12') { e.preventDefault(); this.setPref('volume', k === 'F10' ? 0 : Math.max(0, Math.min(1, this.prefs.volume + (k === 'F12' ? 0.1 : -0.1)))); return; }
    if (e.altKey && k === 'Tab') { e.preventDefault(); this.switcher(e.shiftKey ? -1 : 1); return; }
    if (e.ctrlKey && e.shiftKey && (e.code === 'Digit3' || k === '3' || k === '#')) { e.preventDefault(); this.shots.full(); return; }
    if (e.ctrlKey && e.shiftKey && (e.code === 'Digit4' || k === '4' || k === '$')) { e.preventDefault(); this.shots.area(); return; }
    if (e.ctrlKey && e.shiftKey && (e.code === 'Digit5' || k === '5' || k === '%')) { e.preventDefault(); this.shots.toolbar(); return; }
    if (e.ctrlKey && e.metaKey && k.toLowerCase() === 'f') { e.preventDefault(); this.active?.toggleFullscreen(); return; }
    if (e.ctrlKey && e.metaKey && k.toLowerCase() === 'q') { e.preventDefault(); this.lock(); return; }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      const w = this.active;
      const map = { w: () => w?.close(), q: () => this.currentApp().id !== 'finder' && this.quit(this.currentApp().id), n: () => this.launch(this.currentApp().id, { newWindow: true }), m: () => w?.minimize(), ',': () => this.launch('settings') };
      if (map[k.toLowerCase()]) { e.preventDefault(); map[k.toLowerCase()](); return; }
    }
    if (!typing && !this.active) { this.desktopKey(e); return; }
    if (this.active?.onKey && !typing) this.active.onKey(e);
  }

  desktopKey(e) {
    const sel = [...this.desktop.querySelectorAll('.desk-icon.sel')].map((x) => x.dataset.path).filter((p) => p !== '/');
    const k = e.key.toLowerCase();
    if (e.metaKey && k === 'a') { e.preventDefault(); this.desktop.querySelectorAll('.desk-icon').forEach((x) => x.classList.add('sel')); }
    else if (e.metaKey && (k === 'c' || k === 'x') && sel.length) { e.preventDefault(); this.copyFiles(sel, k === 'x'); }
    else if (e.metaKey && k === 'v' && this.clipboard) { e.preventDefault(); this.pasteFiles(`${HOME}/Desktop`); }
    else if (k === ' ' && sel.length === 1) { e.preventDefault(); this.quickLook(sel[0]); }
    else if (k === 'backspace' && e.metaKey && sel.length) { e.preventDefault(); sel.forEach((p) => this.vfs.trash(p)); this.audio.trash(); }
    else if (k === 'enter' && sel.length === 1) { e.preventDefault(); this.rename(sel[0]); }
  }

  tick() {
    // the app switcher commits when Alt is released
    if (this.overlay?.kind === 'switch' && !altHeld) {
      const id = this.overlay.ids[this.overlay.idx];
      this.closeOverlay();
      this.windows.filter((w) => w.app.id === id).forEach((w) => w.restore());
    }
  }
}

// track Alt for the app switcher
let altHeld = false;
window.addEventListener('keydown', (e) => { if (e.key === 'Alt') altHeld = true; }, true);
window.addEventListener('keyup', (e) => { if (e.key === 'Alt') altHeld = false; }, true);
window.addEventListener('blur', () => { altHeld = false; });

function spotlightMaths(q) {
  const words = q.replace(/\b(pi|sqrt|sin|cos|tan|log|abs|round|floor|ceil)\b/gi, '');
  if (!/\d/.test(q) || /[a-zA-Z]/.test(words) || !/^[\d\s+\-*/().%^×÷,a-zA-Z]*$/.test(q) || !/[+\-*/^×÷(]/.test(q)) return null;
  const expr = q.replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/\bpi\b/gi, 'Math.PI').replace(/\b(sqrt|sin|cos|tan|log|abs|round|floor|ceil)\(/gi, (m, f) => `Math.${f.toLowerCase()}(`);
  try {
    const val = Function(`"use strict";return (${expr})`)();
    return Number.isFinite(val) ? `${q} = ${+val.toPrecision(12)}` : null;
  } catch { return null; }
}

const UNITS = {
  km: ['length', 1000], m: ['length', 1], cm: ['length', 0.01], mm: ['length', 0.001], mi: ['length', 1609.344], miles: ['length', 1609.344], mile: ['length', 1609.344], ft: ['length', 0.3048], feet: ['length', 0.3048], in: ['length', 0.0254], inches: ['length', 0.0254],
  kg: ['mass', 1], g: ['mass', 0.001], lb: ['mass', 0.45359237], lbs: ['mass', 0.45359237], oz: ['mass', 0.0283495],
  l: ['vol', 1], ml: ['vol', 0.001], gal: ['vol', 3.78541], cups: ['vol', 0.236588],
  usd: ['money', 1], eur: ['money', 1.08], gbp: ['money', 1.27], jpy: ['money', 0.0067], btc: ['money', 64000], coffees: ['money', 4.5],
  gb: ['data', 1e9], tb: ['data', 1e12], pb: ['data', 1e15], mb: ['data', 1e6],
};
function convert(q) {
  const m = q.toLowerCase().match(/^([\d.,]+)\s*(°?[a-z]+)\s+(?:in|to|as)\s+(°?[a-z]+)$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const a = m[2].replace('°', ''), b = m[3].replace('°', '');
  const toC = { c: (v) => v, f: (v) => (v - 32) * 5 / 9, k: (v) => v - 273.15 };
  const fromC = { c: (v) => v, f: (v) => v * 9 / 5 + 32, k: (v) => v + 273.15 };
  if (toC[a] && fromC[b]) return `${n}°${a.toUpperCase()} = ${+fromC[b](toC[a](n)).toFixed(2)}°${b.toUpperCase()}`;
  if (!UNITS[a] || !UNITS[b] || UNITS[a][0] !== UNITS[b][0]) return null;
  return `${n} ${a} = ${+((n * UNITS[a][1]) / UNITS[b][1]).toPrecision(6)} ${b}`;
}

function robotAvatar() {
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="av" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd8ff"/><stop offset="1" stop-color="#4a8fe0"/></linearGradient></defs>
    <circle cx="50" cy="50" r="50" fill="url(#av)"/><ellipse cx="50" cy="52" rx="30" ry="28" fill="#f4f6fa"/>
    <rect x="28" y="44" width="44" height="18" rx="9" fill="#05070a"/><circle cx="40" cy="53" r="4" fill="#49e3ff"/><circle cx="60" cy="53" r="4" fill="#49e3ff"/>
    <rect x="17" y="45" width="6" height="16" rx="3" fill="#e3e7ee"/><rect x="77" y="45" width="6" height="16" rx="3" fill="#e3e7ee"/></svg>`;
}
export { robotAvatar };
