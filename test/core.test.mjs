// Run: node test/core.test.mjs
import { readFileSync } from 'node:fs';
import { RpnCalc, OPS, formatNumber, formatSI, formatFull } from '../core.js';
import { LAYOUT, KEY_INFO, KEYMAP, helpSections } from '../keys.js';
import { History } from '../history.js';
import { VERSION } from '../version.js';

let fails = 0;
function check(cond, label) {
  if (!cond) {
    fails++;
    console.log('FAIL', label);
  }
}
const eq = (a, b, label) => check(a === b, `${label}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const near = (a, b, label) => check(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${label}: got ${a} want ${b}`);

// Types keys: digits, '.', 'E' = EEX, '~' = CHS, ' ' = ENTER.
function type(c, s) {
  for (const ch of s) {
    if (ch === '.') c.point();
    else if (ch === 'E') c.eex();
    else if (ch === '~') c.chs();
    else if (ch === ' ') c.exec('ENTER');
    else c.digit(ch);
  }
}
const X = (c) => c.s.stk[0];

{ // basic stack arithmetic and lift
  const c = new RpnCalc();
  type(c, '3 4'); c.exec('ADD'); eq(X(c), 7, '3+4');
  type(c, '2'); c.exec('MUL'); eq(X(c), 14, 'lift after result');
  type(c, '0.1 0.2'); c.exec('ADD'); eq(c.xText(), '0.3', '0.1+0.2 shown as 0.3');
  c.exec('CLR');
  type(c, '10 4'); c.exec('SUB'); eq(X(c), 6, '10-4');
  type(c, '4'); c.exec('DIV'); eq(X(c), 1.5, '6/4');
}
{ // entry: decimal point, EEX, CHS, backspace
  const c = new RpnCalc();
  type(c, '2.1E5'); eq(c.xText(), '2.1E5', 'eex text'); eq(X(c), 210000, 'eex value');
  type(c, '~'); eq(c.xText(), '2.1E-5', 'chs in exponent'); eq(X(c), 2.1e-5, 'neg exponent');
  c.backspace(); eq(c.xText(), '2.1E-', 'bs exponent digit');
  c.backspace(); eq(c.xText(), '2.1', 'bs E');
  type(c, '~'); eq(X(c), -2.1, 'chs mantissa');
  c.exec('CLR');
  type(c, 'E3'); eq(X(c), 1000, 'EEX alone means 1E');
  c.exec('CLR');
  type(c, '.5'); eq(c.xText(), '0.5', 'leading point'); eq(X(c), 0.5, '.5');
  check(!c.point(), 'second point ignored');
  type(c, '1E999'); // exponent capped at 3 digits and finite
  check(Number.isFinite(X(c)), 'overflow rejected');
  c.exec('CLR');
  type(c, '5'); c.backspace(); check(!c.entering && X(c) === 0, 'bs to empty = CLX');
}
{ // unary functions
  const c = new RpnCalc();
  type(c, '4'); c.exec('INV'); eq(X(c), 0.25, '1/x');
  type(c, '3'); c.exec('SQ'); eq(X(c), 9, 'x^2');
  c.exec('SQRT'); eq(X(c), 3, 'sqrt');
  type(c, '0'); check(!c.exec('INV') && c.msg === 'Divide by 0', '1/0');
  eq(X(c), 0, '1/0 leaves X');
  c.exec('CLX'); type(c, '2~'); check(!c.exec('SQRT'), 'sqrt(-2)');
  c.exec('CLX'); type(c, '1000'); c.exec('LOG'); eq(X(c), 3, 'log');
  c.exec('EXP10'); eq(X(c), 1000, '10^x');
  type(c, '1'); c.exec('EXP'); near(X(c), Math.E, 'e^x');
  c.exec('LN'); near(X(c), 1, 'ln');
  c.exec('CLX'); check(!c.exec('LN'), 'ln 0');
}
{ // trig in degrees with exact values
  const c = new RpnCalc();
  const t = (v, op) => { c.exec('CLR'); type(c, String(v)); c.exec(op); return X(c); };
  eq(t(30, 'SIN'), 0.5, 'sin30');
  eq(t(180, 'SIN'), 0, 'sin180 exact');
  eq(t(90, 'COS'), 0, 'cos90 exact');
  eq(t(60, 'COS'), 0.5, 'cos60');
  eq(t(45, 'TAN'), 1, 'tan45');
  c.exec('CLR'); type(c, '90'); check(!c.exec('TAN') && c.msg === 'Undefined', 'tan90');
  near(t(37, 'SIN'), Math.sin(37 * Math.PI / 180), 'sin37');
  eq(formatNumber(t(0.5, 'ASIN')), '30', 'asin shown as 30');
  c.exec('CLR'); type(c, '2'); check(!c.exec('ACOS'), 'acos(2)');
  eq(formatNumber(t(1, 'ATAN')), '45', 'atan1');
  c.setDeg(false);
  c.exec('CLR'); c.exec('PI'); c.exec('COS'); eq(X(c), -1, 'cos pi rad');
}
{ // powers and roots
  const c = new RpnCalc();
  type(c, '2 10'); c.exec('POW'); eq(X(c), 1024, '2^10');
  c.exec('CLR'); type(c, '27 3'); c.exec('ROOT'); near(X(c), 3, '3rd root 27');
  c.exec('CLR'); type(c, '8~ 3'); c.exec('ROOT'); near(X(c), -2, 'cube root -8');
  c.exec('CLR'); type(c, '16~ 2'); check(!c.exec('ROOT'), 'sqrt root -16');
  c.exec('CLR'); type(c, '5 0'); check(!c.exec('ROOT'), '0th root');
  c.exec('CLR'); type(c, '0 1~'); check(!c.exec('POW'), '0^-1');
}
{ // percent keeps Y
  const c = new RpnCalc();
  type(c, '200 15'); c.exec('PCT'); eq(X(c), 30, '15% of 200'); eq(c.s.stk[1], 200, 'Y kept');
  c.exec('ADD'); eq(X(c), 230, 'add percent');
  c.exec('CLR'); type(c, '80 100'); c.exec('DPCT'); eq(X(c), 25, 'delta %');
}
{ // stack ops, LASTX, PI, undo
  const c = new RpnCalc();
  type(c, '1 2 3 4');
  c.exec('RDN'); eq(c.s.stk.join(), '3,2,1,4', 'rdn');
  c.exec('RUP'); eq(c.s.stk.join(), '4,3,2,1', 'rup');
  c.exec('SWAP'); eq(c.s.stk.join(), '3,4,2,1', 'swap');
  c.backspace(); eq(c.s.stk.join(), '4,2,1,1', 'drop');
  c.exec('CLR');
  type(c, '9 3'); c.exec('DIV'); c.exec('LASTX'); eq(X(c), 3, 'lastx'); eq(c.s.stk[1], 3, 'lastx lifts');
  c.exec('CLR');
  type(c, '2'); c.exec('PI'); eq(c.s.stk[1], 2, 'pi lifts'); c.exec('MUL'); near(X(c), 2 * Math.PI, '2pi');
  const snap = c.snapshot();
  c.exec('SQ');
  c.restore(snap); near(X(c), 2 * Math.PI, 'undo');
}
{ // diameter/radius toggle cycles x2, x0.5, x1 of the original value
  const c = new RpnCalc();
  type(c, '25');
  c.drCycle(); eq(X(c), 50, 'dr x2'); eq(c.drFactor(), 2, 'factor 2');
  c.drCycle(); eq(X(c), 12.5, 'dr x0.5');
  c.drCycle(); eq(X(c), 25, 'dr x1');
  c.drCycle(); eq(X(c), 50, 'dr wraps');
  eq(c.s.lastX, 0, 'dr leaves lastX');
  c.exec('ENTER'); eq(c.drFactor(), null, 'other key ends cycle');
  c.drCycle(); eq(X(c), 100, 'new base after other key');
  c.exec('CLR'); type(c, '10'); c.drCycle(); type(c, '3');
  eq(c.s.stk[1], 20, 'typing after dr lifts'); eq(X(c), 3, 'typed value');
  c.drCycle(); eq(X(c), 6, 'dr on typed entry');
  const snap = c.snapshot(); c.drCycle(); c.restore(snap);
  eq(X(c), 6, 'undo dr'); c.drCycle(); eq(X(c), 12, 'restart after undo');
}
{ // arc length: Y = diameter mm, X = angle deg
  const c = new RpnCalc();
  type(c, '100 90'); c.exec('ARC'); near(X(c), 25 * Math.PI, 'arc 90deg');
  eq(c.s.lastX, 90, 'arc lastx');
  c.exec('CLR'); type(c, '50 360'); c.exec('ARC'); near(X(c), 50 * Math.PI, 'full circle');
  c.setDeg(false);
  c.exec('CLR'); type(c, '100 180'); c.exec('ARC'); near(X(c), 50 * Math.PI, 'arc ignores RAD mode');
  c.exec('CLR'); type(c, '1 2 3'); c.exec('ARC'); eq(c.s.stk[1], 1, 'arc drops stack');
  // SHIFT: angle from diameter and arc length
  c.exec('CLR'); type(c, '100'); c.exec('ENTER'); c.exec('PI'); type(c, '25'); c.exec('MUL'); c.exec('ARCANG');
  near(X(c), 90, 'angle from arc'); // arc of 90deg on D100 = 25*pi
  c.exec('CLR'); type(c, '0 10'); check(!c.exec('ARCANG') && c.msg === 'Divide by 0', 'angle with D=0');
  c.exec('CLR'); type(c, '80'); c.exec('ENTER'); type(c, '30'); c.exec('ARC'); const L = X(c);
  c.exec('CLR'); type(c, '80'); c.exec('ENTER'); c.recall(L); c.exec('ARCANG'); near(X(c), 30, 'arc -> angle round trip');
}
{ // formatting
  eq(formatNumber(1234567.891), '1,234,567.891', 'std group');
  eq(formatNumber(1234567.891, 'STD', 4, false), '1234567.891', 'std no group');
  eq(formatNumber(1 / 3), '0.333333333333', 'std 12 digits');
  eq(formatNumber(1e12), '1E12', 'std big -> sci');
  eq(formatNumber(1.5e-7), '0.00000015', 'std small stays decimal');
  eq(formatNumber(1e-8), '0.00000001', 'std 1e-8 decimal');
  eq(formatNumber(-2.5e-12), '-0.0000000000025', 'std negative tiny decimal');
  eq(formatNumber(1.23456789012345e-9), '0.00000000123456789012', 'std small 12 significant digits');
  eq(formatNumber(1e-15), '0.000000000000001', 'std 1e-15 still decimal');
  eq(formatNumber(1.5e-16), '1.5E-16', 'std below 1e-15 -> E');
  eq(formatFull(1e-8 / 3), '0.00000000333333333333333', 'full small decimal');
  eq(formatNumber(0.000123), '0.000123', 'std small fixed');
  eq(formatNumber(-0), '0', 'neg zero');
  eq(formatNumber(2 / 3, 'FIX', 2), '0.67', 'fix');
  eq(formatNumber(-0.001, 'FIX', 2), '0.00', 'fix no -0.00');
  eq(formatNumber(12345.678, 'FIX', 1), '12,345.7', 'fix group');
  eq(formatNumber(12345.678, 'SCI', 3), '1.235E4', 'sci');
  eq(formatNumber(12345.678, 'ENG', 3), '12.35E3', 'eng');
  eq(formatNumber(0.0047, 'ENG', 2), '4.70E-3', 'eng small');
  eq(formatNumber(999.96, 'ENG', 3), '1.000E3', 'eng carry');
  eq(formatNumber(42, 'ENG', 2), '42.0', 'eng no E0');
  eq(formatSI(0.0047), '4.7 m', 'si milli');
  eq(formatSI(205000), '205 k', 'si kilo');
  eq(formatSI(1e20), null, 'si out of range');
  eq(formatFull(0.1 + 0.2), '0.3', 'full rounds noise');
  eq(formatFull(1 / 3), '0.333333333333333', 'full 15 digits');
  eq(formatNumber(NaN), 'Error', 'nan');
}
{ // JSON round trip and validation
  const c = new RpnCalc();
  type(c, '1.5E3~'); c.setMode('ENG'); c.setDeg(false);
  const d = new RpnCalc();
  check(d.loadJSON(JSON.parse(JSON.stringify(c.toJSON()))), 'load');
  eq(d.s.stk[0], 1.5e-3, 'json x');
  eq(d.s.mode, 'ENG', 'json mode'); eq(d.s.deg, false, 'json rad');
  check(!d.loadJSON({ stk: ['ff', '0', '0', '0'], ws: 32 }), 'old programmer state rejected');
}

{ // history: undo/redo/jump across committed steps
  const c = new RpnCalc();
  const h = new History(100);
  h.clear(c.snapshot());
  // mimic app.js: entry edits touch, operations record
  const op = (name) => { const b = c.snapshot(); c.exec(name); h.record(b, c.snapshot(), name, ''); };
  const typ = (str) => { type(c, str); h.touch(); };
  typ('3'); op('ENTER'); typ('4'); op('ADD');   // 7
  typ('2'); op('MUL');                          // 14
  eq(X(c), 14, 'setup');
  check(h.canUndo() && !h.canRedo(), 'can undo only');
  c.restoreValues(h.undo()); eq(c.xText(), '2', 'undo MUL shows typed 2'); check(c.entering, 'still entering');
  c.restoreValues(h.undo()); eq(c.xText(), '4', 'undo ADD shows typed 4');
  c.restoreValues(h.redo()); eq(X(c), 7, 'redo ADD');
  c.restoreValues(h.redo()); eq(X(c), 14, 'redo MUL');
  check(!h.redo(), 'nothing to redo');
  c.restoreValues(h.jump(1)); eq(X(c), 3, 'jump after ENTER'); eq(c.s.stk[1], 3, 'jump stack');
  c.restoreValues(h.jump(0)); check(c.entering && c.xText() === '3', 'jump to start = before first op');
  c.restoreValues(h.jump(3));
  typ('9'); c.restoreValues(h.undo()); eq(X(c), 14, 'undo discards typing first');
  c.restoreValues(h.jump(1)); typ('5'); op('SUB'); // new branch drops redo tail
  eq(h.steps.length, 2, 'redo tail dropped'); eq(X(c), -2, '3-5');
  c.setMode('FIX'); c.restoreValues(h.undo()); eq(c.s.mode, 'FIX', 'undo keeps settings');
  const h2 = new History(100);
  check(h2.loadJSON(JSON.parse(JSON.stringify(h.toJSON())), c.snapshot()) && h2.steps.length === 2 && h2.i === 1, 'history json');
  const small = new History(3); small.clear(c.snapshot());
  for (let n = 0; n < 5; n++) small.record(c.snapshot(), c.snapshot(), 'x' + n, '');
  eq(small.steps.length, 3, 'limit'); eq(small.steps[0].expr, 'x2', 'oldest dropped');
  const a = new History(); a.clear(c.snapshot()); a.record(c.snapshot(), c.snapshot(), 'DR', '1');
  a.amendLast(c.snapshot(), 'DR', '2'); eq(a.steps.length, 1, 'amend keeps one step'); eq(a.steps[0].result, '2', 'amended');
}
{ // version in sw.js matches version.js
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  check(sw.includes(`'rpn-${VERSION}'`), `sw.js cache name must be rpn-${VERSION}`);
}

{ // every file the app loads is precached for offline use (sw.js FILES)
  const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const sw = read('sw.js');
  const files = JSON.parse(sw.slice(sw.indexOf('[', sw.indexOf('const FILES')), sw.indexOf('];', sw.indexOf('const FILES')) + 1).replace(/'/g, '"').replace(/,\s*]/, ']'));
  const needed = new Set();
  const local = (ref) => ref && !/^(https?:|data:|#|\/\/)/.test(ref);
  for (const m of read('index.html').matchAll(/(?:href|src)="([^"]+)"/g)) if (local(m[1])) needed.add(m[1]);
  const jsQueue = [...needed].filter((f) => f.endsWith('.js'));
  while (jsQueue.length) {
    const f = jsQueue.pop();
    for (const m of read(f).matchAll(/from '\.\/([^']+)'/g)) {
      if (!needed.has(m[1])) { needed.add(m[1]); jsQueue.push(m[1]); }
    }
  }
  for (const css of [...needed].filter((f) => f.endsWith('.css'))) {
    for (const m of read(css).matchAll(/url\(([^)]+)\)/g)) if (local(m[1].replace(/["']/g, ''))) needed.add(m[1].replace(/["']/g, ''));
  }
  for (const icon of JSON.parse(read('manifest.webmanifest')).icons) needed.add(icon.src);
  for (const f of needed) check(files.includes(f), `sw.js FILES is missing ${f}`);
  for (const f of files) {
    if (f === './') continue;
    let ok = true;
    try { readFileSync(new URL('../' + f, import.meta.url)); } catch { ok = false; }
    check(ok, `sw.js FILES lists ${f} but it does not exist`);
  }
}

{ // keys.js: one consistent definition per key
  const actions = LAYOUT.flat();
  eq(LAYOUT.length, 40, 'keypad is 5 x 8');
  for (const a of actions) check(KEY_INFO[a], `KEY_INFO has no entry for ${a}`);
  for (const a of Object.keys(KEY_INFO)) check(actions.includes(a), `${a} is defined but not on the keypad`);
  // actions handled by the app itself rather than by calc.exec()
  const appActions = new Set(['SHIFT', 'UNDO', 'BS', 'CHS', 'EEX', '.', 'DR', ...'0123456789']);
  for (const a of actions) {
    if (!appActions.has(a)) check(OPS.includes(a), `${a} is on the keypad but core.js has no such op`);
  }
  const pcKeys = Object.values(KEY_INFO).flatMap((i) => i.pc ?? []);
  eq(new Set(pcKeys).size, pcKeys.length, 'no PC key is assigned twice');
  eq(Object.keys(KEYMAP).length, pcKeys.length, 'KEYMAP covers every PC key');
  const sample = { x: '2', y: '3', deg: '°', base: '25', factor: '2.0' };
  for (const [a, info] of Object.entries(KEY_INFO)) {
    if (info.tape) check(!/undefined|null/.test(info.tape(sample)), `tape text for ${a}`);
  }
  for (const [title, rows] of helpSections()) check(rows.length > 0, `help section ${title} is empty`);
  const pcHelp = helpSections().find(([t]) => t === 'PC のキーボード')[1];
  check(pcHelp.some(([k, d]) => k === 'a' && d.includes('Shift+a で角度')), 'PC help mentions Shift+a');
}
{ // damaged saved history is skipped instead of breaking undo
  const c = new RpnCalc();
  const good = c.snapshot();
  const h = new History();
  const saved = { steps: [
    { before: good, after: good, expr: 'ok', result: '0' },
    { before: { s: {} }, after: good, expr: 'broken', result: '0' },
    { before: good, after: { s: { stk: [1, 2, 'x', 4] }, entry: [] }, expr: 'broken2', result: '0' },
  ], i: 3 };
  check(h.loadJSON(saved, good), 'loads');
  eq(h.steps.length, 1, 'broken steps dropped'); eq(h.i, 1, 'position clamped');
  check(h.undo() !== null, 'undo still works');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
