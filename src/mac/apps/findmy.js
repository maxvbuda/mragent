import { h } from '../ui.js';
import { robotAvatar } from '../os.js';

/** Find My: a live floor plan of the room with Mr. Agent, his Mac, mug and chair on it. */
export default {
  id: 'findmy', name: 'Find My', icon: 'findmy', single: true,
  about: 'Find My — locate Mr. Agent (he’s usually at his desk).',
  launch(os) {
    const { robot, room, brain } = os.ctx;
    const HB0 = os.ctx.layout.house.bounds;
    const W = 600, H = Math.round(600 * (HB0[3] - HB0[1] + 1.2) / (HB0[2] - HB0[0] + 1.2)); // keep the plan in proportion
    const map = h('canvas.fm-map', { width: W * 2, height: H * 2 });
    const x = map.getContext('2d');
    const side = h('div.sb.fm-side', { style: { width: '250px' } });
    let tab = 'Devices', selected = 'agent', pulse = 0, raf;
    // house bounds (three.js metres), with a margin for the garden
    const HB = os.ctx.layout.house.bounds;
    const bx = [HB[0] - 0.6, HB[2] + 0.6], bz = [HB[1] - 0.6, HB[3] + 0.6];
    const toMap = (px, pz) => [((px - bx[0]) / (bx[1] - bx[0])) * W * 2, ((bz[1] - pz) / (bz[1] - bz[0])) * H * 2];
    const things = () => ({
      agent: { name: 'Mr. Agent', sub: brain.activity, pos: robot.root.position, icon: '🤖', color: '#0a84ff' },
      mac: { name: 'Mr. Agent’s MacBook Pro', sub: 'On the desk · You are using it', pos: room.laptop.position, icon: '💻', color: '#30d158' },
      mug: { name: 'Matcha Mug', sub: brain.holdingMug !== null ? 'In Mr. Agent’s hand' : `${Math.round(brain.fill * 100)}% full`, pos: room.mug.getWorldPosition(room.mug.position.clone()), icon: '🍵', color: '#ff9f0a' },
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
      const house = os.ctx.layout.house;
      // rooms
      for (const r of house.rooms) {
        const [p0x, p0y] = toMap(r.rect[0], r.rect[3]), [p1x, p1y] = toMap(r.rect[2], r.rect[1]);
        x.fillStyle = dark ? '#2c2a26' : { oak: '#f3e6d3', walnut: '#ead8c4', tile: '#eef0ef', bathtile: '#e4f1f6', carpet: '#e6e3ee', concrete: '#e3e3e1' }[r.floor] || '#eee';
        x.fillRect(p0x, p0y, p1x - p0x, p1y - p0y);
        x.fillStyle = dark ? '#8e96a6' : '#8a8f99';
        x.font = '600 20px -apple-system, sans-serif';
        x.textAlign = 'center';
        x.fillText(r.name.toUpperCase(), (p0x + p1x) / 2, p0y + 30);
      }
      // furniture footprints
      x.fillStyle = dark ? '#454d5c' : '#d4d9e0';
      for (const [ax, az, bx2, bz2] of [...os.ctx.layout.obstacles, ...house.obstacles]) {
        const [p0x, p0y] = toMap(ax, bz2), [p1x, p1y] = toMap(bx2, az);
        x.beginPath(); x.roundRect(p0x, p0y, p1x - p0x, p1y - p0y, 6); x.fill();
      }
      // walls with door gaps
      x.strokeStyle = dark ? '#d7dce6' : '#4b5563';
      x.lineCap = 'square';
      for (const [x1, z1, x2, z2, ops] of house.walls) {
        const horiz = Math.abs(z1 - z2) < 1e-6;
        const len = horiz ? x2 - x1 : z2 - z1;
        const gaps = ops.filter((o) => o[4] !== 'window').map((o) => [o[0], o[1]]).sort((p, q) => p[0] - q[0]);
        let from = 0;
        const draw = (a2, b2) => {
          if (b2 - a2 < 0.01) return;
          const [sx, sy] = toMap(horiz ? x1 + a2 : x1, horiz ? z1 : z1 + a2), [ex, ey] = toMap(horiz ? x1 + b2 : x1, horiz ? z1 : z1 + b2);
          x.lineWidth = 7; x.beginPath(); x.moveTo(sx, sy); x.lineTo(ex, ey); x.stroke();
        };
        for (const [ga, gb] of gaps) { draw(from, ga); from = gb; }
        draw(from, len);
        x.strokeStyle = '#49b6ff';
        for (const o of ops.filter((q) => q[4] === 'window')) {
          const [sx, sy] = toMap(horiz ? x1 + o[0] : x1, horiz ? z1 : z1 + o[0]), [ex, ey] = toMap(horiz ? x1 + o[1] : x1, horiz ? z1 : z1 + o[1]);
          x.lineWidth = 8; x.beginPath(); x.moveTo(sx, sy); x.lineTo(ex, ey); x.stroke();
        }
        x.strokeStyle = dark ? '#d7dce6' : '#4b5563';
      }
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
