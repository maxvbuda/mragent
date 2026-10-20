/** Generated wallpapers as CSS backgrounds (SVG data URIs, no image files). */
const svg = (body, w = 1600, h = 1000) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='xMidYMid slice'>${body}</svg>`)}") center / cover no-repeat`;

function dunes(colors, sky) {
  const layers = colors.map((c, i) => {
    const base = 420 + i * 130;
    let d = `M0 ${base}`;
    for (let x = 0; x <= 1600; x += 100) d += ` Q ${x + 50} ${base - 70 + ((i * 37 + x / 10) % 60) - (i % 2 ? 40 : -20) * Math.sin(x / 300 + i)} ${x + 100} ${base + Math.sin(x / 260 + i * 1.7) * 50}`;
    d += ' L1600 1000 L0 1000 Z';
    return `<path d='${d}' fill='${c}'/>`;
  }).join('');
  return svg(`<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'>${sky.map((c, i) => `<stop offset='${i / (sky.length - 1)}' stop-color='${c}'/>`).join('')}</linearGradient></defs>
    <rect width='1600' height='1000' fill='url(#s)'/><circle cx='1180' cy='330' r='90' fill='#ffe6b8' opacity='.85'/>${layers}`);
}

export const WALLPAPERS = [
  { id: 'dunes', name: 'Byte Dunes', css: dunes(['#e7816b', '#c75c6f', '#8c4579', '#4f2f6b', '#2a1d4f'], ['#ffcfa1', '#ff9f8c', '#d77aa5']) },
  { id: 'night', name: 'Night Build', css: dunes(['#2b3a67', '#1f2b52', '#18213f', '#10172e', '#0a0f20'], ['#0b1026', '#1d2a5c', '#3d4f8f']) },
  { id: 'aurora', name: 'Aurora', css: 'radial-gradient(1200px 700px at 20% 20%, #2ee59d55, transparent 60%), radial-gradient(1000px 800px at 80% 30%, #8f6bff66, transparent 60%), radial-gradient(900px 600px at 50% 100%, #49e3ff44, transparent 60%), #0a1020' },
  {
    id: 'blueprint', name: 'Blueprint',
    css: svg(`<rect width='1600' height='1000' fill='#1d4f8f'/>${Array.from({ length: 54 }, (_, i) => `<path d='M${i * 30} 0V1000' stroke='#fff' stroke-opacity='.07'/>`).join('')}${Array.from({ length: 34 }, (_, i) => `<path d='M0 ${i * 30}H1600' stroke='#fff' stroke-opacity='.07'/>`).join('')}
      <g fill='none' stroke='#e8f1ff' stroke-width='3' opacity='.8'><ellipse cx='800' cy='380' rx='170' ry='158'/><ellipse cx='800' cy='390' rx='126' ry='62'/><rect x='610' y='330' width='34' height='110' rx='14'/><rect x='956' y='330' width='34' height='110' rx='14'/><ellipse cx='800' cy='800' rx='230' ry='220'/></g>`),
  },
  { id: 'coffee', name: 'Crema', css: 'radial-gradient(900px 600px at 30% 30%, #f2e3cf, transparent 55%), radial-gradient(1200px 900px at 70% 80%, #6f4630, transparent 60%), linear-gradient(135deg, #b98b63, #3b2417)' },
  { id: 'mint', name: 'Mint Studio', css: 'linear-gradient(160deg, #e6f4ef 0%, #bfe3d6 45%, #7cc4b0 100%)' },
];

export const ACCENTS = {
  blue: '#0a84ff', purple: '#a259ff', pink: '#ff4fa0', red: '#ff453a', orange: '#ff9f0a', yellow: '#ffcc00', green: '#30d158', graphite: '#8e8e93',
};
