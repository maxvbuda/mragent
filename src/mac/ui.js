import { imageRefURL } from './imagestore.js';

/** Tiny DOM helpers shared by the OS and its apps. */
export function h(tag, attrs = {}, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Drag helper: calls move(dx, dy, e) while the pointer is held after a pointerdown. */
export function drag(e, move, up) {
  const sx = e.clientX, sy = e.clientY;
  const target = e.currentTarget || e.target;
  try { target.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
  const onMove = (ev) => move(ev.clientX - sx, ev.clientY - sy, ev);
  const onUp = (ev) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    up?.(ev.clientX - sx, ev.clientY - sy, ev);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/**
 * Menu: items = [{label, shortcut, action, disabled, checked, sep, submenu}]
 * Returns the element; closes itself when an item is chosen.
 */
export function buildMenu(items, close, { cls = '' } = {}) {
  const menu = h(`div.mac-menu${cls ? '.' + cls : ''}`, { role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { menu.append(h('div.mac-menu-sep')); continue; }
    if (it.header) { menu.append(h('div.mac-menu-header', { text: it.header })); continue; }
    const row = h('div.mac-menu-item', { role: 'menuitem', class: it.disabled ? 'disabled' : '' },
      h('span.check', { text: it.checked ? '✓' : '' }),
      it.icon ? h('span.mi-icon', { html: it.icon }) : null,
      h('span.label', { text: it.label }),
      it.submenu ? h('span.arrow', { text: '›' }) : h('span.shortcut', { text: it.shortcut || '' }));
    if (it.submenu) {
      let sub = null;
      row.addEventListener('mouseenter', () => {
        if (sub) return;
        sub = buildMenu(it.submenu, close);
        sub.classList.add('submenu');
        row.append(sub);
      });
      row.addEventListener('mouseleave', () => { sub?.remove(); sub = null; });
    } else if (!it.disabled) {
      row.addEventListener('click', (e) => { e.stopPropagation(); close(); it.action?.(); });
    }
    menu.append(row);
  }
  return menu;
}

/** Format a date like Finder does. */
export function fmtDate(t) {
  if (!t) return '--';
  const d = new Date(t), n = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === n.toDateString()) return `Today at ${time}`;
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday at ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ` at ${time}`;
}

/** Procedurally painted pictures, used by Photos, Preview and Finder thumbnails. */
const picCache = new Map();
export function picture(kind, w = 640, h2 = 420) {
  const key = `${kind}:${w}x${h2}`;
  if (picCache.has(key)) return picCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h2;
  const x = c.getContext('2d');
  let seed = [...kind].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const grad = (stops, vertical = true) => {
    const g = vertical ? x.createLinearGradient(0, 0, 0, h2) : x.createLinearGradient(0, 0, w, h2);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    return g;
  };
  const robotHead = (cx, cy, s, mood = 'happy') => {
    x.fillStyle = '#f4f6fa'; x.beginPath(); x.ellipse(cx, cy, s, s * 0.93, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#05070a'; x.beginPath(); x.ellipse(cx, cy + s * 0.05, s * 0.76, s * 0.4, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#49e3ff'; x.fillStyle = '#49e3ff'; x.lineWidth = s * 0.09; x.lineCap = 'round';
    x.shadowColor = '#49e3ff'; x.shadowBlur = s * 0.25;
    for (const sd of [-1, 1]) {
      if (mood === 'happy') { x.beginPath(); x.arc(cx + sd * s * 0.32, cy + s * 0.14, s * 0.15, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
      else { x.beginPath(); x.ellipse(cx + sd * s * 0.32, cy + s * 0.05, s * 0.09, s * 0.14, 0, 0, Math.PI * 2); x.fill(); }
    }
    x.shadowBlur = 0;
    x.fillStyle = '#e3e7ee';
    for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(cx + sd * s * 1.02, cy, s * 0.16, s * 0.34, 0, 0, Math.PI * 2); x.fill(); }
  };
  switch (kind) {
    case 'selfie':
      x.fillStyle = grad(['#ffd7a8', '#ff8fa3', '#8f6bff']); x.fillRect(0, 0, w, h2);
      robotHead(w * 0.5, h2 * 0.5, h2 * 0.3);
      x.fillStyle = '#fff'; x.font = `600 ${h2 * 0.06}px -apple-system, Helvetica`; x.fillText('#robotlife', w * 0.04, h2 * 0.94);
      break;
    case 'sunset':
      x.fillStyle = grad(['#2b1d5e', '#c2457a', '#ffb46b']); x.fillRect(0, 0, w, h2);
      x.fillStyle = '#ffe1a8'; x.beginPath(); x.arc(w * 0.5, h2 * 0.68, h2 * 0.16, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#1a1336';
      for (let i = 0; i < 26; i++) { const bw = w / 26; const bh = h2 * (0.12 + rnd() * 0.3); x.fillRect(i * bw, h2 - bh, bw - 2, bh); }
      break;
    case 'desk':
      x.fillStyle = grad(['#e9edf3', '#cfd7e2']); x.fillRect(0, 0, w, h2);
      x.fillStyle = '#d9b78c'; x.fillRect(w * 0.1, h2 * 0.62, w * 0.8, h2 * 0.06);
      x.fillStyle = '#8a8f97'; x.fillRect(w * 0.38, h2 * 0.36, w * 0.24, h2 * 0.26);
      x.fillStyle = '#12151b'; x.fillRect(w * 0.39, h2 * 0.375, w * 0.22, h2 * 0.22);
      x.fillStyle = '#e8714f'; x.fillRect(w * 0.7, h2 * 0.54, w * 0.05, h2 * 0.08);
      robotHead(w * 0.5, h2 * 0.25, h2 * 0.1, 'focused');
      break;
    case 'coffee':
      x.fillStyle = grad(['#3b2417', '#6f4630']); x.fillRect(0, 0, w, h2);
      x.fillStyle = '#e8714f'; x.beginPath(); x.ellipse(w / 2, h2 / 2, h2 * 0.36, h2 * 0.36, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#2b170d'; x.beginPath(); x.ellipse(w / 2, h2 / 2, h2 * 0.3, h2 * 0.3, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#f2e3cf'; x.lineWidth = h2 * 0.03; x.beginPath();
      x.moveTo(w / 2, h2 * 0.32); x.bezierCurveTo(w * 0.4, h2 * 0.42, w * 0.6, h2 * 0.5, w / 2, h2 * 0.66); x.stroke();
      x.beginPath(); x.arc(w / 2 - h2 * 0.06, h2 * 0.42, h2 * 0.07, 0, Math.PI * 2); x.arc(w / 2 + h2 * 0.06, h2 * 0.42, h2 * 0.07, 0, Math.PI * 2); x.stroke();
      break;
    case 'plant':
      x.fillStyle = grad(['#e7f2e2', '#bcd8b4']); x.fillRect(0, 0, w, h2);
      x.fillStyle = '#f1eee8'; x.fillRect(w * 0.42, h2 * 0.62, w * 0.16, h2 * 0.3);
      for (let i = 0; i < 9; i++) {
        x.save(); x.translate(w / 2, h2 * 0.62); x.rotate(-1.3 + i * 0.32);
        x.fillStyle = i % 2 ? '#3e8a52' : '#58a86b'; x.beginPath(); x.ellipse(0, -h2 * 0.2, h2 * 0.05, h2 * 0.2, 0, 0, Math.PI * 2); x.fill(); x.restore();
      }
      break;
    case 'circuit':
      x.fillStyle = '#0b1a14'; x.fillRect(0, 0, w, h2);
      x.strokeStyle = '#2ee59d'; x.lineWidth = 2; x.shadowColor = '#2ee59d'; x.shadowBlur = 8;
      for (let i = 0; i < 40; i++) {
        let px = rnd() * w, py = rnd() * h2; x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 4; k++) { if (rnd() < 0.5) px += (rnd() - 0.5) * 200; else py += (rnd() - 0.5) * 160; x.lineTo(px, py); }
        x.stroke(); x.beginPath(); x.arc(px, py, 4, 0, Math.PI * 2); x.fillStyle = '#2ee59d'; x.fill();
      }
      x.shadowBlur = 0;
      break;
    case 'cat':
      x.fillStyle = grad(['#fde2c4', '#f7b267']); x.fillRect(0, 0, w, h2);
      x.fillStyle = '#3a3a3c';
      x.beginPath(); x.ellipse(w / 2, h2 * 0.62, h2 * 0.28, h2 * 0.22, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(w / 2, h2 * 0.36, h2 * 0.16, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.moveTo(w / 2 - h2 * 0.14, h2 * 0.3); x.lineTo(w / 2 - h2 * 0.1, h2 * 0.12); x.lineTo(w / 2 - h2 * 0.02, h2 * 0.24); x.fill();
      x.beginPath(); x.moveTo(w / 2 + h2 * 0.14, h2 * 0.3); x.lineTo(w / 2 + h2 * 0.1, h2 * 0.12); x.lineTo(w / 2 + h2 * 0.02, h2 * 0.24); x.fill();
      x.fillStyle = '#ffd60a'; x.beginPath(); x.arc(w / 2 - h2 * 0.06, h2 * 0.35, h2 * 0.025, 0, Math.PI * 2); x.arc(w / 2 + h2 * 0.06, h2 * 0.35, h2 * 0.025, 0, Math.PI * 2); x.fill();
      break;
    case 'screenshot':
    default:
      x.fillStyle = grad(['#2a1b5e', '#c2457a', '#ffb46b'], false); x.fillRect(0, 0, w, h2);
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(0, 0, w, h2 * 0.05);
      x.fillStyle = 'rgba(30,30,40,0.85)'; x.fillRect(w * 0.15, h2 * 0.18, w * 0.5, h2 * 0.5);
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(w * 0.45, h2 * 0.3, w * 0.4, h2 * 0.5);
      x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(w * 0.3, h2 * 0.88, w * 0.4, h2 * 0.08);
  }
  const url = c.toDataURL('image/png');
  picCache.set(key, url);
  return url;
}

/** URL for a file's picture: real pixels (imageRef) or a painted placeholder (image). */
export function imageURL(n, w = 640, hh = 420) {
  if (n?.imageRef) return imageRefURL(n.imageRef) || picture('screenshot', w, hh);
  return picture(n?.image || 'screenshot', w, hh);
}
export const isImage = (n) => !!(n && (n.image || n.imageRef));
