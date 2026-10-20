import { h } from '../ui.js';

const SYSTEM = [
  ['kernel_task', 'root', 2.1, 2900], ['WindowServer', '_windowserver', 3.2, 640], ['robotd', 'mragent', 38, 2100], ['coffeed', 'mragent', 0.6, 48],
  ['gaitd', 'mragent', 4, 220], ['neural_engine', 'root', 12, 8400], ['visord', 'mragent', 1.3, 96], ['fingerctl', 'mragent', 2.4, 64],
  ['launchd', 'root', 0.1, 24], ['mds_stores', 'root', 0.8, 310], ['Spotlight', 'mragent', 0.2, 120], ['bluetoothd', 'root', 0.1, 18],
];

export default {
  id: 'activity', name: 'Activity Monitor', icon: 'activity', single: true,
  about: 'Activity Monitor — 1,024 cores, mostly idle.',
  launch(os) {
    let tab = 'CPU', sort = { key: 'cpu', dir: -1 }, sel = null;
    const history = new Array(120).fill(0.3);
    const table = h('div.am-table.scroll');
    const foot = h('div.am-foot');
    const heat = h('canvas.am-heat', { width: 512, height: 64, title: '1,024 CPU cores' });
    const graph = h('canvas.am-graph', { width: 240, height: 64 });
    const tabs = h('div.am-tabs');
    const procs = () => {
      const apps = [...new Set(os.windows.map((w) => w.app))].map((a) => [a.name, 'mragent', Math.random() * 3 + 0.3, 120 + Math.random() * 400, a.id]);
      return [...SYSTEM.map((p) => [p[0], p[1], p[2] * (0.6 + Math.random() * 0.8), p[3]]), ...apps].map(([name, user, cpu, mem, app], i) => ({
        name, user, cpu, mem, app, pid: app ? 1000 + (os.windows.find((w) => w.app.id === app)?.id || 0) : 80 + i * 13,
        threads: Math.floor(4 + (name.length * 7) % 60), energy: cpu * 1.7, disk: Math.random() * 40, net: Math.random() * 900,
      }));
    };
    const cols = {
      CPU: [['name', 'Process Name'], ['cpu', '% CPU', (v) => v.toFixed(1)], ['threads', 'Threads'], ['pid', 'PID'], ['user', 'User']],
      Memory: [['name', 'Process Name'], ['mem', 'Memory', (v) => `${v > 1000 ? (v / 1024).toFixed(2) + ' GB' : v.toFixed(0) + ' MB'}`], ['threads', 'Threads'], ['pid', 'PID'], ['user', 'User']],
      Energy: [['name', 'Process Name'], ['energy', 'Energy Impact', (v) => v.toFixed(1)], ['cpu', '% CPU', (v) => v.toFixed(1)], ['user', 'User']],
      Disk: [['name', 'Process Name'], ['disk', 'Bytes Read', (v) => `${v.toFixed(1)} MB`], ['pid', 'PID'], ['user', 'User']],
      Network: [['name', 'Process Name'], ['net', 'Sent Bytes', (v) => `${v.toFixed(0)} KB`], ['pid', 'PID'], ['user', 'User']],
    };
    const render = () => {
      tabs.innerHTML = '';
      Object.keys(cols).forEach((t) => tabs.append(h('button', { class: t === tab ? 'on' : '', text: t, onclick: () => { tab = t; sort = { key: cols[t][1][0], dir: -1 }; render(); } })));
      const c = cols[tab];
      const list = procs().sort((a, b) => (a[sort.key] > b[sort.key] ? sort.dir : -sort.dir));
      table.innerHTML = '';
      table.append(h('div.am-row.am-head', {}, ...c.map(([k, label]) => h('span', { onclick: () => { sort = { key: k, dir: sort.key === k ? -sort.dir : -1 }; render(); } }, label, sort.key === k ? (sort.dir > 0 ? ' ▴' : ' ▾') : ''))));
      list.forEach((p, i) => table.append(h('div.am-row', { class: [i % 2 ? 'alt' : '', sel === p.name ? 'sel' : ''].join(' '), onclick: () => { sel = p.name; render(); } },
        ...c.map(([k, , f]) => h('span', { text: f ? f(p[k]) : p[k] })))));
      const total = list.reduce((a, p) => a + p.cpu, 0) / 1024;
      history.push(total);
      history.shift();
      foot.innerHTML = '';
      foot.append(
        h('dl.am-stats', {}, ...[['System', `${(total * 0.4).toFixed(2)}%`], ['User', `${(total * 0.6).toFixed(2)}%`], ['Idle', `${(100 - total).toFixed(2)}%`], ['Threads', '4,096'], ['Processes', String(list.length + 400)]].flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
        h('div.am-graph-wrap', {}, h('small', { text: 'CPU LOAD' }), graph),
        h('div.am-heat-wrap', {}, h('small', { text: tab === 'Memory' ? 'MEMORY: 12.4 GB of 8 TB used' : '1,024 CORES' }), heat));
      drawGraph();
      drawHeat();
    };
    const drawGraph = () => {
      const x = graph.getContext('2d');
      x.clearRect(0, 0, 240, 64);
      x.fillStyle = 'rgba(48,209,88,0.25)';
      x.strokeStyle = '#30d158';
      x.beginPath();
      x.moveTo(0, 64);
      history.forEach((v, i) => x.lineTo(i * 2, 64 - Math.min(60, 4 + v * 380)));
      x.lineTo(240, 64);
      x.fill();
      x.stroke();
    };
    const drawHeat = () => {
      const x = heat.getContext('2d');
      const cells = tab === 'Memory' ? 1024 : 1024;
      for (let i = 0; i < cells; i++) {
        const cx = (i % 64) * 8, cy = Math.floor(i / 64) * 4;
        const load = tab === 'Memory' ? (i < 2 ? 1 : 0.02) : Math.random() ** 6 + (i % 97 === 0 ? 0.5 : 0);
        x.fillStyle = tab === 'Memory' ? (i < 2 ? '#ff9f0a' : '#2c3a2e') : `hsl(${130 - load * 130} 80% ${15 + load * 45}%)`;
        x.fillRect(cx, cy, 7, 3);
      }
    };
    const quit = async () => {
      const p = procs().find((x) => x.name === sel);
      if (!p) return;
      if (!p.app) { os.alert({ title: `“${p.name}” is a system process`, message: p.name === 'robotd' ? 'Quitting robotd would stop Mr. Agent mid-keystroke. Not allowed.' : 'macOS won’t let you quit this one.' }); return; }
      if (await os.confirm(`Are you sure you want to quit this process? “${p.name}”`, 'Force Quit')) os.quit(p.app);
    };
    const iv = setInterval(render, 1500);
    const w = os.createWindow({
      app: this, title: 'Activity Monitor', width: 820, height: 520, minWidth: 560, unified: true, onClose: () => clearInterval(iv),
      body: (b) => b.append(h('div.am', {}, table, foot)),
    });
    w.toolbar.append(h('button.tb-btn', { text: '⊗', title: 'Quit process', 'aria-label': 'Quit process', onclick: quit }), h('div.spacer'), tabs, h('div.spacer'));
    render();
    return w;
  },
};
