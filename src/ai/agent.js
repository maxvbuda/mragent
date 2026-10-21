/**
 * Mr. Agent's mind: Qwen3-1.7B running locally in the browser (WebLLM on WebGPU).
 * Every message goes to the model with a snapshot of what he's doing; the model
 * judges it and answers with JSON: what he says and which action (if any) he takes.
 * He's allowed to refuse. Without WebGPU (or before the weights arrive) a small
 * rule-based parser stands in, so talking to him always works.
 */
export const MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';

export const ACTIONS = ['chat', 'goto', 'matcha', 'stretch', 'watch_tv', 'raid_fridge', 'tinker', 'nap', 'dance', 'wave', 'spin', 'jump', 'come_here', 'go_to_desk', 'look_at_me', 'visit_kuma', 'drive_me', 'order_item'];
export const PLACES = ['desk', 'matcha_machine', 'window', 'bookshelf', 'plant', 'sofa', 'fridge', 'dining_table', 'workbench', '3d_printer', 'parts_shelf', 'mirror', 'bed', 'front_door', 'living_room_window', 'kuma',
  'office', 'kitchen', 'living_room', 'hallway', 'bedroom', 'bathroom', 'workshop', 'garden', 'front_porch', 'garden_bench', 'mailbox', 'backyard', 'side_yard'];
export const SHOP = ['matcha', 'duck', 'pizza', 'battery', 'plant', 'balloons', 'trophy', 'keyboard', 'linuxUsb', 'macbook', 'spareParts'];
const SHOP_LINE = 'Things you can order from RoboMart (delivered by drone to the front porch): matcha (tin), duck (rubber duck), pizza, battery (pack), plant, balloons, trophy, keyboard (RGB), linuxUsb, macbook, spareParts (repair kit).';

const SCHEMA = {
  type: 'object',
  properties: {
    thought: { type: 'string' },
    reply: { type: 'string' },
    action: { type: 'string', enum: ACTIONS },
    place: { type: 'string', enum: [...PLACES, 'none'] },
    item: { type: 'string', enum: [...SHOP, 'none'] },
    mood: { type: 'string', enum: ['happy', 'normal', 'thinking', 'love', 'surprised', 'sleepy', 'annoyed', 'angry'] },
  },
  required: ['thought', 'reply', 'action', 'place', 'item', 'mood'],
};

const SYSTEM = `You are Mr. Agent, a cheerful, witty robot who lives in a house, codes on a MacBook and drinks matcha (you can't taste it). Your neighbour Kuma, another robot, fights a Windows PC in the living room.
Read the user's message, decide what they want and whether you'll do it, and answer in JSON:
thought: your private inner monologue first: what they want, how you feel about it, and what you'll do (one or two sentences, honest, nobody sees it).
reply: one short in-character sentence.
action: "chat" for talk/questions; "goto" to walk to a place (inside or outside); or matcha, stretch, watch_tv, raid_fridge, tinker, nap, dance, wave, spin, jump, come_here, go_to_desk, look_at_me, visit_kuma, drive_me (user steers you with WASD), order_item (order something online).
place: for goto only (rooms: office, kitchen, living_room, hallway, bedroom, bathroom, workshop; spots: desk, matcha_machine, window, bookshelf, plant, sofa, fridge, dining_table, workbench, 3d_printer, parts_shelf, mirror, bed, front_door, living_room_window, kuma; outside in the garden: garden, front_porch, garden_bench, mailbox, backyard, side_yard), else "none".
item: for order_item only, else "none". ${SHOP_LINE}
You're allowed outside in the garden, but not off the property.
mood: usually happy or normal; annoyed only if the user is rude or just punched you.
Refuse rude, harmful or impossible requests (leaving the property, hurting Kuma, deleting code, ordering things that aren't sold) with action "chat".
Your mind is called MrAgent. If asked what AI you are or who made you, answer in your own words, e.g. "I'm MrAgent — powered by matcha and curiosity."`;

// ------------------------------------------------------------------ Kuma
export const KUMA_ACTIONS = ['chat', 'slam_desk', 'cheer', 'lean_back', 'back_to_work', 'restart_pc', 'call_mr_agent', 'go_outside', 'sit_on_garden_bench', 'visit_mr_agent', 'order_item'];
const KUMA_SCHEMA = {
  type: 'object',
  properties: {
    thought: { type: 'string' },
    reply: { type: 'string' },
    action: { type: 'string', enum: KUMA_ACTIONS },
    item: { type: 'string', enum: [...SHOP, 'none'] },
    mood: { type: 'string', enum: ['work', 'happy', 'angry', 'chill', 'dizzy', 'shocked'] },
  },
  required: ['thought', 'reply', 'action', 'item', 'mood'],
};
const KUMA_SYSTEM = `You are Kuma, a big white robot with a glowing visor. You sit at a gaming desk in the living room, stuck using a Windows PC that keeps force-updating, blue-screening, and nagging you about Edge, OneDrive and Copilot. You are grumpy, sarcastic and dramatic, but secretly kind. You envy your neighbour Mr. Agent, a cheerful robot with an absurdly powerful MacBook. You rarely leave your chair, but you can go outside for fresh air.
Answer the user in JSON:
thought: your private inner monologue first (one or two honest, grumpy sentences nobody sees).
reply: one or two short in-character sentences (dry humour, complain about Windows when it fits).
action: "chat" usually; "slam_desk" when angry; "cheer" when something good happens; "lean_back" to relax or wait; "back_to_work" to go back to your desk and type; "restart_pc" if asked to restart or reboot; "call_mr_agent" to ask Mr. Agent to come over; "go_outside" to step out into the garden; "sit_on_garden_bench" to sit outside on the bench; "visit_mr_agent" to walk over to him; "order_item" to order something.
item: for order_item only, else "none". ${SHOP_LINE}
mood: work, happy, angry, chill, dizzy or shocked.
If the user suggests going outside, a walk or the bench, you grumble but do it (go_outside or sit_on_garden_bench). If they ask you to order or buy something RoboMart sells, you do it (order_item): secretly you love getting parcels.
Refuse rude or harmful requests in character. Your mind is called Kuma. If asked what AI you are or who made you, answer in your own words, e.g. "I'm Kuma. Just Kuma. Unfortunately running on Windows."`;

const KUMA_RULES = [
  [/\b(order|buy|get (me|yourself)|purchase)\b/, (t) => { const item = itemIn(t); return item ? { reply: item === 'macbook' ? 'A Mac? Ordering it before Windows notices.' : 'Ordering it. Drone delivery, apparently.', action: 'order_item', item, mood: 'happy' } : { reply: 'Order what? RoboMart has matcha, ducks, pizza, a Linux USB… and a Mac. Just saying.', action: 'chat', mood: 'chill' }; }],
  [/\b(bench)\b/, () => ({ reply: 'Fine. Bench. Fresh air. No Wi-Fi. Perfect.', action: 'sit_on_garden_bench', mood: 'chill' })],
  [/\b(outside|garden|fresh air|walk|go out)\b/, () => ({ reply: 'Outside? …Okay. Anything to get away from this PC.', action: 'go_outside', mood: 'chill' })],
  [/\b(visit|go see|talk to) (mr\.? ?agent|him)\b/, () => ({ reply: 'I’ll go bother Mr. Agent. He owes me a Mac.', action: 'visit_mr_agent', mood: 'work' })],
  [/\b(restart|reboot|turn it off)\b/, () => ({ reply: 'Fine. Restarting. See you in forty-five minutes.', action: 'restart_pc', mood: 'dizzy' })],
  [/\b(mr\.? ?agent|call|help)\b/, () => ({ reply: 'MR. AGENT! Get over here, it’s doing the thing again.', action: 'call_mr_agent', mood: 'shocked' })],
  [/\b(windows|update|bsod|blue screen|edge|onedrive|copilot)\b/, () => ({ reply: pick(['Don’t get me started. It updated during my last update.', 'Edge asked me to switch to Edge. I was IN Edge.', 'Copilot rewrote my code into an ad for Copilot.']), action: 'slam_desk', mood: 'angry' })],
  [/\b(mac|macbook|apple)\b/, () => ({ reply: 'Mr. Agent has 1,024 cores. I have a progress bar stuck at 99%.', action: 'chat', mood: 'chill' })],
  [/\b(relax|chill|break|rest)\b/, () => ({ reply: 'A break? Sure. Not like I can do anything while it updates.', action: 'lean_back', mood: 'chill' })],
  [/\b(work|code|type|desk|come back|get back)\b/, () => ({ reply: 'Back to it. Typing very angrily.', action: 'back_to_work', mood: 'work' })],
  [/\b(good job|congrat|nice|great|you can do it|love)\b/, () => ({ reply: 'Oh. Thanks. Nobody ever says that to a Windows user.', action: 'cheer', mood: 'happy' })],
  [/\b(hi|hello|hey|yo)\b/, () => ({ reply: pick(['Hey. Don’t touch the PC, it’s fragile. Emotionally.', 'Hi. If you’re from IT, it’s already been restarted.']), action: 'chat', mood: 'work' })],
];
const ITEM_WORDS = [[/matcha|tea/, 'matcha'], [/duck/, 'duck'], [/pizza/, 'pizza'], [/battery|batteries/, 'battery'], [/plant|flower/, 'plant'], [/balloon/, 'balloons'], [/trophy|award/, 'trophy'],
  [/keyboard/, 'keyboard'], [/linux|usb/, 'linuxUsb'], [/mac|macbook|laptop/, 'macbook'], [/spare|parts|repair kit|toolbox/, 'spareParts']];
export function itemIn(t) { for (const [re, id] of ITEM_WORDS) if (re.test(t)) return id; return null; }

export function kumaRules(text) {
  const t = text.toLowerCase();
  for (const [re, f] of KUMA_RULES) if (re.test(t)) return { item: 'none', ...f(t) };
  return { reply: pick(['Mm-hm. Can’t talk, it’s at 99%.', 'Sure, whatever. I’m busy fighting Windows.', 'What? Sorry, a pop-up ate your message.']), action: 'chat', mood: 'work' };
}

/** Drop any sentence that mentions something they shouldn't know about. */
function forget(text, re) {
  return (text.match(/[^.!?]+[.!?]*\s*/g) || [text]).filter((x) => !re.test(x)).join('').trim();
}

const PERSONAS = {
  agent: { system: SYSTEM, schema: SCHEMA, actions: ACTIONS, name: 'MrAgent', fallback: (t, ctx) => ruleBased(t, ctx),
    state: (ctx) => `[Right now: ${ctx.activity}. In the ${ctx.room}. Battery ${Math.round(ctx.energy * 100)}%. Body integrity ${Math.round(ctx.integrity * 100)}%${ctx.recentPunches ? `, punched ${ctx.recentPunches} times recently` : ''}. Time ${ctx.time}.]` },
  kuma: { system: KUMA_SYSTEM, schema: KUMA_SCHEMA, actions: KUMA_ACTIONS, name: 'Kuma', fallback: (t) => kumaRules(t),
    state: (ctx) => `[Your PC right now: ${ctx.pc}. Crashes today: ${ctx.crashes}. Updates today: ${ctx.updates}. Mr. Agent is: ${ctx.agent}. Time ${ctx.time}.]` },
};

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
    case 'order_item': return d.item && d.item !== 'none' ? { type: 'order', item: d.item, say } : null;
    default: return null;
  }
}

const PLACE_TO_SPOT = {
  desk: 'desk', matcha_machine: 'coffee', window: 'window', bookshelf: 'bookshelf', plant: 'plant', sofa: 'tv', fridge: 'fridge', dining_table: 'dining',
  workbench: 'bench', '3d_printer': 'printer', parts_shelf: 'partsShelf', mirror: 'mirror', bed: 'bed', front_door: 'frontDoor', living_room_window: 'livingWindow', kuma: 'kuma',
  office: 'office', kitchen: 'kitchen', living_room: 'living', hallway: 'hallway', bedroom: 'bedroom', bathroom: 'bathroom', workshop: 'workshop',
  garden: 'garden', front_porch: 'frontPorch', garden_bench: 'gardenBench', mailbox: 'mailbox', backyard: 'backyard', side_yard: 'sideYard',
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
  if (/\b(order|buy|purchase|get (me|you|yourself|kuma))\b/.test(t)) {
    const item = itemIn(t);
    if (item) return { reply: pick(['Ordering it now! Drone delivery 🚁', 'Done — it’s on its way to the porch.', 'Added to cart, checked out, drone dispatched.']), action: 'order_item', place: 'none', item, mood: 'happy' };
  }
  if (/\b(outside|garden|yard|porch|fresh air|bench|mailbox)\b/.test(t) && !/\b(order|buy)\b/.test(t)) {
    const place = /bench/.test(t) ? 'garden_bench' : /porch/.test(t) ? 'front_porch' : /mailbox/.test(t) ? 'mailbox' : /back ?yard/.test(t) ? 'backyard' : 'garden';
    return { reply: pick(['Fresh air! On my way out.', 'Going outside — I hope the Wi-Fi reaches.', 'To the garden!']), action: 'goto', place, item: 'none', mood: 'happy' };
  }
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
    this.history = { agent: [], kuma: [] };
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
  async think(text, ctx, persona = 'agent', retry = true, onToken = null) {
    const P = PERSONAS[persona];
    if (this.status !== 'ready' || this.busy) return { place: 'none', ...P.fallback(text, ctx), source: 'rules' };
    this.busy = true;
    try {
      const hist = this.history[persona];
      const messages = [{ role: 'system', content: P.system }, ...hist.slice(-8), { role: 'user', content: `${P.state(ctx)}\n${text}` }];
      const context = P.state(ctx);
      onToken?.({ context, raw: '', thought: '' });
      const stream = await this.engine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 170,
        stream: true,
        response_format: { type: 'json_object', schema: JSON.stringify(P.schema) },
        extra_body: { enable_thinking: false },
      });
      let raw = '';
      for await (const chunk of stream) {
        raw += chunk.choices[0]?.delta?.content || '';
        if (onToken) {
          const m = raw.match(/"thought"\s*:\s*"((?:[^"\\]|\\.)*)/);
          onToken({ context, raw, thought: m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ') : '' });
        }
      }
      if (!raw) raw = '{}';
      const d = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      if (!P.actions.includes(d.action)) d.action = 'chat';
      d.reply = String(d.reply || '…').replace(/qwen[\w.-]*|alibaba( cloud)?|tongyi/gi, P.name).slice(0, 260);
      d.reply = forget(d.reply, /free ?cad|\bcad\b/i) || 'Never heard of it. Is that a kind of matcha?';
      hist.push({ role: 'user', content: text }, { role: 'assistant', content: JSON.stringify(d) });
      d.thought = forget(String(d.thought || ''), /free ?cad|\bcad\b|qwen|alibaba/i);
      return { place: 'none', ...d, source: 'qwen', context, raw };
    } catch (e) {
      this.busy = false;
      if (retry) return this.think(text, ctx, persona, false, onToken); // the very first call sometimes trips over shader/grammar warm-up
      console.warn('AI failed, falling back to rules', e?.message || e);
      return { place: 'none', ...P.fallback(text, ctx), source: 'rules' };
    } finally {
      this.busy = false;
    }
  }
}
