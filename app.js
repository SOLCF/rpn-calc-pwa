import { RpnCalc, formatFull, formatSI } from './core.js';
import { History } from './history.js';
import { VERSION, RELEASED, REPO_URL } from './version.js';
import { LAYOUT, KEY_INFO, ALT_OF, KEYMAP, helpSections } from './keys.js';

const STORE_KEY = 'rpn-sci-state';
const HIST_KEY = 'rpn-sci-history';
const PREFS_KEY = 'rpn-prefs';
const SEEN_KEY = 'rpn-seen-version';

const calc = new RpnCalc();
const hist = new History(100);
const prefs = {
  vibrate: true,
  win: null,         // {w, h} fixed window size on PC
  theme: 'dark',     // dark | light | auto | hp35s
  prevTheme: 'dark', // theme to return to from hp35s
};
let shift = false;   // SHIFT key on the keypad (latched until the next key)
let kbShift = false; // PC keyboard Shift held down (momentary)
const shifted = () => shift || kbShift;
let note = null; // transient non-error message

const $ = (id) => document.getElementById(id);

const DR_NOTE = { 2: '×2.0（半径→直径）', 0.5: '×0.5（直径→半径）', 1: '×1.0（元の値）' };

// ---------------------------------------------------------------- keypad

function buildKeys() {
  const pad = $('keys');
  for (const [action, altAction] of LAYOUT) {
    const info = KEY_INFO[action];
    const alt = altAction && KEY_INFO[altAction];
    const b = document.createElement('button');
    b.className = 'k ' + info.cls + (alt ? ' has-alt' : '');
    b.dataset.act = action;
    if (alt) {
      b.dataset.alt = altAction;
      b.innerHTML = '<sup class="alt"></sup><span class="main"></span>';
      b.querySelector('.alt').textContent = alt.label;
    } else {
      b.innerHTML = '<span class="main"></span>';
    }
    b.querySelector('.main').textContent = info.label;
    if (info.hint) {
      const h = document.createElement('small');
      h.className = 'hint';
      h.textContent = info.hint;
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
    press(shifted() && b.dataset.alt ? b.dataset.alt : b.dataset.act);
  });
}

function buildHelp() {
  const dl = $('help');
  for (const [title, rows] of helpSections()) {
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
  const info = KEY_INFO[action];
  const f = (v) => calc.format(v);
  const a = {
    x: f(before.s.stk[0]),
    y: f(before.s.stk[1]),
    deg: calc.s.deg ? '°' : '',
    base: calc.dr && f(calc.dr.base),
    factor: calc.drFactor()?.toFixed(1),
  };
  return [info.tape ? info.tape(a) : info.label, f(calc.s.stk[0]) + (info.unit ?? '')];
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
  for (const b of $('theme').children) b.classList.toggle('on', b.dataset.theme === prefs.theme);
  $('hp-btn').textContent = prefs.theme === 'hp35s' ? '元に戻す' : 'HP 35s モード';
  renderWindowSetting();
  $('rad').hidden = s.deg;
  $('ann-rad').hidden = s.deg;

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
  pad.classList.toggle('shifted', shifted());
  $('ann-shift').hidden = !shifted();
  for (const k of pad.querySelectorAll('.has-alt')) {
    const info = KEY_INFO[shifted() ? k.dataset.alt : k.dataset.act];
    k.querySelector('.main').textContent = info.label;
    const h = k.querySelector('.hint');
    if (h) h.textContent = info.hint ?? '';
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

// HP 35s skin: switch to it, and back to the theme used before.
function toggleHp35s() {
  if (prefs.theme === 'hp35s') {
    prefs.theme = prefs.prevTheme;
  } else {
    prefs.prevTheme = prefs.theme;
    prefs.theme = 'hp35s';
  }
  applyTheme();
}

async function checkUpdate() {
  const status = $('upd-status');
  status.textContent = '確認中…';
  try {
    // Give up after 8 s so a weak signal does not leave it spinning.
    const res = await fetch('version.js?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const latest = /VERSION = '([^']+)'/.exec(await res.text())?.[1];
    if (!latest) throw new Error('no version');
    if (latest === VERSION) {
      status.textContent = `最新版です（v${VERSION}）`;
      return;
    }
    status.textContent = `v${latest} に更新します…`;
    // Drop the cache-first worker and its files so the reload comes from the
    // network; the page then registers the new worker, which caches v-latest.
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    location.reload();
  } catch {
    status.textContent = '通信できないため確認できません';
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
  if (p && p.win && Number.isFinite(p.win.w) && Number.isFinite(p.win.h)) prefs.win = { w: p.win.w, h: p.win.h };
  if (p && ['dark', 'light', 'auto', 'hp35s'].includes(p.theme)) prefs.theme = p.theme;
  if (p && ['dark', 'light', 'auto'].includes(p.prevTheme)) prefs.prevTheme = p.prevTheme;
}

// ---------------------------------------------------------------- theme

const lightQuery = matchMedia('(prefers-color-scheme: light)');

function applyTheme() {
  const t = prefs.theme === 'auto' ? (lightQuery.matches ? 'light' : 'dark') : prefs.theme;
  document.documentElement.dataset.theme = t;
  // Status bar / title bar color follows the page background.
  document.querySelector('meta[name="theme-color"]')
    .setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
}

// ---------------------------------------------------------------- PC window size

// Only an installed app window on a PC can be resized by the page.
const appWindowOnPC = () =>
  matchMedia('(display-mode: standalone)').matches && matchMedia('(pointer: fine)').matches;

function applyWindowSize() {
  if (!prefs.win || !appWindowOnPC()) return;
  try { window.resizeTo(prefs.win.w, prefs.win.h); } catch { /* not allowed */ }
}

function renderWindowSetting() {
  const ok = appWindowOnPC();
  $('win-fix').disabled = !ok;
  $('win-free').disabled = !ok || !prefs.win;
  $('win-status').textContent = !ok
    ? 'PC にインストールしたアプリのウィンドウで使えます'
    : prefs.win
      ? `${prefs.win.w}×${prefs.win.h} で固定中（起動時にこのサイズで開く）`
      : '固定していません';
}

// ---------------------------------------------------------------- physical keyboard

function setKbShift(on) {
  if (kbShift === on) return;
  kbShift = on;
  render();
}

function onKey(e) {
  if (e.key === 'Shift') {
    setKbShift(true);
    return;
  }
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
  } else if (/^[a-z]$/i.test(e.key)) {
    // Letters: Shift selects the key's SHIFT function (Shift+a = angle).
    // Symbols are left alone since many need Shift just to be typed.
    const base = KEYMAP[e.key.toLowerCase()] ?? null;
    action = base && e.shiftKey ? ALT_OF[base] ?? base : base;
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
  applyTheme();
  applyWindowSize();
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
  $('theme').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) onSetting(() => { prefs.theme = b.dataset.theme; applyTheme(); });
  });
  $('hp-btn').addEventListener('click', () => onSetting(toggleHp35s));
  lightQuery.addEventListener('change', applyTheme);
  // Also re-check when the app comes back to the front (system theme may have changed meanwhile).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) applyTheme(); });
  window.addEventListener('focus', applyTheme);
  $('win-fix').addEventListener('click', () => onSetting(() => { prefs.win = { w: outerWidth, h: outerHeight }; }));
  $('win-free').addEventListener('click', () => onSetting(() => { prefs.win = null; }));
  // Anything not served from GitHub Pages (localhost, the Tailscale preview) is a dev build.
  const dev = !location.hostname.endsWith('github.io');
  $('ver').textContent = 'v' + VERSION + (dev ? ' 開発版' : '');
  if (dev) document.title += ' (開発版)';
  $('released').textContent = RELEASED + ' 公開';
  $('upd').addEventListener('click', checkUpdate);
  $('repo').href = REPO_URL;

  // Updates install in the background; say so once on the first launch after.
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen && seen !== VERSION) note = `v${VERSION} に更新しました`;
    localStorage.setItem(SEEN_KEY, VERSION);
  } catch { /* storage unavailable */ }

  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', (e) => { if (e.key === 'Shift') setKbShift(false); });
  window.addEventListener('blur', () => setKbShift(false));
  window.addEventListener('resize', render);
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
}

init();
