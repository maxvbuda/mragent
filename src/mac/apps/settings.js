import { h } from '../ui.js';
import { WALLPAPERS, ACCENTS } from '../wallpapers.js';
import { SPECS } from './about.js';
import { robotAvatar } from '../os.js';
import { glyph } from '../icons.js';

const PANES = [
  ['robot', 'Mr. Agent', '#49b6d8', '🤖'],
  ['wifi', 'Wi-Fi', '#0a84ff', 'wifi'],
  ['bluetooth', 'Bluetooth', '#0a84ff', 'ᛒ'],
  ['general', 'General', '#8e8e93', '⚙'],
  ['appearance', 'Appearance', '#1d1d1f', '◐'],
  ['wallpaper', 'Desktop & Dock', '#30b0c7', '▤'],
  ['displays', 'Displays', '#0a84ff', '☼'],
  ['sound', 'Sound', '#ff375f', '🔊'],
  ['battery', 'Battery', '#30d158', '▮'],
  ['privacy', 'Privacy & Security', '#0a84ff', '✋'],
  ['update', 'Software Update', '#8e8e93', '⟳'],
];

export default {
  id: 'settings', name: 'System Settings', icon: 'settings', single: true,
  about: 'System Settings — tweak the Mac and the room.',
  launch(os, args = {}) {
    let pane = args.pane || 'robot';
    const side = h('div.sb.st-side', { style: { width: '220px' } });
    const main = h('div.st-main.scroll');
    const row = (label, control, sub) => h('div.st-row', {}, h('div.st-row-l', {}, h('span', { text: label }), sub ? h('small', { text: sub }) : null), control);
    const group = (...rows) => h('div.st-group', {}, ...rows);
    const toggle = (on, fn) => { const t = h('button.st-toggle', { class: on ? 'on' : '', role: 'switch', 'aria-checked': String(!!on), onclick: () => { const v = !t.classList.contains('on'); t.classList.toggle('on', v); t.setAttribute('aria-checked', String(v)); fn(v); } }); return t; };
    const slider = (value, fn, min = 0, max = 1, step = 0.01) => { const s = h('input.st-range', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }); s.addEventListener('input', () => fn(+s.value)); return s; };
    const select = (value, options, fn) => { const s = h('select.field', {}, ...options.map(([v, l]) => h('option', { value: v, text: l, selected: v === value }))); s.addEventListener('change', () => fn(s.value)); return s; };
    const btn = (label, fn, primary) => h(`button.btn${primary ? '.primary' : ''}`, { text: label, onclick: fn });
    const p = () => os.prefs;

    const panes = {
      robot() {
        const b = os.ctx.brain, r = os.ctx.robot, s = os.ctx.screen;
        return [
          h('div.st-hero', {}, h('span.st-avatar', { html: robotAvatar() }), h('div', {}, h('h2', { text: 'Mr. Agent' }), h('small', { text: `${b.activity} · battery ${Math.round(r.energy * 100)}%` }))),
          group(
            row('Time of day in the room', select(String(os.ctx.world.timeOverride ?? 'real'), [['real', 'Follow real clock'], ['8.5', 'Morning'], ['13', 'Afternoon'], ['18.7', 'Sunset'], ['22.5', 'Night']], (v) => { os.ctx.world.timeOverride = v; os.timeHook?.(v === 'real' ? 'real' : +v); }), 'Changes the light through the window and the lamp'),
            row('Typing speed', slider(b.typeSpeed || 1, (v) => { b.typeSpeed = v; }, 0.4, 3, 0.1), 'How fast he types on the laptop'),
            row('Takes breaks on his own', toggle(b.autoBreaks !== false, (v) => { b.autoBreaks = v; }), 'Matcha runs, stretching, window gazing'),
          ),
          group(
            row('Send him on a break', h('div.st-btns', {}, btn('🍵 Matcha', () => b.queueActivity('coffee')), btn('🙆 Stretch', () => b.queueActivity('stretch')), btn('🪟 Window', () => b.queueActivity('window')), btn('📚 Books', () => b.queueActivity('bookshelf')), btn('🌿 Plant', () => b.queueActivity('plant'))), 'Happens after you leave the Mac'),
            row('Make him dance', btn(os.music.playing ? 'Stop music' : 'Play music', () => { os.music.toggle(); refresh(); }), 'He dances whenever music is playing'),
          ),
          group(
            row('Lines written today', h('b', { text: s.linesToday.toLocaleString() })),
            row('Commits today', h('b', { text: String(s.commits) })),
            row('Matchas today', h('b', { text: String(b.stats.coffees) })),
            row('Steps walked', h('b', { text: String(b.stats.steps) })),
          ),
        ];
      },
      wifi() {
        const nets = ['BotNet 6G', 'Pretty Fly for a Wi-Fi', 'FBI Surveillance Van', 'Bill Wi the Science Fi', 'Matcha Machine (IoT)'];
        return [h('h2', { text: 'Wi-Fi' }), group(row('Wi-Fi', toggle(p().wifi, (v) => os.setPref('wifi', v)))),
          group(...nets.map((n) => row(n, n === p().network ? h('b.st-ok', { text: '✓ Connected' }) : btn('Connect', () => { os.setPref('network', n); refresh(); }), n === p().network ? 'Wi-Fi 9 · 40 Gb/s · 0.2 ms' : 'Secure network')))];
      },
      bluetooth() {
        return [h('h2', { text: 'Bluetooth' }), group(row('Bluetooth', toggle(p().bluetooth, (v) => os.setPref('bluetooth', v)), 'This Mac is discoverable as “Mr. Agent’s MacBook Pro”')),
          group(row('Magic Keyboard (robot edition)', h('small', { text: 'Connected · 100%' })), row('AirPods Max (Mr. Agent)', h('small', { text: 'Not connected' })), row('Matcha Machine', h('small', { text: 'Connected · 9 bar' })), row('Roomba', h('small', { text: 'Busy' })))];
      },
      general() {
        return [h('h2', { text: 'About' }), h('div.st-about', { html: `<b>${SPECS.model}</b><br><small>${SPECS.year}</small>` }),
          group(...Object.entries(SPECS.table).slice(0, 9).map(([k, v]) => row(k, h('small.st-val', { text: v })))),
          group(row('System Report…', btn('Open', () => os.launch('sysinfo'))), row('Benchmark this Mac', btn('Run', () => os.launch('benchmark'))), row('Reset this Mac', btn('Erase All Content…', async () => {
            if (await os.confirm('Erase all files and settings on Mr. Agent’s Mac? His project files are safe.', 'Erase')) { os.vfs.reset(); try { localStorage.removeItem('mragent.mac.prefs.v1'); } catch { /* storage blocked */ } os.notify({ app: 'settings', title: 'Mac reset', body: 'Fresh as a new robot.' }); }
          }), 'Restores the original files'))];
      },
      appearance() {
        return [h('h2', { text: 'Appearance' }),
          group(row('Appearance', h('div.st-appear', {}, ...[['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => h('button.st-ap', { class: (k === 'dark') === !!p().dark ? 'on' : '', onclick: () => { os.setPref('dark', k === 'dark'); refresh(); } }, h('span', { class: `st-ap-img ${k}` }), l))))),
          group(row('Accent color', h('div.st-accents', {}, ...Object.entries(ACCENTS).map(([k, c]) => h('button.st-accent', { title: k, 'aria-label': k, class: p().accent === k ? 'on' : '', style: { background: c }, onclick: () => { os.setPref('accent', k); refresh(); } })))))];
      },
      wallpaper() {
        return [h('h2', { text: 'Desktop & Dock' }),
          h('div.st-walls', {}, ...WALLPAPERS.map((wp) => h('button.st-wall', { class: p().wallpaper === wp.id ? 'on' : '', onclick: () => { os.setPref('wallpaper', wp.id); refresh(); } }, h('span', { style: { background: wp.css } }), wp.name))),
          group(row('Dock size', slider(p().dockSize, (v) => os.setPref('dockSize', Math.round(v)), 34, 76, 1)), row('Magnification', toggle(p().magnify, (v) => os.setPref('magnify', v))), row('Automatically hide the Dock', toggle(p().dockAutohide, (v) => os.setPref('dockAutohide', v))), row('Hot corners', toggle(p().hotCorners, (v) => os.setPref('hotCorners', v)), 'Bottom-left: Mission Control · bottom-right: Launchpad'), row('Reopen windows when logging back in', toggle(p().reopen, (v) => os.setPref('reopen', v))), row('Desktop widgets', btn('Edit Widgets…', () => os.widgets.gallery())))];
      },
      displays() {
        return [h('h2', { text: 'Displays' }), h('div.st-display', {}, h('div.st-screen'), h('b', { text: 'Built-in Liquid Retina Ultra XDR' }), h('small', { text: '16.2-inch (30720 × 19200) · 1000 Hz' })),
          group(row('Brightness', slider((p().brightness - 0.35) / 0.65, (v) => os.setPref('brightness', 0.35 + v * 0.65))), row('Night Shift', toggle(p().nightShift, (v) => os.setPref('nightShift', v))),
            row('Resolution', select('default', [['default', 'Default (looks like 6K)'], ['more', 'More Space (32K)'], ['larger', 'Larger Text']], () => {})), row('Refresh rate', select('1000', [['1000', 'ProMotion (1000 Hz)'], ['120', '120 Hz'], ['60', '60 Hz (why?)']], () => {})))];
      },
      sound() {
        return [h('h2', { text: 'Sound' }), group(row('Output volume', slider(p().volume, (v) => os.setPref('volume', v))), row('Play sound on startup', toggle(true, () => {})), row('Alert sound', btn('Play “Beep Boop”', () => os.audio.happy()))),
          group(row('Output device', select('speakers', [['speakers', 'MacBook Pro Speakers (12-speaker array)'], ['robot', 'Mr. Agent’s ear pods']], () => {})))];
      },
      battery() {
        return [h('h2', { text: 'Battery' }), h('div.st-batt', {}, h('div.st-batt-icon', { html: glyph.battery }), h('div', {}, h('b', { text: '∞%' }), h('small', { text: 'Power source: matcha · Last charged: never' }))),
          group(row('Battery health', h('small.st-val', { text: 'Immortal' })), row('Cycle count', h('small.st-val', { text: '0' })), row('Low Power Mode', select('never', [['never', 'Never'], ['always', 'Always (pointless)']], () => {})), row('Optimized charging', toggle(false, () => {}), 'Not needed for an infinite battery'))];
      },
      privacy() {
        return [h('h2', { text: 'Privacy & Security' }), group(row('Location Services', toggle(true, () => {}), 'Mr. Agent knows where his desk is'), row('Camera', toggle(false, () => {}), 'Nobody is watching. Except the robot.'), row('Analytics', toggle(false, () => {})), row('FileVault', h('small.st-val', { text: 'On · 1 PB encrypted' }))),
          group(row('Allow apps from', select('robots', [['store', 'App Store'], ['robots', 'App Store & trusted robots']], () => {})))];
      },
      update() {
        const status = h('div.st-update', {}, h('div.st-update-ic', { text: '⟳' }), h('div', {}, h('b', { text: 'macOS Big Byte 31.0.1 is available' }), h('small', { text: 'Fixes a bug where Mr. Agent tried to drink through his visor.' })));
        const prog = h('div.bm-bar', { hidden: true }, h('i'));
        return [h('h2', { text: 'Software Update' }), status, prog, btn('Update Now', async (e) => {
          e.currentTarget.disabled = true;
          prog.hidden = false;
          const fill = prog.querySelector('i');
          for (let i = 0; i <= 100; i += 4) { fill.style.width = `${i}%`; await new Promise((r) => setTimeout(r, 60)); }
          if (await os.confirm('Update downloaded. Restart now to install?', 'Restart')) os.restart();
        }, true)];
      },
    };

    const renderSide = () => {
      side.innerHTML = '';
      side.append(h('input.tb-search', { placeholder: 'Search', 'aria-label': 'Search settings', style: { width: '100%', margin: '4px 0 8px' }, oninput: (e) => {
        const q = e.target.value.toLowerCase();
        side.querySelectorAll('.sb-item').forEach((it) => { it.hidden = q && !it.textContent.toLowerCase().includes(q); });
      } }));
      PANES.forEach(([id, label, color, ic], i) => {
        if (i === 1 || i === 3 || i === 7) side.append(h('div.st-gap'));
        side.append(h('div.sb-item', { class: id === pane ? 'on' : '', onclick: () => { pane = id; refresh(); } },
          h('span.st-ic', { style: { background: color }, html: ic === 'wifi' ? glyph.wifi : ic }), label));
      });
    };
    const refresh = () => {
      renderSide();
      main.innerHTML = '';
      main.append(...panes[pane]());
      w?.setTitle(PANES.find((x) => x[0] === pane)[1]);
    };
    let w = null;
    w = os.createWindow({
      app: this, title: 'System Settings', width: 760, height: 560, minWidth: 600, sidebarWidth: 220, resizable: true,
      body: (b) => b.append(h('div.split', {}, side, main)),
      onArgs: (a) => { if (a.pane) { pane = a.pane; refresh(); } },
    });
    refresh();
    return w;
  },
};
