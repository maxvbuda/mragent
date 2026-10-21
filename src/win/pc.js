import * as THREE from 'three';

/**
 * Kuma's Windows PC. One state machine shared by the little screen in the 3D room
 * and the full simulator you get by clicking it: the machine works for a bit, then
 * nags, force-updates or blue-screens, and Kuma reacts to every one of those.
 */
const W = 1024, H = 584;
const UI = '"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const MONO = 'Consolas, "Cascadia Code", Menlo, monospace';

export const NAGS = [
  { app: 'Microsoft Edge', title: 'Microsoft Edge is recommended for Windows', body: 'Switch back to Microsoft Edge? It’s faster, safer and made for Windows.', yes: 'Switch now', no: 'Not now' },
  { app: 'OneDrive', title: 'Your files aren’t backed up', body: 'Turn on OneDrive backup so you never lose a file. You have 5 GB free (4.98 GB used).', yes: 'Turn on backup', no: 'Remind me later' },
  { app: 'Copilot', title: 'Copilot can help with that', body: 'It looks like you’re writing code. Want Copilot to rewrite it in a more Microsoft way?', yes: 'Try Copilot', no: 'Maybe later' },
  { app: 'Microsoft Store', title: 'Candy Crush Saga was installed', body: 'We thought you’d like it. It’s now pinned to Start.', yes: 'Play', no: 'Close' },
  { app: 'Windows Update', title: 'Restart required', body: 'Your device will restart outside of active hours. Active hours: never.', yes: 'Restart now', no: 'Pick a time' },
  { app: 'Microsoft 365', title: 'Your free trial is waiting', body: 'Get Word, Excel, PowerPoint and 1 TB of cloud storage for just $99.99/year.', yes: 'Try free for 1 month', no: 'Not now' },
  { app: 'Windows Security', title: 'Virus & threat protection', body: 'No action needed. We just wanted to say hi. 👋', yes: 'OK', no: 'Dismiss' },
  { app: 'Windows Security', title: 'Threat quarantined', body: 'Trojan:Win32/RobotSentience.A was found in Program.cs. Your code has been removed for your safety.', yes: 'See details', no: 'Dismiss' },
  { app: 'Printers', title: 'Printer offline', body: 'HP DeskJet 2700 is offline. You don’t own an HP DeskJet 2700. 47 documents are waiting.', yes: 'Open queue', no: 'Dismiss' },
  { app: 'Recall', title: 'Recall saved a moment', body: 'You looked frustrated at 10:42. We saved it, so you can relive it.', yes: 'Relive it', no: 'Please don’t' },
  { app: 'PC Health Check', title: 'Your PC isn’t eligible for Windows 11', body: 'Upgrade to Windows 11 today! (You are on Windows 11.)', yes: 'Check now', no: 'Later' },
  { app: 'Outlook', title: 'Try the new Outlook', body: 'The new Outlook is here. You’ve already been switched. There is no old Outlook.', yes: 'Open Outlook', no: 'OK' },
  { app: 'USB', title: 'USB device not recognized', body: 'The last USB device you connected to this computer malfunctioned. You haven’t connected anything.', yes: 'Troubleshoot', no: 'Ignore' },
  { app: 'Xbox', title: 'Kuma, your Game Pass trial ends soon', body: 'You signed up for this trial in 2019 by pressing a key. Renew now for $19.99/month.', yes: 'Renew', no: 'Cancel (requires phone call)' },
  { app: 'Windows', title: 'Get even more out of Windows', body: 'Finish setting up your device. You finished setting it up yesterday. And the day before.', yes: 'Continue', no: 'Remind me in 3 days' },
  { app: 'Bing', title: 'Make Bing your default search?', body: 'Get rewards points every time you search for “how to change default search engine”.', yes: 'Yes, make Bing default', no: 'Keep Bing anyway' },
];
const STOP_CODES = ['IRQL_NOT_LESS_OR_EQUAL', 'CRITICAL_PROCESS_DIED', 'SYSTEM_SERVICE_EXCEPTION', 'KMODE_EXCEPTION_NOT_HANDLED', 'PAGE_FAULT_IN_NONPAGED_AREA', 'DPC_WATCHDOG_VIOLATION', 'KUMA_TYPED_TOO_FAST'];
const CODE = `using System;
using Windows.Foundation;

namespace KumaAgent
{
    // TODO: figure out why this only works on Tuesdays
    public class Program
    {
        static async Task Main(string[] args)
        {
            var path = @"C:\\Users\\Kuma\\OneDrive\\Documents\\agent";
            if (!Directory.Exists(path))
                throw new Exception("OneDrive moved it again");

            var agent = new Agent(model: "kuma-7b");
            await agent.RunAsync(goal: "ship before the next update");
            Console.WriteLine("Done. Please don't restart.");
        }
    }
}`.split('\n');

export class WinPC {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.state = 'desktop'; // desktop | update | bsod | boot
    this.stateT = 0;
    this.percent = 0;
    this.stop = STOP_CODES[0];
    this.toast = null;
    this.toastT = 0;
    this.next = 18 + Math.random() * 14;
    this.typed = 120;
    this.listeners = [];
    this.inUse = false;
    this.acc = 1;
    this.t = 0;
    this.pendingUpdate = false;
    this.crashes = 0;
    this.updates = 0;
  }

  on(fn) { this.listeners.push(fn); }
  emit(e, data) { this.listeners.forEach((f) => f(e, data)); }

  set(state) {
    this.state = state;
    this.stateT = 0;
    this.percent = 0;
    if (state === 'bsod') { this.stop = STOP_CODES[Math.floor(Math.random() * STOP_CODES.length)]; this.crashes++; }
    if (state === 'update') this.updates++;
    this.emit(state === 'desktop' ? 'work' : state, this);
  }

  /** Something nags. Returns the nag shown. */
  nag(n = NAGS[Math.floor(Math.random() * NAGS.length)]) {
    this.toast = n;
    this.toastT = 7;
    this.emit('popup', n);
    return n;
  }

  crash() { if (this.state === 'desktop') this.set('bsod'); }
  forceUpdate() { if (this.state === 'desktop') this.set('update'); }

  /** Kuma boots Linux off a USB stick: peace and quiet, until Windows Update notices. */
  linux(seconds = 90) { this.linuxFor = seconds; this.set('linux'); }
  /** No nagging for a while (Kuma's busy with his new Mac). */
  peace(seconds = 120) { this.peaceT = seconds; }

  update(dt) {
    this.t += dt;
    this.stateT += dt;
    if (this.toast) { this.toastT -= dt; if (this.toastT <= 0) this.toast = null; }
    if (this.peaceT > 0) this.peaceT -= dt;
    if (this.state === 'desktop') {
      if (!this.inUse) this.typed += dt * 9;
      if (!(this.peaceT > 0)) this.next -= dt;
      if (this.next <= 0) {
        this.next = (this.inUse ? 35 : 22) + Math.random() * 25;
        const r = Math.random();
        if (r < 0.48) this.nag();
        else if (r < 0.7) this.set('update');
        else if (r < 0.9) this.set('bsod');
        else this.emit('win', this);
      }
    } else if (this.state === 'bsod') {
      this.percent = Math.min(100, Math.floor(this.stateT * 14));
      if (this.stateT > 8) this.set('boot');
    } else if (this.state === 'update') {
      // fast at first, then stuck at 99 for a while: the classic
      const t = this.stateT;
      this.percent = t < 6 ? Math.floor(t * 12) : t < 9 ? 72 + Math.floor((t - 6) * 9) : t < 16 ? 99 : 100;
      if (t > 16.5) this.set('boot');
    } else if (this.state === 'boot') {
      if (this.stateT > 4.5) this.set('desktop');
    } else if (this.state === 'linux') {
      this.typed += dt * 14;
      if (this.stateT > this.linuxFor) {
        this.set('update');
        this.restoring = true;
        setTimeout(() => this.nag({ app: 'Windows Update', title: 'We restored Windows for you', body: 'An unrecognised operating system was found on your PC. Don’t worry, we fixed it.', yes: 'Thanks?', no: 'NO' }), 24000);
      }
    }
    this.acc += dt;
    if (this.acc > 1 / 12) { this.acc = 0; this.draw(); }
  }

  // ------------------------------------------------------------ the little screen in the room
  draw() {
    const x = this.ctx;
    x.save();
    if (this.state === 'bsod') drawBSOD(x, W, H, this);
    else if (this.state === 'update') drawUpdate(x, W, H, this);
    else if (this.state === 'boot') drawBoot(x, W, H, this);
    else if (this.state === 'linux') drawLinux(x, W, H, this);
    else this.drawDesktop(x);
    x.restore();
    this.texture.needsUpdate = true;
  }

  drawDesktop(x) {
    drawWallpaper(x, W, H);
    // editor window
    const wx = 70, wy = 40, ww = 640, wh = 440;
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.fillRect(wx + 4, wy + 8, ww, wh);
    x.fillStyle = '#1f1f1f';
    x.fillRect(wx, wy, ww, wh);
    x.fillStyle = '#2b2b2b';
    x.fillRect(wx, wy, ww, 28);
    x.fillStyle = '#ccc';
    x.font = `13px ${UI}`;
    x.fillText('Program.cs - KumaAgent - Visual Studio Code', wx + 12, wy + 18);
    x.fillText('—    ☐    ✕', wx + ww - 90, wy + 18);
    x.fillStyle = '#252526';
    x.fillRect(wx, wy + 28, 44, wh - 28);
    x.font = `14px ${MONO}`;
    let left = Math.floor(this.typed);
    const lines = [];
    for (const ln of CODE) { if (left <= 0) break; lines.push(ln.slice(0, left)); left -= ln.length + 1; }
    if (left > 0) this.typed = 0;
    lines.forEach((ln, i) => {
      x.fillStyle = '#858585';
      x.fillText(String(i + 1).padStart(2), wx + 10, wy + 52 + i * 19);
      x.fillStyle = /^\s*\/\//.test(ln) ? '#6a9955' : /"/.test(ln) ? '#ce9178' : /\b(using|public|class|static|var|new|if|throw|await|namespace|async)\b/.test(ln) ? '#569cd6' : '#d4d4d4';
      x.fillText(ln, wx + 54, wy + 52 + i * 19);
    });
    if (Math.floor(this.t * 2) % 2) {
      const last = lines[lines.length - 1] || '';
      x.fillStyle = '#aeafad';
      x.fillRect(wx + 54 + x.measureText(last).width, wy + 38 + (lines.length - 1) * 19, 2, 17);
    }
    drawTaskbar(x, W, H, this.t);
    drawWatermark(x, W, H);
    if (this.toast) drawToast(x, W, H, this.toast);
  }
}

// ------------------------------------------------------------ shared painters (the DOM sim reuses the look)
export function drawWallpaper(x, w, h) {
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#0b2a6b');
  g.addColorStop(0.5, '#1966d2');
  g.addColorStop(1, '#79b8ff');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // the "bloom"
  x.save();
  x.translate(w * 0.55, h * 0.58);
  for (let i = 0; i < 9; i++) {
    x.rotate(0.38);
    const r = x.createRadialGradient(0, 0, 10, 0, 0, h * 0.5);
    r.addColorStop(0, 'rgba(160,210,255,0.35)');
    r.addColorStop(1, 'rgba(20,80,200,0)');
    x.fillStyle = r;
    x.beginPath();
    x.ellipse(h * 0.18, 0, h * 0.34, h * 0.11, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();
}

function drawTaskbar(x, w, h, t) {
  x.fillStyle = 'rgba(32,32,40,0.88)';
  x.fillRect(0, h - 40, w, 40);
  const icons = ['#1e90ff', '#ffd23f', '#0f7bdc', '#3ab0ff', '#7b83eb', '#e3e3e3'];
  const cx = w / 2 - icons.length * 22;
  icons.forEach((c, i) => {
    x.fillStyle = c;
    if (i === 0) { // start
      x.fillRect(cx + 10, h - 30, 9, 9); x.fillRect(cx + 21, h - 30, 9, 9); x.fillRect(cx + 10, h - 19, 9, 9); x.fillRect(cx + 21, h - 19, 9, 9);
    } else {
      x.beginPath();
      x.roundRect(cx + i * 44 + 8, h - 32, 24, 24, 5);
      x.fill();
    }
  });
  x.fillStyle = '#fff';
  x.font = `12px ${UI}`;
  const d = new Date();
  x.fillText(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), w - 70, h - 23);
  x.fillText(d.toLocaleDateString(), w - 76, h - 8);
}

function drawWatermark(x, w, h) {
  x.fillStyle = 'rgba(255,255,255,0.45)';
  x.font = `17px ${UI}`;
  x.fillText('Activate Windows', w - 250, h - 82);
  x.font = `12px ${UI}`;
  x.fillText('Go to Settings to activate Windows.', w - 250, h - 64);
}

function drawToast(x, w, h, n) {
  const tw = 330, th = 120, tx = w - tw - 14, ty = h - 40 - th - 12;
  x.fillStyle = '#2b2b2b';
  x.beginPath(); x.roundRect(tx, ty, tw, th, 8); x.fill();
  x.fillStyle = '#9aa0a6';
  x.font = `11px ${UI}`;
  x.fillText(n.app, tx + 14, ty + 20);
  x.fillStyle = '#fff';
  x.font = `bold 14px ${UI}`;
  x.fillText(n.title, tx + 14, ty + 44);
  x.font = `12px ${UI}`;
  wrap(x, n.body, tx + 14, ty + 64, tw - 28, 16, 2);
  x.fillStyle = '#4cc2ff';
  x.beginPath(); x.roundRect(tx + 14, ty + th - 30, 140, 22, 4); x.fill();
}

export function drawBSOD(x, w, h, pc) {
  x.fillStyle = '#0078d7';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#fff';
  const s = w / 1024;
  x.font = `${120 * s}px ${UI}`;
  x.fillText(':(', 90 * s, 190 * s);
  x.font = `${26 * s}px ${UI}`;
  wrap(x, 'Your PC ran into a problem and needs to restart. We’re just collecting some error info, and then we’ll restart for you.', 90 * s, 260 * s, 760 * s, 36 * s, 3);
  x.fillText(`${pc.percent}% complete`, 90 * s, 360 * s);
  x.fillStyle = '#fff';
  x.fillRect(90 * s, 400 * s, 90 * s, 90 * s);
  x.fillStyle = '#0078d7';
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if ((i * 7 + j * 3 + i * j) % 3 === 0) x.fillRect((96 + i * 11) * s, (406 + j * 11) * s, 10 * s, 10 * s);
  x.fillStyle = '#fff';
  x.font = `${14 * s}px ${UI}`;
  x.fillText('For more information about this issue and possible fixes, visit https://www.windows.com/stopcode', 200 * s, 420 * s);
  x.fillText('If you call a support person, give them this info:', 200 * s, 452 * s);
  x.fillText(`Stop code: ${pc.stop}`, 200 * s, 474 * s);
}

export function drawUpdate(x, w, h, pc) {
  x.fillStyle = '#0a2a5c';
  x.fillRect(0, 0, w, h);
  spinner(x, w / 2, h * 0.38, 22 * (w / 1024), pc.t);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.font = `${22 * (w / 1024)}px ${UI}`;
  x.fillText(`Working on updates  ${pc.percent}%`, w / 2, h * 0.55);
  x.fillText('Don’t turn off your PC. This will take a while.', w / 2, h * 0.55 + 34 * (w / 1024));
  x.font = `${15 * (w / 1024)}px ${UI}`;
  x.fillStyle = 'rgba(255,255,255,0.7)';
  x.fillText('Your PC will restart several times', w / 2, h * 0.9);
  x.textAlign = 'left';
}

const LINUX = ['kuma@thinkpad:~$ uname -a', 'Linux thinkpad 6.11.0-kuma #1 SMP PREEMPT x86_64 GNU/Linux', 'kuma@thinkpad:~$ uptime', ' 14:02:11 up 3 min,  1 user,  load average: 0.01, 0.02, 0.00', 'kuma@thinkpad:~$ # no updates. no pop-ups. no Copilot.',
  'kuma@thinkpad:~$ # just silence.', 'kuma@thinkpad:~$ cowsay "peace at last"', ' _______________', '< peace at last >', ' ---------------', '        \\   ^__^', '         \\  (oo)\\_______', '            (__)\\       )\\/\\', 'kuma@thinkpad:~$ cd agent && make', 'gcc -O2 -o agent main.c', 'Build succeeded. First try.', 'kuma@thinkpad:~$ '];
export function drawLinux(x, w, h, pc) {
  x.fillStyle = '#300a24';
  x.fillRect(0, 0, w, h);
  const s = w / 1024;
  x.fillStyle = '#2c2c2c';
  x.fillRect(0, 0, w, 26 * s);
  x.fillStyle = '#ddd';
  x.font = `${13 * s}px ${UI}`;
  x.fillText('Activities          Terminal', 10 * s, 18 * s);
  x.font = `${16 * s}px ${MONO}`;
  let left = Math.floor(pc.typed / 2);
  LINUX.forEach((ln, i) => {
    if (left <= 0) return;
    x.fillStyle = ln.startsWith('kuma@') ? '#8ae234' : '#eeeeec';
    x.fillText(ln.slice(0, left), 18 * s, (56 + i * 26) * s);
    left -= ln.length;
  });
}

export function drawBoot(x, w, h, pc) {
  x.fillStyle = '#000';
  x.fillRect(0, 0, w, h);
  const s = w / 1024, cx = w / 2, cy = h * 0.4;
  x.fillStyle = '#2b8cff';
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) x.fillRect(cx + (dx < 0 ? -42 : 3) * s, cy + (dy < 0 ? -42 : 3) * s, 39 * s, 39 * s);
  spinner(x, cx, h * 0.72, 14 * s, pc.t);
}

function spinner(x, cx, cy, r, t) {
  x.fillStyle = '#fff';
  for (let i = 0; i < 6; i++) {
    const a = t * 5 - i * 0.42;
    x.globalAlpha = 1 - i * 0.14;
    x.beginPath();
    x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.13, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
}

function wrap(x, text, tx, ty, maxW, lh, maxLines = 9) {
  let line = '', n = 0;
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (x.measureText(test).width > maxW && line) {
      x.fillText(line, tx, ty + n * lh);
      if (++n >= maxLines) return;
      line = word;
    } else line = test;
  }
  if (line) x.fillText(line, tx, ty + n * lh);
}
