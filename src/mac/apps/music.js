import { h } from '../ui.js';
import { glyph } from '../icons.js';
import { LofiPlayer } from '../../audio.js';

export default {
  id: 'music', name: 'Music', icon: 'music', single: true,
  about: 'Music — procedurally generated lo-fi. Mr. Agent dances to it.',
  launch(os) {
    const m = os.music;
    const tracks = LofiPlayer.TRACKS;
    const art = (i, size = 'big') => h(`div.mu-art.${size}`, { style: { background: `radial-gradient(circle at 30% 30%, hsl(${i * 80 + 20} 90% 70%), transparent 60%), linear-gradient(135deg, hsl(${i * 80} 70% 55%), hsl(${i * 80 + 70} 75% 35%))` } }, h('span', { text: ['🍵', '🌙', '⑂', '⚡'][i] }));
    const list = h('div.mu-list');
    const nowArt = h('div.mu-now-art');
    const title = h('b'); const artist = h('small');
    const playBtn = h('button.mu-ctl.big', { 'aria-label': 'Play or pause', onclick: () => m.toggle() });
    const time = h('span.mu-time');
    const canvas = h('canvas.mu-viz', { width: 600, height: 90 });
    const ctx = canvas.getContext('2d');
    const robotNote = h('p.mu-robot');
    const render = () => {
      list.innerHTML = '';
      tracks.forEach((t, i) => list.append(h('div.mu-row', { class: m.track === i && m.playing ? 'on' : '', ondblclick: () => m.play(i), onclick: () => m.play(i) },
        h('span.mu-n', { text: m.track === i && m.playing ? '♫' : String(i + 1) }), art(i, 'tiny'), h('span.mu-t', { text: t.title }), h('span.mu-a', { text: t.artist }), h('span.mu-bpm', { text: `${t.bpm} BPM` }))));
      nowArt.innerHTML = '';
      nowArt.append(art(m.track));
      title.textContent = m.info.title;
      artist.textContent = `${m.info.artist} — Lo-fi for Robots, Vol. 1`;
      playBtn.innerHTML = m.playing ? glyph.pause : glyph.play;
      robotNote.textContent = m.playing ? '🤖 Mr. Agent is dancing to this (go back to the room to watch).' : 'Press play: Mr. Agent dances whenever music is on.';
    };
    const off = m.onChange(render);
    let raf = 0;
    const bars = new Array(48).fill(0);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const e = m.elapsed;
      time.textContent = `${Math.floor(e / 60)}:${String(Math.floor(e % 60)).padStart(2, '0')}`;
      ctx.clearRect(0, 0, 600, 90);
      const beat = m.playing ? (Math.sin(e * (m.info.bpm / 60) * Math.PI * 2) + 1) / 2 : 0;
      for (let i = 0; i < bars.length; i++) {
        const target = m.playing ? (0.2 + 0.8 * Math.abs(Math.sin(e * 3 + i * 0.7)) * (0.5 + beat * 0.5)) * (1 - i / 70) : 0.03;
        bars[i] += (target - bars[i]) * 0.2;
        const bh = bars[i] * 80;
        ctx.fillStyle = `hsl(${m.track * 80 + i * 2} 85% 60%)`;
        ctx.fillRect(i * 12.5, 88 - bh, 9, bh);
      }
    };
    draw();
    const w = os.createWindow({
      app: this, title: 'Music', width: 760, height: 500, sidebarWidth: 190, className: 'win-music',
      onClose: () => { off(); cancelAnimationFrame(raf); },
      body: (b) => b.append(h('div.split', {},
        h('div.sb', { style: { width: '190px' } }, h('div.sb-h', { text: 'Apple Music' }), h('div.sb-item.on', {}, '▶︎  Listen Now'), h('div.sb-item', {}, '⊞  Browse'), h('div.sb-item', {}, '📻  Radio'), h('div.sb-h', { text: 'Library' }), h('div.sb-item', {}, '♫  Songs'), h('div.sb-item', {}, '🎤  Artists'), h('div.sb-h', { text: 'Playlists' }), h('div.sb-item', {}, '🍵  Coding Matcha'), h('div.sb-item', {}, '🤖  Robot Dance Party')),
        h('div.mu-main.scroll', {},
          h('div.mu-hero', {}, nowArt, h('div.mu-hero-txt', {}, h('small', { text: 'PLAYLIST' }), h('h2', { text: 'Lo-fi for Robots' }), h('p', { text: 'Generated live by WebAudio. No two loops are the same.' }),
            h('div.mu-ctls', {}, h('button.mu-ctl', { html: glyph.prev, 'aria-label': 'Previous', onclick: () => m.prev() }), playBtn, h('button.mu-ctl', { html: glyph.next, 'aria-label': 'Next', onclick: () => m.next() })),
            h('div.mu-np', {}, title, artist, time))),
          canvas, robotNote, list))),
    });
    render();
    return w;
  },
};
