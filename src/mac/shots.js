import { toJpeg } from 'html-to-image';
import { h, drag } from './ui.js';
import { HOME } from './vfs.js';
import { saveImage, dataURLToBlob } from './imagestore.js';

/** Real screenshots of the Mac (⌃⇧3 whole screen, ⌃⇧4 area, ⌃⇧5 toolbar) with the floating thumbnail. */
export class Shots {
  constructor(os) { this.os = os; this.busy = false; }

  name() {
    const d = new Date();
    return `Screenshot ${d.toISOString().slice(0, 10)} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }).replace(/:/g, '.')}.png`;
  }

  async capture(rect = null) {
    const os = this.os;
    const scr = os.screen;
    os.audio.screenshot();
    const flash = h('div.mac-flash');
    if (rect) Object.assign(flash.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`, inset: 'auto' });
    scr.append(flash);
    setTimeout(() => flash.remove(), 450);
    let url = null;
    try {
      const full = await toJpeg(scr, { quality: 0.85, pixelRatio: 1, cacheBust: false, filter: (n) => !n.classList?.contains('mac-flash') && !n.classList?.contains('shot-ui') });
      url = rect ? await crop(full, rect) : full;
    } catch (err) { console.warn('screenshot failed', err); }
    const blob = url ? dataURLToBlob(url) : null;
    const ref = blob ? await saveImage(blob) : null;
    const path = `${HOME}/Desktop/${this.name()}`;
    this.thumb(url, () => os.vfs.write(path, '', ref ? { imageRef: ref, size: blob.size } : { image: 'screenshot' }), path);
  }

  /** The little preview that slides in bottom-right; the file lands on the Desktop when it leaves. */
  thumb(url, commit, path) {
    const os = this.os;
    let done = false;
    const finish = () => { if (done) return; done = true; commit(); t.classList.remove('in'); setTimeout(() => t.remove(), 400); };
    const t = h('div.shot-thumb.shot-ui', { title: 'Click to open in Preview' }, url ? h('img', { src: url, alt: 'Screenshot' }) : h('span', { text: '📷' }));
    t.addEventListener('click', () => { finish(); setTimeout(() => os.openPath(path), 50); });
    os.screen.append(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(finish, 4500);
  }

  full() { if (!this.busy) this.capture(); }

  area() {
    if (this.busy) return;
    this.busy = true;
    const os = this.os;
    const ov = h('div.shot-area.shot-ui', {}, h('div.shot-hint', { text: 'Drag to select an area · Esc to cancel' }));
    const band = h('div.shot-band');
    const label = h('div.shot-size');
    ov.append(band, label);
    os.screen.append(ov);
    this.cancel = () => { ov.remove(); this.busy = false; };
    ov.addEventListener('pointerdown', (e) => {
      const sr = os.screen.getBoundingClientRect();
      const sx = e.clientX - sr.left, sy = e.clientY - sr.top;
      drag(e, (dx, dy) => {
        const r = { x: Math.min(sx, sx + dx), y: Math.min(sy, sy + dy), w: Math.abs(dx), h: Math.abs(dy) };
        Object.assign(band.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, display: 'block' });
        label.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
        Object.assign(label.style, { left: `${r.x + r.w + 6}px`, top: `${r.y + r.h + 6}px` });
      }, (dx, dy) => {
        ov.remove();
        this.busy = false;
        if (Math.abs(dx) < 4 || Math.abs(dy) < 4) return;
        this.capture({ x: Math.min(sx, sx + dx), y: Math.min(sy, sy + dy), w: Math.abs(dx), h: Math.abs(dy) });
      });
    });
  }

  windowShot() {
    if (this.busy) return;
    this.busy = true;
    const os = this.os;
    const ov = h('div.shot-area.shot-win.shot-ui', {}, h('div.shot-hint', { text: 'Click a window to capture it · Esc to cancel' }));
    const hl = h('div.shot-band');
    ov.append(hl);
    os.screen.append(ov);
    this.cancel = () => { ov.remove(); this.busy = false; };
    const pick = (e) => {
      ov.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.win');
      ov.style.pointerEvents = '';
      return el;
    };
    ov.addEventListener('pointermove', (e) => {
      const el = pick(e);
      if (!el) { hl.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), sr = os.screen.getBoundingClientRect();
      Object.assign(hl.style, { left: `${r.left - sr.left}px`, top: `${r.top - sr.top}px`, width: `${r.width}px`, height: `${r.height}px`, display: 'block' });
    });
    ov.addEventListener('click', (e) => {
      const el = pick(e);
      ov.remove();
      this.busy = false;
      if (!el) return;
      const r = el.getBoundingClientRect(), sr = os.screen.getBoundingClientRect();
      this.capture({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });
    });
  }

  toolbar() {
    if (this.busy) return;
    const os = this.os;
    const bar = h('div.shot-bar.shot-ui', {},
      h('button', { title: 'Capture Entire Screen', onclick: () => { bar.remove(); setTimeout(() => this.full(), 150); }, html: '<svg viewBox="0 0 24 18" width="22"><rect x="1" y="1" width="22" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' }),
      h('button', { title: 'Capture Selected Window', onclick: () => { bar.remove(); this.windowShot(); }, html: '<svg viewBox="0 0 24 18" width="22"><rect x="4" y="3" width="16" height="12" rx="2" fill="currentColor" opacity=".5"/><rect x="1" y="1" width="22" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/></svg>' }),
      h('button', { title: 'Capture Selected Portion', onclick: () => { bar.remove(); this.area(); }, html: '<svg viewBox="0 0 24 18" width="22"><rect x="1" y="1" width="22" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/></svg>' }),
      h('span.shot-sep'),
      h('button.shot-cancel', { text: '×', title: 'Close', onclick: () => bar.remove() }));
    os.screen.append(bar);
  }
}

function crop(url, r) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(r.w); c.height = Math.round(r.h);
      c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}
