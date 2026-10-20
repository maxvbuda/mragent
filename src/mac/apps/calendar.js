import { h } from '../ui.js';

const KEY = 'mragent.calendar.v1';
const COLORS = ['#0a84ff', '#ff9f0a', '#30d158', '#ff375f', '#a259ff'];
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function seed() {
  const d = new Date();
  const k = (off) => { const x = new Date(d); x.setDate(d.getDate() + off); return dayKey(x); };
  return {
    [k(0)]: [{ t: '09:30', title: 'Standup with the toaster', c: 0 }, { t: '15:00', title: 'Coffee break ☕', c: 1 }],
    [k(1)]: [{ t: '11:00', title: 'Refactor the universe', c: 2 }],
    [k(2)]: [{ t: '14:00', title: 'Deploy (not on Friday!)', c: 3 }],
    [k(4)]: [{ t: '10:00', title: 'Oil change for servos', c: 4 }],
    [k(-2)]: [{ t: '16:30', title: 'Learned to walk 🎉', c: 2 }],
  };
}

export default {
  id: 'calendar', name: 'Calendar', icon: 'calendar', single: true,
  about: 'Calendar — Mr. Agent’s busy robot schedule.',
  launch(os) {
    let events;
    try { events = JSON.parse(localStorage.getItem(KEY)); } catch { events = null; }
    events ||= seed();
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(events)); } catch { /* storage blocked */ } };
    let view = new Date();
    view.setDate(1);
    const title = h('h2.cal-title');
    const grid = h('div.cal-grid');
    const render = () => {
      title.innerHTML = `<b>${view.toLocaleDateString([], { month: 'long' })}</b> ${view.getFullYear()}`;
      grid.innerHTML = '';
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => grid.append(h('div.cal-dow', { text: d })));
      const start = new Date(view);
      start.setDate(1 - view.getDay());
      const today = new Date().toDateString();
      for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = dayKey(d);
        const cell = h('div.cal-cell', { class: [d.getMonth() !== view.getMonth() ? 'other' : '', d.toDateString() === today ? 'today' : ''].join(' '), ondblclick: () => add(key, d) },
          h('span.cal-n', { text: String(d.getDate()) }),
          ...(events[key] || []).map((ev, j) => h('div.cal-ev', { style: { '--c': COLORS[ev.c % COLORS.length] }, title: 'Right-click to delete', oncontextmenu: (e) => os.contextMenu(e, [{ label: `Delete “${ev.title}”`, action: () => { events[key].splice(j, 1); persist(); render(); } }]) }, h('i'), h('span', { text: `${ev.t} ${ev.title}` }))));
        grid.append(cell);
      }
    };
    const add = async (key, d) => {
      const name = await os.prompt({ title: 'New Event', message: `On ${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}`, value: 'Pair programming with Mr. Agent' });
      if (!name) return;
      (events[key] ||= []).push({ t: '12:00', title: name, c: Math.floor(Math.random() * COLORS.length) });
      persist();
      render();
    };
    const w = os.createWindow({
      app: this, title: 'Calendar', width: 860, height: 580, minWidth: 560,
      body: (b) => b.append(h('div.cal', {}, h('div.cal-head', {}, title, h('div.spacer'), h('small.cal-hint', { text: 'Double-click a day to add an event' }),
        h('button.btn', { text: '‹', 'aria-label': 'Previous month', onclick: () => { view.setMonth(view.getMonth() - 1); render(); } }),
        h('button.btn', { text: 'Today', onclick: () => { view = new Date(); view.setDate(1); render(); } }),
        h('button.btn', { text: '›', 'aria-label': 'Next month', onclick: () => { view.setMonth(view.getMonth() + 1); render(); } })), grid)),
    });
    render();
    return w;
  },
};
