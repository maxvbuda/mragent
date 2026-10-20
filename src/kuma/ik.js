import * as THREE from 'three';

// Inverse kinematics for two-bone limbs (shoulder-elbow-wrist, hip-knee-ankle).
// Each bone hangs along its local -Y axis and bends about its local X axis.

const _root = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pp = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _end = new THREE.Vector3();
const _u = new THREE.Vector3();
const _l = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qu = new THREE.Quaternion();
const _ql = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Points `upper` and `lower` so the end of `lower` reaches `target` (world).
 * `pole` (world direction) says which way the middle joint should stick out.
 * poleSign: -1 when the joint's local -Z faces the pole (elbows),
 *           +1 when its local +Z faces the pole (knees).
 * The parent's world matrix must be up to date.
 */
export function solveTwoBone(upper, lower, target, pole, l1, l2, poleSign) {
  const parent = upper.parent;
  _root.copy(upper.position).applyMatrix4(parent.matrixWorld);
  _dir.subVectors(target, _root);
  let d = _dir.length();
  if (d < 1e-6) {
    _dir.set(0, -1, 0);
    d = 1e-6;
  } else {
    _dir.divideScalar(d);
  }
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995);

  _pp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_pp.lengthSq() < 1e-10) _pp.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
  _pp.normalize();

  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _elbow.copy(_root).addScaledVector(_dir, l1 * cosA).addScaledVector(_pp, l1 * sinA);
  _end.copy(_root).addScaledVector(_dir, d);
  _u.subVectors(_elbow, _root).normalize();
  _l.subVectors(_end, _elbow).normalize();

  // Upper bone: -Y along the bone, Z towards (or away from) the pole.
  _y.copy(_u).negate();
  _z.copy(_pp).addScaledVector(_u, -_pp.dot(_u)).normalize().multiplyScalar(poleSign);
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  _qu.setFromRotationMatrix(_m);

  // Lower bone shares the hinge axis (X).
  _y.copy(_l).negate();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  _ql.setFromRotationMatrix(_m);

  parent.matrixWorld.decompose(_p, _qp, _s);
  upper.quaternion.copy(_qp.invert()).multiply(_qu);
  lower.quaternion.copy(_qt.copy(_qu).invert()).multiply(_ql);
  upper.updateMatrixWorld(true);
}

/** Gives `obj` the world rotation `q` (its parent's world matrix must be current). */
export function setWorldQuaternion(obj, q) {
  obj.parent.matrixWorld.decompose(_p, _qp, _s);
  obj.quaternion.copy(_qp.invert()).multiply(q);
}

/**
 * Rotation for a hand whose fingers point along `fingers` and whose palm
 * faces `palm` (both world directions). The hand's fingers run along local -Y
 * and the palm faces local -Z.
 */
export function handQuat(out, fingers, palm) {
  _y.copy(fingers).negate().normalize();
  _z.copy(palm).negate();
  _z.addScaledVector(_y, -_z.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/** Rotation for a foot whose toes point along `toes` with its top facing `up`. */
export function footQuat(out, toes, up) {
  _z.copy(toes).normalize();
  _y.copy(up).addScaledVector(_z, -up.dot(_z)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
