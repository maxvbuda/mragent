import { h, esc } from '../ui.js';
import { HOME } from '../vfs.js';
import { tokenize, PROJECT } from '../../scene/code.js';
import { fileIcon, glyph } from '../icons.js';
import { runJS } from './terminal.js';

const ROOT = `${HOME}/Projects`;
const LANG = { js: 'ts', ts: 'ts', tsx: 'ts', json: 'ts', rs: 'rs', py: 'py', glsl: 'glsl', css: 'ts', html: 'html', md: 'md', txt: 'md' };
const NAMES = { js: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript JSX', json: 'JSON', rs: 'Rust', py: 'Python', glsl: 'GLSL', css: 'CSS', html: 'HTML', md: 'Markdown', txt: 'Plain Text' };

export default {
  id: 'code', name: 'Code', icon: 'code', single: true,
  about: 'Code — the editor Mr. Agent lives in.',
  menus: (os, win) => [{ title: 'File', items: [
    { label: 'New File', action: () => win?.code?.newFile() },
    { label: 'Save', shortcut: '⌘S', action: () => win?.code?.save() },
    { label: 'Run', shortcut: '⌘↩', action: () => win?.code?.run() },
  ] }, { title: 'Go', items: [
    { label: 'Watch Mr. Agent (live)', action: () => win?.code?.openLive() },
  ] }],
  launch(os, args = {}) {
    let w;
    const c = new Editor(os, () => w);
    w = os.createWindow({
      app: this, title: `${PROJECT} — Code`, width: 980, height: 600, minWidth: 560, minHeight: 300, sidebarWidth: 220, className: 'win-code', dark: true,
      body: (b) => b.append(c.el),
      onArgs: (a) => c.handleArgs(a),
      onClose: () => c.dispose(),
      state: () => (c.cur ? { path: c.cur.path } : { live: true }),
    });
    w.code = c;
    c.handleArgs(args.path || args.live ? args : { live: true });
    return w;
  },
};

class Editor {
  constructor(os, getWin) {
    this.os = os;
    this.vfs = os.vfs;
    this.win = getWin;
    this.tabs = [];
    this.cur = null;
    this.openDirs = new Set([ROOT, `${ROOT}/${PROJECT}`, `${ROOT}/${PROJECT}/src`, `${ROOT}/side-projects`]);
    this.tree = h('div.c-tree.scroll');
    this.side = h('div.c-side', {}, h('div.c-side-h', {}, h('span', { text: 'EXPLORER' }), h('button.c-icon-btn', { html: glyph.plus, title: 'New File', onclick: () => this.newFile() })), this.tree);
    this.tabBar = h('div.c-tabs');
    this.runBtn = h('button.c-run', { html: `${glyph.play}<span>Run</span>`, onclick: () => this.run() });
    this.liveBadge = h('span.c-live', { text: '● LIVE · Mr. Agent is typing' });
    this.gutter = h('div.c-gutter');
    this.pre = h('pre.c-pre');
    this.ta = h('textarea.c-ta', { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off', 'aria-label': 'Editor' });
    this.edWrap = h('div.c-ed', {}, this.gutter, h('div.c-code', {}, this.pre, this.ta));
    this.output = h('div.c-output.scroll');
    this.preview = h('iframe.c-preview', { sandbox: 'allow-scripts', title: 'Preview' });
    this.panel = h('div.c-panel', {}, h('div.c-panel-h', {}, h('span', { text: 'OUTPUT' }), h('button.c-icon-btn', { text: '×', title: 'Close panel', onclick: () => this.panel.classList.remove('open') })), this.output, this.preview);
    this.status = h('div.c-status');
    this.empty = h('div.c-empty', {}, h('div', { html: fileIcon('x.ts') }), h('b', { text: 'Open a file from the Explorer' }), h('small', { text: 'or watch Mr. Agent code live' }), h('button.btn.primary', { text: 'Watch live', onclick: () => this.openLive() }));
    this.main = h('div.c-main', {}, h('div.c-top', {}, this.tabBar, this.liveBadge, this.runBtn), this.edWrap, this.empty, this.panel, this.status);
    this.el = h('div.c-root', {}, this.side, this.main);

    this.ta.addEventListener('input', () => { if (this.cur) { this.cur.text = this.ta.value; this.cur.dirty = true; this.paint(); this.renderTabs(); } });
    this.ta.addEventListener('scroll', () => { this.pre.style.transform = `translate(${-this.ta.scrollLeft}px, ${-this.ta.scrollTop}px)`; this.gutter.scrollTop = this.ta.scrollTop; });
    this.ta.addEventListener('keydown', (e) => this.key(e));
    this.ta.addEventListener('keyup', () => this.renderStatus());
    this.ta.addEventListener('click', () => this.renderStatus());
    this.off = os.on('fs', () => this.renderTree());
    this.timer = setInterval(() => this.tickLive(), 250);
    this.renderTree();
    this.select(null);
  }

  dispose() { this.off?.(); clearInterval(this.timer); }

  handleArgs(a = {}) {
    if (a.live) this.openLive();
    if (a.path) this.open(a.path);
  }

  liveSnip() { return this.os.ctx.screen.snip; }
  livePath() { return `${ROOT}/${PROJECT}/${this.liveSnip().path}`; }
  openLive() { this.open(this.livePath(), { follow: true }); }

  open(path, { follow = false } = {}) {
    const text = this.vfs.read(path);
    if (text == null) return;
    let tab = this.tabs.find((t) => t.path === path);
    const n = this.vfs.node(path);
    if (!tab) { tab = { path, text, dirty: false, readonly: !!n.readonly, follow }; this.tabs.push(tab); }
    tab.follow = follow || tab.follow;
    let p = this.vfs.parent(path);
    while (p.startsWith(ROOT)) { this.openDirs.add(p); p = this.vfs.parent(p); }
    this.select(tab);
    this.renderTree();
  }

  select(tab) {
    this.cur = tab;
    const has = !!tab;
    this.edWrap.hidden = !has;
    this.empty.hidden = has;
    if (has) {
      this.ta.value = tab.text;
      this.ta.readOnly = tab.readonly;
      this.paint();
      this.win()?.setTitle(`${this.vfs.base(tab.path)} — ${PROJECT}`);
    }
    this.renderTabs();
    this.renderStatus();
    this.tree.querySelectorAll('.c-node').forEach((x) => x.classList.toggle('on', x.dataset.path === tab?.path));
  }

  async close(tab) {
    if (tab.dirty && !(await this.os.confirm(`Close “${this.vfs.base(tab.path)}” without saving?`, 'Don’t Save'))) return;
    this.tabs = this.tabs.filter((t) => t !== tab);
    if (this.cur === tab) this.select(this.tabs.at(-1) || null);
    else this.renderTabs();
  }

  tickLive() {
    const s = this.os.ctx.screen;
    for (const t of this.tabs) {
      if (!t.readonly) continue;
      const fresh = this.vfs.read(t.path);
      if (fresh != null && fresh !== t.text) {
        t.text = fresh;
        if (t === this.cur) {
          const atBottom = this.ta.scrollTop + this.ta.clientHeight >= this.ta.scrollHeight - 40;
          this.ta.value = fresh;
          this.paint();
          if (atBottom || t.follow) this.ta.scrollTop = this.ta.scrollHeight;
        }
      }
    }
    // follow the robot to his next file
    const followTab = this.tabs.find((t) => t.follow);
    if (followTab && followTab.path !== this.livePath() && s.phase === 'typing') {
      followTab.follow = false;
      this.open(this.livePath(), { follow: true });
    }
    const isLive = this.cur && this.cur.path === this.livePath();
    this.liveBadge.hidden = !isLive;
    this.liveBadge.textContent = s.phase === 'typing' ? (this.os.ctx.brain.typing ? '● LIVE · Mr. Agent is typing' : '● LIVE · Mr. Agent is away') : s.phase === 'testing' ? '● LIVE · running tests' : '● LIVE · committing';
  }

  lang() { return LANG[this.vfs.ext(this.cur?.path || '')] || 'md'; }

  paint() {
    const text = this.ta.value;
    const lang = this.lang();
    const lines = text.split('\n');
    this.pre.innerHTML = lines.map((l) => (lang === 'md' || lang === 'html' ? highlightSimple(l, lang) : tokenize(l, lang).map(([k, t]) => `<span class="tk-${k}">${esc(t)}</span>`).join('')) || ' ').join('\n') + '\n';
    this.gutter.innerHTML = lines.map((_, i) => `<div>${i + 1}</div>`).join('');
    const ext = this.vfs.ext(this.cur.path);
    this.runBtn.hidden = !['js', 'html'].includes(ext);
  }

  renderTabs() {
    this.tabBar.innerHTML = '';
    for (const t of this.tabs) {
      const tab = h('div.c-tab', { class: t === this.cur ? 'on' : '', onclick: () => this.select(t) },
        h('span.c-tab-ic', { html: fileIcon(t.path) }),
        h('span', { text: this.vfs.base(t.path) }),
        t.readonly ? h('span.c-ro', { text: '🔒' }) : null,
        h('button.c-x', { text: t.dirty ? '●' : '×', 'aria-label': 'Close tab', onclick: (e) => { e.stopPropagation(); this.close(t); } }));
      this.tabBar.append(tab);
    }
  }

  renderTree() {
    this.tree.innerHTML = '';
    const walk = (path, depth) => {
      for (const e of this.vfs.ls(path)) {
        const isDir = e.type === 'dir';
        const open = this.openDirs.has(e.path);
        const node = h('div.c-node', { dataset: { path: e.path }, style: { paddingLeft: `${10 + depth * 12}px` }, class: this.cur?.path === e.path ? 'on' : '' },
          h('span.c-caret', { text: isDir ? (open ? '▾' : '▸') : '' }),
          isDir ? null : h('span.c-node-ic', { html: fileIcon(e.name) }),
          h('span', { text: e.name }),
          e.live ? h('span.c-dot', { title: 'Mr. Agent is editing this' }) : null);
        node.addEventListener('click', () => {
          if (isDir) { open ? this.openDirs.delete(e.path) : this.openDirs.add(e.path); this.renderTree(); }
          else this.open(e.path);
        });
        node.addEventListener('contextmenu', (ev) => this.os.contextMenu(ev, [
          { label: 'Open', disabled: isDir, action: () => this.open(e.path) },
          { label: 'Reveal in Finder', action: () => this.os.launch('finder', { path: isDir ? e.path : this.vfs.parent(e.path), newWindow: true }) },
          { label: 'Open in Terminal', action: () => this.os.launch('terminal', { cmd: `cd ${isDir ? e.path : this.vfs.parent(e.path)}`, newWindow: true }) },
          { sep: true },
          { label: 'Rename…', disabled: !!e.readonly, action: () => this.os.rename(e.path) },
          { label: 'Delete', disabled: !!e.readonly, action: () => { try { this.vfs.trash(e.path); } catch (err) { this.os.alert({ title: 'Can’t delete', message: err.message }); } } },
        ]));
        this.tree.append(node);
        if (isDir && open) walk(e.path, depth + 1);
      }
    };
    this.tree.append(h('div.c-root-h', { text: '▾ PROJECTS' }));
    walk(ROOT, 0);
  }

  renderStatus() {
    const t = this.cur;
    this.status.innerHTML = '';
    if (!t) { this.status.append(h('span', { text: '⑂ main' })); return; }
    const before = this.ta.value.slice(0, this.ta.selectionStart);
    const ln = before.split('\n').length, col = before.length - before.lastIndexOf('\n');
    this.status.append(h('span', { text: '⑂ main' }), h('span', { text: t.readonly ? '🔒 read-only (Mr. Agent’s file)' : t.dirty ? '● unsaved' : '✓ saved' }), h('span.spacer'),
      h('span', { text: `Ln ${ln}, Col ${col}` }), h('span', { text: 'Spaces: 2' }), h('span', { text: NAMES[this.vfs.ext(t.path)] || 'Plain Text' }), h('span', { text: '🤖 Mr. Agent' }));
  }

  key(e) {
    const ta = this.ta;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); this.run(); return; }
    if (ta.readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const line = ta.value.slice(0, ta.selectionStart).split('\n').pop();
      let indent = line.match(/^\s*/)[0];
      if (/[{[(:]\s*$/.test(line)) indent += '  ';
      document.execCommand('insertText', false, '\n' + indent);
    } else if ('([{"\'`'.includes(e.key) && ta.selectionStart === ta.selectionEnd) {
      const pair = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }[e.key];
      e.preventDefault();
      document.execCommand('insertText', false, e.key + pair);
      ta.selectionStart = ta.selectionEnd = ta.selectionStart - 1;
    }
  }

  save() {
    const t = this.cur;
    if (!t) return;
    if (t.readonly) { this.os.alert({ title: 'This file is read-only', message: 'Mr. Agent is writing it right now. Duplicate it into side-projects if you want to tinker.' }); return; }
    try {
      this.vfs.write(t.path, this.ta.value);
      t.dirty = false;
      this.renderTabs();
      this.renderStatus();
    } catch (err) { this.os.alert({ title: 'Couldn’t save', message: err.message }); }
  }

  newFile() {
    this.os.prompt({ title: 'New File', message: 'Name (in side-projects):', value: 'scratch.js' }).then((name) => {
      if (!name) return;
      const p = this.vfs.uniqueName(`${ROOT}/side-projects`, name);
      this.vfs.write(p, name.endsWith('.js') ? '// Write some JavaScript and press ▶ Run\nconsole.log("Hello from " + navigator.platform);\n' : '');
      this.open(p);
    });
  }

  run() {
    const t = this.cur;
    if (!t) return;
    const ext = this.vfs.ext(t.path);
    this.panel.classList.add('open');
    if (ext === 'html') {
      this.output.hidden = true;
      this.preview.hidden = false;
      this.preview.srcdoc = this.ta.value;
      return;
    }
    this.output.hidden = false;
    this.preview.hidden = true;
    const t0 = performance.now();
    const res = runJS(this.ta.value);
    const ms = (performance.now() - t0).toFixed(1);
    this.output.innerHTML = '';
    this.output.append(h('div.c-out-cmd', { text: `$ node ${this.vfs.base(t.path)}` }), h('pre', { text: res || '(no output)' }), h('div.c-out-done', { text: `✓ finished in ${ms} ms on 1 of 1,024 cores` }));
  }
}

function highlightSimple(line, lang) {
  if (lang === 'md') {
    if (/^#{1,6}\s/.test(line)) return `<span class="tk-keyword">${esc(line)}</span>`;
    return esc(line).replace(/(`[^`]+`)/g, '<span class="tk-string">$1</span>').replace(/(\*\*[^*]+\*\*)/g, '<span class="tk-type">$1</span>').replace(/^(\s*[-*\d.]+\s)/, '<span class="tk-number">$1</span>');
  }
  return esc(line).replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="tk-keyword">$2</span>').replace(/([\w-]+)=(&quot;|")/g, '<span class="tk-prop">$1</span>=$2').replace(/("[^"]*")/g, '<span class="tk-string">$1</span>');
}
