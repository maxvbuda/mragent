import * as THREE from 'three';
import { damp } from './robot.js';
import { audio, music } from '../audio.js';

const INTERRUPT = Symbol('interrupt');
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const headingTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

const ARM_POSES = {
  rest:      { x: 0.05, y: 0, z: 0.12, elbow: 0.2, wx: 0, wy: Math.PI / 2, wz: 0 },
  thighs:    { x: 0.55, y: 0.1, z: 0.12, elbow: 0.75, wx: -0.4, wy: Math.PI / 2, wz: 0 },
  overhead:  { x: Math.PI - 0.15, y: 0, z: 0.25, elbow: 0.25, wx: 0, wy: Math.PI / 2, wz: 0 },
  behind:    { x: -0.42, y: 1.35, z: 0.1, elbow: 1.45, wx: 0, wy: 0, wz: 0 },
  hips:      { x: -0.15, y: 0.9, z: 0.55, elbow: 1.7, wx: 0, wy: 0.3, wz: 0.4 },
  chin:      { x: 1.05, y: -0.55, z: 0.1, elbow: 2.25, wx: 0.2, wy: Math.PI / 2, wz: 0 },
  cheer:     { x: 2.7, y: 0, z: 0.35, elbow: 0.9, wx: 0, wy: Math.PI / 2, wz: 0 },
  wave:      { x: 0.3, y: 0, z: 2.55, elbow: 0.6, wx: 0, wy: 0, wz: 0 },
  shrug:     { x: 0.25, y: 0.4, z: 0.5, elbow: 1.4, wx: 0, wy: 0, wz: 0 },
};

export class Brain {
  constructor({ robot, room, nav, screen, layout, world, hooks }) {
    Object.assign(this, { robot, room, nav, screen, layout, world, hooks });
    this.tasks = new Set();
    this.pending = null; // 'user' | activity name
    this.mode = 'life';
    this.sitting = true;
    this.chairOut = false;
    this.holdingMug = null; // arm holding it
    this.fill = 0.75;
    this.activity = 'Coding';
    this.typing = null;
    this.waveT = 0;
    this.dancing = false;
    this.armTargets = robot.arms.map(() => ({ ...ARM_POSES.thighs }));
    this.hand = robot.arms.map(() => ({ mode: 'free' }));
    this.queue = [];
    this.userOnMac = false;
    this.typeSpeed = 1;
    this.autoBreaks = true;
    this.stats = { coffees: 0, steps: 0 };
    this.spots = this.makeSpots();
    robot.onFootstep = () => { audio.step(); this.stats.steps++; };
    screen.on('testsPassed', () => this.celebrate());
    this.seatAtDesk();
    this.life();
  }

  makeSpots() {
    const L = this.layout;
    const s = {};
    const look = (name, target) => {
      const p = V(...L.spots[name].pos);
      s[name] = { pos: p, heading: headingTo(p, target), target };
    };
    look('coffee', V(...L.place.coffeeMachine.pos));
    look('window', V(L.place.window.pos[0], 1.5, L.room.back + 2));
    look('bookshelf', V(L.place.bookshelf.pos[0], 1.1, L.place.bookshelf.pos[2]));
    look('plant', V(...L.place.plantFloor.pos));
    look('stretch', V(0, 1, -4));
    look('lounge', V(...L.place.laptop.pos));
    return s;
  }

  // ------------------------------------------------------------ scheduler
  frame(fn, interruptible = false) {
    return new Promise((resolve, reject) => {
      this.tasks.add({ fn, resolve, reject, interruptible });
    });
  }
  wait(s, interruptible = false) { return this.frame((dt) => (s -= dt) <= 0, interruptible); }
  tween(dur, fn, interruptible = false, e = ease) {
    let t = 0;
    return this.frame((dt) => { t += dt; const k = Math.min(1, t / dur); fn(e(k), k); return k >= 1; }, interruptible);
  }

  update(dt) {
    for (const task of [...this.tasks]) {
      if (task.interruptible && this.pending) { this.tasks.delete(task); task.reject(INTERRUPT); continue; }
      let done = false;
      try { done = task.fn(dt); } catch (e) { this.tasks.delete(task); task.reject(e); continue; }
      if (done) { this.tasks.delete(task); task.resolve(); }
    }
    this.updateArms(dt);
    this.updateOverlays(dt);
    this.room.steam.update(dt, this.fill > 0.05 ? 1 : 0);
    if (this.typing) this.updateTyping(dt);
  }

  // ------------------------------------------------------------ public API (HUD / Mac)
  requestMac() {
    if (this.mode === 'user') return;
    this.pending = 'user';
    this.say(pick(['Oh, you need my Mac? Go ahead!', 'Sure, it’s all yours.', 'Take the wheel. I’ll grab a break.']), 3);
  }
  releaseMac() {
    this.userOnMac = false;
  }
  queueActivity(name) {
    if (this.mode === 'user') return;
    this.queue.push(name);
    if (this.typing) this.pending = name;
  }
  wave() {
    this.waveT = 2.6;
    this.robot.face.set('happy', 2.6);
    this.say(pick(['Hi there! 👋', 'Hello, human!', 'Beep boop! (that means hi)', 'Oh hey! Didn’t see you there.']), 2.6);
    audio.happy();
  }
  say(text, seconds = 3) { this.hooks.say?.(text, seconds); }
  setActivity(text) { this.activity = text; this.hooks.activity?.(text); }

  // ------------------------------------------------------------ main loop
  async life() {
    for (;;) {
      try {
        if (this.pending === 'user') { await this.userMode(); continue; }
        const next = this.queue.shift() || (this.pending && this.pending !== 'user' ? this.pending : null);
        this.pending = null;
        if (next) { await this.doActivity(next); continue; }
        if (music.playing && Math.random() < 0.6) { await this.danceBreak(); continue; }
        await this.work(rand(28, 50));
        if (this.pending) continue;
        if (this.autoBreaks === false) continue;
        const wantsCoffee = this.fill < 0.2 || this.robot.energy < 0.35;
        const choice = wantsCoffee ? 'coffee' : pick(['stretch', 'window', 'bookshelf', 'plant', 'coffee', 'window', 'stretch']);
        await this.doActivity(choice);
      } catch (e) {
        if (e !== INTERRUPT) { console.error(e); await this.wait(1); }
      }
    }
  }

  async doActivity(name) {
    const map = { coffee: () => this.coffeeRun(), stretch: () => this.stretch(), window: () => this.visit('window'),
      bookshelf: () => this.visit('bookshelf'), plant: () => this.visit('plant'), dance: () => this.danceBreak() };
    if (map[name]) await map[name]();
  }

  // ------------------------------------------------------------ poses
  seatAtDesk() {
    const r = this.robot, st = r.state;
    const ch = this.room.chairHome;
    this.room.chair.position.copy(ch);
    r.root.position.set(ch.x, 0, ch.z - 0.06);
    r.heading = 0;
    r.prevPos.copy(r.root.position);
    st.waistY = this.layout.robot.sitWaist;
    st.pelvisZ = 0;
    st.lean = 0.14;
    st.feet[0].set(0.12, 0, -0.29);
    st.feet[1].set(-0.12, 0, -0.29);
    this.sitting = true;
    this.chairOut = false;
    this.nav.setDynamic([]);
  }

  setArms(pose, which = [0, 1]) {
    for (const i of which) {
      this.armTargets[i] = { ...ARM_POSES[pose] };
      if (this.hand[i].mode !== 'hold') this.hand[i] = { mode: 'free' };
    }
  }

  updateArms(dt) {
    const r = this.robot;
    r.arms.forEach((arm, i) => {
      const tgt = this.armTargets[i];
      for (const k of Object.keys(tgt)) arm.fk[k] = damp(arm.fk[k], tgt[k], 6, dt);
      const h = this.hand[i];
      if (h.mode === 'free') { arm.ik = null; return; }
      if (!arm.ik) arm.ik = { target: V(), pole: V(), quat: new THREE.Quaternion() };
      arm.ikWTarget = 1;
      arm.ikRate = h.rate || 7;
      const side = arm.s;
      const fwd = r.worldForward(V());
      const right = V(Math.cos(r.heading), 0, -Math.sin(r.heading));
      const sh = arm.shoulder.getWorldPosition(V());
      arm.ik.pole.copy(sh).addScaledVector(right, side * 0.45).add(V(0, -0.35, 0)).addScaledVector(fwd, -0.35);
      if (h.mode === 'target') {
        arm.ik.target.lerp(h.target, 1 - Math.exp(-dt * (h.speed || 12)));
        arm.ik.quat.slerp(h.quat, 1 - Math.exp(-dt * 10));
      } else if (h.mode === 'hold') { // carrying something in front of the chest
        const t = r.torso.localToWorld(V(side * 0.16, 0.2, -0.36));
        arm.ik.target.lerp(t, 1 - Math.exp(-dt * 8));
        arm.ik.quat.slerp(this.holdQuat(arm), 1 - Math.exp(-dt * 8));
      }
    });
  }

  holdQuat(arm) {
    const r = this.robot;
    const fwd = r.worldForward(V());
    const right = V(Math.cos(r.heading), 0, -Math.sin(r.heading));
    return r.handQuat(fwd, right.multiplyScalar(-arm.s));
  }

  updateOverlays(dt) {
    const r = this.robot;
    if (this.waveT > 0) {
      this.waveT -= dt;
      const arm = r.arms[1];
      const busy = this.hand[1].mode !== 'free';
      if (!busy) {
        arm.fk.x = 0.3; arm.fk.z = 2.5; arm.fk.elbow = 0.5 + Math.sin(this.waveT * 14) * 0.35; arm.fk.wz = Math.sin(this.waveT * 14) * 0.3;
        if (this.waveT <= 0) this.armTargets[1] = { ...this.armTargets[1] };
      }
      r.lookAt(this.world.camera.position, 1);
      if (this.waveT <= 0) r.lookAt(null);
    }
  }

  // ------------------------------------------------------------ typing
  startTyping() {
    const r = this.robot;
    this.typing = { next: 0.4, pause: 0, burst: rand(8, 30), hands: [{ key: 49, t: 0 }, { key: 46, t: 0 }], press: [0, 0] };
    r.arms.forEach((arm, i) => {
      this.hand[i] = { mode: 'target', target: V(), quat: new THREE.Quaternion(), speed: 18, rate: 5 };
      arm.fingers.forEach((f) => { f.curl = 0.45; });
      arm.thumb.curl = 0.2;
    });
    this.updateTyping(0);
    r.arms.forEach((arm, i) => { if (arm.ik) arm.ik.target.copy(this.hand[i].target); });
    r.face.set('focused');
    r.setStatus(0x49e3ff);
  }

  stopTyping() {
    this.typing = null;
    this.robot.arms.forEach((arm) => arm.fingers.forEach((f) => { f.curl = 0.25; }));
  }

  keyWristTarget(keyIdx, arm, out, lift = 0) {
    const r = this.robot;
    const kp = this.room.keyWorld(keyIdx);
    const fwd = r.worldForward(V());
    out.copy(kp).addScaledVector(fwd, -0.135).add(V(0, 0.062 + lift, 0));
    const right = V(Math.cos(r.heading), 0, -Math.sin(r.heading));
    out.addScaledVector(right, arm.s * 0.012);
    return out;
  }

  updateTyping(dt) {
    const ty = this.typing, r = this.robot, scr = this.screen;
    const fwd = r.worldForward(V());
    const down = fwd.clone().multiplyScalar(Math.cos(0.42)).add(V(0, -Math.sin(0.42), 0));
    r.arms.forEach((arm, i) => {
      const hs = ty.hands[i];
      const h = this.hand[i];
      if (h.mode !== 'target') return;
      ty.press[i] = Math.max(0, ty.press[i] - dt * 10);
      this.keyWristTarget(hs.key, arm, h.target, 0.012 - ty.press[i] * 0.012 + (scr.busy ? 0.03 : 0));
      const right = V(Math.cos(r.heading), 0, -Math.sin(r.heading));
      const yawIn = fwd.clone().addScaledVector(right, -arm.s * 0.25).normalize();
      const dir = yawIn.multiplyScalar(Math.cos(0.42)).add(V(0, -Math.sin(0.42), 0));
      r.handQuat(dir, V(0, -1, 0), h.quat);
    });
    if (scr.busy) { // tests running: sit back a little and watch
      r.state.lean = damp(r.state.lean, 0.02, 3, dt);
      r.face.set(scr.phase === 'testing' ? 'loading' : 'happy');
      return;
    }
    r.state.lean = damp(r.state.lean, 0.16, 3, dt);
    if (ty.pause > 0) {
      ty.pause -= dt;
      if (ty.pause <= 0) r.face.set('focused');
      return;
    }
    ty.next -= dt;
    if (ty.next > 0) return;
    const kind = scr.keystroke();
    if (!kind) { ty.next = 0.2; return; }
    const keys = this.layout.laptop.keys;
    let keyIdx;
    if (kind === 'space') keyIdx = 59 + 4 + 2; // spacebar (bottom row, 5th key)
    else if (kind === 'enter') keyIdx = 54;
    else if (kind === 'backspace') keyIdx = 27;
    else keyIdx = 15 + Math.floor(Math.random() * 50);
    keyIdx = Math.min(keys.length - 1, keyIdx);
    const hi = kind === 'space' ? (Math.random() < 0.5 ? 0 : 1) : keys[keyIdx][0] > 0 ? 0 : 1; // arms[0] = right
    const arm = r.arms[hi];
    if (kind !== 'space') ty.hands[hi].key = keyIdx;
    ty.press[hi] = 1;
    if (kind === 'space') arm.thumb.curl = 0.9;
    else arm.fingers[Math.floor(Math.random() * 4)].press = 1;
    setTimeout(() => { arm.thumb.curl = 0.2; }, 90);
    audio.key(kind, hi === 0 ? 0.25 : -0.25);
    ty.next = (kind === 'enter' ? rand(0.25, 0.5) : rand(0.055, 0.15)) / (this.typeSpeed || 1);
    if (--ty.burst <= 0) {
      ty.burst = rand(10, 45);
      ty.pause = rand(0.6, 2.4);
      r.face.set(Math.random() < 0.5 ? 'thinking' : 'focused');
      r.state.headYaw = rand(-0.15, 0.15);
    }
  }

  async work(seconds) {
    this.setActivity(`Coding ${this.screen.snip.path.split('/').pop()}`);
    const r = this.robot;
    r.state.headPitch = -0.32;
    r.state.headYaw = 0;
    this.startTyping();
    let t = 0, nextSip = rand(14, 26), nextGlance = rand(6, 12);
    try {
      await this.frame((dt) => {
        t += dt;
        r.energy = Math.max(0.05, r.energy - dt * 0.0035);
        if (t > nextGlance && !this.screen.busy) { // glance at the camera now and then
          nextGlance = t + rand(10, 22);
          r.lookAt(this.world.camera.position, 0.85);
          setTimeout(() => { if (this.typing) r.lookAt(null); }, 1200);
        }
        if (t > nextSip && this.fill > 0.12 && !this.screen.busy) { nextSip = Infinity; return true; }
        return t >= seconds;
      }, true);
      if (nextSip === Infinity) {
        this.stopTyping();
        await this.sip();
        return this.work(Math.max(4, seconds - t));
      }
    } finally {
      this.stopTyping();
      if (this.sitting) this.setArms('thighs');
    }
  }

  celebrate() {
    const r = this.robot;
    r.face.set('happy', 2.2);
    audio.happy();
    if (Math.random() < 0.45 && this.typing) {
      const arm = r.arms[Math.random() < 0.5 ? 0 : 1];
      const i = r.arms.indexOf(arm);
      const prev = this.hand[i];
      this.hand[i] = { mode: 'free' };
      this.armTargets[i] = { ...ARM_POSES.cheer };
      this.say(pick(['Tests pass! ✅', 'Ship it! 🚀', 'Green across the board.', 'Another one! 🎉']), 2);
      setTimeout(() => { this.armTargets[i] = { ...ARM_POSES.thighs }; if (this.typing) this.hand[i] = prev; }, 1100);
    }
  }

  // ------------------------------------------------------------ mug handling
  mugHandle() { return this.room.mug.localToWorld(V(0.066, 0.05, 0)); }

  async reachTo(armIdx, target, quat, dur = 0.7) {
    const h = (this.hand[armIdx] = { mode: 'target', target: target.clone(), quat: quat.clone(), speed: 9, rate: 6 });
    await this.wait(dur);
    return h;
  }

  wristForHandle(arm, handle) {
    const r = this.robot;
    const fwd = r.worldForward(V());
    const right = V(Math.cos(r.heading), 0, -Math.sin(r.heading));
    const q = this.holdQuat(arm);
    // the palm faces inwards; the handle sits about 9 cm from the wrist along the fingers, a little to the palm side
    const t = handle.clone().addScaledVector(fwd, -0.085).addScaledVector(right, arm.s * 0.03).add(V(0, 0.01, 0));
    return { t, q };
  }

  async grabMug(armIdx = 0) {
    const r = this.robot, arm = r.arms[armIdx];
    const { t, q } = this.wristForHandle(arm, this.mugHandle());
    arm.fingers.forEach((f) => { f.curl = 0.05; });
    await this.reachTo(armIdx, t.clone().add(V(0, 0.05, 0)), q, 0.45);
    await this.reachTo(armIdx, t, q, 0.4);
    arm.fingers.forEach((f) => { f.curl = 0.95; });
    arm.thumb.curl = 0.8;
    await this.wait(0.15);
    r.root.updateMatrixWorld(true);
    arm.wrist.attach(this.room.mug);
    this.holdingMug = armIdx;
  }

  async placeMug(pos, quat = null) {
    const r = this.robot, i = this.holdingMug, arm = r.arms[i];
    const mug = this.room.mug;
    r.root.updateMatrixWorld(true);
    const mugW = mug.getWorldPosition(V());
    const wristW = arm.wrist.getWorldPosition(V());
    const off = wristW.sub(mugW);
    const q = this.holdQuat(arm);
    await this.reachTo(i, pos.clone().add(off).add(V(0, 0.05, 0)), q, 0.55);
    await this.reachTo(i, pos.clone().add(off).add(V(0, 0.004, 0)), q, 0.4);
    this.room.room.attach(mug);
    const startP = mug.position.clone(), startQ = mug.quaternion.clone();
    const endQ = quat || new THREE.Quaternion().setFromEuler(new THREE.Euler(0, mug.rotation.y, 0));
    arm.fingers.forEach((f) => { f.curl = 0.1; });
    arm.thumb.curl = 0.2;
    this.holdingMug = null;
    await this.tween(0.15, (k) => { mug.position.lerpVectors(startP, pos, k); mug.quaternion.slerpQuaternions(startQ, endQ, k); });
    const back = this.hand[i].target.clone().add(V(0, 0.08, 0));
    await this.reachTo(i, back, q, 0.35);
  }

  async drink() {
    const r = this.robot, i = this.holdingMug, arm = r.arms[i];
    const t = r.torso.localToWorld(V(-arm.s * 0.05, 0.6, -0.34)); // mug ends up in front of the visor
    const q = this.holdQuat(arm).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -arm.s * 0.5)));
    r.state.headPitch = 0.05;
    await this.reachTo(i, t, q, 0.7);
    r.face.set('happy', 1.6);
    audio.sip();
    await this.wait(1.1);
    this.fill = Math.max(0, this.fill - 0.14);
    this.room.setFill(this.fill);
    r.energy = Math.min(1, r.energy + 0.08);
    this.hand[i] = { mode: 'hold', rate: 6 };
  }

  async sip() {
    this.setActivity('Sipping coffee');
    const r = this.robot;
    r.state.lean = 0.05;
    await this.grabMug(0);
    this.hand[0] = { mode: 'hold', rate: 6 };
    await this.wait(0.4);
    await this.drink();
    await this.wait(0.5);
    if (Math.random() < 0.3) this.say(pick(['Ahh. Fuel.', 'Mmm, 9 bar.', 'Is it weird that I can’t taste this?', 'Coffee: compiled.']), 2);
    await this.placeMug(this.room.mugHome.pos, this.room.mugHome.quat);
    this.hand[0] = { mode: 'free' };
    r.state.headPitch = -0.32;
  }

  // ------------------------------------------------------------ sitting & standing
  async standUp() {
    if (!this.sitting) return;
    const r = this.robot, st = r.state;
    const chair = this.room.chair, home = this.room.chairHome;
    if (this.hand[0].mode !== 'hold') this.setArms('thighs', [0]);
    if (this.hand[1].mode !== 'hold') this.setArms('thighs', [1]);
    audio.servo(0.6, 0.8);
    const r0 = r.root.position.clone();
    await this.tween(0.8, (k) => {
      chair.position.z = home.z + 0.34 * k;
      r.root.position.z = r0.z + 0.34 * k;
    });
    this.chairOut = true;
    audio.servo(1.1, 1.1);
    const w0 = st.waistY, w1 = this.layout.robot.standWaist - 0.012;
    await this.tween(1.25, (k, raw) => {
      st.waistY = THREE.MathUtils.lerp(w0, w1, k);
      st.pelvisZ = -0.27 * Math.min(1, raw * 1.6);
      st.lean = 0.14 + Math.sin(raw * Math.PI) * 0.42 - raw * 0.12;
      st.feet[0].z = st.feet[1].z = -0.29 + 0.02 * k;
    });
    // re-centre the root under the hips
    r.root.position.addScaledVector(r.worldForward(V()), 0.27);
    r.prevPos.copy(r.root.position);
    st.pelvisZ = 0;
    st.feet[0].set(0.11, 0, 0);
    st.feet[1].set(-0.11, 0, 0);
    st.lean = 0.02;
    if (this.hand[0].mode !== 'hold') this.setArms('rest', [0]);
    if (this.hand[1].mode !== 'hold') this.setArms('rest', [1]);
    this.sitting = false;
    const c = chair.position;
    this.nav.setDynamic([[c.x - 0.3, c.z - 0.25, c.x + 0.3, c.z + 0.32]]);
  }

  async sitDown() {
    const r = this.robot, st = r.state;
    const chair = this.room.chair, home = this.room.chairHome;
    // stand right in front of the pulled-out chair, facing the desk
    const stand = V(chair.position.x, 0, chair.position.z - 0.06 - 0.27);
    await this.walkPath([stand], { finalHeading: 0, sidestep: true });
    if (this.hand[0].mode !== 'hold') this.setArms('thighs', [0]);
    if (this.hand[1].mode !== 'hold') this.setArms('thighs', [1]);
    r.root.position.addScaledVector(r.worldForward(V()), -0.27);
    r.prevPos.copy(r.root.position);
    st.pelvisZ = -0.27;
    st.feet[0].set(0.11, 0, -0.27);
    st.feet[1].set(-0.11, 0, -0.27);
    audio.servo(1.1, 0.9);
    const w0 = st.waistY, w1 = this.layout.robot.sitWaist;
    await this.tween(1.3, (k, raw) => {
      st.waistY = THREE.MathUtils.lerp(w0, w1, k);
      st.pelvisZ = -0.27 * (1 - Math.min(1, raw * 1.3));
      st.lean = 0.02 + Math.sin(raw * Math.PI) * 0.4 + raw * 0.12;
      st.feet[0].x = 0.11 + 0.01 * k; st.feet[1].x = -0.11 - 0.01 * k;
      st.feet[0].z = st.feet[1].z = -0.27 - 0.02 * k;
    });
    this.sitting = true;
    audio.servo(0.6, 0.7);
    const r0 = r.root.position.clone(), c0 = chair.position.clone();
    await this.tween(0.8, (k) => {
      chair.position.lerpVectors(c0, home, k);
      r.root.position.set(THREE.MathUtils.lerp(r0.x, home.x, k), 0, THREE.MathUtils.lerp(r0.z, home.z - 0.06, k));
    });
    r.heading = 0;
    this.chairOut = false;
    this.nav.setDynamic([]);
  }

  // ------------------------------------------------------------ walking
  /** Walk through world points. sidestep: keep the current heading (shuffle sideways). */
  async walkPath(points, { finalHeading = null, sidestep = false, speed = 0.55, interruptible = false } = {}) {
    const r = this.robot;
    for (const p of points) {
      const target = V(p.x, 0, p.z);
      const dist0 = target.distanceTo(r.root.position);
      if (dist0 < 0.01) continue;
      const want = headingTo(r.root.position, target);
      if (!sidestep) await this.turnTo(want, interruptible);
      await this.frame((dt) => {
        const pos = r.root.position;
        const to = target.clone().sub(pos);
        const d = to.length();
        if (d < 0.02) { pos.copy(target); return true; }
        if (!sidestep) r.heading += wrap(headingTo(pos, target) - r.heading) * (1 - Math.exp(-dt * 6));
        const sp = sidestep ? Math.min(speed, 0.32) : speed;
        const step = Math.min(d, sp * dt * Math.min(1, 0.35 + d * 2));
        pos.addScaledVector(to.normalize(), step);
        return false;
      }, interruptible);
    }
    if (finalHeading !== null) await this.turnTo(finalHeading, interruptible);
  }

  async turnTo(h, interruptible = false) {
    const r = this.robot;
    await this.frame((dt) => {
      const d = wrap(h - r.heading);
      if (Math.abs(d) < 0.02) { r.heading = h; return true; }
      r.heading += Math.sign(d) * Math.min(Math.abs(d), dt * 2.4);
      return false;
    }, interruptible);
  }

  async walkTo(spot, opts = {}) {
    const r = this.robot;
    const path = this.nav.find(r.root.position.clone(), spot.pos);
    await this.walkPath(path.slice(1), { ...opts, finalHeading: spot.heading });
  }

  /** Stand up and step out to the side of the desk. */
  async leaveDesk(towardX = 1) {
    await this.standUp();
    const side = towardX >= 0 ? 1 : -1;
    const r = this.robot;
    await this.walkPath([V(side * 0.72, 0, r.root.position.z + 0.02)], { sidestep: true });
  }

  async returnToDesk() {
    const r = this.robot;
    const side = r.root.position.x >= 0 ? 1 : -1;
    const approach = { pos: V(side * 0.72, 0, this.room.chair.position.z - 0.33), heading: 0 };
    this.setActivity('Heading back to the desk');
    await this.walkTo(approach);
    await this.sitDown();
  }

  // ------------------------------------------------------------ activities
  async coffeeRun() {
    const r = this.robot;
    this.setActivity('Coffee run ☕');
    if (this.holdingMug === null) await this.grabMug(0);
    this.hand[0] = { mode: 'hold', rate: 6 };
    this.say(pick(['Refill time.', 'Running low on coffee… and battery.', 'BRB, espresso.']), 2.2);
    r.face.set('normal');
    await this.leaveDesk(1);
    await this.walkTo(this.spots.coffee);
    // put the mug under the spout
    await this.placeMug(this.room.cupSpot());
    this.hand[0] = { mode: 'free' };
    this.setArms('rest', [0]);
    // press the button with the left index finger
    const arm = r.arms[1];
    arm.fingers.forEach((f, k) => { f.curl = k === 3 ? 0 : 1; });
    arm.thumb.curl = 0.9;
    const btn = this.room.coffeeButton();
    const dirIn = r.worldForward(V());
    const q = r.handQuat(dirIn, V(0, -1, 0));
    await this.reachTo(1, btn.clone().addScaledVector(dirIn, -0.2).add(V(0, 0.06, 0)), q, 0.55);
    await this.reachTo(1, btn.clone().addScaledVector(dirIn, -0.16).add(V(0, 0.055, 0)), q, 0.25);
    audio.beep();
    this.room.coffeeButtonMat.emissiveIntensity = 4;
    await this.reachTo(1, btn.clone().addScaledVector(dirIn, -0.22).add(V(0, 0.06, 0)), q, 0.3);
    this.hand[1] = { mode: 'free' };
    this.setArms('hips', [1]);
    arm.fingers.forEach((f) => { f.curl = 0.25; });
    // brew
    this.setActivity('Brewing an espresso');
    r.face.set('loading');
    r.lookAt(this.room.cupSpot(), 1);
    const stream = this.room.coffeeStream;
    const nz = this.room.nozzle(), cup = this.room.cupSpot();
    stream.visible = true;
    const sLocal = this.room.coffeeMachine.worldToLocal(nz.clone());
    const cLocal = this.room.coffeeMachine.worldToLocal(cup.clone().add(V(0, 0.02, 0)));
    audio.brew(4);
    const f0 = this.fill;
    await this.tween(4, (k, raw) => {
      const len = sLocal.y - cLocal.y - this.fill * 0.07;
      stream.scale.y = Math.max(0.01, len);
      stream.position.set(sLocal.x, sLocal.y - len / 2, sLocal.z);
      stream.scale.x = stream.scale.z = raw < 0.9 ? 1 : (1 - raw) * 10;
      this.fill = THREE.MathUtils.lerp(f0, 0.9, raw);
      this.room.setFill(this.fill);
    }, false, (t) => t);
    stream.visible = false;
    this.room.coffeeButtonMat.emissiveIntensity = 1.2;
    r.lookAt(null);
    r.face.set('love', 1.5);
    this.stats.coffees++;
    r.energy = 1;
    this.setArms('rest', [1]);
    await this.grabMug(0);
    this.hand[0] = { mode: 'hold', rate: 6 };
    await this.drink();
    this.setActivity('Walking back with coffee');
    await this.returnToDesk();
    await this.placeMug(this.room.mugHome.pos, this.room.mugHome.quat);
    this.hand[0] = { mode: 'free' };
    this.setArms('thighs');
  }

  async stretch() {
    const r = this.robot;
    this.setActivity('Stretching');
    await this.leaveDesk(-1);
    await this.walkTo(this.spots.stretch);
    this.setArms('overhead');
    r.face.set('sleepy');
    audio.servo(0.8, 1.3);
    await this.wait(0.9);
    if (Math.random() < 0.5) this.say(pick(['Hnnng… servos need oil.', '*creak*', 'Ninety minutes of sitting. Not great.']), 2);
    await this.tween(1.6, (k) => { r.state.side = Math.sin(k * Math.PI * 2) * 0.22; });
    await this.tween(1.6, (k) => { r.state.twist = Math.sin(k * Math.PI * 2) * 0.35; });
    this.setArms('hips');
    r.face.set('happy', 1.5);
    await this.wait(1.2);
    this.setArms('rest');
    await this.returnToDesk();
    this.setArms('thighs');
  }

  async visit(name) {
    const r = this.robot;
    const labels = { window: 'Looking out the window', bookshelf: 'Browsing the bookshelf', plant: 'Checking on the plant' };
    this.setActivity(labels[name]);
    await this.leaveDesk(this.spots[name].pos.x);
    await this.walkTo(this.spots[name]);
    const spot = this.spots[name];
    if (name === 'window') {
      this.setArms('behind');
      r.lookAt(spot.target, 0.9);
      r.face.set(this.world.night > 0.5 ? 'love' : 'normal');
      if (Math.random() < 0.6) this.say(this.world.night > 0.5 ? pick(['Look at all those stars.', 'The city never sleeps. Neither do I.']) : pick(['Nice day for a deploy.', 'I should go outside. Do robots go outside?']), 3);
      await this.tween(8, (k) => { r.state.headYaw = Math.sin(k * Math.PI * 2) * 0.25; r.lookAt(spot.target.clone().add(V(Math.sin(k * 6) * 0.6, Math.sin(k * 4) * 0.2, 0)), 0.9); });
    } else if (name === 'bookshelf') {
      r.face.set('thinking');
      const base = V(...this.layout.place.bookshelf.pos);
      await this.tween(4, (k) => r.lookAt(base.clone().add(V(-0.35 + k * 0.7, 1.55 - Math.floor(k * 3) * 0.37, -0.1)), 1));
      const touch = base.clone().add(V(0.12, 1.1, -0.12));
      const fwd = r.worldForward(V());
      await this.reachTo(0, touch.clone().addScaledVector(fwd, -0.14), r.handQuat(fwd, V(0, -1, 0)), 0.8);
      this.room.globe.userData.spin = 6;
      this.say(pick(['“Clean Code”… again?', 'So many tabs, so few shelves.', 'Ah, “Gödel, Escher, Bach”.']), 2.4);
      r.face.set('happy', 1.5);
      await this.wait(1.2);
      this.hand[0] = { mode: 'free' };
    } else {
      r.face.set('love');
      r.lookAt(V(...this.layout.place.plantFloor.pos).add(V(0, 0.6, 0)), 1);
      const st = r.state;
      const w0 = st.waistY;
      await this.tween(0.8, (k) => { st.waistY = w0 - 0.08 * k; st.lean = 0.25 * k; });
      const leaf = V(...this.layout.place.plantFloor.pos).add(V(0.25, 0.75, -0.25));
      const fwd = r.worldForward(V());
      await this.reachTo(0, leaf.clone().addScaledVector(fwd, -0.12), r.handQuat(fwd, V(0, -1, 0)), 0.9);
      this.room.plantFloor.userData.wiggle = 1.5;
      this.say(pick(['Hello, little fern.', 'You’re growing! I’m so proud.', 'Photosynthesis looks relaxing.']), 2.4);
      await this.wait(1.4);
      this.hand[0] = { mode: 'free' };
      await this.tween(0.8, (k) => { st.waistY = w0 - 0.08 * (1 - k); st.lean = 0.25 * (1 - k); });
    }
    r.lookAt(null);
    r.state.headYaw = 0;
    this.setArms('rest');
    await this.returnToDesk();
    this.setArms('thighs');
  }

  /** Get up, step out from the desk, dance a while, sit back down. */
  async danceBreak() {
    await this.leaveDesk(1);
    await this.walkTo(this.spots.stretch);
    this.say(pick(['This is my jam! 🎶', 'Can’t stop the beat.', '*robot dance intensifies*']), 2.5);
    await this.dance(music.playing ? 12 : 8);
    await this.returnToDesk();
    this.setArms('thighs');
  }

  async dance(seconds) {
    const r = this.robot, st = r.state;
    this.setActivity('Dancing 🎶');
    this.dancing = true;
    r.face.set('happy');
    const w0 = st.waistY;
    let t = 0;
    try {
    await this.frame((dt) => {
      t += dt;
      const bpm = music.playing ? music.info.bpm : 100;
      const b = (music.playing ? music.elapsed : t) * bpm / 60 * Math.PI * 2;
      st.waistY = w0 - 0.025 * Math.abs(Math.sin(b));
      st.twist = Math.sin(b / 2) * 0.25;
      st.headRoll = Math.sin(b / 2) * 0.12;
      st.headPitch = Math.sin(b) * 0.1;
      r.arms.forEach((arm, i) => {
        this.armTargets[i] = { x: 0.9 + Math.sin(b + i * Math.PI) * 0.6, y: 0, z: 0.4, elbow: 1.3 + Math.sin(b * 2) * 0.3, wx: 0, wy: Math.PI / 2, wz: 0 };
      });
      return t >= seconds || (this.mode === 'user' && !this.userOnMac) || (this.mode === 'user' && !music.playing);
    }, this.mode !== 'user');
    } finally {
      this.dancing = false;
      st.waistY = w0; st.twist = 0; st.headRoll = 0; st.headPitch = 0;
      this.setArms('rest');
    }
  }

  async userMode() {
    const r = this.robot;
    this.pending = null;
    this.mode = 'user';
    this.userOnMac = true;
    this.setActivity('Taking a break while you use the Mac');
    this.screen.setMode('inuse');
    if (this.sitting) await this.leaveDesk(1);
    const holding = this.holdingMug !== null;
    await this.walkTo(this.spots.lounge);
    if (!holding) this.setArms('hips');
    r.face.set('happy', 1.5);
    let t = 0, nextIdle = 3;
    while (this.userOnMac) {
      if (music.playing) { await this.dance(4); continue; }
      await this.frame((dt) => { t += dt; return t > nextIdle || !this.userOnMac || music.playing; });
      if (!this.userOnMac || music.playing) continue;
      nextIdle = t + rand(4, 8);
      const roll = Math.random();
      if (roll < 0.35) {
        r.lookAt(this.room.screenMesh.getWorldPosition(V()), 1);
        r.face.set('thinking', 2);
        await this.wait(2);
        r.lookAt(null);
      } else if (roll < 0.55 && this.holdingMug !== null) {
        await this.drink();
      } else if (roll < 0.75) {
        r.lookAt(this.world.camera.position, 1);
        r.face.set(pick(['happy', 'wink', 'love']), 1.5);
        await this.wait(1.6);
        r.lookAt(null);
      } else {
        this.setArms('shrug');
        await this.wait(1);
        this.setArms(holding ? 'rest' : 'hips', holding ? [1] : [0, 1]);
      }
    }
    this.say(pick(['My turn again!', 'Thanks for keeping it warm.', 'Back to work!']), 2.2);
    this.screen.setMode('code');
    this.setArms('rest');
    await this.returnToDesk();
    if (this.holdingMug !== null) {
      await this.placeMug(this.room.mugHome.pos, this.room.mugHome.quat);
      this.hand[0] = { mode: 'free' };
    }
    this.setArms('thighs');
    this.mode = 'life';
  }
}
