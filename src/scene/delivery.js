import * as THREE from 'three';

/**
 * RoboMart: order things for Mr. Agent or Kuma. A drone flies the parcel in and drops
 * it on the front porch, rings the bell, and the robot it's for walks outside, carries
 * it in and unboxes it. Every item ends up somewhere in the house and most do something.
 */
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// where things go: [agent, kuma] (world positions, three.js metres)
export const ITEMS = {
  matcha: { name: 'Ceremonial matcha tin', emoji: '🍵', price: 24, desc: 'Refills the mug and the battery.', parts: [['tinBody', 'tin'], ['tinLid', 'black'], ['tinLabel', 'cream']], at: [[2.66, 0.755, 0.62], [5.45, 0.755, 2.75]] },
  duck: { name: 'Rubber duck', emoji: '🦆', price: 6, desc: 'For rubber-duck debugging.', parts: [['duckBody', 'duck'], ['duckBeak', 'beak'], ['duckEyes', 'black']], at: [[-0.45, 0.745, -0.62], [5.55, 0.755, 2.4]], rot: Math.PI },
  pizza: { name: 'Pizza', emoji: '🍕', price: 18, desc: 'Robots can’t eat. They’ll appreciate the gesture.', parts: [['pizzaBox', 'pizzaBox'], ['pizzaTop', 'pizza']], at: [[-6.6, 0.76, 0.1], [-6.4, 0.76, -0.2]] },
  battery: { name: 'Battery pack', emoji: '🔋', price: 49, desc: 'Instant full charge.', parts: [['batteryPack', 'battery'], ['batteryPackTop', 'black']], consumed: true },
  plant: { name: 'Potted plant', emoji: '🪴', price: 19, desc: 'A little green friend for the desk.', parts: [['pot', 'ceramic'], ['soil', 'soil'], ['leaves', 'leaf'], ['stems', 'stem']], scale: 1.4, at: [[0.62, 0.745, -0.95], [4.42, 0.755, 2.78]] },
  balloons: { name: 'Party balloons', emoji: '🎈', price: 12, desc: 'Instant party. Causes dancing.', parts: [['balloons', 'balloon'], ['balloonStrings', 'string']], at: [[-0.68, 0.745, -1.0], [4.4, 0.755, 2.45]], bob: true },
  trophy: { name: '“World’s Best Robot” trophy', emoji: '🏆', price: 35, desc: 'Because they deserve it.', parts: [['trophyCup', 'gold'], ['trophyBase', 'black']], at: [[-0.62, 0.745, -0.78], [5.6, 0.755, 2.75]] },
  keyboard: { name: 'Mechanical RGB keyboard', emoji: '⌨️', price: 129, desc: 'Clicky. Kuma types faster on it.', parts: [['winKeyboard', 'plasticDark'], ['winKeycaps', 'rgbKeys']], at: [[0.35, 0.745, -0.62], [4.62, 0.755, 2.55]], offset: [0.04, -0.75, 0.225] },
  linuxUsb: { name: 'Linux install USB', emoji: '🐧', price: 9, desc: 'Kuma gets a few minutes of peace from Windows.', parts: [['usbBody', 'black'], ['usbPlug', 'steel']], scale: 2, at: [[0.2, 0.745, -0.5], [5.85, 0.36, 2.37]], rot: Math.PI / 2 },
  macbook: { name: 'MacBook Air', emoji: '💻', price: 1199, desc: 'For Kuma. No more Windows (for a while).', parts: [['laptopBase', 'alu'], ['keys', 'plasticDark']], laptop: true, at: [[0.55, 0.745, -0.62], [4.62, 0.755, 2.5]], rot: 0.25 },
  spareParts: { name: 'Spare parts kit', emoji: '🧰', price: 79, desc: 'Repairs a broken robot.', parts: [['sparePartsBox', 'red']], consumed: true },
};

export class Delivery {
  constructor({ scene, geos, layout, M, audio, hooks = {} }) {
    Object.assign(this, { scene, geos, layout, M, audio, hooks });
    this.orders = [];
    this.nextId = 1;
    this.drone = null;
    this.parcels = [];
    this.bobbing = [];
    const mk = (o) => new THREE.MeshStandardMaterial(o);
    this.mat = {
      card: mk({ color: 0xc89b62, roughness: 0.9 }), tape: mk({ color: 0xe0c48e, roughness: 0.5 }), label: mk({ color: 0xf6f6f2, roughness: 0.7 }),
      duck: new THREE.MeshPhysicalMaterial({ color: 0xffd23a, roughness: 0.3, clearcoat: 0.6 }), beak: mk({ color: 0xff8a1f, roughness: 0.4 }), black: mk({ color: 0x18191c, roughness: 0.4 }),
      tin: new THREE.MeshPhysicalMaterial({ color: 0x5f8f2e, roughness: 0.25, metalness: 0.6, clearcoat: 0.8 }), cream: mk({ color: 0xf2ead2, roughness: 0.6 }),
      pizzaBox: mk({ color: 0xf3efe6, roughness: 0.8 }), pizza: mk({ color: 0xe0782f, roughness: 0.7 }), battery: mk({ color: 0x2fae5a, roughness: 0.4, metalness: 0.2 }),
      gold: new THREE.MeshPhysicalMaterial({ color: 0xf2c14e, roughness: 0.15, metalness: 1, clearcoat: 1 }), balloon: new THREE.MeshPhysicalMaterial({ color: 0xff4d6d, roughness: 0.15, clearcoat: 1 }),
      string: mk({ color: 0xffffff, roughness: 0.8 }), red: mk({ color: 0xc8302a, roughness: 0.4 }), steel: mk({ color: 0xc9ccd1, roughness: 0.3, metalness: 1 }),
      droneBody: new THREE.MeshPhysicalMaterial({ color: 0xf4f6f9, roughness: 0.3, clearcoat: 1 }), droneDark: mk({ color: 0x2a2d33, roughness: 0.5 }),
      droneLight: mk({ color: 0x000000, emissive: 0x49e3ff, emissiveIntensity: 6 }),
    };
  }

  mesh(part, mat, parent) {
    if (!this.geos[part]) return null;
    const m = new THREE.Mesh(this.geos[part], this.mat[mat] || this.M[mat] || this.M.plasticDark);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // ------------------------------------------------------------ ordering
  order(itemId, who) {
    const item = ITEMS[itemId];
    if (!item) return null;
    const o = { id: this.nextId++, itemId, item, who, status: 'processing', t: 0, eta: 6 + Math.random() * 4 };
    this.orders.push(o);
    this.hooks.changed?.(o);
    return o;
  }

  setStatus(o, status) {
    o.status = status;
    this.hooks.changed?.(o);
  }

  // ------------------------------------------------------------ the drone
  buildDrone() {
    const g = new THREE.Group();
    this.mesh('droneBody', 'droneBody', g);
    this.mesh('droneArms', 'droneDark', g);
    this.mesh('droneLegs', 'droneDark', g);
    this.mesh('droneLights', 'droneLight', g);
    g.userData.rotors = (this.layout.droneRotors || []).map((p) => { const r = this.mesh('droneRotor', 'droneDark', g); r?.position.fromArray(p); return r; }).filter(Boolean);
    g.scale.setScalar(1.3);
    this.scene.add(g);
    return g;
  }

  buildParcel(o) {
    const g = new THREE.Group();
    g.name = `parcel-${o.id}`;
    this.mesh('parcel', 'card', g);
    this.mesh('parcelTape', 'tape', g);
    this.mesh('parcelLabel', 'label', g);
    // two lid flaps, hinged along the top long edges
    const [w, h, d] = this.layout.parcel?.size || [0.36, 0.26, 0.28];
    g.userData.flaps = [1, -1].map((sz) => {
      const hinge = new THREE.Group();
      hinge.position.set(0, h + 0.003, sz * d / 2);
      const f = this.mesh('parcelFlap', 'card', hinge);
      if (f) f.rotation.y = sz > 0 ? Math.PI : 0; // each flap reaches in towards the middle
      g.add(hinge);
      return hinge;
    });
    g.userData.order = o;
    o.parcel = g;
    return g;
  }

  buildItem(itemId) {
    const it = ITEMS[itemId];
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    for (const [p, m] of it.parts) this.mesh(p, m, inner);
    if (it.laptop && this.layout.laptop?.lidPivot) {
      // open lid with a bright "Hello" screen
      const lid = new THREE.Group();
      lid.position.fromArray(this.layout.laptop.lidPivot);
      lid.rotation.x = -0.27;
      inner.add(lid);
      this.mesh('laptopLid', 'alu', lid);
      const c = document.createElement('canvas');
      c.width = 256; c.height = 160;
      const x = c.getContext('2d');
      const grd = x.createLinearGradient(0, 0, 256, 160);
      grd.addColorStop(0, '#3a7bd5'); grd.addColorStop(1, '#c86dd7');
      x.fillStyle = grd; x.fillRect(0, 0, 256, 160);
      x.fillStyle = '#fff'; x.font = '600 34px -apple-system, Helvetica, sans-serif'; x.textAlign = 'center';
      x.fillText('hello, Kuma', 128, 92);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.338, 0.2163), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      scr.position.set(0, 0.125, 0.0006);
      lid.add(scr);
    }
    if (it.offset) inner.position.fromArray(it.offset);
    inner.scale.setScalar(it.scale || 1);
    return g;
  }

  porch(i = 0) {
    const [x, y, z] = this.layout.shop?.porchDrop || [10.3, -0.3, -3.2];
    return V(x + (i % 2) * 0.45, y, z + Math.floor(i / 2) * 0.45 - (i % 2 ? 0.2 : 0));
  }

  // ------------------------------------------------------------ per frame
  update(dt, now) {
    for (const o of this.orders) {
      if (o.status === 'processing') { o.t += dt; if (o.t > o.eta && !this.drone) this.launch(o); }
    }
    const d = this.drone;
    if (d) {
      d.t += dt;
      const g = d.group;
      for (const r of g.userData.rotors) r.rotation.y += dt * 60;
      const hover = d.drop.clone().add(V(0, 2.4, 0));
      const low = d.drop.clone().add(V(0, 0.95, 0));
      if (d.phase === 'in') {
        const k = Math.min(1, d.t / 4.5);
        g.position.lerpVectors(d.from, hover, ease(k));
        g.rotation.z = Math.sin(k * Math.PI) * 0.2;
        if (k >= 1) { d.phase = 'down'; d.t = 0; }
      } else if (d.phase === 'down') {
        const k = Math.min(1, d.t / 1.4);
        g.position.lerpVectors(hover, low, ease(k));
        if (k >= 1) { d.phase = 'drop'; d.t = 0; this.release(d); }
      } else if (d.phase === 'drop') {
        g.position.copy(low).add(V(0, Math.sin(d.t * 3) * 0.03, 0));
        if (d.t > 0.9) { d.phase = 'out'; d.t = 0; d.from = g.position.clone(); }
      } else if (d.phase === 'out') {
        const k = Math.min(1, d.t / 4);
        g.position.lerpVectors(d.from, d.from.clone().add(V(10, 22, 12)), ease(k));
        if (k >= 1) { this.scene.remove(g); this.drone = null; }
      }
      g.position.y += Math.sin(now * 7) * 0.01;
      if (d.parcel && d.parcel.parent === g) d.parcel.position.set(0, -0.48, 0);
    }
    for (const p of this.parcels) {
      if (!p.falling) continue;
      p.v -= 9.8 * dt;
      p.g.position.y += p.v * dt;
      if (p.g.position.y <= p.ground) {
        p.g.position.y = p.ground;
        p.falling = false;
        this.audio.thud();
        this.ring(p.order);
      }
    }
    for (const b of this.bobbing) {
      b.rotation.z = Math.sin(now * 1.3 + b.id) * 0.05;
      b.rotation.x = Math.sin(now * 1.1 + b.id * 2) * 0.04;
    }
  }

  launch(o) {
    this.setStatus(o, 'flying');
    const g = this.buildDrone();
    const waiting = this.parcels.filter((p) => !p.taken).length;
    const drop = this.porch(waiting);
    const from = drop.clone().add(V(18, 24, 9));
    g.position.copy(from);
    const parcel = this.buildParcel(o);
    g.add(parcel);
    parcel.position.set(0, -0.48, 0);
    parcel.scale.setScalar(1 / 1.3);
    this.drone = { group: g, t: 0, phase: 'in', from, drop, parcel, order: o };
    this.audio.whoosh();
  }

  release(d) {
    const p = d.parcel;
    this.scene.attach(p);
    p.scale.setScalar(1);
    p.rotation.set(0, Math.random() * 0.6 - 0.3, 0);
    this.parcels.push({ g: p, v: 0, falling: true, ground: d.drop.y, order: d.order, taken: false });
    d.parcel = null;
  }

  ring(o) {
    this.audio.tone({ freq: 784, dur: 0.5, type: 'sine', gain: 0.12 });
    this.audio.tone({ freq: 622, dur: 0.7, type: 'sine', gain: 0.12, at: 0.45 });
    this.setStatus(o, 'delivered');
    this.hooks.arrived?.(o);
  }

  /** The parcel waiting on the porch for this order. */
  parcelFor(o) { return this.parcels.find((p) => p.order === o); }

  take(o) { const p = this.parcelFor(o); if (p) p.taken = true; this.setStatus(o, 'carrying'); return p?.g; }

  /** Open the box where it stands, lift the item out and fly it to its spot (or use it up). */
  async unbox(o, who, wait) {
    const box = o.parcel;
    this.setStatus(o, 'unboxing');
    this.scene.attach(box);
    const [f0, f1] = box.userData.flaps;
    this.audio.noise({ dur: 0.35, freq: 1800, sweepTo: 900, q: 0.8, gain: 0.08 });
    await wait(0.6, (k) => { f0.rotation.x = ease(k) * 2.2; f1.rotation.x = -ease(k) * 2.2; });
    const it = o.item;
    const item = this.buildItem(o.itemId);
    const start = box.getWorldPosition(V()).add(V(0, 0.08, 0));
    item.position.copy(start);
    this.scene.add(item);
    this.audio.happy?.();
    await wait(0.7, (k) => { item.position.y = start.y + ease(k) * 0.45; item.rotation.y = k * Math.PI * 2; });
    if (it.consumed) {
      await wait(0.5, (k) => item.scale.setScalar(1 - k));
      this.scene.remove(item);
    } else {
      const to = V(...it.at[who === 'kuma' ? 1 : 0]);
      const from = item.position.clone();
      await wait(1.1, (k) => {
        item.position.lerpVectors(from, to, ease(k));
        item.position.y += Math.sin(k * Math.PI) * 0.6;
        item.rotation.y = (it.rot || 0) * ease(k) + (1 - k) * Math.PI * 2;
      });
      item.position.copy(to);
      item.rotation.y = it.rot || 0;
      if (it.bob) { item.userData.id = Math.random() * 10; this.bobbing.push(item); }
      o.object = item;
    }
    // fold the box away
    await wait(0.5, (k) => box.scale.setScalar(Math.max(0.01, 1 - k)));
    this.scene.remove(box);
    this.parcels = this.parcels.filter((p) => p.order !== o);
    this.setStatus(o, 'unboxed');
    this.hooks.unboxed?.(o, who);
  }
}
