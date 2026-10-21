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
  const nav = new NavGrid(layout, { extra: house.wallObstacles });

  const hud = makeHud();
  const memory = []; // what he remembers doing (shown in the brain view)
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
  const kuma = new Kuma(world.scene, layout, { say: hud.kumaSay });
  winpc.on((e, data) => {
    kuma.react(e, data);
    if (e === 'bsod' || e === 'popup') audio.winError();
  });
  kuma.onSlam = () => audio.thud();
  // punching him: parts come off, sparks fly
  let shake = 0;
  const damage = new Damage({
    scene: world.scene, robot, brain, audio, bounds: layout.house.bounds,
    hooks: {
      shake: (a) => { shake = Math.max(shake, a); },
      onHit: (n, integrity) => { remember(`🥊 Got punched (hit ${n}). Integrity ${Math.round(integrity * 100)}%.`); $('#integrity').hidden = false; $('#integrity b').style.width = `${Math.round(integrity * 100)}%`; recentPunches++; },
      onRepaired: () => { $('#integrity').hidden = true; },
      onBroken: () => { hud.toast('💥 Mr. Agent is broken — press Repair (U)'); kuma.say('WHAT DID YOU DO TO MR. AGENT?!'); kuma.setMood('shocked'); },
    },
  });
  let recentPunches = 0;
  setInterval(() => { recentPunches = Math.max(0, recentPunches - 1); }, 20000);

  // his mind: Qwen3-1.7B in the browser (WebLLM), with a rule-based fallback
  const mind = new AgentMind();
  window.__mr = { world, robot, brain, room, house, screen, THREE, kuma, winpc, damage, mind }; // handy for poking at things from devtools

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
    dance: () => { brain.queueActivity('dance'); if (!music.playing) music.play(); hud.toast('🎶 Dance break'); },
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
  const keymap = { m: 'mac', c: 'coffee', y: 'stretch', o: 'window', n: 'dance', h: 'wave', t: 'time', v: 'sound', r: 'reset', f: 'follow', g: 'tv', k: 'tinker', b: 'snack', z: 'sleep', x: 'walls', p: 'punch', u: 'repair', i: 'brain' };
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

  // ------------------------------------------------------------ WASD: walk him around (camera-relative, Shift to hurry)
  const held = new Set();
  let autoFollow = false;
  window.addEventListener('keydown', (e) => {
    if (inMac || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd'].includes(k)) return;
    e.preventDefault();
    held.add(k);
    audio.unlock();
    if (!brain.driving && !brain.broken) {
      if (brain.command({ type: 'drive' })) {
        brain.driving = true;
        if (!followRobot) { followRobot = true; autoFollow = true; $('#btn-follow').classList.add('on'); }
      }
    }
  });
  window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => held.clear());
  function updateDriveInput(shift) {
    const f = new THREE.Vector3().subVectors(world.controls.target, world.camera.position).setY(0).normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const v = new THREE.Vector3();
    if (held.has('w')) v.add(f);
    if (held.has('s')) v.sub(f);
    if (held.has('d')) v.add(r);
    if (held.has('a')) v.sub(r);
    brain.input.x = v.x; brain.input.z = v.z; brain.input.run = shift;
    if (autoFollow && !brain.driving) { autoFollow = false; followRobot = false; $('#btn-follow').classList.remove('on'); }
  }
  let shiftHeld = false;
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftHeld = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') shiftHeld = false; });

  // ------------------------------------------------------------ inside his brain
  const bv = $('#brainview');
  function remember(text) {
    if (memory[0]?.text === text) return;
    memory.unshift({ t: new Date(), text });
    memory.length = Math.min(memory.length, 40);
    if (!$('#brainview').hidden) renderMemory();
  }
  function renderMemory() {
    $('#bv-log').replaceChildren(...memory.map((m) => { const li = document.createElement('li'); const tm = document.createElement('time'); tm.textContent = m.t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); const sp = document.createElement('span'); sp.textContent = m.text; li.append(tm, sp); return li; }));
  }
  function renderVitals() {
    const row = (k, v, wide) => `<div${wide ? ' class="wide"' : ''}><span>${k}</span> <b>${v}</b></div>`;
    const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    $('#bv-vitals').innerHTML = row('Doing', esc(brain.activity), true)
      + row('Mode', { life: 'living his life', cmd: 'following orders', user: 'on break', broken: 'broken' }[brain.mode] || brain.mode)
      + row('Face', robot.face.expr)
      + row('Battery', `${Math.round(robot.energy * 100)}%`)
      + row('Integrity', `${Math.round(damage.integrity * 100)}%`)
      + row('Mind', mind.status === 'ready' ? 'AI online' : mind.status === 'loading' ? `waking ${Math.round(mind.progress * 100)}%` : 'basic mode')
      + row('Neural activity', `${Math.round(robot.brainActivity * 100)}%`);
  }
  let vitalsAcc = 0;
  function toggleBrain(open = bv.hidden) {
    bv.hidden = !open;
    $('#btn-brain').classList.toggle('on', open);
    robot.setXray(open);
    if (!open) return;
    renderVitals();
    renderMemory();
    if (inMac || flight) return;
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
    if (who !== 'agent') return null;
    const el = $('#bv-thought');
    el.classList.add('live');
    el.textContent = '';
    $('#bv-decision').textContent = '';
    robot.brainActivity = 1;
    return (u) => {
      robot.brainActivity = 1;
      el.textContent = u.thought || '…';
      $('#bv-context').textContent = u.context;
      $('#bv-json').textContent = u.raw;
    };
  }
  function showDecision(d) {
    const el = $('#bv-thought');
    el.classList.remove('live');
    el.textContent = d.thought || (d.source === 'rules' ? 'Basic mode: I spotted a keyword and went with my gut.' : '…');
    const chip = (t) => { const i = document.createElement('i'); i.textContent = t; return i; };
    $('#bv-decision').replaceChildren(chip(`action: ${d.action.replace(/_/g, ' ')}`), ...(d.place && d.place !== 'none' ? [chip(`→ ${d.place.replace(/_/g, ' ')}`)] : []), chip(`mood: ${d.mood || 'normal'}`), chip(d.source === 'qwen' ? 'MrAgent AI' : 'quick reply'));
    if (d.raw) $('#bv-json').textContent = d.raw;
    remember(`💭 ${d.thought || d.reply}`);
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
    chatInput.focus();
  }
  document.querySelectorAll('#chat-tabs button').forEach((b) => b.addEventListener('click', () => setTalkTo(b.dataset.who)));
  function toggleChat(open = chatEl.hidden, who) {
    chatEl.hidden = !open;
    $('#btn-chat').classList.toggle('on', open);
    if (open) { setTalkTo(who || talkTo); setTimeout(() => chatInput.focus(), 30); }
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
    if (acting) {
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
    }, 'kuma');
    pending.remove();
    const acting = d.action !== 'chat';
    addMsg('bot', d.reply, `${d.source === 'qwen' ? 'Kuma AI' : 'quick reply'}${acting ? ` · ${d.action.replace(/_/g, ' ')}` : ''}`, log);
    hud.kumaSay(d.reply, Math.min(7, 2 + d.reply.length / 16));
    kuma.act(d.action, d.mood);
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
  // fetch the model in the background shortly after start (it's cached by the browser after the first time)
  try { if (localStorage.getItem('mragent.qwen') !== 'off') setTimeout(() => mind.load(), 4000); } catch { setTimeout(() => mind.load(), 4000); }

  // jump the camera to a room (or the whole house)
  const goRoom = (id) => {
    if (inMac) return;
    followRobot = false;
    $('#btn-follow').classList.remove('on');
    document.querySelectorAll('#rooms button').forEach((b) => b.classList.toggle('on', b.dataset.room === id));
    if (id === 'house') { fly(world.overview.pos.clone(), world.overview.target.clone(), 1.4); return; }
    if (id === 'office') { fly(world.home.pos.clone(), world.home.target.clone(), 1.2); return; }
    const r = house.rooms.find((x) => x.id === id);
    const [x0, z0, x1, z1] = r.rect;
    const c = new THREE.Vector3((x0 + x1) / 2, 0.7, (z0 + z1) / 2);
    const size = Math.max(x1 - x0, z1 - z0);
    const pos = c.clone().add(new THREE.Vector3(size * 0.32, size * 0.75 + 1.8, -(size * 0.62 + 1.6)));
    fly(pos, c, 1.2);
  };
  const roomsBar = $('#rooms');
  [['house', '🏠 House'], ...house.rooms.map((r) => [r.id, r.name])].forEach(([id, label], i) => {
    const b = document.createElement('button');
    b.dataset.room = id;
    b.textContent = label;
    b.title = `${label} (${i})`;
    b.addEventListener('click', () => { audio.unlock(); goRoom(id); b.blur(); });
    roomsBar.append(b);
  });
  window.addEventListener('keydown', (e) => {
    if (inMac || typing(e) || e.metaKey || e.ctrlKey || e.altKey || !/^[0-7]$/.test(e.key)) return;
    goRoom(e.key === '0' ? 'house' : house.rooms[+e.key - 1].id);
  });
  window.addEventListener('keydown', (e) => {
    if (inMac || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/' || e.key === 'Enter') { e.preventDefault(); toggleChat(true); return; }
    const a = keymap[e.key.toLowerCase()];
    if (a) { audio.unlock(); actions[a](); }
  });
  let followRobot = false;

  // Keep the camera above the ground and near the house; walls in the way are cut away instead.
  const [hx0, hz0, hx1, hz1] = layout.house.bounds;
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

  world.renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
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
      world.controls.update();
      keepInRoom(world.camera.position, 0.18);
      keepInRoom(world.controls.target, 0.3, true);
    }

    updateDriveInput(shiftHeld);
    robot.brainActivity = Math.max(brain.typing ? 0.25 : brain.mode === 'broken' ? 0 : 0.08, robot.brainActivity - dt * 0.6);
    if (!bv.hidden && (vitalsAcc += dt) > 0.4) { vitalsAcc = 0; renderVitals(); }
    brain.update(dt);
    damage.update(dt);
    winpc.update(dt);
    kuma.update(dt, now);
    robot.update(dt, world.camera);
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
  let bubbleT = 0, bubbleTimer = null, toastTimer = null;
  return {
    say(text, seconds = 3) {
      bubble.textContent = text;
      bubble.classList.add('show');
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove('show'), seconds * 1000);
      bubbleT = seconds;
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
