/** Hand-drawn SVG icons for every app and file type (no external assets). */
const SQ = 'M50 2C88 2 98 12 98 50S88 98 50 98 2 88 2 50 12 2 50 2Z';
let gid = 0;

function squircle(bg, inner, { stroke = false } = {}) {
  const id = `g${gid++}`;
  const stops = bg.map((c, i) => `<stop offset="${i / Math.max(1, bg.length - 1)}" stop-color="${c}"/>`).join('');
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="${SQ}" fill="url(#${id})"/>${inner}
    <path d="${SQ}" fill="url(#${id}s)" opacity=".6"/>${stroke ? `<path d="${SQ}" fill="none" stroke="rgba(0,0,0,.12)"/>` : ''}
  </svg>`;
}

const ICONS = {
  finder: () => squircle(['#6ec6ff', '#1d7cf2'], `
    <path d="M50 4v92" stroke="#0c3f8a" stroke-width="2"/>
    <path d="M50 2C88 2 98 12 98 50S88 98 50 98Z" fill="#e9f2ff"/>
    <path d="M34 30v12M66 30v12" stroke="#0c3f8a" stroke-width="5" stroke-linecap="round"/>
    <path d="M24 64c14 12 38 12 52 0" fill="none" stroke="#0c3f8a" stroke-width="5" stroke-linecap="round"/>
    <path d="M50 22c-6 14-8 26-2 40h6" fill="none" stroke="#0c3f8a" stroke-width="4" stroke-linecap="round"/>`),
  safari: () => squircle(['#fdfdfd', '#dfe3ea'], `
    <circle cx="50" cy="50" r="38" fill="#1f8cff"/><circle cx="50" cy="50" r="33" fill="#5ab0ff"/>
    ${Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return `<line x1="${50 + Math.cos(a) * 29}" y1="${50 + Math.sin(a) * 29}" x2="${50 + Math.cos(a) * 33}" y2="${50 + Math.sin(a) * 33}" stroke="#fff" stroke-width="1.2"/>`; }).join('')}
    <path d="M50 50L70 28 56 56Z" fill="#ff3b30"/><path d="M50 50L30 72 44 44Z" fill="#fff"/>`, { stroke: true }),
  messages: () => squircle(['#6cf27d', '#16c13a'], `
    <path d="M50 22c-19 0-33 11-33 25 0 8 5 15 12 19-1 5-4 9-8 12 8 0 14-3 18-6 4 1 7 1 11 1 19 0 33-11 33-26S69 22 50 22Z" fill="#fff"/>`),
  music: () => squircle(['#ff6b81', '#fa2d48'], `
    <path d="M40 70V32l32-7v38" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
    <ellipse cx="34" cy="70" rx="8" ry="6.5" fill="#fff"/><ellipse cx="66" cy="63" rx="8" ry="6.5" fill="#fff"/>`),
  photos: () => squircle(['#ffffff', '#eef0f3'], [['#ff9500', 0], ['#ffcc00', 45], ['#34c759', 90], ['#00c7be', 135], ['#007aff', 180], ['#5856d6', 225], ['#af52de', 270], ['#ff2d55', 315]]
    .map(([c, a]) => `<ellipse cx="50" cy="31" rx="10" ry="19" fill="${c}" opacity=".85" transform="rotate(${a} 50 50)" style="mix-blend-mode:multiply"/>`).join(''), { stroke: true }),
  notes: () => squircle(['#fff7c2', '#ffe680'], `
    <path d="M2 26h96" stroke="#e8c200" stroke-width="1"/>
    ${[40, 52, 64, 76].map((y) => `<path d="M16 ${y}h68" stroke="#d9cfa0" stroke-width="2"/>`).join('')}
    <path d="M2 50C2 12 12 2 50 2S98 12 98 26H2Z" fill="#ffd60a"/>`, { stroke: true }),
  calendar: () => {
    const d = new Date();
    return squircle(['#ffffff', '#f2f2f2'], `
    <text x="50" y="30" text-anchor="middle" font-family="-apple-system,Helvetica" font-size="15" font-weight="600" fill="#ff3b30">${d.toLocaleDateString('en', { weekday: 'short' }).toUpperCase()}</text>
    <text x="50" y="77" text-anchor="middle" font-family="-apple-system,Helvetica" font-size="48" font-weight="300" fill="#1d1d1f">${d.getDate()}</text>`, { stroke: true });
  },
  calculator: () => squircle(['#4a4a4e', '#1c1c1e'], `
    <rect x="18" y="16" width="64" height="18" rx="4" fill="#9fdc9a"/>
    ${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect x="${18 + c * 17}" y="${42 + r * 15}" width="13" height="11" rx="3" fill="${c === 3 ? '#ff9f0a' : '#8e8e93'}"/>`).join('')).join('')}`),
  terminal: () => squircle(['#3a3a3c', '#111'], `
    <rect x="10" y="14" width="80" height="72" rx="8" fill="#000" stroke="#555"/>
    <path d="M22 36l12 10-12 10" fill="none" stroke="#e5e5e5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M40 58h20" stroke="#e5e5e5" stroke-width="5" stroke-linecap="round"/>`),
  code: () => squircle(['#2b3a55', '#0f1626'], `
    <path d="M36 32L20 50l16 18M64 32l16 18-16 18" fill="none" stroke="#49e3ff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M56 26L44 74" stroke="#ff5fa2" stroke-width="6" stroke-linecap="round"/>`),
  activity: () => squircle(['#2c2c2e', '#0b0b0c'], `
    <polyline points="12,56 30,56 38,30 50,76 60,44 68,56 88,56" fill="none" stroke="#32d74b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`),
  settings: () => squircle(['#c9ccd2', '#8a8f98'], `
    <g transform="translate(50 50)">
      ${Array.from({ length: 12 }, (_, i) => `<rect x="-5" y="-38" width="10" height="16" rx="2" fill="#4b4f57" transform="rotate(${i * 30})"/>`).join('')}
      <circle r="27" fill="#4b4f57"/><circle r="20" fill="#d8dbe0"/><circle r="9" fill="#4b4f57"/>
    </g>`),
  weather: () => squircle(['#5cb8ff', '#1f6fe0'], `
    <circle cx="40" cy="40" r="16" fill="#ffd60a"/>
    <path d="M36 74h34a13 13 0 0 0 0-26 18 18 0 0 0-34 4 11 11 0 0 0 0 22Z" fill="#fff"/>`),
  textedit: () => squircle(['#ffffff', '#e8e8ea'], `
    <rect x="22" y="12" width="56" height="76" rx="4" fill="#fff" stroke="#c7c7cc"/>
    ${[26, 36, 46, 56, 66].map((y, i) => `<path d="M30 ${y}h${i % 2 ? 30 : 40}" stroke="#8e8e93" stroke-width="3" stroke-linecap="round"/>`).join('')}
    <path d="M62 78l18-34 6 3-18 34-8 4Z" fill="#ff9f0a"/>`, { stroke: true }),
  preview: () => squircle(['#e7f0ff', '#b7d1ff'], `
    <rect x="18" y="22" width="56" height="44" rx="4" fill="#fff" stroke="#8aa9d6"/><path d="M22 60l14-16 10 10 8-8 16 14Z" fill="#34c759"/><circle cx="60" cy="34" r="5" fill="#ffcc00"/>
    <circle cx="62" cy="60" r="16" fill="none" stroke="#3a3a3c" stroke-width="5"/><path d="M73 71l12 12" stroke="#3a3a3c" stroke-width="7" stroke-linecap="round"/>`),
  minesweeper: () => squircle(['#c7cfd9', '#8e9aab'], `
    <circle cx="50" cy="52" r="20" fill="#1c1c1e"/>
    ${[0, 45, 90, 135].map((a) => `<rect x="47" y="22" width="6" height="60" rx="3" fill="#1c1c1e" transform="rotate(${a} 50 52)"/>`).join('')}
    <circle cx="43" cy="45" r="5" fill="#fff"/>`),
  snake: () => squircle(['#43d17a', '#118a43'], `
    <path d="M24 70h20V50h22V30" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="square"/>
    <circle cx="72" cy="30" r="5" fill="#ff3b30"/>`),
  benchmark: () => squircle(['#2f2f8f', '#121244'], `
    <path d="M20 72a32 32 0 1 1 60 0" fill="none" stroke="#6a6aff" stroke-width="8" stroke-linecap="round"/>
    <path d="M50 66L72 36" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="66" r="7" fill="#fff"/>`),
  launchpad: () => squircle(['#8e9cb3', '#53627c'], [0, 1, 2].map((r) => [0, 1, 2].map((c) =>
    `<rect x="${20 + c * 22}" y="${20 + r * 22}" width="16" height="16" rx="5" fill="${['#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#8338ec', '#3a86ff', '#fb5607', '#ffbe0b'][r * 3 + c]}"/>`).join('')).join('')),
  appstore: () => squircle(['#2bb3ff', '#0a6cff'], `<path d="M50 20L30 66M50 20l20 46M26 56h48" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`),
  about: () => squircle(['#f5f5f7', '#d2d2d7'], `<rect x="16" y="26" width="68" height="44" rx="4" fill="#1d1d1f"/><rect x="20" y="30" width="60" height="36" fill="#49e3ff" opacity=".7"/><path d="M10 74h80l-6 6H16Z" fill="#a1a1a6"/>`, { stroke: true }),
  mail: () => squircle(['#6ab7ff', '#1a73e8'], `
    <rect x="18" y="28" width="64" height="44" rx="6" fill="#fff"/><path d="M20 32l30 22 30-22" fill="none" stroke="#1a73e8" stroke-width="4" stroke-linejoin="round"/>`),
  reminders: () => squircle(['#ffffff', '#ececef'], [['#0a84ff', 30], ['#ff9f0a', 50], ['#ff453a', 70]].map(([c, y]) => `<circle cx="28" cy="${y}" r="7" fill="none" stroke="${c}" stroke-width="3"/><path d="M42 ${y}h34" stroke="#c7c7cc" stroke-width="4" stroke-linecap="round"/>`).join(''), { stroke: true }),
  findmy: () => squircle(['#4cd964', '#1fa64a'], `
    <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width="3" opacity=".5"/><circle cx="50" cy="50" r="19" fill="none" stroke="#fff" stroke-width="3" opacity=".75"/><circle cx="50" cy="50" r="8" fill="#fff"/>`),
  clock: () => squircle(['#2c2c2e', '#000'], `
    <circle cx="50" cy="50" r="34" fill="#fff"/>${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<line x1="${50 + Math.sin(a) * 28}" y1="${50 - Math.cos(a) * 28}" x2="${50 + Math.sin(a) * 31}" y2="${50 - Math.cos(a) * 31}" stroke="#111" stroke-width="2"/>`; }).join('')}
    <path d="M50 50V30M50 50l14 8" stroke="#111" stroke-width="4" stroke-linecap="round"/><path d="M50 50L36 72" stroke="#ff9f0a" stroke-width="2"/><circle cx="50" cy="50" r="3" fill="#ff9f0a"/>`),
  paint: () => squircle(['#fff4d6', '#ffd479'], `
    <path d="M24 70c4-26 22-44 48-46-8 12-6 20 2 26-10 14-30 22-50 20Z" fill="#fff" stroke="#c9a14a" stroke-width="2"/>
    <circle cx="44" cy="46" r="5" fill="#ff453a"/><circle cx="58" cy="40" r="5" fill="#0a84ff"/><circle cx="40" cy="60" r="5" fill="#30d158"/><circle cx="56" cy="58" r="4" fill="#a259ff"/>`),
  g2048: () => squircle(['#f2b179', '#ed8c4f'], `<text x="50" y="62" text-anchor="middle" font-family="-apple-system,Helvetica" font-size="30" font-weight="800" fill="#fff">2048</text>`),
  flappy: () => squircle(['#7ad3ff', '#3aa3e8'], `
    <rect x="66" y="10" width="14" height="30" fill="#30d158"/><rect x="66" y="64" width="14" height="30" fill="#30d158"/>
    <ellipse cx="38" cy="52" rx="16" ry="14" fill="#f4f6fa"/><rect x="28" y="46" width="20" height="9" rx="4.5" fill="#05070a"/><circle cx="33" cy="50.5" r="2" fill="#49e3ff"/><circle cx="43" cy="50.5" r="2" fill="#49e3ff"/>`),
  stickies: () => squircle(['#fff59a', '#ffe14d'], `
    <rect x="20" y="22" width="44" height="44" fill="#9ff0a5" transform="rotate(-8 42 44)"/><rect x="34" y="34" width="46" height="46" fill="#fff38a" stroke="#d6c34a"/><path d="M42 48h28M42 58h22" stroke="#b8a434" stroke-width="3"/>`),
  dictionary: () => squircle(['#b73a3a', '#7a1f1f'], `<rect x="26" y="20" width="48" height="60" rx="4" fill="#fff"/><text x="50" y="62" text-anchor="middle" font-family="Georgia" font-size="34" font-weight="700" fill="#7a1f1f">Aa</text>`),
  photobooth: () => squircle(['#ff5e5e', '#b31217'], `<circle cx="50" cy="52" r="22" fill="#222"/><circle cx="50" cy="52" r="14" fill="#3a6ea5"/><circle cx="45" cy="47" r="4" fill="#fff"/>`),
};

export function appIcon(id) {
  const f = ICONS[id] || ICONS.about;
  return f();
}

export function trashIcon(full = false) {
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="tr" x1="0" x2="1"><stop offset="0" stop-color="#d9dde3"/><stop offset=".5" stop-color="#f7f8fa"/><stop offset="1" stop-color="#c9ced6"/></linearGradient></defs>
    ${full ? '<path d="M30 22l14-8 12 6 10-4 6 10-40 2Z" fill="#fff" stroke="#bbb"/><path d="M36 24l26-8 6 8Z" fill="#e8f0ff" stroke="#aac"/>' : ''}
    <path d="M24 26h52l-6 66H30Z" fill="url(#tr)" stroke="#a7adb7"/>
    ${[34, 44, 54, 64].map((x) => `<path d="M${x} 32l${(x - 49) * 0.08} 54" stroke="#b7bcc5" stroke-width="2.5"/>`).join('')}
    <rect x="22" y="22" width="56" height="7" rx="3" fill="#e2e5ea" stroke="#a7adb7"/></svg>`;
}

export function folderIcon(variant = '') {
  const glyph = {
    projects: '<path d="M42 54l-6 6 6 6M58 54l6 6-6 6" fill="none" stroke="#1b6ec2" stroke-width="3" stroke-linecap="round"/>',
    downloads: '<path d="M50 50v18M42 61l8 8 8-8" fill="none" stroke="#1b6ec2" stroke-width="3.5" stroke-linecap="round"/>',
    documents: '<path d="M43 50h14M43 57h14M43 64h10" stroke="#1b6ec2" stroke-width="3" stroke-linecap="round"/>',
    pictures: '<path d="M40 68l8-10 6 6 4-4 6 8Z" fill="#1b6ec2"/><circle cx="58" cy="54" r="3" fill="#1b6ec2"/>',
    music: '<path d="M46 66V52l12-3v14" fill="none" stroke="#1b6ec2" stroke-width="3"/><circle cx="44" cy="66" r="3.5" fill="#1b6ec2"/><circle cx="56" cy="63" r="3.5" fill="#1b6ec2"/>',
    desktop: '<rect x="40" y="50" width="20" height="14" rx="2" fill="none" stroke="#1b6ec2" stroke-width="3"/>',
    applications: '<path d="M50 48L40 68M50 48l10 20M38 63h24" stroke="#1b6ec2" stroke-width="3" stroke-linecap="round"/>',
  }[variant] || '';
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0ff"/><stop offset="1" stop-color="#4aa8f5"/></linearGradient></defs>
    <path d="M8 26a6 6 0 0 1 6-6h24l8 8h40a6 6 0 0 1 6 6v6H8Z" fill="#3c95e6"/>
    <path d="M8 36a6 6 0 0 1 6-6h72a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6Z" fill="url(#fl)"/>${glyph}</svg>`;
}

export function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = { js: ['JS', '#f7df1e', '#222'], ts: ['TS', '#3178c6', '#fff'], tsx: ['TSX', '#3178c6', '#fff'], py: ['PY', '#3d7ab3', '#ffd43b'], rs: ['RS', '#b7410e', '#fff'], glsl: ['GL', '#5b3fd9', '#fff'], json: ['{ }', '#8e8e93', '#fff'], html: ['</>', '#e34c26', '#fff'], css: ['CSS', '#264de4', '#fff'], md: ['MD', '#1d1d1f', '#fff'], pdf: ['PDF', '#e0453a', '#fff'], dmg: ['DMG', '#636366', '#fff'], mp3: ['♪', '#fa2d48', '#fff'], txt: ['', '', ''] };
  const [label, bg, fg] = map[ext] || ['', '', ''];
  if (ext === 'dmg') return `<svg viewBox="0 0 100 100"><rect x="18" y="26" width="64" height="56" rx="6" fill="#d6d6db" stroke="#9a9aa2"/><rect x="18" y="26" width="64" height="12" rx="6" fill="#ebebef"/><circle cx="72" cy="72" r="3" fill="#34c759"/></svg>`;
  return `<svg viewBox="0 0 100 100"><path d="M22 8h40l18 18v66H22Z" fill="#fff" stroke="#c7c7cc" stroke-width="1.5"/><path d="M62 8v18h18" fill="#eef" stroke="#c7c7cc" stroke-width="1.5"/>
    ${label ? `<rect x="28" y="56" width="44" height="22" rx="4" fill="${bg}"/><text x="50" y="72" text-anchor="middle" font-family="-apple-system,Helvetica" font-size="${label.length > 2 ? 12 : 14}" font-weight="700" fill="${fg}">${label}</text>` : [36, 46, 56, 66].map((y) => `<path d="M32 ${y}h36" stroke="#d1d1d6" stroke-width="3"/>`).join('')}</svg>`;
}

export function diskIcon() {
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="dk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f2f5"/><stop offset="1" stop-color="#b9bcc4"/></linearGradient></defs>
    <rect x="10" y="34" width="80" height="34" rx="6" fill="url(#dk)" stroke="#8e9199"/><circle cx="78" cy="58" r="3" fill="#34c759"/><path d="M18 60h40" stroke="#8e9199" stroke-width="2"/></svg>`;
}

/** Tiny monochrome glyphs for menu bar & sidebars. */
export const glyph = {
  apple: '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.9c-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.2-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.8-4.2ZM14 5.2c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5Z"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M12 18.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Zm-4.9-2.6a7 7 0 0 1 9.8 0l-1.5 1.5a4.9 4.9 0 0 0-6.8 0Zm-3.4-3.4a11.8 11.8 0 0 1 16.6 0l-1.5 1.5a9.7 9.7 0 0 0-13.6 0ZM.3 9.1a16.6 16.6 0 0 1 23.4 0l-1.5 1.5a14.5 14.5 0 0 0-20.4 0Z"/></svg>',
  battery: '<svg viewBox="0 0 30 14" width="27" height="13"><rect x=".5" y=".5" width="25" height="13" rx="3.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="22" height="10" rx="2" fill="currentColor"/><path d="M27 5v4a2 2 0 0 0 0-4Z" fill="currentColor" opacity=".5"/><path d="M10 7c2-3 4-3 5 0s3 3 5 0" stroke="#000" stroke-width="1.6" fill="none" opacity=".55"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  control: '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="4" width="20" height="7" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="7.5" r="2" fill="currentColor"/><rect x="2" y="13" width="20" height="7" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="16.5" r="2" fill="currentColor"/></svg>',
  robot: '<svg viewBox="0 0 24 24" width="16" height="16"><ellipse cx="12" cy="12" rx="9" ry="8" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="6" y="9" width="12" height="6" rx="3" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  grid: '<svg viewBox="0 0 24 24" width="16" height="16"><g fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></g></svg>',
  list: '<svg viewBox="0 0 24 24" width="16" height="16"><g fill="currentColor"><rect x="3" y="4" width="18" height="2.4" rx="1"/><rect x="3" y="10.8" width="18" height="2.4" rx="1"/><rect x="3" y="17.6" width="18" height="2.4" rx="1"/></g></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  reload: '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M19 12a7 7 0 1 1-2-5M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 4l13 8-13 8Z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 5l9 7-9 7ZM12 5l9 7-9 7Z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M21 5l-9 7 9 7ZM12 5l-9 7 9 7Z" fill="currentColor"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 20h4L19 9l-4-4L4 16Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 11l9-7 9 7v9h-6v-6H9v6H3Z" fill="currentColor"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z" fill="currentColor"/></svg>',
  airdrop: '<svg viewBox="0 0 24 24" width="14" height="14"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M8 16a5.6 5.6 0 1 1 8 0M5 19a9.9 9.9 0 1 1 14 0"/></g></svg>',
  disk: '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="3" y="8" width="18" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="12.5" r="1.2" fill="currentColor"/></svg>',
  tag: (c) => `<svg viewBox="0 0 12 12" width="11" height="11"><circle cx="6" cy="6" r="5" fill="${c}"/></svg>`,
};
