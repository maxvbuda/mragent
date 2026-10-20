import './apps.css';
import finder from './finder.js';
import terminal from './terminal.js';
import code from './code.js';
import safari from './safari.js';
import notes from './notes.js';
import calculator from './calculator.js';
import music from './music.js';
import photos from './photos.js';
import messages from './messages.js';
import mail from './mail.js';
import calendar from './calendar.js';
import reminders from './reminders.js';
import weather from './weather.js';
import clock from './clock.js';
import findmy from './findmy.js';
import photobooth from './photobooth.js';
import activity from './activity.js';
import settings from './settings.js';
import appstore from './appstore.js';
import { textedit, preview } from './textedit.js';
import { about, sysinfo, benchmark } from './about.js';
import { minesweeper, snake } from './games.js';
import { paint, g2048, flappy, stickies, dictionary } from './storeapps.js';

const launchpad = { id: 'launchpad', name: 'Launchpad', icon: 'launchpad', launch: (os) => os.launchpad() };

export const APPS = Object.fromEntries([
  finder, launchpad, safari, messages, mail, music, photos, notes, reminders, calendar, weather, clock, findmy, photobooth,
  code, terminal, activity, settings, appstore, calculator, textedit, preview, minesweeper, snake, benchmark,
  paint, g2048, flappy, stickies, dictionary, about, sysinfo,
].map((a) => [a.id, a]));

/** Pinned to the Dock, in order. */
export const DOCK = ['finder', 'launchpad', 'safari', 'messages', 'mail', 'music', 'photos', 'notes', 'reminders', 'calendar', 'findmy', 'code', 'terminal', 'appstore', 'settings'];

/** App Store apps only exist once installed. */
export function isInstalled(os, id) {
  const app = APPS[id];
  return !!app && (!app.store || os.prefs.installed.includes(id));
}
