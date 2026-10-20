import * as THREE from 'three';

/** Fetch public/models.json (exported from FreeCAD) and turn every part into a BufferGeometry. */
export async function loadModels(url, onProgress = () => {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 5.5e6;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const text = new TextDecoder().decode(concat(chunks, got));
  const data = JSON.parse(text);
  const geos = {};
  for (const [name, m] of Object.entries(data.meshes)) geos[name] = decode(m);
  return { geos, layout: data.layout };
}

function concat(chunks, size) {
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function bytes(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

function decode(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bytes(m.p)), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bytes(m.n)), 3, true));
  g.setIndex(new THREE.BufferAttribute(m.i32 ? new Uint32Array(bytes(m.i)) : new Uint16Array(bytes(m.i)), 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Planar UVs for geometry that came out of FreeCAD without them. axis: 'y' projects from above. */
export function planarUV(geo, axis = 'y', scaleU = 1, scaleV = 1, offU = 0, offV = 0) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (axis === 'y') { u = x; v = -z; } else if (axis === 'z') { u = x; v = y; } else { u = z; v = y; }
    uv[i * 2] = u * scaleU + offU;
    uv[i * 2 + 1] = v * scaleV + offV;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ------------------------------------------------------------------ procedural textures
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function woodTexture({ base = '#d6b48a', dark = '#b58b5c', w = 1024, h = 512, planks = 1, seed = 3 } = {}) {
  const [c, x] = canvas(w, h);
  const r = seeded(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  const ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const tint = (r() - 0.5) * 18;
    x.fillStyle = `rgba(${tint > 0 ? 255 : 0},${tint > 0 ? 220 : 0},${tint > 0 ? 180 : 0},${Math.abs(tint) / 160})`;
    x.fillRect(0, y0, w, ph);
    for (let i = 0; i < 70; i++) {
      const yy = y0 + r() * ph;
      x.strokeStyle = `rgba(110,70,35,${0.04 + r() * 0.09})`;
      x.lineWidth = 0.6 + r() * 2.2;
      x.beginPath();
      x.moveTo(0, yy);
      const amp = 2 + r() * 7, f = 0.002 + r() * 0.01, ph2 = r() * 6;
      for (let xx = 0; xx <= w; xx += 16) x.lineTo(xx, yy + Math.sin(xx * f + ph2) * amp + Math.sin(xx * f * 3.1) * amp * 0.3);
      x.stroke();
    }
    for (let k = 0; k < 2; k++) { // knots
      if (r() < 0.5) continue;
      const kx = r() * w, ky = y0 + ph * (0.3 + r() * 0.4);
      for (let j = 6; j > 0; j--) {
        x.strokeStyle = `rgba(95,55,25,${0.05 + j * 0.015})`;
        x.lineWidth = 1.2;
        x.beginPath();
        x.ellipse(kx, ky, j * 7, j * 2.6, 0, 0, Math.PI * 2);
        x.stroke();
      }
    }
    if (planks > 1) {
      x.fillStyle = 'rgba(60,35,15,0.35)';
      x.fillRect(0, y0, w, 2);
      const seam = r() * w;
      x.fillRect(seam, y0, 2, ph);
    }
  }
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = dark;
  x.globalAlpha = 0.08;
  x.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function rugTexture() {
  const [c, x] = canvas(1024, 1024);
  const g = x.createRadialGradient(512, 512, 0, 512, 512, 512);
  g.addColorStop(0, '#d9d2c5');
  g.addColorStop(1, '#cfc6b6');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 1024);
  const rings = [[500, '#3c4a5c', 16], [470, '#d9d2c5', 6], [440, '#c86b4f', 5], [300, '#3c4a5c', 3], [160, '#c86b4f', 3]];
  for (const [rad, col, lw] of rings) {
    x.strokeStyle = col; x.lineWidth = lw;
    x.beginPath(); x.arc(512, 512, rad, 0, Math.PI * 2); x.stroke();
  }
  x.fillStyle = '#3c4a5c';
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    x.save(); x.translate(512 + Math.cos(a) * 370, 512 + Math.sin(a) * 370); x.rotate(a);
    x.fillRect(-14, -3, 28, 6); x.restore();
  }
  const r = seeded(9);
  for (let i = 0; i < 26000; i++) { // woven fibres
    x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r() * 0.04})`;
    x.fillRect(r() * 1024, r() * 1024, 1 + r() * 3, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function noiseRoughness(size = 256, lo = 0.4, hi = 0.7, seed = 5) {
  const [c, x] = canvas(size, size);
  const img = x.createImageData(size, size);
  const r = seeded(seed);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((lo + (hi - lo) * r()) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------ material library
export function makeMaterials() {
  const M = {};
  M.shell = new THREE.MeshPhysicalMaterial({
    color: 0xe9edf3, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
    sheen: 0.08, sheenColor: new THREE.Color(0xdfe9ff), sheenRoughness: 0.5,
  });
  M.joint = new THREE.MeshPhysicalMaterial({ color: 0x24272e, roughness: 0.38, metalness: 0.75, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.85, metalness: 0 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.09, metalness: 1 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.38, metalness: 1 });
  M.glow = new THREE.MeshStandardMaterial({ color: 0x0b1d24, emissive: 0x49e3ff, emissiveIntensity: 10, roughness: 0.3 });
  M.glowSoft = new THREE.MeshStandardMaterial({ color: 0x0b1d24, emissive: 0x49e3ff, emissiveIntensity: 1.6, roughness: 0.3 });
  M.ledGreen = new THREE.MeshStandardMaterial({ color: 0x0b240f, emissive: 0x5dff8a, emissiveIntensity: 2.6 });
  M.cableRed = new THREE.MeshPhysicalMaterial({ color: 0xe0453a, roughness: 0.35, clearcoat: 0.6 });
  M.cableBlue = new THREE.MeshPhysicalMaterial({ color: 0x2f6fe0, roughness: 0.35, clearcoat: 0.6 });
  M.cableYellow = new THREE.MeshPhysicalMaterial({ color: 0xf0b429, roughness: 0.35, clearcoat: 0.6 });

  const wood = woodTexture({ base: '#d9b78c', seed: 11 });
  M.wood = new THREE.MeshPhysicalMaterial({ map: wood, roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.6 });
  const wood2 = woodTexture({ base: '#c79d6c', seed: 17 });
  M.woodDark = new THREE.MeshStandardMaterial({ map: wood2, roughness: 0.55 });
  M.powder = new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: 0.45, metalness: 0.15 });
  M.fabric = new THREE.MeshPhysicalMaterial({ color: 0x353a44, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0x8892a6), sheenRoughness: 0.6 });
  M.plasticDark = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.4, metalness: 0.2 });
  M.alu = new THREE.MeshPhysicalMaterial({ color: 0x8a8f97, roughness: 0.32, metalness: 1, clearcoat: 0.2 });
  M.mug = new THREE.MeshPhysicalMaterial({ color: 0xe8714f, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  M.coffee = new THREE.MeshPhysicalMaterial({ color: 0x6f9a34, roughness: 0.35, clearcoat: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0xc8e59a) }); // matcha
  M.ceramic = new THREE.MeshPhysicalMaterial({ color: 0xf1eee8, roughness: 0.25, clearcoat: 0.7 });
  M.soil = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 });
  M.leaf = new THREE.MeshPhysicalMaterial({ color: 0x3e8a52, roughness: 0.5, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(0x9fe0a8) });
  M.stem = new THREE.MeshStandardMaterial({ color: 0x4f7a3e, roughness: 0.7 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0x24456e, roughness: 0.75 });
  M.band = new THREE.MeshStandardMaterial({ color: 0xf0b429, roughness: 0.6 });
  M.pen = new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.2, metalness: 0.4, clearcoat: 1 });
  M.books = ['#b8503d', '#2e5a86', '#dca83a', '#4a7c59', '#e6dfd0'].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.78 }),
  );
  M.globe = new THREE.MeshPhysicalMaterial({ color: 0x3d7fb8, roughness: 0.3, clearcoat: 1 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.28, metalness: 1 });
  M.cabinet = new THREE.MeshStandardMaterial({ color: 0xe7e2d9, roughness: 0.55 });
  M.machine = new THREE.MeshPhysicalMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.5, clearcoat: 0.5 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x9fc6e8, roughness: 0.06, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.38, depthWrite: false });
  M.button = new THREE.MeshStandardMaterial({ color: 0x102018, emissive: 0x5dff8a, emissiveIntensity: 1.2 });
  M.shade = new THREE.MeshStandardMaterial({ color: 0xf3eee5, roughness: 0.8, side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0 });
  M.bulb = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd9a0, emissiveIntensity: 0.2 });
  M.marble = new THREE.MeshPhysicalMaterial({ color: 0xe9e7e2, roughness: 0.15, clearcoat: 1 });
  M.frameWhite = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.5 });
  M.keys = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55 });
  return M;
}

/**
 * Oak plank floor: colour, normal (bevelled seams) and roughness maps painted together,
 * so every board has its own tone, grain direction, joints and sheen.
 * One tile = 8 boards across; boards run along the texture's X axis.
 */
export function floorTextures({ size = 2048, boards = 8, seed = 41 } = {}) {
  const r = seeded(seed);
  const [cc, cx] = canvas(size, size); // colour
  const [nc, nx] = canvas(size, size); // normal
  const [rc, rx] = canvas(size, size); // roughness
  const bh = size / boards;
  nx.fillStyle = 'rgb(128,128,255)';
  nx.fillRect(0, 0, size, size);
  const tones = [[205, 168, 120], [196, 154, 104], [214, 178, 130], [188, 146, 98], [208, 162, 112], [200, 160, 116]];
  for (let b = 0; b < boards; b++) {
    const y0 = b * bh;
    // staggered joints: each row gets 1-2 board ends
    const joints = [];
    let x = -r() * size * 0.6;
    while (x < size) { joints.push(x); x += size * (0.45 + r() * 0.5); }
    joints.push(size);
    for (let j = 0; j < joints.length - 1; j++) {
      const xa = Math.max(0, joints[j]), xb = joints[j + 1];
      if (xb <= 0) continue;
      const [tr, tg, tb] = tones[Math.floor(r() * tones.length)];
      const k = 0.92 + r() * 0.14;
      const g = cx.createLinearGradient(xa, y0, xb, y0 + bh);
      g.addColorStop(0, `rgb(${tr * k},${tg * k},${tb * k})`);
      g.addColorStop(1, `rgb(${tr * k * 0.95},${tg * k * 0.94},${tb * k * 0.92})`);
      cx.fillStyle = g;
      cx.fillRect(xa, y0, xb - xa, bh);
      // grain: long wavy lines plus a few cathedral arches
      cx.save();
      cx.beginPath();
      cx.rect(xa, y0, xb - xa, bh);
      cx.clip();
      for (let i = 0; i < 46; i++) {
        const yy = y0 + r() * bh;
        cx.strokeStyle = `rgba(${r() < 0.5 ? '90,55,25' : '120,80,40'},${0.05 + r() * 0.12})`;
        cx.lineWidth = 0.6 + r() * 1.8;
        cx.beginPath();
        const amp = 1 + r() * 4, f = 0.003 + r() * 0.008, ph = r() * 9;
        for (let xx = xa; xx <= xb + 8; xx += 8) cx.lineTo(xx, yy + Math.sin(xx * f + ph) * amp);
        cx.stroke();
      }
      for (let a = 0; a < 2; a++) {
        const cxp = xa + r() * (xb - xa), cy = y0 + bh * (0.3 + r() * 0.4);
        for (let ring = 1; ring < 9; ring++) {
          cx.strokeStyle = `rgba(100,60,28,${0.05 + ring * 0.008})`;
          cx.lineWidth = 1.2;
          cx.beginPath();
          cx.ellipse(cxp, cy, ring * 26 + r() * 6, ring * 3.2, 0, Math.PI * 0.05, Math.PI * 0.95);
          cx.stroke();
        }
      }
      cx.restore();
      // roughness: each board slightly different, grain a touch rougher
      const rough = Math.round((0.42 + r() * 0.16) * 255);
      rx.fillStyle = `rgb(${rough},${rough},${rough})`;
      rx.fillRect(xa, y0, xb - xa, bh);
      // bevelled end joint
      if (xa > 0) {
        cx.fillStyle = 'rgba(60,35,15,0.55)';
        cx.fillRect(xa - 1.5, y0, 3, bh);
        nx.fillStyle = 'rgb(70,128,230)'; nx.fillRect(xa - 4, y0, 3, bh);
        nx.fillStyle = 'rgb(186,128,230)'; nx.fillRect(xa + 1, y0, 3, bh);
        rx.fillStyle = 'rgb(235,235,235)'; rx.fillRect(xa - 2, y0, 4, bh);
      }
    }
    // long seams between rows: dark groove + bevel normals on both sides
    cx.fillStyle = 'rgba(55,32,14,0.6)';
    cx.fillRect(0, y0 - 1.5, size, 3);
    nx.fillStyle = 'rgb(128,186,230)'; nx.fillRect(0, y0 + 1, size, 4);
    nx.fillStyle = 'rgb(128,70,230)'; nx.fillRect(0, y0 - 5, size, 4);
    rx.fillStyle = 'rgb(235,235,235)'; rx.fillRect(0, y0 - 2, size, 4);
  }
  // fine pores for roughness
  const img = rx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  rx.putImageData(img, 0, 0);
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return { map: mk(cc, true), normalMap: mk(nc, false), roughnessMap: mk(rc, false), tileMeters: boards * 0.17 };
}
