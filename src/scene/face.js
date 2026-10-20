import * as THREE from 'three';

/**
 * The robot's face: a canvas painted onto the visor glass as an emissive map.
 * Expressions blend smoothly; the eyes track a gaze point and blink on their own.
 */
const W = 512, H = 256;

const SHAPES = {
  // open: eye height (0..1), w: width scale, curve: >0 happy arc, <0 sad, heart, ring, x
  normal:   { open: 1, w: 1, tilt: 0, color: [80, 230, 255] },
  focused:  { open: 0.42, w: 1.15, tilt: 0, color: [80, 230, 255] },
  happy:    { open: 1, w: 1.05, tilt: 0, arc: 1, color: [110, 240, 255] },
  love:     { open: 1, w: 1, tilt: 0, heart: 1, color: [255, 95, 150] },
  surprised:{ open: 1.25, w: 0.85, tilt: 0, ring: 1, color: [120, 235, 255] },
  thinking: { open: 0.85, w: 0.95, tilt: 0.18, color: [150, 180, 255] },
  sleepy:   { open: 0.16, w: 1.1, tilt: 0, color: [90, 170, 220] },
  annoyed:  { open: 0.5, w: 1.1, tilt: -0.3, color: [255, 120, 90] },
  wink:     { open: 1, w: 1, tilt: 0, wink: 1, color: [110, 240, 255] },
  loading:  { open: 0.9, w: 1, tilt: 0, spinner: 1, color: [120, 220, 255] },
};

export class Face {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.expr = 'normal';
    this.cur = { ...SHAPES.normal, arc: 0, heart: 0, ring: 0, wink: 0, spinner: 0 };
    this.gaze = new THREE.Vector2();
    this.gazeTarget = new THREE.Vector2();
    this.blink = 0;
    this.nextBlink = 2;
    this.t = 0;
    this.hold = 0;
    this.brightness = 1;
    this.talk = 0;
  }

  set(expr, holdSeconds = 0) {
    if (!SHAPES[expr]) return;
    this.expr = expr;
    this.hold = holdSeconds;
  }

  look(x, y) { this.gazeTarget.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)); }

  update(dt) {
    this.t += dt;
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) this.expr = 'normal';
    }
    const target = SHAPES[this.expr];
    const k = 1 - Math.exp(-dt * 10);
    for (const key of ['open', 'w', 'tilt', 'arc', 'heart', 'ring', 'wink', 'spinner']) {
      this.cur[key] += ((target[key] || 0) - this.cur[key]) * k;
    }
    this.cur.color = this.cur.color.map((c, i) => c + (target.color[i] - c) * k);
    this.gaze.lerp(this.gazeTarget, 1 - Math.exp(-dt * 8));

    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = 2 + Math.random() * 4;
      if (Math.random() < 0.15) this.nextBlink = 0.25; // double blink
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    this.draw();
    this.texture.needsUpdate = true;
  }

  draw() {
    const x = this.ctx, c = this.cur;
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);

    // faint scanlines + vignette to sell the "display behind glass" look
    x.fillStyle = 'rgba(40,120,160,0.06)';
    for (let y = 0; y < H; y += 4) x.fillRect(0, y, W, 1);

    const [r, g, b] = c.color.map((v) => Math.round(v * this.brightness));
    const col = `rgb(${r},${g},${b})`;
    x.shadowColor = col;
    x.shadowBlur = 26;
    x.fillStyle = col;
    x.strokeStyle = col;

    const blinkK = Math.sin(Math.min(1, this.blink) * Math.PI);
    const gx = this.gaze.x * 34, gy = -this.gaze.y * 22;
    const spacing = 96;
    for (const side of [-1, 1]) {
      const cx = W / 2 + side * spacing + gx;
      const cy = H / 2 + gy + 4;
      const w = 62 * c.w;
      let h = 74 * c.open * (1 - blinkK * 0.94);
      if (c.wink > 0.5 && side === 1) h *= 0.08;
      x.save();
      x.translate(cx, cy);
      x.rotate(c.tilt * side);
      if (c.heart > 0.5) {
        this.heart(x, 0, 0, 46 * (0.92 + Math.sin(this.t * 7) * 0.08));
      } else if (c.arc > 0.5) {
        x.lineWidth = 15;
        x.lineCap = 'round';
        x.beginPath();
        x.arc(0, 20, 36, Math.PI * 1.12, Math.PI * 1.88);
        x.stroke();
      } else if (c.ring > 0.5) {
        x.lineWidth = 12;
        x.beginPath();
        x.ellipse(0, 0, w * 0.6, Math.max(4, h * 0.55), 0, 0, Math.PI * 2);
        x.stroke();
        x.beginPath();
        x.arc(0, 0, 9, 0, Math.PI * 2);
        x.fill();
      } else {
        this.roundRect(x, -w / 2, -h / 2, w, Math.max(5, h), Math.min(26, Math.max(3, h / 2)));
        x.fill();
        if (h > 30) { // a highlight glint makes them feel alive
          x.shadowBlur = 0;
          x.fillStyle = 'rgba(255,255,255,0.55)';
          this.roundRect(x, -w / 2 + 10, -h / 2 + 9, 14, Math.min(18, h * 0.25), 6);
          x.fill();
          x.fillStyle = col;
          x.shadowBlur = 26;
        }
      }
      x.restore();
    }

    if (c.spinner > 0.5) { // three loading dots under the eyes
      for (let i = 0; i < 3; i++) {
        const a = (Math.sin(this.t * 6 - i * 0.8) + 1) / 2;
        x.globalAlpha = 0.3 + a * 0.7;
        x.beginPath();
        x.arc(W / 2 - 24 + i * 24, H - 42 - a * 6, 7, 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;
    }
    if (this.talk > 0) { // little speaking waveform
      x.lineWidth = 5;
      x.beginPath();
      for (let i = 0; i <= 20; i++) {
        const px = W / 2 - 60 + i * 6;
        const py = H - 38 + Math.sin(this.t * 30 + i * 0.9) * 8 * this.talk * Math.sin((i / 20) * Math.PI);
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.stroke();
    }
    x.shadowBlur = 0;
  }

  roundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }

  heart(x, cx, cy, s) {
    x.beginPath();
    x.moveTo(cx, cy + s * 0.55);
    x.bezierCurveTo(cx - s * 1.1, cy - s * 0.15, cx - s * 0.55, cy - s * 0.95, cx, cy - s * 0.4);
    x.bezierCurveTo(cx + s * 0.55, cy - s * 0.95, cx + s * 1.1, cy - s * 0.15, cx, cy + s * 0.55);
    x.fill();
  }
}

/** UVs for the visor, wrapping the face canvas around the curved glass. */
export function visorUV(geo, visor) {
  const p = geo.attributes.position;
  const [cx, cy, cz] = visor.center;
  const maxAng = Math.asin(Math.min(0.99, visor.halfWidth / visor.radii[0])) + 0.04;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - cx, y = p.getY(i) - cy, z = p.getZ(i) - cz;
    const ang = Math.atan2(x, -z);
    uv[i * 2] = 0.5 - ang / (2 * maxAng); // canvas right = robot's left, so it reads unmirrored to a viewer
    uv[i * 2 + 1] = 0.5 + y / (2 * visor.halfHeight * 1.05);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
