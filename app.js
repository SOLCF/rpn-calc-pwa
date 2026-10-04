import { RpnCalc, formatFull, formatSI } from './core.js';

const STORE_KEY = 'rpn-sci-state';

const calc = new RpnCalc();
let undoSnap = null;
let shift = false;
let pending = null; // 'STO' | 'RCL' while waiting for a register digit
let note = null;    // transient non-error message

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- keypad

// [label, class, action, shifted label, shifted action]
const KEYS = [
  ['SHIFT', 'shiftkey', 'SHIFT'], ['x⇄y', 'stack', 'SWAP'], ['R↓', 'stack', 'RDN', 'R↑', 'RUP'],
  ['LSTx', 'stack', 'LASTX'], ['↶', 'edit', 'UNDO'],
  ['sin', 'fn', 'SIN', 'sin⁻¹', 'ASIN'], ['cos', 'fn', 'COS', 'cos⁻¹', 'ACOS'],
  ['tan', 'fn', 'TAN', 'tan⁻¹', 'ATAN'], ['π', 'fn', 'PI'], ['1/x', 'fn', 'INV'],
  ['x²', 'fn', 'SQ'], ['√x', 'fn', 'SQRT'], ['yˣ', 'fn', 'POW'], ['ˣ√y', 'fn', 'ROOT'],
  ['EEX', 'edit', 'EEX'],
  ['log', 'fn', 'LOG', '10ˣ', 'EXP10'], ['ln', 'fn', 'LN', 'eˣ', 'EXP'],
  ['STO', 'mem', 'STO'], ['RCL', 'mem', 'RCL'], ['%', 'fn', 'PCT', 'Δ%', 'DPCT'],
  ['7', 'num', '7'], ['8', 'num', '8'], ['9', 'num', '9'], ['÷', 'op', 'DIV'], ['CLR', 'danger', 'CLR'],
  ['4', 'num', '4'], ['5', 'num', '5'], ['6', 'num', '6'], ['×', 'op', 'MUL'], ['CLX', 'edit', 'CLX'],
  ['1', 'num', '1'], ['2', 'num', '2'], ['3', 'num', '3'], ['−', 'op', 'SUB'], ['⌫', 'edit', 'BS'],
  ['0', 'num', '0'], ['.', 'num', '.'], ['±', 'edit', 'CHS'], ['+', 'op', 'ADD'], ['ENTER', 'enter', 'ENTER'],
];

function buildKeys() {
  const pad = $('keys');
  for (const [label, cls, action, alt, altAction] of KEYS) {
    const b = document.createElement('button');
    b.className = 'k ' + cls + (alt ? ' has-alt' : '');
    b.dataset.act = action;
    if (alt) {
      b.dataset.alt = altAction;
      b.innerHTML = `<sup class="alt"></sup><span class="main"></span>`;
      b.querySelector('.alt').textContent = alt;
      b.dataset.label = label;
      b.dataset.altLabel = alt;
    } else {
      b.innerHTML = '<span class="main"></span>';
    }
    b.querySelector('.main').textContent = label;
    pad.appendChild(b);
  }
  // pointerdown reacts instantly on touch; click would wait for release.
  pad.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.k');
    if (!b) return;
    e.preventDefault();
    b.classList.add('press');
    setTimeout(() => b.classList.remove('press'), 90);
    press(shift && b.dataset.alt ? b.dataset.alt : b.dataset.act);
  });
}

// ---------------------------------------------------------------- actions

function perform(action) {
  switch (action) {
    case 'BS': return calc.backspace();
    case 'CHS': return calc.chs();
    case 'EEX': return calc.eex();
    case '.': return calc.point();
    case 'UNDO': {
      if (!undoSnap) return false;
      const cur = calc.snapshot();
      calc.restore(undoSnap);
      undoSnap = cur; // pressing again = redo
      return 'undo';
    }
    default:
      if (/^[0-9]$/.test(action)) return calc.digit(action);
      return calc.exec(action);
  }
}

// One key press from the keypad (handles SHIFT and STO/RCL prefixes).
function press(action) {
  note = null;
  if (pending) {
    const which = pending;
    pending = null;
    if (/^[0-9]$/.test(action)) {
      const n = +action;
      act(() => (which === 'STO' ? calc.sto(n) : calc.rcl(n)));
      if (which === 'STO') note = `R${n} に保存`;
    }
    render(); // any other key just cancels
    return;
  }
  if (action === 'SHIFT') {
    shift = !shift;
    vibrate(8);
    render();
    return;
  }
  shift = false;
  if (action === 'STO' || action === 'RCL') {
    pending = action;
    note = `${action} → 0〜9`;
    vibrate(8);
    render();
    return;
  }
  act(() => perform(action));
}

// Runs one calculator action with undo bookkeeping, feedback and redraw.
function act(fn) {
  const before = calc.snapshot();
  const r = fn();
  if (r === true) undoSnap = before;
  if (r === false && calc.msg) vibrate([25, 40, 25]);
  else vibrate(8);
  save();
  render();
}

function vibrate(p) {
  try { navigator.vibrate?.(p); } catch { /* not supported */ }
}

// ---------------------------------------------------------------- render

function render() {
  const s = calc.s;
  for (const b of $('modes').children) b.classList.toggle('on', b.dataset.mode === s.mode);
  for (const b of $('angle').children) b.classList.toggle('on', (b.dataset.deg === '1') === s.deg);
  $('dval').textContent = s.digits;
  $('digits').classList.toggle('off', s.mode === 'STD');
  $('grp').classList.toggle('on', s.group);

  const msg = $('msg');
  msg.textContent = calc.msg ?? note ?? '';
  msg.classList.toggle('note', !calc.msg && !!note);

  setFit($('sT'), calc.format(s.stk[3]));
  setFit($('sZ'), calc.format(s.stk[2]));
  setFit($('sY'), calc.format(s.stk[1]));
  const x = $('sX');
  x.classList.toggle('entering', calc.entering);
  setFit(x, calc.xText(), 14);

  // Full precision when the display rounds, plus SI prefix form.
  const xv = s.stk[0];
  const full = formatFull(xv);
  const shown = calc.format(xv).replace(/,/g, '');
  $('full').textContent = !calc.entering && full !== shown ? '≈ ' + full : '';
  const si = formatSI(xv);
  $('si').textContent = si && /[a-zµ]/i.test(si) ? si : '';

  const regs = $('regs');
  regs.replaceChildren();
  s.reg.forEach((v, i) => {
    if (v === 0) return;
    const r = document.createElement('span');
    r.innerHTML = `<b>R${i}</b>`;
    r.append(calc.format(v));
    regs.appendChild(r);
  });

  const pad = $('keys');
  pad.classList.toggle('shifted', shift);
  pad.classList.toggle('pending', !!pending);
  for (const k of pad.querySelectorAll('.has-alt')) {
    k.querySelector('.main').textContent = shift ? k.dataset.altLabel : k.dataset.label;
  }
}

// Shrink single-line values until they fit.
function setFit(el, text, min = 9) {
  el.textContent = text;
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && size > min) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
}

async function copyX() {
  try {
    await navigator.clipboard.writeText(formatFull(calc.s.stk[0]));
    note = 'コピーしました';
  } catch {
    note = 'コピーできません';
  }
  vibrate(8);
  render();
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

const KEYMAP = {
  Enter: 'ENTER', ' ': 'ENTER', Backspace: 'BS', Escape: 'CLX', Delete: 'CLR',
  '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '^': 'POW', '%': 'PCT',
  '.': '.', ',': '.', e: 'EEX', E: 'EEX', n: 'CHS', s: 'SWAP', r: 'RDN', R: 'RUP',
  l: 'LASTX', q: 'SQRT', i: 'INV', p: 'PI', ArrowUp: 'RUP', ArrowDown: 'RDN',
};

function onKey(e) {
  if (e.altKey || e.metaKey) return;
  let action = null;
  if (e.ctrlKey) {
    if (e.key === 'z' || e.key === 'Z') action = 'UNDO';
  } else if (/^[0-9]$/.test(e.key)) {
    action = e.key;
  } else {
    action = KEYMAP[e.key] ?? null;
  }
  if (!action) return;
  e.preventDefault();
  press(action);
}

// ---------------------------------------------------------------- wiring

function init() {
  load();
  buildKeys();
  $('modes').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) act(() => calc.setMode(b.dataset.mode));
  });
  $('angle').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) act(() => calc.setDeg(b.dataset.deg === '1'));
  });
  $('digits').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && calc.s.mode !== 'STD') act(() => calc.setDigits(calc.s.digits + +b.dataset.d));
  });
  $('grp').addEventListener('click', () => act(() => calc.toggleGroup()));
  $('xrow').addEventListener('click', copyX);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', render);
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
}

init();
