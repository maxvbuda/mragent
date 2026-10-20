import { h } from '../ui.js';

const KEY = 'mragent.reminders.v1';
const SEED = {
  lists: [{ id: 'chores', name: 'Robot Chores', color: '#0a84ff' }, { id: 'groceries', name: 'Groceries', color: '#30d158' }, { id: 'work', name: 'Work', color: '#ff9f0a' }],
  items: [
    { id: 1, list: 'chores', text: 'Oil the knee servos', done: false, flag: true, today: true },
    { id: 2, list: 'chores', text: 'Descale the coffee machine', done: false, flag: false, today: true },
    { id: 3, list: 'chores', text: 'Water the fern', done: true, flag: false },
    { id: 4, list: 'groceries', text: 'Espresso beans (lots)', done: false, flag: false },
    { id: 5, list: 'groceries', text: 'WD-40', done: false, flag: false },
    { id: 6, list: 'work', text: 'Ship gait.py', done: false, flag: true, today: true },
    { id: 7, list: 'work', text: 'Never deploy on Friday', done: false, flag: false },
  ],
};
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || structuredClone(SEED); } catch { return structuredClone(SEED); } };
const persist = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };

/** Used by the assistant: "remind me to …". */
export function addReminder(os, text) {
  const d = load();
  d.items.push({ id: Date.now(), list: 'chores', text: text[0].toUpperCase() + text.slice(1), done: false, flag: false, today: true });
  persist(d);
  os.emit('reminders');
}

export default {
  id: 'reminders', name: 'Reminders', icon: 'reminders', single: true,
  about: 'Reminders — robot chores and more.',
  launch(os) {
    let d = load();
    let view = 'today';
    const side = h('div.sb.rm-side', { style: { width: '230px' } });
    const main = h('div.rm-main.scroll');
    const save = () => { persist(d); os.setBadge('reminders', d.items.filter((i) => i.today && !i.done).length); };
    const smart = { today: ['Today', '#0a84ff', (i) => i.today && !i.done], flagged: ['Flagged', '#ff9f0a', (i) => i.flag && !i.done], all: ['All', '#5e5ce6', (i) => !i.done], done: ['Completed', '#8e8e93', (i) => i.done] };
    const renderSide = () => {
      side.innerHTML = '';
      side.append(h('div.rm-smart', {}, ...Object.entries(smart).map(([k, [label, color, f]]) => h('button.rm-tile', { class: k === view ? 'on' : '', onclick: () => { view = k; render(); } },
        h('span.rm-dot', { style: { background: color } }), h('b', { text: String(d.items.filter(f).length) }), h('small', { text: label })))));
      side.append(h('div.sb-h', { text: 'My Lists' }));
      for (const l of d.lists) side.append(h('div.sb-item', { class: l.id === view ? 'on' : '', onclick: () => { view = l.id; render(); } }, h('span.rm-dot', { style: { background: l.color } }), l.name, h('span.ml-count', { text: String(d.items.filter((i) => i.list === l.id && !i.done).length) })));
      side.append(h('button.tb-btn.rm-addlist', { text: '⊕ Add List', onclick: async () => {
        const name = await os.prompt({ title: 'New List', message: 'Name:', value: 'New List' });
        if (!name) return;
        const id = `l${Date.now()}`;
        d.lists.push({ id, name, color: ['#ff453a', '#a259ff', '#ff4fa0', '#30b0c7'][d.lists.length % 4] });
        view = id;
        save();
        render();
      } }));
    };
    const renderMain = () => {
      main.innerHTML = '';
      const list = d.lists.find((l) => l.id === view);
      const [title, color, f] = smart[view] || [list.name, list.color, (i) => i.list === view && !i.done];
      main.append(h('h1', { text: title, style: { color } }));
      for (const it of d.items.filter(f)) {
        const text = h('input.rm-text', { value: it.text, 'aria-label': 'Reminder' });
        text.addEventListener('change', () => { it.text = text.value; save(); });
        main.append(h('div.rm-row', { class: it.done ? 'done' : '' },
          h('button.rm-check', { class: it.done ? 'on' : '', style: { '--c': color }, 'aria-label': 'Done', onclick: () => { it.done = !it.done; if (it.done) os.audio.pop(); save(); setTimeout(render, 250); } }),
          text,
          h('button.rm-flag', { text: it.flag ? '🚩' : '⚐', 'aria-label': 'Flag', onclick: () => { it.flag = !it.flag; save(); render(); } }),
          h('button.rm-del', { text: '×', 'aria-label': 'Delete', onclick: () => { d.items = d.items.filter((x) => x !== it); save(); render(); } })));
      }
      if (view !== 'done') {
        const add = h('input.rm-new', { placeholder: '＋ New Reminder', 'aria-label': 'New reminder' });
        add.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || !add.value.trim()) return;
          d.items.push({ id: Date.now(), list: list ? list.id : 'chores', text: add.value.trim(), done: false, flag: view === 'flagged', today: view === 'today' });
          save();
          render();
          main.querySelector('.rm-new')?.focus();
        });
        main.append(add);
      }
    };
    const render = () => { renderSide(); renderMain(); };
    const off = os.on('reminders', () => { d = load(); render(); });
    const w = os.createWindow({ app: this, title: 'Reminders', width: 760, height: 520, sidebarWidth: 230, onClose: off, body: (b) => b.append(h('div.split', {}, side, main)) });
    save();
    render();
    return w;
  },
};
