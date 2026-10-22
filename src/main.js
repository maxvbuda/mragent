import * as THREE from 'three';
import './style.css';
import { loadModels, makeMaterials } from './scene/assets.js';
import { World } from './scene/world.js';
import { buildRoom } from './scene/props.js';
import { buildHouse } from './scene/house.js';
import { Robot } from './scene/robot.js';
import { NavGrid } from './scene/nav.js';
import { Brain } from './scene/brain.js';
import { LaptopScreen } from './scene/screen.js';
import { audio, music } from './audio.js';
import { MacOS } from './mac/os.js';
import { Kuma } from './kuma/kuma.js';
import { WinPC } from './win/pc.js';
import { WinOS } from './win/os.js';
import { Damage } from './scene/damage.js';
import { AgentMind, toCommand } from './ai/agent.js';
import { Delivery, ITEMS } from './scene/delivery.js';
import { mergeSiblings, InstancedParts } from './scene/batch.js';

const $ = (s) => document.querySelector(s);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const loaderBar = $('#loader .bar i');
const loaderText = $('#loader .msg');

async function boot() {
  const { geos, layout } = await loadModels('/models.json', (p) => {
    loaderBar.style.width = `${Math.round(p * 80)}%`;
  });
  loaderText.textContent = 'Assembling Mr. Agent…';
  await new Promise((r) => setTimeout(r, 30));

  const world = new World($('#stage'));
  const M = makeMaterials();
  const screen = new LaptopScreen();
  const room = buildRoom(world.scene, geos, layout, M, screen);
  const robot = new Robot(geos, layout, M);
  world.scene.add(robot.root);
  const house = buildHouse(world.scene, geos, layout, M, geos, robot.mat);
  world.attachRoom(room, house);
  const nav = new NavGrid(layout, { extra: house.wallObstacles, bounds: layout.house.outside?.bounds });

  const hud = makeHud();
  const memories = { agent: [], kuma: [] }; // what each robot remembers (shown in the brain view)
  const brain = new Brain({
    robot, room, house, nav, screen, layout, world,
    hooks: { say: hud.say, activity: (t) => { hud.activity(t); remember(t); }, arrived: (t) => arrived(t) },
  });
  function arrived(target) {
    if (target !== 'kuma') return;
    robot.lookAt(kuma.robot.head.getWorldPosition(new THREE.Vector3()), 1);
    setTimeout(() => kuma.say(pick(['Oh hey, Mr. Agent. Want to swap computers? No? Didn’t think so.', 'Don’t look at my screen. It’s updating. Again.', 'Hi. Do you know how to uninstall Copilot?', 'Mr. Agent! Tell me there’s a Mac for me too.'])), 900);
    setTimeout(() => brain.say(pick(['Hang in there, Kuma.', 'Have you tried turning it off and on again? Oh. It does that by itself.', 'I brought moral support. And matcha.']), 3), 4200);
    setTimeout(() => robot.lookAt(null), 7000);
  }
  hud.activity(brain.activity);

  // Kuma, at his Windows PC in the living room
  const winpc = new WinPC();
  if (house.winScreen) { house.winScreen.mat.map = winpc.texture; house.winScreen.mat.color.setScalar(1); house.winScreen.mat.needsUpdate = true; }
  const kuma = new Kuma(world.scene, layout, { say: hud.kumaSay, nav, groundY: house.groundY, spots: brain.spots });
  winpc.on((e, data) => {
    kuma.react(e, data);
    const what = { bsod: '💥 Blue screen. Again.', update: '🔄 Windows started updating without asking.', work: '⌨️ PC is back. Typing.', win: '🎉 Something actually worked!', popup: `📢 Pop-up from ${data?.app || 'Windows'}: “${data?.title || ''}”` }[e];
    if (what) remember(what, 'kuma');
    if (e === 'bsod' || e === 'popup') audio.winError();
  });
  kuma.onSlam = () => audio.thud();
  // punching him: parts come off, sparks fly
  let shake = 0;
  const damage = new Damage({
    scene: world.scene, robot, brain, audio, bounds: layout.house.bounds, outerBounds: layout.house.outside?.bounds, groundY: house.groundY,
    hooks: {
      shake: (a) => { shake = Math.max(shake, a); },
      onHit: (n, integrity) => { remember(`🥊 Got punched (hit ${n}). Integrity ${Math.round(integrity * 100)}%.`); $('#integrity').hidden = false; $('#integrity b').style.width = `${Math.round(integrity * 100)}%`; recentPunches++; },
      onRepaired: () => { $('#integrity').hidden = true; },
      onBroken: () => { hud.toast('💥 Mr. Agent is broken — press Repair (U)'); kuma.say('WHAT DID YOU DO TO MR. AGENT?!'); kuma.setMood('shocked'); },
    },
  });
  let recentPunches = 0;
  setInterval(() => { recentPunches = Math.max(0, recentPunches - 1); }, 20000);

  // ------------------------------------------------------------ RoboMart: order things, a drone drops them on the porch
  const delivery = new Delivery({
    scene: world.scene, geos, layout, M, audio,
    hooks: {
      changed: () => renderOrders(),
      arrived: (o) => { hud.toast(`📦 ${o.item.emoji} ${o.item.name} is on the porch`); remember(`📦 Parcel on the porch: ${o.item.name}`, o.who); dispatch(o); },
      unboxed: (o, who) => itemEffect(o, who),
    },
  });
  brain.delivery = delivery;
  /** Send the right robot out for a parcel; both keep their own queue, so nothing gets lost. */
  function dispatch(o) {
    if (o.who === 'kuma') kuma.fetch(o, delivery);
    else brain.enqueueFetch(o);
  }
  /** Music for a dance or a party; it stops again afterwards (unless you were already playing some). */
  function partyMusic(seconds = 0) {
    if (music.playing) return;
    music.play();
    brain.partyMusic = true;
    if (seconds) setTimeout(() => { if (brain.partyMusic && !brain.dancing) { music.pause(); brain.partyMusic = false; } }, seconds * 1000);
  }
  function itemEffect(o, who) {
    const id = o.itemId;
    const agentSay = (t) => brain.say(t, 3.2);
    remember(`🎁 Unboxed: ${o.item.name}`, who);
    hud.toast(`🎁 ${who === 'kuma' ? 'Kuma' : 'Mr. Agent'} unboxed ${o.item.emoji} ${o.item.name}`);
    if (who === 'kuma') {
      kuma.cheer = 0;
      kuma.setMood('happy');
      if (id === 'linuxUsb') { kuma.say('A Linux USB?! Rebooting RIGHT NOW.'); setTimeout(() => winpc.linux(90), 2500); return; }
      if (id === 'macbook') { kuma.say(pick(['A MAC? For ME? I’m… I’m not crying, it’s coolant.', 'Mr. Agent, LOOK. I’m one of you now.'])); winpc.peace(150); return; }
      if (id === 'keyboard') { kuma.typeBoost = true; kuma.say('Clicky. Clacky. Now I can rage-type twice as fast.'); return; }
      if (id === 'spareParts') { if (damage.hits || damage.lost.length) { kuma.say('Spare parts? Hold on, Mr. Agent, I’ll fix you.'); damage.repair(); } else kuma.say('Spare parts. Nice. I’ll keep them for when Windows breaks me.'); return; }
      kuma.say({ matcha: 'Matcha. I don’t even have a mug. Thanks though.', duck: 'A duck. I will explain my bugs to it. It will judge me.', pizza: 'I can’t eat pizza. Put it on the table for the humans.', battery: 'Ooh, fresh electrons. Better than coffee.', plant: 'A plant. It’ll be the only thing on this desk that’s thriving.', balloons: 'Balloons? Is it my birthday? Is it Patch Tuesday?', trophy: '“World’s Best Robot”. Finally, some recognition.' }[id] || 'For me? Thanks!');
      if (id === 'balloons') partyMusic(20);
      return;
    }
    if (id === 'matcha') { brain.fill = 1; room.setFill(1); robot.energy = 1; agentSay('Ceremonial grade! The mug is full and so is my heart.'); return; }
    if (id === 'battery') { robot.energy = 1; agentSay('Mmm, 100%. I feel like a new robot.'); return; }
    if (id === 'spareParts') { if (damage.hits || damage.lost.length) damage.repair(); else agentSay('Spare parts! I’ll keep them in case someone punches me again. 👀'); return; }
    if (id === 'balloons') { agentSay('PARTY! 🎈'); partyMusic(); brain.command({ type: 'dance', seconds: 12 }); return; }
    if (id === 'linuxUsb') { agentSay('Linux? I’ll give this to Kuma. He needs it more than I do.'); return; }
    if (id === 'macbook') { agentSay('Another Mac? Now I can code in stereo.'); return; }
    agentSay({ duck: 'Hello, duck. Let me explain my code to you. Line one…', pizza: 'I can’t eat this. I’ll put it on the dining table for guests.', plant: 'A new friend for the fern!', trophy: 'World’s Best Robot? Me? 🥹', keyboard: 'Clicky! Kuma would love this.' }[id] || 'Thank you!');
  }

  // shop panel
  const shopEl = $('#shop');
  let shopFor = 'agent';
  const STATUS = { processing: 'Packing…', flying: '🚁 On its way', delivered: '📦 On the porch', carrying: '🚶 Being carried in', unboxing: '🎁 Unboxing', unboxed: '✓ Delivered' };
  function renderShop() {
    $('#shop-grid').replaceChildren(...Object.entries(ITEMS).map(([id, it]) => {
      const b = document.createElement('button');
      b.className = 'shop-item';
      b.innerHTML = `<span class="e">${it.emoji}</span><b></b><small></small><i>$${it.price}</i>`;
      b.querySelector('b').textContent = it.name;
      b.querySelector('small').textContent = it.desc;
      b.addEventListener('click', () => placeOrder(id, shopFor));
      return b;
    }));
  }
  function placeOrder(id, who) {
    audio.unlock();
    const o = delivery.order(id, who);
    if (!o) return null;
    audio.pop();
    hud.toast(`🛒 Ordered ${o.item.emoji} ${o.item.name} for ${who === 'kuma' ? 'Kuma' : 'Mr. Agent'}`);
    remember(`🛒 Someone ordered me ${o.item.name}`, who);
    return o;
  }
  function renderOrders() {
    const list = $('#shop-orders');
    if (!delivery.orders.length) return;
    list.replaceChildren(...delivery.orders.slice(-8).reverse().map((o) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${o.item.emoji}</span><span></span><span class="st ${o.status}">${STATUS[o.status] || o.status}</span>`;
      li.children[1].textContent = `${o.item.name} → ${o.who === 'kuma' ? 'Kuma' : 'Mr. Agent'}`;
      return li;
    }));
  }
  document.querySelectorAll('.shop-for button').forEach((b) => b.addEventListener('click', () => {
    shopFor = b.dataset.for;
    document.querySelectorAll('.shop-for button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  function toggleShop(open = shopEl.hidden) {
    shopEl.hidden = !open;
    $('#btn-shop').classList.toggle('on', open);
    if (open && !$('#shop-grid').children.length) renderShop();
  }
  $('#shop-close').addEventListener('click', () => toggleShop(false));

  // his mind: Qwen3-1.7B in the browser (WebLLM), with a rule-based fallback
  const mind = new AgentMind();
  window.__mr = { world, robot, brain, room, house, screen, THREE, kuma, winpc, damage, mind, delivery }; // handy for poking at things from devtools

  const mac = new MacOS($('#mac'), {
    robot, brain, screen, world, music, audio, room, layout,
    onExit: () => leaveMac(),
  });
  window.__mr.mac = mac;
  const win = new WinOS($('#win'), { pc: winpc, audio, kuma, onExit: () => leaveMac() });
  window.__mr.win = win;

  // ------------------------------------------------------------ time of day
  let timeMode = 'real';
  const presets = [['real', 'Real time'], [8.5, 'Morning'], [13, 'Afternoon'], [18.7, 'Sunset'], [22.5, 'Night']];
  const currentHours = () => {
    if (timeMode === 'real') { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
    return timeMode;
  };
  const cycleTime = () => {
    const i = presets.findIndex(([v]) => v === timeMode);
    const [v, label] = presets[(i + 1) % presets.length];
    timeMode = v;
    hud.toast(`🕒 ${label}`);
    $('#btn-time .lbl').textContent = label;
  };
  mac.setTimeHook((h) => { timeMode = h; $('#btn-time .lbl').textContent = h === 'real' ? 'Real time' : `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`; });
  world.setTime(currentHours());

  // ------------------------------------------------------------ picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const robotMeshes = robot.meshes;
  const laptopMeshes = room.laptopClickables;
  const winMeshes = house.winScreen ? [house.winScreen.mesh] : [];
  const kumaMeshes = kuma.meshes;
  let hover = null;
  let downAt = null;
  const pickAt = (e) => {
    const rect = world.renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, world.camera);
    const hits = ray.intersectObjects([...laptopMeshes, ...robotMeshes, ...winMeshes, ...kumaMeshes], false);
    if (!hits.length) return null;
    const o = hits[0].object;
    lastHit = hits[0];
    return laptopMeshes.includes(o) ? 'laptop' : winMeshes.includes(o) ? 'windows' : o.userData.kuma ? 'kuma' : 'robot';
  };
  let lastHit = null;
  let punchMode = false;
  const canvas = world.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    if (inMac) return;
    hover = pickAt(e);
    canvas.style.cursor = hover ? 'pointer' : '';
    hud.tip((punchMode ? { robot: '🥊 Punch!', kuma: 'Kuma is off-limits' } : {})[hover] || { laptop: 'Use Mr. Agent’s Mac', windows: 'Use Kuma’s Windows PC (good luck)', kuma: 'Talk to Kuma', robot: 'Say hi' }[hover] || null, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; audio.unlock(); });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const what = pickAt(e);
    if (what === 'laptop') enterMac();
    else if (what === 'windows') enterWin();
    else if (what === 'kuma') { if (punchMode) { kuma.say(pick(['Don’t even think about it.', 'Touch me and I install Windows on you.', 'I’m already suffering enough!'])); kuma.slam(); } else { kuma.poke(); toggleChat(true, 'kuma'); } }
    else if (what === 'robot') {
      if (punchMode) damage.punch(lastHit.point.clone(), ray.ray.direction.clone(), lastHit.object);
      else brain.wave();
    }
  });

  // ------------------------------------------------------------ camera flights & the Mac
  let inMac = false;
  let flight = null;
  const savedCam = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const fly = (toPos, toTarget, dur = 1.4) => new Promise((resolve) => {
    flight = { from: world.camera.position.clone(), fromT: world.controls.target.clone(), toPos, toTarget, t: 0, dur, resolve };
  });

  function screenRect(m = room.screenMesh, hw = 0.169, hh = 0.108) {
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => {
      const p = m.localToWorld(new THREE.Vector3(x, y, 0)).project(world.camera);
      return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight];
    });
    const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
    return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }

  async function enterMac() {
    if (inMac || flight) return;
    audio.unlock();
    inMac = true;
    hud.tip(null);
    hud.setVisible(false);
    brain.requestMac();
    savedCam.pos.copy(world.camera.position);
    savedCam.target.copy(world.controls.target);
    world.controls.enabled = false;
    const m = room.screenMesh;
    const center = m.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion()));
    const fovFit = (0.25 / 2) / Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2));
    audio.whoosh();
    await fly(center.clone().addScaledVector(normal, fovFit), center, 1.5);
    mac.open(screenRect());
  }

  let inWin = false;
  async function enterWin() {
    if (inMac || flight || !house.winScreen) return;
    audio.unlock();
    inMac = true;
    inWin = true;
    hud.tip(null);
    hud.setVisible(false);
    kuma.userTakesOver();
    savedCam.pos.copy(world.camera.position);
    savedCam.target.copy(world.controls.target);
    world.controls.enabled = false;
    const m = house.winScreen.mesh;
    const [sw, sh] = house.winScreen.size;
    const center = m.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion()));
    const fit = Math.max(sh, sw / world.camera.aspect) * 1.12;
    const dist = (fit / 2) / Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2));
    audio.whoosh();
    await fly(center.clone().addScaledVector(normal, dist), center, 1.5);
    win.open(screenRect(m, sw / 2, sh / 2));
  }

  async function leaveMac() {
    if (inWin) kuma.userLeaves(); else brain.releaseMac();
    inWin = false;
    hud.setVisible(true);
    await fly(savedCam.pos.clone(), savedCam.target.clone(), 1.3);
    world.controls.enabled = true;
    inMac = false;
  }

  // ------------------------------------------------------------ HUD buttons & keys
  const actions = {
    mac: () => enterMac(),
    coffee: () => { brain.queueActivity('coffee'); hud.toast('🍵 Matcha run queued'); },
    stretch: () => { brain.queueActivity('stretch'); hud.toast('🙆 Stretch break queued'); },
    window: () => { brain.queueActivity('window'); hud.toast('🪟 Window break queued'); },
    dance: () => { brain.queueActivity('dance'); partyMusic(); hud.toast('🎶 Dance break'); },
    wave: () => brain.wave(),
    time: () => cycleTime(),
    sound: () => {
      audio.unlock();
      audio.setEnabled(!audio.enabled);
      $('#btn-sound .ico').textContent = audio.enabled ? '🔊' : '🔇';
    },
    reset: () => { if (!inMac) fly(world.home.pos.clone(), world.home.target.clone(), 1.1).then(() => {}); },
    tv: () => { brain.queueActivity('tv'); hud.toast('📺 TV time queued'); },
    tinker: () => { brain.queueActivity('workshop'); hud.toast('🛠 Workshop visit queued'); },
    snack: () => { brain.queueActivity('fridge'); hud.toast('🔋 Fridge raid queued'); },
    sleep: () => { brain.queueActivity('bed'); hud.toast('😴 Nap queued'); },
    punch: () => {
      punchMode = !punchMode;
      document.body.classList.toggle('punching', punchMode);
      $('#btn-punch').classList.toggle('danger', punchMode);
      hud.toast(punchMode ? '🥊 Punch mode: click Mr. Agent' : '🥊 Punch mode off');
    },
    repair: () => {
      if (!damage.hits && !damage.lost.length) { hud.toast('🔧 Nothing to repair'); return; }
      damage.repair();
      $('#integrity').hidden = true;
      hud.toast('🔧 Repairing…');
    },
    chat: () => toggleChat(true),
    brain: () => toggleBrain(),
    shop: () => toggleShop(),
    walls: () => {
      const order = ['cutaway', 'down', 'up'];
      house.wallMode = order[(order.indexOf(house.wallMode) + 1) % order.length];
      $('#btn-walls .lbl').textContent = { cutaway: 'Cutaway', down: 'Walls down', up: 'Walls up' }[house.wallMode];
      hud.toast(`🧱 ${$('#btn-walls .lbl').textContent}`);
    },
    follow: () => {
      followRobot = !followRobot;
      $('#btn-follow').classList.toggle('on', followRobot);
      hud.toast(followRobot ? '🎥 Following Mr. Agent' : '🎥 Free camera');
    },
  };
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => {
    audio.unlock();
    actions[b.dataset.act]();
    e.currentTarget.blur();
  }));
  const keymap = { m: 'mac', c: 'coffee', y: 'stretch', o: 'window', n: 'dance', h: 'wave', t: 'time', v: 'sound', r: 'reset', f: 'follow', g: 'tv', k: 'tinker', b: 'snack', z: 'sleep', x: 'walls', p: 'punch', u: 'repair', i: 'brain', e: 'shop' };
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

  // ------------------------------------------------------------ keys that are held: WASD moves the camera, arrow keys walk him
  const held = new Set();
  let autoFollow = false;
  const CAM_KEYS = ['w', 'a', 's', 'd'], DRIVE_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  window.addEventListener('keydown', (e) => {
    if (inMac || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!CAM_KEYS.includes(k) && !DRIVE_KEYS.includes(k)) return;
    e.preventDefault();
    held.add(k);
    audio.unlock();
    if (CAM_KEYS.includes(k)) {
      // flying the camera yourself: stop following him
      if (followRobot && !brain.driving) { followRobot = false; autoFollow = false; $('#btn-follow').classList.remove('on'); }
      return;
    }
    if (!brain.driving && !brain.broken) {
      if (brain.command({ type: 'drive' })) {
        brain.driving = true;
        if (!followRobot) { followRobot = true; autoFollow = true; $('#btn-follow').classList.add('on'); }
      }
    }
  });
  window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => held.clear());
  const camDir = () => {
    const f = new THREE.Vector3().subVectors(world.controls.target, world.camera.position).setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    return { f, r: new THREE.Vector3(-f.z, 0, f.x) };
  };
  function updateDriveInput(shift) {
    const { f, r } = camDir();
    const v = new THREE.Vector3();
    if (held.has('arrowup')) v.add(f);
    if (held.has('arrowdown')) v.sub(f);
    if (held.has('arrowright')) v.add(r);
    if (held.has('arrowleft')) v.sub(r);
    brain.input.x = v.x; brain.input.z = v.z; brain.input.run = shift;
    if (autoFollow && !brain.driving) { autoFollow = false; followRobot = false; $('#btn-follow').classList.remove('on'); }
  }
  /** WASD slides the camera (and what it's looking at) across the floor; Shift goes faster. */
  const camVel = new THREE.Vector3();
  function updateCameraKeys(dt, shift) {
    const { f, r } = camDir();
    const want = new THREE.Vector3();
    if (held.has('w')) want.add(f);
    if (held.has('s')) want.sub(f);
    if (held.has('d')) want.add(r);
    if (held.has('a')) want.sub(r);
    const dist = world.camera.position.distanceTo(world.controls.target);
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(THREE.MathUtils.clamp(dist * 0.45, 1.2, 8) * (shift ? 2.5 : 1));
    camVel.lerp(want, 1 - Math.exp(-dt * 10)); // ease in and out
    if (camVel.lengthSq() < 1e-6) return;
    world.camera.position.addScaledVector(camVel, dt);
    world.controls.target.addScaledVector(camVel, dt);
  }
  let shiftHeld = false;
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftHeld = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') shiftHeld = false; });

  // ------------------------------------------------------------ inside his brain (Mr. Agent's, or Kuma's)
  const bv = $('#brainview');
  let brainWho = 'agent';
  const kumaThink = { activity: 0, thought: '' };
  function remember(text, who = 'agent') {
    const mem = memories[who];
    if (mem[0]?.text === text) return;
    mem.unshift({ t: new Date(), text });
    mem.length = Math.min(mem.length, 40);
    if (!$('#brainview').hidden && who === brainWho) renderMemory();
  }
  function renderMemory() {
    $('#bv-log').replaceChildren(...memories[brainWho].map((m) => { const li = document.createElement('li'); const tm = document.createElement('time'); tm.textContent = m.t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); const sp = document.createElement('span'); sp.textContent = m.text; li.append(tm, sp); return li; }));
  }
  function renderVitals() {
    const row = (k, v, wide) => `<div${wide ? ' class="wide"' : ''}><span>${k}</span> <b>${v}</b></div>`;
    const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const mindRow = row('Mind', mind.status === 'ready' ? 'AI online' : mind.status === 'loading' ? `waking ${Math.round(mind.progress * 100)}%` : 'basic mode');
    if (brainWho === 'kuma') {
      $('#bv-vitals').innerHTML = row('Doing', kuma.rage >= 0 ? 'slamming the desk' : kuma.cheer >= 0 ? 'celebrating' : kuma.state === 'wait' ? 'waiting on Windows' : 'typing (angrily)', true)
        + row('Visor', kuma.mood) + row('PC', { desktop: 'working', update: `updating ${winpc.percent}%`, bsod: 'blue screen', boot: 'rebooting' }[winpc.state])
        + row('Crashes today', winpc.crashes) + row('Updates today', winpc.updates)
        + mindRow + row('Patience', `${Math.max(0, 100 - winpc.crashes * 15 - winpc.updates * 10)}%`);
      return;
    }
    $('#bv-vitals').innerHTML = row('Doing', esc(brain.activity), true)
      + row('Mode', { life: 'living his life', cmd: 'following orders', user: 'on break', broken: 'broken' }[brain.mode] || brain.mode)
      + row('Face', robot.face.expr)
      + row('Battery', `${Math.round(robot.energy * 100)}%`)
      + row('Integrity', `${Math.round(damage.integrity * 100)}%`)
      + mindRow
      + row('Neural activity', `${Math.round(robot.brainActivity * 100)}%`);
  }
  let vitalsAcc = 0;
  function setBrainWho(who) {
    if (who === brainWho && !bv.hidden) return;
    brainWho = who;
    bv.querySelector('header b').textContent = who === 'kuma' ? '🧠 Inside Kuma’s brain' : '🧠 Inside Mr. Agent’s brain';
    robot.setXray(!bv.hidden && who === 'agent');
    $('#bv-thought').classList.remove('live');
    $('#bv-thought').innerHTML = `<span class="bv-dim">Talk to ${who === 'kuma' ? 'Kuma' : 'him'} (💬) and watch ${who === 'kuma' ? 'him' : 'him'} think…</span>`;
    $('#bv-decision').textContent = '';
    if (who === 'kuma' && kumaThink.thought) $('#bv-thought').textContent = kumaThink.thought;
    renderVitals();
    renderMemory();
  }
  function toggleBrain(open = bv.hidden, who = talkTo) {
    bv.hidden = !open;
    $('#btn-brain').classList.toggle('on', open);
    if (!open) { robot.setXray(false); return; }
    brainWho = null;
    setBrainWho(who);
    if (inMac || flight) return;
    if (who === 'kuma') {
      // Kuma sits still: look at him from the side of his desk
      const head = kuma.robot.head.getWorldPosition(new THREE.Vector3());
      followRobot = false;
      $('#btn-follow').classList.remove('on');
      fly(head.clone().add(new THREE.Vector3(1.5, 0.35, -1.3)), head.clone().add(new THREE.Vector3(0, -0.15, 0)), 1.1);
      return;
    }
    // fly up to his face so you can see the brain through the glass
    const head = robot.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
    const fwd = robot.worldForward(new THREE.Vector3());
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    fly(head.clone().addScaledVector(fwd, 1.1).addScaledVector(side, 0.55).add(new THREE.Vector3(0, 0.25, 0)), head, 1.1).then(() => {
      followRobot = true;
      $('#btn-follow').classList.add('on');
    });
  }
  $('#brain-close').addEventListener('click', () => toggleBrain(false));
  /** Live view of one thought as it streams in. */
  function showThinking(who) {
    if (!bv.hidden) setBrainWho(who);
    const el = $('#bv-thought');
    const shown = () => !bv.hidden && brainWho === who;
    if (shown()) { el.classList.add('live'); el.textContent = ''; $('#bv-decision').textContent = ''; }
    if (who === 'agent') robot.brainActivity = 1; else kumaThink.activity = 1;
    return (u) => {
      if (who === 'agent') robot.brainActivity = 1; else kumaThink.activity = 1;
      if (!shown()) return;
      el.textContent = u.thought || '…';
      $('#bv-context').textContent = u.context;
      $('#bv-json').textContent = u.raw;
    };
  }
  function showDecision(d, who = 'agent') {
    if (who === 'kuma') kumaThink.thought = d.thought || '';
    remember(`💭 ${d.thought || d.reply}`, who);
    if (bv.hidden || brainWho !== who) return;
    const el = $('#bv-thought');
    el.classList.remove('live');
    el.textContent = d.thought || (d.source === 'rules' ? 'Basic mode: I spotted a keyword and went with my gut.' : '…');
    const chip = (t) => { const i = document.createElement('i'); i.textContent = t; return i; };
    $('#bv-decision').replaceChildren(chip(`action: ${d.action.replace(/_/g, ' ')}`), ...(d.place && d.place !== 'none' ? [chip(`→ ${d.place.replace(/_/g, ' ')}`)] : []), chip(`mood: ${d.mood || 'normal'}`), chip(d.source === 'qwen' ? `${who === 'kuma' ? 'Kuma' : 'MrAgent'} AI` : 'quick reply'));
    if (d.raw) $('#bv-json').textContent = d.raw;
  }

  // ------------------------------------------------------------ chat (Mr. Agent or Kuma)
  const chatEl = $('#chat'), chatInput = $('#chat-input');
  const logs = { agent: $('#chat-log'), kuma: $('#chat-log-kuma') };
  const NAMES = { agent: 'MrAgent', kuma: 'Kuma' };
  let talkTo = 'agent';
  const GREET = {
    agent: 'Hi! Tell me what to do — “go to the kitchen”, “make some matcha”, “visit Kuma”, “dance”… I’ll think about it.',
    kuma: 'What. I’m busy. Windows is “getting things ready”. Again.',
  };
  function setTalkTo(who) {
    talkTo = who;
    document.querySelectorAll('#chat-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.who === who));
    logs.agent.hidden = who !== 'agent';
    logs.kuma.hidden = who !== 'kuma';
    chatInput.placeholder = who === 'kuma' ? 'Talk to Kuma… (he can’t leave his chair)' : 'Ask him to go somewhere, make matcha, dance…';
    if (!logs[who].children.length) addMsg('bot', GREET[who]);
    renderStatus(mind);
    if (!bv.hidden) toggleBrain(true, who);
    chatInput.focus();
  }
  document.querySelectorAll('#chat-tabs button').forEach((b) => b.addEventListener('click', () => setTalkTo(b.dataset.who)));
  function toggleChat(open = chatEl.hidden, who) {
    chatEl.hidden = !open;
    $('#btn-chat').classList.toggle('on', open);
    if (open) { setTalkTo(who || talkTo); setTimeout(() => chatInput.focus(), 30); if (aiAllowed()) mind.load(); }
  }
  function addMsg(who, text, note, log = logs[talkTo]) {
    const m = document.createElement('div');
    m.className = `m ${who}${log === logs.kuma && who.startsWith('bot') ? ' kuma' : ''}`;
    m.textContent = text;
    if (note) { const s = document.createElement('small'); s.textContent = note; m.append(s); }
    log.append(m);
    log.scrollTop = 1e6;
    return m;
  }
  $('#chat-close').addEventListener('click', () => toggleChat(false));
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggleChat(false); chatInput.blur(); } e.stopPropagation(); });
  const nowHHMM = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    audio.unlock();
    const who = talkTo, log = logs[who];
    if (mind.status === 'idle' && aiAllowed()) mind.load(); // it unloads itself after a quiet spell
    addMsg('me', text, null, log);
    if (who === 'kuma') { await talkToKuma(text, log); return; }
    if (brain.broken) { addMsg('bot', '*bzzt* … (he’s broken — press Repair)', null, log); return; }
    const pending = addMsg('bot typing', mind.status === 'ready' ? 'MrAgent is thinking…' : 'thinking…', null, log);
    robot.face.set('thinking', 8);
    if (mind.status === 'ready') hud.say('🤔 …', 20);
    const p = robot.root.position;
    const roomNow = house.rooms.find((r) => p.x >= r.rect[0] && p.x <= r.rect[2] && p.z >= r.rect[1] && p.z <= r.rect[3]);
    const d = await mind.think(text, {
      activity: brain.activity, room: roomNow ? roomNow.name : 'garden', energy: robot.energy, integrity: damage.integrity,
      recentPunches, time: nowHHMM(),
    }, 'agent', true, showThinking('agent'));
    pending.remove();
    showDecision(d);
    robot.face.set(d.mood && d.mood !== 'normal' ? d.mood : 'happy', 2);
    const cmd = toCommand(d);
    const acting = d.action !== 'chat' && cmd;
    addMsg('bot', d.reply, `${d.source === 'qwen' ? 'MrAgent AI' : 'quick reply'}${acting ? ` · ${d.action.replace(/_/g, ' ')}${d.place && d.place !== 'none' ? ` → ${d.place.replace(/_/g, ' ')}` : ''}` : ''}`, log);
    if (acting && cmd.type === 'order') {
      const forKuma = /\bkuma\b/i.test(text);
      placeOrder(cmd.item, forKuma ? 'kuma' : 'agent');
      brain.say(d.reply, Math.min(6, 1.5 + d.reply.length / 18));
    } else if (acting) {
      brain.command(cmd);
      if (cmd.type === 'drive') { brain.driving = true; followRobot = true; autoFollow = true; $('#btn-follow').classList.add('on'); }
    } else brain.say(d.reply, Math.min(6, 1.5 + d.reply.length / 18));
  });

  async function talkToKuma(text, log) {
    const pending = addMsg('bot typing', mind.status === 'ready' ? 'Kuma is thinking…' : 'thinking…', null, log);
    if (mind.status === 'ready') hud.kumaSay('…', 20);
    const d = await mind.think(text, {
      pc: { desktop: 'working (for now)', update: `force-updating, ${winpc.percent}%`, bsod: 'blue screen', boot: 'rebooting' }[winpc.state] || winpc.state,
      crashes: winpc.crashes, updates: winpc.updates, agent: brain.broken ? 'broken on the floor' : brain.activity.toLowerCase(), time: nowHHMM(),
    }, 'kuma', true, showThinking('kuma'));
    pending.remove();
    showDecision(d, 'kuma');
    const acting = d.action !== 'chat';
    addMsg('bot', d.reply, `${d.source === 'qwen' ? 'Kuma AI' : 'quick reply'}${acting ? ` · ${d.action.replace(/_/g, ' ')}` : ''}`, log);
    hud.kumaSay(d.reply, Math.min(7, 2 + d.reply.length / 16));
    kuma.act(d.action, d.mood);
    if (d.action === 'order_item' && d.item && d.item !== 'none') placeOrder(d.item, 'kuma');
    if (d.action === 'go_outside') kuma.goTo('garden');
    if (d.action === 'sit_on_garden_bench') kuma.goTo('gardenBench');
    if (d.action === 'back_to_work' && !kuma.atDesk) kuma.backToDesk();
    if (d.action === 'visit_mr_agent') {
      const p = robot.root.position, f = robot.worldForward(new THREE.Vector3());
      kuma.goToPoint(p.clone().addScaledVector(f, 1.0).setY(0), p.clone());
    }
    if (d.action === 'restart_pc') setTimeout(() => winpc.forceUpdate(), 1200);
    if (d.action === 'call_mr_agent' && !brain.broken) brain.command({ type: 'goto', target: 'kuma', label: 'Kuma called for help', say: pick(['Coming, Kuma!', 'On my way — hold on!', 'Did it blue-screen again?']) });
  }

  // model status (one model, two minds)
  function renderStatus(m) {
    const box = $('#chat-brain');
    const N = NAMES[talkTo];
    box.classList.toggle('ready', m.status === 'ready');
    $('#chat-model').textContent = { idle: `🧠 ${N} (basic mode)`, loading: `🧠 Waking up ${N}… ${Math.round(m.progress * 100)}%`, ready: `🧠 ${N} · running on your device`, unsupported: `🧠 ${N} (basic mode — no WebGPU here)`, error: `🧠 ${N} (basic mode)` }[m.status];
    $('#chat-load').textContent = `Wake up ${N}`;
    $('#chat-load').hidden = m.status !== 'idle' && m.status !== 'error';
    $('#chat-bar').hidden = m.status !== 'loading';
    $('#chat-bar i').style.width = `${Math.round(m.progress * 100)}%`;
    box.title = m.status === 'loading' ? 'Downloading the robots’ brain (about 1 GB, cached after the first time)' : m.status === 'ready' ? `${N} runs entirely in your browser` : '';
  }
  mind.onChange(renderStatus);
  $('#chat-load').addEventListener('click', () => mind.load());
  // The model (about 1 GB, ~2 GB of GPU memory) only loads once you open the chat, and unloads after 10 idle minutes.
  const aiAllowed = () => { try { return localStorage.getItem('mragent.qwen') !== 'off'; } catch { return true; } };
  setInterval(() => mind.unloadIfIdle(10 * 60), 30000);

  // jump the camera to a room (or the whole house)
  const goRoom = (id) => {
    if (inMac) return;
    followRobot = false;
    $('#btn-follow').classList.remove('on');
    document.querySelectorAll('#rooms button').forEach((b) => b.classList.toggle('on', b.dataset.room === id));
    if (id === 'house') { fly(world.overview.pos.clone(), world.overview.target.clone(), 1.4); return; }
    if (id === 'office') { fly(world.home.pos.clone(), world.home.target.clone(), 1.2); return; }
    if (id === 'garden') { fly(new THREE.Vector3(16.5, 4.2, -6.5), new THREE.Vector3(11.0, 0, -1.6), 1.4); return; }
    const r = house.rooms.find((x) => x.id === id);
    const [x0, z0, x1, z1] = r.rect;
    const c = new THREE.Vector3((x0 + x1) / 2, 0.7, (z0 + z1) / 2);
    const size = Math.max(x1 - x0, z1 - z0);
    const pos = c.clone().add(new THREE.Vector3(size * 0.32, size * 0.75 + 1.8, -(size * 0.62 + 1.6)));
    fly(pos, c, 1.2);
  };
  const roomsBar = $('#rooms');
  [['house', '🏠 House'], ...house.rooms.map((r) => [r.id, r.name]), ['garden', '🌳 Garden']].forEach(([id, label], i) => {
    const b = document.createElement('button');
    b.dataset.room = id;
    b.textContent = label;
    b.title = `${label} (${i})`;
    b.addEventListener('click', () => { audio.unlock(); goRoom(id); b.blur(); });
    roomsBar.append(b);
  });
  window.addEventListener('keydown', (e) => {
    if (inMac || typing(e) || e.metaKey || e.ctrlKey || e.altKey || !/^[0-8]$/.test(e.key)) return;
    goRoom(e.key === '0' ? 'house' : e.key === '8' ? 'garden' : house.rooms[+e.key - 1].id);
  });
  window.addEventListener('keydown', (e) => {
    if (inMac || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/' || e.key === 'Enter') { e.preventDefault(); toggleChat(true); return; }
    const a = keymap[e.key.toLowerCase()];
    if (a) { audio.unlock(); actions[a](); }
  });
  let followRobot = false;

  // Keep the camera above the ground and near the house; walls in the way are cut away instead.
  const [hx0, hz0, hx1, hz1] = layout.house.outside?.bounds || layout.house.bounds; // the camera may look around the garden too
  const houseCenter = new THREE.Vector3((hx0 + hx1) / 2, 0, (hz0 + hz1) / 2);
  function keepInRoom(v, margin, isTarget = false) {
    if (isTarget) {
      v.x = THREE.MathUtils.clamp(v.x, hx0 + margin, hx1 - margin);
      v.z = THREE.MathUtils.clamp(v.z, hz0 + margin, hz1 - margin);
      v.y = THREE.MathUtils.clamp(v.y, 0, 2.5);
      return;
    }
    v.y = THREE.MathUtils.clamp(v.y, 0.3, 32);
    const off = v.clone().sub(houseCenter);
    off.y = 0;
    if (off.length() > 32) v.copy(houseCenter.clone().add(off.setLength(32)).setY(v.y));
  }

  // ------------------------------------------------------------ main loop
  const clock = new THREE.Clock();
  let timeAcc = 1;
  const headPos = new THREE.Vector3();
  $('#loader').classList.add('done');
  setTimeout(() => $('#loader').remove(), 900);
  hud.say('Hi! I’m Mr. Agent. Click my Mac if you want to use it.', 4.5);

  // Tiny parts (fingertips, knuckles, screws) cast shadows only a pixel or two across; skipping them saves a lot of draw calls.
  const _sph = new THREE.Sphere(), _scl = new THREE.Vector3();
  let skipped = 0;
  world.scene.updateMatrixWorld(true);
  world.scene.traverse((o) => {
    if (!o.isMesh || !o.castShadow || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.getWorldScale(_scl);
    _sph.copy(o.geometry.boundingSphere);
    if (_sph.radius * Math.max(_scl.x, _scl.y, _scl.z) < 0.04) { o.castShadow = false; skipped++; }
  });
  // Fewer draw calls for the robots (identical look): repeated finger parts are instanced, and
  // meshes on the same bone with the same material are merged.
  const agentSkip = new Set([robot.visor, ...robot.head.children, ...robot.cables.map((c) => c.mesh),
    ...robot.arms.flatMap((a) => [a.pistonBody, a.pistonRod])].filter(Boolean));
  robot.root.traverse((o) => { if (o.isMesh && o.geometry?.attributes.color) agentSkip.add(o); }); // battery LEDs repaint per vertex
  const agentParts = new InstancedParts(world.scene, robot.root, { skip: agentSkip });
  const merged = mergeSiblings(robot.root, agentSkip) + mergeSiblings(kuma.robot.root);
  const refresh = (list, root, flag) => { list.length = 0; root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.userData[flag] = true; list.push(o); } }); };
  refresh(robot.meshes, robot.root, 'robot');
  refresh(kuma.meshes, kuma.robot.root, 'kuma');
  window.__mr.batching = { instanced: agentParts.removed, merged, tinyShadowsSkipped: skipped, agentParts };

  // Furniture that never moves doesn't need its matrices recomputed every frame.
  const moving = new Set([house.fridge?.group, house.frontDoor?.group, ...(house.pieces || []).map((p) => p.mesh)].filter(Boolean));
  for (const g of house.group.children) {
    if (moving.has(g) || g.isLight) continue;
    let dynamic = false;
    g.traverse((o) => { if (moving.has(o)) dynamic = true; });
    if (dynamic) continue;
    g.updateMatrixWorld(true);
    g.traverse((o) => { o.matrixAutoUpdate = false; });
  }

  // Things that only need drawing when you can see them (screens, faces).
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const seen = (obj, r) => {
    if (inMac && !flight) return false;
    obj.getWorldPosition(sphere.center);
    sphere.radius = r;
    return frustum.intersectsSphere(sphere);
  };
  let lastFrameMs = 0, frameNo = 0;
  world.renderer.shadowMap.autoUpdate = false; // refreshed every other frame below
  world.renderer.setAnimationLoop((ms) => {
    // never draw faster than ~60 fps (even on 120 Hz screens), and 30 fps while you're in another app
    if (ms - lastFrameMs < (document.hasFocus() ? 12 : 30)) return;
    lastFrameMs = ms;
    frameNo++;
    window.__mr.frames = frameNo;
    const dt = Math.min(0.05, clock.getDelta());
    projView.multiplyMatrices(world.camera.projectionMatrix, world.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    screen.visible = seen(room.screenMesh, 0.3);
    if (house.winScreen) winpc.visible = seen(house.winScreen.mesh, 0.4);
    if (house.tv) house.tv.visible = !house.tv.on || seen(house.tags.tv[0], 1.2); // switching off still draws the black screen
    robot.faceVisible = seen(robot.head, 0.3);
    kuma.robot.visorVisible = seen(kuma.robot.head, 0.35);
    const now = clock.elapsedTime;

    if (flight) {
      flight.t += dt;
      const k = Math.min(1, flight.t / flight.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      world.camera.position.lerpVectors(flight.from, flight.toPos, e);
      world.controls.target.lerpVectors(flight.fromT, flight.toTarget, e);
      world.camera.lookAt(world.controls.target);
      if (k >= 1) { const r = flight.resolve; flight = null; r(); }
    } else if (!inMac) {
      if (followRobot) {
        const p = robot.root.position;
        const tgt = new THREE.Vector3(p.x, bv.hidden ? 0.85 : robot.head.getWorldPosition(headPos).y + 0.12, p.z);
        const delta = tgt.clone().sub(world.controls.target).multiplyScalar(1 - Math.exp(-dt * 3));
        world.controls.target.add(delta);
        world.camera.position.add(delta);
      }
      updateCameraKeys(dt, shiftHeld);
      world.controls.update();
      keepInRoom(world.camera.position, 0.18);
      keepInRoom(world.controls.target, 0.3, true);
    }

    updateDriveInput(shiftHeld);
    robot.brainActivity = Math.max(brain.typing ? 0.25 : brain.mode === 'broken' ? 0 : 0.08, robot.brainActivity - dt * 0.6);
    if (!bv.hidden && (vitalsAcc += dt) > 0.4) { vitalsAcc = 0; renderVitals(); }
    brain.update(dt);
    // stand on the ground (the garden is lower than the house), and open the front door for anyone passing
    robot.root.position.y = house.groundY(robot.root.position.x, robot.root.position.z);
    if (house.frontDoor && layout.house.outside) {
      const [dx, dz] = layout.house.outside.door;
      const near = [robot.root.position, kuma.mover.position].some((p) => Math.hypot(p.x - dx, p.z - dz) < 1.5);
      if (near) house.frontDoor.target = Math.min(house.frontDoor.target, -1.45);
      else if (house.frontDoor.auto) house.frontDoor.target = 0;
      house.frontDoor.auto = near;
    }
    damage.update(dt);
    winpc.update(dt);
    delivery.update(dt, now);
    kuma.update(dt, now);
    robot.update(dt, world.camera);
    agentParts.update();
    screen.update(dt);

    // ambient motion
    for (const p of [room.plantSmall, room.plantFloor]) {
      const s = p.userData.sway;
      p.userData.wiggle = Math.max(0, (p.userData.wiggle || 0) - dt);
      const wig = p.userData.wiggle;
      s.rotation.z = Math.sin(now * 0.9 + p.position.x) * 0.015 + Math.sin(now * 12) * 0.04 * wig;
      s.rotation.x = Math.sin(now * 0.7 + p.position.z) * 0.012;
    }
    const g = room.globe;
    g.userData.spin = Math.max(0, (g.userData.spin || 0) - dt * 1.2);
    g.rotation.y += (0.05 + g.userData.spin) * dt;
    room.chairSeat.rotation.y = brain.sitting ? Math.sin(now * 0.4) * 0.01 : 0.25 * Math.sin(now * 0.3);

    timeAcc += dt;
    if (timeAcc > 0.5) { timeAcc = 0; world.setTime(currentHours()); }
    house.update(dt, world.camera, world.controls.target, now);
    world.adapt(dt);

    // speech bubble follows the head
    robot.head.getWorldPosition(headPos).add(new THREE.Vector3(0, 0.48, 0));
    hud.placeBubble(headPos.clone().project(world.camera));
    kuma.robot.head.getWorldPosition(headPos).add(new THREE.Vector3(0, 0.36, 0));
    hud.placeBubble(headPos.clone().project(world.camera), true);
    hud.stats({ lines: screen.linesToday, commits: screen.commits, coffees: brain.stats.coffees, energy: robot.energy, steps: brain.stats.steps });

    const shakeOff = new THREE.Vector3();
    if (shake > 0.001 && !inMac) { shakeOff.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake); world.camera.position.add(shakeOff); shake *= Math.exp(-dt * 12); }
    if (frameNo % 2 === 1) world.renderer.shadowMap.needsUpdate = true; // odd frames, so the very first frame has a shadow map
    if (!inMac || flight) world.render();
    world.camera.position.sub(shakeOff);
    mac.tick(dt);
    win.tick(dt);
  });
}

// ---------------------------------------------------------------- HUD
function makeHud() {
  const bubble = $('#bubble');
  const kbubble = $('#kbubble');
  let kTimer = null;
  const tip = $('#tip');
  const toastEl = $('#toast');
  let bubbleTimer = null, toastTimer = null;
  return {
    say(text, seconds = 3) {
      bubble.textContent = text;
      bubble.classList.add('show');
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove('show'), seconds * 1000);
    },
    kumaSay(text, seconds = 3.5) {
      kbubble.textContent = text;
      kbubble.classList.add('show');
      clearTimeout(kTimer);
      kTimer = setTimeout(() => kbubble.classList.remove('show'), seconds * 1000);
    },
    activity(text) { $('#activity').textContent = text; },
    placeBubble(p, isKuma = false) {
      const behind = p.z > 1;
      const bubble = isKuma ? kbubble : $('#bubble');
      bubble.style.transform = `translate(${(p.x + 1) / 2 * innerWidth}px, ${(1 - p.y) / 2 * innerHeight}px) translate(-50%, -100%)`;
      bubble.style.visibility = behind ? 'hidden' : '';
    },
    tip(text, x, y) {
      if (!text) { tip.classList.remove('show'); return; }
      tip.textContent = text;
      tip.style.transform = `translate(${x + 14}px, ${y + 16}px)`;
      tip.classList.add('show');
    },
    toast(text) {
      toastEl.textContent = text;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
    },
    stats(s) {
      $('#st-lines').textContent = s.lines.toLocaleString();
      $('#st-commits').textContent = s.commits;
      $('#st-coffee').textContent = s.coffees;
      $('#energy i').style.width = `${Math.round(s.energy * 100)}%`;
      $('#energy').dataset.level = s.energy > 0.5 ? 'ok' : s.energy > 0.25 ? 'mid' : 'low';
    },
    setVisible(v) { document.body.classList.toggle('hud-hidden', !v); },
  };
}

boot().catch((err) => {
  console.error(err);
  loaderText.textContent = `Something went wrong while loading: ${err.message}`;
});
