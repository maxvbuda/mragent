import { h, fmtDate, drag } from '../ui.js';
import { HOME, formatSize, kindOf } from '../vfs.js';
import { glyph, appIcon, folderIcon } from '../icons.js';
import { APPS } from './index.js';

const PLACES = [
  ['Favorites', [
    ['AirDrop', 'airdrop:', glyph.airdrop],
    ['Recents', 'recents:', glyph.clock],
    ['Applications', '/Applications', '<b style="font-size:13px">A</b>'],
    ['Desktop', `${HOME}/Desktop`, glyph.disk],
    ['Documents', `${HOME}/Documents`, glyph.edit],
    ['Downloads', `${HOME}/Downloads`, '<b>↓</b>'],
    ['Projects', `${HOME}/Projects`, '<b>&lt;/&gt;</b>'],
    ['Pictures', `${HOME}/Pictures`, '<b>▣</b>'],
    ['Music', `${HOME}/Music`, '<b>♪</b>'],
    ['mragent', HOME, glyph.home],
  ]],
  ['Locations', [
    ['Macintosh HD', '/', glyph.disk],
    ['Trash', `${HOME}/.Trash`, glyph.trash],
  ]],
  ['Tags', [
    ['Urgent', 'tag:red', glyph.tag('#ff453a')],
    ['Matcha', 'tag:orange', glyph.tag('#ff9f0a')],
    ['Shipped', 'tag:green', glyph.tag('#30d158')],
  ]],
];

export default {
  id: 'finder', name: 'Finder', icon: 'finder', single: false,
  about: 'Finder — find things. Mostly matcha recipes.',
  menus: (os, win) => [{ title: 'Go', items: [
    ['Recents', 'recents:'], ['Documents', `${HOME}/Documents`], ['Desktop', `${HOME}/Desktop`], ['Downloads', `${HOME}/Downloads`], ['Home', HOME], ['Applications', '/Applications'], ['Projects', `${HOME}/Projects`],
  ].map(([label, path]) => ({ label, action: () => (win?.finder ? win.finder.go(path) : os.launch('finder', { path })) })) }],
  launch(os, { path = HOME, view } = {}) {
    let w;
    const f = new FinderView(os, () => w);
    w = os.createWindow({
      app: this, title: 'Finder', width: 820, height: 500, minWidth: 480, minHeight: 260, unified: true, sidebarWidth: 180,
      body: (b) => b.append(f.el),
      onArgs: (a) => a.path && f.go(a.path),
      onClose: () => f.dispose(),
      onKey: (e) => f.key(e),
      state: () => ({ path: f.path, view: f.view }),
    });
    w.finder = f;
    f.toolbar(w.toolbar);
    if (view) f.view = view;
    f.go(path);
    return w;
  },
};

class FinderView {
  constructor(os, getWin) {
    this.os = os;
    this.vfs = os.vfs;
    this.win = getWin;
    this.history = [];
    this.fwd = [];
    this.view = 'icons';
    this.sel = new Set();
    this.query = '';
    this.sort = { key: 'name', dir: 1 };
    this.side = h('div.sb.f-side', { style: { width: '180px' } });
    this.main = h('div.f-main');
    this.content = h('div.f-content.scroll', { tabindex: '0' });
    this.pathbar = h('div.f-path');
    this.status = h('div.f-status');
    this.main.append(this.content, h('div.f-foot', {}, this.pathbar, this.status));
    this.el = h('div.f-root', {}, this.side, this.main);
    this.content.addEventListener('pointerdown', (e) => { if (e.target === this.content || e.target.classList.contains('f-grid')) { this.sel.clear(); this.paintSel(); } });
    this.content.addEventListener('contextmenu', (e) => { if (!e.target.closest('.f-item')) this.bgMenu(e); });
    this.off = os.on('fs', () => this.render());
    this.renderSide();
  }

  dispose() { this.off?.(); }

  toolbar(tb) {
    this.backBtn = h('button.tb-btn', { html: glyph.back, 'aria-label': 'Back', onclick: () => this.back() });
    this.fwdBtn = h('button.tb-btn', { html: glyph.fwd, 'aria-label': 'Forward', onclick: () => this.forward() });
    this.iconBtn = h('button.tb-btn', { html: glyph.grid, 'aria-label': 'Icon view', onclick: () => { this.view = 'icons'; this.render(); } });
    this.listBtn = h('button.tb-btn', { html: glyph.list, 'aria-label': 'List view', onclick: () => { this.view = 'list'; this.render(); } });
    this.colBtn = h('button.tb-btn', { html: '<svg viewBox="0 0 24 24" width="16" height="16"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></g></svg>', 'aria-label': 'Column view', onclick: () => { this.view = 'columns'; this.render(); } });
    const search = h('input.tb-search', { placeholder: 'Search', 'aria-label': 'Search' });
    search.addEventListener('input', () => { this.query = search.value.trim().toLowerCase(); this.render(); });
    this.newBtn = h('button.tb-btn', { html: glyph.plus, title: 'New Folder', 'aria-label': 'New Folder', onclick: () => this.newFolder() });
    this.emptyBtn = h('button.btn', { text: 'Empty', onclick: () => this.os.emptyTrash() });
    tb.append(h('div', { style: { display: 'flex' } }, this.backBtn, this.fwdBtn), h('div.spacer'), this.emptyBtn, this.iconBtn, this.listBtn, this.colBtn, this.newBtn, search);
  }

  go(path, push = true) {
    if (push && this.path && this.path !== path) { this.history.push(this.path); this.fwd = []; }
    this.path = path;
    this.sel.clear();
    this.render();
  }
  back() { if (!this.history.length) return; this.fwd.push(this.path); this.go(this.history.pop(), false); }
  forward() { if (!this.fwd.length) return; this.history.push(this.path); this.go(this.fwd.pop(), false); }

  title() {
    const p = this.path;
    if (p === 'recents:') return 'Recents';
    if (p === 'airdrop:') return 'AirDrop';
    if (p.startsWith('tag:')) return PLACES[2][1].find((x) => x[1] === p)[0];
    if (p === `${HOME}/.Trash`) return 'Trash';
    if (p === '/') return 'Macintosh HD';
    return this.vfs.base(p);
  }

  entries() {
    const p = this.path, v = this.vfs;
    let list;
    if (p === '/Applications') list = Object.values(APPS).filter((a) => !a.hidden).map((a) => ({ name: `${a.name}.app`, path: `/Applications/${a.name}.app`, type: 'app', app: a, size: 4.2e8, modified: Date.now() - 864e5 * 3 }));
    else if (p === 'recents:') { list = []; v.walk(HOME, (e) => { if (e.type === 'file') list.push(e); }); list.sort((a, b) => b.modified - a.modified); list = list.slice(0, 40); }
    else if (p.startsWith('tag:')) {
      list = [];
      const want = { 'tag:red': /todo|urgent|resume/i, 'tag:orange': /coffee/i, 'tag:green': /\.(ts|rs|py|tsx|glsl)$/ }[p];
      v.walk(HOME, (e) => { if (e.type === 'file' && want.test(e.name)) list.push(e); });
    } else if (p === `${HOME}/.Trash`) {
      list = v.lsAll(p).map((name) => ({ name, path: `${p}/${name}`, ...v.info(v.node(`${p}/${name}`)) }));
    } else if (p === 'airdrop:') list = [];
    else list = v.ls(p);
    if (this.query) {
      if (p !== 'recents:' && !p.startsWith('tag:')) { list = []; v.walk(p === '/' ? HOME : p, (e) => list.push(e)); }
      list = list.filter((e) => e.name.toLowerCase().includes(this.query));
    }
    const { key, dir } = this.sort;
    const val = (e) => (key === 'name' ? e.name.toLowerCase() : key === 'kind' ? kindOf(e.name, e.type) : e[key] ?? 0);
    return list.sort((a, b) => (a.type === 'dir') !== (b.type === 'dir') && key === 'name' ? (a.type === 'dir' ? -1 : 1) : (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
  }

  icon(e) {
    if (e.type === 'app') return appIcon(e.app.icon || e.app.id);
    return this.os.iconFor(e);
  }

  renderSide() {
    this.side.innerHTML = '';
    for (const [title, items] of PLACES) {
      this.side.append(h('div.sb-h', { text: title }));
      for (const [label, path, ic] of items) {
        const it = h('div.sb-item', { dataset: { path }, onclick: () => this.go(path) }, h('span.ic', { html: ic }), label);
        this.side.append(it);
      }
    }
  }

  render() {
    const w = this.win();
    if (!w) return;
    const p = this.path;
    w.setTitle(this.title());
    this.side.querySelectorAll('.sb-item').forEach((x) => x.classList.toggle('on', x.dataset.path === p));
    this.backBtn.disabled = !this.history.length;
    this.fwdBtn.disabled = !this.fwd.length;
    this.iconBtn.classList.toggle('on', this.view === 'icons');
    this.listBtn.classList.toggle('on', this.view === 'list');
    this.colBtn.classList.toggle('on', this.view === 'columns');
    this.content.dataset.path = p.startsWith('/') && p !== '/Applications' ? p : '';
    this.content.classList.toggle('cols', this.view === 'columns');
    this.emptyBtn.hidden = p !== `${HOME}/.Trash`;
    const list = this.entries();
    this.list = list;
    this.content.innerHTML = '';
    if (p === 'airdrop:') {
      this.content.append(h('div.f-airdrop', {}, h('div.f-radar', {}, h('i'), h('i'), h('i')), h('b', { text: 'AirDrop lets you share instantly with people nearby.' }), h('small', { text: 'Looking for nearby robots… found: Toaster-3000, Roomba (busy).' })));
    } else if (!list.length) {
      this.content.append(h('div.f-empty', { text: this.query ? 'No results' : p === `${HOME}/.Trash` ? 'Trash is empty' : 'This folder is empty' }));
    } else if (this.view === 'columns' && p.startsWith('/') && !this.query) {
      this.renderColumns(p);
    } else if (this.view === 'icons') {
      const grid = h('div.f-grid');
      for (const e of list) grid.append(this.itemEl(e, 'icon'));
      this.content.append(grid);
    } else {
      const head = h('div.f-row.f-head', {}, ...[['name', 'Name'], ['modified', 'Date Modified'], ['size', 'Size'], ['kind', 'Kind']].map(([k, l]) => h('span', { class: `c-${k}`, onclick: () => { this.sort = { key: k, dir: this.sort.key === k ? -this.sort.dir : 1 }; this.render(); } }, l, this.sort.key === k ? (this.sort.dir > 0 ? ' ▴' : ' ▾') : '')));
      this.content.append(head);
      list.forEach((e, i) => this.content.append(this.itemEl(e, 'row', i)));
    }
    this.pathbar.innerHTML = '';
    if (p.startsWith('/')) {
      const parts = p.split('/').filter(Boolean);
      const crumbs = [['Macintosh HD', '/'], ...parts.map((x, i) => [x === '.Trash' ? 'Trash' : x, '/' + parts.slice(0, i + 1).join('/')])];
      crumbs.forEach(([label, cp], i) => {
        if (i) this.pathbar.append(h('span.sep', { text: '›' }));
        this.pathbar.append(h('button', { onclick: () => this.go(cp), html: `<span class="pi">${i === 0 ? glyph.disk : folderIcon()}</span>` }, label));
      });
    }
    this.status.textContent = `${list.length} item${list.length === 1 ? '' : 's'}, 999.98 TB available`;
    this.paintSel();
  }

  itemEl(e, mode, i = 0) {
    const el = mode === 'icon'
      ? h('div.f-item.f-icon', { dataset: { path: e.path } }, h('div.fi-img', { html: this.icon(e) }), h('div.fi-name', { text: e.type === 'app' ? e.name.replace(/\.app$/, '') : e.name }))
      : h('div.f-row.f-item', { dataset: { path: e.path }, class: i % 2 ? 'alt' : '' },
        h('span.c-name', {}, h('span.fi-mini', { html: this.icon(e) }), e.type === 'app' ? e.name.replace(/\.app$/, '') : e.name),
        h('span.c-modified', { text: fmtDate(e.modified) }),
        h('span.c-size', { text: e.type === 'dir' ? '--' : formatSize(e.size) }),
        h('span.c-kind', { text: e.type === 'app' ? 'Application' : kindOf(e.name, e.type) }));
    el.addEventListener('pointerdown', (ev) => this.itemDown(ev, el, e));
    el.addEventListener('dblclick', () => this.open(e));
    el.addEventListener('contextmenu', (ev) => {
      if (!this.sel.has(e.path)) { this.sel = new Set([e.path]); this.paintSel(); }
      this.itemMenu(ev, e);
    });
    return el;
  }

  itemDown(ev, el, e) {
    if (ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey) { this.sel.has(e.path) ? this.sel.delete(e.path) : this.sel.add(e.path); }
    else if (ev.shiftKey && this.lastSel) {
      const a = this.list.findIndex((x) => x.path === this.lastSel), b = this.list.findIndex((x) => x.path === e.path);
      this.list.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => this.sel.add(x.path));
    } else if (!this.sel.has(e.path)) this.sel = new Set([e.path]);
    this.lastSel = e.path;
    this.paintSel();
    if (e.type === 'app' || this.path === 'recents:') return;
    // drag to move into folders, the sidebar or the Trash
    let ghost = null;
    drag(ev, (dx, dy, m) => {
      if (!ghost && Math.hypot(dx, dy) > 6) {
        ghost = h('div.f-ghost', { html: this.icon(e) });
        if (this.sel.size > 1) ghost.append(h('i', { text: this.sel.size }));
        document.body.append(ghost);
      }
      if (!ghost) return;
      ghost.style.transform = `translate(${m.clientX - 24}px, ${m.clientY - 24}px)`;
      this.os.highlightDock(m);
    }, (dx, dy, m) => {
      if (!ghost) return;
      ghost.remove();
      this.os.clearDockHighlight();
      const paths = [...this.sel];
      try {
        if (this.os.dropOnDock(m, paths)) return;
        const under = document.elementsFromPoint(m.clientX, m.clientY);
        const hit = under.find((n) => n.dataset?.path && n !== el && (n.classList.contains('sb-item') || n.classList.contains('f-item') || n.classList.contains('desk-icon')));
        const otherWin = under.find((n) => n.classList?.contains('f-content') && n.dataset.path && n !== this.content);
        const onDesktop = !under.some((n) => n.classList?.contains('win')) && under.some((n) => n.classList?.contains('mac-desktop'));
        const dest = hit && this.vfs.isDir(hit.dataset.path) ? hit.dataset.path : otherWin ? otherWin.dataset.path : onDesktop ? `${HOME}/Desktop` : null;
        if (dest) paths.forEach((p) => p !== dest && this.vfs.parent(p) !== dest && this.vfs.mv(p, dest));
      } catch (err) { this.os.alert({ title: 'The operation can’t be completed', message: err.message }); }
    });
  }

  paintSel() {
    this.content.querySelectorAll('.f-item').forEach((x) => x.classList.toggle('sel', this.sel.has(x.dataset.path)));
  }

  open(e) {
    if (e.type === 'app') return this.os.launch(e.app.id);
    if (e.type === 'dir') return this.go(e.path);
    this.os.openPath(e.path);
  }

  itemMenu(ev, e) {
    const inTrash = this.path === `${HOME}/.Trash`;
    const paths = [...this.sel];
    this.os.contextMenu(ev, [
      { label: 'Open', action: () => this.open(e) },
      e.type === 'file' ? { label: 'Open With', submenu: this.os.openersFor(e.path).map((id) => ({ label: APPS[id].name, icon: appIcon(APPS[id].icon || id), action: () => this.os.openWith(id, e.path) })) } : null,
      { label: 'Quick Look', shortcut: 'Space', disabled: e.type !== 'file', action: () => this.quickLook(e) },
      { sep: true },
      inTrash ? { label: 'Put Back', action: () => paths.forEach((p) => this.vfs.mv(p, `${HOME}/Desktop`)) } : { label: 'Move to Trash', disabled: e.type === 'app' || e.readonly, action: () => { paths.forEach((p) => this.vfs.trash(p)); this.os.audio.trash(); } },
      { sep: true },
      { label: 'Get Info', action: () => this.os.getInfo(e.path) },
      { label: 'Rename', disabled: e.type === 'app' || e.readonly || inTrash, action: () => this.os.rename(e.path) },
      { label: 'Duplicate', disabled: e.type !== 'file' || e.readonly, action: () => this.vfs.cp(e.path, this.vfs.uniqueName(this.vfs.parent(e.path), e.name.replace(/(\.[^.]+)?$/, ' copy$1'))) },
      { label: `Compress “${e.name}”`, disabled: e.type === 'app' || inTrash, action: () => this.os.compress(e.path) },
      { sep: true },
      { label: 'Copy', shortcut: '⌘C', disabled: e.type === 'app', action: () => this.os.copyFiles(paths) },
      { label: 'Copy Path', action: () => navigator.clipboard?.writeText(e.path).catch(() => {}) },
    ]);
  }

  bgMenu(ev) {
    const real = this.path.startsWith('/') && this.path !== '/Applications';
    this.os.contextMenu(ev, [
      { label: 'New Folder', disabled: !real, action: () => this.newFolder() },
      { label: 'New Text File', disabled: !real, action: () => { const p = this.vfs.uniqueName(this.path, 'untitled.txt'); this.vfs.write(p, ''); this.os.openPath(p); } },
      this.os.clipboard && real ? { label: `Paste ${this.os.clipboard.paths.length} Item${this.os.clipboard.paths.length > 1 ? 's' : ''}`, shortcut: '⌘V', action: () => this.os.pasteFiles(this.path) } : null,
      { label: 'View as Columns', checked: this.view === 'columns', action: () => { this.view = 'columns'; this.render(); } },
      { sep: true },
      { label: 'Get Info', action: () => this.os.getInfo(this.path.startsWith('/') ? this.path : HOME) },
      { label: 'View as Icons', checked: this.view === 'icons', action: () => { this.view = 'icons'; this.render(); } },
      { label: 'View as List', checked: this.view === 'list', action: () => { this.view = 'list'; this.render(); } },
    ]);
  }

  newFolder() {
    if (!this.path.startsWith('/') || this.path === '/Applications') return;
    try {
      const p = this.vfs.uniqueName(this.path, 'untitled folder');
      this.vfs.mkdir(p);
      this.sel = new Set([p]);
      this.paintSel();
    } catch (err) { this.os.alert({ title: 'Can’t create folder', message: err.message }); }
  }

  quickLook(e) {
    if (e?.type === 'file') this.os.quickLook(e.path);
  }

  renderColumns(p) {
    const wrap = h('div.f-cols');
    const parts = p.split('/').filter(Boolean);
    const startAt = p.startsWith(HOME) ? HOME.split('/').filter(Boolean).length : 0;
    const dirs = [];
    for (let i = startAt; i <= parts.length; i++) dirs.push('/' + parts.slice(0, i).join('/'));
    const selPath = [...this.sel][0];
    for (const d of dirs) {
      const col = h('div.f-col');
      for (const e of this.vfs.ls(d)) {
        const onPath = p === e.path || p.startsWith(e.path + '/') || selPath === e.path;
        const row = h('div.f-colrow.f-item', { class: onPath ? 'sel' : '', dataset: { path: e.path } }, h('span.fi-mini', { html: this.icon(e) }), h('span.f-colname', { text: e.name }), e.type === 'dir' ? h('span.f-chev', { text: '›' }) : null);
        row.addEventListener('click', () => { if (e.type === 'dir') this.go(e.path); else { this.sel = new Set([e.path]); this.lastSel = e.path; this.render(); } });
        row.addEventListener('dblclick', () => this.open(e));
        row.addEventListener('contextmenu', (ev) => { this.sel = new Set([e.path]); this.itemMenu(ev, e); });
        col.append(row);
      }
      wrap.append(col);
    }
    const sel = selPath && this.vfs.node(selPath);
    if (sel && sel.type === 'file') {
      const info = this.vfs.info(sel);
      wrap.append(h('div.f-col.f-prev', {}, h('div.f-prev-ic', { html: this.os.iconFor({ ...info, name: this.vfs.base(selPath), path: selPath }) }), h('b', { text: this.vfs.base(selPath) }), h('small', { text: `${kindOf(selPath, 'file')} · ${formatSize(info.size)}` }), h('small', { text: `Modified ${fmtDate(info.modified)}` }), h('button.btn', { text: 'Open', onclick: () => this.os.openPath(selPath) })));
    }
    this.content.append(wrap);
    requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
  }

  key(e) {
    const list = this.list || [];
    const cur = list.findIndex((x) => x.path === this.lastSel);
    const k = e.key.toLowerCase();
    const sel = [...this.sel];
    const real = this.path.startsWith('/') && this.path !== '/Applications';
    if (e.metaKey && k === 'c' && sel.length) { e.preventDefault(); this.os.copyFiles(sel); }
    else if (e.metaKey && k === 'x' && sel.length) { e.preventDefault(); this.os.copyFiles(sel, true); }
    else if (e.metaKey && k === 'v' && real) { e.preventDefault(); this.os.pasteFiles(this.path); }
    else if (e.metaKey && k === 'a') { e.preventDefault(); this.sel = new Set(list.map((x) => x.path)); this.paintSel(); }
    else if (e.metaKey && k === 'd' && sel.length && real) { e.preventDefault(); sel.forEach((p) => this.vfs.node(p)?.type === 'file' && this.vfs.cp(p, this.vfs.uniqueName(this.path, this.vfs.base(p).replace(/(\.[^.]+)?$/, ' copy$1')))); }
    else if (e.metaKey && k === 'i' && sel.length) { e.preventDefault(); sel.forEach((p) => this.os.getInfo(p)); }
    else if (e.metaKey && e.shiftKey && k === 'n') { e.preventDefault(); this.newFolder(); }
    else if (e.metaKey && e.key === 'ArrowUp') { e.preventDefault(); if (this.path.startsWith('/') && this.path !== '/') this.go(this.vfs.parent(this.path)); }
    else if (e.metaKey && (e.key === 'ArrowDown' || k === 'o') && sel.length) { e.preventDefault(); this.open(list.find((x) => x.path === sel[0])); }
    else if (e.key === 'Enter' && sel.length === 1) { e.preventDefault(); this.os.rename(sel[0]); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && e.metaKey && sel.length && this.path.startsWith('/')) {
      e.preventDefault();
      try { sel.forEach((p) => this.vfs.trash(p)); this.os.audio.trash(); } catch (err) { this.os.alert({ title: 'Can’t move to Trash', message: err.message }); }
    } else if (e.key === ' ' && sel.length === 1) { e.preventDefault(); this.quickLook(list.find((x) => x.path === sel[0])); }
    else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key) && list.length) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      const n = list[Math.max(0, Math.min(list.length - 1, cur + step))];
      this.sel = new Set([n.path]); this.lastSel = n.path; this.paintSel();
    } else if (/^[a-z0-9]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) {
      // type-to-select
      clearTimeout(this.typeT);
      this.typed = (this.typed || '') + e.key.toLowerCase();
      this.typeT = setTimeout(() => { this.typed = ''; }, 900);
      const hit = list.find((x) => x.name.toLowerCase().startsWith(this.typed));
      if (hit) { this.sel = new Set([hit.path]); this.lastSel = hit.path; this.paintSel(); this.content.querySelector('.f-item.sel')?.scrollIntoView({ block: 'nearest' }); }
    }
  }
}
