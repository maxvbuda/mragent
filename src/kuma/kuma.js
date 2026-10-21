import * as THREE from 'three';
import { Robot } from './robot.js';
import { mats, moodColours } from './materials.js';
import { handQuat, footQuat } from './ik.js';

/**
 * Kuma: the robot from agent-bot-3d, imported as-is, sitting at a gaming desk in the
 * living room and fighting a Windows PC. This file is only the puppeteer: it poses
 * Kuma's rig (typing, waiting, leaning back, slamming the desk) and swaps visor moods.
 */
const COL = {
  work: moodColours.work, angry: moodColours.angry, chill: moodColours.chill, dizzy: moodColours.dizzy,
  happy: new THREE.Color(0x5dff8a), shocked: new THREE.Color(0xffffff),
};
const UP = new THREE.Vector3(0, 1, 0);
const TAP = 0.13;
const lerp = THREE.MathUtils.lerp;
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const KEYS = ['pelvisY', 'pelvisZ', 'pelvisPitch', 'spinePitch', 'spineYaw', 'spineRoll', 'chestPitch', 'chestYaw', 'chestRoll', 'neckPitch', 'neckYaw', 'headPitch', 'headYaw', 'headRoll'];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3(), _n = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _pole = new THREE.Vector3(), _pb = new THREE.Vector3();

export class Kuma {
  constructor(scene, layout, { say, nav = null, groundY = () => 0, spots = {} } = {}) {
    const K = layout.kuma;
    this.say = say || (() => {});
    Object.assign(this, { nav, groundY, spots, scene });
    // `base` is his chair (it stays put); `mover` is Kuma himself and goes wherever he walks
    this.base = new THREE.Group();
    this.base.name = 'kuma-chair';
    this.base.position.fromArray(K.chair);
    scene.add(this.base);
    this.mover = new THREE.Group();
    this.mover.name = 'kuma';
    this.mover.position.fromArray(K.chair);
    this.seat = new THREE.Group();
    this.seat.position.y = K.seat;
    this.mover.add(this.seat);
    this.robot = new Robot();
    this.seat.add(this.robot.root);
    scene.add(this.mover);
    // standing / walking
    this.stand = 0;          // 0 seated at the desk .. 1 standing
    this.gait = 0;           // 0 still .. 1 walking
    this.phase = 0;
    this.carry = 0;          // 0 .. 1 holding a parcel in front of him
    this.crouch = 0;         // bending down to pick something up
    this.seatedAt = 'desk';  // 'desk' | spot name | null (standing)
    this.tasks = new Set();
    this.speed = 0;
    this.hipDrop = null;
    this.robot.root.traverse((o) => { if (o.isMesh) o.userData.kuma = true; });
    this.meshes = [];
    this.robot.root.traverse((o) => { if (o.isMesh) this.meshes.push(o); });

    this.mood = 'work';
    this.colour = COL.work.clone();
    this.t = 0;
    this.press = [[0, 0, 0, 0], [0, 0, 0, 0]];
    this.thumb = [0, 0];
    this.nextKey = 0;
    this.offset = [new THREE.Vector3(), new THREE.Vector3()];
    this.goal = [new THREE.Vector3(), new THREE.Vector3()];
    this.think = 0;
    this.thinkT = 3;
    this.state = 'type'; // type | wait | rage | cheer
    this.stateT = 0;
    this.lean = 0;
    this.rage = -1; // time into a desk slam, -1 = none
    this.cheer = -1;
    this.onSlam = null;
    this.body = Object.fromEntries(KEYS.map((k) => [k, 0]));
  }

  setMood(m) {
    this.mood = m;
    this.robot.visor.setMood(m === 'happy' || m === 'shocked' ? m : m);
  }

  /** What the Windows PC is doing to him: 'work' | 'update' | 'bsod' | 'popup' | 'win'. */
  react(event, data) {
    if (event === 'bsod') { this.slam(); this.setMood('angry'); this.say(pick(['NOT AGAIN.', 'IRQL_NOT_LESS_OR_EQUAL?! I’ll show you less or equal.', 'Blue screen. Of course. Of COURSE.', 'I didn’t even save…'])); }
    else if (event === 'update') { this.state = 'wait'; this.setMood('dizzy'); this.say(pick(['“Working on updates. 0% complete.” Sure.', 'It’s updating. Again. I was mid-sentence.', 'Don’t turn off your PC. As if I could leave.'])); }
    else if (event === 'popup') {
      const app = data?.app || '';
      const lines = {
        'Microsoft Edge': ['No, I don’t want to try Edge.', 'EDGE. AGAIN.'], OneDrive: ['Stop recommending OneDrive!', 'I don’t WANT my files in the cloud!'], Copilot: ['I said NOT NOW, Copilot.'],
        'Microsoft Store': ['Who asked for Candy Crush?'], 'Windows Security': ['Defender quarantined my CODE?!', 'My own program is a trojan now?'], Printers: ['I don’t even OWN a printer!'],
        Recall: ['Stop screenshotting me!', 'Recall, please forget everything.'], 'PC Health Check': ['I’m ON Windows 11!'], Outlook: ['Where did classic Outlook go?!'], USB: ['I didn’t plug anything in!'],
        Xbox: ['I never signed up for Game Pass!'], Windows: ['I FINISHED setting it up!'], Bing: ['Nobody uses Bing on purpose.'],
      }[app] || ['Not another pop-up.', 'Close. CLOSE.'];
      this.setMood('angry');
      this.say(pick(lines));
      if (Math.random() < 0.5) this.slam();
    }
    else if (event === 'linux') { this.state = 'type'; this.cheer = 0; this.setMood('happy'); this.say(pick(['Linux. Sweet, sweet Linux.', 'No updates. No pop-ups. I could cry.', 'Is this what peace feels like?'])); }
    else if (event === 'win') { this.cheer = 0; this.setMood('happy'); this.say(pick(['It… compiled? On Windows?', 'IT WORKS!', 'Booted in under five minutes!'])); }
    else { this.state = 'type'; this.setMood('work'); }
  }

  slam() { if (this.rage < 0 && this.atDesk) this.rage = 0; }

  /** Something his AI decided to do. */
  act(action, mood) {
    clearTimeout(this.actTimer);
    if (mood) this.setMood(mood);
    if (action === 'slam_desk') this.slam();
    else if (action === 'cheer') this.cheer = 0;
    else if (action === 'lean_back') { this.state = 'wait'; this.actTimer = setTimeout(() => { this.state = 'type'; this.setMood('work'); }, 9000); }
    else if (action === 'back_to_work') { this.state = 'type'; this.setMood('work'); }
    else if (action === 'restart_pc') { this.state = 'wait'; this.setMood('dizzy'); }
    if (action !== 'lean_back' && action !== 'restart_pc') this.actTimer = setTimeout(() => { if (this.state === 'type' && this.rage < 0 && this.cheer < 0) this.setMood('work'); }, 4000);
  }

  poke() {
    this.setMood(pick(['shocked', 'angry']));
    this.say(pick(['Not now, I’m fighting Windows.', 'Do you know how to turn off automatic updates? Anyone?', 'Mr. Agent has a Mac. Must be nice.', 'Shh. It’s at 99%. Don’t jinx it.', 'I’m Kuma. I used to have a nice laptop.']));
    setTimeout(() => { if (this.state === 'type' && this.rage < 0) this.setMood('work'); }, 2200);
  }

  userTakesOver() {
    this.state = 'wait';
    this.setMood('chill');
    this.say(pick(['Fine. YOU fix it.', 'Be my guest. Watch out for Edge.', 'Good luck. It’s been updating since Tuesday.']));
  }

  userLeaves() {
    this.state = 'type';
    this.setMood('work');
    this.say(pick(['What did you DO to it?', 'Thanks… I think?', 'Why is Candy Crush open?']));
  }

  // ------------------------------------------------------------ a tiny scheduler for walking about
  frame(fn) { return new Promise((resolve) => this.tasks.add({ fn, resolve })); }
  wait(s) { return this.frame((dt) => (s -= dt) <= 0); }
  tween(dur, fn) { let t = 0; return this.frame((dt) => { t += dt; const k = Math.min(1, t / dur); fn(ease(k), k); return k >= 1; }); }

  get busy() { return !!this.job; }
  get atDesk() { return this.seatedAt === 'desk' && this.stand < 0.01; }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.mover.rotation.y), 0, Math.cos(this.mover.rotation.y)); }

  /** Run one errand at a time (walk somewhere, fetch a parcel…). */
  run(name, fn) {
    // errands queue up behind each other
    const go = async () => {
      this.job = name;
      try { await fn(); } catch (e) { console.error(e); } finally { this.job = null; }
    };
    this.chain = (this.chain || Promise.resolve()).then(go);
    return this.chain;
  }

  standPoint() { return this.base.position.clone().add(new THREE.Vector3(-0.62, 0, -0.08)); }

  async standUp() {
    if (this.stand > 0.99) return;
    const from = this.mover.position.clone(), to = this.seatedAt === 'desk' ? this.standPoint() : from.clone().addScaledVector(this.forward(), 0.3);
    const h0 = this.mover.rotation.y, h1 = this.seatedAt === 'desk' ? -Math.PI / 2 : h0;
    this.state = 'type';
    await this.tween(1.3, (k) => {
      this.stand = k;
      this.mover.position.lerpVectors(from, to, k);
      this.mover.rotation.y = lerp(h0, h1, k);
    });
    this.seatedAt = null;
  }

  async sitDown(where = 'desk') {
    const spot = where === 'desk' ? null : this.spots[where];
    const seatPos = where === 'desk' ? this.base.position.clone() : spot.pos.clone().addScaledVector(dirOf(spot.heading), -0.26);
    const heading = where === 'desk' ? 0 : spot.heading + Math.PI;
    const approach = where === 'desk' ? this.standPoint() : seatPos.clone().addScaledVector(new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), 0.3);
    await this.walkTo(approach);
    const from = this.mover.position.clone(), h0 = this.mover.rotation.y;
    let h1 = heading;
    h1 = h0 + Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    await this.tween(1.3, (k) => {
      this.stand = 1 - k;
      this.mover.position.lerpVectors(from, seatPos, k);
      this.mover.rotation.y = lerp(h0, h1, k);
    });
    this.seatOffset = where === 'desk' ? 0 : (spot.seat ?? 0.45) - 0.46;
    this.seatedAt = where;
    if (where !== 'desk') { this.state = 'wait'; this.setMood('chill'); } // lounging
  }

  /** Walk along a path from the nav grid to `to` (a Vector3 on the floor). */
  async walkTo(to) {
    const pts = this.nav ? this.nav.find(this.mover.position.clone().setY(0), to.clone().setY(0)).slice(1) : [to];
    for (const p of pts) {
      await this.frame((dt) => {
        const pos = this.mover.position;
        const d = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (d < 0.03) { pos.x = p.x; pos.z = p.z; return true; }
        const want = Math.atan2(p.x - pos.x, p.z - pos.z);
        const dh = Math.atan2(Math.sin(want - this.mover.rotation.y), Math.cos(want - this.mover.rotation.y));
        this.mover.rotation.y += dh * (1 - Math.exp(-dt * 6));
        const sp = 0.7 * Math.max(0.1, Math.cos(dh));
        const step = Math.min(d, sp * dt);
        pos.x += ((p.x - pos.x) / d) * step;
        pos.z += ((p.z - pos.z) / d) * step;
        this.speed = sp;
        return false;
      });
    }
    this.speed = 0;
  }

  async turnTo(h) {
    const h0 = this.mover.rotation.y;
    const h1 = h0 + Math.atan2(Math.sin(h - h0), Math.cos(h - h0));
    await this.tween(0.6, (k) => { this.mover.rotation.y = lerp(h0, h1, k); });
  }

  /** Go somewhere by name (a spot shared with Mr. Agent) and maybe sit there. */
  goTo(name) {
    return this.run(`going to ${name}`, async () => {
      const spot = this.spots[name];
      if (!spot) return;
      if (this.seatedAt) await this.standUp();
      if (spot.seat) await this.sitDown(name);
      else { await this.walkTo(spot.pos); await this.turnTo(spot.heading + Math.PI); }
      // after a while out there, Windows calls him back
      clearTimeout(this.returnTimer);
      this.returnTimer = setTimeout(() => { if (!this.job && this.seatedAt !== 'desk') { this.say(pick(['Fresh air: done. Back to the suffering.', 'I should check if it finished updating.'])); this.backToDesk(); } }, 45000);
    });
  }

  /** Walk over to a point and face `lookAt`. */
  goToPoint(pos, lookAt) {
    return this.run('walking over', async () => {
      if (this.seatedAt) await this.standUp();
      await this.walkTo(pos);
      if (lookAt) await this.turnTo(Math.atan2(lookAt.x - this.mover.position.x, lookAt.z - this.mover.position.z));
    });
  }

  backToDesk() {
    return this.run('back to the desk', async () => {
      if (this.seatedAt === 'desk') return;
      if (this.seatedAt) await this.standUp();
      await this.sitDown('desk');
      this.state = 'type';
      this.setMood('work');
    });
  }

  /** Walk out to the porch, carry the parcel back and unbox it next to the desk. */
  fetch(order, delivery) {
    return this.run('fetching a parcel', async () => {
      if (this.seatedAt) await this.standUp();
      const box = delivery.parcelFor(order)?.g;
      if (!box) return;
      this.say(pick(['A parcel? For ME?', 'Finally, something that isn’t a Windows update.', 'Ooh, a delivery!']));
      await this.walkTo(box.position.clone().addScaledVector(new THREE.Vector3(-1, 0, 0), 0.62));
      await this.turnTo(Math.atan2(box.position.x - this.mover.position.x, box.position.z - this.mover.position.z));
      await this.tween(0.7, (k) => { this.crouch = k; });
      delivery.take(order);
      this.mover.attach(box);
      await this.tween(0.6, (k) => {
        this.crouch = 1 - k;
        this.carry = k;
        box.position.lerp(new THREE.Vector3(0, 0.97, 0.42), k);
        box.quaternion.slerp(new THREE.Quaternion(), k);
      });
      await this.walkTo(this.standPoint().add(new THREE.Vector3(0, 0, -0.55)));
      await this.turnTo(Math.PI / 2);
      await this.tween(0.7, (k) => { this.crouch = k; this.carry = 1 - k; box.position.y = lerp(0.97, 0.05, k); });
      this.scene.attach(box);
      box.position.y = this.groundY(box.position.x, box.position.z);
      await this.tween(0.4, (k) => { this.crouch = 1 - k; });
      await delivery.unbox(order, 'kuma', (dur, fn) => this.tween(dur, (e, k) => fn(k)));
      await this.sitDown('desk');
      this.state = 'type';
    });
  }

  update(dt, time) {
    this.t += dt;
    const R = this.robot;
    for (const task of [...this.tasks]) if (task.fn(dt)) { this.tasks.delete(task); task.resolve(); }
    if (this.stand > 0.001) this.mover.position.y = this.groundY(this.mover.position.x, this.mover.position.z) + (this.seatedAt && this.seatedAt !== 'desk' ? this.seatOffset * (1 - this.stand) : 0);
    else this.mover.position.y = this.seatedAt && this.seatedAt !== 'desk' ? this.groundY(this.mover.position.x, this.mover.position.z) + this.seatOffset : this.base.position.y;
    this.gait = damp(this.gait, this.speed > 0.05 ? 1 : 0, 6, dt);
    if (this.gait > 0.01) this.phase = (this.phase + dt / 0.95) % 1;

    // ---- moods drift back to work
    if (this.rage >= 0) { this.rage += dt; if (this.rage > 1.9) { this.rage = -1; if (this.state === 'type') this.setMood('work'); } }
    if (this.cheer >= 0) { this.cheer += dt; if (this.cheer > 2.4) { this.cheer = -1; this.setMood('work'); } }
    this.lean = damp(this.lean, this.state === 'wait' ? 1 : 0, 2.2, dt);
    this.colour.lerp(COL[this.mood] || COL.work, 1 - Math.exp(-dt * 6));
    mats.led.emissive.copy(this.colour);

    // ---- typing rhythm
    const typing = this.state === 'type' && this.rage < 0 && this.cheer < 0 && this.atDesk;
    this.thinkT -= dt;
    if (this.thinkT < 0) { this.think = this.think > 0.5 ? 0 : 1; this.thinkT = this.think ? 1 + Math.random() * 1.5 : 3 + Math.random() * 5; }
    const think = this.thinkSm = damp(this.thinkSm || 0, this.think, 4, dt);
    this.nextKey -= dt;
    if (typing && think < 0.5 && this.nextKey <= 0) {
      this.nextKey = (0.06 + Math.random() * 0.09) * (this.typeBoost ? 0.55 : 1);
      const i = Math.random() < 0.5 ? 0 : 1;
      if (Math.random() < 0.12) this.thumb[i] = 1e-4;
      else this.press[i][Math.floor(Math.random() * 4)] = 1e-4;
      this.goal[i].set((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.03);
    }

    // ---- body
    const breathe = Math.sin(time * 1.7) * 0.012;
    const work = {
      pelvisY: 0, pelvisZ: 0.02, pelvisPitch: 0.03, spinePitch: 0.08 + breathe - think * 0.05, spineYaw: Math.sin(time * 0.37) * 0.03, spineRoll: 0,
      chestPitch: 0.06 + breathe * 0.6, chestYaw: Math.sin(time * 0.53) * 0.025, chestRoll: Math.sin(time * 0.41) * 0.015,
      neckPitch: 0.1 - think * 0.08, neckYaw: Math.sin(time * 0.31) * 0.06 + think * 0.12,
      headPitch: 0.24 - think * 0.3 + Math.sin(time * 2.1) * 0.01, headYaw: Math.sin(time * 0.23) * 0.05 + think * 0.1, headRoll: think * 0.16 + Math.sin(time * 0.7) * 0.015,
    };
    const wait = {
      pelvisY: -0.01, pelvisZ: 0.07, pelvisPitch: -0.1, spinePitch: -0.1 + breathe * 0.5, spineYaw: 0, spineRoll: 0.03,
      chestPitch: -0.1, chestYaw: 0.06, chestRoll: 0.02, neckPitch: 0.06, neckYaw: 0.1,
      headPitch: -0.04 + Math.sin(time * 0.5) * 0.04, headYaw: 0.22 + Math.sin(time * 0.4) * 0.05, headRoll: -0.08 + Math.sin(time * 0.9) * 0.03,
    };
    const b = this.body;
    for (const k of KEYS) b[k] = lerp(work[k], wait[k], ease(this.lean));
    const rt = this.rage;
    let slamK = 0, windK = 0;
    if (rt >= 0) {
      windK = rt < 0.45 ? ease(rt / 0.45) : rt < 0.62 ? 1 - ease((rt - 0.45) / 0.17) : 0;
      slamK = rt < 0.45 ? 0 : rt < 0.62 ? ease((rt - 0.45) / 0.17) : rt < 1.4 ? 1 : 1 - ease(Math.min(1, (rt - 1.4) / 0.5));
      b.chestPitch += windK * -0.12 + slamK * 0.16;
      b.spinePitch += slamK * 0.06;
      b.headPitch += slamK * 0.2;
      const shake = rt > 0.62 && rt < 1.4 ? 0.014 : 0;
      b.chestRoll += Math.sin(time * 47) * shake;
      b.headRoll += Math.sin(time * 53) * shake;
      if (this.prevRage < 0.62 && rt >= 0.62 && this.onSlam) this.onSlam(this.mover.localToWorld(new THREE.Vector3(0, 0.76, 0.3)));
    }
    this.prevRage = rt;
    if (this.cheer >= 0) {
      const k = Math.sin(Math.min(1, this.cheer / 2.4) * Math.PI);
      b.chestPitch -= 0.15 * k;
      b.headPitch -= 0.3 * k;
      b.spineRoll += Math.sin(this.cheer * 9) * 0.04 * k;
    }
    // standing up / walking / bending down
    if (this.hipDrop === null) {
      this.mover.updateMatrixWorld(true);
      const root = R.root.getWorldPosition(new THREE.Vector3()), hip = R.legs[0].thigh.getWorldPosition(new THREE.Vector3());
      this.hipDrop = root.y - hip.y;
    }
    const u = ease(this.stand);
    if (u > 0.001) {
      const g = this.gait, ph = this.phase;
      const standY = 0.87 + this.hipDrop - 0.57 - this.crouch * 0.28 - 0.012 * g + 0.014 * g * Math.cos(ph * Math.PI * 4);
      const st = { pelvisY: standY, pelvisZ: 0, pelvisPitch: 0, spinePitch: 0.02 + this.crouch * 0.35, spineYaw: 0.06 * g * Math.sin(ph * Math.PI * 2), spineRoll: 0.03 * g * Math.sin(ph * Math.PI * 2),
        chestPitch: 0.02 + this.crouch * 0.25, chestYaw: -0.08 * g * Math.sin(ph * Math.PI * 2), chestRoll: 0, neckPitch: 0.04, neckYaw: 0, headPitch: 0.04 + this.crouch * 0.2, headYaw: 0, headRoll: 0 };
      for (const k of KEYS) b[k] = lerp(b[k], st[k], u);
    }
    if (this.seatedAt && this.seatedAt !== 'desk') { b.spinePitch -= 0.12; b.chestPitch -= 0.08; b.headPitch -= 0.1; } // lounging on a bench
    R.applyBody(b);
    this.mover.updateMatrixWorld(true);
    this.base.updateMatrixWorld(true);

    // ---- arms
    R.chest.getWorldQuaternion(_qc);
    const M = this.mover.matrixWorld;
    const mq = this.mover.quaternion;
    const u2 = ease(this.stand);
    for (let i = 0; i < 2; i++) {
      const s = R.arms[i].side;
      const taps = [0, 0, 0, 0];
      let tapSum = 0;
      for (let f = 0; f < 4; f++) {
        const p = this.press[i];
        if (p[f] > 0) { p[f] += dt; if (p[f] > TAP) p[f] = 0; }
        taps[f] = p[f] > 0 ? Math.sin((Math.PI * p[f]) / TAP) : 0;
        tapSum += taps[f];
      }
      let thumbTap = 0;
      if (this.thumb[i] > 0) { this.thumb[i] += dt; if (this.thumb[i] > TAP) this.thumb[i] = 0; thumbTap = this.thumb[i] > 0 ? Math.sin((Math.PI * this.thumb[i]) / TAP) : 0; }
      this.offset[i].x = damp(this.offset[i].x, this.goal[i].x, 10, dt);
      this.offset[i].z = damp(this.offset[i].z, this.goal[i].z, 10, dt);

      // typing: wrists over the keyboard
      const target = _a.set(s * 0.085, 0.83 + think * 0.012 - tapSum * 0.003, 0.285).add(this.offset[i]);
      handQuat(_qa, _f.set(-s * 0.12, -0.22, 1), _n.set(s * 0.15, -1, 0));
      _pole.set(s * 0.6, -0.6, -0.5).applyQuaternion(_qc);

      // waiting: hands behind the head
      const w = ease(this.lean);
      if (w > 0.001) {
        _b.set(s * 0.13, 0.98 + 0.02 * Math.sin(time), -0.12);
        handQuat(_qb, _f.set(-s, 0.3, 0.05), _n.set(0, 0.1, 1));
        _pb.set(s, 0.35, 0.3).applyQuaternion(_qc);
        target.lerp(_b, w).add(_c.set(s * 0.18, 0.15, 0).multiplyScalar(Math.sin(Math.PI * w)));
        _qa.slerp(_qb, w);
        _pole.lerp(_pb, w);
      }
      // rage: fists up, then down on the desk
      if (rt >= 0) {
        _b.set(s * 0.3, 1.25, 0.05);
        _c.set(s * 0.3, 0.8, 0.32);
        handQuat(_qb, _f.set(0, 0.8, -0.3), _n.set(-s, 0, 0));
        target.lerp(_b, windK).lerp(_c, slamK);
        if (rt > 0.62 && rt < 0.8) target.y += 0.03 * Math.sin((Math.PI * (rt - 0.62)) / 0.18);
        _qa.slerp(handQuat(_qb, _f.set(0, slamK > 0.5 ? -0.25 : 0.8, slamK > 0.5 ? 1 : -0.3), _n.set(-s, 0, 0)), Math.max(windK, slamK));
        _pole.lerp(_pb.set(s * 0.8, 0.3, -0.5), Math.max(windK, slamK));
      }
      // cheer: arms up
      if (this.cheer >= 0) {
        const k = Math.sin(Math.min(1, this.cheer / 2.4) * Math.PI);
        _b.set(s * 0.35, 1.55 + Math.sin(this.cheer * 12) * 0.03, 0.05);
        target.lerp(_b, k);
        _qa.slerp(handQuat(_qb, _f.set(s * 0.2, 1, 0), _n.set(0, 0, 1)), k);
        _pole.lerp(_pb.set(s, -0.2, -0.3), k);
      }
      _qa.premultiply(mq); // the poses above are built facing his desk; turn them with him
      // standing: arms swing by his sides, or hold the parcel out in front
      if (u2 > 0.001) {
        const sw = 0.16 * this.gait * Math.cos((this.phase + (i ? 0.5 : 0)) * Math.PI * 2);
        const rootY = 0.4 + 0.17 + b.pelvisY;
        _b.set(s * 0.3, rootY + 0.06, sw).lerp(_c.set(s * 0.19, 1.1, 0.4), this.carry);
        _b.y -= this.crouch * 0.2;
        _qb.copy(handQuat(_qb, _f.set(0, -1, 0.15 + sw).lerp(_n.set(0, 0, 1), this.carry).normalize().applyQuaternion(mq), _n.set(-s, 0, 0).applyQuaternion(mq)));
        target.lerp(_b, u2);
        _qa.slerp(_qb, u2);
        _pole.lerp(_pb.set(s * 0.6, -0.2, -0.8).applyQuaternion(mq), u2);
      }
      target.applyMatrix4(M);
      R.solveArm(i, target, _pole, _qa);
      const fist = Math.max(windK, slamK, this.cheer >= 0 ? 0.6 : 0);
      R.setFingers(i, {
        curl: Math.max(0.12 + think * 0.15, fist) * (1 - w) + 0.45 * w,
        taps: typing ? taps : null, spread: lerp(0.35, 0.1, w), thumb: Math.max(lerp(0.1, 0.35, w), fist), thumbTap: typing ? thumbTap : 0,
      });
    }

    // ---- legs: feet flat on the floor
    for (let i = 0; i < 2; i++) {
      const s = R.legs[i].side;
      const bounce = this.state === 'wait' && i === 0 ? Math.max(0, Math.sin(time * 9)) * 0.02 : 0;
      _a.set(s * 0.13, 0.077 + bounce, 0.44);
      if (u2 > 0.001) {
        // planted feet with a simple stepping gait (stride along his forward axis)
        const p = (this.phase + i * 0.5) % 1, D = Math.min(0.4, this.speed * 0.95 * 0.5) * this.gait;
        let off = 0, lift = 0;
        if (p < 0.5) off = D * (0.5 - p / 0.5);
        else { const t = (p - 0.5) / 0.5; off = D * (-0.5 + t * t * (3 - 2 * t)); lift = 0.08 * Math.sin(Math.PI * t) * this.gait; }
        _a.lerp(_b.set(s * 0.12, 0.077 + lift, off + 0.02), u2);
      }
      _a.applyMatrix4(M);
      if (this.seatedAt && this.seatedAt !== 'desk') _a.y = this.groundY(_a.x, _a.z) + 0.077; // feet on the ground, not the seat
      footQuat(_qa, _f.set(0, 0, 1).applyQuaternion(mq), _n.set(0, 1, 0));
      R.solveLeg(i, _a, _pole.set(s * 0.15, 0.4, 1).applyQuaternion(mq).normalize(), _qa);
    }
    R.update(dt, time, this.colour);
  }
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
/** Mr. Agent's heading convention (0 = facing -z) to a direction. */
function dirOf(h) { return new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h)); }
export { UP };
