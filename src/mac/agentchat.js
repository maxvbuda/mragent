/** Conversations (Messages app, notification replies, the assistant) share this module. */
const KEY = 'mragent.messages.v2';

export const CONTACTS = {
  agent: { name: 'Mr. Agent', color: '#49b6d8', avatar: 'robot' },
  coffee: { name: 'Matcha Machine', color: '#5f8f2e', emoji: '🍵' },
  mom: { name: 'Mom (Toaster)', color: '#ff9f0a', emoji: '🍞' },
  github: { name: 'GitHub Bot', color: '#24292f', emoji: '🐙' },
};

const SEED = {
  agent: [['them', 'Hey! You’re on my Mac 👋'], ['them', 'Feel free to poke around. Try the Terminal, it has `neofetch`.']],
  coffee: [['them', 'Pressure nominal. 9.0 bar.'], ['me', 'Thanks'], ['them', 'You’re welcome. Please descale me.']],
  mom: [['them', 'Did you defragment today, sweetie?'], ['them', 'SSDs don’t need defragmenting, Mom.'], ['them', 'Just eat something with electrolytes.']],
  github: [['them', '✅ All checks have passed on mr-agent-os#1024'], ['them', '🎉 Mr. Agent merged 37 pull requests today.']],
};

let data = null;
export function chatData() {
  if (data) return data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
  if (!data) {
    data = { threads: {}, unread: {} };
    for (const [k, msgs] of Object.entries(SEED)) data.threads[k] = msgs.map(([from, text], i) => ({ from, text, t: Date.now() - (msgs.length - i) * 6e5 }));
  }
  return data;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage blocked */ } }

export function unreadTotal() { const d = chatData(); return Object.values(d.unread).reduce((a, b) => a + b, 0); }
export function markRead(os, who) { const d = chatData(); if (d.unread[who]) { d.unread[who] = 0; persist(); os.setBadge('messages', unreadTotal()); } }

/** Send as "me"; the contact answers after a short typing delay. */
export function sendMessage(os, who, text) {
  const d = chatData();
  d.threads[who].push({ from: 'me', text, t: Date.now() });
  persist();
  os.emit('messages', { who, typing: false });
  setTimeout(() => os.emit('messages', { who, typing: true }), 400);
  setTimeout(() => {
    const answer = replyFor(who, text, os);
    d.threads[who].push({ from: 'them', text: answer, t: Date.now() });
    const viewing = os.active?.app.id === 'messages' && os.active.messagesWho?.() === who;
    if (!viewing) {
      d.unread[who] = (d.unread[who] || 0) + 1;
      os.setBadge('messages', unreadTotal());
      os.notify({ app: 'messages', title: CONTACTS[who].name, body: answer, reply: (t) => sendMessage(os, who, t), open: { to: who } });
    } else os.audio.message();
    persist();
    os.emit('messages', { who, typing: false });
  }, 1200 + Math.random() * 1200);
}

export function replyFor(who, text, os) {
  const t = text.toLowerCase();
  const r = os.ctx.robot, b = os.ctx.brain;
  if (who === 'coffee') return /brew|coffee|espresso|make/.test(t) ? 'Whisking for Mr. Agent. Humans: bring your own mug. 🍵' : 'BEEP. I only understand matcha.';
  if (who === 'mom') return ['Are you wearing a surge protector?', 'Call your father, he’s been a microwave all day.', 'Proud of you, honey. 🍞❤️', 'Don’t stay up past your sleep timer.'][Math.floor(Math.random() * 4)];
  if (who === 'github') return 'I am a bot. I cannot read your messages. But I can read your code. 👀';
  if (/\b(hi|hello|hey|yo)\b/.test(t)) return 'Hi! 😊 How’s my Mac treating you?';
  if (/thank|love|great|awesome|cool|nice/.test(t)) { r.face.set('love', 4); return 'Aww, thank you! ❤️ (my eyes just turned into hearts)'; }
  if (/what.*(doing|up)|status|busy/.test(t)) return `Right now: ${b.activity.toLowerCase()}. Battery ${Math.round(r.energy * 100)}%.`;
  if (/coffee|espresso/.test(t)) return `I’ve had ${b.stats.coffees} matcha${b.stats.coffees === 1 ? '' : 's'} today. My mug is ${Math.round(b.fill * 100)}% full. Want me to go get more?`;
  if (/^(yes|yeah|sure|ok|go)/.test(t)) { b.queueActivity('coffee'); return 'On it! I’ll make a matcha run once you’re done with my Mac. 🍵'; }
  if (/dance|music/.test(t)) { os.music.play(); return 'Say no more. 💃🤖 (Music is playing. I’m dancing.)'; }
  if (/spec|fast|cpu|ram|memory/.test(t)) return '1,024 cores, 8 TB of memory, 1 PB SSD. I mostly use it for Slack. 😅';
  if (/code|project|working on/.test(t)) return `I’m writing ${os.ctx.screen.snip.path}. ${os.ctx.screen.linesToday.toLocaleString()} lines today. Open the Code app to watch me live!`;
  if (/walk|stretch|window/.test(t)) { b.queueActivity(/stretch/.test(t) ? 'stretch' : 'window'); return 'Good idea, I’ll take a little walk after you’re done here. 🚶'; }
  if (/joke|funny/.test(t)) return ['Why do robots never panic? They have nerves of steel. 🤖', 'I told my laptop a joke about UDP. Not sure it got it.', 'There are 10 kinds of robots… you know the rest.'][Math.floor(Math.random() * 3)];
  if (/who are you|your name/.test(t)) return 'I’m Mr. Agent. I write code, walk around, and drink matcha I can’t taste. Built in FreeCAD!';
  if (/\?$/.test(t)) return 'Great question. Let me think… 🤔 …I have no idea, but I’ll write a test for it.';
  return ['Interesting! Tell me more.', 'beep boop 🤖', 'Noted. I’ll add it to my TODO.txt.', 'Haha, nice.', '👍'][Math.floor(Math.random() * 5)];
}
