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
  constructor(scene, layout, { say } = {}) {
    const K = layout.kuma;
    this.say = say || (() => {});
    this.base = new THREE.Group();
    this.base.name = 'kuma';
    this.base.position.fromArray(K.chair);
    this.seat = new THREE.Group();
    this.seat.position.y = K.seat;
    this.base.add(this.seat);
    this.robot = new Robot();
    this.seat.add(this.robot.root);
    scene.add(this.base);
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
  react(event) {
    if (event === 'bsod') { this.slam(); this.setMood('angry'); this.say(pick(['NOT AGAIN.', 'IRQL_NOT_LESS_OR_EQUAL?! I’ll show you less or equal.', 'Blue screen. Of course. Of COURSE.', 'I didn’t even save…'])); }
    else if (event === 'update') { this.state = 'wait'; this.setMood('dizzy'); this.say(pick(['“Working on updates. 0% complete.” Sure.', 'It’s updating. Again. I was mid-sentence.', 'Don’t turn off your PC. As if I could leave.'])); }
    else if (event === 'popup') { this.setMood('angry'); this.say(pick(['No, I don’t want to try Edge.', 'Stop recommending OneDrive!', 'Who asked for Candy Crush?', 'I said NOT NOW, Copilot.'])); if (Math.random() < 0.5) this.slam(); }
    else if (event === 'win') { this.cheer = 0; this.setMood('happy'); this.say(pick(['It… compiled? On Windows?', 'IT WORKS!', 'Booted in under five minutes!'])); }
    else { this.state = 'type'; this.setMood('work'); }
  }

  slam() { if (this.rage < 0) this.rage = 0; }

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

  update(dt, time) {
    this.t += dt;
    const R = this.robot;

    // ---- moods drift back to work
    if (this.rage >= 0) { this.rage += dt; if (this.rage > 1.9) { this.rage = -1; if (this.state === 'type') this.setMood('work'); } }
    if (this.cheer >= 0) { this.cheer += dt; if (this.cheer > 2.4) { this.cheer = -1; this.setMood('work'); } }
    this.lean = damp(this.lean, this.state === 'wait' ? 1 : 0, 2.2, dt);
    this.colour.lerp(COL[this.mood] || COL.work, 1 - Math.exp(-dt * 6));
    mats.led.emissive.copy(this.colour);

    // ---- typing rhythm
    const typing = this.state === 'type' && this.rage < 0 && this.cheer < 0;
    this.thinkT -= dt;
    if (this.thinkT < 0) { this.think = this.think > 0.5 ? 0 : 1; this.thinkT = this.think ? 1 + Math.random() * 1.5 : 3 + Math.random() * 5; }
    const think = this.thinkSm = damp(this.thinkSm || 0, this.think, 4, dt);
    this.nextKey -= dt;
    if (typing && think < 0.5 && this.nextKey <= 0) {
      this.nextKey = 0.06 + Math.random() * 0.09;
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
      if (this.prevRage < 0.62 && rt >= 0.62 && this.onSlam) this.onSlam(this.base.localToWorld(new THREE.Vector3(0, 0.76, 0.3)));
    }
    this.prevRage = rt;
    if (this.cheer >= 0) {
      const k = Math.sin(Math.min(1, this.cheer / 2.4) * Math.PI);
      b.chestPitch -= 0.15 * k;
      b.headPitch -= 0.3 * k;
      b.spineRoll += Math.sin(this.cheer * 9) * 0.04 * k;
    }
    R.applyBody(b);
    this.base.updateMatrixWorld(true);

    // ---- arms
    R.chest.getWorldQuaternion(_qc);
    const origin = this.base.position;
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
      target.add(origin);
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
      _a.set(s * 0.13, 0.077 + bounce, 0.44).add(origin);
      footQuat(_qa, _f.set(0, 0, 1), _n.set(0, 1, 0));
      R.solveLeg(i, _a, _pole.set(s * 0.15, 0.4, 1).normalize(), _qa);
    }
    R.update(dt, time, this.colour);
  }
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
export { UP };
