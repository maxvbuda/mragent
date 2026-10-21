import * as THREE from 'three';

/** Grid A* over the room floor, with furniture inflated by the robot's radius. */
export class NavGrid {
  constructor(layout, { cell = 0.08, radius = 0.27, extra = [], bounds = null } = {}) {
    const [x0, z0, x1, z1] = bounds || (layout.house ? layout.house.bounds : [layout.room.left, -1.75, layout.room.right, layout.room.back]);
    this.cell = cell;
    this.radius = radius;
    this.minX = x0;
    this.maxX = x1;
    this.minZ = z0;
    this.maxZ = z1;
    this.w = Math.ceil((this.maxX - this.minX) / cell);
    this.h = Math.ceil((this.maxZ - this.minZ) / cell);
    this.static = [...layout.obstacles, ...(layout.house?.obstacles || []), ...extra].map((o) => [...o]);
    this.dynamic = [];
    this.rebuild();
  }

  setDynamic(rects) {
    this.dynamic = rects;
    this.rebuild();
  }

  /** Rasterise every obstacle, grown by the robot's radius, into the grid. */
  rebuild() {
    const { w, h, cell, radius } = this;
    this.blocked = new Uint8Array(w * h);
    const edge = Math.ceil(radius / cell);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i < edge || j < edge || i >= w - edge || j >= h - edge) this.blocked[j * w + i] = 1;
    for (const [ax, az, bx, bz] of [...this.static, ...this.dynamic]) {
      const i0 = Math.max(0, Math.floor((ax - radius - this.minX) / cell)), i1 = Math.min(w - 1, Math.floor((bx + radius - this.minX) / cell));
      const j0 = Math.max(0, Math.floor((az - radius - this.minZ) / cell)), j1 = Math.min(h - 1, Math.floor((bz + radius - this.minZ) / cell));
      for (let j = j0; j <= j1; j++) {
        const z = this.minZ + (j + 0.5) * cell;
        for (let i = i0; i <= i1; i++) {
          const x = this.minX + (i + 0.5) * cell;
          const dx = Math.max(ax - x, 0, x - bx), dz = Math.max(az - z, 0, z - bz);
          if (dx * dx + dz * dz < radius * radius) this.blocked[j * w + i] = 1;
        }
      }
    }
  }

  toCell(p) {
    return [
      THREE.MathUtils.clamp(Math.floor((p.x - this.minX) / this.cell), 0, this.w - 1),
      THREE.MathUtils.clamp(Math.floor((p.z - this.minZ) / this.cell), 0, this.h - 1),
    ];
  }

  toWorld(i, j) {
    return new THREE.Vector3(this.minX + (i + 0.5) * this.cell, 0, this.minZ + (j + 0.5) * this.cell);
  }

  free(i, j) {
    return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.blocked[j * this.w + i];
  }

  nearestFree([i, j]) {
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r < 40; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.free(i + di, j + dj)) {
            const d = di * di + dj * dj;
            if (d < bd) { bd = d; best = [i + di, j + dj]; }
          }
        }
      }
      if (best) return best;
    }
    return [i, j];
  }

  lineFree(a, b) {
    const d = a.distanceTo(b);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let s = 0; s <= steps; s++) {
      const p = a.clone().lerp(b, s / steps);
      const [i, j] = this.toCell(p);
      if (!this.free(i, j)) return false;
    }
    return true;
  }

  /** World-space path from a to b (both Vector3), ending exactly at b. */
  find(a, b) {
    const start = this.nearestFree(this.toCell(a));
    const goal = this.nearestFree(this.toCell(b));
    const { w, h } = this;
    const N = w * h;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (id, f) => {
      heap.push([f, id]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const oct = (i, j) => {
      const dx = Math.abs(i - goal[0]), dz = Math.abs(j - goal[1]);
      return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    };
    const sid = start[1] * w + start[0], gid = goal[1] * w + goal[0];
    g[sid] = 0;
    push(sid, oct(...start));
    let found = false;
    while (heap.length) {
      const [, id] = pop();
      if (closed[id]) continue;
      closed[id] = 1;
      if (id === gid) { found = true; break; }
      const i = id % w, j = (id / w) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (!this.free(ni, nj)) continue;
          if (di && dj && (!this.free(i + di, j) || !this.free(i, j + dj))) continue;
          const nid = nj * w + ni;
          const cost = g[id] + (di && dj ? 1.4142 : 1);
          if (cost < g[nid]) {
            g[nid] = cost;
            came[nid] = id;
            push(nid, cost + oct(ni, nj));
          }
        }
      }
    }
    if (!found) return [a.clone(), b.clone()];
    const cells = [];
    for (let id = gid; id !== -1; id = came[id]) cells.push(this.toWorld(id % w, (id / w) | 0));
    cells.reverse();
    const pts = [a.clone(), ...cells.slice(1, -1), b.clone()];
    // string-pull: keep only the corners we can't see past
    const out = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) {
        if (this.lineFree(pts[k], pts[m])) { far = m; break; }
      }
      out.push(pts[far]);
      k = far;
    }
    return out;
  }
}
