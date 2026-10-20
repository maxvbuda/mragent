import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh } from './geometry.js';

// Fine mechanical detail for the robot: hairline panel seams, screw heads,
// bolt caps and sleeves. The parts are tiny, so each bone collects them per
// material and gets one merged mesh that never casts a shadow; that keeps the
// draw calls and the shadow pass almost where they were.

export const detailMats = {
  // A mid-grey for the hairline gaps between shell panels, close to the panel
  // lines printed on the chest and skull.
  seam: new THREE.MeshStandardMaterial({ color: 0x5d6570, metalness: 0.25, roughness: 0.5 }),
};

const _u = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * The surface of a superShape() as a function of direction, so details can be
 * laid exactly on a shell: `at(dir)` gives the point for a unit direction (as
 * the sphere vertex it came from) and `normalAt(dir)` its outward normal.
 */
export function superSurface(rx, ry, rz, { exp = 3, deform = null, offset = null } = {}) {
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const at = (dir, out = new THREE.Vector3()) => {
    const s = Math.pow(Math.abs(dir.x) ** exp + Math.abs(dir.y) ** exp + Math.abs(dir.z) ** exp, 1 / exp) || 1;
    n.copy(dir).divideScalar(s);
    v.set(n.x * rx, n.y * ry, n.z * rz);
    if (deform) deform(v, n);
    out.copy(v);
    if (offset) out.add(offset);
    return out;
  };
  const normalAt = (dir, out = new THREE.Vector3()) => {
    _u.copy(dir).normalize();
    _t1.set(0, 1, 0);
    if (Math.abs(_u.y) > 0.9) _t1.set(1, 0, 0);
    _t1.cross(_u).normalize();
    _t2.crossVectors(_u, _t1);
    const e = 1e-3;
    at(_u, _p);
    at(_a.copy(_u).addScaledVector(_t1, e).normalize(), _a).sub(_p);
    at(_b.copy(_u).addScaledVector(_t2, e).normalize(), _b).sub(_p);
    out.crossVectors(_a, _b).normalize();
    // Point it away from the shell's centre (all the shells are convex).
    const c = offset ? _a.copy(_p).sub(offset) : _a.copy(_p);
    if (out.dot(c) < 0) out.negate();
    return out;
  };
  return { at, normalAt };
}

/**
 * A hairline seam: a narrow flat ribbon lying a fraction of a millimetre
 * above a surface along a chain of directions (see superSurface()).
 */
export function seamStrip(surface, dirs, { width = 0.0013, lift = 0.00025, closed = true } = {}) {
  const n = dirs.length;
  const C = dirs.map((d) => surface.at(d));
  const N = dirs.map((d) => surface.normalAt(d));
  const pos = new Float32Array(n * 2 * 3);
  const nor = new Float32Array(n * 2 * 3);
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const prev = closed ? C[(i - 1 + n) % n] : C[Math.max(0, i - 1)];
    const next = closed ? C[(i + 1) % n] : C[Math.min(n - 1, i + 1)];
    T.subVectors(next, prev).normalize();
    B.crossVectors(N[i], T).normalize();
    for (let k = 0; k < 2; k++) {
      const o = (i * 2 + k) * 3;
      const side = k ? -width / 2 : width / 2;
      pos[o] = C[i].x + B.x * side + N[i].x * lift;
      pos[o + 1] = C[i].y + B.y * side + N[i].y * lift;
      pos[o + 2] = C[i].z + B.z * side + N[i].z * lift;
      nor[o] = N[i].x;
      nor[o + 1] = N[i].y;
      nor[o + 2] = N[i].z;
    }
  }
  const index = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const a = i * 2;
    const b = j * 2;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(index);
  // Face the triangles outwards whatever way the chain runs.
  const tri = new THREE.Triangle(
    new THREE.Vector3().fromArray(pos, index[0] * 3),
    new THREE.Vector3().fromArray(pos, index[1] * 3),
    new THREE.Vector3().fromArray(pos, index[2] * 3),
  );
  if (tri.getNormal(new THREE.Vector3()).dot(N[0]) < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    geo.setIndex(index);
  }
  return geo;
}

/** Directions round a ring of constant normalised height `y` (a latitude). */
export function latitude(y, segments = 96) {
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return out;
}

/** Orients a geometry built along +Y so that +Y follows `normal`, then moves it to `point`. */
export function placeOn(geo, point, normal, lift = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  geo.applyQuaternion(q);
  geo.translate(point.x + normal.x * lift, point.y + normal.y * lift, point.z + normal.z * lift);
  return geo;
}

/** A small domed screw head, built standing on the origin along +Y. */
export function screwHead(radius = 0.0034, height = 0.0012) {
  const geo = new THREE.SphereGeometry(radius, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.scale(1, height / radius, 1);
  return geo;
}

/** A hex socket for a screw head: a dark six-sided recess sitting in the dome. */
export function hexSocket(radius = 0.0013, height = 0.0014) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 6);
  geo.translate(0, height / 2, 0);
  return geo;
}

/** A screw on a superShape surface at `dir`: returns [head, socket] geometries. */
export function screwOn(surface, dir, { radius = 0.0034, height = 0.0012 } = {}) {
  const d = dir.clone().normalize();
  const p = surface.at(d);
  const nrm = surface.normalAt(d);
  const head = placeOn(screwHead(radius, height), p, nrm, -0.0002);
  const socket = placeOn(hexSocket(radius * 0.38, height * 1.2), p, nrm, -0.0001);
  return [head, socket];
}

/**
 * Collects detail geometry per material for one bone and adds it as one merged
 * mesh per material. Detail never casts a shadow: it is far too small to show
 * in a 2048 shadow map and would only grow the shadow pass.
 */
export class DetailBatch {
  constructor() {
    this.parts = new Map();
  }

  add(material, ...geos) {
    if (!this.parts.has(material)) this.parts.set(material, []);
    const list = this.parts.get(material);
    for (const g of geos.flat()) {
      if (g.attributes.uv) g.deleteAttribute('uv');
      list.push(g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]));
    }
    return this;
  }

  /** Adds the merged meshes to `parent` and frees the pieces. */
  build(parent, name) {
    for (const [material, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = mesh(merged, material, { cast: false, name: name ? `${name}-detail` : undefined });
      parent.add(m);
    }
    this.parts.clear();
  }
}

/**
 * Gives a mesh a coarser stand-in for the shadow pass. Both versions live in
 * one geometry; the main pass draws the fine triangles and the shadow pass
 * swaps the draw range to the coarse ones for that one draw. A 2048 shadow map
 * can't show the difference, and the shadow pass stays as light as before.
 */
export function shadowLod(m, lo) {
  const hi = m.geometry;
  const hiCount = hi.index.count;
  const geo = mergeGeometries([hi, lo], false);
  hi.dispose();
  lo.dispose();
  const loCount = geo.index.count - hiCount;
  geo.setDrawRange(0, hiCount);
  m.geometry = geo;
  m.onBeforeShadow = () => geo.setDrawRange(hiCount, loCount);
  m.onAfterShadow = () => geo.setDrawRange(0, hiCount);
  return m;
}
