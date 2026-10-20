import { h } from '../ui.js';
import { robotAvatar } from '../os.js';

/** Find My: a live floor plan of the room with Mr. Agent, his Mac, mug and chair on it. */
export default {
  id: 'findmy', name: 'Find My', icon: 'findmy', single: true,
  about: 'Find My — locate Mr. Agent (he’s usually at his desk).',
  launch(os) {
    const { robot, room, brain } = os.ctx;
    const W = 600, H = 480;
    const map = h('canvas.fm-map', { width: W * 2, height: H * 2 });
    const x = map.getContext('2d');
    const side = h('div.sb.fm-side', { style: { width: '250px' } });
    let tab = 'Devices', selected = 'agent', pulse = 0, raf;
    // room bounds (three.js metres): x from -2.9..2.9, z from -1.75 (open front) .. 2.9 (back wall)
    const bx = [-3.0, 3.0], bz = [-1.9, 3.0];
    const toMap = (px, pz) => [((px - bx[0]) / (bx[1] - bx[0])) * W * 2, ((bz[1] - pz) / (bz[1] - bz[0])) * H * 2];
    const things = () => ({
      agent: { name: 'Mr. Agent', sub: brain.activity, pos: robot.root.position, icon: '🤖', color: '#0a84ff' },
      mac: { name: 'Mr. Agent’s MacBook Pro', sub: 'On the desk · You are using it', pos: room.laptop.position, icon: '💻', color: '#30d158' },
      mug: { name: 'Coffee Mug', sub: brain.holdingMug !== null ? 'In Mr. Agent’s hand' : `${Math.round(brain.fill * 100)}% full`, pos: room.mug.getWorldPosition(room.mug.position.clone()), icon: '☕', color: '#ff9f0a' },
      chair: { name: 'Desk Chair', sub: brain.chairOut ? 'Pulled out' : 'Tucked in', pos: room.chair.position, icon: '🪑', color: '#8e8e93' },
    });
    const draw = () => {
      raf = requestAnimationFrame(draw);
      pulse = (pulse + 0.02) % 1;
      const dark = os.prefs.dark;
      x.fillStyle = dark ? '#1c2230' : '#eef1f4';
      x.fillRect(0, 0, W * 2, H * 2);
      x.strokeStyle = dark ? '#2b3446' : '#dde2e8';
      x.lineWidth = 1;
      for (let gx = 0; gx < W * 2; gx += 40) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H * 2); x.stroke(); }
      for (let gy = 0; gy < H * 2; gy += 40) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W * 2, gy); x.stroke(); }
      // floor + walls
      const [fx0, fy0] = toMap(-2.9, 2.9), [fx1, fy1] = toMap(2.9, -1.75);
      x.fillStyle = dark ? '#3a3328' : '#f3e6d3';
      x.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
      x.strokeStyle = dark ? '#d7dce6' : '#4b5563';
      x.lineWidth = 8;
      x.beginPath(); x.moveTo(fx0, fy1); x.lineTo(fx0, fy0); x.lineTo(fx1, fy0); x.lineTo(fx1, fy1); x.stroke();
      // furniture
      const furn = os.ctx.layout?.obstacles || [];
      const labels = ['Desk', 'Bookshelf', 'Coffee station', 'Lamp', 'Plant'];
      furn.forEach(([ax, az, bx2, bz2], i) => {
        const [p0x, p0y] = toMap(ax, bz2), [p1x, p1y] = toMap(bx2, az);
        x.fillStyle = dark ? '#4b5568' : '#cfd6df';
        x.beginPath(); x.roundRect(p0x, p0y, p1x - p0x, p1y - p0y, 10); x.fill();
        x.fillStyle = dark ? '#c9d1dd' : '#5b6474';
        x.font = '600 22px -apple-system, sans-serif';
        x.textAlign = 'center';
        x.fillText(labels[i] || '', (p0x + p1x) / 2, (p0y + p1y) / 2 + 8);
      });
      // window on the back wall
      const [wx0] = toMap(-2.05, 2.9), [wx1] = toMap(-0.45, 2.9);
      x.strokeStyle = '#49b6ff'; x.lineWidth = 10;
      x.beginPath(); x.moveTo(wx0, fy0); x.lineTo(wx1, fy0); x.stroke();
      // things
      const t = things();
      for (const [k, it] of Object.entries(t)) {
        const [px, py] = toMap(it.pos.x, it.pos.z);
        if (k === selected) {
          x.fillStyle = `${it.color}33`;
          x.beginPath(); x.arc(px, py, 20 + pulse * 50, 0, Math.PI * 2); x.fill();
        }
        x.fillStyle = '#fff';
        x.beginPath(); x.arc(px, py, k === 'agent' ? 26 : 20, 0, Math.PI * 2); x.fill();
        x.strokeStyle = it.color; x.lineWidth = 5; x.stroke();
        x.font = `${k === 'agent' ? 28 : 22}px serif`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(it.icon, px, py + 2);
        x.textBaseline = 'alphabetic';
        if (k === 'agent') { // which way he's facing: forward is (-sin h, -cos h) in x/z, and map y runs opposite to z
          const dx = -Math.sin(robot.heading), dy = Math.cos(robot.heading);
          x.strokeStyle = it.color; x.lineWidth = 6; x.lineCap = 'round';
          x.beginPath(); x.moveTo(px + dx * 30, py + dy * 30); x.lineTo(px + dx * 48, py + dy * 48); x.stroke();
        }
      }
    };
    const renderSide = () => {
      side.innerHTML = '';
      side.append(h('div.fm-tabs', {}, ...['People', 'Devices', 'Items'].map((k) => h('button', { class: k === tab ? 'on' : '', text: k, onclick: () => { tab = k; renderSide(); } }))));
      const t = things();
      const keys = { People: ['agent'], Devices: ['mac', 'agent'], Items: ['mug', 'chair'] }[tab];
      for (const k of keys) {
        const it = t[k];
        side.append(h('div.fm-row', { class: k === selected ? 'on' : '', onclick: () => { selected = k; renderSide(); } },
          k === 'agent' ? h('span.fm-av', { html: robotAvatar() }) : h('span.fm-ic', { text: it.icon }),
          h('div', {}, h('b', { text: it.name }), h('small', { text: it.sub }))));
      }
      const it = t[selected];
      side.append(h('div.fm-card', {}, h('b', { text: it.name }), h('small', { text: `${it.sub} · ${dist(it.pos)}` }),
        h('div.fm-actions', {},
          h('button.btn', { text: '🔊 Play Sound', onclick: () => playSound(selected) }),
          h('button.btn', { text: '🧭 Directions', onclick: () => os.notify({ app: 'findmy', title: 'Directions', body: `Walk ${dist(it.pos)} from the camera. Mind the chair.` }) }))));
    };
    const dist = (p) => `${Math.hypot(p.x, p.z + 2).toFixed(1)} m away`;
    const playSound = (k) => {
      os.audio.beep(); setTimeout(() => os.audio.beep(), 300); setTimeout(() => os.audio.beep(), 600);
      if (k === 'agent') {
        robot.face.set('surprised', 3);
        brain.say('Who’s pinging me?! 📡', 3);
        os.notify({ app: 'findmy', title: 'Playing Sound', body: 'Mr. Agent heard it. He looks confused.' });
      } else os.notify({ app: 'findmy', title: 'Playing Sound', body: `on ${things()[k].name}` });
    };
    const iv = setInterval(renderSide, 1000);
    const w = os.createWindow({
      app: this, title: 'Find My', width: 880, height: 540, sidebarWidth: 250, minWidth: 600,
      onClose: () => { cancelAnimationFrame(raf); clearInterval(iv); },
      body: (b) => b.append(h('div.split', {}, side, h('div.fm-main', {}, map))),
    });
    renderSide();
    draw();
    return w;
  },
};
