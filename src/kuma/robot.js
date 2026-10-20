import * as THREE from 'three';
import { superShape, frontUVs, latheSmooth, bendAroundY, pillSlab, limbCapsule, axleX, rod, mesh } from './geometry.js';
import { mats } from './materials.js';
import { VisorDisplay, makeChestTexture, makeSkullTexture } from './textures.js';
import { solveTwoBone, setWorldQuaternion } from './ik.js';
import { DetailBatch, detailMats, superSurface, seamStrip, latitude, screwOn, placeOn, shadowLod } from './details.js';

// The robot is a tree of joints. The pelvis is the root; it sits on the chair.
// Arms and legs are posed with inverse kinematics; the rest is set directly.

export const DIM = {
  upperArm: 0.29,
  foreArm: 0.27,
  thigh: 0.42,
  shin: 0.43,
  ankle: 0.075, // ankle height above the sole
};

const smoothstep = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Narrows a limb shell towards its lower end. */
const taperY = (k) => (v, n) => {
  const t = (n.y + 1) / 2;
  const s = k + (1 - k) * t;
  v.x *= s;
  v.z *= s;
};

// Fine enough that silhouettes and highlights stay round in close-ups at 2x.
const sphere = (r, w = 40, h = 28) => new THREE.SphereGeometry(r, w, h);

// Tessellation for the shells. Big curved shells carry the highlights and the
// outline in close-ups, so they get the most; small parts get less.
const SHELL = { segW: 64, segH: 48 };
const SMALL = { segW: 48, segH: 36 };

/** A superShape shell, fine for the camera and at the old 40 x 28 for the shadow pass. */
const shellMesh = (rx, ry, rz, opts, seg = SHELL, mat = mats.shell) =>
  shadowLod(mesh(superShape(rx, ry, rz, { ...opts, ...seg }), mat), superShape(rx, ry, rz, opts));

/** Directions round a ring of normalised height `y` about the Z axis (for parts facing back or front). */
const latitudeZ = (z, segments) => latitude(z, segments).map((d) => new THREE.Vector3(d.x, d.z, d.y));

/** Two hairline seams round a limb shell, near its ends. */
function limbSeams(batch, rx, ry, rz, opts, offset, top, bottom) {
  const surf = superSurface(rx, ry, rz, { ...opts, offset });
  batch.add(detailMats.seam, seamStrip(surf, latitude(top, 112)), seamStrip(surf, latitude(bottom, 112)));
}

/** A bolt cap on the end of a joint axle lying along X: a hex head with a washer. */
function axleBolts(batch, halfLength, y, radius) {
  for (const s of [-1, 1]) {
    const washer = new THREE.CylinderGeometry(radius * 1.25, radius * 1.25, 0.0012, 40);
    washer.translate(0, 0.0006, 0);
    const head = new THREE.CylinderGeometry(radius, radius, 0.0032, 6);
    head.translate(0, 0.0012 + 0.0016, 0);
    for (const g of [washer, head]) {
      placeOn(g, new THREE.Vector3(s * halfLength, y, 0), new THREE.Vector3(s, 0, 0));
      batch.add(mats.chrome, g);
    }
  }
}

/** Fine grooves round a chrome axle lying along X. */
function axleGrooves(batch, radius, xs, y) {
  for (const x of xs) {
    const g = new THREE.TorusGeometry(radius + 0.0002, 0.0009, 6, 72);
    g.rotateY(Math.PI / 2);
    g.translate(x, y, 0);
    batch.add(detailMats.seam, g);
  }
}

export class Robot {
  constructor() {
    const t0 = performance.now();
    this.root = new THREE.Group();
    this.root.name = 'robot';
    this.visor = new VisorDisplay();
    this.build();
    this.buildMs = performance.now() - t0; // start-up cost of building the robot, for measuring
  }

  build() {
    const root = this.root;

    // Pelvis and hip sockets.
    const pelvis = shellMesh(0.165, 0.085, 0.125, { exp: 3 }, SMALL);
    pelvis.position.set(0, 0, -0.01);
    root.add(pelvis);
    for (const s of [-1, 1]) {
      const socket = mesh(sphere(0.06, 32, 24), mats.joint);
      socket.position.set(s * 0.108, -0.02, 0.02);
      root.add(socket);
    }

    // Waist: a dark core with chrome rings.
    this.spine = new THREE.Group();
    this.spine.position.set(0, 0.07, -0.02);
    root.add(this.spine);
    const core = mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.16, 64), mats.joint);
    core.position.y = 0.07;
    this.spine.add(core);
    for (const [y, r] of [
      [0.025, 0.118],
      [0.07, 0.112],
      [0.115, 0.108],
    ]) {
      const ring = mesh(new THREE.TorusGeometry(r, 0.012, 16, 96), mats.chrome);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.spine.add(ring);
    }

    // Chest.
    this.chest = new THREE.Group();
    this.chest.position.set(0, 0.16, 0);
    this.spine.add(this.chest);
    this.buildChest(this.chest);

    // Neck and head.
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.41, -0.005);
    this.chest.add(this.neck);
    this.buildNeck(this.neck);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.075, 0.005);
    this.neck.add(this.head);
    this.buildHead(this.head);

    // Limbs: index 0 is the robot's left (+X), 1 its right (-X).
    this.arms = [this.buildArm(1), this.buildArm(-1)];
    this.legs = [this.buildLeg(1), this.buildLeg(-1)];
  }

  buildChest(chest) {
    const detail = new DetailBatch();
    const chestShape = (segW, segH) =>
      frontUVs(
        superShape(0.245, 0.215, 0.148, {
          exp: 3,
          segW,
          segH,
          deform(v, n) {
            const t = (n.y + 1) / 2;
            v.x *= 0.8 + 0.2 * smoothstep(0.0, 0.62, t);
            if (n.z > 0) v.z *= 1 + 0.11 * (1 - n.x * n.x) * smoothstep(0.15, 0.75, t);
            else v.z *= 0.92;
            v.z -= (1 - t) * 0.014;
          },
        }),
        0, 0, 0.52, 0.52, { minZ: -0.03 },
      );
    const chestMat = mats.shell.clone();
    chestMat.map = makeChestTexture();
    const shell = shadowLod(mesh(chestShape(112, 80), chestMat, { name: 'chest' }), chestShape(64, 44));
    shell.position.set(0, 0.2, 0);
    chest.add(shell);

    // Collar ring where the neck comes out.
    const collar = mesh(new THREE.TorusGeometry(0.072, 0.017, 20, 96), mats.joint);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.405, -0.008);
    chest.add(collar);

    // Shoulder sockets: dark mechanical joints between chest and arms.
    for (const s of [-1, 1]) {
      const socket = mesh(sphere(0.064), mats.joint);
      socket.position.set(s * 0.268, 0.33, -0.012);
      chest.add(socket);
      // Two small pistons under each arm, as in the picture.
      const a = new THREE.Vector3(s * 0.2, 0.1, 0.02);
      const b = new THREE.Vector3(s * 0.25, 0.3, 0.0);
      chest.add(mesh(rod(a, b, 0.012, 20), mats.chrome));
      const c = new THREE.Vector3(s * 0.2, 0.1, -0.05);
      const d = new THREE.Vector3(s * 0.25, 0.29, -0.05);
      chest.add(mesh(rod(c, d, 0.009, 20), mats.steel));
      // Each piston rod slides out of a dark cylinder, with a chrome lip where it leaves.
      for (const [p, q, r] of [
        [a, b, 0.0148],
        [c, d, 0.0118],
      ]) {
        const top = new THREE.Vector3().lerpVectors(p, q, 0.4);
        detail.add(mats.joint, rod(p, top, r, 24));
        const lip = new THREE.TorusGeometry(r - 0.0012, 0.0016, 8, 32);
        lip.rotateX(Math.PI / 2); // its axis along +Y, then along the rod
        placeOn(lip, top, new THREE.Vector3().subVectors(q, p).normalize());
        detail.add(mats.chrome, lip);
      }
    }

    // Power pack on the back with glowing strips.
    const pack = shellMesh(0.15, 0.15, 0.048, { exp: 3.2 });
    pack.position.set(0, 0.215, -0.165);
    chest.add(pack);
    for (const s of [-1, 1]) {
      const strip = mesh(new THREE.CapsuleGeometry(0.008, 0.17, 8, 24), mats.led, { cast: false });
      strip.scale.z = 0.5;
      strip.position.set(s * 0.085, 0.215, -0.212);
      chest.add(strip);
    }
    for (let i = 0; i < 4; i++) {
      const vent = mesh(new THREE.CapsuleGeometry(0.007, 0.07, 6, 16), mats.joint, { cast: false });
      vent.rotation.z = Math.PI / 2;
      vent.scale.z = 0.6;
      vent.position.set(0, 0.16 + i * 0.035, -0.211);
      chest.add(vent);
    }
    // The pack's lid: a seam round its side wall and a screw in each corner.
    const packSurf = superSurface(0.15, 0.15, 0.048, { exp: 3.2, offset: pack.position });
    detail.add(detailMats.seam, seamStrip(packSurf, latitudeZ(-0.5, 128)));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) detail.add(mats.chrome, screwOn(packSurf, new THREE.Vector3(sx * 0.6, sy * 0.6, -0.55)));
    detail.build(chest, 'chest');
  }

  buildNeck(neck) {
    const core = mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.1, 48), mats.chrome);
    core.position.y = 0.03;
    neck.add(core);
    for (const y of [0.005, 0.03, 0.055]) {
      const ring = mesh(new THREE.TorusGeometry(0.043, 0.011, 16, 72), mats.rubber);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      neck.add(ring);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const p0 = new THREE.Vector3(Math.cos(a) * 0.05, -0.005, Math.sin(a) * 0.05);
      const p1 = new THREE.Vector3(Math.cos(a + 0.35) * 0.042, 0.08, Math.sin(a + 0.35) * 0.042);
      neck.add(mesh(rod(p0, p1, 0.006, 14), i % 2 ? mats.chrome : mats.joint, { cast: false }));
    }
    // A dark plug on top, only seen when the head comes off.
    const plug = mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.008, 48), mats.joint);
    plug.position.y = 0.081;
    neck.add(plug);
  }

  buildHead(head) {
    const detail = new DetailBatch();
    const centre = new THREE.Group();
    centre.position.set(0, 0.15, 0.01);
    head.add(centre);
    this.headCentre = centre;

    // Skull: a smooth lathe, slightly egg-shaped.
    const profile = [
      [0.0, -0.15],
      [0.06, -0.147],
      [0.1, -0.134],
      [0.128, -0.105],
      [0.143, -0.06],
      [0.15, -0.012],
      [0.151, 0.03],
      [0.146, 0.075],
      [0.131, 0.116],
      [0.106, 0.149],
      [0.072, 0.171],
      [0.036, 0.182],
      [0.0, 0.185],
    ];
    const skullGeo = latheSmooth(profile, { segments: 128, samples: 88 });
    const pts = skullGeo.userData.profile;
    const vAt = (y) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i].y;
        const b = pts[i + 1].y;
        if ((y >= a && y <= b) || (y <= a && y >= b)) return (i + (y - a) / (b - a || 1)) / (pts.length - 1);
      }
      return 0.5;
    };
    const skullMat = mats.shell.clone();
    skullMat.map = makeSkullTexture(vAt);
    const skull = shadowLod(mesh(skullGeo, skullMat, { name: 'skull' }), latheSmooth(profile, { segments: 64, samples: 40 }));
    centre.add(skull);

    // Visor: a pill-shaped glass band wrapped round the face.
    const R = 0.148;
    const len = R * THREE.MathUtils.degToRad(152);
    const hgt = 0.076;
    const visorGeo = pillSlab(len, hgt, 0.034, { lengthSegments: 96, capSegments: 12, radialSegments: 48 });
    {
      const pos = visorGeo.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = pos.getX(i) / len + 0.5;
        uv[i * 2 + 1] = pos.getY(i) / hgt + 0.5;
      }
      visorGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    bendAroundY(visorGeo, R);
    const visorMat = mats.glass.clone();
    visorMat.emissive = new THREE.Color(0xffffff);
    visorMat.emissiveMap = this.visor.texture;
    visorMat.emissiveIntensity = 4.8;
    const visor = mesh(visorGeo, visorMat, { name: 'visor' });
    visor.position.set(0, -0.004, 0.002);
    centre.add(visor);
    this.visorMesh = visor;
    // A thin dark gasket the glass sits in: a slightly larger, shallower pill
    // behind the visor, so only a hairline rim shows where it meets the skull.
    const gasketGeo = pillSlab(len + 0.008, hgt + 0.0068, 0.024, { lengthSegments: 80, capSegments: 8, radialSegments: 24 });
    gasketGeo.deleteAttribute('uv');
    bendAroundY(gasketGeo, R);
    gasketGeo.translate(visor.position.x, visor.position.y, visor.position.z);
    detail.add(detailMats.seam, gasketGeo);

    // Ear pods.
    this.ears = [];
    for (const s of [1, -1]) {
      const pod = new THREE.Group();
      pod.position.set(s * 0.147, -0.004, -0.004);
      pod.rotation.z = -s * Math.PI / 2;
      centre.add(pod);
      const podGeo = latheSmooth(
        [
          [0.06, 0.0],
          [0.059, 0.016],
          [0.053, 0.029],
          [0.042, 0.034],
          [0.0, 0.034],
        ],
        { segments: 96, samples: 24 },
      );
      const shell = mesh(podGeo, mats.shell);
      pod.add(shell);
      const inner = mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.01, 80), mats.joint);
      inner.position.y = 0.035;
      pod.add(inner);
      const ring = mesh(new THREE.TorusGeometry(0.044, 0.0035, 12, 96), mats.led, { cast: false });
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.035;
      pod.add(ring);
      const cap = mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.016, 48), mats.chrome);
      cap.position.y = 0.042;
      pod.add(cap);
      // Four screws holding the speaker plate, a groove round the chrome cap and
      // a seam where the pod's rim meets its face. Built in the pod's frame, then
      // moved into the head's, so both pods share one merged mesh.
      pod.updateMatrix();
      const podParts = [];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const head = placeOn(new THREE.SphereGeometry(0.0029, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Vector3(Math.cos(a) * 0.0285, 0.04, Math.sin(a) * 0.0285), new THREE.Vector3(0, 1, 0), -0.0002);
        podParts.push([mats.chrome, head]);
      }
      const capGroove = new THREE.TorusGeometry(0.0181, 0.0007, 6, 64);
      capGroove.rotateX(Math.PI / 2);
      capGroove.translate(0, 0.0445, 0);
      podParts.push([detailMats.seam, capGroove]);
      // The rim seam sits on the shell's own profile, where the side turns into the face.
      const prof = podGeo.userData.profile;
      let rimR = 0.0545;
      for (let k = 0; k < prof.length - 1; k++) {
        const [p, q] = [prof[k], prof[k + 1]];
        if ((0.0255 - p.y) * (0.0255 - q.y) <= 0 && q.y !== p.y) rimR = p.x + ((0.0255 - p.y) / (q.y - p.y)) * (q.x - p.x);
      }
      const rimSeam = new THREE.TorusGeometry(rimR - 0.0003, 0.0008, 6, 96);
      rimSeam.rotateX(Math.PI / 2);
      rimSeam.translate(0, 0.0255, 0);
      podParts.push([detailMats.seam, rimSeam]);
      for (const [m, g] of podParts) detail.add(m, g.applyMatrix4(pod.matrix));
      const tip = new THREE.Object3D();
      tip.position.y = 0.06;
      pod.add(tip);
      this.ears.push(tip);
    }

    // The socket under the skull that sits on the neck, ringed with light.
    const socket = mesh(new THREE.CylinderGeometry(0.044, 0.046, 0.01, 64), mats.joint);
    socket.position.y = -0.149;
    centre.add(socket);
    const socketRing = mesh(new THREE.TorusGeometry(0.032, 0.003, 10, 80), mats.led, { cast: false });
    socketRing.rotation.x = Math.PI / 2;
    socketRing.position.y = -0.1545;
    centre.add(socketRing);

    this.headTop = new THREE.Object3D();
    this.headTop.position.set(0.09, 0.26, 0.02);
    centre.add(this.headTop);
    detail.build(centre, 'head');
  }

  buildArm(s) {
    const arm = { side: s };
    const upper = new THREE.Group();
    upper.position.set(s * 0.29, 0.33, -0.01);
    this.chest.add(upper);

    const detail = new DetailBatch();
    upper.add(mesh(sphere(0.05, 32, 24), mats.chrome));
    const cap = shellMesh(
      0.082,
      0.07,
      0.084,
      {
        exp: 2.5,
        deform: (v, n) => {
          if (n.y < 0) v.y *= 0.55;
        },
      },
      { segW: 80, segH: 60 },
    );
    cap.position.set(s * 0.012, 0.004, 0);
    upper.add(cap);
    const shell = shellMesh(0.056, 0.118, 0.058, { exp: 2.6, deform: taperY(0.86) });
    shell.position.set(0, -0.155, 0);
    upper.add(shell);
    limbSeams(detail, 0.056, 0.118, 0.058, { exp: 2.6, deform: taperY(0.86) }, shell.position, 0.74, -0.76);
    // Exposed rod on the inside of the upper arm.
    upper.add(mesh(rod(new THREE.Vector3(-s * 0.04, -0.06, -0.02), new THREE.Vector3(-s * 0.035, -0.26, -0.015), 0.011, 20), mats.chrome));
    const elbow = mesh(axleX(0.037, 0.088, 64), mats.chrome);
    elbow.position.y = -DIM.upperArm;
    upper.add(elbow);
    const elbowCap = mesh(axleX(0.026, 0.1, 48), mats.joint);
    elbowCap.position.y = -DIM.upperArm;
    upper.add(elbowCap);
    axleBolts(detail, 0.05, -DIM.upperArm, 0.0105);
    axleGrooves(detail, 0.037, [-0.036, 0.036], -DIM.upperArm);
    detail.build(upper, 'upperArm');

    const fore = new THREE.Group();
    fore.position.y = -DIM.upperArm;
    upper.add(fore);
    const fdetail = new DetailBatch();
    const fshell = shellMesh(0.05, 0.112, 0.053, { exp: 2.6, deform: taperY(0.8) });
    fshell.position.y = -0.14;
    fore.add(fshell);
    limbSeams(fdetail, 0.05, 0.112, 0.053, { exp: 2.6, deform: taperY(0.8) }, fshell.position, 0.72, -0.74);
    const strip = mesh(new THREE.CapsuleGeometry(0.006, 0.1, 6, 16), mats.led, { cast: false });
    strip.scale.x = 0.5;
    strip.position.set(s * 0.048, -0.135, 0.0);
    fore.add(strip);
    const wrist = mesh(sphere(0.027, 32, 24), mats.chrome);
    wrist.position.y = -DIM.foreArm;
    fore.add(wrist);
    fdetail.build(fore, 'foreArm');

    const hand = new THREE.Group();
    hand.position.y = -DIM.foreArm;
    fore.add(hand);
    this.buildHand(hand, s, arm);

    Object.assign(arm, { upper, fore, hand });
    return arm;
  }

  buildHand(hand, s, arm) {
    const ts = -s; // the thumb sits on the side nearest the body
    const palm = shellMesh(0.045, 0.048, 0.021, { exp: 2.8 }, SMALL);
    palm.position.set(0, -0.052, 0.002);
    hand.add(palm);
    const pad = mesh(superShape(0.036, 0.036, 0.008, { exp: 2.6, segW: 40, segH: 28 }), mats.palmPad);
    pad.position.set(0, -0.056, -0.016);
    hand.add(pad);
    const knuckles = mesh(new THREE.CapsuleGeometry(0.0115, 0.064, 8, 32), mats.chrome);
    knuckles.rotation.z = Math.PI / 2;
    knuckles.position.set(0, -0.097, 0);
    hand.add(knuckles);

    arm.fingers = [];
    const specs = [
      [ts * 0.0265, [0.037, 0.024, 0.019], 0.0098],
      [ts * 0.009, [0.041, 0.026, 0.02], 0.0102],
      [-ts * 0.009, [0.038, 0.024, 0.019], 0.0097],
      [-ts * 0.0265, [0.03, 0.02, 0.017], 0.0088],
    ];
    for (const [x, lens, r] of specs) {
      const joints = [];
      let parent = hand;
      for (let k = 0; k < 3; k++) {
        const j = new THREE.Group();
        if (k === 0) j.position.set(x, -0.1, 0);
        else j.position.y = -lens[k - 1];
        parent.add(j);
        const seg = mesh(limbCapsule(r * (1 - k * 0.07), lens[k] - 0.004, 20, 6), mats.shell);
        seg.position.y = -0.002;
        j.add(seg);
        j.add(mesh(sphere(r * 0.86, 16, 12), mats.chrome, { cast: false }));
        joints.push(j);
        parent = j;
      }
      arm.fingers.push(joints);
    }

    const thumbBase = new THREE.Group();
    thumbBase.position.set(ts * 0.04, -0.03, -0.008);
    hand.add(thumbBase);
    thumbBase.add(mesh(sphere(0.013, 16, 12), mats.chrome, { cast: false }));
    const tj = [];
    let parent = thumbBase;
    const tl = [0.034, 0.027, 0.021];
    for (let k = 0; k < 3; k++) {
      const j = new THREE.Group();
      if (k > 0) j.position.y = -tl[k - 1];
      parent.add(j);
      const seg = mesh(limbCapsule(0.0115 * (1 - k * 0.08), tl[k] - 0.004, 20, 6), mats.shell);
      seg.position.y = -0.002;
      j.add(seg);
      if (k > 0) j.add(mesh(sphere(0.0095, 16, 12), mats.chrome, { cast: false }));
      tj.push(j);
      parent = j;
    }
    arm.thumb = { base: thumbBase, joints: tj, side: ts };
  }

  buildLeg(s) {
    const leg = { side: s };
    const thigh = new THREE.Group();
    thigh.position.set(s * 0.105, -0.02, 0.02);
    this.root.add(thigh);
    const tdetail = new DetailBatch();
    thigh.add(mesh(sphere(0.052, 32, 24), mats.chrome));
    const tshell = shellMesh(0.074, 0.175, 0.078, { exp: 2.6, deform: taperY(0.84) }, { segW: 72, segH: 56 });
    tshell.position.y = -0.2;
    thigh.add(tshell);
    limbSeams(tdetail, 0.074, 0.175, 0.078, { exp: 2.6, deform: taperY(0.84) }, tshell.position, 0.78, -0.8);
    const knee = mesh(axleX(0.044, 0.112, 64), mats.chrome);
    knee.position.y = -DIM.thigh;
    thigh.add(knee);
    const kneeCap = mesh(axleX(0.032, 0.124, 48), mats.joint);
    kneeCap.position.y = -DIM.thigh;
    thigh.add(kneeCap);
    axleBolts(tdetail, 0.062, -DIM.thigh, 0.0125);
    axleGrooves(tdetail, 0.044, [-0.045, 0.045], -DIM.thigh);
    tdetail.build(thigh, 'thigh');

    const shin = new THREE.Group();
    shin.position.y = -DIM.thigh;
    thigh.add(shin);
    const sdetail = new DetailBatch();
    const sshell = shellMesh(0.064, 0.18, 0.07, { exp: 2.6, deform: taperY(0.78) }, { segW: 72, segH: 56 });
    sshell.position.set(0, -0.215, 0.004);
    shin.add(sshell);
    limbSeams(sdetail, 0.064, 0.18, 0.07, { exp: 2.6, deform: taperY(0.78) }, sshell.position, 0.8, -0.8);
    const pad = shellMesh(0.048, 0.05, 0.024, { exp: 2.6 }, SMALL);
    pad.position.set(0, -0.012, 0.05);
    shin.add(pad);
    // Two screws holding the knee pad on.
    const padSurf = superSurface(0.048, 0.05, 0.024, { exp: 2.6, offset: pad.position });
    for (const sx of [-1, 1]) sdetail.add(mats.chrome, screwOn(padSurf, new THREE.Vector3(sx * 0.62, -0.1, 0.78), { radius: 0.0032 }));
    const ankle = mesh(sphere(0.036), mats.chrome);
    ankle.position.y = -DIM.shin;
    shin.add(ankle);
    sdetail.build(shin, 'shin');

    const foot = new THREE.Group();
    foot.position.y = -DIM.shin;
    shin.add(foot);
    const fshell = shellMesh(0.058, 0.043, 0.122, {
      exp: 3,
      deform: (v, n) => {
        if (n.z > 0) v.y *= 1 - 0.35 * n.z; // lower towards the toes
      },
    });
    fshell.position.set(0, -0.034, 0.05);
    foot.add(fshell);
    const sole = shellMesh(0.061, 0.011, 0.126, { exp: 3.4 }, { segW: 56, segH: 32 }, mats.rubber);
    sole.position.set(0, -0.066, 0.05);
    foot.add(sole);
    // Tread: low rounded bars across the flat of the sole, slightly lighter than the rubber.
    const fdetail = new DetailBatch();
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.CapsuleGeometry(0.0042, 0.064, 4, 12);
      bar.rotateZ(Math.PI / 2);
      bar.scale(1, 0.42, 1);
      bar.translate(0, -0.0765, 0.05 + k * 0.03);
      fdetail.add(mats.palmPad, bar);
    }
    fdetail.build(foot, 'foot');

    Object.assign(leg, { thigh, shin, foot });
    return leg;
  }

  /* -------------------------------------------------------------- */
  /* Posing                                                          */
  /* -------------------------------------------------------------- */

  /** Sets the torso, neck and head (all angles in radians). */
  applyBody(b) {
    this.root.position.set(0, 0.17 + (b.pelvisY || 0), b.pelvisZ || 0);
    this.root.rotation.set(b.pelvisPitch || 0, 0, 0);
    this.spine.rotation.set(b.spinePitch || 0, b.spineYaw || 0, b.spineRoll || 0, 'YXZ');
    this.chest.rotation.set(b.chestPitch || 0, b.chestYaw || 0, b.chestRoll || 0, 'YXZ');
    this.neck.rotation.set(b.neckPitch || 0, b.neckYaw || 0, 0, 'YXZ');
    this.head.rotation.set(b.headPitch || 0, b.headYaw || 0, b.headRoll || 0, 'YXZ');
  }

  /** Reaches an arm towards a world target with the hand at a world rotation. */
  solveArm(i, target, pole, handQ) {
    const arm = this.arms[i];
    solveTwoBone(arm.upper, arm.fore, target, pole, DIM.upperArm, DIM.foreArm, -1);
    if (handQ) {
      setWorldQuaternion(arm.hand, handQ);
      arm.hand.updateMatrixWorld(true);
    }
  }

  /** Fingers: curl in 0..1 per finger (0 relaxed, 1 fist), plus extra per-finger bends. */
  setFingers(i, { curl = 0, taps = null, spread = 0, thumb = 0, thumbTap = 0 } = {}) {
    const arm = this.arms[i];
    const ts = arm.thumb.side;
    arm.fingers.forEach((joints, f) => {
      const tap = taps ? taps[f] : 0;
      const c = THREE.MathUtils.clamp(curl, 0, 1);
      const relax = [0.38, 0.55, 0.32];
      const fist = [1.5, 1.72, 1.15];
      for (let k = 0; k < 3; k++) {
        let a = relax[k] + (fist[k] - relax[k]) * c;
        if (k === 0) a += tap * 0.42;
        if (k === 1) a += tap * 0.2;
        joints[k].rotation.set(a, 0, 0);
      }
      joints[0].rotation.z = (f - 1.5) * -ts * spread * 0.12;
    });
    // Thumb: rests along the side when relaxed; folds over the fingers in a fist.
    const t = THREE.MathUtils.clamp(thumb, 0, 1);
    const base = arm.thumb.base;
    base.rotation.set(0.55 + 0.55 * t + thumbTap * 0.25, ts * (0.35 + 0.7 * t), ts * (0.62 - 0.3 * t), 'XYZ');
    const tj = arm.thumb.joints;
    tj[1].rotation.set(0.25 + 0.55 * t, 0, 0);
    tj[2].rotation.set(0.3 + 0.7 * t, 0, 0);
  }

  /** Reaches a leg towards a world ankle target with the foot at a world rotation. */
  solveLeg(i, target, pole, footQ) {
    const leg = this.legs[i];
    solveTwoBone(leg.thigh, leg.shin, target, pole, DIM.thigh, DIM.shin, 1);
    if (footQ) {
      setWorldQuaternion(leg.foot, footQ);
      leg.foot.updateMatrixWorld(true);
    }
  }

  update(dt, time, colour) {
    this.visor.update(dt, time, colour);
  }
}
