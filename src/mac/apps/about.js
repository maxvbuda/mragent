import { h } from '../ui.js';
import { appIcon } from '../icons.js';

export const SPECS = {
  model: 'MacBook Pro',
  year: '16-inch, 2031',
  chip: 'Apple M7 Ultra Max',
  memory: '8 TB',
  disk: 'Macintosh HD · 1 PB',
  serial: 'B33PB00P1024',
  os: 'macOS Big Byte 31.0',
  table: {
    'Model Name': 'MacBook Pro', 'Model Identifier': 'Mac31,1', 'Chip': 'Apple M7 Ultra Max',
    'Total Number of Cores': '1,024 (768 performance and 256 efficiency)', 'GPU': '4,096-core GPU with hardware ray tracing 2.0',
    'Neural Engine': '2,048-core, 9,000 TOPS', 'Memory': '8 TB unified LPDDR9 · 1.2 PB/s bandwidth',
    'Storage': '1 PB SSD · 140 GB/s read', 'Display': '16.2″ Liquid Retina Ultra XDR · 32K (30720 × 19200) · 1000 Hz ProMotion · 100,000 nits peak',
    'Battery': '∞ Wh · Cycle count 0 · Condition: Immortal', 'Ports': '6 × Thunderbolt 9 (480 Gb/s), MagSafe 5, HDMI 3.0, SDUC, 1 × Espresso port',
    'Wireless': 'Wi-Fi 9 (BE-2), Bluetooth 7.0, Starlink Direct, AirDrop to Mars', 'Camera': '48 MP Center Stage, sees through walls (opt-in)',
    'Speakers': '12-speaker array, spatial audio, can play notes only dogs hear', 'Weight': '1.2 kg (2.6 lb) including the coffee',
    'System Firmware Version': '11881.1.1 (robot)', 'Serial Number': 'B33PB00P1024', 'Hardware UUID': 'DEADBEEF-CAFE-F00D-1024-C0FFEE000001',
  },
};

function laptopArt() {
  return `<svg viewBox="0 0 240 150" class="about-art"><defs>
    <linearGradient id="ab-s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1b5e"/><stop offset=".55" stop-color="#c2457a"/><stop offset="1" stop-color="#ffb46b"/></linearGradient>
    <linearGradient id="ab-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6d7db"/><stop offset="1" stop-color="#8e9198"/></linearGradient></defs>
    <rect x="30" y="8" width="180" height="118" rx="8" fill="#0d0d0f"/><rect x="36" y="14" width="168" height="106" rx="3" fill="url(#ab-s)"/>
    <rect x="106" y="8" width="28" height="6" rx="3" fill="#0d0d0f"/>
    <ellipse cx="120" cy="64" rx="22" ry="20" fill="#f4f6fa"/><rect x="104" y="58" width="32" height="13" rx="6.5" fill="#05070a"/><circle cx="113" cy="64.5" r="2.6" fill="#49e3ff"/><circle cx="127" cy="64.5" r="2.6" fill="#49e3ff"/>
    <path d="M10 126h220l-8 12H18Z" fill="url(#ab-b)"/><rect x="100" y="126" width="40" height="4" rx="2" fill="#7c7f86"/></svg>`;
}

export const about = {
  id: 'about', name: 'About This Mac', icon: 'about', hidden: true,
  launch(os) {
    return os.createWindow({
      app: this, title: '', width: 290, height: 438, resizable: false, className: 'win-about',
      body: (b) => b.append(h('div.about', {},
        h('div', { html: laptopArt() }),
        h('h2', { text: SPECS.model }),
        h('p.about-sub', { text: SPECS.year }),
        h('dl.about-specs', {},
          ...[['Chip', SPECS.chip], ['Memory', SPECS.memory], ['Startup disk', SPECS.disk], ['Serial number', SPECS.serial], ['macOS', SPECS.os]].flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
        h('div.about-btns', {}, h('button.btn', { text: 'More Info…', onclick: () => os.launch('sysinfo') }), h('button.btn', { text: 'Benchmark', onclick: () => os.launch('benchmark') })),
        h('p.about-legal', { text: '™ and © 2031 Mr. Agent. All rights reserved. No coffee was harmed.' }))),
    });
  },
};

export const sysinfo = {
  id: 'sysinfo', name: 'System Information', icon: 'settings', hidden: true,
  launch(os) {
    const sections = {
      'Hardware Overview': SPECS.table,
      Processors: { 'Chip': SPECS.chip, 'Performance cores': '768 @ 9.8 GHz', 'Efficiency cores': '256 @ 4.2 GHz', 'L2 cache': '1 GB', 'System Level Cache': '96 GB', 'Process': 'TSMC A3 (3 Å)', 'Thermal design': 'Silent. Fanless. Smug.' },
      Graphics: { 'Chipset Model': 'Apple M7 Ultra Max GPU', 'Cores': '4,096', 'Ray tracing': '1.2 trillion rays/s', 'Metal Support': 'Metal 7', 'Displays': '16.2″ 32K built-in + up to 12 external 16K displays' },
      Memory: { 'Size': '8 TB', 'Type': 'LPDDR9 unified', 'Bandwidth': '1.2 PB/s', 'Used': '12.4 GB (0.15%)', 'Compressed': '0 bytes (no need)' },
      Storage: { 'Macintosh HD': '1 PB APFS (encrypted)', 'Available': '999.98 TB', 'Read speed': '140 GB/s', 'Write speed': '120 GB/s', 'TRIM': 'Yes' },
      Power: { 'Battery capacity': '∞ Wh', 'Cycle count': '0', 'Condition': 'Immortal', 'Charging': 'Not needed', 'Power source': 'Coffee (via Espresso port)' },
      Network: { 'Wi-Fi': `Wi-Fi 9 · ${os.prefs.network}`, 'Throughput': '40 Gb/s', 'Bluetooth': '7.0, range 1 km', 'Satellite': 'Starlink Direct', 'Ethernet': 'Thunderbolt 9 dongle (sold separately, obviously)' },
      'Neural Engine': { 'Cores': '2,048', 'Throughput': '9,000 TOPS', 'Current model': 'mr-agent-v7 (local)', 'Context window': 'everything, forever' },
    };
    const main = h('div.si-main.scroll');
    const side = h('div.sb.si-side', { style: { width: '190px' } });
    const show = (name) => {
      side.querySelectorAll('.sb-item').forEach((x) => x.classList.toggle('on', x.textContent === name));
      main.innerHTML = '';
      main.append(h('h3', { text: name }), h('dl.si-table', {}, ...Object.entries(sections[name]).flatMap(([k, v]) => [h('dt', { text: `${k}:` }), h('dd', { text: v })])));
    };
    side.append(h('div.sb-h', { text: 'Hardware' }), ...Object.keys(sections).map((n) => h('div.sb-item', { text: n, onclick: () => show(n) })));
    const w = os.createWindow({ app: this, title: 'MacBook Pro', width: 760, height: 480, sidebarWidth: 190, body: (b) => b.append(h('div.split', {}, side, main)) });
    show('Hardware Overview');
    return w;
  },
};

export const benchmark = {
  id: 'benchmark', name: 'Benchmark', icon: 'benchmark',
  about: 'Benchmark 9 — measures how fast this Mac is (very).',
  launch(os) {
    const results = h('div.bm-results');
    const btn = h('button.btn.primary', { text: 'Run Benchmarks' });
    const bar = h('div.bm-bar', {}, h('i'));
    const status = h('p.bm-status', { text: 'Tests CPU, GPU, Neural Engine and coffee throughput.' });
    const tests = [['Single-Core', 98_431], ['Multi-Core', 31_890_224], ['GPU (Metal)', 9_120_553], ['Neural Engine', 4_200_000], ['Espresso / s', 3]];
    const compare = [['This Mac', 1], ['M4 Max (2024)', 0.0007], ['Kuma’s laptop', 0.0003], ['Apollo Guidance Computer', 1e-9]];
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      results.innerHTML = '';
      const fill = bar.querySelector('i');
      for (let i = 0; i < tests.length; i++) {
        status.textContent = `Running ${tests[i][0]}…`;
        for (let p = 0; p <= 100; p += 10) { fill.style.width = `${((i + p / 100) / tests.length) * 100}%`; await new Promise((r) => setTimeout(r, 40)); }
        results.append(h('div.bm-row', {}, h('span', { text: tests[i][0] }), h('b', { text: tests[i][1].toLocaleString() })));
      }
      fill.style.width = '100%';
      status.textContent = 'Done. Compared with other machines (multi-core):';
      results.append(h('div.bm-compare', {}, ...compare.map(([n, k]) => h('div.bm-c', {}, h('span', { text: n }), h('div.bm-track', {}, h('i', { style: { width: `${Math.max(0.6, k * 100)}%` } })), h('small', { text: Math.round(tests[1][1] * k).toLocaleString() })))));
      btn.disabled = false;
      btn.textContent = 'Run Again';
      os.audio.happy();
    });
    return os.createWindow({
      app: this, title: 'Benchmark 9', width: 520, height: 520, body: (b) => b.append(h('div.bm', {},
        h('div.bm-head', {}, h('span.bm-logo', { html: appIcon('benchmark') }), h('div', {}, h('h2', { text: 'Benchmark 9' }), h('small', { text: `${SPECS.chip} · 1,024 cores · 8 TB` }))),
        status, bar, btn, results)),
    });
  },
};
