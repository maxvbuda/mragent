import { h } from '../ui.js';

const CITIES = [['Cupertino', 'America/Los_Angeles'], ['New York', 'America/New_York'], ['London', 'Europe/London'], ['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney'], ['Mars (Jezero)', null]];

export default {
  id: 'clock', name: 'Clock', icon: 'clock', single: true,
  about: 'Clock — world clock, alarms, stopwatch and timer.',
  launch(os) {
    let tab = 'World Clock';
    const main = h('div.ck-main.scroll');
    const tabs = h('div.ck-tabs');
    let sw = { t: 0, run: false, laps: [], last: 0 };
    let timer = { total: 300, left: 300, run: false, last: 0 };
    let lastSec = -1;
    let alarms = [{ t: '07:00', label: 'Wake up, servos', on: true }, { t: '09:30', label: 'Standup with the toaster', on: true }, { t: '15:00', label: 'Matcha 🍵', on: false }];
    const face = (date) => {
      const s = date.getSeconds(), m = date.getMinutes() + s / 60, hr = (date.getHours() % 12) + m / 60;
      const night = date.getHours() < 6 || date.getHours() >= 19;
      const hand = (a, len, w, c) => `<line x1="50" y1="50" x2="${50 + Math.sin(a) * len}" y2="${50 - Math.cos(a) * len}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
      return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="${night ? '#1c1c1e' : '#fff'}" stroke="${night ? '#3a3a3c' : '#d1d1d6'}"/>
        ${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<line x1="${50 + Math.sin(a) * 40}" y1="${50 - Math.cos(a) * 40}" x2="${50 + Math.sin(a) * 44}" y2="${50 - Math.cos(a) * 44}" stroke="${night ? '#fff' : '#111'}" stroke-width="2"/>`; }).join('')}
        ${hand((hr / 12) * Math.PI * 2, 24, 4, night ? '#fff' : '#111')}${hand((m / 60) * Math.PI * 2, 34, 3, night ? '#fff' : '#111')}${hand((s / 60) * Math.PI * 2, 38, 1.2, '#ff9f0a')}<circle cx="50" cy="50" r="2.5" fill="#ff9f0a"/></svg>`;
    };
    const cityDate = (tz) => {
      if (!tz) { const d = new Date(Date.now() * 1.0274912517 - 3e9); return d; } // a sol is a bit longer than a day
      return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    };
    const fmt = (ms) => { const t = Math.floor(ms / 10); return `${String(Math.floor(t / 6000)).padStart(2, '0')}:${String(Math.floor(t / 100) % 60).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}`; };
    const render = () => {
      tabs.innerHTML = '';
      for (const t of ['World Clock', 'Alarms', 'Stopwatch', 'Timer']) tabs.append(h('button', { class: t === tab ? 'on' : '', text: t, onclick: () => { tab = t; render(); } }));
      main.innerHTML = '';
      if (tab === 'World Clock') {
        main.append(h('div.ck-grid', {}, ...CITIES.map(([city, tz]) => {
          const d = cityDate(tz);
          const diff = tz ? Math.round((d - cityDate('America/Los_Angeles')) / 36e5) : null;
          return h('div.ck-city', {}, h('div.ck-face', { html: face(d) }), h('b', { text: city }), h('small', { text: tz ? `${diff === 0 ? 'Today' : `${diff > 0 ? '+' : ''}${diff} hrs`} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : `Sol ${Math.floor(Date.now() / 88775244) - 19000}` }));
        })));
      } else if (tab === 'Alarms') {
        main.append(...alarms.map((a) => h('div.ck-alarm', { class: a.on ? '' : 'off' }, h('div', {}, h('b', { text: a.t }), h('small', { text: a.label })),
          h('button.st-toggle', { class: a.on ? 'on' : '', role: 'switch', 'aria-checked': String(a.on), onclick: () => { a.on = !a.on; render(); } }))),
        h('button.btn', { text: '+ Add Alarm', onclick: async () => { const t = await os.prompt({ title: 'New Alarm', message: 'Time (HH:MM):', value: '08:00' }); if (t && /^\d{1,2}:\d{2}$/.test(t)) { alarms.push({ t: t.padStart(5, '0'), label: 'Alarm', on: true }); render(); } } }));
      } else if (tab === 'Stopwatch') {
        main.append(h('div.ck-big', { text: fmt(sw.t) }), h('div.ck-btns', {},
          h('button.ck-round', { text: sw.run ? 'Lap' : 'Reset', onclick: () => { if (sw.run) sw.laps.unshift(sw.t); else { sw.t = 0; sw.laps = []; } render(); } }),
          h('button.ck-round', { class: sw.run ? 'stop' : 'go', text: sw.run ? 'Stop' : 'Start', onclick: () => { sw.run = !sw.run; sw.last = performance.now(); render(); } })),
        h('div.ck-laps', {}, ...sw.laps.map((l, i) => h('div', {}, h('span', { text: `Lap ${sw.laps.length - i}` }), h('span', { text: fmt(l) })))));
      } else {
        const pct = timer.left / timer.total;
        main.append(h('div.ck-timer', { style: { '--p': `${pct * 100}%` } }, h('div.ck-big', { text: fmt(timer.left * 1000).slice(0, 5) })),
          h('div.ck-btns', {},
            h('button.ck-round', { text: 'Cancel', onclick: () => { timer.run = false; timer.left = timer.total; render(); } }),
            h('button.ck-round', { class: timer.run ? 'stop' : 'go', text: timer.run ? 'Pause' : 'Start', onclick: () => { timer.run = !timer.run; timer.last = performance.now(); render(); } })),
          h('div.ck-presets', {}, ...[[60, '1 min'], [300, '5 min'], [900, '15 min'], [1500, 'Pomodoro']].map(([s, l]) => h('button.btn', { text: l, onclick: () => { timer = { total: s, left: s, run: false, last: 0 }; render(); } }))));
      }
    };
    const iv = setInterval(() => {
      const now = performance.now();
      if (sw.run) { sw.t += now - sw.last; sw.last = now; }
      if (timer.run) {
        timer.left = Math.max(0, timer.left - (now - timer.last) / 1000);
        timer.last = now;
        if (timer.left <= 0) {
          timer.run = false;
          timer.left = timer.total;
          os.audio.happy(); setTimeout(() => os.audio.happy(), 400);
          os.notify({ app: 'clock', title: 'Timer', body: 'Time’s up! ⏰' });
        }
      }
      const hhmm = new Date().toTimeString().slice(0, 5);
      for (const a of alarms) if (a.on && a.t === hhmm && a.fired !== hhmm) { a.fired = hhmm; os.notify({ app: 'clock', title: `Alarm · ${a.t}`, body: a.label }); os.audio.chime(); }
      const sec = new Date().getSeconds();
      if ((tab === 'World Clock' && sec !== lastSec) || (tab === 'Stopwatch' && sw.run) || (tab === 'Timer' && timer.run)) render();
      lastSec = sec;
    }, 60);
    const w = os.createWindow({ app: this, title: 'Clock', width: 640, height: 520, onClose: () => clearInterval(iv), body: (b) => b.append(h('div.ck', {}, main)) });
    w.toolbar.append(h('div.spacer'), tabs, h('div.spacer'));
    render();
    return w;
  },
};
