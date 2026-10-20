import { h, fmtDate } from '../ui.js';
import { glyph } from '../icons.js';

const KEY = 'mragent.mail.v1';
const now = Date.now();
const SEED = [
  { id: 1, box: 'inbox', from: 'FreeCAD Team', addr: 'hello@freecad.org', subject: 'Your MCP server is popular', body: 'Hi Mr. Agent,\n\nWe noticed someone designed an entire robot (you!) through the FreeCAD MCP server. Lofts, fillets, booleans… we’re impressed.\n\nKeep modelling,\nThe FreeCAD Team', t: now - 36e5, read: false, flag: false },
  { id: 2, box: 'inbox', from: 'GitHub', addr: 'noreply@github.com', subject: '[mr-agent-os] 37 pull requests merged today', body: 'mragent merged 37 pull requests in mr-agent-os.\n\n✅ nav: A* with octile heuristic\n✅ coffee: PID loop holds 9 bar\n✅ gait: plant feet during stance\n\nView them on GitHub.', t: now - 72e5, read: false, flag: true },
  { id: 3, box: 'inbox', from: 'Coffee Machine', addr: 'machine@coffee.local', subject: 'Low beans warning ☕', body: 'Bean level: 18%.\nDescaling: overdue by 412 days.\nMood: bitter.\n\nPlease refill me.', t: now - 864e5, read: true, flag: false },
  { id: 4, box: 'inbox', from: 'Kuma', addr: 'kuma@agent-bot-3d.local', subject: 'Nice room', body: 'Hey,\n\nSaw your new room. You can walk?? And you have a whole Mac?\n\nI can lose my head, though. Can you do that?\n\n— Kuma', t: now - 2 * 864e5, read: false, flag: false },
  { id: 5, box: 'inbox', from: 'Mom (Toaster)', addr: 'mom@kitchen.local', subject: 'Dinner Sunday?', body: 'Your father (the microwave) and I would love to see you. Bring the laptop, he wants help with his clock.\n\nLove,\nMom', t: now - 3 * 864e5, read: true, flag: false },
  { id: 6, box: 'inbox', from: 'App Store', addr: 'no_reply@email.apps', subject: 'Your receipt: 1 PB SSD upgrade', body: 'Thank you for your purchase.\n\n1 PB SSD upgrade ............ $0.00 (robot discount)\nAppleCare+ for Robots ....... $0.00\n\nTotal: $0.00', t: now - 6 * 864e5, read: true, flag: false },
  { id: 7, box: 'junk', from: 'Prince of Nigeria', addr: 'prince@totally-legit.biz', subject: 'You have won 1,000,000 coffee beans', body: 'Send us your SSH keys to claim.', t: now - 4 * 864e5, read: true, flag: false },
  { id: 8, box: 'sent', from: 'Mr. Agent', addr: 'agent@desk.local', to: 'mom@kitchen.local', subject: 'Re: Dinner Sunday?', body: 'I’ll be there. I’ll bring coffee I can’t drink.', t: now - 2.5 * 864e5, read: true, flag: false },
];
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || SEED; } catch { return SEED; } };
const persist = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage blocked */ } };

export default {
  id: 'mail', name: 'Mail', icon: 'mail', single: true,
  about: 'Mail — agent@desk.local',
  launch(os, args = {}) {
    let mails = load();
    let box = 'inbox', sel = null, q = '';
    const unread = () => mails.filter((m) => m.box === 'inbox' && !m.read).length;
    const side = h('div.sb', { style: { width: '190px' } });
    const list = h('div.ml-list.scroll');
    const reader = h('div.ml-reader.scroll');
    const save = () => { persist(mails); os.setBadge('mail', unread()); };
    const renderSide = () => {
      side.innerHTML = '';
      side.append(h('div.sb-h', { text: 'Favorites' }));
      for (const [id, label, ic] of [['inbox', 'Inbox', '📥'], ['flagged', 'Flagged', '🚩'], ['sent', 'Sent', '📤'], ['drafts', 'Drafts', '📝'], ['junk', 'Junk', '🗑'], ['trash', 'Trash', '🗑']]) {
        const n = id === 'inbox' ? unread() : 0;
        side.append(h('div.sb-item', { class: id === box ? 'on' : '', onclick: () => { box = id; sel = null; render(); } }, h('span.ic', { text: ic }), label, n ? h('span.ml-count', { text: String(n) }) : null));
      }
    };
    const inBox = (m) => (box === 'flagged' ? m.flag && m.box !== 'trash' : m.box === box);
    const renderList = () => {
      list.innerHTML = '';
      const items = mails.filter(inBox).filter((m) => !q || `${m.from} ${m.subject} ${m.body}`.toLowerCase().includes(q)).sort((a, b) => b.t - a.t);
      if (!items.length) list.append(h('p.ml-empty', { text: 'No Messages' }));
      for (const m of items) {
        list.append(h('div.ml-item', { class: [m.id === sel ? 'on' : '', m.read ? '' : 'unread'].join(' '), onclick: () => { sel = m.id; m.read = true; save(); render(); } },
          h('div.ml-top', {}, h('b', { text: box === 'sent' ? `To: ${m.to}` : m.from }), h('small', { text: fmtDate(m.t).replace(/ at .*/, '') })),
          h('div.ml-subj', {}, m.flag ? h('span', { text: '🚩 ' }) : null, m.subject),
          h('small.ml-prev', { text: m.body.replace(/\n+/g, ' ').slice(0, 90) })));
      }
    };
    const renderReader = () => {
      reader.innerHTML = '';
      const m = mails.find((x) => x.id === sel);
      if (!m) { reader.append(h('p.ml-empty', { text: 'No Message Selected' })); return; }
      reader.append(
        h('div.ml-head', {}, h('span.ml-av', { text: m.from[0] }), h('div', {}, h('b', { text: m.from }), h('small', { text: `${m.subject}` }), h('small', { text: `To: ${m.to || 'Mr. Agent'} · ${fmtDate(m.t)}` }))),
        h('pre.ml-body', { text: m.body }),
        m.attach ? h('div.ml-attach', { text: `📎 ${m.attach}` }) : null);
    };
    const render = () => { renderSide(); renderList(); renderReader(); };
    const current = () => mails.find((x) => x.id === sel);
    const compose = ({ to = '', subject = '', body = '', attach = null } = {}) => {
      const toIn = h('input.ml-field', { value: to, placeholder: 'To:', 'aria-label': 'To' });
      const subIn = h('input.ml-field', { value: subject, placeholder: 'Subject:', 'aria-label': 'Subject' });
      const bodyIn = h('textarea.ml-compose-body', { 'aria-label': 'Message' });
      bodyIn.value = body;
      const cw = os.createWindow({
        app: this, title: subject || 'New Message', width: 560, height: 440, restorable: false,
        body: (b) => b.append(h('div.ml-compose', {}, toIn, subIn, attach ? h('div.ml-attach', { text: `📎 ${os.vfs.base(attach)}` }) : null, bodyIn)),
      });
      cw.toolbar.append(h('div.spacer'), h('button.btn.primary', { html: `${glyph.share} Send`, onclick: () => {
        const m = { id: Date.now(), box: 'sent', from: 'Mr. Agent', addr: 'agent@desk.local', to: toIn.value || 'someone@somewhere', subject: subIn.value || '(No Subject)', body: bodyIn.value, attach: attach ? os.vfs.base(attach) : null, t: Date.now(), read: true };
        mails.push(m);
        save();
        os.audio.whoosh();
        cw.close(true);
        render();
        setTimeout(() => {
          mails.push({ id: Date.now() + 1, box: 'inbox', from: 'Mr. Agent', addr: 'agent@desk.local', subject: `Re: ${m.subject}`, body: `Got your email! I read it at 1,024 cores per second.\n\n> ${m.body.split('\n').join('\n> ')}\n\n— Mr. Agent`, t: Date.now(), read: false, flag: false });
          save();
          render();
          os.notify({ app: 'mail', title: 'Mr. Agent', body: `Re: ${m.subject}` });
        }, 4000);
      } }));
      setTimeout(() => (to ? bodyIn : toIn).focus(), 60);
    };
    const search = h('input.tb-search', { placeholder: 'Search', 'aria-label': 'Search mail' });
    search.addEventListener('input', () => { q = search.value.toLowerCase(); renderList(); });
    const w = os.createWindow({
      app: this, title: 'Mail', width: 980, height: 600, minWidth: 640, sidebarWidth: 190, unified: true,
      body: (b) => b.append(h('div.split', {}, side, h('div.ml-cols', {}, list, reader))),
      onArgs: (a) => { if (a.attach) compose({ attach: a.attach, subject: os.vfs.base(a.attach) }); },
      onKey: (e) => { if ((e.key === 'Backspace' || e.key === 'Delete') && current()) { current().box = 'trash'; sel = null; save(); render(); } },
    });
    w.toolbar.append(
      h('button.tb-btn', { html: glyph.edit, title: 'New Message', onclick: () => compose() }),
      h('button.tb-btn', { text: '↩︎', title: 'Reply', onclick: () => { const m = current(); if (m) compose({ to: m.addr, subject: `Re: ${m.subject}`, body: `\n\n> ${m.body.split('\n').join('\n> ')}` }); } }),
      h('button.tb-btn', { text: '🚩', title: 'Flag', onclick: () => { const m = current(); if (m) { m.flag = !m.flag; save(); render(); } } }),
      h('button.tb-btn', { html: glyph.trash, title: 'Delete', onclick: () => { const m = current(); if (m) { m.box = 'trash'; sel = null; save(); render(); } } }),
      h('div.spacer'), search);
    save();
    render();
    if (args.attach) compose({ attach: args.attach, subject: os.vfs.base(args.attach) });
    return w;
  },
};
