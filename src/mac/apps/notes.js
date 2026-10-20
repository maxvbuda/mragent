import { h, fmtDate } from '../ui.js';
import { HOME } from '../vfs.js';
import { glyph } from '../icons.js';

const DIR = `${HOME}/Documents/Notes`;

export default {
  id: 'notes', name: 'Notes', icon: 'notes', single: true,
  about: 'Notes — synced to ~/Documents/Notes.',
  launch(os) {
    const v = os.vfs;
    if (!v.exists(DIR)) v.mkdir(DIR);
    let current = null, query = '', saveT = null;
    const list = h('div.n2-list.scroll');
    const search = h('input.tb-search', { placeholder: 'Search', 'aria-label': 'Search notes', style: { width: '100%' } });
    const editor = h('div.n2-ed', { contenteditable: 'true', spellcheck: 'true', 'aria-label': 'Note' });
    const date = h('div.n2-date');
    const side = h('div.n2-side', {}, h('div.n2-search', {}, search), list);
    const main = h('div.n2-main', {}, date, editor);

    const notes = () => v.ls(DIR).filter((e) => e.type === 'file').sort((a, b) => b.modified - a.modified);
    const renderList = () => {
      list.innerHTML = '';
      const items = notes().filter((n) => !query || (v.read(n.path) || '').toLowerCase().includes(query));
      if (!items.length) list.append(h('p.n2-none', { text: 'No Notes' }));
      for (const n of items) {
        const text = v.read(n.path) || '';
        const [title, ...rest] = text.split('\n');
        list.append(h('div.n2-item', { class: n.path === current ? 'on' : '', onclick: () => open(n.path) },
          h('b', { text: title || 'New Note' }),
          h('small', {}, h('span', { text: fmtDate(n.modified).replace(/ at .*/, '') }), ' ', rest.join(' ').trim().slice(0, 60) || 'No additional text')));
      }
    };
    const open = (path) => {
      current = path;
      const text = v.read(path) || '';
      editor.innerText = text;
      date.textContent = fmtDate(v.node(path)?.modified);
      editor.hidden = false;
      renderList();
    };
    const save = () => {
      if (!current) return;
      const text = editor.innerText.replace(/\n$/, '');
      const first = (text.split('\n')[0] || 'New Note').replace(/[/\\:]/g, '-').slice(0, 40).trim() || 'New Note';
      let path = current;
      const wanted = `${DIR}/${first}.txt`;
      if (wanted !== current && !v.exists(wanted)) { v.mv(current, wanted); path = wanted; }
      v.write(path, text);
      current = path;
      date.textContent = fmtDate(Date.now());
      renderList();
    };
    const create = () => {
      const p = v.uniqueName(DIR, 'New Note.txt');
      v.write(p, '');
      open(p);
      editor.focus();
    };
    const remove = () => {
      if (!current) return;
      v.trash(current);
      os.audio.trash();
      current = null;
      const first = notes()[0];
      if (first) open(first.path); else { editor.innerText = ''; editor.hidden = true; renderList(); }
    };
    editor.addEventListener('input', () => { clearTimeout(saveT); saveT = setTimeout(save, 400); });
    search.addEventListener('input', () => { query = search.value.toLowerCase(); renderList(); });

    const w = os.createWindow({
      app: this, title: 'Notes', width: 760, height: 480, minWidth: 460, sidebarWidth: 250, className: 'win-notes',
      body: (b) => b.append(h('div.split', {}, side, main)),
      onClose: () => save(),
    });
    w.toolbar.append(h('div.spacer'), h('button.tb-btn', { html: glyph.trash, title: 'Delete note', 'aria-label': 'Delete note', onclick: remove }), h('button.tb-btn', { html: glyph.edit, title: 'New note', 'aria-label': 'New note', onclick: create }));
    const first = notes()[0];
    if (first) open(first.path); else create();
    return w;
  },
};
