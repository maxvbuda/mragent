import { h } from '../ui.js';
import { robotAvatar } from '../os.js';
import { CONTACTS, chatData, sendMessage, markRead } from '../agentchat.js';

export default {
  id: 'messages', name: 'Messages', icon: 'messages', single: true,
  about: 'Messages — chat with Mr. Agent and friends.',
  launch(os, args = {}) {
    const data = chatData();
    let who = args.to || 'agent';
    let typingFor = null;
    const list = h('div.m-list.scroll');
    const thread = h('div.m-thread.scroll');
    const head = h('div.m-head');
    const input = h('input.m-input', { placeholder: 'iMessage', 'aria-label': 'Message' });
    const avatar = (k) => (CONTACTS[k].avatar ? h('span.m-av', { html: robotAvatar() }) : h('span.m-av', { style: { background: CONTACTS[k].color }, text: CONTACTS[k].emoji }));
    const renderList = () => {
      list.innerHTML = '';
      for (const k of Object.keys(CONTACTS)) {
        const last = data.threads[k].at(-1);
        const unread = data.unread[k] || 0;
        list.append(h('div.m-row', { class: k === who ? 'on' : '', onclick: () => { who = k; render(); } }, avatar(k),
          h('div.m-row-txt', {}, h('b', { text: CONTACTS[k].name }), h('small', { text: last ? last.text : '' })),
          h('div.m-row-meta', {}, h('small.m-time', { text: last ? new Date(last.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '' }), unread ? h('i.m-unread') : null)));
      }
    };
    const renderThread = () => {
      head.innerHTML = '';
      head.append(avatar(who), h('b', { text: CONTACTS[who].name }));
      thread.innerHTML = '';
      data.threads[who].forEach((m) => thread.append(h('div.m-bubble', { class: m.from === 'me' ? 'me' : 'them' }, m.text)));
      if (typingFor === who) thread.append(h('div.m-bubble.them.m-typing', {}, h('i'), h('i'), h('i')));
      else if (data.threads[who].at(-1)?.from === 'me') thread.append(h('div.m-read', { text: 'Read' }));
      thread.scrollTop = thread.scrollHeight;
    };
    const render = () => { markRead(os, who); renderList(); renderThread(); };
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      os.audio.pop();
      sendMessage(os, who, text);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    const off = os.on('messages', (ev) => { typingFor = ev.typing ? ev.who : null; render(); });
    const w = os.createWindow({
      app: this, title: 'Messages', width: 780, height: 520, sidebarWidth: 250, minWidth: 520,
      onArgs: (a) => { if (a.to) { who = a.to; render(); } },
      onClose: off,
      body: (b) => b.append(h('div.split', {}, h('div.sb.m-side', { style: { width: '250px' } }, list), h('div.m-main', {}, head, thread, h('div.m-compose', {}, input, h('button.m-send', { text: '↑', 'aria-label': 'Send', onclick: send }))))),
    });
    w.messagesWho = () => who;
    render();
    setTimeout(() => input.focus(), 50);
    return w;
  },
};
