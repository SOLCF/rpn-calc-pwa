// Port of cardputer-rpn/test/host_test.cpp.  Run: node test/core.test.mjs
import { RpnCalc } from '../core.js';

let fails = 0;
function check(cond, label) {
  if (!cond) {
    fails++;
    console.log('FAIL', label);
  }
}
const type = (c, s) => { for (const ch of s) c.digit(ch); };
const X = (c) => c.xText();

{ // 3 ENTER 4 + -> 7, stack lift semantics
  const c = new RpnCalc();
  c.setBase(10);
  type(c, '3'); c.exec('ENTER'); type(c, '4'); c.exec('ADD');
  check(X(c) === '7', 'add');
  type(c, '2'); c.exec('MUL');
  check(X(c) === '14', 'lift after result');
  c.exec('ENTER'); c.exec('ENTER');
  check(c.s.stk[1] === 14n && c.s.stk[2] === 14n, 'dup');
}
{ // HEX entry, grouping, 32bit mask
  const c = new RpnCalc();
  type(c, 'deadbeef');
  check(X(c) === 'DEAD BEEF', 'hex entry');
  check(!c.digit('1'), 'hex overflow rejected');
  c.setBase(10);
  check(X(c) === '-559,038,737', 'signed dec');
  c.toggleSigned();
  check(X(c) === '3,735,928,559', 'unsigned dec');
  c.setBase(2); c.toggleGroup();
  check(X(c) === '11011110101011011011111011101111', 'bin');
}
{ // signed DEC entry range in 8 bit
  const c = new RpnCalc();
  c.setWordSize(8); c.setBase(10);
  type(c, '128');
  check(X(c) === '12', '128 rejected');
  c.digit('7');
  check(X(c) === '127', '127 ok');
  c.backspace(); c.backspace(); c.backspace();
  type(c, '128');
  c.chs(); c.digit('8');
  check(X(c) === '-128' && c.s.stk[0] === 0x80n, '-128');
  check(!c.chs(), '+128 rejected');
  c.exec('ENTER'); c.exec('NEG');
  check(c.s.overflow && X(c) === '-128', 'neg overflow');
}
{ // add carry / overflow
  const c = new RpnCalc();
  c.setWordSize(8);
  type(c, '7f'); c.exec('ENTER'); type(c, '1'); c.exec('ADD');
  check(X(c) === '80' && c.s.overflow && !c.s.carry, '7f+1');
  type(c, '80'); c.exec('ADD');
  check(X(c) === '0' && c.s.carry && c.s.overflow, '80+80');
  type(c, '1'); c.exec('SUB');
  check(X(c) === 'FF' && c.s.carry, '0-1 borrow');
}
{ // 64 bit unsigned add carry, mul overflow
  const c = new RpnCalc();
  c.setWordSize(64); c.toggleSigned();
  type(c, 'ffffffffffffffff'); c.exec('ENTER'); type(c, '2'); c.exec('ADD');
  check(X(c) === '1' && c.s.carry, '64 carry');
  type(c, '100000000'); c.exec('ENTER'); c.exec('MUL');
  check(X(c) === '0' && c.s.overflow, '64 mul overflow');
  c.setBase(10); c.exec('CLR');
  type(c, '18446744073709551615');
  check(X(c) === '18,446,744,073,709,551,615', 'u64 max');
  check(!c.digit('0'), 'u64 overflow');
}
{ // signed division, INT_MIN / -1, divide by zero
  const c = new RpnCalc();
  c.setBase(10);
  type(c, '7'); c.chs(); c.exec('ENTER'); type(c, '2'); c.exec('DIV');
  check(X(c) === '-3' && c.s.carry, '-7/2');
  type(c, '0');
  check(!c.exec('DIV') && c.msg, 'div0');
  c.exec('CLR'); c.setWordSize(64);
  type(c, '1'); c.exec('ENTER'); type(c, '63'); c.exec('SHL');
  check(X(c) === '-9,223,372,036,854,775,808', 'int64 min');
  type(c, '1'); c.chs(); c.exec('DIV');
  check(X(c) === '-9,223,372,036,854,775,808' && c.s.overflow, 'min/-1');
  c.exec('ENTER'); type(c, '1'); c.chs(); c.exec('MOD');
  check(X(c) === '0', 'min%-1');
  c.exec('CLR');
  type(c, '7'); c.chs(); c.exec('ENTER'); type(c, '3'); c.exec('MOD');
  check(X(c) === '-1', '-7%3');
}
{ // shifts and rotates (16 bit)
  const c = new RpnCalc();
  c.setWordSize(16);
  const t = (a, n, op) => { type(c, a); c.exec('ENTER'); type(c, n); c.exec(op); };
  t('8001', '1', 'SHL'); check(X(c) === '2' && c.s.carry, 'shl');
  t('8001', '1', 'ROL'); check(X(c) === '3' && c.s.carry, 'rol');
  t('8001', '1', 'ROR'); check(X(c) === 'C000' && c.s.carry, 'ror');
  t('8000', '4', 'SHR'); check(X(c) === 'F800', 'asr');
  c.toggleSigned();
  t('8000', '4', 'SHR'); check(X(c) === '800', 'lsr');
  t('ffff', '10', 'SHL'); check(X(c) === '0' && c.s.carry, 'shl 16');
  t('1234', '14', 'ROL'); check(X(c) === '2341', 'rol 20');
}
{ // 64-bit shifts/rotates edge
  const c = new RpnCalc();
  c.setWordSize(64);
  type(c, '1'); c.exec('ENTER'); type(c, '40'); c.exec('SHL');
  check(X(c) === '0' && c.s.carry, 'shl 64');
  type(c, '8000000000000001'); c.exec('ENTER'); type(c, '4'); c.exec('ROR');
  check(X(c) === '1800 0000 0000 0000', 'ror 64');
}
{ // bit ops, popcount, NOT, LASTX
  const c = new RpnCalc();
  c.setWordSize(8);
  type(c, 'f0'); c.exec('ENTER'); type(c, '3c'); c.exec('AND');
  check(X(c) === '30', 'and');
  type(c, '0f'); c.exec('OR'); check(X(c) === '3F', 'or');
  type(c, 'ff'); c.exec('XOR'); check(X(c) === 'C0', 'xor');
  c.exec('NOT'); check(X(c) === '3F', 'not');
  c.exec('POPCNT'); check(X(c) === '6', 'popcnt');
  c.exec('LASTX'); check(X(c) === '3F' && c.s.stk[1] === 6n, 'lastx');
}
{ // stack manipulation
  const c = new RpnCalc();
  type(c, '1'); c.exec('ENTER'); type(c, '2'); c.exec('ENTER');
  type(c, '3'); c.exec('ENTER'); type(c, '4');
  c.exec('RDN');
  const k = () => c.s.stk.map(Number).join(',');
  check(k() === '3,2,1,4', 'rdn');
  c.exec('RUP'); check(k() === '4,3,2,1', 'rup');
  c.exec('SWAP'); check(k() === '3,4,2,1', 'swap');
  c.backspace(); check(k() === '4,2,1,1', 'drop');
  c.exec('CLX'); type(c, '9'); check(k() === '9,2,1,1', 'clx no lift');
}
{ // backspace during entry
  const c = new RpnCalc();
  type(c, '5'); c.exec('ENTER'); type(c, '12');
  c.backspace(); check(X(c) === '1', 'bs');
  c.backspace(); check(!c.entering && X(c) === '0', 'bs empty');
  type(c, '7'); c.exec('ADD'); check(X(c) === 'C', 'bs then add');
}
{ // word size change keeps signed values
  const c = new RpnCalc();
  c.setWordSize(8); c.setBase(10);
  type(c, '5'); c.chs();
  c.setWordSize(32); check(X(c) === '-5', 'sign extend');
  c.setBase(16); check(X(c) === 'FFFF FFFB', 'hex -5');
  c.setWordSize(16); check(X(c) === 'FFFB', 'truncate');
  c.toggleSigned(); c.setWordSize(32); check(X(c) === 'FFFB', 'unsigned zero-extend');
}
{ // invalid digit, undo snapshot, bit toggle
  const c = new RpnCalc();
  c.setBase(8); check(!c.digit('8'), 'oct 8');
  c.setBase(2); check(!c.digit('2'), 'bin 2');
  type(c, '101');
  const snap = c.snapshot();
  c.exec('NOT');
  c.restore(snap);
  check(c.entering && X(c) === '101', 'undo');
  c.digit('1'); check(X(c) === '1011', 'continue entry');
  c.toggleBit(4); check(X(c) === '1 1011' && !c.entering, 'toggle bit');
  check(!c.toggleBit(32), 'toggle out of range');
}
{ // JSON round trip and validation
  const c = new RpnCalc();
  c.setWordSize(64); type(c, 'fedcba9876543210');
  const json = JSON.parse(JSON.stringify(c.toJSON()));
  const d = new RpnCalc();
  check(d.loadJSON(json) && d.s.stk[0] === 0xfedcba9876543210n, 'json round trip');
  check(!d.loadJSON({ ...json, ws: 12 }), 'bad ws');
  check(!d.loadJSON({ ...json, stk: ['zz', '0', '0', '0'] }), 'bad hex');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
