import { h } from '../ui.js';

export default {
  id: 'calculator', name: 'Calculator', icon: 'calculator', single: true,
  about: 'Calculator — computes on 1,024 cores. Overkill.',
  launch(os) {
    let cur = '0', acc = null, op = null, fresh = true, sci = false, deg = true;
    const display = h('div.calc-display', { text: '0' });
    const opKeys = {};
    const show = () => {
      let s = cur;
      if (s.length > 12) s = (+s).toPrecision(9).replace(/\.?0+(e|$)/, '$1');
      display.textContent = s;
      display.style.fontSize = s.length > 9 ? '34px' : '48px';
      Object.entries(opKeys).forEach(([k, el]) => el.classList.toggle('on', op === k && fresh));
    };
    const calc = (a, b, o) => ({ '+': a + b, '−': a - b, '×': a * b, '÷': b === 0 ? NaN : a / b, '^': a ** b })[o];
    const fmt = (n) => (Number.isFinite(n) ? String(+n.toPrecision(12)) : 'Error');
    const press = (k) => {
      os.audio.click();
      if (/^[0-9]$/.test(k)) { cur = fresh || cur === '0' ? k : cur + k; fresh = false; }
      else if (k === '.') { if (fresh) { cur = '0.'; fresh = false; } else if (!cur.includes('.')) cur += '.'; }
      else if (k === 'AC') { cur = '0'; acc = null; op = null; fresh = true; }
      else if (k === '±') cur = fmt(-cur);
      else if (k === '%') cur = fmt(cur / 100);
      else if (['+', '−', '×', '÷', '^'].includes(k)) {
        if (op && !fresh) cur = fmt(calc(+acc, +cur, op));
        acc = cur; op = k; fresh = true;
      } else if (k === '=') {
        if (op) { cur = fmt(calc(+acc, +cur, op)); op = null; acc = null; fresh = true; }
      } else {
        const x = +cur, r = deg ? Math.PI / 180 : 1;
        const fns = { 'x²': x * x, '√': Math.sqrt(x), sin: Math.sin(x * r), cos: Math.cos(x * r), tan: Math.tan(x * r), ln: Math.log(x), log: Math.log10(x), 'x!': fact(x), π: Math.PI, e: Math.E, '1/x': 1 / x, rand: Math.random() };
        if (k in fns) { cur = fmt(fns[k]); fresh = true; }
        if (k === 'Rad') { deg = !deg; }
      }
      show();
    };
    const fact = (n) => (n < 0 || n > 170 || n % 1 ? NaN : n <= 1 ? 1 : n * fact(n - 1));
    const btn = (k, cls = '') => {
      const b = h('button.calc-key', { class: cls, text: k, onclick: () => press(k) });
      if (['+', '−', '×', '÷', '^'].includes(k)) opKeys[k] = b;
      return b;
    };
    const basic = [['AC', 'fn'], ['±', 'fn'], ['%', 'fn'], ['÷', 'op'], ['7'], ['8'], ['9'], ['×', 'op'], ['4'], ['5'], ['6'], ['−', 'op'], ['1'], ['2'], ['3'], ['+', 'op'], ['0', 'zero'], ['.'], ['=', 'op']];
    const sciKeys = ['x²', '√', '^', 'x!', 'sin', 'cos', 'tan', 'π', 'ln', 'log', '1/x', 'e', 'Rad', 'rand'];
    const pad = h('div.calc-pad', {}, ...basic.map(([k, c]) => btn(k, c || '')));
    const sciPad = h('div.calc-sci', { hidden: true }, ...sciKeys.map((k) => btn(k, 'sci')));
    const root = h('div.calc', {}, display, h('div.calc-body', {}, sciPad, pad));
    const w = os.createWindow({
      app: this, title: ' ', width: 232, height: 380, resizable: false, className: 'win-calc', dark: true,
      body: (b) => b.append(root),
      onKey: (e) => {
        const map = { '*': '×', '/': '÷', '-': '−', '+': '+', Enter: '=', '=': '=', Escape: 'AC', Backspace: 'BS', c: 'AC', '%': '%', '.': '.', ',': '.', '^': '^' };
        const k = /^[0-9]$/.test(e.key) ? e.key : map[e.key];
        if (!k) return;
        e.preventDefault();
        if (k === 'BS') { cur = cur.length > 1 && !fresh ? cur.slice(0, -1) : '0'; show(); return; }
        press(k);
      },
    });
    w.toolbar.append(h('div.spacer'), h('button.tb-btn', { text: 'Sci', title: 'Scientific', onclick: (e) => {
      sci = !sci;
      sciPad.hidden = !sci;
      e.currentTarget.classList.toggle('on', sci);
      w.w = sci ? 480 : 232; w.place();
    } }));
    return w;
  },
};
