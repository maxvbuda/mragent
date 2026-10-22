import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { floorTextures, noiseRoughness } from './assets.js';

/**
 * The rest of Mr. Agent's house: floors, walls with doors and windows (cut away
 * Sims-style when they block the view), furniture modelled in FreeCAD, garden and sky.
 */
const ROOM_WALL = { office: 0xe9e5de, kitchen: 0xf1ede6, living: 0xdfe5ea, hallway: 0xefe9df, bedroom: 0xe3dde9, bathroom: 0xf4f6f6, workshop: 0xcfd2d4 };
const OFFICE_ACCENT = 0xb9c7bd;
const CUT_H = 0.34;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function tileTexture({ px = 512, n = 4, grout = '#c9c6bf', colors = ['#f2f0eb', '#ecebe6', '#efede8'], seed = 3 } = {}) {
  const r = seeded(seed);
  return canvasTex(px, px, (x) => {
    x.fillStyle = grout;
    x.fillRect(0, 0, px, px);
    const t = px / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      x.fillStyle = colors[Math.floor(r() * colors.length)];
      x.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      x.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`;
      x.fillRect(i * t + 4, j * t + 4, t * 0.6, t * 0.25);
    }
  });
}

function carpetTexture(base = [138, 146, 168]) {
  const r = seeded(11);
  return canvasTex(256, 256, (x) => {
    const img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 26;
      img.data[i] = base[0] + n; img.data[i + 1] = base[1] + n; img.data[i + 2] = base[2] + n; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  });
}

function concreteTexture() {
  const r = seeded(5);
  return canvasTex(512, 512, (x) => {
    x.fillStyle = '#b9b9b4';
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,40,40'},${r() * 0.06})`;
      const s = 1 + r() * 7;
      x.fillRect(r() * 512, r() * 512, s, s);
    }
    x.strokeStyle = 'rgba(80,80,78,0.35)';
    x.lineWidth = 2;
    x.strokeRect(0, 0, 512, 512);
  });
}

function grassTexture() {
  const r = seeded(21);
  return canvasTex(512, 512, (x) => {
    x.fillStyle = '#6f9a4e';
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) {
      const g = 110 + r() * 70;
      x.fillStyle = `rgba(${60 + r() * 40},${g},${40 + r() * 30},${0.25 + r() * 0.35})`;
      x.fillRect(r() * 512, r() * 512, 1 + r() * 2, 2 + r() * 5);
    }
  });
}

function rugCanvas(kind) {
  return canvasTex(512, 512, (x, w, h) => {
    if (kind === 'living') {
      x.fillStyle = '#d8cfc0'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#2f4858'; x.lineWidth = 22; x.strokeRect(24, 24, w - 48, h - 48);
      x.strokeStyle = '#c86b4f'; x.lineWidth = 6; x.strokeRect(58, 58, w - 116, h - 116);
      x.fillStyle = '#2f4858';
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { x.beginPath(); x.arc(110 + i * 58, 110 + j * 58, 8, 0, Math.PI * 2); x.fill(); }
    } else if (kind === 'bedroom') {
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#e9e1f0'); g.addColorStop(1, '#cfc3dd');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 3;
      for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(0, i * 34); x.lineTo(w, i * 34 + 40); x.stroke(); }
    } else {
      x.fillStyle = kind === 'bath' ? '#8fb8c9' : '#6b4f3a';
      x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,255,255,0.15)';
      for (let i = 0; i < 40; i++) x.fillRect(0, i * 13, w, 4);
      if (kind === 'entry') { x.fillStyle = '#f2e3cf'; x.font = '700 90px Georgia, serif'; x.textAlign = 'center'; x.fillText('BEEP', w / 2, h / 2 + 30); }
    }
  });
}

export function buildHouse(scene, geos, layout, M, robotGeos, robotMats) {
  const H = layout.house;
  const group = new THREE.Group();
  group.name = 'house';
  scene.add(group);
  const out = { group, tags: {}, pieces: [], lights: [] };

  // ------------------------------------------------------------ materials for the new furniture
  const mk = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const X = {
    cabinet: mk({ color: 0xf2efe9, roughness: 0.5 }),
    stone: phys({ color: 0xd8d6d2, roughness: 0.25, clearcoat: 0.6, map: noiseRoughness(128, 0.9, 1.0, 2) }),
    steel: mk({ color: 0xc9ccd1, roughness: 0.32, metalness: 1 }),
    steelDark: mk({ color: 0x3d4148, roughness: 0.45, metalness: 0.8 }),
    blackGlass: phys({ color: 0x0c0d10, roughness: 0.08, clearcoat: 1 }),
    sofa: phys({ color: 0x5c7290, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0xaec2dc) }),
    sofaCushion: phys({ color: 0x6b84a6, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0xc5d6ec) }),
    pillow: phys({ color: 0xe8834f, roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color(0xffc6a0) }),
    linen: mk({ color: 0xf6f4ef, roughness: 0.95 }),
    blanket: phys({ color: 0x6f9c88, roughness: 0.95, sheen: 0.8, sheenColor: new THREE.Color(0xbfe4d2) }),
    fabricBlue: phys({ color: 0x46577a, roughness: 0.9, sheen: 0.7, sheenColor: new THREE.Color(0x9fb3d8) }),
    chargeGlow: mk({ color: 0x0b1d24, emissive: 0x49e3ff, emissiveIntensity: 0.6 }),
    porcelain: phys({ color: 0xfafafa, roughness: 0.12, clearcoat: 1 }),
    water: phys({ color: 0x9fd4ec, roughness: 0.02, transparent: true, opacity: 0.55, clearcoat: 1 }),
    mirror: mk({ color: 0xdfe6ea, roughness: 0.02, metalness: 1 }),
    butcher: mk({ color: 0xc89a6a, roughness: 0.6 }),
    pegboard: mk({ color: 0xc8a882, roughness: 0.8 }),
    toolsMix: mk({ color: 0xd94b3c, roughness: 0.4, metalness: 0.3 }),
    spool: mk({ color: 0x30d158, roughness: 0.5 }),
    boxes: mk({ color: 0x3f7fd0, roughness: 0.6 }),
    red: phys({ color: 0xc8302a, roughness: 0.3, clearcoat: 0.8 }),
    doorWood: mk({ color: 0x8b5a36, roughness: 0.6 }),
    bark: mk({ color: 0x6b4a32, roughness: 1 }),
    canopy: phys({ color: 0x4c8a45, roughness: 0.9, sheen: 0.5, sheenColor: new THREE.Color(0xa6e09a) }),
    fruit: phys({ color: 0xff8a3d, roughness: 0.4, clearcoat: 0.6 }),
    cans: mk({ color: 0x49e3ff, emissive: 0x0b4b5a, roughness: 0.3, metalness: 0.6 }),
    fridgeLight: mk({ color: 0xffffff, emissive: 0xeaf6ff, emissiveIntensity: 2.5 }),
    booksMix: mk({ color: 0x2e5a86, roughness: 0.8 }),
    towel: mk({ color: 0x7fb8c9, roughness: 1 }),
    rug: mk({ color: 0x6b4f3a, roughness: 1 }),
    deskBlack: phys({ color: 0x15161a, roughness: 0.35, clearcoat: 0.5 }),
    smokedGlass: phys({ color: 0x0d1016, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    rgb: mk({ color: 0x000000, emissive: 0xff00ff, emissiveIntensity: 5 }),
    rgbKeys: mk({ color: 0x111111, emissive: 0x00ffff, emissiveIntensity: 1.6, roughness: 0.6 }),
  };
  const mat = (k) => X[k] || M[k] || M.plasticDark;

  // ------------------------------------------------------------ floors
  const oak = floorTextures();
  const walnut = floorTextures({ seed: 77 });
  const tile = tileTexture();
  const bathTile = tileTexture({ px: 512, n: 8, grout: '#9db7c2', colors: ['#e9f3f6', '#dfeef3', '#f3f8fa'], seed: 9 });
  const carpet = carpetTexture();
  const concrete = concreteTexture();
  const floorMat = {
    oak: phys({ map: oak.map, normalMap: oak.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: oak.roughnessMap, roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.28 }),
    walnut: phys({ map: walnut.map, normalMap: walnut.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: walnut.roughnessMap, roughness: 1, color: 0x9a7a62, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
    tile: phys({ map: tile, roughness: 0.3, clearcoat: 0.4 }),
    bathtile: phys({ map: bathTile, roughness: 0.25, clearcoat: 0.5 }),
    carpet: mk({ map: carpet, roughness: 1 }),
    concrete: mk({ map: concrete, roughness: 0.85 }),
  };
  const tileSize = { oak: oak.tileMeters, walnut: walnut.tileMeters, tile: 2.4, bathtile: 1.2, carpet: 1.0, concrete: 3 };
  out.rooms = H.rooms;
  for (const r of H.rooms) {
    if (r.id === 'office') { // the office keeps the floor it had, built here for consistency
      r.floor = 'oak';
    }
    const [x0, z0, x1, z1] = r.rect;
    const w = x1 - x0, d = z1 - z0;
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tileSize[r.floor], (uv.getY(i) * d) / tileSize[r.floor]);
    const m = new THREE.Mesh(g, floorMat[r.floor]);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    m.receiveShadow = true;
    m.name = `floor-${r.id}`;
    group.add(m);
  }

  // foundation + garden
  const [bx0, bz0, bx1, bz1] = H.bounds;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0 + 0.6, 0.3, bz1 - bz0 + 0.6), mk({ color: 0xcfcac2, roughness: 0.9 }));
  plinth.position.set((bx0 + bx1) / 2, -0.165, (bz0 + bz1) / 2);
  plinth.receiveShadow = true;
  group.add(plinth);
  const grass = grassTexture();
  grass.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 64), mk({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.receiveShadow = true;
  group.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4), mk({ color: 0xbdb4a5, roughness: 0.95 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(bx1 + 3.2, -0.29, -3.2);
  path.receiveShadow = true;
  group.add(path);

  // ------------------------------------------------------------ walls (split into pieces for colours + cutaway)
  const T = H.thickness, HT = H.height;
  const roomAt = (x, z) => H.rooms.find((r) => x > r.rect[0] && x < r.rect[2] && z > r.rect[1] && z < r.rect[3]);
  const wallMats = {};
  const wallMat = (id, accent = false) => {
    const k = `${id}${accent ? '-a' : ''}`;
    if (!wallMats[k]) wallMats[k] = mk({ color: accent ? OFFICE_ACCENT : id === 'outside' ? 0xf3efe8 : ROOM_WALL[id] || 0xeeeeee, roughness: 0.92 });
    return wallMats[k];
  };
  const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const glassMat = phys({ color: 0xcfe6ff, roughness: 0.03, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
  const walls = H.walls;
  const obstacles = [];
  const proxyGeos = []; // full-height copies of every wall piece, merged into one shadow caster
  walls.forEach(([x1, z1, x2, z2, ops], wi) => {
    const horiz = Math.abs(z1 - z2) < 1e-6;
    const len = horiz ? x2 - x1 : z2 - z1;
    // split points: where other walls meet this one (room colours change there) + openings
    const cuts = new Set([0, len]);
    for (const [ox1, oz1, ox2, oz2] of walls) {
      if (horiz && Math.abs(ox1 - ox2) < 1e-6 && Math.min(oz1, oz2) <= z1 + 1e-6 && Math.max(oz1, oz2) >= z1 - 1e-6 && ox1 > x1 && ox1 < x2) cuts.add(ox1 - x1);
      if (!horiz && Math.abs(oz1 - oz2) < 1e-6 && Math.min(ox1, ox2) <= x1 + 1e-6 && Math.max(ox1, ox2) >= x1 - 1e-6 && oz1 > z1 && oz1 < z2) cuts.add(oz1 - z1);
    }
    for (const [a, b] of ops) { cuts.add(a); cuts.add(b); }
    const pts = [...cuts].sort((p, q) => p - q);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (b - a < 1e-4) continue;
      const op = ops.find(([oa, ob]) => a >= oa - 1e-6 && b <= ob + 1e-6);
      const spans = op ? [[0, op[2]], [op[3], HT]].filter(([y0, y1]) => y1 - y0 > 1e-3) : [[0, HT]];
      const ext0 = i === 0 ? T / 2 : 0, ext1 = i === pts.length - 2 ? T / 2 : 0;
      const L = b - a + ext0 + ext1;
      const mid = (a + b) / 2 + (ext1 - ext0) / 2;
      const cx = horiz ? x1 + mid : x1, cz = horiz ? z1 : z1 + mid;
      const n = horiz ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const sideA = roomAt(cx + n.x * 0.25, cz + n.z * 0.25), sideB = roomAt(cx - n.x * 0.25, cz - n.z * 0.25);
      const office = (s) => s?.id === 'office' && Math.abs(cz - H.bounds[3]) < 0.01;
      const mA = sideA ? wallMat(sideA.id, office(sideA)) : wallMat('outside');
      const mB = sideB ? wallMat(sideB.id, office(sideB)) : wallMat('outside');
      // BoxGeometry face order: +x, -x, +y, -y, +z, -z. Side A is the +normal side.
      const capM = sideA ? mA : mB;
      const faces = horiz ? [capM, capM, capM, capM, mA, mB] : [mA, mB, capM, capM, capM, capM];
      for (const [y0, y1] of spans) {
        const h = y1 - y0;
        const geo = horiz ? new THREE.BoxGeometry(L, h, T) : new THREE.BoxGeometry(T, h, L);
        geo.translate(0, h / 2, 0);
        const m = new THREE.Mesh(geo, faces);
        m.position.set(cx, y0, cz);
        m.receiveShadow = true;
        proxyGeos.push(geo.clone().translate(cx, y0, cz));
        group.add(m);
        out.pieces.push({ mesh: m, y0, h, cut: 0, attached: [], op: op && y0 > 0 ? op : null, cx, cz, a: horiz ? [x1 + a, z1] : [x1, z1 + a], b: horiz ? [x1 + b, z1] : [x1, z1 + b], exterior: wi < 4, outward: wi === 0 ? [0, 1] : wi === 1 ? [0, -1] : wi === 2 ? [-1, 0] : wi === 3 ? [1, 0] : null });
        if (y0 < 0.01) obstacles.push(horiz ? [cx - L / 2, cz - T / 2, cx + L / 2, cz + T / 2] : [cx - T / 2, cz - L / 2, cx + T / 2, cz + L / 2]);
      }
      if (op && op[4] === 'window' && !(wi === 0 && Math.abs(op[0] - 6.95) < 1e-6)) {
        const gw = op[1] - op[0], gh = op[3] - op[2];
        const g = new THREE.Mesh(new THREE.PlaneGeometry(horiz ? gw : gw, gh), glassMat);
        g.position.set(horiz ? x1 + (op[0] + op[1]) / 2 : x1, op[2] + gh / 2, horiz ? z1 : z1 + (op[0] + op[1]) / 2);
        if (!horiz) g.rotation.y = Math.PI / 2;
        group.add(g);
        out.pieces.at(-1).attached.push(g); // glass hides with the wall above it
      }
    }
  });
  out.wallObstacles = obstacles;
  // walls always cast full-height shadows, even while cut away, so the light doesn't jump around
  const proxy = new THREE.Mesh(mergeGeometries(proxyGeos.map((g) => { const n = g.toNonIndexed(); for (const k of Object.keys(n.attributes)) if (k !== 'position') n.deleteAttribute(k); return n; })), shadowMat);
  proxy.castShadow = true;
  proxy.raycast = () => {};
  proxy.matrixAutoUpdate = false;
  group.add(proxy);

  // ------------------------------------------------------------ furniture from FreeCAD
  // Static pieces are merged into one mesh per material (a few dozen draw calls instead of hundreds).
  // Things that move or get looked up (TV, fridge, front door, the shelf with the spare head) and the
  // door/window frames (hidden with their wall) stay as their own groups.
  const KEEP = new Set(['tv', 'fridge', 'frontDoor', 'partsShelf', 'winDesk']);
  const buckets = new Map();
  const SMALL = /(Handles|Faucet|Burners|Knob|fruit|tools|Books|Drawers|Led|Light|cans|Spool|Pillows|towel)/i;
  for (const it of H.furniture) {
    const own = (it.tag && KEEP.has(it.tag)) || /^(doorFrame|winFrame)/.test(it.name);
    const g = new THREE.Group();
    g.name = it.name;
    g.position.fromArray(it.pos);
    g.rotation.y = it.rot;
    g.scale.setScalar(it.scale || 1);
    g.updateMatrix();
    for (const [part, mname] of it.parts) {
      if (!geos[part]) continue;
      const cast = !/^bush/.test(it.name) && !SMALL.test(part) && part !== 'treeTrunk';
      if (own) {
        const m = new THREE.Mesh(geos[part], mat(mname));
        m.castShadow = cast;
        m.receiveShadow = true;
        g.add(m);
        continue;
      }
      const key = `${mname}|${cast}`;
      if (!buckets.has(key)) buckets.set(key, { mat: mat(mname), cast, geos: [] });
      buckets.get(key).geos.push(geos[part].clone().applyMatrix4(g.matrix));
    }
    if (own) {
      group.add(g);
      if (it.tag) (out.tags[it.tag] ||= []).push(g);
    } else if (it.tag) {
      // a stand-in so the brain can still find where things are
      (out.tags[it.tag] ||= []).push(Object.assign(new THREE.Object3D(), { name: it.name }).copy(g, false));
    }
  }
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    group.add(m);
    b.geos.forEach((x) => x.dispose());
  }

  // door and window frames go down with the wall they sit in
  for (const it of H.furniture) {
    if (!/^(doorFrame|winFrame)/.test(it.name)) continue;
    const g = group.getObjectByName(it.name);
    let best = null, bd = 0.9;
    for (const p of out.pieces) {
      if (!p.op) continue;
      const d = Math.hypot(p.cx - it.pos[0], p.cz - it.pos[2]);
      if (d < bd) { bd = d; best = p; }
    }
    if (best && g) best.attached.push(g);
  }

  // fridge door on its hinge
  const fridge = out.tags.fridge?.[0];
  if (fridge && geos.fridgeDoor) {
    const hinge = new THREE.Group();
    hinge.position.fromArray(layout.fridge.hinge);
    fridge.add(hinge);
    const door = new THREE.Mesh(geos.fridgeDoor, X.steel);
    door.castShadow = true;
    hinge.add(door);
    const glow = new THREE.PointLight(0xeaf6ff, 0, 1.2, 2);
    glow.position.set(0, 1.4, -0.1);
    fridge.add(glow);
    out.fridge = { group: fridge, hinge, glow, angle: 0, target: 0 };
  }

  // front door: hinge is the item's origin
  out.frontDoor = out.tags.frontDoor?.[0] ? { group: out.tags.frontDoor[0], base: out.tags.frontDoor[0].rotation.y, angle: 0, target: 0 } : null;

  // TV screen with a little animated channel
  const tv = out.tags.tv?.[0];
  if (tv) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 288;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0x222222 });
    const [sw, sh] = layout.tv.size;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMat);
    // the panel's front faces -z in the TV's own frame; sit the screen just proud of it
    screen.position.fromArray(layout.tv.screen);
    screen.position.z -= 0.002;
    screen.rotation.y = Math.PI;
    tv.add(screen);
    out.tv = { canvas: c, ctx: c.getContext('2d'), tex, mat: screenMat, on: false, t: 0, last: 0 };
  }

  // Kuma's Windows monitor: the screen texture is supplied later by the Windows sim
  const winDesk = out.tags.winDesk?.[0];
  if (winDesk && layout.winPC) {
    const [sw, sh] = layout.winPC.size;
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x222222, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMat);
    screen.position.fromArray(layout.winPC.screen);
    screen.position.z -= 0.001;
    screen.rotation.y = Math.PI;
    winDesk.add(screen);
    out.winScreen = { mesh: screen, mat: screenMat, size: [sw, sh] };
  }
  out.rgb = [X.rgb, X.rgbKeys];

  // spare robot head on the workshop shelf
  const shelf = out.tags.partsShelf?.[0];
  if (shelf && robotGeos.head) {
    const head = new THREE.Group();
    head.position.fromArray(layout.sparePartsShelf.headAt);
    head.rotation.y = 0.5;
    const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.08, clearcoat: 1 });
    for (const [p, m] of [['head', robotMats.shell], ['visor', visorMat], ['ears', robotMats.shell], ['antenna', robotMats.joint], ['neckCollar', robotMats.joint]]) {
      const mesh = new THREE.Mesh(robotGeos[p], m);
      mesh.castShadow = true;
      if (p === 'neckCollar') mesh.position.y = -0.005;
      head.add(mesh);
    }
    head.position.y += 0.012;
    shelf.add(head);
  }

  // rugs
  for (const [kind, x, z, w, d, rot] of [['living', 5.15, 0.6, 2.9, 2.3, 0], ['bedroom', -6.4, -6.25, 2.6, 3.1, 0], ['bath', 0.4, -7.4, 0.9, 0.55, 0], ['entry', 7.95, -3.2, 0.6, 0.95, 0]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mk({ map: rugCanvas(kind), roughness: 1 }));
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(x, 0.005, z);
    m.receiveShadow = true;
    group.add(m);
  }

  // room lights (on at night)
  for (const L of H.lights) {
    const light = new THREE.PointLight(0xffd9a8, 0, 7, 1.6);
    light.position.fromArray(L.pos);
    group.add(light);
    out.lights.push(light);
  }
  out.nightLamps = X; // shade glow handled through M.shade
  out.chargeGlow = X.chargeGlow;

  // ------------------------------------------------------------ sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x6fb6ff) }, bottom: { value: new THREE.Color(0xd8ecff) }, sunDir: { value: new THREE.Vector3(0.3, 0.6, 0.7).normalize() }, sunColor: { value: new THREE.Color(0xfff2d0) }, stars: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float stars; uniform float time;
      varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5), b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5),
              c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5), d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5);
        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(bottom, top, smoothstep(-0.05, 0.6, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.25);
        vec2 cp = d.xz / max(d.y, 0.08) * 1.6 + vec2(time * 0.01, 0.0);
        float cl = noise(cp) * noise(cp * 2.3 + 3.1);
        col = mix(col, mix(vec3(1.0), sunColor, 0.3) * (0.55 + 0.45 * (1.0 - stars)), smoothstep(0.2, 0.5, cl) * 0.6 * smoothstep(0.05, 0.3, h));
        float st = step(0.9985, hash(floor(d * 400.0))) * stars * smoothstep(0.05, 0.3, h);
        col += vec3(st);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false;
  scene.add(sky);
  out.sky = { mesh: sky, uniforms: sky.material.uniforms };

  // ------------------------------------------------------------ ground height: house on its plinth, garden 0.3 m lower
  const O = H.outside || { ground: -0.3, plinth: 0.3 };
  const px0 = bx0 - O.plinth, pz0 = bz0 - O.plinth, px1 = bx1 + O.plinth, pz1 = bz1 + O.plinth;
  out.groundY = (x, z) => {
    const dx = Math.max(px0 - x, 0, x - px1), dz = Math.max(pz0 - z, 0, z - pz1);
    const d = Math.hypot(dx, dz);
    if (d <= 0) return 0;
    const t = Math.min(1, d / 0.85);
    return O.ground * t * t * (3 - 2 * t); // the porch steps (and the plinth edge) ease you down
  };
  out.outdoors = (x, z) => x < bx0 || x > bx1 || z < bz0 || z > bz1;

  // ------------------------------------------------------------ per-frame: cutaway walls, doors, TV
  out.wallMode = 'cutaway';
  const seg = (p1, p2, q1, q2) => {
    const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d1 = d(q1, q2, p1), d2 = d(q1, q2, p2), d3 = d(p1, p2, q1), d4 = d(p1, p2, q2);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  };
  out.update = (dt, camera, target, now) => {
    const C = [camera.position.x, camera.position.z];
    const Tg = [target.x, target.z];
    const high = camera.position.y > 7;
    for (const p of out.pieces) {
      let want = 0;
      if (out.wallMode === 'down') want = 1;
      else if (out.wallMode === 'cutaway') {
        const mx = (p.a[0] + p.b[0]) / 2, mz = (p.a[1] + p.b[1]) / 2;
        if (p.outward && ((C[0] - mx) * p.outward[0] + (C[1] - mz) * p.outward[1]) > 0.2) want = 1;
        else if (!high && seg(p.a, p.b, C, Tg)) want = 1;
      }
      p.cut += (want - p.cut) * (1 - Math.exp(-dt * 9));
      const visH = THREE.MathUtils.lerp(p.h, Math.max(0, CUT_H - p.y0), p.cut);
      p.mesh.visible = visH > 0.002;
      p.mesh.scale.y = Math.max(0.001, visH / p.h);
      for (const a of p.attached) a.visible = p.cut < 0.5;
    }
    if (out.fridge) {
      const f = out.fridge;
      f.angle += (f.target - f.angle) * (1 - Math.exp(-dt * 5));
      f.hinge.rotation.y = f.angle;
      f.glow.intensity = Math.min(1, f.angle / 1.2) * 1.2;
    }
    if (out.frontDoor) {
      const d = out.frontDoor;
      d.angle += (d.target - d.angle) * (1 - Math.exp(-dt * 4));
      d.group.rotation.y = d.base + d.angle;
    }
    if (out.tv && out.tv.visible !== false) drawTV(out.tv, dt, now);
    // gamer RGB, slowly cycling
    X.rgb.emissive.setHSL((now * 0.08) % 1, 1, 0.5);
    X.rgbKeys.emissive.setHSL((now * 0.08 + 0.5) % 1, 1, 0.45);
    if (out.sky) out.sky.uniforms.time.value = now;
  };
  return out;
}

function drawTV(tv, dt, now) {
  tv.mat.color.setScalar(tv.on ? 1 : 0.12);
  if (!tv.on) { if (tv.lastOn !== false) { tv.ctx.fillStyle = '#050608'; tv.ctx.fillRect(0, 0, 512, 288); tv.tex.needsUpdate = true; tv.lastOn = false; } return; }
  tv.lastOn = true;
  tv.t += dt;
  if (now - tv.last < 1 / 15) return;
  tv.last = now;
  const x = tv.ctx, t = tv.t;
  const g = x.createLinearGradient(0, 0, 0, 288);
  g.addColorStop(0, `hsl(${200 + Math.sin(t * 0.3) * 20},70%,60%)`);
  g.addColorStop(1, '#f6e7c8');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 288);
  x.fillStyle = '#6aa84f';
  x.fillRect(0, 210, 512, 78);
  for (let i = 0; i < 3; i++) { // bouncing cartoon robots
    const bx = ((t * 60 + i * 180) % 620) - 60, by = 175 - Math.abs(Math.sin(t * 3 + i)) * 50;
    x.fillStyle = '#f4f6fa'; x.beginPath(); x.ellipse(bx, by, 26, 24, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#05070a'; x.beginPath(); x.roundRect(bx - 18, by - 8, 36, 14, 7); x.fill();
    x.fillStyle = '#49e3ff'; x.beginPath(); x.arc(bx - 8, by - 1, 3, 0, Math.PI * 2); x.arc(bx + 8, by - 1, 3, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = 'rgba(200,30,40,0.92)';
  x.fillRect(0, 252, 512, 36);
  x.fillStyle = '#fff';
  x.font = '600 18px -apple-system, Helvetica';
  const msg = 'ROBO NEWS · Local robot writes 1,204 lines before lunch · Matcha prices stable · FreeCAD 1.1 now models entire houses · ';
  x.fillText(msg + msg, -((t * 70) % (x.measureText(msg).width)), 276);
  x.font = '700 14px -apple-system, Helvetica';
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.fillText('RTV 1', 462, 22);
  tv.tex.needsUpdate = true;
}
