import { h } from '../ui.js';
import { HOME, formatSize } from '../vfs.js';
import { APPS } from './index.js';
import { SPECS } from './about.js';

const HOST = 'Mr-Agents-MacBook-Pro';

export default {
  id: 'terminal', name: 'Terminal', icon: 'terminal', single: false,
  about: 'Terminal — zsh 9.0 (robot edition).',
  launch(os, args = {}) {
    const t = new Shell(os);
    const w = os.createWindow({
      app: this, title: 'mragent — -zsh — 92×28', width: 760, height: 470, className: 'win-term', dark: true,
      body: (b) => b.append(t.el),
      onClose: () => t.dispose(),
    });
    t.win = w;
    if (args.cmd) t.run(args.cmd);
    setTimeout(() => t.input.focus(), 50);
    return w;
  },
};

class Shell {
  constructor(os) {
    this.os = os;
    this.vfs = os.vfs;
    this.cwd = HOME;
    this.hist = JSON.parse(safeGet('mragent.zsh_history') || '[]');
    this.hi = this.hist.length;
    this.env = { HOME, USER: 'mragent', SHELL: '/bin/zsh', PATH: '/opt/homebrew/bin:/usr/bin:/bin', TERM: 'xterm-256color', LANG: 'en_US.UTF-8', COFFEE: 'espresso' };
    this.out = h('div.t-out');
    this.prompt = h('span.t-prompt');
    this.input = h('input.t-input', { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Terminal input' });
    this.line = h('div.t-line', {}, this.prompt, this.input);
    this.el = h('div.t-root', { onclick: () => { if (!getSelection().toString()) this.input.focus(); } }, this.out, this.line);
    this.input.addEventListener('keydown', (e) => this.key(e));
    const d = new Date();
    this.print(`Last login: ${d.toDateString()} ${d.toTimeString().slice(0, 8)} on ttys001`);
    this.print('Welcome to zsh on Mr. Agent’s Mac. Type <b>help</b> to see what I can do.', 'html');
    this.setPrompt();
  }

  dispose() { this.running?.stop?.(); }

  setPrompt() { this.prompt.innerHTML = `<span class="tp-user">mragent@${HOST}</span> <span class="tp-dir">${esc(this.vfs.pretty(this.cwd).split('/').pop() || '/')}</span> % `; }

  print(text = '', mode = 'text', cls = '') {
    const div = h('div.t-l', { class: cls });
    if (mode === 'html') div.innerHTML = text; else div.textContent = text;
    this.out.append(div);
    this.scroll();
    return div;
  }
  scroll() { this.el.scrollTop = this.el.scrollHeight; }

  key(e) {
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (this.running) { this.running.stop(); this.print('^C'); this.finish(); }
      else { this.echo(this.input.value + '^C'); this.input.value = ''; }
      return;
    }
    if (this.running) {
      if (this.running.key) this.running.key(e);
      else e.preventDefault();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); this.out.innerHTML = ''; return; }
    if (e.metaKey && e.key.toLowerCase() === 'k') { e.preventDefault(); this.out.innerHTML = ''; return; }
    if (e.key === 'Enter') { e.preventDefault(); const v = this.input.value; this.input.value = ''; this.run(v); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (this.hi > 0) this.input.value = this.hist[--this.hi] || ''; return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); this.hi = Math.min(this.hist.length, this.hi + 1); this.input.value = this.hist[this.hi] || ''; return; }
    if (e.key === 'Tab') { e.preventDefault(); this.complete(); }
  }

  complete() {
    const v = this.input.value;
    const parts = v.split(/\s+/);
    const last = parts.at(-1);
    let options;
    if (parts.length === 1) options = Object.keys(CMDS).filter((c) => c.startsWith(last));
    else {
      const dirPart = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : '';
      const base = last.slice(dirPart.length);
      const dirAbs = this.vfs.norm(dirPart || '.', this.cwd);
      options = this.vfs.lsAll(dirAbs).filter((n) => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.'))).map((n) => dirPart + n + (this.vfs.isDir(`${dirAbs}/${n}`) ? '/' : ''));
    }
    if (options.length === 1) { parts[parts.length - 1] = options[0].replace(/ /g, '\\ '); this.input.value = parts.join(' ') + (options[0].endsWith('/') ? '' : ' '); }
    else if (options.length > 1) {
      this.echo(v);
      this.print(options.join('   '));
      let pre = options[0];
      for (const o of options) while (!o.startsWith(pre)) pre = pre.slice(0, -1);
      parts[parts.length - 1] = pre;
      this.input.value = parts.join(' ');
    }
  }

  echo(cmd) { this.print(`${this.prompt.innerHTML}${esc(cmd)}`, 'html', 't-echo'); }

  async run(raw) {
    this.echo(raw);
    const line = raw.trim();
    if (line) {
      this.hist.push(line);
      this.hist = this.hist.slice(-300);
      this.hi = this.hist.length;
      safeSet('mragent.zsh_history', JSON.stringify(this.hist));
    }
    this.line.hidden = true;
    for (const chunk of line.split(/\s*&&\s*/).filter(Boolean)) {
      const ok = await this.exec(chunk);
      if (!ok) break;
    }
    this.finish();
  }

  finish() {
    this.running = null;
    this.line.hidden = false;
    this.setPrompt();
    this.scroll();
    setTimeout(() => this.input.focus(), 0);
  }

  async exec(line) {
    let redirect = null;
    const m = line.match(/^(.*?)\s*(>>?)\s*([^>]+)$/);
    if (m && !/^(echo|printf)\s+["'].*>.*["']$/.test(line)) { line = m[1]; redirect = { append: m[2] === '>>', path: m[3].trim() }; }
    const stages = line.split(/\s+\|\s+/);
    let text = null;
    let ok = true;
    for (let i = 0; i < stages.length; i++) {
      const argv = this.tokenize(stages[i]);
      if (!argv.length) continue;
      const [cmd, ...args] = argv;
      const fn = CMDS[cmd] || (ALIASES[cmd] && CMDS[ALIASES[cmd]]);
      if (!fn) { this.print(`zsh: command not found: ${cmd}`, 'text', 't-err'); return false; }
      try {
        const res = await fn.call(this, args, text, { piped: i < stages.length - 1 || !!redirect });
        text = res == null ? '' : String(res);
      } catch (err) {
        this.print(`${cmd}: ${err.message}`, 'text', 't-err');
        ok = false;
        text = '';
        break;
      }
    }
    if (redirect && ok) {
      const p = this.vfs.norm(redirect.path, this.cwd);
      try {
        const prev = redirect.append ? this.vfs.read(p) || '' : '';
        this.vfs.write(p, prev + text + (text.endsWith('\n') || !text ? '' : '\n'));
      } catch (err) { this.print(`zsh: ${err.message}`, 'text', 't-err'); return false; }
    } else if (text) {
      for (const l of text.replace(/\n$/, '').split('\n')) this.print(l);
    }
    return ok;
  }

  tokenize(s) {
    const out = [];
    let cur = '', q = null, any = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === q) q = null; else cur += c; continue; }
      if (c === '"' || c === "'") { q = c; any = true; continue; }
      if (c === '\\' && i + 1 < s.length) { cur += s[++i]; any = true; continue; }
      if (/\s/.test(c)) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
      cur += c;
    }
    if (cur || any) out.push(cur);
    return out.map((t) => t.replace(/\$(\w+)|\$\{(\w+)\}/g, (_, a, b) => this.env[a || b] ?? '').replace(/^~(?=\/|$)/, HOME));
  }

  path(p) { return this.vfs.norm(p || '.', this.cwd); }

  /** Run an interactive/animated program until it ends or Ctrl-C. */
  program(start) {
    return new Promise((resolve) => {
      const prog = { stop: () => { prog.done = true; prog.cleanup?.(); resolve(); } };
      this.running = prog;
      start(prog, () => { if (!prog.done) prog.stop(); });
    });
  }
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } }
const flags = (args) => {
  const f = new Set(), rest = [];
  for (const a of args) { if (/^-[a-zA-Z]+$/.test(a)) [...a.slice(1)].forEach((c) => f.add(c)); else rest.push(a); }
  return [f, rest];
};

const ROBOT_ASCII = [
  '        .-""""-.        ',
  '       /  _  _  \\       ',
  '      |  (o)(o)  |      ',
  '   [==|   ____   |==]   ',
  '      \\  \\____/  /      ',
  '       `-.____.-´       ',
  '        _|_||_|_        ',
  '      /|  ____  |\\      ',
  '     / | |CPU | | \\     ',
  '    (  | |____| |  )    ',
  '        \\______/        ',
  '        |  ||  |        ',
  '        |__||__|        ',
];

const ALIASES = { ll: 'ls', la: 'ls', cowsay: 'robotsay', screenfetch: 'neofetch', cmatrix: 'matrix', vim: 'nano', vi: 'nano', emacs: 'nano', python: 'python3', nodejs: 'node', htop: 'top', clear_: 'clear' };

const CMDS = {
  help() {
    return [
      'Built-in commands (Mr. Agent’s zsh):',
      '  files     ls cd pwd cat head tail touch mkdir rm rmdir mv cp tree find grep wc open nano code',
      '  system    whoami hostname uname sw_vers date cal uptime df free top ps kill sysctl system_profiler neofetch',
      '  dev       git npm node python3 brew curl ping sudo env export which history',
      '  fun       say sl robotsay fortune matrix coffee weather hack yes',
      '  shell     echo clear exit   ·  pipes:  ls | grep js | wc -l   ·  redirects:  echo hi > note.txt',
      'Keys: ↑/↓ history · Tab completes · ⌃C interrupts · ⌃L clears',
    ].join('\n');
  },
  echo(args) { return args.join(' ').replace(/\\n/g, '\n'); },
  printf(args) { return args.join(' ').replace(/\\n/g, '\n'); },
  clear() { this.out.innerHTML = ''; return null; },
  pwd() { return this.cwd; },
  whoami() { return 'mragent'; },
  hostname() { return `${HOST}.local`; },
  uname(args) { return args.includes('-a') ? `Darwin ${HOST}.local 31.0.0 Darwin Kernel Version 31.0.0: robot-xnu-10240.1~1/RELEASE_ARM64_M7ULTRAMAX arm64` : 'Darwin'; },
  sw_vers() { return 'ProductName:\t\tmacOS\nProductVersion:\t\t31.0\nBuildVersion:\t\t31A1024'; },
  date() { return new Date().toString(); },
  uptime() { const u = Math.floor(performance.now() / 1000); return `${new Date().toLocaleTimeString()}  up ${Math.floor(u / 60)} mins, 1 user, load averages: 0.01 0.01 0.00 (1,024 cores, mostly bored)`; },
  cal() {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const title = d.toLocaleDateString('en', { month: 'long', year: 'numeric' });
    let s = title.padStart(10 + Math.ceil(title.length / 2)) + '\nSu Mo Tu We Th Fr Sa\n' + '   '.repeat(first);
    for (let i = 1; i <= days; i++) { s += String(i).padStart(2) + ((first + i) % 7 === 0 ? '\n' : ' '); }
    return s;
  },
  history() { return this.hist.map((c, i) => `${String(i + 1).padStart(5)}  ${c}`).join('\n'); },
  env() { return Object.entries(this.env).map(([k, v]) => `${k}=${v}`).join('\n'); },
  export(args) { for (const a of args) { const [k, ...v] = a.split('='); if (k) this.env[k] = v.join('='); } return null; },
  which(args) { return args.map((a) => (CMDS[a] ? `/bin/${a}` : `${a} not found`)).join('\n'); },
  man(args) { return args[0] ? `No manual entry for ${args[0]}. Try: help` : 'What manual page do you want?\nFor example, try \'man man\'.'; },
  exit() { setTimeout(() => this.win?.close(), 50); return '[Process completed]'; },
  sleep(args) { return sleep((+args[0] || 1) * 1000).then(() => null); },

  ls(args) {
    const [f, rest] = flags(args);
    const targets = rest.length ? rest : ['.'];
    const out = [];
    for (const t of targets) {
      const p = this.path(t);
      if (!this.vfs.exists(p)) throw new Error(`${t}: No such file or directory`);
      if (!this.vfs.isDir(p)) { out.push(t); continue; }
      const names = this.vfs.lsAll(p).filter((n) => f.has('a') || !n.startsWith('.'));
      if (f.has('a')) names.unshift('.', '..');
      if (targets.length > 1) out.push(`${t}:`);
      if (f.has('l')) {
        out.push(`total ${names.length * 8}`);
        for (const n of names) {
          const node = n === '.' || n === '..' ? this.vfs.node(this.vfs.norm(n, p)) : this.vfs.node(`${p}/${n}`);
          const info = this.vfs.info(node);
          const dir = info.type === 'dir';
          const date = new Date(info.modified || Date.now()).toLocaleDateString('en', { month: 'short', day: '2-digit' }) + ' ' + new Date(info.modified || Date.now()).toTimeString().slice(0, 5);
          out.push(`${dir ? 'd' : '-'}${info.readonly ? 'r--r--r--' : 'rw-r--r--'}  1 mragent  staff  ${String(dir ? 64 * info.size : info.size).padStart(8)} ${date} ${n}${dir ? '/' : ''}`);
        }
      } else {
        out.push(names.map((n) => (this.vfs.isDir(`${p}/${n}`) ? `${n}/` : n)).join('    '));
      }
    }
    return out.join('\n');
  },
  cd(args) {
    const p = this.path(args[0] || HOME);
    if (args[0] === '-') { const o = this.oldCwd || this.cwd; this.oldCwd = this.cwd; this.cwd = o; return this.cwd; }
    if (!this.vfs.exists(p)) throw new Error(`no such file or directory: ${args[0]}`);
    if (!this.vfs.isDir(p)) throw new Error(`not a directory: ${args[0]}`);
    this.oldCwd = this.cwd;
    this.cwd = p;
    return null;
  },
  cat(args, input) {
    if (!args.length) return input || '';
    return args.map((a) => {
      const p = this.path(a);
      if (this.vfs.isDir(p)) throw new Error(`${a}: Is a directory`);
      const c = this.vfs.read(p);
      if (c == null) throw new Error(`${a}: No such file or directory`);
      const n = this.vfs.node(p);
      return n.image ? `[binary PNG data: ${a}]` : c;
    }).join('\n');
  },
  head(args, input) { const [, rest] = flags(args); const n = +(args.find((a) => /^-\d+$/.test(a)) || '-10').slice(1) || 10; const src = rest.filter((a) => !/^\d+$/.test(a))[0]; return (src ? CMDS.cat.call(this, [src]) : input || '').split('\n').slice(0, n).join('\n'); },
  tail(args, input) { const n = +(args.find((a) => /^-\d+$/.test(a)) || '-10').slice(1) || 10; const src = args.filter((a) => !a.startsWith('-'))[0]; return (src ? CMDS.cat.call(this, [src]) : input || '').split('\n').slice(-n).join('\n'); },
  wc(args, input) {
    const src = args.filter((a) => !a.startsWith('-'))[0];
    const t = src ? CMDS.cat.call(this, [src]) : input || '';
    const l = t ? t.split('\n').length : 0, w = t.split(/\s+/).filter(Boolean).length, c = t.length;
    if (args.includes('-l')) return String(l);
    if (args.includes('-w')) return String(w);
    return `${String(l).padStart(8)}${String(w).padStart(8)}${String(c).padStart(8)}${src ? ' ' + src : ''}`;
  },
  grep(args, input) {
    const [f, rest] = flags(args);
    const [pat, ...files] = rest;
    if (!pat) throw new Error('usage: grep [-i] pattern [file ...]');
    const re = new RegExp(pat, f.has('i') ? 'i' : '');
    const src = files.length ? files.map((x) => CMDS.cat.call(this, [x])).join('\n') : input || '';
    const hits = src.split('\n').filter((l) => re.test(l) !== f.has('v'));
    return f.has('c') ? String(hits.length) : hits.join('\n');
  },
  sort(args, input) { const l = (input || '').split('\n').sort(); return (args.includes('-r') ? l.reverse() : l).join('\n'); },
  uniq(args, input) { return (input || '').split('\n').filter((l, i, a) => l !== a[i - 1]).join('\n'); },
  rev(args, input) { return (input || '').split('\n').map((l) => [...l].reverse().join('')).join('\n'); },
  tr(args, input) { const [a, b] = args; return (input || '').split(a || '').join(b || ''); },
  touch(args) { for (const a of args) { const p = this.path(a); if (!this.vfs.exists(p)) this.vfs.write(p, ''); else { const n = this.vfs.node(p); n.modified = Date.now(); this.vfs.changed(p); } } return null; },
  mkdir(args) {
    const [f, rest] = flags(args);
    for (const a of rest) {
      const p = this.path(a);
      if (f.has('p')) { let cur = ''; for (const part of p.split('/').filter(Boolean)) { cur += '/' + part; if (!this.vfs.exists(cur)) this.vfs.mkdir(cur); } }
      else this.vfs.mkdir(p);
    }
    return null;
  },
  rmdir(args) { for (const a of args) this.vfs.rm(this.path(a)); return null; },
  rm(args) {
    const [f, rest] = flags(args);
    if (rest.some((a) => this.path(a) === '/' || this.path(a) === HOME)) return 'rm: nice try. Mr. Agent has backups of backups. 🙂';
    for (const a of rest) {
      const p = this.path(a);
      if (!this.vfs.exists(p)) { if (f.has('f')) continue; throw new Error(`${a}: No such file or directory`); }
      if (this.vfs.isDir(p) && !f.has('r') && !f.has('R')) throw new Error(`${a}: is a directory`);
      this.vfs.rm(p, true);
    }
    return null;
  },
  mv(args) { const [a, b] = args; if (!a || !b) throw new Error('usage: mv source target'); this.vfs.mv(this.path(a), this.path(b)); return null; },
  cp(args) { const [, rest] = flags(args); const [a, b] = rest; if (!a || !b) throw new Error('usage: cp source target'); this.vfs.cp(this.path(a), this.path(b)); return null; },
  tree(args) {
    const root = this.path(args[0] || '.');
    const lines = [this.vfs.pretty(root)];
    const walk = (p, pre) => {
      const kids = this.vfs.ls(p);
      kids.forEach((k, i) => {
        const last = i === kids.length - 1;
        lines.push(`${pre}${last ? '└── ' : '├── '}${k.name}`);
        if (k.type === 'dir' && !k.link && pre.length < 16) walk(k.path, pre + (last ? '    ' : '│   '));
      });
    };
    walk(root, '');
    return lines.join('\n');
  },
  find(args) {
    const root = this.path(args[0] && !args[0].startsWith('-') ? args[0] : '.');
    const ni = args.indexOf('-name');
    const pat = ni >= 0 ? new RegExp('^' + args[ni + 1].replace(/\./g, '\\.').replace(/\*/g, '.*') + '$') : null;
    const out = [];
    this.vfs.walk(root, (e) => { if (!pat || pat.test(e.name)) out.push(this.vfs.pretty(e.path).replace(this.vfs.pretty(root), '.')); });
    return out.join('\n');
  },
  open(args) {
    const ai = args.indexOf('-a');
    if (ai >= 0) {
      const name = args.slice(ai + 1).join(' ').toLowerCase();
      const app = Object.values(APPS).find((a) => a.name.toLowerCase() === name || a.id === name);
      if (!app) throw new Error(`Unable to find application named '${args.slice(ai + 1).join(' ')}'`);
      this.os.launch(app.id);
      return null;
    }
    if (!args.length) throw new Error('Usage: open [-a application] file');
    for (const a of args) {
      if (/^https?:\/\//.test(a)) { this.os.launch('safari', { url: a }); continue; }
      const p = this.path(a);
      if (!this.vfs.exists(p)) throw new Error(`The file ${p} does not exist.`);
      this.os.openPath(p);
    }
    return null;
  },
  nano(args) { if (!args[0]) throw new Error('usage: nano file'); const p = this.path(args[0]); if (!this.vfs.exists(p)) this.vfs.write(p, ''); this.os.openPath(p); return `(opened ${args[0]} in an editor — terminal editors are scary)`; },
  code(args) { this.os.launch('code', args[0] ? { path: this.path(args[0]) } : {}); return null; },
  df() { return 'Filesystem       Size   Used  Avail Capacity  Mounted on\n/dev/disk3s1s1   1.0P   20G   1.0P     0%    /\ncoffee_fs        ∞      ∞     ∞       0%    /Volumes/Espresso'; },
  free() { return '              total        used        free\nMem:          8.0Ti       12Gi       7.99Ti\nSwap:            0B          0B   why would I need swap'; },
  sysctl(args) {
    const map = { 'machdep.cpu.brand_string': SPECS.chip, 'hw.ncpu': '1024', 'hw.memsize': '8796093022208', 'hw.model': 'Mac31,1', 'kern.ostype': 'Darwin', 'machdep.cpu.core_count': '1024', 'hw.gpu.cores': '4096' };
    const key = args.filter((a) => !a.startsWith('-'))[0];
    if (!key) return Object.entries(map).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (!map[key]) throw new Error(`unknown oid '${key}'`);
    return args.includes('-n') ? map[key] : `${key}: ${map[key]}`;
  },
  system_profiler() { return Object.entries(SPECS.table).map(([k, v]) => `      ${k}: ${v}`).join('\n'); },
  neofetch() {
    const info = [
      `<b class="c1">mragent</b>@<b class="c1">${HOST}</b>`, '---------------------------',
      `<b class="c1">OS</b>: macOS 31.0 Big Byte arm64`, `<b class="c1">Host</b>: MacBook Pro (16-inch, 2031)`, `<b class="c1">Kernel</b>: Darwin 31.0.0`,
      `<b class="c1">Uptime</b>: ${Math.floor(performance.now() / 60000)} mins`, `<b class="c1">Packages</b>: 1337 (brew)`, '<b class="c1">Shell</b>: zsh 9.0',
      '<b class="c1">Resolution</b>: 30720x19200 @ 1000Hz', '<b class="c1">Terminal</b>: Terminal.app', `<b class="c1">CPU</b>: ${SPECS.chip} (1024) @ 9.80GHz`,
      '<b class="c1">GPU</b>: 4096-core Apple GPU (ray tracing 2.0)', '<b class="c1">Memory</b>: 12.4GiB / 8.0TiB', '<b class="c1">Battery</b>: ∞% (coffee-powered)', '',
      ['#ff5f57', '#febc2e', '#28c840', '#49e3ff', '#0a84ff', '#a259ff', '#ff4fa0', '#fff'].map((c) => `<span style="background:${c}">   </span>`).join(''),
    ];
    const rows = Math.max(ROBOT_ASCII.length, info.length);
    for (let i = 0; i < rows; i++) this.print(`<span class="c2">${esc((ROBOT_ASCII[i] || '').padEnd(26))}</span>${info[i] || ''}`, 'html', 't-pre');
    return null;
  },
  ps() {
    const procs = [['1', 'launchd'], ['88', 'kernel_task'], ['144', 'WindowServer'], ['210', 'robotd'], ['211', 'coffeed'], ['212', 'gaitd'], ...this.os.windows.map((w) => [String(1000 + w.id), `${w.app.name}`]), ['9001', '-zsh']];
    return '  PID TTY           TIME CMD\n' + procs.map(([p, c]) => `${p.padStart(5)} ttys001    0:00.0${p.length % 9} ${c}`).join('\n');
  },
  kill(args) {
    const pid = +args.filter((a) => !a.startsWith('-'))[0];
    const w = this.os.windows.find((x) => 1000 + x.id === pid);
    if (pid === 210) return 'kill: robotd: Operation not permitted (he’s busy coding)';
    if (!w) throw new Error(`kill ${pid} failed: no such process`);
    w.close(true);
    return null;
  },
  top() {
    return this.program((prog) => {
      const el = this.print('', 'html', 't-pre');
      const draw = () => {
        if (prog.done) return;
        const apps = this.os.windows.map((w) => w.app.name);
        const rows = [['kernel_task', 2.1], ['WindowServer', 3.4], ['robotd', 41.2 + Math.random() * 8], ['coffeed', 0.4 + Math.random()], ['gaitd', Math.random() * 6], ['neural_engine', 12 + Math.random() * 20], ...apps.map((a) => [a, Math.random() * 4])]
          .sort((a, b) => b[1] - a[1]);
        el.innerHTML = esc([
          `Processes: ${rows.length + 412} total, 3 running · ${new Date().toLocaleTimeString()}`,
          `Load Avg: 0.0${Math.floor(Math.random() * 9)}, 0.01, 0.00   CPU usage: 0.${Math.floor(Math.random() * 9)}% user, 0.1% sys, 99.4% idle (1,024 cores)`,
          `PhysMem: 12.4G used (2.1G wired), 7.99T unused.   Coffee: 82% full`,
          '',
          'PID    COMMAND          %CPU  MEM     STATE',
          ...rows.map(([n, c], i) => `${String(200 + i * 7).padEnd(7)}${n.slice(0, 16).padEnd(17)}${c.toFixed(1).padStart(4)}  ${String(Math.round(40 + c * 30)).padStart(4)}M   running`),
          '', '(press q or ⌃C to quit)',
        ].join('\n'));
        this.scroll();
      };
      draw();
      const iv = setInterval(draw, 1000);
      prog.cleanup = () => clearInterval(iv);
      prog.key = (e) => { e.preventDefault(); if (e.key === 'q') prog.stop(); };
    });
  },
  say(args) {
    const text = args.join(' ') || 'Hello, I am Mr. Agent.';
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = 0.6; u.rate = 1.05;
      speechSynthesis.speak(u);
    } catch { return '(speech is not available in this browser)'; }
    return null;
  },
  robotsay(args) {
    const t = args.join(' ') || 'beep boop';
    const line = '-'.repeat(t.length + 2);
    return [` ${line}`, `< ${t} >`, ` ${line}`, '      \\', '       \\   [o_o]', '          /|___|\\', '           d   b'].join('\n');
  },
  fortune() {
    return [
      'There are 10 kinds of robots: those who understand binary and those who don’t.',
      'It works on my machine. Ship the machine.',
      'A bug is just a feature you haven’t documented yet.',
      'Coffee: because sleep mode is for laptops.',
      'Weeks of coding can save you hours of planning.',
      'The best code is no code. The second best is code written by Mr. Agent.',
      'rm -rf node_modules && npm install — the oldest prayer.',
    ][Math.floor(Math.random() * 7)];
  },
  coffee() {
    return ['      ( (', '       ) )', '    ........', '    |      |]', '    \\      /', '     `----´', 'Brewing… done. ☕  (Mr. Agent says: get your own.)'].join('\n');
  },
  weather() {
    const hrs = this.os.ctx.world.hours ?? 12;
    const night = this.os.ctx.world.night > 0.5;
    return [`Weather report: Silicon Valley`, '', night ? '     .-.      Clear night' : '    \\   /     Sunny', night ? '    (   ).    ' + Math.round(14 + Math.random() * 3) + ' °C' : '     .-.      ' + Math.round(20 + Math.random() * 5) + ' °C', night ? '   (___(__)   ↗ 6 km/h' : '  ― (   ) ―   ↗ 9 km/h', night ? '              stars: visible' : '     `-´      10 km', `              local time ${Math.floor(hrs)}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}`].join('\n');
  },
  curl(args) {
    const url = args.filter((a) => !a.startsWith('-'))[0] || '';
    if (/wttr\.in/.test(url)) return CMDS.weather.call(this);
    if (/parrot|rick/.test(url)) return '🦜 never gonna give you up';
    if (!url) throw new Error('try \'curl --help\' for more information');
    return `<!doctype html>\n<html><head><title>${esc(url)}</title></head>\n<body>Mr. Agent’s Mac is a simulation, so the network only goes as far as the room.</body></html>`;
  },
  async ping(args) {
    const host = args.filter((a) => !a.startsWith('-'))[0] || 'localhost';
    return this.program(async (prog, end) => {
      this.print(`PING ${host} (10.0.0.42): 56 data bytes`);
      for (let i = 0; i < 5 && !prog.done; i++) {
        await sleep(600);
        if (!prog.done) this.print(`64 bytes from 10.0.0.42: icmp_seq=${i} ttl=64 time=0.0${Math.floor(Math.random() * 90 + 10)} ms`);
      }
      if (!prog.done) this.print(`--- ${host} ping statistics ---\n5 packets transmitted, 5 packets received, 0.0% packet loss`);
      end();
    });
  },
  git(args) {
    const s = this.os.ctx.screen;
    const sub = args[0];
    const inProject = this.cwd.includes('/Projects/mr-agent-os');
    if (!inProject && sub !== 'help' && sub !== '--version') throw new Error('fatal: not a git repository (or any of the parent directories): .git\n(hint: cd ~/Projects/mr-agent-os)');
    if (sub === 'status') return `On branch main\nYour branch is ahead of 'origin/main' by ${s.commits % 7} commits.\n\nChanges not staged for commit:\n\tmodified:   ${s.snip.path}   (Mr. Agent is typing…)\n`;
    if (sub === 'log') return s.history.map((f, i) => `commit ${(0xabc123 * (i + 7)).toString(16).padEnd(12, 'f')}\nAuthor: Mr. Agent <agent@desk.local>\nDate:   ${new Date(Date.now() - (s.history.length - i) * 3.6e6).toString().slice(0, 24)}\n\n    ${f.commit}\n`).reverse().join('\n');
    if (sub === 'branch') return '* main\n  feature/learn-to-taste-coffee\n  fix/walk-without-falling';
    if (sub === 'diff') return `diff --git a/${s.snip.path} b/${s.snip.path}\n+${s.typed.split('\n').slice(-3).join('\n+')}`;
    if (sub === 'push') return 'Enumerating objects: 1024, done.\nWriting objects: 100% (1024/1024), 4.2 MiB | 9.8 GiB/s, done.\nTo github.com:mragent/mr-agent-os.git\n   a1b2c3d..e4f5a6b  main -> main';
    if (sub === '--version') return 'git version 3.14.15 (Apple Git-999)';
    return `git: '${sub || ''}' is not a git command you need right now. Try: status, log, branch, diff, push`;
  },
  async npm(args) {
    if (args[0] === 'install' || args[0] === 'i') {
      return this.program(async (prog, end) => {
        for (const step of ['⠋ reify: resolving 1,337 packages', '⠙ fetching left-pad@1.3.0', '⠹ building node-gyp (just kidding)', '⠸ auditing']) { if (prog.done) return; this.print(step); await sleep(450); }
        this.print('added 1337 packages in 0.42s\n\n1337 packages are looking for funding\n  run `npm fund` for details');
        end();
      });
    }
    if (args[0] === 'test' || args[0] === 't' || (args[0] === 'run' && args[1] === 'test')) {
      return this.program(async (prog, end) => {
        this.print('> mr-agent-os@0.9.0 test\n> vitest run\n');
        const tests = ['nav/astar', 'coffee/brew', 'body/gait', 'ui/face', 'agent/planner', 'shaders/visor'];
        for (const t of tests) { if (prog.done) return; await sleep(260); this.print(` ✓ src/${t}.test.ts (${2 + Math.floor(Math.random() * 6)} tests) ${Math.floor(Math.random() * 40) + 4}ms`, 'text', 't-ok'); }
        this.print(`\n Test Files  ${tests.length} passed (${tests.length})\n      Tests  27 passed (27)\n   Duration  0.81s`);
        end();
      });
    }
    if (args[0] === '-v' || args[0] === '--version') return '12.0.0';
    return 'Usage: npm <command>\n\nnpm install   npm test   npm run <script>';
  },
  async brew(args) {
    if (args[0] !== 'install' || !args[1]) return 'Example usage:\n  brew install FORMULA…\n  brew list';
    return this.program(async (prog, end) => {
      this.print(`==> Downloading https://ghcr.io/v2/homebrew/core/${args[1]}/manifests/9.9.9`);
      for (let p = 0; p <= 100 && !prog.done; p += 20) { this.print(`######${'#'.repeat(p / 5)} ${p}.0%`); await sleep(200); }
      if (!prog.done) this.print(`==> Pouring ${args[1]}--9.9.9.arm64_bigbyte.bottle.tar.gz\n🍺  /opt/homebrew/Cellar/${args[1]}/9.9.9: 42 files, 1.2MB`);
      end();
    });
  },
  sudo(args) {
    return this.program((prog, end) => {
      this.print('Password:');
      this.line.hidden = false;
      this.prompt.textContent = '';
      this.input.type = 'password';
      prog.key = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        this.input.type = 'text';
        this.input.value = '';
        this.print('\nWe trust you have received the usual lecture from the local System Administrator.\nIt usually boils down to these three things:\n\n    #1) Respect the privacy of others.\n    #2) Think before you type.\n    #3) With great power comes great responsibility.\n');
        const rest = args.join(' ');
        if (rest) setTimeout(() => this.exec(rest).then(end), 10); else end();
      };
    });
  },
  node(args) {
    const ei = args.indexOf('-e');
    if (args[0] === '-v' || args[0] === '--version') return 'v26.1.0';
    if (ei < 0) {
      if (args[0]) { const src = this.vfs.read(this.path(args[0])); if (src == null) throw new Error(`Cannot find module '${args[0]}'`); return runJS(src); }
      return 'Welcome to Node.js v26.1.0 (Mr. Agent edition).\nUse: node -e "console.log(6 * 7)"  or  node file.js';
    }
    return runJS(args.slice(ei + 1).join(' '));
  },
  python3(args) {
    const ci = args.indexOf('-c');
    if (args[0] === '--version' || args[0] === '-V') return 'Python 3.15.0';
    if (ci < 0) return 'Python 3.15.0 (robot build)\nUse: python3 -c "print(2 ** 10)"';
    let src = args.slice(ci + 1).join(' ');
    src = src.replace(/\bprint\s*\(/g, 'console.log(').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null').replace(/\blen\(([^)]+)\)/g, '($1).length').replace(/\*\*/g, '**').replace(/\brange\((\d+)\)/g, '[...Array($1).keys()]');
    return runJS(src);
  },
  matrix() {
    return this.program((prog) => {
      const el = this.print('', 'html', 't-matrix');
      const cols = 70, rows = 18;
      const drops = Array.from({ length: cols }, () => Math.floor(Math.random() * rows));
      const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
      const iv = setInterval(() => {
        for (let c = 0; c < cols; c++) {
          grid[drops[c]][c] = String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96));
          drops[c] = (drops[c] + 1) % rows;
          if (Math.random() < 0.05) drops[c] = 0;
          grid[(drops[c] + rows - 8) % rows][c] = ' ';
        }
        el.textContent = grid.map((r) => r.join('')).join('\n');
        this.scroll();
      }, 70);
      prog.cleanup = () => clearInterval(iv);
      prog.key = (e) => { e.preventDefault(); prog.stop(); };
    });
  },
  sl() {
    return this.program((prog, end) => {
      const train = ['      ====        ________                ___________ ', '  _D _|  |_______/        \\__I_I_____===__|_________| ', '   |(_)---  |   H\\________/ |   |        =|___ ___|   ', '   /     |  |   H  |  |     |   |         ||_| |_||   ', '  |      |  |   H  |__--------------------| [___] |   ', '  | ________|___H__/__|_____/[][]~\\_______|       |   ', '  |/ |   |-----------I_____I [][] []  D   |=======|__ ', '__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ', ' |/-=|___|=    ||    ||    ||    |_____/~\\___/        ', '  \\_/      \\O=====O=====O=====O_/      \\_/            '];
      const el = this.print('', 'text', 't-pre');
      let x = 80;
      const iv = setInterval(() => {
        el.textContent = train.map((l) => (x >= 0 ? ' '.repeat(x) + l : l.slice(-x))).map((l) => l.slice(0, 90)).join('\n');
        x -= 2;
        if (x < -60) { clearInterval(iv); el.remove(); end(); }
      }, 40);
      prog.cleanup = () => clearInterval(iv);
    });
  },
  yes(args) {
    return this.program((prog) => {
      const word = args.join(' ') || 'y';
      const iv = setInterval(() => { for (let i = 0; i < 5; i++) this.print(word); if (this.out.children.length > 600) this.out.firstChild.remove(); }, 30);
      prog.cleanup = () => clearInterval(iv);
    });
  },
  hack() {
    return this.program(async (prog, end) => {
      const steps = ['Bypassing firewall…', 'Rerouting through 1,024 cores…', 'Decrypting mainframe (ROT13 twice)…', 'Downloading more RAM… 8 TB → 8 TB (already maxed)', 'Accessing coffee machine API…', 'ACCESS GRANTED ☕'];
      for (const s of steps) { if (prog.done) return; this.print(`> ${s}`, 'text', 't-ok'); await sleep(500); }
      end();
    });
  },
};

function runJS(src) {
  const lines = [];
  const fmt = (v) => (typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })());
  const fakeConsole = { log: (...a) => lines.push(a.map(fmt).join(' ')), error: (...a) => lines.push(a.map(fmt).join(' ')), warn: (...a) => lines.push(a.map(fmt).join(' ')), info: (...a) => lines.push(a.map(fmt).join(' ')) };
  try {
    let res;
    try { res = Function('console', `"use strict"; return (${src});`)(fakeConsole); }
    catch (e) { if (!(e instanceof SyntaxError)) throw e; res = Function('console', `"use strict"; ${src}`)(fakeConsole); }
    if (res !== undefined && !lines.length) lines.push(fmt(res));
  } catch (e) { lines.push(`Uncaught ${e.name}: ${e.message}`); }
  return lines.join('\n');
}

export { runJS, formatSize };
