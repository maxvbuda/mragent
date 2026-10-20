import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Small geometry kit used to build the robot and the furniture.
// All sizes are in metres.

/**
 * Welds a geometry's seams and gives it smooth normals.
 * UVs are dropped, because they stop the seam vertices from merging.
 */
export function smoothed(geo) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const merged = mergeVertices(geo, 1e-5);
  merged.computeVertexNormals();
  geo.dispose();
  return merged;
}

/**
 * A superellipsoid: exp = 2 gives an ellipsoid, larger values square it off
 * into a soft "pebble box". `deform(v, n)` may move each point; `n` holds the
 * point's normalised coordinates (each in -1..1) before scaling.
 */
export function superShape(rx, ry, rz, { exp = 3, segW = 40, segH = 28, deform = null } = {}) {
  const geo = new THREE.SphereGeometry(1, segW, segH);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const s = Math.pow(Math.abs(v.x) ** exp + Math.abs(v.y) ** exp + Math.abs(v.z) ** exp, 1 / exp) || 1;
    n.copy(v).divideScalar(s);
    v.set(n.x * rx, n.y * ry, n.z * rz);
    if (deform) deform(v, n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return smoothed(geo);
}

/** Planar UVs projected along +Z, for decals printed on the front of a part. */
export function frontUVs(geo, cx, cy, w, h, { backU = 0.01, backV = 0.01, minZ = -1e9 } = {}) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (z >= minZ) {
      uv[i * 2] = (x - cx) / w + 0.5;
      uv[i * 2 + 1] = (y - cy) / h + 0.5;
    } else {
      uv[i * 2] = backU;
      uv[i * 2 + 1] = backV;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** A lathe through a smooth spline of [radius, height] points. */
export function latheSmooth(points, { segments = 64, samples = 48, phiStart = 0, phiLength = Math.PI * 2 } = {}) {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const pts = curve.getPoints(samples).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  const geo = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  geo.userData.profile = pts;
  return geo;
}

/** A plain lathe through the given points (sharp corners kept). */
export function lathe(points, segments = 48) {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
}

/**
 * Wraps a geometry built around the XY plane onto a vertical cylinder of the
 * given radius, centred on the origin and facing +Z. x becomes arc length and
 * z becomes the distance out from the cylinder. Normals are turned to match.
 */
export function bendAroundY(geo, radius) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = x / radius;
    const r = radius + z;
    const s = Math.sin(a);
    const c = Math.cos(a);
    pos.setXYZ(i, r * s, y, r * c);
    if (nor) {
      const nx = nor.getX(i);
      const nz = nor.getZ(i);
      nor.setXYZ(i, nx * c + nz * s, nor.getY(i), -nx * s + nz * c);
    }
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

/**
 * A pill-shaped slab lying along X: a capsule squashed in depth.
 * Has many rings along its length so it bends smoothly.
 */
export function pillSlab(length, height, depth, { lengthSegments = 48, capSegments = 10, radialSegments = 40 } = {}) {
  const r = height / 2;
  const geo = new THREE.CapsuleGeometry(r, Math.max(0.0001, length - height), capSegments, radialSegments, lengthSegments);
  geo.rotateZ(Math.PI / 2);
  geo.scale(1, 1, depth / height);
  return smoothed(geo);
}

/** Rounded rectangle path, centred on the origin. */
export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A capsule hanging down from the origin along -Y. `capSegments` rounds the ends more finely. */
export function limbCapsule(radius, length, radial = 16, capSegments = 6) {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.0001, length - radius * 2), capSegments, radial, 1);
  geo.translate(0, -length / 2, 0);
  return geo;
}

/** A cylinder lying along X, centred on the origin. */
export function axleX(radius, length, radial = 24) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, radial);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

/** A cylinder between two points. */
export function rod(a, b, radius, radial = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, radial);
  geo.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  geo.applyQuaternion(q);
  geo.translate(a.x, a.y, a.z);
  return geo;
}

/** Helper to make a mesh that casts and receives shadows. */
export function mesh(geo, mat, { cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (name) m.name = name;
  return m;
}
