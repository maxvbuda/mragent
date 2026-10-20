import { h, imageURL } from '../ui.js';
import { HOME } from '../vfs.js';
import { saveImage, dataURLToBlob } from '../imagestore.js';

const EFFECTS = [
  ['Normal', 'none'], ['Sepia', 'sepia(0.9) contrast(1.05)'], ['Black & White', 'grayscale(1) contrast(1.15)'], ['Comic', 'saturate(2.4) contrast(1.6)'],
  ['Thermal', 'invert(1) hue-rotate(180deg) saturate(3)'], ['X-Ray', 'invert(1) grayscale(1) contrast(1.4)'], ['Robot', 'robot'], ['Pop Art', 'saturate(4) hue-rotate(40deg) contrast(1.4)'],
];

export default {
  id: 'photobooth', name: 'Photo Booth', icon: 'photobooth', single: true,
  about: 'Photo Booth — uses your camera, if you allow it.',
  launch(os) {
    const video = h('video.pb-video', { autoplay: true, muted: true, playsinline: true });
    const overlay = h('canvas.pb-overlay', { width: 640, height: 480 });
    const msg = h('div.pb-msg', {}, h('b', { text: 'Starting camera…' }), h('small', { text: 'Your browser will ask for permission. Nothing leaves this page.' }));
    const strip = h('div.pb-strip');
    const stage = h('div.pb-stage', {}, video, overlay, msg);
    let fx = 'none', stream = null, raf = 0;
    const effectBtns = h('div.pb-fx', {}, ...EFFECTS.map(([name, f]) => h('button', { class: f === fx ? 'on' : '', text: name, onclick: (e) => {
      fx = f;
      video.style.filter = f === 'robot' ? 'contrast(1.1)' : f;
      effectBtns.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      e.currentTarget.classList.add('on');
    } })));
    const drawOverlay = () => {
      raf = requestAnimationFrame(drawOverlay);
      const x = overlay.getContext('2d');
      x.clearRect(0, 0, 640, 480);
      if (fx !== 'robot') return;
      const t = performance.now() / 1000;
      x.fillStyle = 'rgba(5,7,10,0.88)';
      x.beginPath(); x.roundRect(170, 150, 300, 110, 55); x.fill();
      x.fillStyle = '#49e3ff'; x.shadowColor = '#49e3ff'; x.shadowBlur = 24;
      const blink = Math.sin(t * 2.3) > 0.97 ? 0.15 : 1;
      x.beginPath(); x.roundRect(225, 205 - 25 * blink, 50, 50 * blink, 18); x.roundRect(365, 205 - 25 * blink, 50, 50 * blink, 18); x.fill();
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(240,244,250,0.9)';
      x.beginPath(); x.roundRect(120, 160, 40, 90, 18); x.roundRect(480, 160, 40, 90, 18); x.fill();
    };
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        video.srcObject = stream;
        msg.hidden = true;
        drawOverlay();
      } catch (err) {
        msg.replaceChildren(h('b', { text: 'No camera available' }), h('small', { text: err.name === 'NotAllowedError' ? 'Camera access was denied. Allow it in your browser’s site settings, then reopen Photo Booth.' : 'This computer doesn’t have a camera Photo Booth can use.' }));
      }
    };
    const snap = async () => {
      if (!stream) return;
      let n = 3;
      const count = h('div.pb-count', { text: '3' });
      stage.append(count);
      await new Promise((resolve) => {
        const iv = setInterval(() => { n--; os.audio.beep(); if (n <= 0) { clearInterval(iv); resolve(); } else count.textContent = String(n); }, 700);
      });
      count.remove();
      const c = document.createElement('canvas');
      c.width = video.videoWidth || 1280; c.height = video.videoHeight || 720;
      const x = c.getContext('2d');
      x.filter = fx === 'robot' || fx === 'none' ? 'none' : fx;
      x.translate(c.width, 0); x.scale(-1, 1);
      x.drawImage(video, 0, 0, c.width, c.height);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.filter = 'none';
      if (fx === 'robot') x.drawImage(overlay, 0, 0, c.width, c.height);
      const flash = h('div.pb-flash');
      stage.append(flash);
      setTimeout(() => flash.remove(), 400);
      os.audio.screenshot();
      const url = c.toDataURL('image/jpeg', 0.9);
      const ref = await saveImage(dataURLToBlob(url));
      const path = os.vfs.uniqueName(`${HOME}/Pictures`, 'Photo Booth.jpg');
      os.vfs.write(path, '', { imageRef: ref });
      strip.prepend(h('button.pb-shot', { onclick: () => os.openPath(path) }, h('img', { src: imageURL({ imageRef: ref }), alt: 'Photo' })));
    };
    const w = os.createWindow({
      app: this, title: 'Photo Booth', width: 760, height: 620, className: 'win-photobooth', dark: true,
      onClose: () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); },
      body: (b) => b.append(h('div.pb', {}, stage, h('div.pb-bar', {}, effectBtns, h('button.pb-snap', { 'aria-label': 'Take photo', onclick: snap })), strip)),
      onKey: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); snap(); } },
    });
    start();
    return w;
  },
};
