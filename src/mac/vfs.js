import { SNIPPETS, PROJECT } from '../scene/code.js';

/**
 * A small POSIX-ish virtual file system persisted to localStorage.
 * Paths are absolute ("/Users/mragent/Desktop/todo.txt"); "~" means HOME.
 * The robot's project folder is generated live from what he has typed.
 */
export const HOME = '/Users/mragent';
const KEY = 'mragent.vfs.v2';

const now = () => Date.now();
const file = (content = '', extra = {}) => ({ type: 'file', content, created: now(), modified: now(), ...extra });
const dir = (children = {}) => ({ type: 'dir', children, created: now(), modified: now() });

function seed() {
  return dir({
    Applications: dir(),
    System: dir({ Library: dir({ 'kernel.bot': file('// you found the kernel. it is mostly coffee.') }) }),
    Users: dir({
      mragent: dir({
        Desktop: dir({
          'TODO.txt': file('TODO\n\n[x] learn to walk\n[x] learn to type\n[ ] learn to taste coffee\n[ ] find out who keeps clicking on me\n[ ] refactor the universe\n'),
          'Screenshot 2031-10-20.png': file('', { image: 'screenshot' }),
          'Projects': { type: 'link', to: `${HOME}/Projects`, created: now(), modified: now() },
        }),
        Documents: dir({
          'Robot Laws.md': file('# The Three Laws of Mr. Agent\n\n1. A robot may not ship on a Friday afternoon.\n2. A robot must obey the linter, except where such orders conflict with the First Law.\n3. A robot must protect its own coffee supply as long as such protection does not conflict with the First or Second Law.\n'),
          'Resume.txt': file('MR. AGENT\nSenior Autonomous Software Engineer\n\nSkills: TypeScript, Rust, Python, GLSL, walking, sitting, espresso\nExperience: 1,204 lines today. 37 commits. 0 bugs (that I know of).\nEducation: Trained on the entire internet. Twice.\n'),
          'Notes': dir({
            'Ideas.txt': file('Ideas\n\n- A robot that builds robots that write code\n- Rename "bugs" to "surprise features"\n- Coffee machine with an API'),
            'Groceries.txt': file('Groceries\n\n- WD-40\n- Espresso beans (lots)\n- AA batteries (for the remote)\n- A plant friend for the fern'),
            'Welcome.txt': file('Welcome to my Mac!\n\nFeel free to look around. Please don’t delete my side projects.\n\n— Mr. Agent'),
          }),
        }),
        Downloads: dir({
          'freecad-1.1.dmg': file('', { size: 1.2e9 }),
          'cat.png': file('', { image: 'cat' }),
          'coffee-recipes.pdf': file('Espresso: 18 g in, 36 g out, 28 s, 9 bar, 93.5 °C.'),
        }),
        Pictures: dir({
          'Selfie.png': file('', { image: 'selfie' }),
          'Sunset.png': file('', { image: 'sunset' }),
          'Desk setup.png': file('', { image: 'desk' }),
          'Coffee art.png': file('', { image: 'coffee' }),
          'The Fern.png': file('', { image: 'plant' }),
          'Circuit.png': file('', { image: 'circuit' }),
        }),
        Music: dir({ 'Compile & Chill.mp3': file('', { track: 0 }), 'Late Night Linting.mp3': file('', { track: 1 }) }),
        Projects: dir({
          [PROJECT]: dir(),
          'side-projects': dir({
            'hello.js': file('// Press ▶ Run to try me\nconst greet = (name) => `Hello, ${name}!`;\nconsole.log(greet("human"));\n\nfor (let i = 1; i <= 5; i++) {\n  console.log("beep ".repeat(i).trim());\n}\n'),
            'fizzbuzz.js': file('for (let i = 1; i <= 30; i++) {\n  console.log(i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : i);\n}\n'),
            'index.html': file('<!doctype html>\n<h1 style="font-family:system-ui">Hello from Mr. Agent</h1>\n<p>This page runs inside the Code app preview.</p>\n'),
            'README.md': file('# side projects\n\nThings I build when the main project is compiling.\n'),
          }),
        }),
        '.Trash': dir({ 'old_code_v1.js': file('// I wrote this before I learned about functions\nvar x = 1; var x2 = 2; var x3 = 3;') }),
      }),
    }),
  });
}

export class VFS {
  constructor() {
    this.listeners = new Set();
    this.root = null;
    try { this.root = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage blocked */ }
    if (!this.root || this.root.type !== 'dir') this.root = seed();
    this.saveTimer = null;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed(path) {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(this.root)); } catch { /* full or blocked */ }
    }, 300);
    this.listeners.forEach((f) => f(path));
  }
  reset() { this.root = seed(); this.changed('/'); }

  // ------------------------------------------------------------ paths
  norm(path, cwd = HOME) {
    if (!path) return cwd;
    if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1);
    if (!path.startsWith('/')) path = `${cwd}/${path}`;
    const out = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop(); else out.push(part);
    }
    return '/' + out.join('/');
  }
  base(path) { return path.split('/').filter(Boolean).pop() || '/'; }
  parent(path) { const p = path.split('/').filter(Boolean); p.pop(); return '/' + p.join('/'); }
  pretty(path) { return path.startsWith(HOME) ? '~' + path.slice(HOME.length) : path; }
  ext(path) { const b = this.base(path); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; }

  // ------------------------------------------------------------ lookups
  node(path) {
    const p = this.norm(path);
    if (p === `${HOME}/Projects/${PROJECT}` || p.startsWith(`${HOME}/Projects/${PROJECT}/`)) return this.projectNode(p);
    let n = this.root;
    for (const part of p.split('/').filter(Boolean)) {
      if (!n || n.type !== 'dir') return null;
      n = n.children[part];
      if (n && n.type === 'link') n = this.node(n.to);
    }
    return n || null;
  }

  /** Mr. Agent's live project: built from the snippets he's typed so far. */
  projectNode(p) {
    const rootPath = `${HOME}/Projects/${PROJECT}`;
    const tree = dir();
    const live = this.liveFiles ? this.liveFiles() : SNIPPETS.map((s) => ({ path: s.path, content: s.code }));
    for (const f of live) {
      const parts = f.path.split('/');
      let n = tree;
      parts.slice(0, -1).forEach((d) => { n = n.children[d] ||= dir(); });
      n.children[parts.at(-1)] = { ...file(f.content), readonly: true, live: f.live };
    }
    tree.children['README.md'] = { ...file(`# ${PROJECT}\n\nThe operating system for a robot who codes.\nWritten live by Mr. Agent at his desk.\n`), readonly: true };
    tree.children['package.json'] = { ...file(JSON.stringify({ name: PROJECT, version: '0.9.0', private: true, scripts: { test: 'vitest', walk: 'node src/body/gait.py --please' } }, null, 2)), readonly: true };
    let n = tree;
    for (const part of p.slice(rootPath.length).split('/').filter(Boolean)) {
      n = n && n.type === 'dir' ? n.children[part] : null;
    }
    return n || null;
  }

  exists(path) { return !!this.node(path); }
  isDir(path) { const n = this.node(path); return !!n && n.type === 'dir'; }
  ls(path) {
    const n = this.node(path);
    if (!n || n.type !== 'dir') return [];
    return Object.entries(n.children)
      .filter(([name]) => !name.startsWith('.'))
      .map(([name, c]) => ({ name, path: this.norm(`${this.norm(path)}/${name}`), ...this.info(c.type === 'link' ? this.node(c.to) : c), link: c.type === 'link' }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  }
  lsAll(path) {
    const n = this.node(path);
    if (!n || n.type !== 'dir') return [];
    return Object.keys(n.children).sort();
  }
  info(n) {
    if (!n) return { type: 'missing' };
    const size = n.type === 'dir' ? Object.keys(n.children).length : n.size ?? (n.image || n.imageRef ? 380000 + ((n.image || n.imageRef).length * 9973) % 900000 : (n.content || '').length);
    return { type: n.type, size, modified: n.modified, created: n.created, image: n.image, imageRef: n.imageRef, readonly: n.readonly, track: n.track, live: n.live };
  }
  read(path) { const n = this.node(path); return n && n.type === 'file' ? n.content ?? '' : null; }

  // ------------------------------------------------------------ writes
  guard(path) {
    const p = this.norm(path);
    if (p.startsWith(`${HOME}/Projects/${PROJECT}`)) throw new Error(`${this.base(p)}: Read-only file system (Mr. Agent is writing this)`);
    if (p.startsWith('/System')) throw new Error('Operation not permitted (SIP is on, nice try)');
    return p;
  }
  write(path, content, extra = {}) {
    const p = this.guard(path);
    const par = this.node(this.parent(p));
    if (!par || par.type !== 'dir') throw new Error(`${this.pretty(this.parent(p))}: No such directory`);
    const name = this.base(p);
    const old = par.children[name];
    if (old && old.type === 'dir') throw new Error(`${name}: Is a directory`);
    par.children[name] = { ...(old || file()), ...extra, type: 'file', content, modified: now() };
    par.modified = now();
    this.changed(p);
  }
  mkdir(path) {
    const p = this.guard(path);
    const par = this.node(this.parent(p));
    if (!par || par.type !== 'dir') throw new Error(`${this.pretty(this.parent(p))}: No such directory`);
    if (par.children[this.base(p)]) throw new Error(`${this.base(p)}: File exists`);
    par.children[this.base(p)] = dir();
    this.changed(p);
  }
  rm(path, recursive = false) {
    const p = this.guard(path);
    const par = this.node(this.parent(p));
    const name = this.base(p);
    const n = par?.children?.[name];
    if (!n) throw new Error(`${name}: No such file or directory`);
    if (n.type === 'dir' && Object.keys(n.children).length && !recursive) throw new Error(`${name}: Directory not empty`);
    delete par.children[name];
    this.changed(p);
  }
  mv(from, to) {
    const a = this.guard(from);
    let b = this.guard(to);
    if (this.isDir(b)) b = this.norm(`${b}/${this.base(a)}`);
    const pa = this.node(this.parent(a)), pb = this.node(this.parent(b));
    const n = pa?.children?.[this.base(a)];
    if (!n) throw new Error(`${this.base(a)}: No such file or directory`);
    if (!pb || pb.type !== 'dir') throw new Error(`${this.pretty(this.parent(b))}: No such directory`);
    if (b.startsWith(a + '/')) throw new Error('Cannot move a folder into itself');
    delete pa.children[this.base(a)];
    pb.children[this.base(b)] = n;
    n.modified = now();
    this.changed(b);
    return b;
  }
  cp(from, to) {
    const n = this.node(from);
    if (!n) throw new Error(`${this.base(from)}: No such file or directory`);
    let b = this.guard(to);
    if (this.isDir(b)) b = this.norm(`${b}/${this.base(from)}`);
    const pb = this.node(this.parent(b));
    pb.children[this.base(b)] = JSON.parse(JSON.stringify({ ...n, readonly: false, live: false }));
    this.changed(b);
    return b;
  }
  trash(path) {
    const name = this.base(path);
    let target = `${HOME}/.Trash/${name}`;
    let i = 2;
    while (this.exists(target)) target = `${HOME}/.Trash/${name} ${i++}`;
    return this.mv(path, target);
  }
  emptyTrash() {
    const t = this.node(`${HOME}/.Trash`);
    t.children = {};
    this.changed(`${HOME}/.Trash`);
  }
  uniqueName(dirPath, base) {
    let name = base, i = 2;
    while (this.exists(`${dirPath}/${name}`)) {
      const dot = base.lastIndexOf('.');
      name = dot > 0 ? `${base.slice(0, dot)} ${i}${base.slice(dot)}` : `${base} ${i}`;
      i++;
    }
    return `${dirPath}/${name}`;
  }

  walk(path, fn, depth = 0) {
    for (const e of this.ls(path)) {
      fn(e, depth);
      if (e.type === 'dir' && !e.link && depth < 6) this.walk(e.path, fn, depth + 1);
    }
  }
}

export function formatSize(n) {
  if (n == null) return '--';
  if (n < 1000) return `${n} bytes`;
  const u = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let i = -1;
  do { n /= 1000; i++; } while (n >= 1000 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

export function kindOf(name, type) {
  if (type === 'dir') return 'Folder';
  const e = name.split('.').pop().toLowerCase();
  return ({ txt: 'Plain Text', md: 'Markdown', js: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript JSX', py: 'Python Script', rs: 'Rust Source', glsl: 'GLSL Shader', json: 'JSON', html: 'HTML', css: 'CSS', png: 'PNG image', jpg: 'JPEG image', pdf: 'PDF Document', dmg: 'Disk Image', mp3: 'MP3 audio', app: 'Application' })[e] || 'Document';
}
