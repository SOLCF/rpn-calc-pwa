// RPN programmer's calculator core. Port of cardputer-rpn/src/rpn_core.cpp
// using BigInt for 64-bit words. HP-16C style 4-level stack.

export const BASES = [16, 10, 8, 2];
export const SIZES = [8, 16, 32, 64];

const DIGITS = '0123456789ABCDEF';

function groupDigits(digits, base) {
  const n = base === 10 || base === 8 ? 3 : 4;
  const sep = base === 10 ? ',' : ' ';
  let out = '';
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    if (i > 0 && (len - i) % n === 0) out += sep;
    out += digits[i];
  }
  return out;
}

function digitValue(c) {
  const d = DIGITS.indexOf(c.toUpperCase());
  return c.length === 1 ? d : -1;
}

export function defaultState() {
  return {
    stk: [0n, 0n, 0n, 0n], // X, Y, Z, T
    lastX: 0n,
    ws: 32,
    base: 16,
    sgn: true,
    group: true,
    carry: false,
    overflow: false,
    lift: true,
  };
}

export class RpnCalc {
  constructor() {
    this.reset();
  }

  reset() {
    this.s = defaultState();
    this.entry = '';
    this.entering = false;
    this.entryNeg = false;
    this.msg = null;
  }

  get mask() { return (1n << BigInt(this.s.ws)) - 1n; }
  get signBit() { return 1n << BigInt(this.s.ws - 1); }

  // Interpret as signed in the current word size (when signed mode).
  sx(v) {
    v &= this.mask;
    if (this.s.sgn && (v & this.signBit)) v -= 1n << BigInt(this.s.ws);
    return v;
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
    this.entering = false;
    this.entryNeg = false;
    this.entry = '';
    this.s.lift = true;
  }

  // Parsed entry value with range check, or null if it does not fit.
  parseEntry() {
    let limit = this.mask;
    if (this.s.base === 10 && this.s.sgn) limit = this.entryNeg ? this.signBit : this.signBit - 1n;
    let v = 0n;
    const b = BigInt(this.s.base);
    for (const c of this.entry) v = v * b + BigInt(digitValue(c));
    if (v > limit) return null;
    return this.entryNeg ? (-v) & this.mask : v;
  }

  digit(c) {
    this.msg = null;
    const d = digitValue(c);
    if (d < 0 || d >= this.s.base) return this.fail('Bad digit');
    if (!this.entering) {
      if (this.s.lift) this.push();
      this.entering = true;
      this.entryNeg = false;
      this.entry = '';
    }
    const prev = this.entry;
    if (this.entry === '0') this.entry = ''; // no leading zeros
    this.entry += DIGITS[d];
    const v = this.parseEntry();
    if (v === null) {
      this.entry = prev;
      return this.fail('Too big');
    }
    this.s.stk[0] = v;
    return true;
  }

  backspace() {
    this.msg = null;
    if (!this.entering) return this.exec('DROP');
    this.entry = this.entry.slice(0, -1);
    if (this.entry === '') {
      // Same as CLX: X=0 and the next number overwrites it.
      this.entering = false;
      this.entryNeg = false;
      this.s.stk[0] = 0n;
      this.s.lift = false;
      return true;
    }
    this.s.stk[0] = this.parseEntry();
    return true;
  }

  chs() {
    this.msg = null;
    if (this.entering && this.s.base === 10 && this.s.sgn) {
      this.entryNeg = !this.entryNeg;
      const v = this.parseEntry();
      if (v === null) {
        this.entryNeg = !this.entryNeg;
        return this.fail('Too big');
      }
      this.s.stk[0] = v;
      return true;
    }
    return this.exec('NEG');
  }

  // Shift/rotate count from X. Negative counts are rejected in signed mode.
  count(x) {
    if (this.s.sgn && (x & this.signBit)) return this.fail('Bad count') || null;
    return x;
  }

  binary(op, y, x) {
    const s = this.s;
    const m = this.mask;
    const sb = this.signBit;
    const ws = BigInt(s.ws);
    let r, n;
    switch (op) {
      case 'ADD': {
        const sum = y + x;
        r = sum & m;
        s.carry = sum > m;
        s.overflow = ((~(y ^ x)) & (y ^ r) & sb) !== 0n;
        return r;
      }
      case 'SUB':
        r = (y - x) & m;
        s.carry = y < x; // borrow
        s.overflow = ((y ^ x) & (y ^ r) & sb) !== 0n;
        return r;
      case 'MUL': {
        if (s.sgn) {
          const p = this.sx(y) * this.sx(x);
          s.overflow = p < -sb || p > sb - 1n;
          r = p & m;
        } else {
          const p = y * x;
          s.overflow = p > m;
          r = p & m;
        }
        s.carry = false;
        return r;
      }
      case 'DIV':
      case 'MOD': {
        if (x === 0n) return this.fail('Divide by 0') || null;
        s.overflow = false;
        if (s.sgn) {
          const a = this.sx(y), b = this.sx(x);
          // BigInt division truncates toward zero like C.
          const q = a / b;
          const rem = a % b;
          s.overflow = op === 'DIV' && b === -1n && y === sb;
          s.carry = rem !== 0n;
          return (op === 'DIV' ? q : rem) & m;
        }
        s.carry = y % x !== 0n;
        return op === 'DIV' ? y / x : y % x;
      }
      case 'AND': return y & x;
      case 'OR': return y | x;
      case 'XOR': return y ^ x;
      case 'SHL':
        if ((n = this.count(x)) === null) return null;
        if (n === 0n) { s.carry = false; return y; }
        s.carry = n <= ws ? ((y >> (ws - n)) & 1n) === 1n : false;
        return n >= ws ? 0n : (y << n) & m;
      case 'SHR':
        if ((n = this.count(x)) === null) return null;
        if (n === 0n) { s.carry = false; return y; }
        if (s.sgn) { // arithmetic shift
          const a = this.sx(y);
          if (n >= ws) {
            s.carry = n === ws ? ((y >> (ws - 1n)) & 1n) === 1n : a < 0n;
            return a < 0n ? m : 0n;
          }
          s.carry = ((y >> (n - 1n)) & 1n) === 1n;
          return (a >> n) & m;
        }
        s.carry = n <= ws ? ((y >> (n - 1n)) & 1n) === 1n : false;
        return n >= ws ? 0n : y >> n;
      case 'ROL':
      case 'ROR':
        if ((n = this.count(x)) === null) return null;
        n %= ws;
        if (n === 0n) return y;
        if (op === 'ROL') {
          r = ((y << n) | (y >> (ws - n))) & m;
          s.carry = (r & 1n) === 1n;
        } else {
          r = ((y >> n) | (y << (ws - n))) & m;
          s.carry = ((r >> (ws - 1n)) & 1n) === 1n;
        }
        return r;
      default:
        return this.fail('?') || null;
    }
  }

  exec(op) {
    this.finishEntry();
    this.msg = null;
    const s = this.s;
    const k = s.stk;
    const m = this.mask;
    const x = k[0], y = k[1];
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
        k[0] = 0n;
        s.lift = false;
        return true;
      case 'CLR':
        k[0] = k[1] = k[2] = k[3] = 0n;
        s.carry = s.overflow = false;
        s.lift = false;
        return true;
      case 'LASTX':
        if (s.lift) this.push();
        k[0] = s.lastX;
        break;
      case 'NOT':
        s.lastX = x;
        k[0] = ~x & m;
        break;
      case 'NEG':
        s.lastX = x;
        k[0] = (-x) & m;
        s.overflow = s.sgn && x === this.signBit;
        break;
      case 'POPCNT': {
        s.lastX = x;
        let c = 0n;
        for (let v = x; v; v &= v - 1n) c++;
        k[0] = c;
        break;
      }
      default: { // binary: X = Y op X, stack drops
        const r = this.binary(op, y, x);
        if (r === null) return false;
        s.lastX = x;
        k[0] = r;
        k[1] = k[2];
        k[2] = k[3];
      }
    }
    s.lift = true;
    return true;
  }

  // Flip bit n of X (touch on the bit view).
  toggleBit(n) {
    this.finishEntry();
    this.msg = null;
    if (n < 0 || n >= this.s.ws) return false;
    this.s.stk[0] ^= 1n << BigInt(n);
    this.s.lift = true;
    return true;
  }

  setBase(b) {
    if (!BASES.includes(b)) return this.fail('Bad base');
    this.finishEntry();
    this.msg = null;
    this.s.base = b;
    return true;
  }

  cycleBase() {
    return this.setBase(BASES[(BASES.indexOf(this.s.base) + 1) % 4]);
  }

  setWordSize(ws) {
    if (!SIZES.includes(ws)) return this.fail('Bad size');
    this.finishEntry();
    this.msg = null;
    const nm = (1n << BigInt(ws)) - 1n;
    // Signed values keep their numeric value (sign-extend / truncate).
    this.s.stk = this.s.stk.map((v) => this.sx(v) & nm);
    this.s.lastX = this.sx(this.s.lastX) & nm;
    this.s.ws = ws;
    return true;
  }

  cycleWordSize(dir) {
    const i = SIZES.indexOf(this.s.ws);
    return this.setWordSize(SIZES[(i + (dir > 0 ? 1 : 3)) % 4]);
  }

  toggleSigned() {
    this.finishEntry();
    this.msg = null;
    this.s.sgn = !this.s.sgn;
    return true;
  }

  toggleGroup() {
    this.msg = null;
    this.s.group = !this.s.group;
    return true;
  }

  snapshot() {
    return {
      s: { ...this.s, stk: [...this.s.stk] },
      entry: this.entry,
      entering: this.entering,
      entryNeg: this.entryNeg,
    };
  }

  restore(snap) {
    this.s = { ...snap.s, stk: [...snap.s.stk] };
    this.entry = snap.entry;
    this.entering = snap.entering;
    this.entryNeg = snap.entryNeg;
    this.msg = null;
  }

  // JSON-safe state (BigInt as hex strings) for localStorage.
  toJSON() {
    return {
      ...this.s,
      stk: this.s.stk.map((v) => v.toString(16)),
      lastX: this.s.lastX.toString(16),
    };
  }

  loadJSON(o) {
    try {
      if (!SIZES.includes(o.ws) || !BASES.includes(o.base)) return false;
      if (!Array.isArray(o.stk) || o.stk.length !== 4) return false;
      this.reset();
      const s = this.s;
      s.ws = o.ws;
      s.base = o.base;
      for (const key of ['sgn', 'group', 'carry', 'overflow', 'lift']) s[key] = !!o[key];
      s.stk = o.stk.map((h) => BigInt('0x' + h) & this.mask);
      s.lastX = BigInt('0x' + o.lastX) & this.mask;
      return true;
    } catch {
      this.reset();
      return false;
    }
  }

  format(v, base, group) {
    v &= this.mask;
    let neg = false;
    if (base === 10 && this.s.sgn && (v & this.signBit)) {
      neg = true;
      v = (-v) & this.mask; // magnitude (INT_MIN maps to itself, correct)
    }
    let digits = v.toString(base).toUpperCase();
    if (group) digits = groupDigits(digits, base);
    return neg ? '-' + digits : digits;
  }

  xText() {
    if (!this.entering) return this.format(this.s.stk[0], this.s.base, this.s.group);
    const d = this.s.group ? groupDigits(this.entry, this.s.base) : this.entry;
    return this.entryNeg ? '-' + d : d;
  }
}
