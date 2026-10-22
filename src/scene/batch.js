import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Draw-call savers for the robots. Neither changes how anything looks:
 *  - mergeSiblings: meshes that hang off the same bone with the same material never move
 *    relative to each other, so they're baked into one mesh.
 *  - InstancedParts: identical parts repeated around the rig (finger segments, knuckles)
 *    are drawn as one instanced batch that follows the original (hidden) meshes.
 */
const _m = new THREE.Matrix4();

function attrSignature(g) {
  return `${Object.keys(g.attributes).sort().join(',')}|${g.index ? 'i' : 'n'}|${Object.keys(g.morphAttributes).length}`;
}

function special(o, skip) {
  return skip.has(o) || o.children.length > 0 || Array.isArray(o.material) || o.isSkinnedMesh || o.isInstancedMesh
    || o.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
    || o.geometry.drawRange.count !== Infinity || o.geometry.groups.length > 0 || !o.visible;
}

/** Merge sibling meshes that share a material. Returns the number of meshes removed. */
export function mergeSiblings(root, skip = new Set()) {
  let removed = 0;
  const parents = [];
  root.traverse((o) => { if (o.children.length > 1) parents.push(o); });
  for (const p of parents) {
    const buckets = new Map();
    for (const c of p.children) {
      if (!c.isMesh || special(c, skip)) continue;
      const k = `${c.material.uuid}|${c.castShadow}|${c.receiveShadow}|${c.renderOrder}|${attrSignature(c.geometry)}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(c);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((c) => {
        c.updateMatrix();
        const g = c.geometry.clone().applyMatrix4(c.matrix);
        if (c.matrix.determinant() < 0 && g.index) { // mirrored: keep the triangles facing outwards
          const a = g.index.array;
          for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
        }
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = list[0].receiveShadow;
      mesh.renderOrder = list[0].renderOrder;
      mesh.userData = { ...list[0].userData };
      mesh.name = `merged:${list.map((c) => c.name).filter(Boolean).join('+')}`;
      p.add(mesh);
      for (const c of list) p.remove(c);
      removed += list.length - 1;
    }
  }
  return removed;
}

/** Instanced batches for parts repeated `min` or more times. Call update() after the rig moves. */
export class InstancedParts {
  constructor(scene, root, { skip = new Set(), min = 3 } = {}) {
    this.batches = [];
    const groups = new Map();
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || special(o, skip)) return;
      const mirrored = o.matrixWorld.determinant() < 0;
      const k = `${o.geometry.uuid}|${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${mirrored}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    });
    for (const list of groups.values()) {
      if (list.length < min) continue;
      const mirrored = list[0].matrixWorld.determinant() < 0;
      const inst = new THREE.InstancedMesh(list[0].geometry, list[0].material, list.length);
      inst.castShadow = list[0].castShadow;
      inst.receiveShadow = list[0].receiveShadow;
      inst.frustumCulled = false; // the parts move around; the batch is tiny
      inst.matrixAutoUpdate = false;
      if (mirrored) { inst.scale.x = -1; inst.updateMatrix(); } // lets three flip the winding for all of them
      inst.raycast = () => {}; // picking still hits the original meshes
      inst.userData = { ...list[0].userData };
      scene.add(inst);
      for (const o of list) o.visible = false;
      this.batches.push({ inst, list, pre: mirrored ? new THREE.Matrix4().makeScale(-1, 1, 1) : null });
    }
    this.update();
  }

  get removed() { return this.batches.reduce((n, b) => n + b.list.length - 1, 0); }

  update() {
    for (const b of this.batches) {
      for (let i = 0; i < b.list.length; i++) {
        const o = b.list[i];
        _m.copy(o.matrixWorld);
        if (b.pre) _m.premultiply(b.pre);
        b.inst.setMatrixAt(i, _m);
      }
      b.inst.instanceMatrix.needsUpdate = true;
      b.inst.visible = b.list.some((o) => { for (let x = o; x; x = x.parent) if (x.visible === false && x !== o) return false; return true; });
    }
  }
}
