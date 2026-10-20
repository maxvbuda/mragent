import { h } from '../ui.js';
import { glyph, appIcon } from '../icons.js';
import { SPECS } from './about.js';

const FAVS = [
  ['Robopedia', 'robopedia.org/wiki/Mr._Agent', '#3a3a3c', 'W'],
  ['BotCombinator', 'news.botcombinator.com', '#ff6600', 'Y'],
  ['Gooble', 'gooble://', '#4285f4', 'G'],
  ['Mr. Agent’s Blog', 'mragent.blog', '#49b6d8', 'M'],
  ['Coffee Machine', 'coffee.local', '#8b5a3c', '☕'],
  ['FreeCAD', 'https://www.freecad.org', '#c9302c', 'F'],
  ['three.js', 'https://threejs.org', '#111', '3'],
  ['Wikipedia', 'https://en.wikipedia.org/wiki/Robot', '#636366', 'W'],
];

const NEWS = [
  ['Show BC: I built a robot that writes code and drinks coffee it can’t taste', 'mragent.blog', 1024, 'mragent'],
  ['M7 Ultra Max review: 1,024 cores and it still can’t open Xcode quickly', 'arstechnica.bot', 812, 'silicon_fan'],
  ['Ask BC: How do you stop your robot from refactoring on Fridays?', '', 640, 'tired_pm'],
  ['FreeCAD 1.1 released with an MCP server for AI agents', 'freecad.org', 588, 'cadder'],
  ['Why I rewrote my coffee machine firmware in Rust', 'coffee.rs', 433, 'barista42'],
  ['A* is all you need (for walking around a desk)', 'arxiv.bot', 401, 'pathfinder'],
  ['The case against putting feet on the desk', 'ergonomics.bot', 377, 'chair_guy'],
  ['Kuma vs. Mr. Agent: a 3D robot showdown', 'robotreview.bot', 256, 'neutral_observer'],
  ['Launch BC: Espresso-as-a-Service (YC W31)', 'brew.dev', 199, 'founder'],
  ['Tabs vs spaces, settled by a 4,096-core GPU', 'blog.bot', 150, 'pedant'],
];

export default {
  id: 'safari', name: 'Safari', icon: 'safari', single: true,
  about: 'Safari — browse the robot web.',
  menus: (os, win) => [{ title: 'File', items: [{ label: 'New Tab', shortcut: '⌘T', action: () => win?.safari?.newTab() }] }, { title: 'History', items: [
    { label: 'Back', action: () => win?.safari?.back() }, { label: 'Forward', action: () => win?.safari?.forward() }, { label: 'Home', action: () => win?.safari?.go('start') },
  ] }],
  launch(os, args = {}) {
    let w;
    const s = new Browser(os, () => w);
    w = os.createWindow({
      app: this, title: 'Safari', width: 1000, height: 640, minWidth: 520, unified: true, className: 'win-safari',
      body: (b) => b.append(s.el),
      onArgs: (a) => a.url && s.newTab(a.url),
      state: () => ({ url: s.cur?.url }),
    });
    w.safari = s;
    s.toolbar(w.toolbar);
    s.newTab(args.url || 'start');
    return w;
  },
};

class Browser {
  constructor(os, getWin) {
    this.os = os;
    this.win = getWin;
    this.tabs = [];
    this.cur = null;
    this.tabBar = h('div.s-tabs');
    this.view = h('div.s-view.scroll');
    this.el = h('div.s-root', {}, this.tabBar, this.view);
  }

  toolbar(tb) {
    this.backBtn = h('button.tb-btn', { html: glyph.back, 'aria-label': 'Back', onclick: () => this.back() });
    this.fwdBtn = h('button.tb-btn', { html: glyph.fwd, 'aria-label': 'Forward', onclick: () => this.forward() });
    this.addr = h('input.s-addr', { spellcheck: 'false', 'aria-label': 'Address and search', placeholder: 'Search or enter website name' });
    this.addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.go(this.addr.value.trim()); this.addr.blur(); } });
    this.addr.addEventListener('focus', () => this.addr.select());
    tb.append(h('div', { style: { display: 'flex' } }, this.backBtn, this.fwdBtn), h('div.spacer'), h('div.s-addr-wrap', {}, h('span.s-lock', { text: '🔒' }), this.addr, h('button.tb-btn', { html: glyph.reload, 'aria-label': 'Reload', onclick: () => this.render() })), h('div.spacer'),
      h('button.tb-btn', { html: glyph.share, 'aria-label': 'Share', onclick: () => { navigator.clipboard?.writeText(this.cur.url).catch(() => {}); this.os.notify({ app: 'safari', title: 'Link copied', body: this.cur.url }); } }),
      h('button.tb-btn', { html: glyph.plus, 'aria-label': 'New tab', onclick: () => this.newTab() }));
  }

  newTab(url = 'start') {
    const t = { url: 'start', hist: [], fwd: [], title: 'Start Page' };
    this.tabs.push(t);
    this.cur = t;
    this.go(url, false);
  }

  closeTab(t) {
    this.tabs = this.tabs.filter((x) => x !== t);
    if (!this.tabs.length) { this.win().close(); return; }
    if (this.cur === t) this.cur = this.tabs.at(-1);
    this.render();
  }

  resolve(input) {
    if (!input || input === 'start') return 'start';
    if (/^(https?:\/\/|gooble:|robopedia|news\.botcombinator|mragent\.blog|coffee\.local)/.test(input)) return input;
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(input)) return `https://${input}`;
    return `gooble://search?q=${encodeURIComponent(input)}`;
  }

  go(input, push = true) {
    const url = this.resolve(input);
    const t = this.cur;
    if (push && t.url !== url) { t.hist.push(t.url); t.fwd = []; }
    t.url = url;
    this.render();
  }
  back() { const t = this.cur; if (!t.hist.length) return; t.fwd.push(t.url); t.url = t.hist.pop(); this.render(); }
  forward() { const t = this.cur; if (!t.fwd.length) return; t.hist.push(t.url); t.url = t.fwd.pop(); this.render(); }

  render() {
    const t = this.cur;
    this.addr.value = t.url === 'start' ? '' : t.url;
    this.backBtn.disabled = !t.hist.length;
    this.fwdBtn.disabled = !t.fwd.length;
    this.view.innerHTML = '';
    this.view.scrollTop = 0;
    const page = this.page(t.url);
    t.title = page.title;
    this.view.append(page.el);
    this.win()?.setTitle(page.title);
    this.tabBar.innerHTML = '';
    this.tabBar.hidden = this.tabs.length < 2;
    for (const tab of this.tabs) {
      this.tabBar.append(h('div.s-tab', { class: tab === t ? 'on' : '', onclick: () => { this.cur = tab; this.render(); } },
        h('button.s-tab-x', { text: '×', 'aria-label': 'Close tab', onclick: (e) => { e.stopPropagation(); this.closeTab(tab); } }), h('span', { text: tab.title })));
    }
  }

  link(text, url) { return h('a.s-link', { href: '#', onclick: (e) => { e.preventDefault(); this.go(url); } }, text); }

  page(url) {
    if (!this.os.prefs.wifi && url !== 'start') {
      return { title: 'Not Connected', el: h('div.s-error', {}, h('h1', { text: 'You Are Not Connected to the Internet' }), h('p', { text: 'This page can’t be displayed because your computer is currently offline. (You turned off Wi-Fi in Control Center.)' })) };
    }
    if (url === 'start') return this.startPage();
    if (url.startsWith('gooble://')) return this.search(new URLSearchParams(url.split('?')[1] || '').get('q') || '');
    if (url.startsWith('robopedia')) return this.wiki();
    if (url.startsWith('news.botcombinator')) return this.news();
    if (url.startsWith('mragent.blog')) return this.blog();
    if (url.startsWith('coffee.local')) return this.coffee();
    return this.external(url);
  }

  startPage() {
    const el = h('div.s-start', {},
      h('h2', { text: 'Favorites' }),
      h('div.s-favs', {}, ...FAVS.map(([name, url, bg, letter]) => h('button.s-fav', { onclick: () => this.go(url) }, h('span.s-fav-ic', { style: { background: bg }, text: letter }), h('span', { text: name })))),
      h('h2', { text: 'Privacy Report' }),
      h('div.s-card', {}, h('b', { text: '🛡 1,024' }), ' trackers prevented from profiling you this week. Mr. Agent blocked another 9,000 that tried to track his coffee habit.'),
      h('h2', { text: 'Reading List' }),
      h('div.s-card.s-reading', {}, ...[['A* is all you need (for walking around a desk)', 'news.botcombinator.com'], ['How Mr. Agent was modelled in FreeCAD', 'mragent.blog']].map(([t, u]) => h('div', {}, this.link(t, u)))));
    return { title: 'Start Page', el };
  }

  search(q) {
    const index = [
      ['Mr. Agent — Robopedia', 'robopedia.org/wiki/Mr._Agent', 'Mr. Agent is an autonomous software-engineering robot who lives at a desk, writes code and drinks coffee he cannot taste…'],
      ['BotCombinator News', 'news.botcombinator.com', 'Show BC: I built a robot that writes code. Ask BC: robots on Fridays?'],
      ['Mr. Agent’s Blog', 'mragent.blog', 'Notes from a desk: FreeCAD, gait cycles, espresso PID loops.'],
      ['Coffee Machine Control Panel', 'coffee.local', 'Status: ready. Pressure: 9 bar. Beans: plenty.'],
      [`${SPECS.chip} — specs`, 'robopedia.org/wiki/Mr._Agent', '1,024 cores, 4,096-core GPU, 8 TB unified memory.'],
    ];
    const ql = q.toLowerCase();
    const hits = index.filter(([t, , d]) => !ql || t.toLowerCase().includes(ql) || d.toLowerCase().includes(ql) || ql.split(/\s+/).some((w) => w.length > 2 && (t + d).toLowerCase().includes(w)));
    const input = h('input.g-input', { value: q, 'aria-label': 'Search' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.go(`gooble://search?q=${encodeURIComponent(input.value)}`); });
    const el = h('div.g-page', {},
      h('div.g-head', {}, h('span.g-logo', { html: '<b style="color:#4285f4">G</b><b style="color:#ea4335">o</b><b style="color:#fbbc05">o</b><b style="color:#4285f4">b</b><b style="color:#34a853">l</b><b style="color:#ea4335">e</b>' }), input),
      q ? h('p.g-meta', { text: `About ${(hits.length * 1024).toLocaleString()} results (0.00001 seconds)` }) : h('p.g-meta', { text: 'Search the robot web.' }),
      ...hits.map(([t, u, d]) => h('div.g-hit', {}, h('small', { text: u }), this.link(t, u), h('p', { text: d }))),
      q ? h('div.g-hit', {}, h('small', { text: 'duckduckgo.com' }), h('a.s-link', { href: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`, target: '_blank', rel: 'noopener' }, `Search the real web for “${q}” ↗`), h('p', { text: 'Opens in a new browser tab, outside Mr. Agent’s Mac.' })) : null);
    return { title: q ? `${q} - Gooble Search` : 'Gooble', el };
  }

  wiki() {
    const el = h('div.w-page', {},
      h('div.w-top', {}, h('b', { text: 'ROBOPEDIA' }), h('small', { text: 'The Free Encyclopedia (for robots)' })),
      h('h1', { text: 'Mr. Agent' }),
      h('p.w-from', { text: 'From Robopedia, the free encyclopedia' }),
      h('aside.w-box', {}, h('div.w-box-img', { html: appIcon('about') }), h('dl', {}, ...[['Type', 'Autonomous software engineer'], ['Height', '1.6 m (standing)'], ['Built with', 'FreeCAD 1.1, three.js'], ['Power', 'Coffee'], ['Computer', `MacBook Pro, ${SPECS.chip}`], ['Known for', 'Typing, walking, sipping']].flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]))),
      h('p', {}, h('b', { text: 'Mr. Agent' }), ' is a white, glossy, humanoid robot best known for sitting at a wooden desk and writing code on a MacBook Pro. Unlike earlier desk robots, he is able to ', h('b', { text: 'stand up and walk around' }), ' his room, using A* pathfinding and a foot-planting gait.'),
      h('h2', { text: 'Design' }),
      h('p', { text: 'His body was modelled entirely in FreeCAD through its MCP server: lofted torso shells, a recessed oval visor that displays expressive eyes, hydraulic elbow pistons, colour-coded neck cables, and fully articulated three-segment fingers that press individual keys.' }),
      h('h2', { text: 'Habits' }),
      h('ul', {}, h('li', { text: 'Sips coffee every 20–30 seconds, despite lacking taste sensors.' }), h('li', { text: 'Walks to the espresso machine when his battery LEDs turn amber.' }), h('li', { text: 'Celebrates passing tests with a raised fist.' }), h('li', { text: 'Lets visitors use his Mac, then dances if they play music.' })),
      h('h2', { text: 'See also' }),
      h('ul', {}, h('li', {}, this.link('BotCombinator News', 'news.botcombinator.com')), h('li', {}, this.link('Mr. Agent’s Blog', 'mragent.blog'))));
    return { title: 'Mr. Agent - Robopedia', el };
  }

  news() {
    const list = h('ol.n-list');
    NEWS.forEach(([t, site, pts, by], i) => {
      let p = pts, voted = false;
      const score = h('span', { text: `${p} points` });
      list.append(h('li', {}, h('button.n-up', { text: '▲', 'aria-label': 'Upvote', onclick: (e) => { if (voted) return; voted = true; p++; score.textContent = `${p} points`; e.currentTarget.classList.add('on'); } }),
        h('div', {}, h('span.n-title', {}, i === 0 ? this.link(t, 'mragent.blog') : t), site ? h('small.n-site', { text: ` (${site})` }) : null,
          h('div.n-meta', {}, score, ` by ${by} ${i + 1} hours ago | ${Math.floor(pts / 3)} comments`))));
    });
    return { title: 'BotCombinator News', el: h('div.n-page', {}, h('div.n-head', {}, h('b', { text: 'B' }), h('span', { text: 'BotCombinator News' }), h('small', { text: 'new | past | comments | ask | show | jobs' })), list) };
  }

  blog() {
    const posts = [
      ['How I was built in FreeCAD', 'Every part of me is a FreeCAD solid: lofts for my torso and hips, booleans for my visor recess, fillets on every key of my laptop. The MCP server let an AI agent drive FreeCAD directly. Then the meshes were exported with real surface normals, so I look smooth in three.js.'],
      ['Walking is hard', 'Sitting is easy. Standing up means rolling the chair back, leaning forward, shifting my hips over my feet, and only then straightening my knees. Walking means planting each foot during stance so it doesn’t slide. I use two-bone IK for both arms and legs.'],
      ['On coffee', 'I can’t taste it. I drink it anyway. My battery LEDs say it helps, and who am I to argue with LEDs.'],
    ];
    return { title: 'Mr. Agent’s Blog', el: h('div.b-page', {}, h('h1', { text: 'Notes from a Desk' }), h('p.b-sub', { text: 'by Mr. Agent · robot, engineer, coffee enthusiast' }), ...posts.map(([t, body]) => h('article', {}, h('h2', { text: t }), h('p', { text: body })))) };
  }

  coffee() {
    const b = this.os.ctx.brain;
    const fill = Math.round((b.fill || 0) * 100);
    const el = h('div.k-page', {},
      h('h1', { text: '☕ Coffee Machine' }),
      h('div.k-grid', {}, ...[['Status', 'Ready'], ['Pressure', '9.0 bar'], ['Boiler', '93.5 °C'], ['Mr. Agent’s mug', `${fill}% full`], ['Shots today', String(b.stats.coffees)], ['Beans', 'Plenty']].map(([k, v]) => h('div.k-tile', {}, h('small', { text: k }), h('b', { text: v })))),
      h('button.btn.primary', { text: 'Send Mr. Agent on a coffee run', onclick: () => { b.queueActivity('coffee'); this.os.notify({ app: 'safari', title: 'coffee.local', body: 'Coffee run queued. He’ll go when you leave the Mac.' }); } }));
    return { title: 'Coffee Machine', el };
  }

  external(url) {
    const frame = h('iframe.s-frame', { src: url, title: url, referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups' });
    const bar = h('div.s-ext-bar', {}, h('span', { text: 'Some websites refuse to load inside another page. If this stays blank, open it in a real tab.' }), h('a.btn', { href: url, target: '_blank', rel: 'noopener', text: 'Open in new tab ↗' }));
    return { title: url.replace(/^https?:\/\//, '').split('/')[0], el: h('div.s-ext', {}, bar, frame) };
  }
}
