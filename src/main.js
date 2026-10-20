import * as THREE from 'three';
import './style.css';
import { loadModels, makeMaterials } from './scene/assets.js';
import { World } from './scene/world.js';
import { buildRoom } from './scene/props.js';
import { Robot } from './scene/robot.js';
import { NavGrid } from './scene/nav.js';
import { Brain } from './scene/brain.js';
import { LaptopScreen } from './scene/screen.js';
import { audio, music } from './audio.js';
import { MacOS } from './mac/os.js';

const $ = (s) => document.querySelector(s);
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
  world.attachRoom(room);
  const robot = new Robot(geos, layout, M);
  world.scene.add(robot.root);
  const nav = new NavGrid(layout);

  const hud = makeHud();
  const brain = new Brain({
    robot, room, nav, screen, layout, world,
    hooks: { say: hud.say, activity: hud.activity },
  });
  hud.activity(brain.activity);
  window.__mr = { world, robot, brain, room, screen, THREE }; // handy for poking at things from devtools

  const mac = new MacOS($('#mac'), {
    robot, brain, screen, world, music, audio, room, layout,
    onExit: () => leaveMac(),
  });
  window.__mr.mac = mac;

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
  let hover = null;
  let downAt = null;
  const pickAt = (e) => {
    const rect = world.renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, world.camera);
    const hits = ray.intersectObjects([...laptopMeshes, ...robotMeshes], false);
    if (!hits.length) return null;
    return laptopMeshes.includes(hits[0].object) ? 'laptop' : 'robot';
  };
  const canvas = world.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    if (inMac) return;
    hover = pickAt(e);
    canvas.style.cursor = hover ? 'pointer' : '';
    hud.tip(hover === 'laptop' ? 'Use Mr. Agent’s Mac' : hover === 'robot' ? 'Say hi' : null, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; audio.unlock(); });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const what = pickAt(e);
    if (what === 'laptop') enterMac();
    else if (what === 'robot') brain.wave();
  });

  // ------------------------------------------------------------ camera flights & the Mac
  let inMac = false;
  let flight = null;
  const savedCam = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const fly = (toPos, toTarget, dur = 1.4) => new Promise((resolve) => {
    flight = { from: world.camera.position.clone(), fromT: world.controls.target.clone(), toPos, toTarget, t: 0, dur, resolve };
  });

  function screenRect() {
    const m = room.screenMesh;
    const corners = [[-0.169, -0.108], [0.169, -0.108], [0.169, 0.108], [-0.169, 0.108]].map(([x, y]) => {
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

  async function leaveMac() {
    brain.releaseMac();
    hud.setVisible(true);
    await fly(savedCam.pos.clone(), savedCam.target.clone(), 1.3);
    world.controls.enabled = true;
    inMac = false;
  }

  // ------------------------------------------------------------ HUD buttons & keys
  const actions = {
    mac: () => enterMac(),
    coffee: () => { brain.queueActivity('coffee'); hud.toast('☕ Coffee run queued'); },
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
  const keymap = { m: 'mac', c: 'coffee', s: 'stretch', w: 'window', d: 'dance', h: 'wave', t: 'time', v: 'sound', r: 'reset', f: 'follow' };
  window.addEventListener('keydown', (e) => {
    if (inMac || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = keymap[e.key.toLowerCase()];
    if (a) { audio.unlock(); actions[a](); }
  });
  let followRobot = false;

  // The front of the room is open; everywhere else the camera stays inside the walls.
  const R = layout.room;
  function keepInRoom(v, margin) {
    v.y = THREE.MathUtils.clamp(v.y, 0.15, 7);
    if (v.z > -1.75) {
      v.x = THREE.MathUtils.clamp(v.x, R.left + margin, R.right - margin);
      v.z = Math.min(v.z, R.back - margin);
    }
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
        const tgt = new THREE.Vector3(p.x, 0.85, p.z);
        const delta = tgt.clone().sub(world.controls.target).multiplyScalar(1 - Math.exp(-dt * 3));
        world.controls.target.add(delta);
        world.camera.position.add(delta);
      }
      world.controls.update();
      keepInRoom(world.camera.position, 0.18);
      keepInRoom(world.controls.target, 0.3);
    }

    brain.update(dt);
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
    world.updateWalls();
    world.adapt(dt);

    // speech bubble follows the head
    robot.head.getWorldPosition(headPos).add(new THREE.Vector3(0, 0.48, 0));
    hud.placeBubble(headPos.clone().project(world.camera));
    hud.stats({ lines: screen.linesToday, commits: screen.commits, coffees: brain.stats.coffees, energy: robot.energy, steps: brain.stats.steps });

    if (!inMac || flight) world.render();
    mac.tick(dt);
  });
}

// ---------------------------------------------------------------- HUD
function makeHud() {
  const bubble = $('#bubble');
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
    activity(text) { $('#activity').textContent = text; },
    placeBubble(p) {
      const behind = p.z > 1;
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
