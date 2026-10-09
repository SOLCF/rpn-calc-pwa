// Everything about the keys in one place: the keypad layout, and for each
// action its label, style, help text, tape text and PC keyboard key.
// The keypad, the キー説明 tab, the tape and the PC keyboard map are all
// built from this file. To add a key: add an entry to KEY_INFO (and the op to
// core.js if it computes something) and put it in LAYOUT.

// 5 x 8 keypad, row by row. [action] or [action, shifted action].
export const LAYOUT = [
  ['SHIFT'], ['SWAP'], ['RDN', 'RUP'], ['LASTX'], ['EEX'],
  ['SIN', 'ASIN'], ['COS', 'ACOS'], ['TAN', 'ATAN'], ['PI'], ['PCT', 'DPCT'],
  ['SQ'], ['SQRT'], ['POW'], ['ROOT'], ['INV'],
  ['LOG', 'EXP10'], ['LN', 'EXP'], ['DR'], ['ARC', 'ARCANG'], ['CLR'],
  ['7'], ['8'], ['9'], ['DIV'], ['CLX'],
  ['4'], ['5'], ['6'], ['MUL'], ['UNDO'],
  ['1'], ['2'], ['3'], ['SUB'], ['BS'],
  ['0'], ['.'], ['CHS'], ['ADD'], ['ENTER'],
];

// Help sections, in display order.
const STACK = 'スタック';
const EDIT = '入力・消去';
const ARITH = '四則・べき乗';
const FUNC = '関数';
const DESIGN = '設計用';
export const HELP_SECTIONS = [STACK, EDIT, ARITH, FUNC, DESIGN];

// Per action:
//   label  text on the key           cls   style class(es)
//   hint   small text under the label
//   help   [section, text] or [section, text, key text] for the キー説明 tab
//   tape   (a) => expression for the history tape; a = { x, y, deg, base, factor }
//          (formatted X / Y before the key, '°' in DEG mode, D⇄R base and factor).
//          Omitted: the label is used.
//   unit   suffix for the tape result
//   pc     PC keyboard keys (KeyboardEvent.key values); pcLabel: how help shows them
export const KEY_INFO = {
  SHIFT: { label: 'SHIFT', cls: 'shiftkey' },
  ENTER: {
    label: 'ENTER', cls: 'enter', pc: ['Enter', ' '], pcLabel: 'Enter / Space',
    help: [STACK, 'X を Y に押し上げる（数値の区切り）。続けて押すと X を複製'],
    tape: (a) => `${a.x} ENTER`,
  },
  SWAP: { label: 'x⇄y', cls: 'stack', pc: ['s'], help: [STACK, 'X と Y を入れ替える'] },
  RDN: {
    label: 'R↓', cls: 'stack', pc: ['r', 'ArrowDown'], pcLabel: 'r / ↓',
    help: [STACK, 'スタックを下に回す（SHIFT で R↑：上に回す）'],
  },
  RUP: { label: 'R↑', cls: 'stack', pc: ['ArrowUp'], pcLabel: '↑' },
  LASTX: { label: 'LSTx', cls: 'stack', pc: ['l'], help: [STACK, '直前の計算に使った X を呼び出す'] },

  EEX: {
    label: 'EEX', cls: 'edit', pc: ['e'],
    help: [EDIT, '指数入力。2.1 EEX 5 で 2.1×10⁵。入力中に ± で指数の符号を反転'],
  },
  CHS: {
    label: '±', cls: 'edit', pc: ['n'], help: [EDIT, '符号反転（指数入力中は指数の符号）'],
    tape: (a) => `−(${a.x})`,
  },
  BS: {
    label: '⌫', cls: 'edit', pc: ['Backspace'],
    help: [EDIT, '入力中は 1 文字削除。入力していないときは X を捨てる（DROP）'],
    tape: () => 'DROP',
  },
  CLX: { label: 'CLX', cls: 'edit', pc: ['Escape'], pcLabel: 'Esc', help: [EDIT, 'X を 0 にする'] },
  CLR: { label: 'CLR', cls: 'danger', pc: ['Delete'], help: [EDIT, 'スタックをすべて 0 にする'] },
  UNDO: { label: '↶', cls: 'edit', help: [EDIT, '1 つ前に戻す（入力中なら入力を取り消し）。やり直しは 履歴 タブの Redo'] },

  ADD: {
    label: '+', cls: 'op', pc: ['+'], tape: (a) => `${a.y} + ${a.x}`,
    help: [ARITH, 'Y と X で計算（例: 6 ENTER 2 ÷ → 3）', '+ − × ÷'],
  },
  SUB: { label: '−', cls: 'op', pc: ['-'], tape: (a) => `${a.y} − ${a.x}` },
  MUL: { label: '×', cls: 'op', pc: ['*'], tape: (a) => `${a.y} × ${a.x}` },
  DIV: { label: '÷', cls: 'op', pc: ['/'], tape: (a) => `${a.y} ÷ ${a.x}` },
  SQ: { label: 'x²', cls: 'fn', help: [ARITH, 'X の 2 乗'], tape: (a) => `(${a.x})²` },
  SQRT: { label: '√x', cls: 'fn', pc: ['q'], help: [ARITH, 'X の平方根'], tape: (a) => `√(${a.x})` },
  POW: { label: 'yˣ', cls: 'fn', pc: ['^'], help: [ARITH, 'Y の X 乗'], tape: (a) => `${a.y} ^ ${a.x}` },
  ROOT: {
    label: 'ˣ√y', cls: 'fn', tape: (a) => `${a.x}√(${a.y})`,
    help: [ARITH, 'Y の X 乗根（³√-8 = -2 のように負の数の奇数乗根も可）'],
  },
  INV: { label: '1/x', cls: 'fn', pc: ['i'], help: [ARITH, 'X の逆数'], tape: (a) => `1/(${a.x})` },
  PCT: {
    label: '%', cls: 'fn', pc: ['%'], tape: (a) => `${a.y} × ${a.x}%`,
    help: [ARITH, 'Y の X%（Y は残るので + で「Y の X% 増し」）。SHIFT で Δ%：Y→X の増減率'],
  },
  DPCT: { label: 'Δ%', cls: 'fn', tape: (a) => `Δ% ${a.y} → ${a.x}` },

  SIN: {
    label: 'sin', cls: 'fn', tape: (a) => `sin(${a.x}${a.deg})`,
    help: [FUNC, '三角関数（設定の DEG/RAD に従う）。SHIFT で逆関数', 'sin cos tan'],
  },
  COS: { label: 'cos', cls: 'fn', tape: (a) => `cos(${a.x}${a.deg})` },
  TAN: { label: 'tan', cls: 'fn', tape: (a) => `tan(${a.x}${a.deg})` },
  ASIN: { label: 'sin⁻¹', cls: 'fn', tape: (a) => `sin⁻¹(${a.x})` },
  ACOS: { label: 'cos⁻¹', cls: 'fn', tape: (a) => `cos⁻¹(${a.x})` },
  ATAN: { label: 'tan⁻¹', cls: 'fn', tape: (a) => `tan⁻¹(${a.x})` },
  PI: { label: 'π', cls: 'fn', pc: ['p'], help: [FUNC, '円周率を入れる'] },
  LOG: { label: 'log', cls: 'fn', help: [FUNC, '常用対数（SHIFT で 10ˣ）'], tape: (a) => `log(${a.x})` },
  LN: { label: 'ln', cls: 'fn', help: [FUNC, '自然対数（SHIFT で eˣ）'], tape: (a) => `ln(${a.x})` },
  EXP10: { label: '10ˣ', cls: 'fn', tape: (a) => `10^(${a.x})` },
  EXP: { label: 'eˣ', cls: 'fn', tape: (a) => `e^(${a.x})` },

  DR: {
    label: 'D⇄R', cls: 'mem', pc: ['d'], tape: (a) => `${a.base} ×${a.factor}`,
    help: [DESIGN, '押すたびに元の値の ×2.0 → ×0.5 → ×1.0 と切り替わる（直径⇄半径の換算）'],
  },
  ARC: {
    label: '弧長', cls: 'mem arc', hint: 'Y⌀ X°', pc: ['a'], tape: (a) => `弧長 ⌀${a.y}, ${a.x}°`,
    help: [DESIGN, 'Y = 直径[mm]、X = 角度[°] の弧長 π·D·θ/360。角度は常に度'],
  },
  ARCANG: {
    label: '角度', cls: 'mem arc', hint: 'Y⌀ X弧', unit: '°', tape: (a) => `角度 ⌀${a.y}, 弧${a.x}`,
    help: [DESIGN, 'SHIFT＋弧長。Y = 直径[mm]、X = 弧長[mm] から角度[°] = 360·L/(π·D)'],
  },

  '.': { label: '.', cls: 'num', pc: ['.', ','] },
};
for (const d of '0123456789') KEY_INFO[d] = { label: d, cls: 'num' };

// Display help that is not about a single key.
export const DISPLAY_HELP = [
  ['STD', '12 桁まで、末尾の 0 を省略。小さい数も 0.00000001 のように小数で表示（1E12 以上と 1E-15 未満のみ指数）'],
  ['FIX', '小数点以下を ± で指定した桁数に固定'],
  ['SCI', '指数表示（1.235E4）'],
  ['ENG', '指数を 3 の倍数にそろえる（12.35E3）'],
  ['X をタップ', '値をクリップボードにコピー'],
  ['HP 35s', '設定の「HP 35s モード」で HP 35s 風の見た目に。「元に戻す」で前のテーマへ'],
  ['≈ / 接頭辞', 'X の下に丸める前の値と、k・m などの SI 接頭辞表記を表示'],
];

// Shifted action of each keypad key.
export const ALT_OF = Object.fromEntries(LAYOUT.filter((k) => k[1]).map(([a, b]) => [a, b]));

// PC keyboard: KeyboardEvent.key -> action. Digits are handled separately.
export const KEYMAP = {};
for (const [action, info] of Object.entries(KEY_INFO)) {
  for (const key of info.pc ?? []) KEYMAP[key] = action;
}

// [title, [[key text, description], ...]] for the キー説明 tab.
export function helpSections() {
  const byTitle = new Map(HELP_SECTIONS.map((t) => [t, []]));
  for (const action of LAYOUT.flat()) {
    const h = KEY_INFO[action].help;
    if (h) byTitle.get(h[0]).push([h[2] ?? KEY_INFO[action].label, h[1]]);
  }
  const pc = [['0〜9 .', '数字・小数点（, でも小数点）']];
  for (const [action] of LAYOUT) {
    const info = KEY_INFO[action];
    if (!info.pc || action === '.') continue;
    const alt = ALT_OF[action];
    const letter = info.pc.find((k) => /^[a-z]$/.test(k));
    const shiftNote = alt && letter ? `（Shift+${letter} で${KEY_INFO[alt].label}）` : '';
    pc.push([info.pcLabel ?? info.pc[0], info.label + shiftNote]);
    if (alt && KEY_INFO[alt].pc) pc.push([KEY_INFO[alt].pcLabel ?? KEY_INFO[alt].pc[0], KEY_INFO[alt].label]);
  }
  pc.push(
    ['Ctrl+Z', 'Undo'],
    ['Ctrl+Y', 'Redo'],
    ['Shift', '押している間だけ SHIFT（離すと解除）。Shift+英字はそのキーの SHIFT 機能'],
    ['その他', 'sin・log などはマウスでクリック（Shift を押しながらで逆関数など）。メニュー表示中は Esc で閉じる'],
  );
  return [...byTitle, ['表示', DISPLAY_HELP], ['PC のキーボード', pc]];
}
