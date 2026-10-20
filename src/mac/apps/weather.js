import { h } from '../ui.js';

export default {
  id: 'weather', name: 'Weather', icon: 'weather', single: true,
  about: 'Weather — synced with the window in Mr. Agent’s room.',
  launch(os) {
    const world = os.ctx.world;
    const hrs = world.hours ?? new Date().getHours();
    const night = world.night > 0.5;
    const temp = (hr) => Math.round(17 + 7 * Math.sin(((hr - 9) / 24) * Math.PI * 2));
    const now = temp(hrs);
    const icon = (hr, i = 0) => { const n = hr % 24 < 6 || hr % 24 > 19.5; return n ? (i % 5 === 3 ? '☁️' : '🌙') : i % 6 === 4 ? '⛅' : i % 9 === 7 ? '🌧' : '☀️'; };
    const hourly = Array.from({ length: 12 }, (_, i) => { const hr = Math.floor(hrs) + i; return h('div.wx-h', {}, h('small', { text: i ? `${hr % 24}:00` : 'Now' }), h('span', { text: icon(hr, i) }), h('b', { text: `${temp(hr)}°` })); });
    const days = ['Today', ...Array.from({ length: 9 }, (_, i) => new Date(Date.now() + (i + 1) * 864e5).toLocaleDateString([], { weekday: 'short' }))];
    const daily = days.map((d, i) => {
      const lo = 11 + ((i * 7) % 5), hi = 21 + ((i * 3) % 6);
      return h('div.wx-d', {}, h('b', { text: d }), h('span', { text: ['☀️', '⛅', '☀️', '🌧', '☀️', '☁️', '☀️', '⛅', '☀️', '☀️'][i] }), h('small', { text: `${lo}°` }), h('div.wx-range', {}, h('i', { style: { left: `${(lo - 8) * 4}%`, right: `${100 - (hi - 8) * 4}%` } })), h('b', { text: `${hi}°` }));
    });
    const root = h('div.wx', { class: night ? 'night' : '' },
      h('div.wx-top', {}, h('small', { text: 'MY LOCATION' }), h('h1', { text: 'Silicon Valley' }), h('div.wx-temp', { text: `${now}°` }), h('p', { text: night ? 'Clear night · stars out' : 'Mostly sunny' }), h('small', { text: `H:${now + 4}°  L:${now - 6}°` })),
      h('div.wx-card', {}, h('small.wx-card-h', { text: night ? 'Clear conditions will continue all night.' : 'Sunny conditions expected around the desk. Perfect walking weather.' }), h('div.wx-hours', {}, ...hourly)),
      h('div.wx-card', {}, h('small.wx-card-h', { text: '10-DAY FORECAST' }), ...daily),
      h('div.wx-grid', {}, ...[['UV INDEX', night ? '0' : '6', night ? 'Low' : 'High'], ['SUNSET', '18:42', 'Golden hour 18:05'], ['WIND', '9 km/h', 'Gusts 18 km/h'], ['MATCHA INDEX', '10/10', 'Ideal whisking weather']].map(([k, v, s]) => h('div.wx-card.sm', {}, h('small.wx-card-h', { text: k }), h('b', { text: v }), h('small', { text: s })))));
    return os.createWindow({ app: this, title: 'Weather', width: 420, height: 640, className: 'win-weather', body: (b) => b.append(h('div.scroll', { style: { height: '100%' } }, root)) });
  },
};
