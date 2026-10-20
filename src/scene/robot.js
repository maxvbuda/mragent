import * as THREE from 'three';
import { Face, visorUV } from './face.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const tmp = {
  S: new THREE.Vector3(), d: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3(), e: new THREE.Vector3(),
  f: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), E: new THREE.Vector3(),
  T: new THREE.Vector3(), m: new THREE.Matrix4(), q1: new THREE.Quaternion(), q2: new THREE.Quaternion(),
  q3: new THREE.Quaternion(), qp: new THREE.Quaternion(), eu: new THREE.Euler(), a: new THREE.Vector3(), b: new THREE.Vector3(),
};
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const smooth = (t) => t * t * (3 - 2 * t);

function grp(parent, x = 0, y = 0, z = 0, name = '') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.name = name;
  parent.add(g);
  return g;
}

/** Orientation whose local -Y points along dir and whose local +X is the hinge axis. */
function basisQuat(hinge, dir, out) {
  tmp.y.copy(dir).multiplyScalar(-1);
  tmp.z.crossVectors(hinge, tmp.y).normalize();
  tmp.x.crossVectors(tmp.y, tmp.z).normalize();
  tmp.m.makeBasis(tmp.x, tmp.y, tmp.z);
  return out.setFromRotationMatrix(tmp.m);
}

/**
 * Two-bone IK. Writes local quaternions for upper/lower into outUpper/outLower.
 * bend = +1 for elbows (forearm folds toward local -Z), -1 for knees.
 */
function solveTwoBone(upper, target, pole, L1, L2, bend, outUpper, outLower) {
  const S = upper.getWorldPosition(tmp.S);
  tmp.d.subVectors(target, S);
  const d = THREE.MathUtils.clamp(tmp.d.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-4);
  tmp.u.copy(tmp.d).normalize();
  const a = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  tmp.v.subVectors(pole, S);
  tmp.v.addScaledVector(tmp.u, -tmp.v.dot(tmp.u));
  if (tmp.v.lengthSq() < 1e-8) tmp.v.set(0, 0, -1);
  tmp.v.normalize();
  tmp.e.copy(tmp.u).multiplyScalar(Math.cos(a)).addScaledVector(tmp.v, Math.sin(a));
  tmp.E.copy(S).addScaledVector(tmp.e, L1);
  tmp.T.copy(S).addScaledVector(tmp.u, d);
  tmp.f.subVectors(tmp.T, tmp.E).normalize();
  const hinge = tmp.a.crossVectors(tmp.v, tmp.u).normalize().multiplyScalar(bend);
  const e = tmp.b.copy(tmp.e);
  const qUpperW = basisQuat(hinge, e, tmp.q1);
  const hingeCopy = hinge.clone();
  const qLowerW = basisQuat(hingeCopy, tmp.f, tmp.q2);
  upper.parent.getWorldQuaternion(tmp.qp);
  outUpper.copy(tmp.qp).invert().multiply(qUpperW);
  outLower.copy(qUpperW).invert().multiply(qLowerW);
  return qLowerW; // world orientation of the lower bone (valid until the next solve)
}

export class Robot {
  constructor(geos, layout, M) {
    this.L = layout;
    this.M = M;
    this.geos = geos;
    this.root = new THREE.Group();
    this.root.name = 'Mr. Agent';
    this.face = new Face();
    this.meshes = [];

    // per-robot materials so status colours can change without touching the room
    this.mat = {
      shell: M.shell, joint: M.joint, chrome: M.chrome, rubber: M.rubber,
      glow: M.glow.clone(), glowSoft: M.glowSoft.clone(),
      visor: new THREE.MeshPhysicalMaterial({
        color: 0x020305, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03,
        emissive: 0xffffff, emissiveMap: this.face.texture, emissiveIntensity: 6.5,
      }),
      battery: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    visorUV(geos.visor, layout.visor);

    const R = layout.robot;
    this.pelvis = grp(this.root, 0, R.sitWaist, 0, 'pelvis');
    ['waistCore', 'hipJoints'].forEach((n) => this.mesh(this.pelvis, n, this.mat.joint));
    this.mesh(this.pelvis, 'waistSpring', this.mat.chrome);
    this.mesh(this.pelvis, 'hips', this.mat.shell);

    this.torso = grp(this.pelvis, 0, 0, 0, 'torso');
    this.mesh(this.torso, 'torso', this.mat.shell);
    if (geos.torsoSeam) this.mesh(this.torso, 'torsoSeam', this.mat.joint);
    // the chest plate (with the chest light) and the backpack are separate so a punch can knock them off
    this.chestPlate = grp(this.torso, 0, 0, 0, 'chestPlate');
    if (geos.chestPlate) this.mesh(this.chestPlate, 'chestPlate', this.mat.shell);
    this.mesh(this.chestPlate, 'chestLight', this.mat.glow);
    this.mesh(this.chestPlate, 'chestRing', this.mat.chrome);
    this.backpack = grp(this.torso, 0, 0, 0, 'backpack');
    this.mesh(this.backpack, 'backpack', this.mat.joint);
    this.mesh(this.backpack, 'backVent', this.mat.rubber);
    this.setupBattery(this.mesh(this.backpack, 'batteryLeds', this.mat.battery));
    // his insides (modelled in FreeCAD): only visible once the chest plate is gone
    this.mat.core = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x49e3ff, emissiveIntensity: 6 });
    this.mat.pcb = new THREE.MeshStandardMaterial({ color: 0x1d6b3a, roughness: 0.45, metalness: 0.2 });
    this.mat.chip = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.35, metalness: 0.4 });
    this.mat.cell = new THREE.MeshPhysicalMaterial({ color: 0x23a7b8, roughness: 0.3, clearcoat: 0.8 });
    this.mat.wireBlack = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.5 });
    this.insides = grp(this.torso, 0, 0, 0, 'insides');
    for (const [n, m] of [['spineCore', M.chrome], ['coreGlow', this.mat.core], ['coreCage', M.chrome], ['batteryCells', this.mat.cell], ['batteryCaps', M.chrome],
      ['pcbBoards', this.mat.pcb], ['pcbChips', this.mat.chip], ['servos', M.joint], ['wireRed', M.cableRed], ['wireBlue', M.cableBlue], ['wireYellow', M.cableYellow], ['wireBlack', this.mat.wireBlack]]) {
      if (!geos[n]) continue;
      const im = this.mesh(this.insides, n, m);
      im.castShadow = false;
    }

    this.neck = grp(this.torso, 0, R.neck, 0, 'neck');
    this.mesh(this.neck, 'neckCollar', this.mat.joint);
    this.mesh(this.neck, 'neck', this.mat.chrome);
    this.mesh(this.neck, 'neckRings', this.mat.joint);

    this.head = grp(this.neck, 0, R.head, 0, 'head');
    this.mesh(this.head, 'head', this.mat.shell);
    this.visor = this.mesh(this.head, 'visor', this.mat.visor);
    this.mesh(this.head, 'ears', this.mat.shell);
    this.mesh(this.head, 'earGlow', this.mat.glow);
    if (geos.cableSockets) this.mesh(this.head, 'cableSockets', this.mat.joint);
    this.mesh(this.head, 'antenna', this.mat.joint);
    this.mesh(this.head, 'antennaTip', this.mat.glowSoft);

    this.arms = [1, -1].map((s) => this.buildArm(s));
    this.legs = [1, -1].map((s) => this.buildLeg(s));
    this.buildCables([M.cableRed, M.cableBlue, M.cableYellow]);

    // ---- animation state (the brain writes these; update() turns them into a pose)
    this.state = {
      waistY: R.sitWaist, pelvisZ: 0, lean: 0.1, twist: 0, side: 0,
      headYaw: 0, headPitch: -0.1, headRoll: 0,
      lookTarget: null, lookWeight: 0,
      feet: [new THREE.Vector3(0.11, 0, -0.29), new THREE.Vector3(-0.11, 0, -0.29)],
      gait: 0,
    };
    this.look = { yaw: 0, pitch: 0, w: 0 };
    this.hit = { pitch: 0, roll: 0 }; // punch recoil, decays on its own
    this.gaitPhase = 0;
    this.prevPos = new THREE.Vector3();
    this.prevHeading = 0;
    this.velLocal = new THREE.Vector3();
    this.yawRate = 0;
    this.energy = 0.8;
    this.status = new THREE.Color(0x49e3ff);
    this.statusTarget = new THREE.Color(0x49e3ff);
    this.t = 0;
    this.onFootstep = null;
    this.root.traverse((o) => { if (o.isMesh) o.userData.robot = true; });
  }

  mesh(parent, name, mat, mirror = false) {
    const m = new THREE.Mesh(this.geos[name], mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (mirror) m.scale.x = -1;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  /**
   * Neck cables run from the collar (torso) into sockets under the head. They are
   * rebuilt each frame as tubes, so they stay plugged in and flex as the head turns.
   */
  buildCables(mats) {
    const C = this.L.cables || { angles: [205, 250, 295], radius: 0.052, bulge: 0.02, thickness: 0.0065 };
    const R = this.L.robot;
    this.cables = C.angles.map((deg, i) => {
      const a = THREE.MathUtils.degToRad(deg);
      const x = C.radius * Math.cos(a), z = -C.radius * Math.sin(a);
      // FreeCAD (x, y) -> three (x, -z); head underside from the same ellipsoid as the model
      const k = Math.sqrt(Math.max(0, 1 - (x / 0.152) ** 2 - (z / 0.142) ** 2));
      const headY = 0.150 - 0.140 * k + 0.006;
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mats[i]);
      mesh.castShadow = true;
      this.root.add(mesh);
      return {
        mesh, bulge: C.bulge, r: C.thickness,
        base: new THREE.Vector3(x, R.neck - 0.006, z),     // torso frame
        tip: new THREE.Vector3(x, headY, z),               // head frame
        dir: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)),
      };
    });
  }

  updateCables() {
    if (this.headDetached) { for (const c of this.cables) c.mesh.visible = false; return; }
    if (!this.cables[0].mesh.visible) { for (const c of this.cables) c.mesh.visible = true; this.cableKey = null; }
    // only rebuild the tubes when the head actually moved relative to the body
    const key = [this.pelvis.quaternion, this.neck.quaternion, this.head.quaternion, this.torso.quaternion].map((q) => `${q.x.toFixed(4)}${q.y.toFixed(4)}${q.z.toFixed(4)}`).join('') + this.pelvis.position.y.toFixed(4) + this.pelvis.position.z.toFixed(4);
    if (key === this.cableKey) return;
    this.cableKey = key;
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    for (const c of this.cables) {
      const p0 = c.base.clone().applyMatrix4(this.torso.matrixWorld).applyMatrix4(inv);
      const p3 = c.tip.clone().applyMatrix4(this.head.matrixWorld).applyMatrix4(inv);
      const out = c.dir.clone().transformDirection(this.neck.matrixWorld).transformDirection(inv).multiplyScalar(c.bulge);
      const up0 = new THREE.Vector3(0, 1, 0).transformDirection(this.torso.matrixWorld).transformDirection(inv);
      const up1 = new THREE.Vector3(0, 1, 0).transformDirection(this.head.matrixWorld).transformDirection(inv);
      const len = p0.distanceTo(p3);
      const curve = new THREE.CubicBezierCurve3(
        p0,
        p0.clone().addScaledVector(up0, len * 0.35).add(out),
        p3.clone().addScaledVector(up1, -len * 0.35).add(out),
        p3,
      );
      c.mesh.geometry.dispose();
      c.mesh.geometry = new THREE.TubeGeometry(curve, 14, c.r, 8, false);
    }
  }

  setupBattery(mesh) {
    const g = mesh.geometry;
    const p = g.attributes.position;
    const idx = new Uint8Array(p.count);
    for (let i = 0; i < p.count; i++) idx[i] = Math.max(0, Math.min(4, Math.round((p.getY(i) - 0.205) / 0.026)));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3), 3));
    this.battery = { g, idx };
  }

  buildArm(s) {
    const A = this.L.arm, H = this.L.hand, mat = this.mat;
    const shoulder = grp(this.torso, s * A.shoulder[0], A.shoulder[1], A.shoulder[2], 'shoulder');
    this.mesh(shoulder, 'shoulderPad', mat.shell, s < 0);
    this.mesh(shoulder, 'shoulderJoint', mat.joint);
    this.mesh(shoulder, 'upperArm', mat.shell);
    const pistonBody = this.mesh(shoulder, 'pistonBody', mat.joint);
    pistonBody.position.fromArray(A.pistonA);
    const elbow = grp(shoulder, 0, A.elbow, 0, 'elbow');
    this.mesh(elbow, 'elbowJoint', mat.joint);
    this.mesh(elbow, 'elbowCaps', mat.chrome);
    this.mesh(elbow, 'forearm', mat.shell);
    this.mesh(elbow, 'forearmLed', mat.glowSoft, s < 0);
    const pistonRod = this.mesh(elbow, 'pistonRod', mat.chrome);
    pistonRod.position.fromArray(A.pistonB);
    const wrist = grp(elbow, 0, A.wrist, 0, 'wrist');
    this.mesh(wrist, 'wrist', mat.chrome);
    this.mesh(wrist, 'palm', mat.shell);
    this.mesh(wrist, 'palmPad', mat.rubber);
    const fingers = H.knuckles.map(([x, y, z]) => {
      const a = grp(wrist, s * x, y, z, 'f1');
      this.mesh(a, 'phal1', mat.shell);
      this.mesh(a, 'fingerJoint', mat.joint);
      const b = grp(a, 0, H.phal[0], 0, 'f2');
      this.mesh(b, 'phal2', mat.shell);
      this.mesh(b, 'fingerJoint', mat.joint);
      const c = grp(b, 0, H.phal[1], 0, 'f3');
      this.mesh(c, 'phal3', mat.shell);
      this.mesh(c, 'fingerJoint', mat.joint);
      return { a, b, c, curl: 0.25, press: 0 };
    });
    const thumbBase = grp(wrist, -s * H.thumb[0], H.thumb[1], H.thumb[2], 'thumb');
    const t1 = grp(thumbBase, 0, 0, 0);
    this.mesh(t1, 'phal1', mat.shell);
    this.mesh(t1, 'fingerJoint', mat.joint);
    const t2 = grp(t1, 0, H.phal[0], 0);
    this.mesh(t2, 'phal3', mat.shell);
    this.mesh(t2, 'fingerJoint', mat.joint);
    thumbBase.rotation.set(0.35, 0, s * 0.75);
    return {
      s, shoulder, elbow, wrist, fingers, thumb: { t1, t2, curl: 0.2 }, pistonBody, pistonRod,
      fk: { x: 0.05, y: 0, z: 0.12, elbow: 0.2, wx: 0, wy: Math.PI / 2, wz: 0 },
      ik: null, ikW: 0, ikWTarget: 0, ikRate: 6,
      qS: new THREE.Quaternion(), qE: new THREE.Quaternion(), qW: new THREE.Quaternion(),
      iS: new THREE.Quaternion(), iE: new THREE.Quaternion(), iW: new THREE.Quaternion(),
      L1: -A.elbow, L2: -A.wrist,
    };
  }

  buildLeg(s) {
    const G = this.L.leg, mat = this.mat;
    const hip = grp(this.pelvis, s * G.hip[0], G.hip[1], G.hip[2], 'hip');
    this.mesh(hip, 'thigh', mat.shell);
    const knee = grp(hip, 0, G.knee, 0, 'knee');
    this.mesh(knee, 'kneeJoint', mat.joint);
    this.mesh(knee, 'kneeCap', mat.shell);
    this.mesh(knee, 'shin', mat.shell);
    const ankle = grp(knee, 0, G.ankle, 0, 'ankle');
    this.mesh(ankle, 'ankle', mat.joint);
    this.mesh(ankle, 'foot', mat.shell);
    this.mesh(ankle, 'sole', mat.rubber);
    return { s, hip, knee, ankle, L1: -G.knee, L2: -G.ankle, lift: 0, pitch: 0, planted: true,
      qH: new THREE.Quaternion(), qK: new THREE.Quaternion() };
  }

  // ------------------------------------------------------------------ public helpers
  get position() { return this.root.position; }
  get heading() { return this.root.rotation.y; }
  set heading(v) { this.root.rotation.y = v; }

  lookAt(point, weight = 1) {
    this.state.lookTarget = point ? (this.state.lookTarget || new THREE.Vector3()).copy(point) : null;
    this.state.lookWeight = point ? weight : 0;
  }

  setStatus(hex) { this.statusTarget.set(hex); }

  /** Quaternion for a hand pointing along `forward` (world) with the palm facing `palmDir` (world). */
  handQuat(forward, palmDir, out = new THREE.Quaternion()) {
    const y = tmp.y.copy(forward).normalize().multiplyScalar(-1);
    const z = tmp.z.copy(palmDir).multiplyScalar(-1);
    z.addScaledVector(y, -z.dot(y)).normalize();
    const x = tmp.x.crossVectors(y, z).normalize();
    tmp.m.makeBasis(x, y, z);
    return out.setFromRotationMatrix(tmp.m);
  }

  worldForward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  // ------------------------------------------------------------------ per-frame
  update(dt, camera) {
    this.t += dt;
    const st = this.state;
    this.trackVelocity(dt);

    // ---- gait
    const moving = this.velLocal.length() > 0.03 || Math.abs(this.yawRate) > 0.25;
    st.gait = damp(st.gait, moving ? 1 : 0, moving ? 8 : 5, dt);
    const T = 0.95;
    const prevPhase = this.gaitPhase;
    if (st.gait > 0.01) this.gaitPhase = (this.gaitPhase + dt / T) % 1;
    const crossed = (a, b, mark) => (a < mark && b >= mark) || (a > b && (mark > a || mark <= b));
    if (st.gait > 0.3 && this.onFootstep && (crossed(prevPhase, this.gaitPhase, 0) || crossed(prevPhase, this.gaitPhase, 0.5))) {
      this.onFootstep(this.root.position);
    }
    const w = st.gait, ph = this.gaitPhase;

    // ---- pelvis & torso
    this.pelvis.position.set(0, st.waistY - 0.012 * w + 0.012 * w * Math.cos(ph * Math.PI * 4), st.pelvisZ);
    this.pelvis.rotation.set(0, 0.06 * w * Math.sin(ph * Math.PI * 2), 0.035 * w * Math.sin(ph * Math.PI * 2));
    this.hit.pitch = damp(this.hit.pitch, 0, 5, dt);
    this.hit.roll = damp(this.hit.roll, 0, 5, dt);
    this.torso.rotation.set(-st.lean + this.hit.pitch, st.twist - 0.1 * w * Math.sin(ph * Math.PI * 2), st.side + this.hit.roll);

    // ---- head look
    this.updateLook(dt, camera);

    this.root.updateMatrixWorld(true);

    // ---- legs (always IK onto foot targets, which live in the root's frame)
    const rootQ = this.root.getWorldQuaternion(tmp.q3);
    const fwd = this.worldForward(new THREE.Vector3());
    this.legs.forEach((leg, i) => {
      const base = st.feet[i];
      const off = new THREE.Vector3();
      let lift = 0;
      if (w > 0.001) {
        const p = (ph + i * 0.5) % 1;
        const D = new THREE.Vector3(this.velLocal.x, 0, this.velLocal.z);
        D.z += -this.yawRate * base.x; // feet sweep around the hips when turning on the spot
        D.x += this.yawRate * base.z;
        D.multiplyScalar(T * 0.5);
        if (D.length() > 0.42) D.setLength(0.42);
        if (p < 0.5) off.copy(D).multiplyScalar(0.5 - p / 0.5);
        else {
          const t = (p - 0.5) / 0.5;
          off.copy(D).multiplyScalar(-0.5 + smooth(t));
          lift = 0.075 * Math.sin(Math.PI * t) * Math.min(1, 0.4 + D.length() * 6);
        }
        off.multiplyScalar(w);
        lift *= w;
      }
      leg.lift = lift;
      const target = new THREE.Vector3(base.x + off.x, this.L.leg.ankleToFloor + lift + base.y, base.z + off.z);
      this.root.localToWorld(target);
      const hipW = leg.hip.getWorldPosition(new THREE.Vector3());
      const pole = hipW.clone().addScaledVector(fwd, 1).add(new THREE.Vector3(0, 0.15, 0))
        .addScaledVector(new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)), leg.s * 0.12);
      const qShinW = solveTwoBone(leg.hip, target, pole, leg.L1, leg.L2, -1, leg.qH, leg.qK).clone();
      leg.hip.quaternion.copy(leg.qH);
      leg.knee.quaternion.copy(leg.qK);
      // keep the foot flat and pointing where the robot faces (toe lifts a little in swing)
      const footW = rootQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lift * 2.2, 0, 0)));
      leg.ankle.quaternion.copy(qShinW.invert().multiply(footW));
    });

    // ---- arms
    this.root.updateMatrixWorld(true);
    for (const arm of this.arms) if (!arm.detached) this.updateArm(arm, dt, w, ph);

    this.updatePistons();
    this.root.updateMatrixWorld(true);
    this.updateCables();
    this.updateLights(dt);
    this.faceT = (this.faceT || 0) + dt;
    if (this.faceT >= 1 / 30) { this.face.update(this.faceT); this.faceT = 0; } // the visor canvas only needs 30 fps
  }

  trackVelocity(dt) {
    if (dt <= 0) return;
    const p = this.root.position;
    const dv = new THREE.Vector3().subVectors(p, this.prevPos).divideScalar(dt);
    if (dv.length() > 5) dv.set(0, 0, 0); // teleports
    const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -this.heading, 0));
    dv.applyQuaternion(inv);
    this.velLocal.lerp(dv, 1 - Math.exp(-dt * 12));
    let dh = this.heading - this.prevHeading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.yawRate = damp(this.yawRate, dh / dt, 12, dt);
    this.prevPos.copy(p);
    this.prevHeading = this.heading;
  }

  updateLook(dt, camera) {
    const st = this.state;
    let yaw = st.headYaw, pitch = st.headPitch;
    let gx = 0, gy = 0;
    if (st.lookTarget && st.lookWeight > 0) {
      this.torso.updateWorldMatrix(true, false);
      const headPos = this.neck.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.2, 0));
      const dir = st.lookTarget.clone().sub(headPos);
      const qT = this.torso.getWorldQuaternion(new THREE.Quaternion()).invert();
      dir.applyQuaternion(qT);
      const ty = Math.atan2(-dir.x, -dir.z);
      const tp = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      const cy = THREE.MathUtils.clamp(ty, -1.25, 1.25);
      const cp = THREE.MathUtils.clamp(tp, -0.75, 0.55);
      yaw = THREE.MathUtils.lerp(yaw, cy, st.lookWeight);
      pitch = THREE.MathUtils.lerp(pitch, cp, st.lookWeight);
      gx = THREE.MathUtils.clamp((ty - cy) * 1.5 + Math.sin(this.t * 0.7) * 0.05, -1, 1);
      gy = THREE.MathUtils.clamp((tp - cp) * 1.5, -1, 1);
    }
    this.face.look(gx + (this.look.extraX || 0), gy + (this.look.extraY || 0));
    this.look.yaw = damp(this.look.yaw, yaw, 7, dt);
    this.look.pitch = damp(this.look.pitch, pitch, 7, dt);
    this.neck.rotation.set(this.look.pitch * 0.3, this.look.yaw * 0.35, 0);
    if (!this.headDetached) this.head.rotation.set(this.look.pitch * 0.7, this.look.yaw * 0.65, st.headRoll);
  }

  updateArm(arm, dt, gaitW, ph) {
    const s = arm.s, fk = arm.fk;
    const swing = -0.32 * gaitW * Math.cos(ph * Math.PI * 2) * s; // opposite to the same-side foot
    arm.qS.setFromEuler(tmp.eu.set(fk.x + swing, fk.y * s, fk.z * s, 'ZXY'));
    arm.qE.setFromEuler(tmp.eu.set(fk.elbow + gaitW * 0.15, 0, 0));
    arm.qW.setFromEuler(tmp.eu.set(fk.wx, fk.wy * s, fk.wz * s));
    arm.ikW = damp(arm.ikW, arm.ik ? arm.ikWTarget : 0, arm.ikRate, dt);
    if (arm.ik && arm.ikW > 0.001) {
      const qForeW = solveTwoBone(arm.shoulder, arm.ik.target, arm.ik.pole, arm.L1, arm.L2, 1, arm.iS, arm.iE);
      arm.iW.copy(qForeW).invert().multiply(arm.ik.quat);
      arm.shoulder.quaternion.slerpQuaternions(arm.qS, arm.iS, arm.ikW);
      arm.elbow.quaternion.slerpQuaternions(arm.qE, arm.iE, arm.ikW);
      arm.wrist.quaternion.slerpQuaternions(arm.qW, arm.iW, arm.ikW);
    } else {
      arm.shoulder.quaternion.copy(arm.qS);
      arm.elbow.quaternion.copy(arm.qE);
      arm.wrist.quaternion.copy(arm.qW);
    }
    arm.shoulder.updateMatrixWorld(true);
    for (const f of arm.fingers) {
      f.press = Math.max(0, f.press - dt * 9);
      const c = f.curl + f.press * 0.55;
      f.a.rotation.x = c * 0.7 + f.press * 0.25;
      f.b.rotation.x = c * 0.9;
      f.c.rotation.x = c * 0.7;
    }
    arm.thumb.t1.rotation.x = arm.thumb.curl * 0.6;
    arm.thumb.t2.rotation.x = arm.thumb.curl * 0.8;
  }

  updatePistons() {
    for (const arm of this.arms) {
      if (arm.detached) continue;
      const A = arm.shoulder.localToWorld(tmp.a.fromArray(this.L.arm.pistonA));
      const B = arm.elbow.localToWorld(tmp.b.fromArray(this.L.arm.pistonB));
      const toB = arm.shoulder.worldToLocal(B.clone()).sub(arm.pistonBody.position).normalize();
      arm.pistonBody.quaternion.setFromUnitVectors(DOWN, toB);
      const toA = arm.elbow.worldToLocal(A.clone()).sub(arm.pistonRod.position).normalize();
      arm.pistonRod.quaternion.setFromUnitVectors(DOWN, toA);
    }
  }

  updateLights(dt) {
    this.status.lerp(this.statusTarget, 1 - Math.exp(-dt * 4));
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 2.4);
    this.mat.glow.emissive.copy(this.status);
    this.mat.glow.emissiveIntensity = 6.5 + pulse * 2;
    this.mat.glowSoft.emissive.copy(this.status);
    this.mat.glowSoft.emissiveIntensity = 3 + (Math.sin(this.t * 5) > 0.6 ? 5 : 0.6);
    const lit = Math.round(this.energy * 5 + 0.49);
    const col = this.battery.g.attributes.color;
    const on = this.energy > 0.5 ? [0.9, 4.6, 1.6] : this.energy > 0.25 ? [4.6, 3.3, 0.6] : [4.8, 0.7, 0.6];
    for (let i = 0; i < this.battery.idx.length; i++) {
      const k = this.battery.idx[i];
      const isOn = k < lit;
      const blink = this.energy <= 0.25 && k === 0 ? (Math.sin(this.t * 8) > 0 ? 1 : 0.2) : 1;
      col.setXYZ(i, isOn ? on[0] * blink : 0.08, isOn ? on[1] * blink : 0.09, isOn ? on[2] * blink : 0.1);
    }
    col.needsUpdate = true;
  }

  /** Index fingertip world position (handy for pressing buttons). */
  fingertip(arm, i = 1) {
    return arm.fingers[i].c.localToWorld(new THREE.Vector3(0, -0.024, 0));
  }
}

export { damp, smooth };
