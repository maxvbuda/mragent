import * as THREE from 'three';

/**
 * Punching Mr. Agent. Every hit sparks and staggers him; enough of them and parts come
 * off for real: first the chest plate (showing the wiring, core and boards modelled in
 * FreeCAD), then the backpack, an arm, and finally his head, at which point he collapses.
 * Loose parts tumble with a little rigid-body-ish physics. Repair flies them back on.
 */
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const G = 9.8;

const OUCH = [
  ['Ow!', 'Hey!', 'What was that for?!', 'Ouch. My chassis!', 'I felt that in my firmware.'],
  ['Please stop, I bruise. Digitally.', 'That’s going in my logs.', 'I’m filing a bug report about you.', 'HR! HR!'],
  ['My chest plate! That was load-bearing!', 'You can see my insides now. Rude.', 'Is that… my core? Don’t look!'],
  ['Warning: structural integrity 40%.', 'I can hear my wires fizzing.', 'Running on backup power…'],
  ['My ARM! I was using that!', 'I’ll need a hand. Literally.', 'That was my typing arm!'],
  ['C-c-critical failure…', 'Tell Kuma… he can have my Mac…', 'I… regret… nothing… except Windows…'],
];

export class Damage {
  constructor({ scene, robot, brain, audio, hooks = {}, bounds }) {
    Object.assign(this, { scene, robot, brain, audio, hooks });
    this.bounds = bounds || [-9, -8.5, 8.5, 2.96];
    this.hits = 0;
    this.broken = false;
    this.bodies = [];
    this.emitters = [];
    this.lost = []; // parts that came off: { obj, parent, pos, quat, onBack }
    this.buildParticles();
  }

  get integrity() { return Math.max(0, 1 - this.hits / 9); }

  // ------------------------------------------------------------ particles: sparks (points) + smoke (sprites)
  buildParticles() {
    const N = 600;
    this.sp = { N, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.sp.pos, 3));
    this.sparkPts = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(5, 3.2, 1.2), size: 0.022, toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparkPts.frustumCulled = false;
    this.scene.add(this.sparkPts);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(90,90,95,0.55)');
    grd.addColorStop(1, 'rgba(90,90,95,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.smoke = Array.from({ length: 36 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.scene.add(s);
      return { s, v: V(), life: 0, max: 1 };
    });
  }

  burst(at, n = 30, speed = 2.2, dir = null) {
    const { pos, vel, life, N } = this.sp;
    for (let k = 0; k < n; k++) {
      const i = this.sp.next = (this.sp.next + 1) % N;
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      const d = V(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      if (dir) d.addScaledVector(dir, 0.8).normalize();
      const sp = speed * (0.3 + Math.random());
      vel[i * 3] = d.x * sp; vel[i * 3 + 1] = d.y * sp + 0.6; vel[i * 3 + 2] = d.z * sp;
      life[i] = 0.3 + Math.random() * 0.5;
    }
  }

  puff(at, size = 0.25) {
    const p = this.smoke.find((q) => q.life <= 0);
    if (!p) return;
    p.s.position.copy(at);
    p.v.set((Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.25, (Math.random() - 0.5) * 0.15);
    p.life = p.max = 1.6 + Math.random();
    p.size = size;
    p.s.visible = true;
  }

  // ------------------------------------------------------------ punching
  /** A punch landing at `point` (world), travelling along `dir`. `obj` is the mesh that was hit. */
  punch(point, dir, obj) {
    const a = this.audio;
    a.punch();
    this.burst(point, 26, 2.4, dir.clone().negate());
    this.hooks.shake?.(0.06);
    // punching a part that's already lying on the floor just knocks it about
    const body = this.bodies.find((b) => obj && isInside(obj, b.obj));
    if (body) { body.v.addScaledVector(dir, 2.5).add(V(0, 1.5, 0)); body.w.add(V(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4)); body.rest = false; a.clank(); return; }
    if (this.broken) {
      const other = this.robot.arms.find((x) => !x.detached);
      if (other && Math.random() < 0.5) this.detachArm(other, dir);
      else this.say(pick(['…', '*bzzt*', '…ow…']));
      return;
    }
    this.hits++;
    const h = this.hits;
    const r = this.robot;
    this.brain.hurt(dir, Math.min(1, 0.4 + h * 0.08));
    r.face.glitch = Math.min(0.9, h * 0.1);
    if (h % 2 === 0) r.face.crack();
    let stage = h < 3 ? 0 : 1;
    if (h === 3) { this.knockOff(r.chestPlate, dir, { spin: 7, up: 2.2 }); stage = 2; a.clank(1.2); this.emitters.push({ at: () => r.torso.localToWorld(V(0, 0.3, -0.07)), rate: 3, smoke: 0 }); }
    if (h === 5) { this.knockOff(r.backpack, dir.clone().negate(), { spin: 5, up: 1.6 }); stage = 3; a.clank(); this.emitters.push({ at: () => r.torso.localToWorld(V(0, 0.25, 0.1)), rate: 1, smoke: 1.2 }); }
    if (h === 7) {
      // the arm on the side that was hit
      const right = V(Math.cos(r.heading), 0, -Math.sin(r.heading));
      const local = point.clone().sub(r.root.position).dot(right);
      const arm = r.arms.find((x) => !x.detached && Math.sign(x.s) === Math.sign(local || 1)) || r.arms.find((x) => !x.detached);
      if (arm) this.detachArm(arm, dir);
      stage = 4;
    }
    if (h >= 9) {
      this.knockOff(r.head, dir, { spin: 9, up: 3.2 });
      r.headDetached = true;
      this.emitters.push({ at: () => r.neck.localToWorld(V(0, 0.07, 0)), rate: 5, smoke: 0.8 });
      stage = 5;
      this.broken = true;
      a.powerDown();
      this.brain.command({ type: 'broken' });
      this.hooks.onBroken?.();
    }
    this.say(pick(OUCH[stage]));
    this.hooks.onHit?.(h, this.integrity);
  }

  detachArm(arm, dir) {
    this.knockOff(arm.shoulder, dir, { spin: 6, up: 2.4, onBack: () => { arm.detached = false; } });
    arm.detached = true;
    if (this.brain.holdingMug !== null && this.robot.arms[this.brain.holdingMug] === arm) this.brain.dropMug?.();
    const side = arm.s, A = this.robot.L.arm;
    this.emitters.push({ at: () => this.robot.torso.localToWorld(V(side * A.shoulder[0], A.shoulder[1], A.shoulder[2])), rate: 4, smoke: 0.4 });
    this.audio.clank(1.3);
  }

  knockOff(obj, dir, { spin = 6, up = 2, onBack = null } = {}) {
    if (this.lost.some((l) => l.obj === obj)) return;
    this.lost.push({ obj, parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone(), onBack });
    this.scene.attach(obj);
    // bounding box in the part's own frame: its 8 corners are what touch the floor
    obj.updateWorldMatrix(true, true);
    const inv = obj.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld)));
    });
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(V(x, y, z));
    const v = dir.clone().setY(0).normalize().multiplyScalar(1.6 + Math.random()).add(V(0, up, 0));
    const w = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spin);
    this.bodies.push({ obj, v, w, corners, centre: box.getCenter(V()), rest: false, quiet: 0 });
    this.burst(obj.getWorldPosition(V()), 40, 3);
    this.puff(obj.getWorldPosition(V()), 0.35);
  }

  say(t) { this.brain.say(t, 2.6); }

  // ------------------------------------------------------------ repair
  async repair() {
    if (!this.hits && !this.lost.length) return;
    this.audio.powerUp();
    const parts = this.lost.splice(0);
    this.bodies = [];
    this.emitters = [];
    this.hits = 0;
    const r = this.robot;
    r.face.glitch = 0;
    r.face.cracks = [];
    const moves = parts.map((l) => {
      l.parent.attach(l.obj);
      return { ...l, p0: l.obj.position.clone(), q0: l.obj.quaternion.clone() };
    });
    await new Promise((resolve) => {
      let t = 0;
      this.repairing = (dt) => {
        t += dt;
        const k = Math.min(1, t / 1.3);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        for (const m of moves) {
          m.obj.position.lerpVectors(m.p0, m.pos, e);
          m.obj.position.y += Math.sin(k * Math.PI) * 0.35 * (m.p0.distanceTo(m.pos) > 0.5 ? 1 : 0.2);
          m.obj.quaternion.slerpQuaternions(m.q0, m.quat, e);
        }
        if (k >= 1) { this.repairing = null; resolve(); }
      };
    });
    for (const m of moves) m.onBack?.();
    r.headDetached = false;
    this.broken = false;
    this.brain.repaired();
    this.hooks.onRepaired?.();
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.repairing?.(dt);
    const [x0, z0, x1, z1] = this.bounds;
    const up = V(0, 1, 0), tmpC = V(), cw = V(), rc = V();
    for (const b of this.bodies) {
      if (b.rest) continue;
      const o = b.obj;
      b.v.y -= G * dt;
      o.position.addScaledVector(b.v, dt);
      const ang = b.w.length();
      if (ang > 1e-4) o.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(b.w.clone().divideScalar(ang), ang * dt));
      o.updateMatrixWorld();
      // floor contact through the box corners: push out, bounce, and let the contact torque tip it over
      let minY = Infinity, low = null, touching = 0;
      for (const c of b.corners) {
        tmpC.copy(c).applyMatrix4(o.matrixWorld);
        if (tmpC.y < minY) { minY = tmpC.y; low = low ? low.copy(tmpC) : tmpC.clone(); }
      }
      for (const c of b.corners) if (tmpC.copy(c).applyMatrix4(o.matrixWorld).y < minY + 0.012) touching++;
      if (minY < 0) {
        o.position.y -= minY;
        cw.copy(b.centre).applyMatrix4(o.matrixWorld);
        rc.subVectors(low, cw);
        if (b.v.y < -0.6) { this.audio.clank(Math.min(1, -b.v.y / 4)); this.burst(low, 6, 1); }
        const impact = Math.max(0, -b.v.y);
        b.v.y = impact * 0.3;
        b.v.x *= 0.7; b.v.z *= 0.7;
        // normal force at the contact point -> spin about the centre (topples parts standing on an end)
        b.w.multiplyScalar(0.75).add(rc.clone().cross(up).multiplyScalar(-(impact * 3 + G * dt * 18)));
        if (touching >= 4) b.w.multiplyScalar(0.5);
        if (b.v.length() < 0.12 && b.w.length() < 0.4 && touching >= 3) { if ((b.quiet += dt) > 0.3) b.rest = true; } else b.quiet = 0;
      }
      const p = o.position;
      if (p.x < x0 + 0.2 || p.x > x1 - 0.2) { b.v.x *= -0.4; p.x = THREE.MathUtils.clamp(p.x, x0 + 0.2, x1 - 0.2); }
      if (p.z < z0 + 0.2 || p.z > z1 - 0.2) { b.v.z *= -0.4; p.z = THREE.MathUtils.clamp(p.z, z0 + 0.2, z1 - 0.2); }
    }
    // fizzing wires
    for (const e of this.emitters) {
      if (Math.random() < e.rate * dt) {
        const at = e.at();
        this.burst(at, 6 + Math.floor(Math.random() * 10), 1.4);
        if (Math.random() < 0.4) this.audio.zap(0.5);
        if (this.robot.mat.core) this.robot.mat.core.emissiveIntensity = Math.random() < 0.5 ? 0.5 : 9;
      }
      if (e.smoke && Math.random() < e.smoke * dt) this.puff(e.at(), 0.22);
    }
    if (this.broken) this.robot.mat.core.emissiveIntensity = Math.max(0.2, this.robot.mat.core.emissiveIntensity * (1 - dt * 2));
    else if (!this.emitters.length && this.robot.mat.core) this.robot.mat.core.emissiveIntensity = 6;
    // sparks
    const { pos, vel, life, N } = this.sp;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { if (pos[i * 3 + 1] > -50) pos[i * 3 + 1] = -100; continue; }
      life[i] -= dt;
      vel[i * 3 + 1] -= G * 0.6 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.005) { pos[i * 3 + 1] = 0.005; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.5; vel[i * 3 + 2] *= 0.5; }
    }
    this.sparkPts.geometry.attributes.position.needsUpdate = true;
    for (const p of this.smoke) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.s.position.addScaledVector(p.v, dt);
      const k = 1 - p.life / p.max;
      p.s.scale.setScalar(p.size * (1 + k * 3));
      p.s.material.opacity = Math.sin(k * Math.PI) * 0.6;
      if (p.life <= 0) p.s.visible = false;
    }
  }
}

function isInside(o, root) {
  for (let x = o; x; x = x.parent) if (x === root) return true;
  return false;
}
