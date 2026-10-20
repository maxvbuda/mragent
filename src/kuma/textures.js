import * as THREE from 'three';

// Every picture in the scene is painted here on a 2D canvas, so the project
// needs no image files at all.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Small seeded random generator (mulberry32), so the scene looks the same on every load. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(canvas, { srgb = true, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const UI_FONT = '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = 'Menlo, "SF Mono", Monaco, Consolas, monospace';

/* ------------------------------------------------------------------ */
/* Visor: the black glass band that shows "AI", angry eyes or calm eyes */
/* ------------------------------------------------------------------ */

export class VisorDisplay {
  constructor() {
    this.w = 1024;
    this.h = 168;
    this.canvas = makeCanvas(this.w, this.h);
    this.ctx = this.canvas.getContext('2d');
    this.texture = canvasTexture(this.canvas);
    this.mood = 'work';
    this.glitch = 0;
    this.nextScan = 2.5;
    this.scan = -1;
    this.acc = 1;
    this.rand = seeded(11);
    this.nextBlink = 2;
    this.blink = -1; // 0..1 while blinking
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.glitch = 0.24;
  }

  update(dt, time, colour) {
    this.glitch = Math.max(0, this.glitch - dt);
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0;
      // Now and then a quick double blink.
      this.nextBlink = this.rand() < 0.2 ? 0.28 : 2.5 + this.rand() * 4;
    }
    if (this.blink >= 0) {
      this.blink += dt / 0.16;
      if (this.blink > 1) this.blink = -1;
    }
    this.nextScan -= dt;
    if (this.nextScan <= 0) {
      this.scan = 0;
      this.nextScan = 4 + this.rand() * 4;
    }
    if (this.scan >= 0) {
      this.scan += dt / 0.45;
      if (this.scan > 1) this.scan = -1;
    }
    // About 30 redraws a second is plenty for a small LED band.
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    this.draw(time, colour);
    this.texture.needsUpdate = true;
  }

  draw(time, colour) {
    const { ctx, w, h } = this;
    const css = `#${colour.getHexString(THREE.SRGBColorSpace)}`;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // A faint sheen of the mood colour, strongest in the middle.
    const sheen = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.4);
    sheen.addColorStop(0, hexA(colour, 0.12));
    sheen.addColorStop(1, hexA(colour, 0));
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);

    ctx.shadowColor = css;
    ctx.fillStyle = css;
    ctx.strokeStyle = css;
    const cx = w / 2;
    const cy = h / 2;

    if (this.mood === 'work') {
      // Two soft glowing eyes that glance about and blink now and then.
      const shut = this.blink >= 0 ? Math.sin(Math.PI * this.blink) : 0;
      const look = Math.sin(time * 0.6) * 10 + Math.sin(time * 1.7 + 1) * 4;
      const eh = Math.max(9, 66 * (1 - shut));
      for (const glow of [26, 8]) {
        ctx.shadowBlur = glow;
        for (const side of [-1, 1]) {
          roundRect(ctx, cx + side * 108 + look - 38, cy + 6 - eh / 2, 76, eh, Math.min(24, eh / 2));
          ctx.fill();
        }
      }
      // A hot white core makes them read as light rather than paint.
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      for (const side of [-1, 1]) {
        const ch = Math.max(4, eh - 26);
        roundRect(ctx, cx + side * 108 + look - 24, cy + 6 - ch / 2, 48, ch, Math.min(14, ch / 2));
        ctx.fill();
      }
    } else if (this.mood === 'happy') {
      // Smiling eyes: two arches, like ^ ^.
      ctx.lineCap = 'round';
      ctx.lineWidth = 16;
      ctx.shadowBlur = 24;
      const hop = Math.abs(Math.sin(time * 5)) * 4;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + side * 108, cy + 30 - hop, 40, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    } else if (this.mood === 'shocked') {
      // Wide round eyes.
      ctx.shadowBlur = 26;
      const r = 40 + Math.sin(time * 30) * 2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + side * 108, cy + 4, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + side * 108, cy + 4, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.mood === 'dizzy') {
      // Spinning spirals.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 13;
      ctx.shadowBlur = 20;
      for (const side of [-1, 1]) {
        const ex = cx + side * 108;
        const ey = cy + 4;
        const spin = time * 7 * side;
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * Math.PI * 4.5 + spin;
          const r = 4 + (i / 64) * 44;
          if (i === 0) ctx.moveTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r);
          else ctx.lineTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r);
        }
        ctx.stroke();
      }
    } else if (this.mood === 'angry') {
      const jx = (this.rand() - 0.5) * 5;
      const jy = (this.rand() - 0.5) * 4;
      ctx.shadowBlur = 24;
      for (const side of [-1, 1]) {
        const ex = cx + side * 112 + jx;
        const ey = cy + 8 + jy;
        ctx.save();
        // The eye...
        roundRect(ctx, ex - 52, ey - 28, 104, 56, 20);
        ctx.fill();
        // ...cut by a slanted brow: low at the inside, high at the outside.
        ctx.globalCompositeOperation = 'destination-out';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(ex - side * 70, ey - 2);
        ctx.lineTo(ex + side * 70, ey - 44);
        ctx.lineTo(ex + side * 70, ey - 90);
        ctx.lineTo(ex - side * 70, ey - 90);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,220,200,0.25)';
      for (const side of [-1, 1]) {
        const ex = cx + side * 112 + jx;
        ctx.fillRect(ex - 30, cy + 14 + jy, 60, 8);
      }
    } else {
      // Calm, closed eyes: two soft upward arcs, plus a drifting "z".
      ctx.lineCap = 'round';
      ctx.lineWidth = 14;
      ctx.shadowBlur = 22;
      const breathe = Math.sin(time * 1.4) * 2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + side * 108, cy + 34 + breathe, 44, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
      }
      ctx.font = `700 34px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) {
        const p = (time * 0.35 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(p * Math.PI) * 0.9;
        ctx.font = `700 ${22 + p * 26}px ${UI_FONT}`;
        ctx.fillText('z', cx + 215 + p * 70, cy + 40 - p * 90);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Scan line sweeping down now and then.
    if (this.scan >= 0) {
      const y = this.scan * (h + 60) - 30;
      const g = ctx.createLinearGradient(0, y - 26, 0, y + 26);
      g.addColorStop(0, hexA(colour, 0));
      g.addColorStop(0.5, hexA(colour, 0.35));
      g.addColorStop(1, hexA(colour, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 26, w, 52);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Glitch when the mood changes: slices of the picture slide sideways.
    if (this.glitch > 0) {
      for (let i = 0; i < 7; i++) {
        const y = Math.floor(this.rand() * h);
        const sh = 4 + Math.floor(this.rand() * 18);
        const dx = (this.rand() - 0.5) * 90;
        ctx.drawImage(this.canvas, 0, y, w, sh, dx, y, w, sh);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hexA(colour, 0.25);
      for (let i = 0; i < 4; i++) ctx.fillRect(0, this.rand() * h, w, 2);
      ctx.globalCompositeOperation = 'source-over';
    }

    // LED dot grid over everything.
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    for (let x = 0; x < w; x += 6) ctx.fillRect(x, 0, 1.5, h);
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 1.5);
  }
}

function hexA(colour, a) {
  const r = Math.round(THREE.MathUtils.clamp(colour.r, 0, 1) ** (1 / 2.2) * 255);
  const g = Math.round(THREE.MathUtils.clamp(colour.g, 0, 1) ** (1 / 2.2) * 255);
  const b = Math.round(THREE.MathUtils.clamp(colour.b, 0, 1) ** (1 / 2.2) * 255);
  return `rgba(${r},${g},${b},${a})`;
}

/* ------------------------------------------------------------------ */
/* Printed surfaces                                                     */
/* ------------------------------------------------------------------ */

/** White chest plate with a few soft panel lines. */
export function makeChestTexture() {
  const c = makeCanvas(1024, 1024);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1024, 1024);

  // Panel lines: the chest plate is outlined where it meets the shoulders.
  ctx.strokeStyle = 'rgba(105,115,130,0.38)';
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(512 + side * 330, 120);
    ctx.bezierCurveTo(512 + side * 290, 300, 512 + side * 300, 560, 512 + side * 360, 760);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(512 - 330, 860);
  ctx.quadraticCurveTo(512, 905, 512 + 330, 860);
  ctx.stroke();

  const tex = canvasTexture(c);
  return tex;
}

/** Skull seams, drawn in the lathe's UV space (u runs around, v runs up). */
export function makeSkullTexture(vAt) {
  const W = 2048;
  const H = 1024;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(100,110,125,0.5)';
  ctx.lineCap = 'round';
  const Y = (v) => (1 - v) * H;

  // Over the top, from ear to ear (u = 0.25 is the left ear, 0.75 the right).
  const top = vAt(0.04);
  for (const u of [0.25, 0.75]) {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(u * W, Y(top));
    ctx.lineTo(u * W, Y(0.995));
    ctx.stroke();
  }
  // Round the back, level with the visor.
  ctx.lineWidth = 4;
  const back = Y(vAt(0.005));
  ctx.beginPath();
  ctx.moveTo(0.25 * W, back);
  ctx.lineTo(0.75 * W, back);
  ctx.stroke();
  // Jaw line under the visor, across the front (wraps round u = 0).
  const jaw = Y(vAt(-0.072));
  ctx.beginPath();
  ctx.moveTo(0.75 * W, jaw);
  ctx.lineTo(W, jaw);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, jaw);
  ctx.lineTo(0.25 * W, jaw);
  ctx.stroke();
  return canvasTexture(c);
}

/** Light oak for the desk top. */
