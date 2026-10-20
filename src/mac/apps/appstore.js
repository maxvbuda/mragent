import { h } from '../ui.js';
import { appIcon } from '../icons.js';
import { APPS } from './index.js';

/** Apps you can install from the App Store (their code ships with the Mac; installing unlocks them). */
export const CATALOG = [
  { id: 'paint', category: 'Create', blurb: 'Draw with brushes, shapes and a paint bucket. Save to Photos.', size: '24 MB', rating: 4.8, by: 'Mr. Agent Labs' },
  { id: 'g2048', category: 'Arcade', blurb: 'Slide the tiles, merge the numbers, reach 2048.', size: '8 MB', rating: 4.7, by: 'Bit Studios' },
  { id: 'flappy', category: 'Arcade', blurb: 'Tap to flap a tiny robot through the pipes. Harder than it looks.', size: '12 MB', rating: 4.5, by: 'Pixel Bots' },
  { id: 'stickies', category: 'Work', blurb: 'Colourful sticky notes that stay on your screen.', size: '4 MB', rating: 4.6, by: 'Mr. Agent Labs' },
  { id: 'dictionary', category: 'Work', blurb: 'Definitions for robots, coders and matcha lovers.', size: '1.2 GB', rating: 4.4, by: 'Lexibot' },
];

export default {
  id: 'appstore', name: 'App Store', icon: 'appstore', single: true,
  about: 'App Store — get apps for Mr. Agent’s Mac.',
  launch(os, args = {}) {
    let tab = 'Discover';
    const installing = new Map();
    const side = h('div.sb', { style: { width: '200px' } });
    const main = h('div.as-main.scroll');
    const installed = (id) => os.prefs.installed.includes(id);
    const install = (id, btn) => {
      if (installed(id) || installing.has(id)) return;
      let p = 0;
      installing.set(id, 0);
      const ring = () => { btn.innerHTML = `<span class="as-ring" style="--p:${p}%"></span>`; };
      ring();
      const iv = setInterval(() => {
        p += 6 + Math.random() * 14;
        if (p >= 100) {
          clearInterval(iv);
          installing.delete(id);
          os.prefs.installed = [...os.prefs.installed, id];
          os.prefs.dock = [...os.dockIds(), id];
          os.savePrefs();
          os.renderDock();
          os.bounce(id);
          os.notify({ app: 'appstore', title: 'Installed', body: `${APPS[id].name} is ready. You’ll find it in Launchpad and the Dock.` });
          render();
          return;
        }
        ring();
      }, 140);
    };
    const remove = async (id) => {
      if (!(await os.confirm(`Delete “${APPS[id].name}”? Its data will be removed too.`, 'Delete'))) return;
      os.quit(id);
      os.prefs.installed = os.prefs.installed.filter((x) => x !== id);
      os.prefs.dock = os.dockIds().filter((x) => x !== id);
      os.savePrefs();
      os.renderDock();
      render();
    };
    const getBtn = (c) => {
      const btn = h('button.as-get', { text: installed(c.id) ? 'Open' : 'Get' });
      btn.addEventListener('click', (e) => { e.stopPropagation(); if (installed(c.id)) os.launch(c.id); else install(c.id, btn); });
      return btn;
    };
    const card = (c) => h('div.as-card', { onclick: () => detail(c) }, h('span.as-ic', { html: appIcon(APPS[c.id].icon || c.id) }),
      h('div.as-card-txt', {}, h('b', { text: APPS[c.id].name }), h('small', { text: c.blurb })), getBtn(c));
    const detail = (c) => {
      main.innerHTML = '';
      main.append(h('button.tb-btn', { text: '‹ Back', onclick: render }),
        h('div.as-detail', {}, h('span.as-ic.big', { html: appIcon(APPS[c.id].icon || c.id) }),
          h('div', {}, h('h1', { text: APPS[c.id].name }), h('p', { text: c.by }), getBtn(c), installed(c.id) ? h('button.btn', { text: 'Delete', onclick: () => remove(c.id) }) : null)),
        h('div.as-facts', {}, ...[['RATINGS', `${c.rating} ★★★★★`], ['AGE', '4+'], ['CATEGORY', c.category], ['SIZE', c.size], ['DEVELOPER', c.by]].map(([k, v]) => h('div', {}, h('small', { text: k }), h('b', { text: v })))),
        h('p.as-desc', { text: `${c.blurb} Optimised for the M7 Ultra Max: launches in 0.0001 seconds, uses 1 of 1,024 cores.` }));
    };
    const render = () => {
      side.innerHTML = '';
      side.append(h('input.tb-search', { placeholder: 'Search', 'aria-label': 'Search apps', style: { width: '100%', margin: '4px 0 8px' }, oninput: (e) => { tab = 'Search'; search(e.target.value); } }));
      for (const t of ['Discover', 'Arcade', 'Create', 'Work', 'Updates']) side.append(h('div.sb-item', { class: t === tab ? 'on' : '', onclick: () => { tab = t; render(); } }, h('span.ic', { text: { Discover: '★', Arcade: '🕹', Create: '🖌', Work: '✈︎', Updates: '⬇︎' }[t] }), t));
      main.innerHTML = '';
      if (tab === 'Updates') {
        main.append(h('h1', { text: 'Updates' }),
          h('div.as-card', {}, h('span.as-ic', { html: appIcon('settings') }), h('div.as-card-txt', {}, h('b', { text: 'macOS Big Byte 31.0.1' }), h('small', { text: 'Fixes a bug where Mr. Agent tried to drink through his visor.' })), h('button.as-get', { text: 'Update', onclick: () => os.launch('settings', { pane: 'update' }) })),
          h('p.as-desc', { text: 'All your apps are up to date.' }));
        os.setBadge('appstore', 0);
        return;
      }
      const list = tab === 'Discover' ? CATALOG : CATALOG.filter((c) => c.category === tab);
      if (tab === 'Discover') {
        main.append(h('div.as-hero', { onclick: () => detail(CATALOG[0]) }, h('small', { text: 'APP OF THE DAY' }), h('h2', { text: 'Paint, by Mr. Agent Labs' }), h('p', { text: 'Your Mac’s 4,096-core GPU, finally put to good use.' })));
      }
      main.append(h('h1', { text: tab }), h('div.as-grid', {}, ...list.map(card)));
    };
    const search = (q) => {
      main.innerHTML = '';
      const res = CATALOG.filter((c) => APPS[c.id].name.toLowerCase().includes(q.toLowerCase()) || c.blurb.toLowerCase().includes(q.toLowerCase()));
      main.append(h('h1', { text: `Results for “${q}”` }), h('div.as-grid', {}, ...res.map(card)));
    };
    const w = os.createWindow({
      app: this, title: 'App Store', width: 900, height: 600, sidebarWidth: 200,
      body: (b) => b.append(h('div.split', {}, side, main)),
      onArgs: (a) => { const c = CATALOG.find((x) => x.id === a.show); if (c) detail(c); },
    });
    render();
    const c = CATALOG.find((x) => x.id === args.show);
    if (c) detail(c);
    return w;
  },
};
