// RPN scientific calculator core (decimal, IEEE double).
// HP style 4-level stack (X, Y, Z, T) with stack lift, LAST X, memories.

export const MODES = ['STD', 'FIX', 'SCI', 'ENG'];
export const NREG = 10;

const SI = { '-15': 'f', '-12': 'p', '-9': 'n', '-6': 'µ', '-3': 'm', 0: '', 3: 'k', 6: 'M', 9: 'G', 12: 'T' };

export function defaultState() {
  return {
    stk: [0, 0, 0, 0], // X, Y, Z, T
    lastX: 0,
    reg: new Array(NREG).fill(0),
    deg: true,
    mode: 'STD',
    digits: 4,
    group: true,
    lift: true,
  };
}

// ---------------------------------------------------------------- formatting

function exponentOf(v) {
  return parseInt(v.toExponential().split('e')[1], 10);
}

function groupInt(s, group) {
  if (!group) return s;
  const m = /^(-?)(\d+)(.*)$/.exec(s);
  if (!m) return s;
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + m[3];
}

function stripZeros(s) {
  // "1.2300" -> "1.23", "5.000" -> "5"
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function sci(v, d) {
  const [m, e] = v.toExponential(d).split('e');
  return `${m}E${parseInt(e, 10)}`;
}

// Mantissa/exponent with exponent a multiple of 3 and `sig` significant digits.
function engParts(v, sig) {
  let e3 = Math.floor(exponentOf(v) / 3) * 3;
  let m = (v / 10 ** e3).toPrecision(sig);
  if (Math.abs(parseFloat(m)) >= 1000) { // rounding carried over (999.96 -> 1000)
    e3 += 3;
    m = (v / 10 ** e3).toPrecision(sig);
  }
  return [m, e3];
}

export function formatNumber(v, mode = 'STD', digits = 4, group = true) {
  if (!Number.isFinite(v)) return 'Error';
  if (v === 0) v = 0; // drop -0
  switch (mode) {
    case 'FIX': {
      if (Math.abs(v) >= 1e15) return sci(v, digits);
      let s = v.toFixed(digits);
      if (/^-0\.?0*$/.test(s)) s = s.slice(1);
      return groupInt(s, group);
    }
    case 'SCI':
      return sci(v, digits);
    case 'ENG': {
      if (v === 0) return (0).toFixed(digits);
      const [m, e3] = engParts(v, digits + 1);
      return e3 === 0 ? m : `${m}E${e3}`;
    }
    default: { // STD: 12 significant digits, trailing zeros removed
      if (v === 0) return '0';
      const e = exponentOf(Number(v.toPrecision(12)));
      if (e >= 12 || e < -6) {
        const [m, ex] = v.toExponential(11).split('e');
        return `${stripZeros(m)}E${parseInt(ex, 10)}`;
      }
      return groupInt(stripZeros(Number(v.toPrecision(12)).toFixed(Math.max(0, 11 - e))), group);
    }
  }
}

// "12.35 k" style; null when outside the SI prefix range.
export function formatSI(v) {
  if (!Number.isFinite(v) || v === 0) return null;
  const [m, e3] = engParts(v, 4);
  if (!(String(e3) in SI)) return null;
  return `${stripZeros(m)} ${SI[e3]}`.trim();
}

// Full precision for the "≈" line.
export function formatFull(v) {
  if (!Number.isFinite(v)) return 'Error';
  if (v === 0) return '0';
  const p = Number(v.toPrecision(15));
  const e = exponentOf(p);
  if (e >= 15 || e < -6) {
    const [m, ex] = v.toExponential(14).split('e');
    return `${stripZeros(m)}E${parseInt(ex, 10)}`;
  }
  return stripZeros(p.toFixed(Math.max(0, 14 - e)));
}

// ---------------------------------------------------------------- trig

const D2R = Math.PI / 180;

function norm360(d) {
  return ((d % 360) + 360) % 360;
}

// Exact values at multiples of 30 deg so sin(180) is 0, not 1.2e-16.
function sinDeg(d) {
  const r = norm360(d);
  const exact = { 0: 0, 30: 0.5, 90: 1, 150: 0.5, 180: 0, 210: -0.5, 270: -1, 330: -0.5 };
  if (r in exact) return exact[r];
  return Math.sin(d * D2R);
}

function cosDeg(d) {
  const r = norm360(d);
  const exact = { 0: 1, 60: 0.5, 90: 0, 120: -0.5, 180: -1, 240: -0.5, 270: 0, 300: 0.5 };
  if (r in exact) return exact[r];
  return Math.cos(d * D2R);
}

function tanDeg(d) {
  const r = norm360(d) % 180;
  if (r === 0) return 0;
  if (r === 90) return NaN;
  if (r === 45) return 1;
  if (r === 135) return -1;
  return Math.tan(d * D2R);
}

// ---------------------------------------------------------------- calculator

const UNARY = {
  INV: (x) => 1 / x,
  SQ: (x) => x * x,
  SQRT: (x) => Math.sqrt(x),
  LOG: (x) => (x > 0 ? Math.log10(x) : NaN),
  LN: (x) => (x > 0 ? Math.log(x) : NaN),
  EXP10: (x) => 10 ** x,
  EXP: (x) => Math.exp(x),
  NEG: (x) => -x,
};

const BINARY = {
  ADD: (y, x) => y + x,
  SUB: (y, x) => y - x,
  MUL: (y, x) => y * x,
  DIV: (y, x) => (x === 0 ? NaN : y / x),
  POW: (y, x) => (y === 0 && x < 0 ? NaN : y ** x),
  ROOT: (y, x) => { // x-th root of y; odd roots of negatives are real
    if (x === 0) return NaN;
    if (y < 0 && Number.isInteger(x) && Math.abs(x) % 2 === 1) return -((-y) ** (1 / x));
    return y ** (1 / x);
  },
};

const ERRORS = {
  DIV: 'Divide by 0', INV: 'Divide by 0', SQRT: 'Invalid input', LOG: 'Invalid input',
  LN: 'Invalid input', ASIN: 'Invalid input', ACOS: 'Invalid input', TAN: 'Undefined',
  ROOT: 'Invalid input', POW: 'Invalid input',
};

export class RpnCalc {
  constructor() {
    this.reset();
  }

  reset() {
    this.s = defaultState();
    this.clearEntry();
    this.msg = null;
  }

  clearEntry() {
    this.entering = false;
    this.mant = '';      // digits and '.'
    this.expo = null;    // null = no EEX yet, else exponent digits
    this.neg = false;
    this.expNeg = false;
  }

  fail(m) {
    this.msg = m;
    return false;
  }

  push() {
    const k = this.s.stk;
    k[3] = k[2];
    k[2] = k[1];
    k[1] = k[0];
  }

  finishEntry() {
    if (!this.entering) return;
    this.clearEntry();
    this.s.lift = true;
  }

  entryText() {
    let t = (this.neg ? '-' : '') + (this.mant || '0');
    if (this.expo !== null) t += 'E' + (this.expNeg ? '-' : '') + this.expo;
    return t;
  }

  entryValue() {
    let t = (this.neg ? '-' : '') + (this.mant || '0');
    if (this.mant === '.') t = (this.neg ? '-' : '') + '0';
    if (this.expo) t += 'e' + (this.expNeg ? '-' : '') + this.expo;
    return parseFloat(t);
  }

  startEntry() {
    if (this.entering) return;
    if (this.s.lift) this.push();
    this.clearEntry();
    this.entering = true;
  }

  // Applies an edit to the entry; rolls back if the value stops being finite.
  editEntry(fn) {
    const saved = [this.mant, this.expo, this.neg, this.expNeg];
    fn();
    const v = this.entryValue();
    if (!Number.isFinite(v)) {
      [this.mant, this.expo, this.neg, this.expNeg] = saved;
      return this.fail('Overflow');
    }
    this.s.stk[0] = v;
    return true;
  }

  digit(c) {
    this.msg = null;
    if (!/^[0-9]$/.test(c)) return this.fail('Bad digit');
    this.startEntry();
    if (this.expo !== null) {
      if (this.expo.length >= 3) return this.fail('Too long');
      return this.editEntry(() => { this.expo += c; });
    }
    if (this.mant.replace('.', '').length >= 15) return this.fail('Too long');
    return this.editEntry(() => {
      this.mant = this.mant === '0' ? c : this.mant + c;
    });
  }

  point() {
    this.msg = null;
    this.startEntry();
    if (this.expo !== null || this.mant.includes('.')) return false;
    return this.editEntry(() => { this.mant = (this.mant || '0') + '.'; });
  }

  eex() {
    this.msg = null;
    this.startEntry();
    if (this.expo !== null) return false;
    return this.editEntry(() => {
      if (!this.mant || /^0?\.?0*$/.test(this.mant)) this.mant = '1';
      this.expo = '';
    });
  }

  backspace() {
    this.msg = null;
    if (!this.entering) return this.exec('DROP');
    if (this.expo !== null) {
      if (this.expo === '') {
        this.expo = null;
        this.expNeg = false;
      } else {
        this.expo = this.expo.slice(0, -1);
      }
    } else {
      this.mant = this.mant.slice(0, -1);
      if (this.mant === '' || this.mant === '0') {
        // Same as CLX: X=0 and the next number overwrites it.
        this.clearEntry();
        this.s.stk[0] = 0;
        this.s.lift = false;
        return true;
      }
    }
    this.s.stk[0] = this.entryValue();
    return true;
  }

  chs() {
    this.msg = null;
    if (this.entering) {
      return this.editEntry(() => {
        if (this.expo !== null) this.expNeg = !this.expNeg;
        else this.neg = !this.neg;
      });
    }
    return this.exec('NEG');
  }

  trig(op, x) {
    const deg = this.s.deg;
    switch (op) {
      case 'SIN': return deg ? sinDeg(x) : Math.sin(x);
      case 'COS': return deg ? cosDeg(x) : Math.cos(x);
      case 'TAN': return deg ? tanDeg(x) : Math.tan(x);
      case 'ASIN': return Math.asin(x) / (deg ? D2R : 1);
      case 'ACOS': return Math.acos(x) / (deg ? D2R : 1);
      case 'ATAN': return Math.atan(x) / (deg ? D2R : 1);
    }
    return NaN;
  }

  exec(op) {
    this.finishEntry();
    this.msg = null;
    const s = this.s;
    const k = s.stk;
    const x = k[0], y = k[1];
    let r;
    switch (op) {
      case 'ENTER':
        this.push();
        s.lift = false;
        return true;
      case 'SWAP':
        k[0] = y;
        k[1] = x;
        break;
      case 'RDN':
        k[0] = k[1]; k[1] = k[2]; k[2] = k[3]; k[3] = x;
        break;
      case 'RUP':
        k[0] = k[3]; k[3] = k[2]; k[2] = k[1]; k[1] = x;
        break;
      case 'DROP':
        k[0] = k[1]; k[1] = k[2]; k[2] = k[3];
        break;
      case 'CLX':
        k[0] = 0;
        s.lift = false;
        return true;
      case 'CLR':
        k.fill(0);
        s.lift = false;
        return true;
      case 'LASTX':
        return this.recall(s.lastX);
      case 'PI':
        return this.recall(Math.PI);
      case 'PCT':   // Y stays: X = Y * X / 100
      case 'DPCT':  // Y stays: X = (X - Y) / Y * 100
        r = op === 'PCT' ? (y * x) / 100 : y === 0 ? NaN : ((x - y) / y) * 100;
        if (!Number.isFinite(r)) return this.fail(op === 'DPCT' ? 'Divide by 0' : 'Overflow');
        s.lastX = x;
        k[0] = r;
        break;
      default:
        if (op in UNARY || ['SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN'].includes(op)) {
          r = op in UNARY ? UNARY[op](x) : this.trig(op, x);
          if (!Number.isFinite(r)) return this.fail(ERRORS[op] || 'Overflow');
          s.lastX = x;
          k[0] = r === 0 ? 0 : r;
        } else if (op in BINARY) {
          r = BINARY[op](y, x);
          if (!Number.isFinite(r)) return this.fail(ERRORS[op] || 'Overflow');
          s.lastX = x;
          k[0] = r === 0 ? 0 : r;
          k[1] = k[2];
          k[2] = k[3];
        } else {
          return this.fail('?');
        }
    }
    s.lift = true;
    return true;
  }

  // Puts a value into X like typing it (lifts the stack if enabled).
  recall(v) {
    if (this.s.lift) this.push();
    this.s.stk[0] = v;
    this.s.lift = true;
    return true;
  }

  sto(n) {
    this.finishEntry();
    this.msg = null;
    if (!(n >= 0 && n < NREG)) return this.fail('Bad register');
    this.s.reg[n] = this.s.stk[0];
    this.s.lift = true;
    return true;
  }

  rcl(n) {
    this.finishEntry();
    this.msg = null;
    if (!(n >= 0 && n < NREG)) return this.fail('Bad register');
    return this.recall(this.s.reg[n]);
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return this.fail('Bad mode');
    this.finishEntry();
    this.msg = null;
    this.s.mode = mode;
    return true;
  }

  setDigits(d) {
    if (!(d >= 0 && d <= 10)) return false;
    this.finishEntry();
    this.msg = null;
    this.s.digits = d;
    return true;
  }

  setDeg(deg) {
    this.finishEntry();
    this.msg = null;
    this.s.deg = deg;
    return true;
  }

  toggleGroup() {
    this.msg = null;
    this.s.group = !this.s.group;
    return true;
  }

  format(v) {
    return formatNumber(v, this.s.mode, this.s.digits, this.s.group);
  }

  xText() {
    return this.entering ? this.entryText() : this.format(this.s.stk[0]);
  }

  snapshot() {
    return {
      s: { ...this.s, stk: [...this.s.stk], reg: [...this.s.reg] },
      entry: [this.entering, this.mant, this.expo, this.neg, this.expNeg],
    };
  }

  restore(snap) {
    this.s = { ...snap.s, stk: [...snap.s.stk], reg: [...snap.s.reg] };
    [this.entering, this.mant, this.expo, this.neg, this.expNeg] = snap.entry;
    this.msg = null;
  }

  toJSON() {
    return { v: 2, ...this.s };
  }

  loadJSON(o) {
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    if (!o || o.v !== 2 || !Array.isArray(o.stk) || o.stk.length !== 4) return false;
    this.reset();
    const s = this.s;
    s.stk = o.stk.map(num);
    s.lastX = num(o.lastX);
    if (Array.isArray(o.reg)) s.reg = s.reg.map((_, i) => num(o.reg[i]));
    s.deg = o.deg !== false;
    s.mode = MODES.includes(o.mode) ? o.mode : 'STD';
    s.digits = Number.isInteger(o.digits) && o.digits >= 0 && o.digits <= 10 ? o.digits : 4;
    s.group = o.group !== false;
    s.lift = o.lift !== false;
    return true;
  }
}
