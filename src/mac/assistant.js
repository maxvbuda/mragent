import { h } from './ui.js';
import { APPS, isInstalled } from './apps/index.js';
import { replyFor } from './agentchat.js';
import { addReminder } from './apps/reminders.js';

/** "Ask Mr. Agent": a Siri-style assistant that can also drive the Mac. */
export class Assistant {
  constructor(os) {
    this.os = os;
    this.open = false;
    this.log = h('div.as-log');
    this.input = h('input.as-input', { placeholder: 'Ask Mr. Agent…', 'aria-label': 'Ask Mr. Agent' });
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && this.input.value.trim()) { const q = this.input.value.trim(); this.input.value = ''; this.ask(q); } });
    this.panel = h('div.mac-assistant', {}, h('div.as-head', {}, h('span.as-orb'), h('b', { text: 'Mr. Agent' })), this.log, h('div.as-bar', {}, this.input));
    os.screen.append(this.panel);
    this.say('Hi! Ask me anything, or tell me what to do: “open Safari”, “dark mode”, “volume 30”, “take a screenshot”, “where are you?”');
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.panel.classList.toggle('in', this.open);
    if (this.open) setTimeout(() => this.input.focus(), 120);
  }

  say(text) {
    this.log.append(h('div.as-msg.them', { text }));
    this.log.scrollTop = this.log.scrollHeight;
  }

  ask(q) {
    this.toggle(true);
    this.log.append(h('div.as-msg.me', { text: q }));
    const thinking = h('div.as-msg.them.as-typing', {}, h('i'), h('i'), h('i'));
    this.log.append(thinking);
    this.log.scrollTop = this.log.scrollHeight;
    setTimeout(() => { thinking.remove(); this.say(this.answer(q)); }, 500 + Math.random() * 400);
  }

  answer(q) {
    const os = this.os, t = q.toLowerCase().trim();
    let m;
    if ((m = t.match(/^(open|launch|start|show)\s+(.+)$/))) {
      const name = m[2].replace(/^the\s+/, '').replace(/\s*app$/, '');
      const app = Object.values(APPS).find((a) => a.name.toLowerCase() === name || a.id === name || a.name.toLowerCase().startsWith(name));
      if (app) { if (!isInstalled(os, app.id)) { os.launch('appstore', { show: app.id }); return `${app.name} isn’t installed yet. I opened it in the App Store.`; } os.launch(app.id); return `Opening ${app.name}.`; }
      if (/downloads|documents|desktop|pictures|projects/.test(name)) { os.launch('finder', { path: `/Users/mragent/${name[0].toUpperCase()}${name.slice(1)}` }); return `Here’s your ${name} folder.`; }
    }
    if (/dark mode|turn.*dark/.test(t)) { os.setPref('dark', !/off|light/.test(t)); return /off/.test(t) ? 'Light mode it is. ☀️' : 'Dark mode on. Easy on the eyes. 🌙'; }
    if (/light mode/.test(t)) { os.setPref('dark', false); return 'Light mode on. ☀️'; }
    if ((m = t.match(/volume\s*(?:to\s*)?(\d+)/))) { os.setPref('volume', Math.min(100, +m[1]) / 100); return `Volume set to ${Math.min(100, +m[1])}%.`; }
    if (/mute/.test(t)) { os.setPref('volume', 0); return 'Muted. 🔇'; }
    if ((m = t.match(/brightness\s*(?:to\s*)?(\d+)/))) { os.setPref('brightness', 0.35 + (Math.min(100, +m[1]) / 100) * 0.65); return `Brightness set to ${m[1]}%.`; }
    if (/screenshot|screen shot/.test(t)) { this.toggle(false); setTimeout(() => os.shots.full(), 300); return 'Say cheese! 📸'; }
    if (/^(play|resume)( some)? music|^play$/.test(t)) { os.music.play(); return `Playing “${os.music.info.title}”. I’m dancing, by the way.`; }
    if (/(pause|stop) (the )?music|^pause$/.test(t)) { os.music.pause(); return 'Paused.'; }
    if (/next (song|track)/.test(t)) { os.music.next(); return `Next up: “${os.music.info.title}”.`; }
    if (/time is it|what time/.test(t)) return `It’s ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    if (/date|what day/.test(t)) return `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`;
    if (/weather/.test(t)) { os.launch('weather'); return os.ctx.world.night > 0.5 ? 'Clear night in Silicon Valley, around 14°.' : 'Sunny in Silicon Valley, about 22°.'; }
    if (/where are you|find (you|mr)|where.*agent/.test(t)) { os.launch('findmy'); return `I’m ${os.ctx.brain.activity.toLowerCase()}. I opened Find My so you can see me.`; }
    if (/lock/.test(t)) { setTimeout(() => os.lock(), 600); return 'Locking the screen. 🔒'; }
    if (/wallpaper|background/.test(t)) { os.launch('settings', { pane: 'wallpaper' }); return 'Pick a wallpaper you like.'; }
    if (/mission control/.test(t)) { this.toggle(false); os.missionControl(); return 'Mission Control.'; }
    if (/new (desktop|space)/.test(t)) { os.addSpace(); return `Added Desktop ${os.spaces.length}. Switch with ⌃→.`; }
    if (/do not disturb|focus/.test(t)) { os.setPref('focus', !/off/.test(t)); return os.prefs.focus ? 'Do Not Disturb is on.' : 'Do Not Disturb is off.'; }
    if (/empty (the )?trash/.test(t)) { os.emptyTrash(); return 'Asking before I empty it.'; }
    if ((m = t.match(/(?:calculate|what is|what's)\s+([\d\s+\-*/().^]+)$/))) { try { return `${m[1].trim()} = ${+Function(`"use strict";return (${m[1].replace(/\^/g, '**')})`)().toPrecision(12)}`; } catch { /* not maths */ } }
    if (/remind me to (.+)/.test(t)) { const what = t.match(/remind me to (.+)/)[1]; addReminder(os, what); return `Okay, I’ll remind you to ${what}. ✅`; }
    return replyFor('agent', q, os);
  }
}
