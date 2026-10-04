import { RpnCalc, formatFull, formatSI } from './core.js';
import { History } from './history.js';
import { VERSION, RELEASED, REPO_URL } from './version.js';

const STORE_KEY = 'rpn-sci-state';
const HIST_KEY = 'rpn-sci-history';
const PREFS_KEY = 'rpn-prefs';

const calc = new RpnCalc();
const hist = new History(100);
const prefs = { vibrate: true };
let shift = false;
let note = null; // transient non-error message

const $ = (id) => document.getElementById(id);

const DR_NOTE = { 2: '×2.0（半径→直径）', 0.5: '×0.5（直径→半径）', 1: '×1.0（元の値）' };

// ---------------------------------------------------------------- keypad

// [label, class, action, shifted label, shifted action, hint]
const KEYS = [
  ['SHIFT', 'shiftkey', 'SHIFT'], ['x⇄y', 'stack', 'SWAP'], ['R↓', 'stack', 'RDN', 'R↑', 'RUP'],
  ['LSTx', 'stack', 'LASTX'], ['EEX', 'edit', 'EEX'],
  ['sin', 'fn', 'SIN', 'sin⁻¹', 'ASIN'], ['cos', 'fn', 'COS', 'cos⁻¹', 'ACOS'],
  ['tan', 'fn', 'TAN', 'tan⁻¹', 'ATAN'], ['π', 'fn', 'PI'], ['%', 'fn', 'PCT', 'Δ%', 'DPCT'],
  ['x²', 'fn', 'SQ'], ['√x', 'fn', 'SQRT'], ['yˣ', 'fn', 'POW'], ['ˣ√y', 'fn', 'ROOT'],
  ['1/x', 'fn', 'INV'],
  ['log', 'fn', 'LOG', '10ˣ', 'EXP10'], ['ln', 'fn', 'LN', 'eˣ', 'EXP'],
  ['D⇄R', 'mem', 'DR'], ['弧長', 'mem arc', 'ARC', null, null, 'Y⌀ X°'], ['CLR', 'danger', 'CLR'],
  ['7', 'num', '7'], ['8', 'num', '8'], ['9', 'num', '9'], ['÷', 'op', 'DIV'], ['CLX', 'edit', 'CLX'],
  ['4', 'num', '4'], ['5', 'num', '5'], ['6', 'num', '6'], ['×', 'op', 'MUL'], ['↶', 'edit', 'UNDO'],
  ['1', 'num', '1'], ['2', 'num', '2'], ['3', 'num', '3'], ['−', 'op', 'SUB'], ['⌫', 'edit', 'BS'],
  ['0', 'num', '0'], ['.', 'num', '.'], ['±', 'edit', 'CHS'], ['+', 'op', 'ADD'], ['ENTER', 'enter', 'ENTER'],
];

// Shown on the キー説明 tab.
const HELP = [
  ['スタック', [
    ['ENTER', 'X を Y に押し上げる（数値の区切り）。続けて押すと X を複製'],
    ['x⇄y', 'X と Y を入れ替える'],
    ['R↓', 'スタックを下に回す（SHIFT で R↑：上に回す）'],
    ['LSTx', '直前の計算に使った X を呼び出す'],
  ]],
  ['入力・消去', [
    ['EEX', '指数入力。2.1 EEX 5 で 2.1×10⁵。入力中に ± で指数の符号を反転'],
    ['±', '符号反転（指数入力中は指数の符号）'],
    ['⌫', '入力中は 1 文字削除。入力していないときは X を捨てる（DROP）'],
    ['CLX', 'X を 0 にする'],
    ['CLR', 'スタックをすべて 0 にする'],
    ['↶', '1 つ前に戻す（入力中なら入力を取り消し）。やり直しは 履歴 タブの Redo'],
  ]],
  ['四則・べき乗', [
    ['+ − × ÷', 'Y と X で計算（例: 6 ENTER 2 ÷ → 3）'],
    ['x²', 'X の 2 乗'],
    ['√x', 'X の平方根'],
    ['yˣ', 'Y の X 乗'],
    ['ˣ√y', 'Y の X 乗根（³√-8 = -2 のように負の数の奇数乗根も可）'],
    ['1/x', 'X の逆数'],
    ['%', 'Y の X%（Y は残るので + で「Y の X% 増し」）。SHIFT で Δ%：Y→X の増減率'],
  ]],
  ['関数', [
    ['sin cos tan', '三角関数（設定の DEG/RAD に従う）。SHIFT で逆関数'],
    ['π', '円周率を入れる'],
    ['log', '常用対数（SHIFT で 10ˣ）'],
    ['ln', '自然対数（SHIFT で eˣ）'],
  ]],
  ['設計用', [
    ['D⇄R', '押すたびに元の値の ×2.0 → ×0.5 → ×1.0 と切り替わる（直径⇄半径の換算）'],
    ['弧長', 'Y = 直径[mm]、X = 角度[°] の弧長 π·D·θ/360。角度は常に度'],
  ]],
  ['表示', [
    ['STD', '12 桁まで、末尾の 0 を省略'],
    ['FIX', '小数点以下を ± で指定した桁数に固定'],
    ['SCI', '指数表示（1.235E4）'],
    ['ENG', '指数を 3 の倍数にそろえる（12.35E3）'],
    ['X をタップ', '値をクリップボードにコピー'],
    ['≈ / 接頭辞', 'X の下に丸める前の値と、k・m などの SI 接頭辞表記を表示'],
  ]],
];

function buildKeys() {
  const pad = $('keys');
  for (const [label, cls, action, alt, altAction, hint] of KEYS) {
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
    if (hint) {
      const h = document.createElement('small');
      h.className = 'hint';
      h.textContent = hint;
      b.appendChild(h);
    }
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

function buildHelp() {
  const dl = $('help');
  for (const [title, rows] of HELP) {
    const dt = document.createElement('dt');
    dt.textContent = title;
    dl.appendChild(dt);
    for (const [key, text] of rows) {
      const dd = document.createElement('dd');
      dd.innerHTML = '<b></b><span></span>';
      dd.firstChild.textContent = key;
      dd.lastChild.textContent = text;
      dl.appendChild(dd);
    }
  }
}

// ---------------------------------------------------------------- actions

function perform(action) {
  switch (action) {
    case 'BS': return calc.backspace();
    case 'CHS': return calc.chs();
    case 'EEX': return calc.eex();
    case '.': return calc.point();
    case 'DR': return calc.drCycle();
    default:
      if (/^[0-9]$/.test(action)) return calc.digit(action);
      return calc.exec(action);
  }
}

const ENTRY_KEYS = /^([0-9.]|EEX)$/;

// One key press from the keypad (handles SHIFT and UNDO).
function press(action) {
  note = null;
  if (action === 'SHIFT') {
    shift = !shift;
    vibrate(8);
    render();
    return;
  }
  shift = false;
  if (action === 'UNDO') {
    undo();
    return;
  }
  const wasEntering = calc.entering;
  const drRunning = calc.drFactor() !== null;
  const before = calc.snapshot();
  const ok = perform(action);
  if (ok) {
    if (ENTRY_KEYS.test(action) || (wasEntering && (action === 'BS' || action === 'CHS'))) {
      hist.touch(); // editing a number is not a step
    } else {
      const [expr, result] = describe(action, before);
      const last = hist.steps[hist.i - 1];
      if (action === 'DR' && drRunning && last && last.op === 'DR' && !hist.dirty) {
        hist.amendLast(calc.snapshot(), expr, result);
      } else {
        hist.record(before, calc.snapshot(), expr, result, action);
      }
    }
  }
  feedback(ok);
}

function feedback(ok) {
  vibrate(!ok && calc.msg ? [25, 40, 25] : 8);
  save();
  render();
}

// Tape text for one operation: [expression, result].
function describe(action, before) {
  const f = (v) => calc.format(v);
  const [x, y] = before.s.stk;
  const r = f(calc.s.stk[0]);
  const deg = calc.s.deg ? '°' : '';
  const sym = { ADD: '+', SUB: '−', MUL: '×', DIV: '÷', POW: '^' };
  const fn = { SIN: 'sin', COS: 'cos', TAN: 'tan', ASIN: 'sin⁻¹', ACOS: 'cos⁻¹', ATAN: 'tan⁻¹', LOG: 'log', LN: 'ln' };
  if (action in sym) return [`${f(y)} ${sym[action]} ${f(x)}`, r];
  if (action in fn) return [`${fn[action]}(${f(x)}${/^(SIN|COS|TAN)$/.test(action) ? deg : ''})`, r];
  switch (action) {
    case 'ROOT': return [`${f(x)}√(${f(y)})`, r];
    case 'ARC': return [`弧長 ⌀${f(y)}, ${f(x)}°`, r];
    case 'PCT': return [`${f(y)} × ${f(x)}%`, r];
    case 'DPCT': return [`Δ% ${f(y)} → ${f(x)}`, r];
    case 'SQ': return [`(${f(x)})²`, r];
    case 'SQRT': return [`√(${f(x)})`, r];
    case 'INV': return [`1/(${f(x)})`, r];
    case 'EXP10': return [`10^(${f(x)})`, r];
    case 'EXP': return [`e^(${f(x)})`, r];
    case 'CHS': return [`−(${f(x)})`, r];
    case 'DR': return [`${f(calc.dr.base)} ×${calc.drFactor().toFixed(1)}`, r];
    case 'ENTER': return [`${f(x)} ENTER`, r];
    case 'BS': return ['DROP', r];
    default: {
      const label = { PI: 'π', LASTX: 'LSTx', SWAP: 'x⇄y', RDN: 'R↓', RUP: 'R↑', CLX: 'CLX', CLR: 'CLR' };
      return [label[action] ?? action, r];
    }
  }
}

function undo() {
  const what = hist.dirty ? '入力を取り消し' : hist.i > 0 ? `取消: ${hist.steps[hist.i - 1].expr}` : null;
  moveTo(hist.undo(), what);
}

function redo() {
  const step = hist.steps[hist.i];
  moveTo(hist.redo(), step ? `やり直し: ${step.expr}` : null);
}

function moveTo(snap, what) {
  if (!snap) {
    vibrate([25, 40, 25]);
    render();
    return;
  }
  calc.restoreValues(snap);
  note = what;
  feedback(true);
}

function vibrate(p) {
  if (!prefs.vibrate) return;
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
  $('vib').classList.toggle('on', prefs.vibrate);
  $('rad').hidden = s.deg;

  const f = calc.drFactor();
  if (f !== null && !calc.msg) note = DR_NOTE[f];
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
  // The message takes the left side of the info row; ≈ shows when there is none.
  $('full').textContent = !msg.textContent && !calc.entering && full !== shown ? '≈ ' + full : '';
  const si = formatSI(xv);
  $('si').textContent = si && /[a-zµ]/i.test(si) ? si : '';

  const pad = $('keys');
  pad.classList.toggle('shifted', shift);
  for (const k of pad.querySelectorAll('.has-alt')) {
    k.querySelector('.main').textContent = shift ? k.dataset.altLabel : k.dataset.label;
  }

  if (!$('sheet').hidden) renderTape();
}

function renderTape() {
  $('t-undo').disabled = !hist.canUndo();
  $('t-redo').disabled = !hist.canRedo();
  $('t-clear').disabled = hist.steps.length === 0;
  const ol = $('tape');
  ol.replaceChildren();
  if (!hist.steps.length) return;
  const row = (n, expr, result, cls, jumpTo) => {
    const li = document.createElement('li');
    li.className = cls;
    li.dataset.jump = jumpTo;
    li.innerHTML = '<span class="n"></span><span class="e"></span><span class="r"></span>';
    li.children[0].textContent = n;
    li.children[1].textContent = expr;
    li.children[2].textContent = result;
    ol.appendChild(li);
    return li;
  };
  row('', '最初の状態', '', 'start' + (hist.i === 0 ? ' cur' : ''), 0);
  hist.steps.forEach((st, k) => {
    const cls = (k >= hist.i ? 'undone' : '') + (k === hist.i - 1 ? ' cur' : '');
    row(k + 1, st.expr, st.result, cls, k + 1);
  });
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

// ---------------------------------------------------------------- menu sheet

function openMenu(tab = 'tape') {
  if ($('sheet').hidden) history.pushState({ menu: true }, ''); // Android back closes it
  $('sheet').hidden = false;
  showTab(tab);
}

function closeMenu() {
  if (!$('sheet').hidden && history.state?.menu) history.back();
  else $('sheet').hidden = true;
}

function showTab(tab) {
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
  for (const t of document.querySelectorAll('#sheet .tab')) t.hidden = t.id !== 'tab-' + tab;
  if (tab === 'tape') {
    renderTape();
    $('tape').querySelector('.cur')?.scrollIntoView({ block: 'center' });
  }
}

async function checkUpdate() {
  const status = $('upd-status');
  status.textContent = '確認中…';
  try {
    const res = await fetch('version.js?t=' + Date.now(), { cache: 'no-store' });
    const latest = /VERSION = '([^']+)'/.exec(await res.text())?.[1];
    if (!latest) throw new Error('no version');
    if (latest === VERSION) {
      status.textContent = `最新版です（v${VERSION}）`;
      return;
    }
    status.textContent = `v${latest} に更新します…`;
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    for (const k of await caches.keys()) await caches.delete(k);
    location.reload();
  } catch {
    status.textContent = 'オフラインのため確認できません';
  }
}

// ---------------------------------------------------------------- persistence

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(calc.toJSON()));
    localStorage.setItem(HIST_KEY, JSON.stringify(hist.toJSON()));
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* private mode or full */ }
}

function load() {
  const read = (key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  };
  const st = read(STORE_KEY);
  if (st) calc.loadJSON(st);
  if (!hist.loadJSON(read(HIST_KEY), calc.snapshot())) hist.clear(calc.snapshot());
  const p = read(PREFS_KEY);
  if (p && typeof p.vibrate === 'boolean') prefs.vibrate = p.vibrate;
}

// ---------------------------------------------------------------- physical keyboard

const KEYMAP = {
  Enter: 'ENTER', ' ': 'ENTER', Backspace: 'BS', Escape: 'CLX', Delete: 'CLR',
  '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '^': 'POW', '%': 'PCT',
  '.': '.', ',': '.', e: 'EEX', E: 'EEX', n: 'CHS', s: 'SWAP', r: 'RDN', R: 'RUP',
  l: 'LASTX', q: 'SQRT', i: 'INV', p: 'PI', d: 'DR', a: 'ARC', ArrowUp: 'RUP', ArrowDown: 'RDN',
};

function onKey(e) {
  if (e.altKey || e.metaKey) return;
  if (!$('sheet').hidden) {
    if (e.key === 'Escape') closeMenu();
    return;
  }
  let action = null;
  if (e.ctrlKey) {
    if (e.key === 'z' || e.key === 'Z') action = 'UNDO';
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      redo();
      return;
    }
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

function onSetting(fn) {
  fn();
  save();
  render();
}

function init() {
  load();
  buildKeys();
  buildHelp();

  $('modes').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) onSetting(() => calc.setMode(b.dataset.mode));
  });
  $('digits').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && calc.s.mode !== 'STD') onSetting(() => calc.setDigits(calc.s.digits + +b.dataset.d));
  });
  $('xrow').addEventListener('click', copyX);

  $('open-menu').addEventListener('click', () => openMenu('tape'));
  $('close-menu').addEventListener('click', closeMenu);
  window.addEventListener('popstate', () => { $('sheet').hidden = true; });
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) showTab(b.dataset.tab);
  });

  $('t-undo').addEventListener('click', undo);
  $('t-redo').addEventListener('click', redo);
  $('t-clear').addEventListener('click', () => {
    if (!confirm('計算履歴をすべて消去しますか？')) return;
    hist.clear(calc.snapshot());
    save();
    render();
  });
  $('tape').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) moveTo(hist.jump(+li.dataset.jump), null);
  });

  $('angle').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) onSetting(() => calc.setDeg(b.dataset.deg === '1'));
  });
  $('grp').addEventListener('click', () => onSetting(() => calc.toggleGroup()));
  $('vib').addEventListener('click', () => onSetting(() => { prefs.vibrate = !prefs.vibrate; }));
  // Anything not served from GitHub Pages (localhost, the Tailscale preview) is a dev build.
  const dev = !location.hostname.endsWith('github.io');
  $('ver').textContent = 'v' + VERSION + (dev ? ' 開発版' : '');
  if (dev) document.title += ' (開発版)';
  $('released').textContent = RELEASED + ' 公開';
  $('upd').addEventListener('click', checkUpdate);
  $('repo').href = REPO_URL;

  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', render);
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
}

init();
