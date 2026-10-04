import { RpnCalc } from './core.js';

const STORE_KEY = 'rpn-calc-state';
const BASE_VAR = { 16: '--hex', 10: '--dec', 8: '--oct', 2: '--bin' };
const BASE_LETTER = { 16: 'H', 10: 'D', 8: 'O', 2: 'B' };

const calc = new RpnCalc();
let undoSnap = null;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- keypad

// [label, sub-label, class, action]. Digit actions are single chars.
const KEYS = [
  ['AND', '&', 'bop', 'AND'], ['OR', '|', 'bop', 'OR'], ['XOR', '^', 'bop', 'XOR'],
  ['NOT', '~', 'bop', 'NOT'], ['#1', 'popcnt', 'bop', 'POPCNT'],
  ['≪', 'Y&lt;&lt;X', 'bop', 'SHL'], ['≫', 'Y&gt;&gt;X', 'bop', 'SHR'], ['RL', 'rotate', 'bop', 'ROL'],
  ['RR', 'rotate', 'bop', 'ROR'], ['MOD', '%', 'op word', 'MOD'],
  ['x⇄y', 'swap', 'stack', 'SWAP'], ['R↓', 'roll', 'stack', 'RDN'], ['R↑', 'roll', 'stack', 'RUP'],
  ['LSTx', 'last x', 'stack', 'LASTX'], ['±', 'neg', 'op', 'CHS'],
  ['D', '', 'num hexd', 'D'], ['E', '', 'num hexd', 'E'], ['F', '', 'num hexd', 'F'],
  ['÷', '', 'op', 'DIV'], ['⌫', '', 'edit', 'BS'],
  ['A', '', 'num hexd', 'A'], ['B', '', 'num hexd', 'B'], ['C', '', 'num hexd', 'C'],
  ['×', '', 'op', 'MUL'], ['CLX', 'clear x', 'edit', 'CLX'],
  ['7', '', 'num', '7'], ['8', '', 'num', '8'], ['9', '', 'num', '9'],
  ['−', '', 'op', 'SUB'], ['CLR', 'all', 'danger', 'CLR'],
  ['4', '', 'num', '4'], ['5', '', 'num', '5'], ['6', '', 'num', '6'],
  ['+', '', 'op', 'ADD'], ['↶', 'undo', 'edit', 'UNDO'],
  ['1', '', 'num', '1'], ['2', '', 'num', '2'], ['3', '', 'num', '3'],
  ['ENTER', '', 'enter', 'ENTER'],
  ['0', '', 'num', '0'],
];

function buildKeys() {
  const pad = $('keys');
  for (const [label, sub, cls, action] of KEYS) {
    const b = document.createElement('button');
    b.className = 'k ' + cls;
    b.dataset.act = action;
    b.innerHTML = label + (sub ? `<small>${sub}</small>` : '');
    if (action === 'ENTER') b.style.cssText = 'grid-column: 4 / 6; grid-row: 8 / 10;';
    if (action === '0') b.style.cssText = 'grid-column: 1 / 4;';
    pad.appendChild(b);
  }
  // pointerdown reacts instantly on touch; click would wait for release.
  pad.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.k');
    if (!b) return;
    e.preventDefault();
    b.classList.add('press');
    setTimeout(() => b.classList.remove('press'), 90);
    run(b.dataset.act);
  });
}

// ---------------------------------------------------------------- actions

function perform(action) {
  if (/^[0-9A-F]$/.test(action)) return calc.digit(action);
  switch (action) {
    case 'BS': return calc.backspace();
    case 'CHS': return calc.chs();
    case 'UNDO': {
      if (!undoSnap) return false;
      const cur = calc.snapshot();
      calc.restore(undoSnap);
      undoSnap = cur; // pressing again = redo
      return 'undo';
    }
    default: return calc.exec(action);
  }
}

// Runs one action with undo bookkeeping, feedback and redraw.
function act(fn) {
  const before = calc.snapshot();
  const r = fn();
  if (r === true) undoSnap = before;
  if (r === false && calc.msg) vibrate([25, 40, 25]);
  else vibrate(8);
  save();
  render();
}

const run = (action) => act(() => perform(action));

function vibrate(p) {
  try { navigator.vibrate?.(p); } catch { /* not supported */ }
}

// ---------------------------------------------------------------- render

function render() {
  const s = calc.s;
  const root = document.documentElement;
  root.style.setProperty('--accent', `var(${BASE_VAR[s.base]})`);

  for (const b of $('bases').children) b.classList.toggle('on', +b.dataset.base === s.base);
  for (const b of $('sizes').children) b.classList.toggle('on', +b.dataset.ws === s.ws);
  $('sgn').textContent = s.sgn ? 'Signed' : 'Unsigned';
  $('sgn').classList.toggle('on', s.sgn);
  $('grp').classList.toggle('on', s.group);
  $('fc').classList.toggle('on', s.carry);
  $('fg').classList.toggle('on', s.overflow);
  $('msg').textContent = calc.msg ?? '';

  const fmt = (v) => calc.format(v, s.base, s.group);
  setFit($('sT'), fmt(s.stk[3]));
  setFit($('sZ'), fmt(s.stk[2]));
  setFit($('sY'), fmt(s.stk[1]));
  const x = $('sX');
  x.textContent = calc.xText();
  x.classList.toggle('entering', calc.entering);
  fitX(x);

  // X in the other bases (BIN is shown as the bit grid).
  const info = $('info');
  info.replaceChildren();
  for (const b of [16, 10, 8]) {
    if (b === s.base) continue;
    const row = document.createElement('div');
    row.innerHTML = `<b style="color:var(${BASE_VAR[b]})">${BASE_LETTER[b]}</b><span></span>`;
    row.lastChild.textContent = calc.format(s.stk[0], b, true);
    info.appendChild(row);
  }
  renderBits();

  // Digits that the current base cannot take.
  for (const k of document.querySelectorAll('.k.num')) {
    const d = parseInt(k.dataset.act, 16);
    k.classList.toggle('off', d >= s.base);
  }
}

// Shrink single-line stack values until they fit.
function setFit(el, text) {
  el.textContent = text;
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && size > 9) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
}

// X may wrap, but prefer one line down to a readable size.
function fitX(el) {
  el.style.fontSize = '';
  el.style.whiteSpace = 'nowrap';
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && size > 15) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
  el.style.whiteSpace = '';
}

function renderBits() {
  const s = calc.s;
  const box = $('bits');
  const x = s.stk[0];
  const perRow = Math.min(16, s.ws);
  box.replaceChildren();
  for (let top = s.ws - 1; top >= 0; top -= perRow) {
    const row = document.createElement('div');
    row.className = 'bitrow';
    row.innerHTML = `<span class="idx">${top}</span>`;
    for (let n = 0; n < perRow / 4; n++) {
      const nib = document.createElement('div');
      nib.className = 'nib';
      for (let i = 0; i < 4; i++) {
        const bit = top - n * 4 - i;
        const on = ((x >> BigInt(bit)) & 1n) === 1n;
        const b = document.createElement('button');
        b.className = 'bit' + (on ? ' one' : '');
        b.dataset.bit = bit;
        b.textContent = on ? '1' : '0';
        b.title = 'bit ' + bit;
        nib.appendChild(b);
      }
      row.appendChild(nib);
    }
    box.appendChild(row);
  }
}

// ---------------------------------------------------------------- persistence

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(calc.toJSON())); } catch { /* private mode */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) calc.loadJSON(JSON.parse(raw));
  } catch { /* corrupt or unavailable: start fresh */ }
}

// ---------------------------------------------------------------- physical keyboard

const CHAR_ACTIONS = {
  ' ': 'ENTER', '=': 'ADD', '+': 'ADD', '-': 'SUB', 'x': 'MUL', '*': 'MUL', '/': 'DIV',
  '%': 'MOD', '&': 'AND', '|': 'OR', '^': 'XOR', '~': 'NOT', '<': 'SHL', '>': 'SHR',
  '[': 'ROL', ']': 'ROR', 'n': 'CHS', 'p': 'POPCNT', 's': 'SWAP', 'r': 'RDN', 'R': 'RUP',
  'l': 'LASTX', '`': 'CLX', 'Z': 'CLR',
};

function onKey(e) {
  if (e.altKey || e.metaKey) return;
  const k = e.key;
  let fn = null;
  if (e.ctrlKey) {
    if (k === 'z' || k === 'Z') fn = () => perform('UNDO');
  } else if (/^[0-9a-fA-F]$/.test(k)) {
    fn = () => calc.digit(k);
  } else if (k === 'Enter') fn = () => calc.exec('ENTER');
  else if (k === 'Backspace') fn = () => calc.backspace();
  else if (k === 'Escape') fn = () => calc.exec('CLX');
  else if (k === 'Delete') fn = () => calc.exec('CLR');
  else if (k === 'Tab') fn = () => calc.cycleBase();
  else if (k === 'ArrowUp') fn = () => calc.exec('RUP');
  else if (k === 'ArrowDown') fn = () => calc.exec('RDN');
  else if (k === 'h') fn = () => calc.setBase(16);
  else if (k === 'o') fn = () => calc.setBase(8);
  else if (k === 'w') fn = () => calc.cycleWordSize(+1);
  else if (k === 'W') fn = () => calc.cycleWordSize(-1);
  else if (k === 'u') fn = () => calc.toggleSigned();
  else if (k === 'g') fn = () => calc.toggleGroup();
  else if (CHAR_ACTIONS[k]) fn = () => perform(CHAR_ACTIONS[k]);
  if (!fn) return;
  e.preventDefault();
  act(fn);
}

// ---------------------------------------------------------------- wiring

function init() {
  load();
  buildKeys();
  $('bases').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) act(() => calc.setBase(+b.dataset.base));
  });
  $('sizes').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) act(() => calc.setWordSize(+b.dataset.ws));
  });
  $('sgn').addEventListener('click', () => act(() => calc.toggleSigned()));
  $('grp').addEventListener('click', () => act(() => calc.toggleGroup()));
  $('bits').addEventListener('click', (e) => {
    const b = e.target.closest('.bit');
    if (b) act(() => calc.toggleBit(+b.dataset.bit));
  });
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', render);
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
}

init();
