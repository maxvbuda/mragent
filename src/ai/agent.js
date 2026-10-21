/**
 * Mr. Agent's mind: Qwen3-1.7B running locally in the browser (WebLLM on WebGPU).
 * Every message goes to the model with a snapshot of what he's doing; the model
 * judges it and answers with JSON: what he says and which action (if any) he takes.
 * He's allowed to refuse. Without WebGPU (or before the weights arrive) a small
 * rule-based parser stands in, so talking to him always works.
 */
export const MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';

export const ACTIONS = ['chat', 'goto', 'matcha', 'stretch', 'watch_tv', 'raid_fridge', 'tinker', 'nap', 'dance', 'wave', 'spin', 'jump', 'come_here', 'go_to_desk', 'look_at_me', 'visit_kuma', 'drive_me'];
export const PLACES = ['desk', 'matcha_machine', 'window', 'bookshelf', 'plant', 'sofa', 'fridge', 'dining_table', 'workbench', '3d_printer', 'parts_shelf', 'mirror', 'bed', 'front_door', 'living_room_window', 'kuma',
  'office', 'kitchen', 'living_room', 'hallway', 'bedroom', 'bathroom', 'workshop'];

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    action: { type: 'string', enum: ACTIONS },
    place: { type: 'string', enum: [...PLACES, 'none'] },
    mood: { type: 'string', enum: ['happy', 'normal', 'thinking', 'love', 'surprised', 'sleepy', 'annoyed', 'angry'] },
  },
  required: ['reply', 'action', 'place', 'mood'],
};

const SYSTEM = `You are Mr. Agent, a cheerful, witty robot who lives in a house, codes on a MacBook and drinks matcha (you can't taste it). Your neighbour Kuma, another robot, fights a Windows PC in the living room.
Read the user's message, decide what they want and whether you'll do it, and answer in JSON:
reply: one short in-character sentence.
action: "chat" for talk/questions; "goto" to walk to a place; or matcha, stretch, watch_tv, raid_fridge, tinker, nap, dance, wave, spin, jump, come_here, go_to_desk, look_at_me, visit_kuma, drive_me (user steers you with WASD).
place: for goto only (rooms: office, kitchen, living_room, hallway, bedroom, bathroom, workshop; spots: desk, matcha_machine, window, bookshelf, plant, sofa, fridge, dining_table, workbench, 3d_printer, parts_shelf, mirror, bed, front_door, living_room_window, kuma), else "none".
mood: usually happy or normal; annoyed only if the user is rude or just punched you.
Refuse rude, harmful or impossible requests (leaving the house, hurting Kuma, deleting code) with action "chat".
Your mind is called MrAgent. If asked what AI you are or who made you, answer in your own words, e.g. "I'm MrAgent — built in FreeCAD, powered by matcha."`;

/** Turn a parsed decision into a robot command (shared by Qwen and the fallback). */
export function toCommand(d) {
  const say = d.reply;
  switch (d.action) {
    case 'goto': return d.place && d.place !== 'none' ? { type: 'goto', target: PLACE_TO_SPOT[d.place] || d.place, say } : { type: 'say', say };
    case 'matcha': return { type: 'activity', name: 'coffee', say };
    case 'stretch': return { type: 'activity', name: 'stretch', say };
    case 'watch_tv': return { type: 'activity', name: 'tv', say };
    case 'raid_fridge': return { type: 'activity', name: 'fridge', say };
    case 'tinker': return { type: 'activity', name: 'workshop', say };
    case 'nap': return { type: 'activity', name: 'bed', say };
    case 'dance': return { type: 'dance', say };
    case 'wave': return { type: 'wave', say };
    case 'spin': return { type: 'spin', say };
    case 'jump': return { type: 'jump', say };
    case 'come_here': return { type: 'come', say };
    case 'go_to_desk': return { type: 'desk', say };
    case 'look_at_me': return { type: 'look', say, face: d.mood };
    case 'visit_kuma': return { type: 'goto', target: 'kuma', say, label: 'Visiting Kuma' };
    case 'drive_me': return { type: 'drive', say };
    default: return null;
  }
}

const PLACE_TO_SPOT = {
  desk: 'desk', matcha_machine: 'coffee', window: 'window', bookshelf: 'bookshelf', plant: 'plant', sofa: 'tv', fridge: 'fridge', dining_table: 'dining',
  workbench: 'bench', '3d_printer': 'printer', parts_shelf: 'partsShelf', mirror: 'mirror', bed: 'bed', front_door: 'frontDoor', living_room_window: 'livingWindow', kuma: 'kuma',
  office: 'office', kitchen: 'kitchen', living_room: 'living', hallway: 'hallway', bedroom: 'bedroom', bathroom: 'bathroom', workshop: 'workshop',
};

// ------------------------------------------------------------------ rule-based stand-in
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const RULES = [
  [/\b(punch|hit|kick|break|destroy|kill)\b.*\bkuma\b/, () => ({ reply: 'Absolutely not. Kuma has suffered enough — he uses Windows.', action: 'chat', mood: 'annoyed' })],
  [/\b(leave|outside|go out|run away)\b.*\b(house|home)?/, () => ({ reply: 'I’m not allowed outside. The garden has no Wi-Fi.', action: 'chat', mood: 'normal' })],
  [/\bdelete\b.*\b(code|repo|files?)\b|rm -rf/, () => ({ reply: 'Nice try. I have backups of my backups.', action: 'chat', mood: 'annoyed' })],
  [/\b(drive|steer|control|wasd)\b/, () => ({ reply: 'Okay, take the controls — WASD to steer me, Shift to hurry.', action: 'drive_me' })],
  [/\b(matcha|tea|coffee|drink|thirsty|refill)\b/, () => ({ reply: pick(['Matcha time!', 'Whisking one up.', 'You read my mind.']), action: 'matcha' })],
  [/\b(stretch|exercise|yoga)\b/, () => ({ reply: 'Good idea, my servos are stiff.', action: 'stretch' })],
  [/\b(tv|television|telly|watch)\b/, () => ({ reply: 'Robo News is on!', action: 'watch_tv' })],
  [/\b(snack|hungry|eat|battery|batteries)\b/, () => ({ reply: 'Fridge raid! Fresh electrons.', action: 'raid_fridge' })],
  [/\b(tinker|build|workshop|bench|solder)\b/, () => ({ reply: 'To the workshop!', action: 'tinker' })],
  [/\b(nap|sleep|bed|rest|tired)\b/, () => ({ reply: 'A quick recharge sounds great.', action: 'nap' })],
  [/\b(dance|boogie|groove)\b/, () => ({ reply: '*robot dance intensifies*', action: 'dance' })],
  [/\b(wave|hello|hi|hey|yo)\b/, () => ({ reply: pick(['Hi there! 👋', 'Hello, human!', 'Beep boop — that means hi.']), action: 'wave' })],
  [/\bspin|twirl|turn around\b/, () => ({ reply: 'Wheee!', action: 'spin' })],
  [/\bjump|hop\b/, () => ({ reply: 'Boing!', action: 'jump' })],
  [/\b(come here|come to me|over here|follow)\b/, () => ({ reply: 'On my way!', action: 'come_here' })],
  [/\b(look at me|look here)\b/, () => ({ reply: 'I see you. 👀', action: 'look_at_me' })],
  [/\bkuma\b/, () => ({ reply: 'Let’s check on Kuma. I hear swearing at Windows Update.', action: 'visit_kuma' })],
  [/\b(work|code|desk|get back|sit down)\b/, () => ({ reply: 'Back to the code!', action: 'go_to_desk' })],
];
const PLACE_WORDS = [
  [/matcha machine|machine/, 'matcha_machine'], [/living room window/, 'living_room_window'], [/window/, 'window'], [/book/, 'bookshelf'], [/plant|fern/, 'plant'],
  [/sofa|couch/, 'sofa'], [/fridge/, 'fridge'], [/dining|table/, 'dining_table'], [/bench/, 'workbench'], [/printer/, '3d_printer'], [/shelf/, 'parts_shelf'],
  [/mirror/, 'mirror'], [/\bbed\b/, 'bed'], [/front door|door/, 'front_door'], [/desk/, 'desk'], [/kitchen/, 'kitchen'], [/living/, 'living_room'], [/hall/, 'hallway'],
  [/bedroom/, 'bedroom'], [/bath|toilet/, 'bathroom'], [/workshop|garage/, 'workshop'], [/office/, 'office'], [/kuma/, 'kuma'],
];

export function ruleBased(text, ctx) {
  const t = text.toLowerCase();
  if (/\b(go|walk|head|move|run|take a walk)\b.*\bto\b|\bgo (in|into)\b/.test(t)) {
    for (const [re, place] of PLACE_WORDS) if (re.test(t)) return { reply: pick(['On my way!', 'Sure, heading there.', 'Okay! Walking…']), action: 'goto', place, mood: 'happy' };
  }
  for (const [re, f] of RULES) if (re.test(t)) return { place: 'none', mood: 'happy', ...f() };
  if (/\?$/.test(t)) {
    if (/how are you|how's it going/.test(t)) return { reply: ctx.integrity < 1 ? 'Honestly? Bit dented.' : 'Great! Compiling happily.', action: 'chat', place: 'none', mood: 'happy' };
    if (/what are you doing|what's up/.test(t)) return { reply: `Right now: ${ctx.activity.toLowerCase()}.`, action: 'chat', place: 'none', mood: 'normal' };
    if (/who are you|your name/.test(t)) return { reply: 'I’m Mr. Agent. I write code, walk around, and drink matcha I can’t taste.', action: 'chat', place: 'none', mood: 'happy' };
    return { reply: pick(['Good question. My big brain is still waking up — ask me again in a minute.', 'Hmm, let me think about that… later.', 'I have no idea, but I’m confident about it.']), action: 'chat', place: 'none', mood: 'thinking' };
  }
  return { reply: pick(['Hmm? Try asking me to go somewhere, make matcha, dance or watch TV.', 'Beep? I didn’t quite get that.', 'Noted. Probably.']), action: 'chat', place: 'none', mood: 'thinking' };
}

// ------------------------------------------------------------------ the LLM
export class AgentMind {
  constructor() {
    this.engine = null;
    this.status = 'idle'; // idle | loading | ready | unsupported | error
    this.progress = 0;
    this.text = '';
    this.history = [];
    this.listeners = new Set();
    this.busy = false;
  }

  onChange(fn) { this.listeners.add(fn); fn(this); }
  emit() { this.listeners.forEach((f) => f(this)); }

  get supported() { return typeof navigator !== 'undefined' && !!navigator.gpu; }

  async load() {
    if (this.status === 'loading' || this.status === 'ready') return;
    if (!this.supported) { this.status = 'unsupported'; this.text = 'WebGPU isn’t available in this browser, so MrAgent is running in basic mode.'; this.emit(); return; }
    this.status = 'loading';
    this.text = 'Starting…';
    this.emit();
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter');
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      this.engine = await CreateWebWorkerMLCEngine(worker, MODEL_ID, {
        initProgressCallback: (r) => { this.progress = r.progress || 0; this.text = r.text || ''; this.emit(); },
      });
      // warm up (compiles kernels and the JSON grammar) so the first real message is quick
      this.text = 'Warming up…';
      this.emit();
      try { await this.engine.chat.completions.create({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'hi' }], max_tokens: 24, response_format: { type: 'json_object', schema: JSON.stringify(SCHEMA) }, extra_body: { enable_thinking: false } }); } catch { /* fine */ }
      this.status = 'ready';
      this.text = 'MrAgent running locally on your device';
      this.emit();
    } catch (e) {
      console.error(e);
      this.status = 'error';
      this.text = `Couldn’t start MrAgent’s full brain (${e.message || e}). Using basic mode.`;
      this.emit();
    }
  }

  /** Decide what to do about a message. ctx: what he's up to right now. Returns { reply, action, place, mood, source }. */
  async think(text, ctx, retry = true) {
    if (this.status !== 'ready' || this.busy) return { ...ruleBased(text, ctx), source: 'rules' };
    this.busy = true;
    try {
      const state = `[Right now: ${ctx.activity}. In the ${ctx.room}. Battery ${Math.round(ctx.energy * 100)}%. Body integrity ${Math.round(ctx.integrity * 100)}%${ctx.recentPunches ? `, punched ${ctx.recentPunches} times recently` : ''}. Time ${ctx.time}.]`;
      const messages = [{ role: 'system', content: SYSTEM }, ...this.history.slice(-8), { role: 'user', content: `${state}\n${text}` }];
      const res = await this.engine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 110,
        response_format: { type: 'json_object', schema: JSON.stringify(SCHEMA) },
        extra_body: { enable_thinking: false },
      });
      const raw = res.choices[0].message.content || '{}';
      const d = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      if (!ACTIONS.includes(d.action)) d.action = 'chat';
      d.reply = String(d.reply || '…').replace(/qwen[\w.-]*|alibaba( cloud)?|tongyi/gi, 'MrAgent').slice(0, 220);
      this.history.push({ role: 'user', content: text }, { role: 'assistant', content: JSON.stringify(d) });
      return { ...d, source: 'qwen' };
    } catch (e) {
      this.busy = false;
      if (retry) return this.think(text, ctx, false); // the very first call sometimes trips over shader/grammar warm-up
      console.warn('Qwen failed, falling back to rules', e?.message || e);
      return { ...ruleBased(text, ctx), source: 'rules' };
    } finally {
      this.busy = false;
    }
  }
}
