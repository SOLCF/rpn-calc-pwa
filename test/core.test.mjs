// Run: node test/core.test.mjs
import { RpnCalc, formatNumber, formatSI, formatFull } from '../core.js';

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
}
{ // formatting
  eq(formatNumber(1234567.891), '1,234,567.891', 'std group');
  eq(formatNumber(1234567.891, 'STD', 4, false), '1234567.891', 'std no group');
  eq(formatNumber(1 / 3), '0.333333333333', 'std 12 digits');
  eq(formatNumber(1e12), '1E12', 'std big -> sci');
  eq(formatNumber(1.5e-7), '1.5E-7', 'std small -> sci');
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

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
