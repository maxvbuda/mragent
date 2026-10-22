import { h, drag } from '../mac/ui.js';
import { NAGS, drawBSOD, drawUpdate, drawBoot, drawLinux } from './pc.js';
import './win.css';

/**
 * Kuma's Windows 11 PC, as a (deliberately unflattering) simulator. It shares its
 * state machine with the little monitor in the room: when the PC decides to update
 * or blue-screen, it does it here too, in the middle of whatever you were doing.
 */
const tile = (bg, glyph, fg = '#fff') => ({ bg, glyph, fg });
const ICON = {
  edge: tile('conic-gradient(from 200deg, #0c59a4, #1fb5e9, #4dd88f, #0c59a4)', 'e'),
  explorer: tile('linear-gradient(#ffd666, #f2b318)', '📁'),
  store: tile('linear-gradient(#2b6ee8, #1847b8)', '🛍'),
  notepad: tile('linear-gradient(#a6d8ff, #4aa3f0)', '📝'),
  settings: tile('linear-gradient(#8a96a8, #5c6878)', '⚙️'),
  terminal: tile('linear-gradient(#2c2c2c, #0c0c0c)', '>_'),
  taskmgr: tile('linear-gradient(#4cc28b, #1f8f5f)', '📈'),
  control: tile('linear-gradient(#5aa6ff, #2a6fdc)', '🛠'),
  teams: tile('linear-gradient(#7b83eb, #4b53bc)', 'T'),
  copilot: tile('conic-gradient(from 90deg, #3b82f6, #a855f7, #ec4899, #f59e0b, #22c55e, #3b82f6)', '✦'),
  candy: tile('linear-gradient(#ff7ab8, #c2185b)', '🍬'),
  recycle: tile('linear-gradient(#cfe7ff, #8fb9e8)', '🗑'),
  pc: tile('linear-gradient(#cfe7ff, #8fb9e8)', '🖥'),
  word: tile('linear-gradient(#2b7cd3, #185abd)', 'W'),
  excel: tile('linear-gradient(#21a366, #107c41)', 'X'),
  solitaire: tile('linear-gradient(#1b5e20, #2e7d32)', '🂡'),
  xbox: tile('linear-gradient(#107c10, #0b5a0b)', '🎮'),
  spotify: tile('linear-gradient(#1db954, #128c3f)', '♫'),
  tiktok: tile('linear-gradient(#111, #333)', '♪'),
  clipchamp: tile('linear-gradient(#8a2be2, #5b1aa6)', '🎬'),
  widgets: tile('linear-gradient(#4cc2ff, #0078d4)', '☀️'),
  onedrive: tile('linear-gradient(#0f6cbd, #0a4a8a)', '☁️'),
  recall: tile('linear-gradient(135deg, #6b4cff, #c13cff)', '🧠'),
  paint: tile('linear-gradient(#ffb547, #f06292)', '🎨'),
  gethelp: tile('linear-gradient(#3aa0ff, #1565c0)', '?'),
  outlook: tile('linear-gradient(#1a8cff, #0058ad)', 'O'),
  calc: tile('linear-gradient(#5c5c66, #2c2c33)', '🧮'),
  photos: tile('linear-gradient(#ffd166, #ef476f)', '🖼'),
  printers: tile('linear-gradient(#a0a8b8, #5f6878)', '🖨'),
  regedit: tile('linear-gradient(#5aa9e6, #2b6cb0)', '🧩'),
  health: tile('linear-gradient(#36c2a6, #11806b)', '💙'),
  cleanup: tile('linear-gradient(#cfd8dc, #90a4ae)', '🧹'),
  security: tile('linear-gradient(#2d7dd2, #1b4f8a)', '🛡'),
};
const icon = (id, size = 32) => {
  const i = ICON[id] || ICON.notepad;
  return h('span.wi', { style: { width: `${size}px`, height: `${size}px`, background: i.bg, color: i.fg, fontSize: `${Math.round(size * 0.55)}px` } }, i.glyph);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const NEWS = [
  'Doctors hate him: man closes all 47 Edge tabs',
  'You won’t believe what this printer driver did next',
  '10 settings Windows changed back while you slept',
  'Local robot types 900 wpm, still waits for update',
  'Scientists confirm: “Restart now” is a suggestion',
  'This one weird trick makes File Explorer open (it doesn’t)',
  'Celebrities who still use Internet Explorer',
  'Is your PC slow? Here are 12 apps to make it slower',
];

export class WinOS {
  constructor(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    this.pc = ctx.pc;
    this.wins = [];
    this.z = 10;
    this.firstEdge = true;
    this.pausedWeeks = 0;
    this.notepadText = 'TODO for today:\n- ship the agent\n- do NOT let it update\n- find out why OneDrive owns my Desktop\n';
    this.candy = 0;
    this.build();
    this.keyHandler = (e) => {
      if (e.key === 'Escape' && !this.startOpen && !this.menu) { e.preventDefault(); this.close(); }
      else if (e.key === 'Escape') this.closeFlyouts();
      else if (e.key === 'Meta' || e.key === 'OS') { e.preventDefault(); this.toggleStart(); }
    };
    this.pc.on((e, data) => { if (this.isOpen && e === 'popup') this.toast(data); });
  }

  get isOpen() { return !this.el.hidden; }

  // ------------------------------------------------------------ chrome
  build() {
    this.el.className = 'win-root';
    this.device = h('div.win-device');
    this.screen = h('div.win-screen');
    this.desktop = h('div.win-desktop', { oncontextmenu: (e) => { e.preventDefault(); this.desktopMenu(e); }, onpointerdown: (e) => { if (e.target === this.desktop) this.closeFlyouts(); } });
    this.icons = [['pc', 'This PC', 'explorer:This PC'], ['recycle', 'Recycle Bin', 'recycle'], ['edge', 'Microsoft Edge', 'edge'], ['edge', 'Microsoft Edge (2)', 'edge'],
      ['candy', 'Candy Crush Saga', 'candy'], ['word', 'Get Office', 'store'], ['explorer', 'New folder (7)', 'explorer:New folder (7)'], ['onedrive', 'OneDrive', 'nag:1'], ['recall', 'Recall (preview)', 'recall']];
    this.edgeCount = 2;
    this.renderDesktop();
    this.watermark = h('div.win-watermark', {}, h('b', {}, 'Activate Windows'), h('span', {}, 'Go to Settings to activate Windows.'));
    this.layer = h('div.win-layer');
    this.toasts = h('div.win-toasts');
    this.taskbar = this.buildTaskbar();
    this.overlay = h('canvas.win-overlay', { hidden: true });
    this.leave = h('button.win-leave', { onclick: () => this.close(), title: 'Back to the living room (Esc)' }, '← Back to the room');
    this.screen.append(this.desktop, this.watermark, this.layer, this.toasts, this.taskbar, this.overlay);
    this.device.append(this.screen, this.leave);
    this.el.append(this.device);
  }

  renderDesktop() {
    this.desktop.querySelectorAll('.win-dicon').forEach((x) => x.remove());
    const run = (act) => { const [app, arg] = act.split(':'); if (app === 'nag') this.toast(NAGS[+arg]); else this.launch(app, arg); };
    this.icons.forEach(([ic, label, act], i) => {
      const d = h('button.win-dicon', {
        style: { top: `${12 + (i % 6) * 92}px`, left: `${10 + Math.floor(i / 6) * 90}px` },
        ondblclick: () => run(act),
        onclick: (e) => { this.desktop.querySelectorAll('.win-dicon').forEach((x) => x.classList.remove('sel')); e.currentTarget.classList.add('sel'); },
        oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); this.iconMenu(e, i); },
      }, icon(ic, 38), h('span', {}, label));
      this.desktop.append(d);
    });
  }

  iconMenu(e, i) {
    this.closeFlyouts();
    const [, label] = this.icons[i];
    const r = this.screen.getBoundingClientRect();
    const m = h('div.win-menu', { style: { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px` } });
    const item = (t, fn) => h('button', { onclick: () => { this.closeFlyouts(); fn(); } }, t);
    m.append(item('📂  Open', () => this.desktop.querySelectorAll('.win-dicon')[i].dispatchEvent(new MouseEvent('dblclick'))),
      item('🗑  Delete', () => this.deleteIcon(i)), item('✨  Ask Copilot about this file', () => this.toggleCopilot(true)),
      item('🔧  Properties', () => this.dialog(`${label} Properties`, `Type: Shortcut\nLocation: C:\\Users\\Kuma\\OneDrive\\Desktop\nSize: 2 KB (synced 41 times today)\nAttributes: ☑ Hidden from you ☑ Shared with Microsoft`, ['OK'])));
    this.screen.append(m);
    this.menu = m;
  }

  deleteIcon(i) {
    const [ic] = this.icons[i];
    if (ic === 'recycle') { this.dialog('Recycle Bin', 'The Recycle Bin can’t be moved to the Recycle Bin. Nice try, though.', ['OK']); return; }
    if (ic === 'pc') { this.dialog('This PC', 'You can’t delete This PC. It’s load-bearing.', ['OK']); return; }
    this.icons.splice(i, 1);
    this.renderDesktop();
    this.ctx.audio?.trash?.();
    if (ic === 'edge') {
      // it always comes back
      setTimeout(() => {
        this.edgeCount++;
        this.icons.push(['edge', `Microsoft Edge (${this.edgeCount})`, 'edge']);
        this.renderDesktop();
        this.toast({ app: 'Microsoft Edge', title: 'We put Microsoft Edge back', body: 'It looked like you lost your browser shortcut, so we restored it for easy access. You’re welcome.', yes: 'Thanks', no: 'Thanks anyway' });
      }, 3500);
    } else if (ic === 'candy') this.reinstall = ['candy', 'Candy Crush Saga', 'candy'];
    else if (ic === 'onedrive') setTimeout(() => this.toast({ app: 'OneDrive', title: 'Your files are still syncing', body: `Removing the OneDrive shortcut doesn’t remove OneDrive. Nothing removes OneDrive.`, yes: 'OK', no: 'Sigh' }), 1200);
  }

  buildTaskbar() {
    const tb = h('div.win-taskbar');
    const mid = h('div.win-tb-mid');
    this.startBtn = h('button.win-tb-btn.start', { title: 'Start', onclick: () => this.toggleStart() }, h('span.win-logo', {}, h('i'), h('i'), h('i'), h('i')));
    this.searchBox = h('button.win-tb-search', { onclick: () => this.toggleStart(true) }, '🔍', h('span', {}, 'Search'), h('em', {}, '🎃'));
    mid.append(this.startBtn, this.searchBox, h('button.win-tb-btn', { title: 'Task view', onclick: () => this.toast({ app: 'Task view', title: 'Desktops', body: 'You have 1 desktop. Would you like Microsoft to suggest more?', yes: 'Suggest', no: 'No' }) }, '❐'),
      h('button.win-tb-btn', { title: 'Copilot', onclick: () => this.toggleCopilot() }, icon('copilot', 22)));
    this.pins = ['explorer', 'edge', 'store', 'notepad', 'terminal', 'teams', 'settings'];
    this.pinEls = {};
    for (const id of this.pins) {
      const b = h('button.win-tb-btn.app', { title: APPS[id].name, onclick: () => this.taskbarClick(id) }, icon(id, 24), h('i.run'));
      this.pinEls[id] = b;
      mid.append(b);
    }
    this.extraPins = h('span.win-tb-extra');
    mid.append(this.extraPins);
    const left = h('button.win-tb-widgets', { onclick: () => this.toggleWidgets() }, h('span', {}, '⛅'), h('span', {}, h('b', {}, '14°C'), h('small', {}, 'Breaking news')));
    this.clock = h('div.win-clock', { onclick: () => this.toast({ app: 'Clock', title: 'Focus session?', body: 'Start a focus session. Windows will still interrupt you, but more quietly.', yes: 'Start', no: 'Dismiss' }) });
    const tray = h('div.win-tray', {}, h('button.win-tb-btn.tiny', { title: 'Show hidden icons', onclick: () => this.toast({ app: 'System tray', title: '47 hidden icons', body: 'Including 3 updaters that update the other updaters.', yes: 'Show all', no: 'Hide' }) }, '^'),
      h('span', { title: 'Windows Update' }, '🔄'), h('span', {}, '📶'), h('span', {}, '🔊'), h('span', {}, '🔋'), this.clock);
    tb.append(left, mid, tray);
    return tb;
  }

  taskbarClick(id) {
    const w = this.wins.find((x) => x.app === id);
    if (!w) return this.launch(id);
    if (w.min || this.top !== w) { w.min = false; w.el.hidden = false; this.focus(w); } else { w.min = true; w.el.hidden = true; }
  }

  // ------------------------------------------------------------ open / close
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
    this.pc.inUse = true;
    setTimeout(() => {
      this.device.classList.remove('anim');
      if (!this.greeted) {
        this.greeted = true;
        this.oobe();
      } else this.lockScreen();
    }, 650);
  }

  applyFrom(rect) {
    if (!rect) { this.device.style.opacity = '0'; return; }
    this.device.style.transformOrigin = '0 0';
    this.device.style.transform = `translate(${rect.left}px, ${rect.top}px) scale(${rect.width / innerWidth}, ${rect.height / innerHeight})`;
    this.device.style.opacity = '0.2';
  }

  close() {
    this.closeFlyouts();
    window.removeEventListener('keydown', this.keyHandler, true);
    this.pc.inUse = false;
    this.device.classList.add('anim');
    this.applyFrom(this.openRect);
    setTimeout(() => {
      this.device.classList.remove('anim');
      this.el.hidden = true;
      this.ctx.onExit();
    }, 520);
  }

  tick(dt) {
    if (!this.isOpen) return;
    const now = new Date();
    const txt = `${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n${now.toLocaleDateString()}`;
    if (this.clock.textContent !== txt.replace('\n', '')) { this.clock.innerHTML = ''; this.clock.append(h('span', {}, txt.split('\n')[0]), h('span', {}, txt.split('\n')[1])); }
    const st = this.pc.state;
    const ov = this.overlay;
    if (st === 'desktop') {
      if (!ov.hidden) {
        ov.hidden = true;
        this.ctx.audio?.winDing();
        if (this.reinstall) { this.icons.push(this.reinstall); this.reinstall = null; this.renderDesktop(); setTimeout(() => this.toast({ app: 'Microsoft Store', title: 'Candy Crush Saga is back', body: 'The update reinstalled some apps we think you’ll love.', yes: 'Play', no: 'Not again' }), 2500); }
        if (this.lostWork) { this.lostWork = false; setTimeout(() => this.toast({ app: 'Windows', title: 'We restarted your PC', body: 'Your apps were closed to install important updates. Unsaved work is now in a better place.', yes: 'OK', no: 'Why?' }), 600); }
      }
    }
    else {
      if (ov.hidden) { ov.hidden = false; this.closeFlyouts(); }
      if (st === 'boot' && this.wins.length) {
        // a reboot takes your unsaved work with it
        for (const w of this.wins.slice()) { w.closing = true; w.beforeClose = null; this.closeWin(w); }
        this.copilotEl?.remove(); this.copilotEl = null;
        this.lostWork = true;
      }
      const r = this.screen.getBoundingClientRect();
      if (ov.width !== Math.round(r.width)) { ov.width = Math.round(r.width); ov.height = Math.round(r.height); }
      const x = ov.getContext('2d');
      if (st === 'bsod') drawBSOD(x, ov.width, ov.height, this.pc);
      else if (st === 'update') drawUpdate(x, ov.width, ov.height, this.pc);
      else if (st === 'linux') drawLinux(x, ov.width, ov.height, this.pc);
      else drawBoot(x, ov.width, ov.height, this.pc);
    }
    for (const w of this.wins) w.tick?.(dt);
  }

  // ------------------------------------------------------------ notifications, dialogs
  toast(n) {
    this.ctx.audio?.winError();
    const t = h('div.win-toast', {}, h('div.win-toast-app', {}, n.app), h('b', {}, n.title), h('p', {}, n.body),
      h('div.win-toast-btns', {}, h('button.primary', { onclick: () => { dismiss(); this.nagYes(n); } }, n.yes), h('button', { onclick: () => dismiss() }, n.no)));
    const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 250); };
    this.toasts.append(t);
    setTimeout(dismiss, 9000);
  }

  nagYes(n) {
    if (/Edge|Bing/.test(n.app)) this.launch('edge');
    else if (/Copilot/.test(n.app)) this.toggleCopilot(true);
    else if (/Update/.test(n.app)) this.pc.forceUpdate();
    else if (/Store/.test(n.app)) this.launch('candy');
    else if (/365|Office/.test(n.app)) this.launch('store');
    else if (/Security|Defender/.test(n.app)) this.launch('security');
    else if (/Print/.test(n.app)) this.launch('printers');
    else if (/Recall/.test(n.app)) this.launch('recall');
    else if (/Health/.test(n.app)) this.launch('health');
    else if (/Outlook/.test(n.app)) this.launch('outlook');
    else if (/Xbox/.test(n.app)) this.launch('xbox');
    else if (/OneDrive/.test(n.app)) this.dialog('OneDrive', 'Backing up 24,812 files… Your OneDrive storage is full. Buy more storage?', ['Buy 100 GB', 'Close']);
  }

  dialog(title, text, buttons = ['OK'], onPick) {
    const shade = h('div.win-dialog-shade');
    const box = h('div.win-dialog', {}, h('div.win-dialog-title', {}, title), h('p', {}, text),
      h('div.win-dialog-btns', {}, buttons.map((b, i) => h(`button${i === 0 ? '.primary' : ''}`, { onclick: () => { shade.remove(); onPick?.(b, i); } }, b))));
    shade.append(box);
    this.screen.append(shade);
    this.ctx.audio?.winError();
  }

  async oobe() {
    const page = h('div.win-oobe', {}, h('div.win-oobe-card', {},
      h('h1', {}, 'Let’s finish setting up your device'),
      h('p', {}, 'Get the most out of Windows with Microsoft 365, OneDrive backup, Xbox Game Pass, Phone Link, Copilot+, Bing rewards and personalised ads.'),
      h('ul', {}, ['✓ Back up your files with OneDrive', '✓ Use Microsoft Edge (recommended)', '✓ Sign in with a Microsoft account', '✓ Let Copilot read your screen (it already does)'].map((x) => h('li', {}, x))),
      h('div.win-oobe-btns', {}, h('button.primary', { onclick: () => { page.remove(); this.toast(NAGS[1]); } }, 'Continue'), h('button.link', { onclick: () => { page.remove(); this.toast({ app: 'Windows', title: 'Got it!', body: 'We’ll remind you in 3 days. And 3 days after that.', yes: 'OK', no: 'OK' }); } }, 'Remind me in 3 days'))));
    this.screen.append(page);
  }

  lockScreen() {
    const now = new Date();
    const lock = h('div.win-lock', {},
      h('div.win-lock-time', {}, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      h('div.win-lock-date', {}, now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })),
      h('div.win-lock-spot', {}, '📍 Like what you see? ', h('b', {}, 'This photo was taken somewhere you can’t afford to go.')),
      h('div.win-lock-hint', {}, 'Click anywhere to sign in'));
    const signIn = () => {
      lock.innerHTML = '';
      const msg = h('p', {}, '');
      const pin = h('input', { type: 'password', placeholder: 'PIN', maxlength: 6, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') tryPin(); } });
      let tries = 0;
      const tryPin = () => {
        tries++;
        if (tries === 1) { msg.textContent = 'That PIN is incorrect. Try again.'; pin.value = ''; return; }
        if (tries === 2) { msg.textContent = 'Something happened and your PIN isn’t available. Click to set up your PIN again.'; pin.value = ''; return; }
        lock.classList.add('out');
        setTimeout(() => { lock.remove(); this.toast({ app: 'Windows', title: 'Welcome back, Kuma', body: 'While you were away, we restored your default browser to Microsoft Edge.', yes: 'Great', no: 'Undo' }); }, 400);
      };
      lock.append(h('div.win-lock-card', {}, h('i.win-lock-avatar', {}, 'K'), h('b', {}, 'Kuma'), pin, msg, h('button.link', { onclick: tryPin }, 'Sign-in options'), h('small', {}, 'Hint: it’s the third try that works.')));
      setTimeout(() => pin.focus(), 50);
    };
    lock.addEventListener('click', () => { if (!lock.querySelector('input')) signIn(); }, { once: false });
    this.screen.append(lock);
  }

  desktopMenu(e) {
    this.closeFlyouts();
    const r = this.screen.getBoundingClientRect();
    const m = h('div.win-menu', { style: { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px` } });
    const item = (label, fn) => h('button', { onclick: () => { this.closeFlyouts(); fn?.(); } }, label);
    m.append(item('🔄  Refresh', () => this.desktop.animate([{ opacity: 0.4 }, { opacity: 1 }], 300)), item('📁  New folder', () => this.toast({ app: 'File Explorer', title: 'New folder (8)', body: 'Created. Also synced to OneDrive. Also shared with nobody (yet).', yes: 'OK', no: 'Undo' })),
      item('🎨  Personalize', () => this.launch('settings', 'Personalization')), item('🧠  Recall this moment', () => this.launch('recall')), item('🖥  Display settings', () => this.launch('settings', 'System')),
      h('hr'), item('⋯  Show more options', () => this.legacyMenu(e)));
    this.screen.append(m);
    this.menu = m;
  }

  legacyMenu(e) {
    const r = this.screen.getBoundingClientRect();
    const m = h('div.win-menu.legacy', { style: { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px` } });
    ['View ▸', 'Sort by ▸', 'Refresh', '', 'Paste', 'Paste shortcut', 'Undo Delete    Ctrl+Z', '', 'NVIDIA Control Panel', 'Intel® Graphics Settings', 'Open in Terminal', 'Give access to ▸', 'Scan with Microsoft Defender', 'Send to ▸', '', 'New ▸', '', 'Display settings', 'Personalize']
      .forEach((l) => m.append(l ? h('button', { onclick: () => { this.closeFlyouts(); if (/Terminal/.test(l)) this.launch('terminal'); else if (/Personal|Display/.test(l)) this.launch('settings'); } }, l) : h('hr')));
    this.screen.append(m);
    this.menu = m;
  }

  closeFlyouts() {
    this.menu?.remove(); this.menu = null;
    this.startEl?.remove(); this.startEl = null; this.startOpen = false;
    this.widgetsEl?.remove(); this.widgetsEl = null;
  }

  // ------------------------------------------------------------ start menu
  toggleStart(focusSearch = false) {
    if (this.startOpen) { this.closeFlyouts(); return; }
    this.closeFlyouts();
    this.startOpen = true;
    const input = h('input', { placeholder: 'Search for apps, settings, and documents', oninput: () => render() });
    const pinned = ['edge', 'word', 'excel', 'store', 'explorer', 'settings', 'outlook', 'paint', 'photos', 'calc', 'solitaire', 'spotify', 'xbox', 'tiktok', 'notepad', 'terminal', 'candy', 'copilot'];
    let allApps = false;
    const body = h('div.win-start-body');
    const render = () => {
      body.innerHTML = '';
      const q = input.value.trim();
      if (q) {
        const hits = Object.entries(APPS).filter(([, a]) => a.name.toLowerCase().includes(q.toLowerCase()));
        body.append(h('div.win-start-h', {}, 'Best match'),
          ...hits.slice(0, 4).map(([id, a]) => h('button.win-start-row', { onclick: () => { this.closeFlyouts(); this.launch(id); } }, icon(id, 26), h('span', {}, a.name, h('small', {}, 'App')))),
          h('div.win-start-h', {}, 'Search the web'),
          h('button.win-start-row', { onclick: () => { this.closeFlyouts(); this.launch('edge', `bing:${q}`); } }, '🔍', h('span', {}, `${q} - See more search results`, h('small', {}, 'Opens in Microsoft Edge with Bing. Always.'))));
        return;
      }
      if (allApps) {
        const list = h('div.win-start-all');
        let letter = '';
        for (const [id, a] of Object.entries(APPS).sort((x, y) => x[1].name.localeCompare(y[1].name))) {
          const L = a.name[0].toUpperCase();
          if (L !== letter) { letter = L; list.append(h('div.win-start-letter', {}, L)); }
          list.append(h('button.win-start-row', { onclick: () => { this.closeFlyouts(); this.launch(id); } }, icon(id, 24), h('span', {}, a.name)));
        }
        body.append(h('div.win-start-h', {}, 'All apps', h('button.small', { onclick: () => { allApps = false; render(); } }, '‹ Back')), list);
        return;
      }
      const grid = h('div.win-start-grid');
      pinned.forEach((id) => grid.append(h('button.win-start-app', { onclick: () => { this.closeFlyouts(); this.launch(APPS[id] ? id : 'store', APPS[id] ? undefined : id); } }, icon(id, 34), h('span', {}, APPS[id]?.name || adName(id)))));
      body.append(h('div.win-start-h', {}, 'Pinned', h('button.small', { onclick: () => { allApps = true; render(); } }, 'All apps ›')), grid,
        h('div.win-start-h', {}, 'Recommended', h('button.small', {}, 'More ›')),
        h('div.win-start-rec', {},
          [['copilot', 'Get started', 'Welcome to Windows'], ['word', 'Try Microsoft 365', 'Promoted'], ['candy', 'Candy Crush Saga', 'Recently added (not by you)'], ['xbox', 'Xbox Game Pass', 'Promoted'], ['recall', 'Recall remembered 12,408 moments', 'Just now'], ['notepad', 'agent-notes.txt', '3m ago'], ['edge', 'Make Edge your default', 'Recommended by Microsoft']]
            .map(([ic, a, b]) => h('button.win-start-row', { onclick: () => { this.closeFlyouts(); if (ic === 'notepad') this.launch('notepad'); else if (ic === 'candy') this.launch('candy'); else if (ic === 'edge') this.launch('edge'); else this.launch('store', a); } }, icon(ic, 26), h('span', {}, a, h('small', {}, b))))));
    };
    render();
    const power = h('button.win-start-power', { title: 'Power', onclick: (e) => {
      e.stopPropagation();
      const m = h('div.win-power', {}, ['Sleep', 'Update and shut down', 'Update and restart'].map((l) => h('button', { onclick: () => { this.closeFlyouts(); if (l === 'Sleep') this.toast({ app: 'Power', title: 'Sleep failed', body: 'An app (Teams) is preventing sleep. It is also not running.', yes: 'OK', no: 'Close' }); else this.pc.forceUpdate(); } }, l)));
      this.startEl.append(m);
    } }, '⏻');
    this.startEl = h('div.win-start', {}, h('div.win-start-search', {}, '🔍', input), body,
      h('div.win-start-foot', {}, h('span.win-user', {}, h('i', {}, 'K'), h('span', {}, 'Kuma', h('small', {}, 'Sign in with a Microsoft account'))), power));
    this.screen.append(this.startEl);
    if (focusSearch) setTimeout(() => input.focus(), 30);
  }

  toggleWidgets() {
    if (this.widgetsEl) { this.closeFlyouts(); return; }
    this.closeFlyouts();
    this.widgetsEl = h('div.win-widgets', {}, h('div.win-w-weather', {}, h('b', {}, '14°C ⛅'), h('span', {}, 'Living room · Mostly cloudy'), h('small', {}, 'Weather brought to you by Microsoft Start')),
      h('div.win-w-news', {}, NEWS.map((t, i) => h('a', { onclick: () => { this.closeFlyouts(); this.launch('edge', `msn:${t}`); } }, h('i', { style: { background: `hsl(${i * 47} 60% 60%)` } }), h('span', {}, t, h('small', {}, `MSN · ${pick(['Sponsored', '2h', 'Promoted', '5h'])}`))))));
    this.screen.append(this.widgetsEl);
  }

  toggleCopilot(force) {
    if (this.copilotEl && !force) { this.copilotEl.remove(); this.copilotEl = null; return; }
    if (this.copilotEl) return;
    const log = h('div.win-cp-log', {}, h('div.bot', {}, 'Hi Kuma! I’m Copilot, your everyday AI companion. I can see you’re not using Microsoft Edge. Want to talk about it?'));
    const input = h('input', { placeholder: 'Message Copilot', onkeydown: (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const q = input.value.trim();
      input.value = '';
      log.append(h('div.me', {}, q));
      setTimeout(() => {
        const a = /chrome|firefox|browser/i.test(q) ? 'Have you considered Microsoft Edge? It’s built on the same engine as Chrome, but with more Microsoft.'
          : /update/i.test(q) ? 'Updates keep you safe! I’ve scheduled one for right now. 😊'
          : /linux|mac/i.test(q) ? 'I’m sorry, I can’t help with that. Can I interest you in Windows Subsystem for Linux?'
          : /bsod|blue|crash/i.test(q) ? 'Blue screens are a feature: they remind you to take a break. 💙'
          : pick(['Here’s what I found on Bing: [1] [2] [3]. I did not read them.', 'Great question! Let me open that in Microsoft Edge.', 'I can’t do that, but I can make an image of it.', 'Sure! First, sign in with your Microsoft account.']);
        log.append(h('div.bot', {}, a));
        log.scrollTop = 1e6;
        if (/Edge/.test(a) && Math.random() < 0.5) this.launch('edge');
        if (/right now/.test(a)) setTimeout(() => this.pc.forceUpdate(), 1200);
      }, 700);
    } });
    this.copilotEl = h('div.win-copilot', {}, h('div.win-cp-head', {}, icon('copilot', 22), h('b', {}, 'Copilot'), h('button', { onclick: () => this.toggleCopilot() }, '✕')), log, h('div.win-cp-input', {}, input));
    this.screen.append(this.copilotEl);
    setTimeout(() => input.focus(), 30);
  }

  // ------------------------------------------------------------ windows
  launch(app, arg) {
    const A = APPS[app];
    if (!A) return;
    if (A.single) {
      const w = this.wins.find((x) => x.app === app);
      if (w) { w.min = false; w.el.hidden = false; this.focus(w); A.arg?.(w, arg, this); return w; }
    }
    const n = this.wins.length;
    const sr = this.screen.getBoundingClientRect();
    const [ww, wh] = A.size || [760, 500];
    const w = { app, os: this, min: false, max: false };
    const body = h('div.win-body');
    const title = h('span.win-title-text', {}, A.name);
    const el = h('div.win-window', { style: { width: `${ww}px`, height: `${wh}px`, left: `${Math.max(10, (sr.width - ww) / 2 - 120 + n * 28)}px`, top: `${Math.max(10, (sr.height - wh) / 2 - 60 + n * 24)}px` }, onpointerdown: () => this.focus(w) },
      h('div.win-titlebar', { ondblclick: () => this.toggleMax(w), onpointerdown: (e) => this.dragWin(e, w) }, icon(app, 16), title,
        h('div.win-ctrl', {},
          h('button', { title: 'Minimize', onclick: () => { w.min = true; el.hidden = true; } }, '—'),
          h('button', { title: 'Maximize', onclick: () => this.toggleMax(w), onmouseenter: (e) => this.snapFlyout(e, w) }, '☐'),
          h('button.x', { title: 'Close', onclick: () => this.closeWin(w) }, '✕'))),
      body);
    Object.assign(w, { el, body, setTitle: (t) => { title.textContent = t; } });
    this.layer.append(el);
    this.wins.push(w);
    this.focus(w);
    A.open(w, arg, this);
    this.syncTaskbar();
    el.animate([{ opacity: 0, transform: 'scale(0.94) translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
    return w;
  }

  closeWin(w) {
    if (w.beforeClose && w.beforeClose() === false) return;
    w.el.remove();
    w.dispose?.();
    this.wins = this.wins.filter((x) => x !== w);
    this.syncTaskbar();
  }

  focus(w) {
    this.top = w;
    w.el.style.zIndex = ++this.z;
    this.wins.forEach((x) => x.el.classList.toggle('active', x === w));
  }

  toggleMax(w) {
    w.max = !w.max;
    w.el.classList.toggle('max', w.max);
  }

  snapFlyout(e, w) {
    if (this.snapEl) return;
    const zones = [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1], [0, 0, 0.66, 1], [0.66, 0, 0.34, 1], [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
    const f = h('div.win-snap', { onmouseleave: () => { f.remove(); this.snapEl = null; } }, zones.map(([x, y, ww, hh]) => h('button', {
      style: { left: `${x * 100}%`, top: `${y * 100}%`, width: `${ww * 100}%`, height: `${hh * 100}%` },
      onclick: () => {
        const sr = this.screen.getBoundingClientRect(), H = sr.height - 48;
        w.max = false; w.el.classList.remove('max');
        Object.assign(w.el.style, { left: `${x * sr.width}px`, top: `${y * H}px`, width: `${ww * sr.width}px`, height: `${hh * H}px` });
        f.remove(); this.snapEl = null;
      },
    })));
    const groups = h('div.win-snap-wrap', {}, f);
    w.el.querySelector('.win-ctrl').append(groups);
    this.snapEl = groups;
    setTimeout(() => { if (this.snapEl === groups && !groups.matches(':hover')) { groups.remove(); this.snapEl = null; } }, 2500);
  }

  dragWin(e, w) {
    if (e.target.closest('button') || w.max) return;
    const x0 = w.el.offsetLeft, y0 = w.el.offsetTop;
    drag(e, (dx, dy) => { w.el.style.left = `${x0 + dx}px`; w.el.style.top = `${Math.max(0, y0 + dy)}px`; });
  }

  syncTaskbar() {
    for (const id of this.pins) this.pinEls[id].classList.toggle('running', this.wins.some((w) => w.app === id));
    this.extraPins.innerHTML = '';
    const extra = [...new Set(this.wins.map((w) => w.app).filter((a) => !this.pins.includes(a)))];
    for (const id of extra) this.extraPins.append(h('button.win-tb-btn.app.running', { title: APPS[id].name, onclick: () => this.taskbarClick(id) }, icon(id, 24), h('i.run')));
  }
}

function adName(id) { return { word: 'Word', excel: 'Excel', solitaire: 'Solitaire', spotify: 'Spotify', xbox: 'Xbox', tiktok: 'TikTok', clipchamp: 'Clipchamp' }[id] || id; }

// =================================================================== apps
const APPS = {
  // ---------------------------------------------------------------- Notepad
  notepad: {
    name: 'Notepad', size: [620, 420],
    open(w, arg, os) {
      const ta = h('textarea.win-np', { spellcheck: false, oninput: () => { os.notepadText = ta.value; w.setTitle(`*Untitled - Notepad`); } });
      ta.value = os.notepadText;
      const bar = h('div.win-np-bar', {}, ['File', 'Edit', 'View'].map((m) => h('button', { onclick: () => {
        if (m === 'File') os.dialog('Notepad', 'Save to OneDrive? Your files will be safe in the cloud and also slightly harder to find.', ['Save to OneDrive', 'Save to OneDrive anyway'], () => { w.setTitle('agent-notes.txt - Notepad'); });
      } }, m)), h('button.cp', { onclick: () => {
        ta.value = `✨ Copilot rewrote this for you:\n\n${ta.value.split('\n').map((l) => (l.trim() ? `${l} — but in Microsoft Edge` : l)).join('\n')}\n\n(Sent from Microsoft Edge)`;
        os.notepadText = ta.value;
      } }, '✨ Rewrite'));
      const status = h('div.win-np-status', {}, h('span', {}, 'Ln 1, Col 1'), h('span', {}, '100%'), h('span', {}, 'Windows (CRLF)'), h('span', {}, 'UTF-8'));
      w.body.append(bar, ta, status);
      w.body.classList.add('col');
      setTimeout(() => ta.focus(), 50);
    },
  },

  // ---------------------------------------------------------------- File Explorer (slow on purpose)
  explorer: {
    name: 'File Explorer', size: [820, 520],
    open(w, arg, os) {
      w.body.classList.add('row');
      const FS = {
        Home: ['Desktop', 'Downloads', 'Documents', 'Pictures', 'OneDrive - Personal'],
        Desktop: ['New folder (7)', 'Microsoft Edge.lnk', 'Microsoft Edge (2).lnk', 'Candy Crush Saga.lnk'],
        Downloads: ['setup.exe', 'setup (1).exe', 'setup (2).exe', 'ChromeSetup.exe', 'drivers_final_FINAL.zip', 'KB5099999.msu'],
        Documents: ['agent', 'Untitled.txt', 'New Text Document (4).txt', 'desktop.ini'],
        Pictures: ['Screenshots', 'Camera Roll (empty)', 'Saved Pictures (also empty)'],
        'OneDrive - Personal': ['Desktop (moved here without asking)', 'Documents (also moved)', 'Personal Vault 🔒'],
        'New folder (7)': ['New folder', 'New folder (2)'],
        agent: ['Program.cs', 'agent.csproj', 'bin', 'obj', 'node_modules (2.3 GB)'],
      };
      const nav = h('div.win-ex-nav', {}, ['Home', 'Desktop', 'Downloads', 'Documents', 'Pictures', 'OneDrive - Personal', 'This PC'].map((p) => h('button', { onclick: () => go(p) }, p === 'This PC' ? '🖥 ' : p.startsWith('One') ? '☁️ ' : '📁 ', p)));
      const addr = h('div.win-ex-addr');
      const main = h('div.win-ex-main');
      w.body.append(nav, h('div.win-ex-right', {}, addr, main));
      let token = 0;
      const go = async (p) => {
        const my = ++token;
        addr.textContent = `› ${p}`;
        w.setTitle(p);
        main.innerHTML = '';
        // the famous green bar
        const bar = h('div.win-ex-loading', {}, h('span', {}, 'Working on it…'), h('i'));
        main.append(bar);
        await sleep(900 + Math.random() * 2200);
        if (my !== token) return;
        main.innerHTML = '';
        if (/Documents|Desktop|Home/.test(p)) main.append(h('div.win-ex-banner', {}, '☁️  Your files aren’t backed up. Start OneDrive backup to protect them.', h('button', { onclick: () => os.toast(NAGS[1]) }, 'Start backup')));
        if (p === 'This PC') {
          for (const [name, used, total] of [['Local Disk (C:)', 237.8, 238.4], ['DATA (D:)', 12, 931]]) {
            const pct = used / total;
            main.append(h('div.win-ex-drive', {}, '💽', h('div', {}, h('b', {}, name), h('div.bar', {}, h('i', { style: { width: `${pct * 100}%`, background: pct > 0.9 ? '#e81123' : '#26a0da' } })), h('small', {}, `${(total - used).toFixed(1)} GB free of ${total} GB`))));
          }
          return;
        }
        const items = FS[p] || ['This folder is empty. OneDrive probably has it.'];
        const grid = h('div.win-ex-grid');
        items.forEach((it) => grid.append(h('button.win-ex-item', { ondblclick: () => {
          if (FS[it]) go(it);
          else if (/Chrome/.test(it)) os.dialog('Microsoft Edge', 'Before you go… Microsoft Edge runs on the same technology as Chrome, with the added trust of Microsoft.', ['Keep using Edge', 'Install Chrome anyway'], (b) => { if (/Chrome/.test(b)) os.dialog('Windows protected your PC', 'Microsoft Defender SmartScreen prevented an unrecognised app from starting. The app is Google Chrome.', ['Don’t run', 'Don’t run (but bigger)']); });
          else if (/\.txt|\.cs/.test(it)) os.launch('notepad');
          else if (/setup/.test(it)) os.dialog('User Account Control', `Do you want to allow this app from an unknown publisher to make changes to your device?\n\n${it}`, ['Yes', 'No'], (b) => { if (b === 'Yes') os.dialog('Setup', 'This app can’t run on your PC. To find a version for your PC, check with the software publisher.', ['Close']); });
          else if (/\.msu/.test(it)) os.pc.forceUpdate();
          else os.dialog('File Explorer', `Windows can’t open “${it}”. Would you like to search the Microsoft Store for an app that can?`, ['Look in the Store', 'Cancel'], (b, i) => { if (i === 0) os.launch('store'); });
        } }, h('span.big', {}, FS[it] || /folder|Screenshots|Roll|Pictures|Desktop|Documents|agent|bin|obj|node_modules/.test(it) ? '📁' : /\.exe|\.msu/.test(it) ? '⚙️' : /\.lnk/.test(it) ? '🔗' : /\.zip/.test(it) ? '🗜' : '📄'), h('span', {}, it))));
        main.append(grid);
      };
      w.arg = (ww, a) => go(a || 'Home');
      go(arg || 'Home');
    },
    single: true,
    arg(w, a) { w.arg(w, a); },
  },

  // ---------------------------------------------------------------- Edge
  edge: {
    name: 'Microsoft Edge', size: [900, 560],
    open(w, arg, os) {
      w.body.classList.add('col');
      const url = h('input.win-edge-url', { value: 'https://www.bing.com', onkeydown: (e) => { if (e.key === 'Enter') nav(url.value); } });
      const tabs = h('div.win-edge-tabs', {}, h('span.tab.on', {}, '🔵 New tab'), h('span.tab', {}, '🔵 MSN'), h('span.tab', {}, '🔵 Bing Rewards'), h('span.tab', {}, '+'));
      const view = h('div.win-edge-view');
      w.body.append(tabs, h('div.win-edge-bar', {}, h('span', {}, '← → ⟳'), url, h('span', { title: 'Copilot', onclick: () => os.toggleCopilot(true) }, '✦'), h('span', {}, '⋯')), view);
      const page = (...kids) => { view.innerHTML = ''; view.append(...kids); };
      const home = () => page(h('div.win-bing', {}, h('div.win-bing-logo', {}, 'Microsoft Bing'),
        h('input', { placeholder: 'Ask me anything…', onkeydown: (e) => { if (e.key === 'Enter') nav(`bing:${e.target.value}`); } }),
        h('div.win-bing-news', {}, NEWS.slice(0, 6).map((t, i) => h('a', { onclick: () => nav(`msn:${t}`) }, h('i', { style: { background: `hsl(${i * 60 + 20} 55% 55%)` } }), h('span', {}, t)))),
        h('small', {}, '🏆 You have 12 Microsoft Rewards points. Redeem 6,500 more for a $5 gift card.')));
      const nav = (q) => {
        url.value = q;
        if (/chrome|firefox|brave|opera/i.test(q)) {
          page(h('div.win-edge-plea', {}, h('h2', {}, 'Microsoft Edge runs on the same technology as Chrome, with the added trust of Microsoft.'), h('p', {}, 'Are you sure you want to download a different browser? We’ve been together for 4 minutes.'), h('button', { onclick: home }, 'Browse securely now'), h('button.link', { onclick: () => os.dialog('Microsoft Edge', 'That’s a no then. We’ll ask again after the next update.', ['OK']) }, 'Download anyway')));
          return;
        }
        if (q.startsWith('msn:')) {
          const t = q.slice(4);
          page(h('div.win-article', {}, h('h2', {}, t), h('div.win-ad', {}, 'Advertisement'), h('p', {}, 'Continue reading after this short video. And this one. And this slideshow (1 of 47).'), h('div.win-ad.tall', {}, 'Advertisement'), h('p', {}, 'Recommended for you: ', NEWS.slice(3).join(' · '))));
          return;
        }
        const term = q.replace(/^bing:|^https?:\/\//, '');
        page(h('div.win-results', {}, h('div.win-cp-answer', {}, h('b', {}, '✦ Copilot'), h('p', {}, `Here’s what I know about “${term}”: it’s probably better in Microsoft Edge. Sources: [1] [2] [3]`)),
          ...[1, 2, 3, 4].map((i) => h('div.win-result', {}, h('small', {}, i === 1 ? 'Ad · www.microsoft.com' : `www.${term.split(' ')[0] || 'example'}${i}.com`), h('a', {}, `${term} — ${pick(['Official site', 'Top 10 tips', 'Download free (not malware)', 'Wikipedia'])}`), h('p', {}, 'Lorem ipsum results, lightly sponsored.')))));
      };
      if (os.firstEdge) {
        os.firstEdge = false;
        page(h('div.win-edge-welcome', {}, h('h1', {}, 'Welcome to Microsoft Edge'), h('p', {}, 'Bring over your passwords, favourites, history, cookies, open tabs, extensions and soul from Google Chrome.'),
          h('label', {}, h('input', { type: 'checkbox', checked: true, disabled: true }), ' Import browsing data on each launch (required)'),
          h('button.primary', { onclick: () => { home(); os.toast(NAGS[0]); } }, 'Confirm and start browsing'), h('button.link', { onclick: home }, 'Continue without this data (we’ll ask again)')));
      } else if (arg?.startsWith?.('bing:') || arg?.startsWith?.('msn:')) nav(arg);
      else home();
      w.beforeClose = () => {
        if (w.closing) return true;
        os.dialog('Microsoft Edge', 'Do you want to close all tabs? You have 3 tabs open, and one is MSN.', ['Close all', 'Cancel'], (b) => { if (b === 'Close all') { w.closing = true; os.closeWin(w); } });
        return false;
      };
    },
  },

  // ---------------------------------------------------------------- Settings
  settings: {
    name: 'Settings', size: [860, 560], single: true,
    open(w, arg, os) {
      w.body.classList.add('row');
      const sections = ['System', 'Bluetooth & devices', 'Network & internet', 'Personalization', 'Apps', 'Accounts', 'Time & language', 'Windows Update'];
      const nav = h('div.win-set-nav', {}, h('div.win-user', {}, h('i', {}, 'K'), h('span', {}, 'Kuma', h('small', {}, 'Local account (for now)'))),
        sections.map((s) => h('button', { onclick: () => go(s) }, s)));
      const main = h('div.win-set-main');
      w.body.append(nav, main);
      const card = (title, ...kids) => h('div.win-card', {}, h('b', {}, title), ...kids);
      const go = (s) => {
        nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === s));
        main.innerHTML = '';
        main.append(h('h2', {}, s));
        if (s === 'System') main.append(h('div.win-banner', {}, '⚠️ Your PC needs a Microsoft account to unlock all features (and some you didn’t ask for).', h('button', {}, 'Sign in')),
          card('Display', h('p', {}, 'Brightness, night light, HDR. Scale: 125% (recommended), 150% (also recommended).')), card('Storage', h('p', {}, 'Local Disk (C:) — 0.6 GB free. Storage Sense suggests deleting Downloads, then you.')),
          card('About', h('p', {}, 'Edition: Windows 11 Home N S KN Pro for Workstations (Not activated)')), h('p.win-link', { onclick: () => os.launch('control') }, 'Looking for Control Panel? It’s still here. Both of them are.'));
        else if (s === 'Personalization') main.append(h('div.win-banner.red', {}, 'You need to activate Windows before you can personalize your PC.', h('button', { onclick: () => os.dialog('Activation', 'We can’t activate Windows on this device. Error code: 0xC004F074. Buy Windows 11 Pro for $199.99?', ['Go to Store', 'Cancel'], (b, i) => { if (!i) os.launch('store'); }) }, 'Activate')),
          ...['Background', 'Colors', 'Themes', 'Lock screen', 'Start', 'Taskbar'].map((x) => h('div.win-card.disabled', {}, h('b', {}, x), h('p', {}, 'Some settings are managed by your organization. (You are the organization.)'))));
        else if (s === 'Apps') main.append(card('Default apps', h('p', {}, 'Choose a default web browser by setting it for each of 47 file types:'),
          h('div.win-types', {}, ['.htm', '.html', '.pdf', '.shtml', '.svg', '.webp', '.xht', '.xhtml', 'FTP', 'HTTP', 'HTTPS', 'MAILTO', 'MICROSOFT-EDGE'].map((t) => h('button', { onclick: (e) => os.dialog('Before you switch', `Microsoft Edge is the recommended browser for ${t}.`, ['Still use Microsoft Edge', 'Switch anyway'], (b) => { e.target.textContent = `${t}: ${b === 'Switch anyway' ? 'Chrome' : 'Edge'}`; if (t === 'MICROSOFT-EDGE') e.target.textContent = `${t}: Edge (can’t change)`; }) }, `${t}: Microsoft Edge`)))),
          card('Installed apps', h('p', {}, 'Candy Crush Saga · Clipchamp · Microsoft News · Solitaire & Casual Games · Spotify · TikTok · Xbox · Teams (classic) · Teams (new) · Teams (work or school)')));
        else if (s === 'Windows Update') {
          main.append(h('div.win-upd', {}, h('span.big', {}, '🔄'), h('div', {}, h('b', {}, 'Restart required'), h('p', {}, 'Your device will restart outside active hours. Active hours have been set to: never.'))),
            h('div.win-upd-btns', {}, h('button.primary', { onclick: () => os.pc.forceUpdate() }, 'Restart now'), h('button', { onclick: () => {
              os.pausedWeeks = Math.min(5, os.pausedWeeks + 1);
              os.dialog('Windows Update', os.pausedWeeks >= 5 ? 'You’ve reached the limit of pausing. Updates will install now.' : `Updates paused for ${os.pausedWeeks} week${os.pausedWeeks > 1 ? 's' : ''}. (They will install tonight anyway.)`, ['OK'], () => { if (os.pausedWeeks >= 5) os.pc.forceUpdate(); });
            } }, 'Pause for 1 week')),
            card('Pending', ...['2026-10 Cumulative Update for Windows 11 (KB5099999)', 'Update for Microsoft Edge (to make it more default)', 'Feature update: Copilot in Notepad, Paint, Calculator and Clock', 'Intel - System - 10.1.2.3 (the driver that worked)', 'Windows Malicious Software Removal Tool (v5.142)'].map((u) => h('p.win-pending', {}, '⬇️ ', u, h('small', {}, 'Pending restart')))),
            card('Update history', h('p', {}, `Crashes today: ${os.pc.crashes} · Updates today: ${os.pc.updates}`)));
        } else if (s === 'Accounts') main.append(h('div.win-banner', {}, 'Sign in with a Microsoft account to sync your settings, files, and opinions.', h('button', { onclick: () => os.dialog('Microsoft account', 'Enter your email. Or create one. Or use your phone. Or scan a QR code with your phone, which also needs a Microsoft account.', ['Next', 'Cancel']) }, 'Sign in instead')));
        else main.append(card(s, h('p', {}, 'This page is being redesigned. Some options moved to Control Panel. Some options in Control Panel moved here.')), h('p.win-link', { onclick: () => os.launch('control') }, 'Open Control Panel'));
      };
      w.arg = (ww, a) => go(sections.includes(a) ? a : 'System');
      go(sections.includes(arg) ? arg : 'System');
    },
    arg(w, a) { w.arg(w, a); },
  },

  // ---------------------------------------------------------------- Control Panel (the other settings app)
  control: {
    name: 'Control Panel', size: [720, 480],
    open(w, arg, os) {
      w.body.classList.add('legacy');
      const items = [['🛡', 'System and Security'], ['🌐', 'Network and Internet'], ['🖨', 'Hardware and Sound'], ['📦', 'Programs'], ['👤', 'User Accounts'], ['🎨', 'Appearance and Personalization'], ['🕒', 'Clock and Region'], ['♿', 'Ease of Access'], ['🖥', 'Device Manager']];
      w.body.append(h('div.win-cp7', {}, h('h3', {}, 'Adjust your computer’s settings'), h('div.win-cp7-grid', {}, items.map(([ic, t]) => h('button', { onclick: () => {
        if (t === 'Device Manager') {
          os.dialog('Device Manager', '⚠️ Unknown device\n⚠️ PCI Simple Communications Controller\n⚠️ Base System Device\n⚠️ Kuma (Robot) — This device cannot start. (Code 10)', ['Update driver', 'Close'], (b) => { if (b === 'Update driver') os.dialog('Update Drivers', 'The best drivers for your device are already installed. (They are not working.)', ['Close']); });
        } else {
          os.dialog('Control Panel', `“${t}” has moved to Settings. Some of it. The rest is still here, two clicks deeper.`, ['Open Settings', 'Stay in 2009'], (b) => { if (b === 'Open Settings') os.launch('settings', t.startsWith('Appearance') ? 'Personalization' : t.startsWith('Programs') ? 'Apps' : 'System'); });
        }
      } }, h('span.big', {}, ic), h('span', {}, t))))));
    },
  },

  // ---------------------------------------------------------------- Microsoft Store
  store: {
    name: 'Microsoft Store', size: [860, 540], single: true,
    open(w, arg, os) {
      w.body.classList.add('scroll');
      const apps = [['candy', 'Candy Crush Saga', 'Already installed. Several times.'], ['teams', 'Microsoft Teams (new)', 'Teams, now with 30% less Teams'], ['word', 'Microsoft 365', 'From $99.99/year'], ['tiktok', 'TikTok', 'Preinstalled for your convenience'],
        ['spotify', 'Spotify', 'Music'], ['xbox', 'Xbox', 'Game Pass Ultimate™'], ['clipchamp', 'Clipchamp', 'Video editor you didn’t install'], ['solitaire', 'Solitaire & Casual Games', 'Now with ads between cards']];
      const grid = h('div.win-store-grid');
      for (const [ic, name, sub] of apps) {
        const btn = h('button.primary', { onclick: async () => {
          if (ic === 'candy') { os.launch('candy'); return; }
          btn.disabled = true;
          for (const s of ['Pending…', 'Downloading 0%', 'Downloading 12%', 'Downloading 12%', 'Downloading 12%']) { btn.textContent = s; await sleep(700); }
          btn.textContent = 'Retry';
          btn.disabled = false;
          os.dialog('Microsoft Store', 'Something happened on our end. Code: 0x80070005. Try again later, or never.', ['Try again', 'Close']);
        } }, ic === 'word' ? 'Buy' : 'Get');
        grid.append(h('div.win-store-app', {}, icon(ic, 46), h('b', {}, name), h('small', {}, sub), h('span.stars', {}, '★★★★☆'), btn));
      }
      w.body.append(h('div.win-store-hero', {}, h('h2', {}, 'Windows 11 Pro'), h('p', {}, 'Upgrade now and finally be allowed to change your wallpaper.'), h('button.primary', { onclick: () => os.dialog('Microsoft Store', 'Sign in to buy. Sign-in requires a Microsoft account. Creating one requires Microsoft Edge.', ['OK']) }, '$199.99')), grid);
      if (arg) os.toast({ app: 'Microsoft Store', title: `${arg}`, body: 'Is available to install! It’s also pinned to Start, just in case.', yes: 'Get', no: 'Later' });
    },
    arg() {},
  },

  // ---------------------------------------------------------------- Terminal (cmd)
  terminal: {
    name: 'Command Prompt', size: [720, 440],
    open(w, arg, os) {
      w.body.classList.add('term');
      const out = h('div.win-term-out');
      const input = h('input.win-term-in', { spellcheck: false, onkeydown: (e) => { if (e.key === 'Enter') run(input.value); } });
      const line = h('div.win-term-line', {}, h('span', {}, 'C:\\Users\\Kuma>'), input);
      w.body.append(out, line);
      w.body.addEventListener('click', () => input.focus());
      const print = (t) => { out.append(h('div', {}, t)); w.body.scrollTop = 1e6; };
      print('Microsoft Windows [Version 10.0.26100.9999]\n(c) Microsoft Corporation. All rights reserved.\n\n');
      const run = async (cmd) => {
        input.value = '';
        print(`C:\\Users\\Kuma>${cmd}`);
        const c = cmd.trim().toLowerCase();
        if (!c) return;
        if (c === 'cls') out.innerHTML = '';
        else if (c === 'help') print('dir  cls  ver  echo  ipconfig  systeminfo  sfc /scannow  winget install <app>  tasklist  shutdown  wsl  exit');
        else if (c === 'ver') print('Microsoft Windows [Version 10.0.26100.9999] (not activated)');
        else if (c.startsWith('echo ')) print(cmd.slice(5));
        else if (c === 'dir') print(' Volume in drive C has no label. Mostly because it’s full.\n\n 10/20/2026  09:12 AM    <DIR>          OneDrive\n 10/20/2026  09:12 AM    <DIR>          Desktop (fake, see OneDrive)\n 10/20/2026  09:13 AM    <DIR>          agent\n               0 File(s)              0 bytes\n               3 Dir(s)      614,203,392 bytes free');
        else if (c === 'ipconfig') print('Windows IP Configuration\n\nEthernet adapter Ethernet:\n   Media State . . . . . . : Media disconnected (it’s plugged in)\nWireless LAN adapter Wi-Fi:\n   IPv4 Address. . . . . . : 192.168.1.42\n   Default Gateway . . . . : 192.168.1.1 (probably)');
        else if (c === 'systeminfo') print('Host Name:      KUMA-PC\nOS Name:        Microsoft Windows 11 Home\nOS Version:     10.0.26100 N/A Build 26100\nSystem Boot Time: 4 minutes ago (again)\nTotal Physical Memory: 32,768 MB\nAvailable Physical Memory: 212 MB (Edge has the rest)');
        else if (c === 'sfc /scannow') {
          print('Beginning system scan.  This process will take some time.');
          const p = h('div', {}, 'Verification 0% complete.');
          out.append(p);
          for (let i = 0; i <= 100; i += 7 + Math.floor(Math.random() * 15)) { p.textContent = `Verification ${Math.min(100, i)}% complete.`; await sleep(220); }
          p.textContent = 'Verification 100% complete.';
          print('Windows Resource Protection found corrupt files but was unable to fix some of them.\nFor online repairs, details are in the CBS log file located at\nwindir\\Logs\\CBS\\CBS.log (412 MB).');
        } else if (c.startsWith('winget install')) {
          const app = cmd.split(' ').slice(2).join(' ') || 'nothing';
          print(`Found Microsoft Edge [Microsoft.Edge] Version 142.0\nThis isn’t what you asked for (“${app}”), but it’s what we recommend.\nSuccessfully installed Microsoft Edge (again).`);
        } else if (c === 'tasklist') print('Image Name                     PID  Mem Usage\n========================= ======== ============\nmsedge.exe                    4120   812,004 K\nmsedge.exe (x36)               ...   ...\nMsMpEng.exe                   3312   402,112 K\nTeams.exe                     7000         0 K (still starting)\nSearchHost.exe                1024   198,664 K');
        else if (c.startsWith('shutdown')) { print('Windows needs to install updates before shutting down.'); setTimeout(() => os.pc.forceUpdate(), 900); }
        else if (c === 'wsl') { print('Installing: Windows Subsystem for Linux…'); await sleep(1400); print('The best part of Windows is now installed. A restart is required.'); }
        else if (c === 'exit') os.closeWin(w);
        else print(`'${cmd.split(' ')[0]}' is not recognized as an internal or external command,\noperable program or batch file. Did you mean: Microsoft Edge?`);
      };
      setTimeout(() => input.focus(), 50);
    },
  },

  // ---------------------------------------------------------------- Task Manager
  taskmgr: {
    name: 'Task Manager', size: [640, 460], single: true,
    open(w, arg, os) {
      w.body.classList.add('scroll');
      const procs = [['Antimalware Service Executable', 96, 402], ['Microsoft Edge (37)', 22, 4812], ['Microsoft Teams (not responding)', 0, 1203], ['Search Host', 8, 198], ['Copilot', 4, 640], ['OneDrive Sync', 12, 310], ['Widgets', 3, 220], ['Candy Crush Saga (background)', 6, 180], ['Windows Update Medic Service', 15, 90], ['Kuma (Robot)', 1, 12]];
      const table = h('table.win-tm');
      const cpu = h('b');
      const render = () => {
        table.innerHTML = '';
        table.append(h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'CPU'), h('th', {}, 'Memory'), h('th')));
        let tot = 0;
        for (const p of procs) {
          const c = Math.max(0, Math.min(99, p[1] + (Math.random() - 0.5) * 6));
          tot += c;
          table.append(h('tr', {}, h('td', {}, p[0]), h('td', { style: { background: `rgba(255,190,0,${c / 120})` } }, `${c.toFixed(1)}%`), h('td', {}, `${p[2]} MB`),
            h('td', {}, h('button', { onclick: () => { const name = p[0]; p[0] = `${name} (restarting)`; setTimeout(() => { p[0] = name; }, 1500); } }, 'End task'))));
        }
        cpu.textContent = `CPU ${Math.min(100, tot).toFixed(0)}%   ·   Memory 31.8 / 32 GB   ·   Disk 100%`;
      };
      w.body.append(h('div.win-tm-head', {}, cpu), table);
      render();
      let acc = 0;
      w.tick = (dt) => { acc += dt; if (acc > 1) { acc = 0; render(); } };
    },
  },

  // ---------------------------------------------------------------- Teams (never loads)
  teams: {
    name: 'Microsoft Teams', size: [720, 480],
    open(w, arg, os) {
      w.body.classList.add('center');
      const load = async () => {
        w.body.innerHTML = '';
        w.body.append(h('div.win-teams', {}, icon('teams', 64), h('div.win-dots', {}, h('i'), h('i'), h('i')), h('p', {}, pick(['Getting things ready…', 'Hang tight, we’re almost there…', 'Still loading. Grab a coffee. Actually, make it matcha.']))));
        await sleep(5500);
        if (!w.el.isConnected) return;
        w.body.innerHTML = '';
        w.body.append(h('div.win-teams', {}, h('h3', {}, 'We’re sorry — we’ve run into an issue.'), h('p', {}, 'Error code: CAA20002. Try clearing your cache, signing out, reinstalling, and switching to the other Teams.'), h('button.primary', { onclick: load }, 'Restart')));
      };
      load();
    },
  },

  // ---------------------------------------------------------------- Recycle Bin
  recycle: {
    name: 'Recycle Bin', size: [560, 380],
    open(w, arg, os) {
      w.body.classList.add('scroll');
      const items = ['Internet Explorer.lnk', 'Cortana', 'Clippy.exe', 'Windows Phone', 'Zune', 'my_hopes_and_dreams.txt'];
      const list = h('div.win-ex-grid');
      items.forEach((it) => list.append(h('button.win-ex-item', { ondblclick: () => os.dialog('Restore', /Clippy/.test(it) ? 'Clippy can’t be restored. He’s in a better place now.' : /Explorer/.test(it) ? 'Internet Explorer has been retired. It is now Microsoft Edge in IE mode, which is worse.' : `“${it}” can’t be restored: OneDrive already deleted the cloud copy.`, ['OK']) }, h('span.big', {}, '🗑'), h('span', {}, it))));
      w.body.append(h('div.win-ex-banner', {}, 'Items here are kept for 30 days. Then they’re moved to OneDrive. Then Copilot reads them.'), list);
    },
  },

  // ---------------------------------------------------------------- Candy Crush (a tiny match-pop)
  candy: {
    name: 'Candy Crush Saga', size: [440, 540],
    open(w, arg, os) {
      w.body.classList.add('candy');
      const N = 8, C = ['🍬', '🍭', '🍫', '🍩', '🍒'];
      let grid = Array.from({ length: N * N }, () => Math.floor(Math.random() * C.length));
      let moves = 15;
      const score = h('b');
      const board = h('div.win-candy-board');
      const flood = (i, c, seen) => {
        if (i < 0 || i >= N * N || seen.has(i) || grid[i] !== c) return;
        seen.add(i);
        const x = i % N;
        if (x > 0) flood(i - 1, c, seen);
        if (x < N - 1) flood(i + 1, c, seen);
        flood(i - N, c, seen); flood(i + N, c, seen);
      };
      const render = () => {
        board.innerHTML = '';
        score.textContent = `Score ${os.candy}  ·  Moves ${moves}`;
        grid.forEach((c, i) => board.append(h('button', { onclick: () => {
          if (moves <= 0) return;
          const seen = new Set();
          flood(i, c, seen);
          if (seen.size < 2) return;
          moves--;
          os.candy += seen.size * seen.size * 10;
          os.ctx.audio?.pop();
          for (const k of seen) grid[k] = -1;
          for (let x = 0; x < N; x++) {
            const col = [];
            for (let y = N - 1; y >= 0; y--) if (grid[y * N + x] >= 0) col.push(grid[y * N + x]);
            for (let y = N - 1, k = 0; y >= 0; y--, k++) grid[y * N + x] = k < col.length ? col[k] : Math.floor(Math.random() * C.length);
          }
          render();
          if (moves === 0) os.dialog('Out of moves!', 'Buy 5 more moves for 900 Gold Bars ($9.99)? Or watch a 30-second ad for Microsoft Edge.', ['Watch ad', 'Buy', 'Quit'], (b) => { if (b === 'Watch ad') { moves = 5; render(); os.launch('edge'); } });
        } }, C[c])));
      };
      w.body.append(h('div.win-candy-head', {}, '🍬 Candy Crush Saga', score), board, h('small', {}, 'Tap groups of 2+ matching candies. Sweet!'));
      render();
    },
  },

  // ---------------------------------------------------------------- Recall: it remembers everything
  recall: {
    name: 'Recall (preview)', size: [860, 540], single: true,
    open(w, arg, os) {
      w.body.classList.add('col');
      const snaps = [
        ['09:02', 'You typed your password into Notepad', '#fef3c7', '🔑 hunter2'], ['09:14', 'Bank of Robots — account overview', '#dcfce7', '💰 Balance: 3 bitcoin (spent on Game Pass)'],
        ['09:31', 'Searched “how to disable Recall”', '#e0e7ff', '🔍 Bing: 0 results'], ['10:05', 'Blue screen', '#0078d7', ':( 22% complete'],
        ['10:12', 'Searched “how to disable Recall” (again)', '#e0e7ff', '🔍 Did you mean: enable Recall?'], ['10:40', 'Chat with Mr. Agent', '#f1f5f9', '“I wish I had a Mac”'],
        ['11:03', 'Typed “I hate Windows”', '#fee2e2', '😠 Sentiment logged'], ['11:20', 'Candy Crush, level 1 (for 2 hours)', '#fce7f3', '🍬 Score 0'],
      ];
      const grid = h('div.win-recall-grid');
      const render = (q = '') => {
        grid.innerHTML = '';
        snaps.filter(([, t]) => t.toLowerCase().includes(q.toLowerCase())).forEach(([time, t, bg, inner]) => grid.append(h('button.win-recall-snap', {
          onclick: () => os.dialog('Recall', `${time} — ${t}\n\nThis snapshot is stored locally, encrypted, and definitely not visible to anyone except you and anyone who uses your PC.`, ['Cool', 'Delete snapshot'], (b) => { if (b !== 'Cool') os.dialog('Recall', 'Snapshot deleted. A new snapshot of you deleting it has been saved.', ['OK']); }),
        }, h('div.win-recall-img', { style: { background: bg, color: bg === '#0078d7' ? '#fff' : '#333' } }, inner), h('small', {}, time), h('span', {}, t))));
      };
      const search = h('input', { placeholder: 'Search your memories (we already did)', oninput: () => render(search.value), onkeydown: (e) => e.stopPropagation() });
      const toggle = h('button', { onclick: () => os.dialog('Recall', 'To stop saving snapshots, go to Settings › Privacy & security › Recall & snapshots › Advanced › More › Off. A restart is required. Snapshots resume after the next update.', ['Open Settings', 'Never mind'], (b) => { if (b === 'Open Settings') os.launch('settings', 'System'); }) }, '⏺ Saving snapshots: On');
      w.body.append(h('div.win-recall-head', {}, h('b', {}, '🧠 Recall'), search, toggle), h('div.win-recall-timeline', {}, h('i'), h('span', {}, `Today · ${12408 + Math.floor(Math.random() * 99)} snapshots · 28.6 GB`)), grid);
      render();
    },
  },

  // ---------------------------------------------------------------- Paint (now with AI you can't use)
  paint: {
    name: 'Paint', size: [760, 520],
    open(w, arg, os) {
      w.body.classList.add('col');
      const cv = h('canvas.win-paint-cv', { width: 720, height: 380 });
      const x = cv.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 720, 380);
      let color = '#1b1b1b', down = false;
      const at = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (720 / r.width), (e.clientY - r.top) * (380 / r.height)]; };
      cv.addEventListener('pointerdown', (e) => { down = true; x.beginPath(); x.moveTo(...at(e)); e.stopPropagation(); });
      cv.addEventListener('pointermove', (e) => { if (!down) return; x.lineTo(...at(e)); x.strokeStyle = color; x.lineWidth = 4; x.lineCap = 'round'; x.stroke(); });
      window.addEventListener('pointerup', () => { down = false; });
      const swatches = ['#1b1b1b', '#e81123', '#ff8c00', '#fff100', '#16c60c', '#0078d7', '#886ce4', '#ffffff'].map((c) => h('button.win-swatch', { style: { background: c }, onclick: () => { color = c; } }));
      const ai = (title, text) => () => os.dialog(title, text, ['Get Microsoft 365', 'Cancel'], (b, i) => { if (!i) os.launch('store'); });
      w.body.append(h('div.win-paint-bar', {}, ...swatches,
        h('button', { onclick: ai('Cocreator ✨', 'Describe what you want to create.\n\n…\n\nYou have 0 AI credits remaining. Credits refresh monthly with a Microsoft 365 Personal subscription ($99.99/year).') }, '✨ Cocreator'),
        h('button', { onclick: () => { x.fillStyle = 'rgba(200,200,200,0.5)'; for (let i = 0; i < 720; i += 20) for (let j = 0; j < 380; j += 20) if ((i + j) / 20 % 2) x.fillRect(i, j, 20, 20); os.toast({ app: 'Paint', title: 'Background removed', body: 'We removed the background. And the foreground. It was hard to tell them apart.', yes: 'Undo', no: 'Keep' }); } }, '🪄 Remove background'),
        h('button', { onclick: ai('Image Creator', 'Sign in with a Microsoft account to use Image Creator. Image Creator requires a Microsoft account, an internet connection and patience.') }, '🖼 Image Creator'),
        h('button', { onclick: () => { x.fillStyle = '#fff'; x.fillRect(0, 0, 720, 380); } }, 'Clear')), cv,
      h('div.win-np-status', {}, h('span', {}, '720 × 380px'), h('span', {}, 'Paint (now with layers, AI, and an account requirement)')));
    },
  },

  // ---------------------------------------------------------------- Get Help: the loop
  gethelp: {
    name: 'Get Help', size: [520, 520], single: true,
    open(w, arg, os) {
      w.body.classList.add('col');
      const log = h('div.win-cp-log');
      const bot = (t, opts = []) => {
        log.append(h('div.bot', {}, t, opts.length ? h('div.win-help-opts', {}, opts.map(([label, fn]) => h('button', { onclick: fn }, label))) : null));
        log.scrollTop = 1e6;
      };
      const loop = () => bot('Have you tried restarting your PC? Was this helpful?', [['Yes', () => bot('Great! We’re glad we could help. 🎉 Please rate us 5 stars.')], ['No', () => {
        bot('Sorry about that. Here are some articles that might help:', [['📄 How to restart your PC', loop], ['📄 Restarting your PC: an overview', loop], ['📄 Contact support', () => bot('Connecting you to an agent… Estimated wait: 3 hours. Meanwhile, have you tried restarting your PC?', [['Restart now', () => os.pc.forceUpdate()], ['Keep waiting', loop]])]]);
      }]]);
      const input = h('input', { placeholder: 'Describe your problem', onkeydown: (e) => {
        e.stopPropagation();
        if (e.key !== 'Enter' || !input.value.trim()) return;
        log.append(h('div.me', {}, input.value));
        input.value = '';
        setTimeout(loop, 600);
      } });
      w.body.append(log, h('div.win-cp-input', {}, input));
      bot('Hi, I’m your virtual support agent. In a few words, tell me what’s going on.');
    },
  },

  // ---------------------------------------------------------------- Outlook (new): ads in the inbox
  outlook: {
    name: 'Outlook (new)', size: [880, 540], single: true,
    open(w, arg, os) {
      w.body.classList.add('row');
      const mails = [
        { ad: true, from: 'Temu', sub: 'Kuma, your robot arm replacement is 98% off!!', body: 'Ad · This message is an advertisement. It looks exactly like an email so you click it.' },
        { from: 'Microsoft account team', sub: 'Unusual sign-in activity', body: 'We detected a sign-in from Windows Update Medic Service. If this was you, great. If this wasn’t you, it was also us.' },
        { from: 'OneDrive', sub: 'You’re running out of storage', body: 'Your OneDrive is 99.6% full (4.98 GB of 5 GB). Your Desktop, Documents and Pictures are syncing. To keep syncing, upgrade to Microsoft 365.' },
        { from: 'Microsoft Teams', sub: 'You missed a meeting: “Sync about the sync”', body: 'You were invited by: Teams. Attendees: nobody. Recording: unavailable (Teams didn’t load).' },
        { from: 'Mr. Agent', sub: 'Re: can I borrow your Mac?', body: 'No. But you can come over and look at it. I’ll make matcha. 🍵' },
        { from: 'Xbox', sub: 'We miss you, Kuma', body: 'It’s been 0 days since you last played. Come back! Game Pass Ultimate is just $19.99/month.' },
        { from: 'Windows Insider', sub: 'Welcome to the Canary channel', body: 'Thanks for volunteering! (You were volunteered.) Expect new features, missing features, and features that are missing new features.' },
      ];
      const list = h('div.win-ol-list');
      const read = h('div.win-ol-read', {}, h('p', {}, 'Select an item to read'));
      mails.forEach((m) => list.append(h(`button.win-ol-item${m.ad ? '.ad' : ''}`, { onclick: () => { read.innerHTML = ''; read.append(h('h3', {}, m.sub), h('small', {}, m.ad ? 'Ad · Sponsored' : `From: ${m.from}`), h('p', {}, m.body)); if (m.ad) os.launch('edge', 'bing:temu robot arm'); } }, h('b', {}, m.ad ? `Ad · ${m.from}` : m.from), h('span', {}, m.sub))));
      w.body.append(h('div.win-ol-nav', {}, h('div.win-ol-toggle', {}, 'New Outlook ', h('i.on'), h('small', {}, 'Can’t switch back')), ...['📥 Inbox (7)', '⭐ Focused', '📤 Sent', '🗑 Deleted', '📁 Archive', '🛒 Shopping (new!)'].map((t) => h('div.win-ol-folder', {}, t))),
        h('div.win-ol-main', {}, h('div.win-ex-banner', {}, 'Classic Outlook will stop working soon. Actually, it already did.'), list), read);
    },
  },

  // ---------------------------------------------------------------- Calculator (needs an update first)
  calc: {
    name: 'Calculator', size: [320, 470],
    open(w, arg, os) {
      w.body.classList.add('center');
      if (!os.calcUpdated) {
        w.body.append(h('div.win-teams', {}, h('h3', {}, 'This app needs an update'), h('p', {}, 'Calculator 11.2412.0 is required to add numbers. Download size: 412 MB.'), h('button.primary', { onclick: async (e) => {
          e.target.disabled = true;
          for (const t of ['Pending…', 'Downloading 3%', 'Downloading 3%', 'Installing…']) { e.target.textContent = t; await sleep(700); }
          os.calcUpdated = true; os.closeWin(w); os.launch('calc');
        } }, 'Update')));
        return;
      }
      let expr = '';
      const disp = h('div.win-calc-disp', {}, '0');
      const set = (v) => { expr = v; disp.textContent = expr || '0'; };
      const press = (k) => {
        if (k === 'C') return set('');
        if (k === '⌫') return set(expr.slice(0, -1));
        if (k === '=') {
          try {
            const v = Function(`"use strict";return (${expr.replace(/×/g, '*').replace(/÷/g, '/')})`)();
            set(String(Math.round(v * 1e10) / 1e10));
            if (Math.random() < 0.4) os.toast({ app: 'Copilot', title: 'Want me to explain this result?', body: `I can write a 900-word essay on why ${expr || 0} is what it is.`, yes: 'Explain', no: 'No thanks' });
          } catch { set('Error'); }
          return;
        }
        set(expr + k);
      };
      const keys = ['C', '⌫', '÷', '×', '7', '8', '9', '-', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'];
      w.body.classList.remove('center');
      w.body.classList.add('win-calc');
      w.body.append(disp, h('div.win-calc-keys', {}, keys.map((k) => h(`button${k === '=' ? '.eq' : ''}`, { onclick: () => press(k) }, k))));
    },
  },

  // ---------------------------------------------------------------- Photos
  photos: {
    name: 'Photos', size: [800, 520], single: true,
    open(w, arg, os) {
      w.body.classList.add('scroll');
      const mem = ['Blue screen #1', 'Blue screen #2', 'Working on updates 99%', 'Blue screen #3 (a classic)', '“Activate Windows”', 'Teams loading'];
      w.body.append(h('div.win-ex-banner', {}, '☁️ Back up your photos with OneDrive. You have 0 photos and 4.98 GB of them.', h('button', { onclick: () => os.toast(NAGS[1]) }, 'Back up')),
        h('h2.win-ph-h', {}, 'Memories · On this day'),
        h('div.win-ph-grid', {}, mem.map((t, i) => h('div.win-ph', { style: { background: /Blue/.test(t) ? '#0078d7' : /updates/.test(t) ? '#0a2a5c' : /Teams/.test(t) ? '#5b5fc7' : '#222' } }, h('b', {}, /Blue/.test(t) ? ':(' : /updates/.test(t) ? '⟳' : /Teams/.test(t) ? '…' : '⚠'), h('span', {}, t)))),
        h('p.win-ph-note', {}, 'Photos found 6 faces. 6 of them are error screens.'));
    },
  },

  // ---------------------------------------------------------------- Printers
  printers: {
    name: 'Print queue', size: [620, 420], single: true,
    open(w, arg, os) {
      w.body.classList.add('scroll');
      const docs = Array.from({ length: 47 }, (_, i) => [`${['Program.cs', 'Untitled.txt', 'Boarding pass (URGENT).pdf', 'test page'][i % 4]}`, i === 0 ? 'Error - Printing' : 'Paused']);
      const table = h('table.win-tm', {}, h('tr', {}, h('th', {}, 'Document'), h('th', {}, 'Status'), h('th', {}, 'Owner')), docs.map(([d, st]) => h('tr', {}, h('td', {}, d), h('td', { style: { color: /Error/.test(st) ? '#c42b1c' : '' } }, st), h('td', {}, 'Kuma'))));
      w.body.append(h('div.win-tm-head', {}, '🖨 HP DeskJet 2700 series — ', h('b', { style: { color: '#c42b1c' } }, 'Offline'), ' · 47 documents · Kuma doesn’t own a printer'),
        h('div.win-upd-btns', { style: { padding: '8px 12px', maxWidth: '420px' } },
          h('button', { onclick: (e) => { e.target.textContent = 'Deleting…'; setTimeout(() => { e.target.textContent = 'Deleting… (still)'; }, 2500); } }, 'Cancel all'),
          h('button', { onclick: () => os.dialog('Troubleshooter', 'Detecting problems… \n\nTroubleshooting couldn’t identify the problem. The problem might be the printer. Or the troubleshooter.', ['Close', 'Explore additional options']) }, 'Troubleshoot'),
          h('button', { onclick: () => os.dialog('HP Smart', 'To print, install HP Smart, create an HP account, and subscribe to HP Instant Ink. Your printer will now refuse non-HP ink.', ['Install', 'Cancel']) }, 'Print test page')),
        table);
    },
  },

  // ---------------------------------------------------------------- Registry Editor
  regedit: {
    name: 'Registry Editor', size: [760, 460],
    open(w, arg, os) {
      w.body.classList.add('row');
      const KEYS = {
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot': [['TurnOffWindowsCopilot', 'REG_DWORD', '0x00000001 (ignored since 24H2)']],
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Edge': [['IsDefaultBrowser', 'REG_DWORD', '0x00000001 (enforced)'], ['TimesUserSaidNo', 'REG_DWORD', '0x000003E7 (999)']],
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\WindowsUpdate': [['ActiveHoursStart', 'REG_SZ', 'never'], ['ActiveHoursEnd', 'REG_SZ', 'never'], ['RespectUser', 'REG_DWORD', '0x00000000']],
        'HKEY_CURRENT_USER\\Software\\Kuma': [['Sanity', 'REG_DWORD', '0x00000003 (decreasing)'], ['DreamOS', 'REG_SZ', 'macOS']],
        'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Recall': [['Enabled', 'REG_DWORD', '0x00000001'], ['CanBeDisabled', 'REG_DWORD', '0x00000000']],
      };
      const tree = h('div.win-reg-tree');
      const vals = h('div.win-reg-vals');
      const show = (k) => {
        vals.innerHTML = '';
        vals.append(h('div.win-ex-addr', {}, `Computer\\${k}`), h('table.win-tm', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Type'), h('th', {}, 'Data')),
          KEYS[k].map(([n, t, d]) => h('tr', { ondblclick: () => os.dialog('Error Editing Value', `Cannot edit ${n}: Error writing the value’s new contents.\n\nYou need permission from TrustedInstaller to make changes to this value.`, ['OK']) }, h('td', {}, `ab ${n}`), h('td', {}, t), h('td', {}, d)))));
      };
      Object.keys(KEYS).forEach((k) => tree.append(h('button', { onclick: () => show(k) }, `📁 ${k.split('\\').slice(-1)[0]}`, h('small', {}, k.split('\\')[0]))));
      w.body.append(tree, vals);
      show(Object.keys(KEYS)[0]);
      os.dialog('User Account Control', 'Do you want to allow this app to make changes to your device?\n\nRegistry Editor\nVerified publisher: Microsoft Windows\n\n(It won’t be allowed to make changes anyway.)', ['Yes', 'No']);
    },
  },

  // ---------------------------------------------------------------- PC Health Check
  health: {
    name: 'PC Health Check', size: [600, 470], single: true,
    open(w, arg, os) {
      w.body.classList.add('scroll');
      const out = h('div.win-health-out');
      w.body.append(h('div.win-health', {}, h('h2', {}, 'PC health at a glance'), h('div.win-card', {}, h('b', {}, 'Introducing Windows 11'), h('p', {}, 'Let’s check if this PC meets the system requirements.'), h('button.primary', { onclick: async (e) => {
        e.target.disabled = true; e.target.textContent = 'Checking…';
        await sleep(1800);
        e.target.textContent = 'Check again';
        e.target.disabled = false;
        out.innerHTML = '';
        out.append(h('div.win-banner.red', {}, 'This PC doesn’t currently meet Windows 11 system requirements.'), h('p', {}, '(It is currently running Windows 11.)'),
          ...[['❌', 'TPM 2.0 must be supported and enabled on this PC.', 'TPM: “Kuma Trusted Platform” (not trusted)'], ['❌', 'The processor isn’t currently supported for Windows 11.', 'Processor: Kuma Neural Core 9 (too new)'],
            ['⚠️', 'This PC must support Secure Boot.', 'Secure Boot: securely booting… 43 times today'], ['✅', 'There is at least 4 GB of system memory (RAM).', 'Edge is using all 32 GB of it']].map(([i, t, d]) => h('div.win-card', {}, h('b', {}, `${i} ${t}`), h('p', {}, d))));
      } }, 'Check now')), out, h('div.win-card', {}, h('b', {}, 'Storage capacity'), h('p', {}, '99% full. Windows.old (28.4 GB) is load-bearing.'), h('button', { onclick: () => os.launch('cleanup') }, 'Manage storage'))));
    },
  },

  // ---------------------------------------------------------------- Disk Cleanup
  cleanup: {
    name: 'Disk Cleanup', size: [440, 440],
    open(w, arg, os) {
      w.body.classList.add('legacy');
      const box = h('div.win-cp7');
      w.body.append(box);
      (async () => {
        const p = h('div.win-ex-drive', {}, '🧹', h('div', {}, h('b', {}, 'Disk Cleanup is calculating how much space you can free on (C:).'), h('div.bar', {}, h('i', { style: { width: '0%', background: '#06b025' } }))));
        box.append(p);
        for (let i = 0; i <= 100; i += 4) { p.querySelector('i').style.width = `${i}%`; await sleep(90 + (i > 80 ? 260 : 0)); if (!w.el.isConnected) return; }
        box.innerHTML = '';
        const items = [['Windows Update Cleanup', '0 bytes', true], ['Previous Windows installation(s)', '28.4 GB', false], ['Temporary Internet Files (Edge)', '0 bytes (Edge keeps them)', true], ['Delivery Optimization Files', '3.9 GB (shared with strangers)', false], ['Recycle Bin', '6 items (unrestorable)', true], ['Thumbnails', '12 KB', true]];
        box.append(h('p', {}, 'You can use Disk Cleanup to free up to 0 bytes of disk space on (C:).'),
          ...items.map(([n, sz, ok]) => h('label.win-dc-row', {}, h('input', { type: 'checkbox', checked: ok, disabled: !ok }), h('span', {}, n), h('small', {}, sz))),
          h('button.primary', { onclick: async (e) => { e.target.textContent = 'Cleaning…'; await sleep(2500); os.dialog('Disk Cleanup', 'Disk Cleanup freed 0 bytes. Windows also downloaded a 4.1 GB update while you waited.', ['OK']); e.target.textContent = 'OK'; } }, 'OK'));
      })();
    },
  },

  // ---------------------------------------------------------------- Windows Security
  security: {
    name: 'Windows Security', size: [680, 480], single: true,
    open(w, arg, os) {
      w.body.classList.add('scroll');
      const threat = h('div.win-card', {}, h('b', {}, '⚠️ Threat found: Trojan:Win32/RobotSentience.A'), h('p', {}, 'Affected item: C:\\Users\\Kuma\\OneDrive\\Documents\\agent\\Program.cs\nAlert level: Severe · Status: Quarantined'),
        h('div.win-upd-btns', {}, h('button', { onclick: () => {
          let n = 0;
          const ask = () => os.dialog('Allow on device?', ['Are you sure? This file contains code written by a robot.', 'Really sure? It mentions Linux in a comment.', 'Last chance. We’re just looking out for you.'][n], ['Allow', 'Cancel'], (b) => {
            if (b !== 'Allow') return;
            if (++n < 3) ask(); else os.dialog('Windows Security', 'Program.cs was restored. It has been quarantined again by a scheduled scan.', ['OK']);
          });
          ask();
        } }, 'Allow on device'), h('button', {}, 'Remove')));
      w.body.append(h('div.win-health', {}, h('h2', {}, '🛡 Security at a glance'),
        h('div.win-banner', {}, 'Your device is being protected. From you, mostly.'),
        threat,
        ...[['✅ Virus & threat protection', 'Last scan: 4 minutes ago (Antimalware Service Executable, 97% CPU)'], ['⚠️ Account protection', 'Sign in with a Microsoft account for better protection.'], ['✅ Firewall & network protection', 'Blocking: Chrome installer, Steam, the printer'], ['⚠️ Device security', 'Core isolation is off. Memory integrity is off. Kuma’s patience is off.']].map(([t, d]) => h('div.win-card', {}, h('b', {}, t), h('p', {}, d)))));
    },
  },

  // ---------------------------------------------------------------- Xbox
  xbox: {
    name: 'Xbox', size: [760, 480],
    open(w, arg, os) {
      w.body.classList.add('center');
      w.body.style.background = 'radial-gradient(circle at 50% 30%, #1f7a1f, #0b2e0b)';
      w.body.append(h('div.win-teams', { style: { color: '#fff' } }, h('h2', {}, '🎮 Xbox'), h('p', {}, 'Sign in to play. Signing in requires the Xbox app, the Xbox Identity Provider, the Gaming Services app, and an update to all three.'),
        h('button.primary', { onclick: () => os.dialog('Xbox', 'Gaming Services needs to be repaired. Error 0x80073D26. Try reinstalling it from the Microsoft Store (error 0x80070005).', ['Open Store', 'Cancel'], (b, i) => { if (!i) os.launch('store'); }) }, 'Sign in'),
        h('small', {}, 'Game Pass Ultimate: first month $1. Then $19.99. Then we raise it.')));
    },
  },

  copilot: { name: 'Copilot', open(w, arg, os) { os.closeWin(w); os.toggleCopilot(true); } },
};
