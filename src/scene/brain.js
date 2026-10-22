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
  constructor({ robot, room, house, nav, screen, layout, world, hooks }) {
    Object.assign(this, { robot, room, house, nav, screen, layout, world, hooks });
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
    this.cmdQueue = [];
    this.fetchQueue = []; // parcels waiting on the porch for him
    this.crit = 0;          // > 0 while in a move that must finish (standing up, sitting down, handling the mug)
    this.aborting = false;  // set by command(): every other running task is cancelled
    this.input = { x: 0, z: 0, run: false }; // WASD, camera-relative, written by main.js
    for (const name of ['standUp', 'sitDown', 'sitOnSpot', 'standFromSpot', 'grabMug', 'placeMug']) {
      const fn = this[name].bind(this);
      this[name] = async (...a) => { this.crit++; try { return await fn(...a); } finally { this.crit--; } };
    }
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
    for (const [k, sp] of Object.entries(L.house?.spots || {})) s[k] = { pos: V(...sp.pos), heading: sp.heading, seat: sp.seat, look: sp.look ? V(...sp.look) : null };
    return s;
  }

  // ------------------------------------------------------------ scheduler
  frame(fn, interruptible = false) {
    return new Promise((resolve, reject) => {
      this.tasks.add({ fn, resolve, reject, interruptible, critical: this.crit > 0 });
    });
  }
  wait(s, interruptible = false) { return this.frame((dt) => (s -= dt) <= 0, interruptible); }
  tween(dur, fn, interruptible = false, e = ease) {
    let t = 0;
    return this.frame((dt) => { t += dt; const k = Math.min(1, t / dur); fn(e(k), k); return k >= 1; }, interruptible);
  }

  update(dt) {
    for (const task of [...this.tasks]) {
      if ((task.interruptible && this.pending) || (this.aborting && !task.critical)) { this.tasks.delete(task); task.reject(INTERRUPT); continue; }
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
    if (this.broken) { this.say(pick(['…', '*bzzt*', '(he’s broken — try Repair)']), 2); return; }
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
        if (this.cmdQueue.length) { await this.runCommand(this.cmdQueue.shift()); continue; }
        if (this.broken) { await this.brokenMode(); continue; }
        if (this.fetchQueue.length && this.pending !== 'user') { await this.runCommand({ type: 'fetch', order: this.fetchQueue.shift() }); continue; }
        if (this.pending === 'user') { await this.userMode(); continue; }
        if (!this.sitting && !this.queue.length && !(this.pending && this.pending !== 'user')) { await this.returnToDesk(); this.setArms('thighs'); continue; }
        const next = this.queue.shift() || (this.pending && this.pending !== 'user' ? this.pending : null);
        this.pending = null;
        if (next) { await this.doActivity(next); continue; }
        if (this.world.night > 0.7 && this.autoBreaks !== false && !this.sleptTonight) { await this.sleep(true); continue; }
        if (this.world.night < 0.3) this.sleptTonight = false;
        if (music.playing && Math.random() < 0.6) { await this.danceBreak(); continue; }
        await this.work(rand(28, 50));
        if (this.pending) continue;
        if (this.autoBreaks === false) continue;
        const wantsCoffee = this.fill < 0.2 || this.robot.energy < 0.35;
        const wantsSnack = this.robot.energy < 0.5 && Math.random() < 0.5;
        const choice = wantsCoffee ? 'coffee' : wantsSnack ? 'fridge' : pick(['stretch', 'window', 'bookshelf', 'plant', 'coffee', 'tv', 'workshop', 'mirror', 'printer', 'livingWindow', 'frontDoor', 'fridge', 'tv', 'workshop']);
        await this.doActivity(choice);
      } catch (e) {
        if (e !== INTERRUPT) { console.error(e); this.aborting = false; this.recover(); await this.wait(1); }
      }
      if (this.aborting) { this.aborting = false; this.recover(); }
    }
  }

  // ------------------------------------------------------------ commands (chat, WASD, punches)
  /** Drop whatever he's doing (safely) and do this instead. */
  command(cmd) {
    if (this.broken && cmd.type !== 'broken') return false;
    if (cmd.type === 'broken') this.broken = true;
    if (this.mode === 'user') { this.cmdQueue.push(cmd); return true; }
    this.cmdQueue = [cmd];
    this.queue = [];
    this.aborting = true;
    return true;
  }

  /** Tidy up after an interrupted activity so the next one starts from a sane state. */
  recover() {
    const r = this.robot, st = r.state;
    this.stopTyping();
    this.dancing = false;
    st.twist = 0; st.side = 0; st.headRoll = 0;
    r.lookAt(null);
    if (this.room.coffeeStream) this.room.coffeeStream.visible = false;
    if (this.house.fridge) this.house.fridge.target = 0;
    if (this.house.frontDoor) this.house.frontDoor.target = 0;
    for (let i = 0; i < 2; i++) if (this.hand[i].mode !== 'hold') this.hand[i] = { mode: 'free' };
    if (this.holdingMug === null && this.room.mug.parent !== this.room.room) this.room.room.attach(this.room.mug);
    if (this.holdingMug === null && this.room.mug.position.distanceTo(this.room.mugHome.pos) > 0.05 && !this.broken) {
      this.room.mug.position.copy(this.room.mugHome.pos); // tidy the mug home (magic, but nobody's looking at it)
      this.room.mug.quaternion.copy(this.room.mugHome.quat);
    }
    if (!this.sitting && !this.seated && !this.collapsed) { st.waistY = this.layout.robot.standWaist - 0.012; st.lean = 0.02; st.pelvisZ = 0; this.setArms('rest'); }
  }

  async runCommand(c) {
    this.mode = 'cmd';
    try {
      const r = this.robot;
      if (c.say) this.say(c.say, Math.min(6, 1.5 + c.say.length / 18));
      switch (c.type) {
        case 'goto': await this.cmdGoto(c.target, c.label); await this.idleHere(c.stay ?? 25); break;
        case 'activity': await this.doActivity(c.name); break;
        case 'desk': case 'work': if (!this.sitting) await this.returnToDesk(); this.setArms('thighs'); break;
        case 'drive': await this.driveMode(); break;
        case 'broken': await this.brokenMode(); break;
        case 'wave': this.wave(); await this.wait(2.6); if (!this.sitting) await this.idleHere(c.stay ?? 15); break;
        case 'dance':
          await this.getUp();
          await this.dance(c.seconds || 10);
          await this.idleHere(c.stay ?? 12);
          break;
        case 'spin': {
          await this.getUp();
          const h0 = r.heading;
          r.face.set('happy');
          await this.tween(2.2, (k) => { r.heading = h0 + k * Math.PI * 4; }, false, (t) => t);
          r.face.set('surprised', 1.5);
          this.say(pick(['Wheee!', 'I’m dizzy. Is that a robot thing?', 'Again! No, wait.']), 2);
          await this.idleHere(c.stay ?? 12);
          break;
        }
        case 'jump': {
          await this.getUp();
          const st = r.state, w0 = st.waistY;
          for (let i = 0; i < (c.times || 2); i++) {
            await this.tween(0.25, (k) => { st.waistY = w0 - 0.12 * k; });
            audio.servo(0.2, 1.4);
            await this.tween(0.45, (k) => { st.waistY = w0 - 0.12 + 0.42 * Math.sin(k * Math.PI); st.feet[0].y = st.feet[1].y = 0.3 * Math.sin(k * Math.PI); }, false, (t) => t);
            st.feet[0].y = st.feet[1].y = 0;
            audio.step();
            await this.tween(0.2, (k) => { st.waistY = w0 - 0.12 * (1 - k); });
          }
          await this.idleHere(c.stay ?? 12);
          break;
        }
        case 'look': {
          await this.getUp();
          r.lookAt(this.world.camera.position, 1);
          r.face.set(c.face || 'happy', 2);
          await this.wait(2.5);
          r.lookAt(null);
          await this.idleHere(c.stay ?? 12);
          break;
        }
        case 'come': {
          // walk to the spot on the floor the camera is looking at
          const t = this.world.controls.target;
          await this.cmdGoto({ pos: V(t.x, 0, t.z), heading: headingTo(V(t.x, 0, t.z), this.world.camera.position) }, 'Coming over');
          r.lookAt(this.world.camera.position, 1);
          await this.idleHere(c.stay ?? 25);
          break;
        }
        case 'say': await this.idleHere(c.stay ?? (this.sitting ? 0 : 8)); break;
        case 'fetch': await this.fetchParcel(c.order); break;
        case 'reboot': {
          const st = r.state;
          r.face.set('loading');
          r.setStatus(0x49e3ff);
          this.setActivity('Rebooting…');
          await this.wait(1.4);
          const w0 = st.waistY, l0 = st.lean, f0 = st.feet.map((f) => f.clone());
          audio.servo(1.2, 1.2);
          await this.tween(1.3, (k) => {
            if (this.collapsed) {
              st.waistY = THREE.MathUtils.lerp(w0, this.layout.robot.standWaist - 0.012, k);
              st.feet[0].lerpVectors(f0[0], V(0.11, 0, 0), k);
              st.feet[1].lerpVectors(f0[1], V(-0.11, 0, 0), k);
              st.lean = THREE.MathUtils.lerp(l0, 0.02, k);
            } else st.lean = THREE.MathUtils.lerp(l0, this.sitting ? 0.14 : 0.02, k);
            st.headRoll = 0.3 * (1 - k);
          });
          this.collapsed = false;
          this.setArms(this.sitting ? 'thighs' : 'rest');
          r.face.set('surprised', 1.2);
          this.say(pick(['Rebooting… I had the weirdest dream. Someone kept punching me.', 'All systems nominal. Who did that?!', 'I’m back! And I remember everything. 👀']), 3.4);
          await this.wait(1.5);
          break;
        }
        default: break;
      }
    } finally {
      this.mode = 'life';
      if (c.type === 'drive') this.driving = false;
    }
  }

  /** A parcel arrived for him: he'll go and get it as soon as he's free (interrupting a normal activity). */
  enqueueFetch(o) {
    this.fetchQueue.push(o);
    if (this.mode === 'life' && !this.crit && !this.broken) this.aborting = true;
  }

  /** A parcel is on the porch: go out, pick it up, bring it in and unbox it next to the desk. */
  async fetchParcel(o) {
    const d = this.delivery, r = this.robot, st = r.state;
    const p = d?.parcelFor(o);
    if (!p || p.taken) return;
    this.crit++; // don't drop the box halfway: new orders wait until he's done
    try {
      this.setActivity(`Fetching a parcel: ${o.item.emoji} ${o.item.name}`);
      this.say(pick(['Ooh, a delivery! 📦', 'Was that the doorbell?', 'Parcel! Be right back.']), 2.2);
      await this.getUp();
      const box = p.g;
      const stand = box.position.clone().setY(0).add(V(-0.58, 0, 0));
      await this.walkTo({ pos: stand, heading: headingTo(stand, box.position) });
      const w0 = st.waistY;
      this.setArms('thighs');
      await this.tween(0.6, (k) => { st.waistY = w0 - 0.22 * k; st.lean = 0.02 + 0.5 * k; });
      d.take(o);
      r.root.updateMatrixWorld(true);
      r.torso.attach(box);
      const p0 = box.position.clone(), q0 = box.quaternion.clone();
      this.hand = [{ mode: 'hold', rate: 8 }, { mode: 'hold', rate: 8 }];
      await this.tween(0.6, (k) => {
        st.waistY = w0 - 0.22 * (1 - k); st.lean = 0.02 + 0.5 * (1 - k);
        box.position.lerpVectors(p0, V(0, 0.06, -0.37), k);
        box.quaternion.slerpQuaternions(q0, new THREE.Quaternion(), k);
      });
      this.setActivity(`Carrying ${o.item.emoji} inside`);
      const home = V(1.25, 0, 0.35);
      await this.walkTo({ pos: home, heading: 0 });
      await this.tween(0.6, (k) => { st.waistY = w0 - 0.22 * k; st.lean = 0.02 + 0.5 * k; });
      this.room.room.parent.attach(box);
      box.position.set(home.x, 0, home.z - 0.5);
      box.quaternion.identity();
      this.hand = [{ mode: 'free' }, { mode: 'free' }];
      this.setArms('rest');
      await this.tween(0.5, (k) => { st.waistY = w0 - 0.22 * (1 - k); st.lean = 0.02 + 0.5 * (1 - k); });
      this.setActivity(`Unboxing ${o.item.emoji} ${o.item.name}`);
      r.lookAt(box.position.clone().add(V(0, 0.3, 0)), 1);
      r.face.set('surprised', 1.2);
      await d.unbox(o, 'agent', (dur, fn) => this.tween(dur, (e, k) => fn(k)));
      r.lookAt(null);
      r.face.set('happy', 2);
    } finally {
      this.crit--;
    }
  }

  async getUp() {
    if (this.seated) await this.standFromSpot();
    if (this.sitting) await this.leaveDesk(1);
  }

  /** Walk to a named spot / room or a { pos, heading } target. */
  async cmdGoto(target, label) {
    if (target === 'desk') { await this.returnToDesk(); this.setArms('thighs'); return; }
    const spot = typeof target === 'string' ? (this.spots[target] || this.roomSpot(target)) : target;
    if (!spot) return;
    this.setActivity(label || (typeof target === 'string' ? `Walking to the ${target.replace(/([A-Z])/g, ' $1').toLowerCase()}` : 'Walking over'));
    await this.getUp();
    await this.walkTo(spot);
    if (spot.seat) await this.sitOnSpot(spot);
    this.hooks.arrived?.(target);
  }

  roomSpot(id) {
    const room = this.house.rooms.find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase());
    if (!room) return null;
    const [x0, z0, x1, z1] = room.rect;
    const c = V((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const [i, j] = this.nav.nearestFree(this.nav.toCell(c));
    const p = this.nav.toWorld(i, j);
    return { pos: p, heading: headingTo(p, this.world.camera.position) };
  }

  /** Stand around waiting for the next order, then wander back to work. */
  async idleHere(seconds) {
    const r = this.robot;
    if (seconds <= 0) return;
    this.setActivity('Waiting for orders');
    let t = 0, next = 2;
    await this.frame((dt) => {
      t += dt;
      if (t > next) {
        next = t + rand(3, 6);
        if (Math.random() < 0.5) { r.lookAt(this.world.camera.position, 0.9); r.face.set(pick(['happy', 'normal', 'wink']), 1.2); } else r.lookAt(null);
      }
      return t > seconds;
    }, true);
    r.lookAt(null);
  }

  /** WASD: he walks where you steer him, relative to the camera. */
  async driveMode() {
    const r = this.robot;
    this.driving = true;
    await this.getUp();
    this.setActivity('Being driven around 🎮');
    r.face.set('happy', 1);
    let idle = 0;
    const nav = this.nav;
    const freeAt = (p) => { const [i, j] = nav.toCell(p); return nav.free(i, j); };
    await this.frame((dt) => {
      const { x, z, run } = this.input;
      const mag = Math.hypot(x, z);
      if (mag < 0.1) { idle += dt; return idle > 14; }
      idle = 0;
      const want = Math.atan2(-x, -z);
      r.heading += wrap(want - r.heading) * (1 - Math.exp(-dt * 9));
      const facing = Math.cos(wrap(want - r.heading));
      const speed = (run ? 1.55 : 0.8) * Math.max(0.15, facing);
      const p = r.root.position;
      const step = V(x / mag, 0, z / mag).multiplyScalar(speed * dt);
      const full = p.clone().add(step);
      if (freeAt(full)) p.copy(full);
      else if (freeAt(p.clone().add(V(step.x, 0, 0)))) p.x += step.x;
      else if (freeAt(p.clone().add(V(0, 0, step.z)))) p.z += step.z;
      return false;
    });
    this.driving = false;
    this.say(pick(['Thanks for the ride. Back to work!', 'I’ll head back to my desk then.', 'That was fun. Code doesn’t write itself (yet).']), 2.4);
  }

  /** A punch landed: recoil, flinch, maybe stagger back a step. */
  hurt(dir, k = 0.5) {
    const r = this.robot;
    const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -r.heading, 0));
    const d = dir.clone().setY(0).normalize().applyQuaternion(inv);
    r.hit.pitch += d.z * 0.45 * k;
    r.hit.roll += -d.x * 0.45 * k;
    r.face.set(Math.random() < 0.5 ? 'hurt' : 'angry', 1.4);
    r.statusTarget.set(0xff4b3a);
    clearTimeout(this.hurtTimer);
    this.hurtTimer = setTimeout(() => { if (!this.broken) r.setStatus(0x49e3ff); }, 1500);
    if (!this.sitting && !this.seated && !this.broken) {
      const push = V(dir.x, 0, dir.z).normalize().multiplyScalar(0.12 * k);
      const np = r.root.position.clone().add(push);
      const [i, j] = this.nav.toCell(np);
      if (this.nav.free(i, j)) r.root.position.copy(np);
    }
  }

  dropMug() {
    const mug = this.room.mug;
    this.room.room.attach(mug);
    this.holdingMug = null;
    for (let i = 0; i < 2; i++) if (this.hand[i].mode === 'hold') this.hand[i] = { mode: 'free' };
    mug.position.y = 0.04;
    mug.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, mug.rotation.y, 0));
    this.fill = 0;
    this.room.setFill(0);
  }

  /** Knocked out: slump over (or collapse on the floor) until someone repairs him. */
  async brokenMode() {
    const r = this.robot, st = r.state;
    this.mode = 'broken';
    this.broken = true;
    this.stopTyping();
    this.setActivity('Broken 💥 (press Repair)');
    for (let i = 0; i < 2; i++) if (this.hand[i].mode !== 'hold') this.hand[i] = { mode: 'free' };
    this.armTargets = r.arms.map(() => ({ x: -0.05, y: 0, z: 0.06, elbow: 0.15, wx: 0, wy: Math.PI / 2, wz: 0 }));
    r.face.set('dead');
    r.statusTarget.set(0x330000);
    r.lookAt(null);
    const w0 = st.waistY, l0 = st.lean, f0 = st.feet.map((f) => f.clone());
    this.collapsed = !this.sitting && !this.seated;
    audio.servo(1.4, 0.5);
    await this.tween(1.1, (k) => {
      if (this.collapsed) {
        st.waistY = THREE.MathUtils.lerp(w0, 0.34, k);
        st.feet[0].lerpVectors(f0[0], V(0.17, 0, -0.5), k);
        st.feet[1].lerpVectors(f0[1], V(-0.17, 0, -0.5), k);
        st.lean = THREE.MathUtils.lerp(l0, 0.55, k);
      } else st.lean = THREE.MathUtils.lerp(l0, this.sitting ? 0.5 : 0.6, k);
      st.headRoll = 0.3 * k;
    }, false, (t) => t * t);
    audio.thud();
    await this.frame(() => !this.broken);
  }

  /** Called by Damage once all the parts are back on. */
  async repaired() {
    this.broken = false;
    this.cmdQueue = [{ type: 'reboot' }];
    this.aborting = true;
  }

  async doActivity(name) {
    const map = { coffee: () => this.coffeeRun(), stretch: () => this.stretch(), window: () => this.visit('window'),
      bookshelf: () => this.visit('bookshelf'), plant: () => this.visit('plant'), dance: () => this.danceBreak(),
      tv: () => this.watchTV(), fridge: () => this.raidFridge(), workshop: () => this.tinker(), mirror: () => this.mirrorCheck(),
      printer: () => this.lookAround('printer'), livingWindow: () => this.lookAround('livingWindow'), frontDoor: () => this.frontDoor(), bed: () => this.sleep(false) };
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
    this.setActivity('Sipping matcha');
    const r = this.robot;
    r.state.lean = 0.05;
    await this.grabMug(0);
    this.hand[0] = { mode: 'hold', rate: 6 };
    await this.wait(0.4);
    await this.drink();
    await this.wait(0.5);
    if (Math.random() < 0.3) this.say(pick(['Ahh. Fuel.', 'Mmm, 9 bar.', 'Is it weird that I can’t taste this?', 'Matcha: compiled.']), 2);
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
  async walkPath(points, { finalHeading = null, sidestep = false, speed = 0.72, interruptible = false } = {}) {
    const r = this.robot;
    for (const p of points) {
      const target = V(p.x, 0, p.z);
      const dist0 = target.distanceTo(r.root.position);
      if (dist0 < 0.01) continue;
      const want = headingTo(r.root.position, target);
      if (!sidestep) await this.turnTo(want, interruptible);
      await this.frame((dt) => {
        const pos = r.root.position;
        const to = target.clone().setY(pos.y).sub(pos); // the ground height is handled elsewhere
        const d = to.length();
        if (d < 0.02) { pos.x = target.x; pos.z = target.z; return true; }
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
    if (this.seated) await this.standFromSpot();
    const side = r.root.position.x >= 0 ? 1 : -1;
    const approach = { pos: V(side * 0.72, 0, this.room.chair.position.z - 0.33), heading: 0 };
    this.setActivity('Heading back to the desk');
    await this.walkTo(approach);
    await this.sitDown();
  }

  // ------------------------------------------------------------ activities
  async coffeeRun() {
    const r = this.robot;
    this.setActivity('Matcha run 🍵');
    if (this.holdingMug === null) await this.grabMug(0);
    this.hand[0] = { mode: 'hold', rate: 6 };
    this.say(pick(['Refill time.', 'Running low on matcha… and battery.', 'BRB, matcha.']), 2.2);
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
    this.setActivity('Whisking a matcha');
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
    this.setActivity('Walking back with matcha');
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
      if (this.partyMusic) { music.pause(); this.partyMusic = false; } // music we started just for this dance stops with it
      st.waistY = w0; st.twist = 0; st.headRoll = 0; st.headPitch = 0;
      this.setArms('rest');
    }
  }

  // ------------------------------------------------------------ around the house
  /** Walk in front of a seat (sofa, bed edge), turn round and sit down on it. */
  async sitOnSpot(spot) {
    const r = this.robot, st = r.state;
    const fwd = V(-Math.sin(spot.heading), 0, -Math.cos(spot.heading));
    await this.walkTo({ pos: spot.pos.clone().addScaledVector(fwd, 0.3), heading: spot.heading });
    if (this.hand[0].mode !== 'hold') this.setArms('thighs', [0]);
    if (this.hand[1].mode !== 'hold') this.setArms('thighs', [1]);
    r.root.position.copy(spot.pos);
    r.prevPos.copy(r.root.position);
    st.pelvisZ = -0.3;
    st.feet[0].set(0.11, 0, -0.3);
    st.feet[1].set(-0.11, 0, -0.3);
    audio.servo(1.1, 0.9);
    const w0 = st.waistY, w1 = spot.seat + 0.19;
    await this.tween(1.3, (k, raw) => {
      st.waistY = THREE.MathUtils.lerp(w0, w1, k);
      st.pelvisZ = -0.3 * (1 - Math.min(1, raw * 1.3));
      st.lean = 0.02 + Math.sin(raw * Math.PI) * 0.35;
      st.feet[0].x = 0.11 + 0.03 * k; st.feet[1].x = -0.11 - 0.03 * k;
      st.feet[0].z = st.feet[1].z = -0.3 - 0.06 * k;
    });
    this.seated = spot;
  }

  async standFromSpot() {
    const spot = this.seated;
    if (!spot) return;
    const r = this.robot, st = r.state;
    if (st.lean < -0.05) { const l0 = st.lean; await this.tween(0.9, (k) => { st.lean = l0 * (1 - k); }); audio.servo(0.6, 1.2); }
    if (this.hand[0].mode !== 'hold') this.setArms('thighs', [0]);
    if (this.hand[1].mode !== 'hold') this.setArms('thighs', [1]);
    audio.servo(1.1, 1.1);
    const w0 = st.waistY, w1 = this.layout.robot.standWaist - 0.012;
    const fx0 = st.feet[0].x, fz0 = st.feet[0].z;
    await this.tween(1.25, (k, raw) => {
      st.waistY = THREE.MathUtils.lerp(w0, w1, k);
      st.pelvisZ = -0.3 * Math.min(1, raw * 1.6);
      st.lean = Math.sin(raw * Math.PI) * 0.4;
      st.feet[0].x = THREE.MathUtils.lerp(fx0, 0.11, k); st.feet[1].x = -st.feet[0].x;
      st.feet[0].z = st.feet[1].z = THREE.MathUtils.lerp(fz0, -0.3, k);
    });
    r.root.position.addScaledVector(r.worldForward(V()), 0.3);
    r.prevPos.copy(r.root.position);
    st.pelvisZ = 0;
    st.lean = 0.02;
    st.headPitch = 0;
    st.feet[0].set(0.11, 0, 0);
    st.feet[1].set(-0.11, 0, 0);
    this.seated = null;
    this.setArms('rest');
  }

  async goTo(name, label) {
    this.setActivity(label);
    if (this.seated) await this.standFromSpot();
    if (this.sitting) await this.leaveDesk(this.spots[name].pos.x);
    await this.walkTo(this.spots[name]);
  }

  async watchTV() {
    const r = this.robot, tv = this.house.tv;
    await this.goTo('tv', 'Heading to the sofa');
    await this.sitOnSpot(this.spots.tv);
    this.setActivity('Watching Robo News on TV 📺');
    if (tv) tv.on = true;
    r.lookAt(this.spots.tv.look, 1);
    this.say(pick(['Ooh, Robo News is on.', 'Just one episode.', 'This documentary about toasters is wild.']), 2.5);
    let t = 0, next = 3;
    await this.frame((dt) => {
      t += dt;
      if (t > next) {
        next = t + rand(3, 6);
        r.face.set(pick(['happy', 'surprised', 'love', 'normal', 'wink']), 2);
        if (Math.random() < 0.4) audio.happy();
      }
      return t > 22;
    }, true).finally(() => { if (tv) tv.on = false; r.lookAt(null); });
    await this.standFromSpot();
    await this.returnToDesk();
    this.setArms('thighs');
  }

  async raidFridge() {
    const r = this.robot, f = this.house.fridge;
    await this.goTo('fridge', 'Raiding the fridge 🔋');
    r.lookAt(f.group.localToWorld(V(0, 1.3, 0)), 1);
    const arm = r.arms[0];
    // open the door with the left hand, grab a can with the right
    f.target = -1.85;
    audio.servo(0.4, 1.4);
    await this.wait(0.8);
    const fwd = r.worldForward(V());
    const inside = f.group.localToWorld(V(-0.05, 1.07, -0.12));
    arm.fingers.forEach((x) => { x.curl = 0.1; });
    await this.reachTo(0, inside.clone().addScaledVector(fwd, -0.12).add(V(0, 0.04, 0)), this.holdQuat(arm), 0.8);
    arm.fingers.forEach((x) => { x.curl = 0.95; });
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x49e3ff, emissive: 0x0b4b5a, metalness: 0.6, roughness: 0.3 }));
    can.position.set(0, -0.12, -0.03);
    arm.wrist.add(can);
    this.say(pick(['Battery juice. My favourite.', 'Mmm, fresh electrons.', 'Don’t tell the matcha machine.']), 2.5);
    this.hand[0] = { mode: 'hold', rate: 6 };
    await this.wait(0.6);
    f.target = 0;
    audio.servo(0.3, 1.2);
    r.lookAt(null);
    await this.wait(0.6);
    const t = r.torso.localToWorld(V(-0.05, 0.6, -0.34));
    const q = this.holdQuat(arm).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.5)));
    await this.reachTo(0, t, q, 0.7);
    r.face.set('love', 2);
    audio.sip();
    await this.wait(1.2);
    r.energy = Math.min(1, r.energy + 0.35);
    can.removeFromParent();
    arm.fingers.forEach((x) => { x.curl = 0.25; });
    this.hand[0] = { mode: 'free' };
    this.setArms('rest');
    await this.returnToDesk();
    this.setArms('thighs');
  }

  async tinker() {
    const r = this.robot;
    await this.goTo('bench', 'Tinkering in the workshop 🛠');
    r.face.set('focused');
    this.say(pick(['Time to upgrade my left elbow.', 'Where did I put the 3 mm hex key?', 'Building a smaller me. For science.']), 2.8);
    const fwd = r.worldForward(V());
    const right = V(Math.cos(r.heading), 0, -Math.sin(r.heading));
    const base = r.root.position.clone().addScaledVector(fwd, 0.4).add(V(0, 1.05, 0));
    const q = r.handQuat(fwd.clone().multiplyScalar(0.6).add(V(0, -0.8, 0)).normalize(), V(0, -1, 0));
    const sparks = this.sparks(base.clone().add(V(0, -0.1, 0)));
    let t = 0;
    r.state.lean = 0.25;
    r.lookAt(base.clone().add(V(0, -0.15, 0)), 1);
    this.hand[0] = { mode: 'target', target: base.clone().addScaledVector(right, 0.12), quat: q.clone(), speed: 10, rate: 6 };
    this.hand[1] = { mode: 'target', target: base.clone().addScaledVector(right, -0.12), quat: q.clone(), speed: 10, rate: 6 };
    await this.frame((dt) => {
      t += dt;
      this.hand[0].target.copy(base).addScaledVector(right, 0.1 + Math.sin(t * 7) * 0.04).add(V(0, Math.abs(Math.sin(t * 9)) * 0.03, 0));
      this.hand[1].target.copy(base).addScaledVector(right, -0.12).add(V(0, Math.sin(t * 2) * 0.02, 0));
      sparks.update(dt, Math.sin(t * 9) > 0.3);
      if (Math.random() < dt * 3) audio.noise({ dur: 0.06, freq: 5000 + Math.random() * 3000, q: 8, gain: 0.03 });
      return t > 12;
    }, true).finally(() => sparks.dispose());
    r.lookAt(null);
    r.state.lean = 0.02;
    this.hand[0] = { mode: 'free' };
    this.hand[1] = { mode: 'free' };
    r.face.set('happy', 2);
    this.say(pick(['Nailed it.', 'It works! Mostly.', 'One more screw left over. That’s normal, right?']), 2.4);
    this.setArms('rest');
    await this.wait(1);
    await this.returnToDesk();
    this.setArms('thighs');
  }

  sparks(at) {
    const group = new THREE.Group();
    group.position.copy(at);
    this.room.room.parent.add(group);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.2), toneMapped: false });
    const geo = new THREE.SphereGeometry(0.006, 6, 4);
    const ps = Array.from({ length: 24 }, () => { const m = new THREE.Mesh(geo, mat); m.visible = false; group.add(m); return { m, v: V(), life: 0 }; });
    return {
      update(dt, emit) {
        for (const p of ps) {
          if (p.life <= 0 && emit && Math.random() < 0.3) { p.life = 0.4 + Math.random() * 0.3; p.m.position.set(0, 0, 0); p.v.set((Math.random() - 0.5) * 1.2, Math.random() * 1.4, (Math.random() - 0.5) * 1.2); }
          if (p.life > 0) { p.life -= dt; p.v.y -= 4 * dt; p.m.position.addScaledVector(p.v, dt); }
          p.m.visible = p.life > 0;
        }
      },
      dispose() { group.removeFromParent(); geo.dispose(); mat.dispose(); },
    };
  }

  async mirrorCheck() {
    const r = this.robot;
    await this.goTo('mirror', 'Checking the mirror 🪞');
    r.lookAt(r.root.position.clone().addScaledVector(r.worldForward(V()), 1).add(V(0, 1.55, 0)), 1);
    r.face.set('wink', 1.5);
    this.say(pick(['Looking sharp.', 'Is that a smudge on my visor?', 'Hello, handsome.']), 2.4);
    await this.wait(1.2);
    const right = V(Math.cos(r.heading), 0, -Math.sin(r.heading));
    const fwd = r.worldForward(V());
    let t = 0;
    const q = r.handQuat(V(0, 1, 0).addScaledVector(right, -0.4).normalize(), right.clone().multiplyScalar(-1));
    this.hand[0] = { mode: 'target', target: V(), quat: q, speed: 12, rate: 6 };
    await this.frame((dt) => {
      t += dt;
      const head = r.head.localToWorld(V(0.17, 0.2, 0));
      this.hand[0].target.copy(head).addScaledVector(right, 0.12).add(V(Math.cos(t * 8) * 0.0, Math.sin(t * 8) * 0.035, 0)).addScaledVector(fwd, Math.cos(t * 8) * 0.04);
      if (Math.random() < dt * 2) audio.noise({ dur: 0.1, freq: 2600, q: 2, gain: 0.04 });
      return t > 4;
    }, true);
    this.hand[0] = { mode: 'free' };
    r.face.set('happy', 1.5);
    this.setArms('rest');
    await this.wait(0.8);
    r.lookAt(null);
    await this.returnToDesk();
    this.setArms('thighs');
  }

  async lookAround(name) {
    const r = this.robot;
    const lines = {
      printer: ['Printing a tiny me. 3 hours left.', 'Layer 412 of 9,000.', 'Never watch a 3D print. It never finishes.'],
      livingWindow: ['Nice garden.', 'The trees are doing tree things.', 'I should mow the lawn. Do robots mow?'],
    };
    await this.goTo(name, name === 'printer' ? 'Watching the 3D printer' : 'Looking out at the garden');
    this.setArms('behind');
    r.face.set(name === 'printer' ? 'loading' : 'normal');
    this.say(pick(lines[name]), 2.6);
    const ahead = r.root.position.clone().addScaledVector(r.worldForward(V()), 2).add(V(0, name === 'printer' ? 0.9 : 1.5, 0));
    await this.tween(7, (k) => r.lookAt(ahead.clone().add(V(Math.sin(k * 6) * 0.5, Math.sin(k * 4) * 0.15, 0)), 0.9), true);
    r.lookAt(null);
    this.setArms('rest');
    await this.returnToDesk();
    this.setArms('thighs');
  }

  async frontDoor() {
    const r = this.robot, d = this.house.frontDoor;
    await this.goTo('frontDoor', 'Checking the front door 🚪');
    if (d) { d.target = -1.3; audio.servo(0.5, 0.8); }
    this.setArms('hips');
    r.lookAt(r.root.position.clone().add(V(4, 1.4, 0)), 1);
    this.say(this.world.night > 0.5 ? pick(['Quiet night out there.', 'Hello, moon.']) : pick(['Lovely day!', 'No packages. Again.', 'Fresh air. Well, fresh for my fans.']), 2.6);
    await this.wait(5, true).catch((e) => { if (d) d.target = 0; throw e; });
    if (d) { d.target = 0; audio.servo(0.4, 0.7); }
    r.lookAt(null);
    this.setArms('rest');
    await this.wait(0.8);
    await this.returnToDesk();
    this.setArms('thighs');
  }

  /** Lie on the charging bed. untilMorning: stay until it gets light (or he's needed). */
  async sleep(untilMorning) {
    const r = this.robot, st = r.state;
    await this.goTo('bed', untilMorning ? 'Going to bed 🌙' : 'Taking a nap');
    await this.sitOnSpot(this.spots.bed);
    this.setActivity(untilMorning ? 'Sleeping and charging 💤' : 'Napping 💤');
    this.say(pick(['Goodnight, house.', 'Plugging in…', 'Five more minutes… of charging.']), 2.4);
    this.armTargets = r.arms.map(() => ({ x: 0.62, y: 0.35, z: 0.08, elbow: 1.2, wx: 0, wy: 0, wz: 0 })); // hands resting on his belly
    const l0 = st.lean;
    await this.tween(1.6, (k) => { st.lean = THREE.MathUtils.lerp(l0, -1.15, k); st.headPitch = 0.25 * k; });
    r.face.set('sleepy');
    this.sleptTonight = true;
    let t = 0, z = 2;
    await this.frame((dt) => {
      t += dt;
      r.energy = Math.min(1, r.energy + dt * 0.02);
      r.face.set('sleepy');
      if (t > z) { z = t + 6; this.say('💤', 2.5); }
      return untilMorning ? this.world.night < 0.35 && t > 5 : t > 25;
    }, true); // if he's needed (you open his Mac) he gets up in userMode
    r.face.set('happy', 2);
    this.say(untilMorning ? pick(['Good morning! ☀️', 'Fully charged. Matcha next.']) : 'Refreshed!', 2.4);
    await this.standFromSpot();
    await this.returnToDesk();
    this.setArms('thighs');
  }

  async userMode() {
    const r = this.robot;
    this.pending = null;
    this.mode = 'user';
    this.userOnMac = true;
    this.setActivity('Taking a break while you use the Mac');
    this.screen.setMode('inuse');
    if (this.seated) await this.standFromSpot();
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
