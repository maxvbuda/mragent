import { h, imageURL } from '../ui.js';
import { HOME } from '../vfs.js';

export const textedit = {
  id: 'textedit', name: 'TextEdit', icon: 'textedit', single: false,
  about: 'TextEdit — for plain text and Markdown.',
  launch(os, { path } = {}) {
    const v = os.vfs;
    let file = path || null;
    let dirty = false;
    const ta = h('textarea.te-ta', { spellcheck: 'true', 'aria-label': 'Document' });
    const info = h('span.te-info');
    if (file) ta.value = v.read(file) || '';
    const ro = file && v.node(file)?.readonly;
    ta.readOnly = !!ro;
    const update = () => {
      const words = ta.value.split(/\s+/).filter(Boolean).length;
      info.textContent = `${words} word${words === 1 ? '' : 's'} · ${ta.value.length} characters${ro ? ' · read-only' : ''}`;
      w?.setTitle(`${file ? v.base(file) : 'Untitled'}${dirty ? ' — Edited' : ''}`);
    };
    const save = async () => {
      if (ro) return;
      if (!file) {
        const name = await os.prompt({ title: 'Save As', message: 'Save to Documents as:', value: 'Untitled.txt' });
        if (!name) return;
        file = v.uniqueName(`${HOME}/Documents`, name.includes('.') ? name : `${name}.txt`);
      }
      v.write(file, ta.value);
      dirty = false;
      update();
    };
    ta.addEventListener('input', () => { dirty = true; update(); });
    ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
    let w = null;
    w = os.createWindow({
      app: this, title: file ? v.base(file) : 'Untitled', width: 620, height: 520, state: () => (file ? { path: file } : {}),
      body: (b) => b.append(h('div.te', {}, h('div.te-bar', {}, h('select.field', { 'aria-label': 'Font', onchange: (e) => { ta.style.fontFamily = e.target.value; } },
        ...['-apple-system, Helvetica', 'Georgia, serif', 'ui-monospace, Menlo, monospace', '"Marker Felt", "Comic Sans MS", cursive'].map((f, i) => h('option', { value: f, text: ['Helvetica', 'Georgia', 'Menlo', 'Marker Felt'][i] }))),
        h('select.field', { 'aria-label': 'Size', onchange: (e) => { ta.style.fontSize = e.target.value; } }, ...['13px', '15px', '18px', '24px'].map((s) => h('option', { value: s, text: s.replace('px', ' pt'), selected: s === '15px' }))),
        h('div.spacer'), info, h('button.btn', { text: 'Save', onclick: save })), ta)),
    });
    w.beforeClose = () => {
      if (!dirty) return true;
      os.confirm(`Do you want to save the changes you made to “${file ? v.base(file) : 'Untitled'}”?`, 'Save').then(async (ok) => { if (ok) await save(); dirty = false; w.close(); });
      return false;
    };
    update();
    setTimeout(() => ta.focus(), 30);
    return w;
  },
};

export const preview = {
  id: 'preview', name: 'Preview', icon: 'preview', single: false,
  about: 'Preview — look at pictures.',
  launch(os, { path } = {}) {
    const v = os.vfs;
    const dir = path ? v.parent(path) : `${HOME}/Pictures`;
    const imgs = v.ls(dir).filter((e) => e.image || e.imageRef);
    let i = Math.max(0, imgs.findIndex((e) => e.path === path));
    let zoom = 1;
    const img = h('img.pv-img', { alt: '' });
    const stage = h('div.pv-stage.scroll', {}, img);
    const show = () => {
      const e = imgs[i];
      if (!e) return;
      img.src = imageURL(e, 1200, 800);
      img.style.width = `${zoom * 100}%`;
      w?.setTitle(`${e.name} — ${i + 1} of ${imgs.length}`);
    };
    let w = null;
    w = os.createWindow({
      app: this, title: 'Preview', width: 720, height: 520, className: 'win-preview', dark: true, state: () => ({ path: imgs[i]?.path }),
      body: (b) => b.append(stage),
      onKey: (e) => { if (e.key === 'ArrowRight') { i = (i + 1) % imgs.length; show(); } if (e.key === 'ArrowLeft') { i = (i - 1 + imgs.length) % imgs.length; show(); } },
    });
    w.toolbar.append(h('div.spacer'),
      h('button.tb-btn', { text: '‹', 'aria-label': 'Previous', onclick: () => { i = (i - 1 + imgs.length) % imgs.length; show(); } }),
      h('button.tb-btn', { text: '›', 'aria-label': 'Next', onclick: () => { i = (i + 1) % imgs.length; show(); } }),
      h('button.tb-btn', { text: '−', 'aria-label': 'Zoom out', onclick: () => { zoom = Math.max(0.3, zoom - 0.2); show(); } }),
      h('button.tb-btn', { text: '+', 'aria-label': 'Zoom in', onclick: () => { zoom = Math.min(4, zoom + 0.2); show(); } }),
      h('button.tb-btn', { text: '★', title: 'Set as desktop picture', onclick: () => os.setPref('wallpaper', ['night', 'aurora', 'coffee', 'mint'][i % 4]) }));
    show();
    return w;
  },
};
