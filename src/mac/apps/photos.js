import { h, imageURL } from '../ui.js';
import { HOME } from '../vfs.js';

export default {
  id: 'photos', name: 'Photos', icon: 'photos', single: true,
  about: 'Photos — Mr. Agent’s camera roll.',
  launch(os) {
    const v = os.vfs;
    const grid = h('div.ph-grid');
    const albums = {
      Library: () => { const out = []; v.walk(HOME, (e) => { if (e.image || e.imageRef) out.push(e); }); return out; },
      Favorites: () => v.ls(`${HOME}/Pictures`).filter((e) => /selfie|fern/i.test(e.name)),
      Screenshots: () => v.ls(`${HOME}/Desktop`).filter((e) => e.image || e.imageRef),
    };
    let album = 'Library';
    const side = h('div.sb', { style: { width: '180px' } });
    const render = () => {
      side.innerHTML = '';
      side.append(h('div.sb-h', { text: 'Photos' }), ...Object.keys(albums).map((a) => h('div.sb-item', { class: a === album ? 'on' : '', onclick: () => { album = a; render(); } }, h('span.ic', { text: a === 'Library' ? '▦' : a === 'Favorites' ? '♥' : '⌗' }), a)));
      grid.innerHTML = '';
      const items = albums[album]();
      if (!items.length) grid.append(h('p.ph-empty', { text: 'No photos yet. Take a screenshot with ⌃⇧3.' }));
      items.forEach((e) => grid.append(h('button.ph-cell', { title: e.name, onclick: () => os.launch('preview', { path: e.path, newWindow: true }) }, h('img', { src: imageURL(e, 320, 240), alt: e.name, loading: 'lazy' }))));
    };
    const off = os.on('fs', render);
    const w = os.createWindow({
      app: this, title: 'Photos', width: 800, height: 520, sidebarWidth: 180, onClose: off,
      body: (b) => b.append(h('div.split', {}, side, h('div.ph-main.scroll', {}, h('h2.ph-h', { text: 'Library' }), grid))),
    });
    render();
    return w;
  },
};
