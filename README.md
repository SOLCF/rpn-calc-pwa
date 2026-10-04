# RPN Calc (PWA)

設計計算をぱっとこなすための RPN 関数電卓。ホーム画面に追加すればアプリとして起動し、オフラインでも動きます。

公開先: https://solcf.github.io/rpn-calc-pwa/

> 以前の HEX/DEC/OCT/BIN プログラマ電卓版はタグ `v1-programmer` に残っています。

## 特長
- HP 方式の 4 段スタック（X/Y/Z/T）、LAST X、アンドゥ
- 表示形式 STD / FIX / SCI / ENG（桁数は ± で調整）
- X の下に、丸める前の値（≈）と SI 接頭辞表記（`333.3 m`、`205 k` など）を表示
- DEG モードの sin 180° や cos 90° は誤差なく 0、tan 90° はエラー
- メモリ R0〜R9（STO / RCL のあとに数字）
- X をタップすると値をクリップボードにコピー
- タップで軽く振動、エラー時は 2 回振動
- 状態は端末に自動保存

## キー
| キー | 機能 | SHIFT |
|---|---|---|
| x⇄y / R↓ / LSTx | スタック操作 | R↓ → R↑ |
| ↶ | アンドゥ（もう一度でリドゥ） | |
| sin cos tan | 三角関数（DEG/RAD） | 逆関数 |
| π | 円周率 | |
| 1/x x² √x | 逆数・2乗・平方根 | |
| yˣ | Y の X 乗 | |
| ˣ√y | Y の X 乗根（³√-8 = -2 も可） | |
| EEX | 指数入力（`2.1 EEX 5` = 2.1×10⁵、入力中の ± で指数の符号） | |
| log ln | 常用・自然対数 | 10ˣ / eˣ |
| STO RCL | メモリ保存・呼出（続けて 0〜9） | |
| % | Y の X%（Y は残る） | Δ% = (X−Y)/Y×100 |
| CLR / CLX / ⌫ / ENTER | 全クリア / X クリア / 1文字削除・DROP / ENTER | |

### 例
| 計算 | キー |
|---|---|
| 梁の曲げモーメント wL²/8（w=12.5, L=6） | `12.5` `ENTER` `6` `x²` `×` `8` `÷` → 56.25 |
| 斜辺 √(3²+4²) | `3` `x²` `4` `x²` `+` `√x` → 5 |
| 30° の勾配の高さ（斜長 2.5） | `2.5` `ENTER` `30` `sin` `×` → 1.25 |
| 重力加速度を保存して使う | `9.80665` `STO` `0`、以後 `RCL` `0` |

PC のキーボードでも操作できます（数字, `.`, `e`=EEX, `n`=±, Enter, Backspace, Esc=CLX, Delete=CLR, `+ - * /`, `^`=yˣ, `q`=√, `i`=1/x, `p`=π, `%`, `s`=x⇄y, ↑↓=ロール, Ctrl+Z）。

## 開発

```bash
npm test                       # 計算エンジンのテスト
py -m http.server 8765         # http://localhost:8765 で確認
py tools/make_icons.py         # アイコン再生成
```

ビルド不要の素の HTML/CSS/JS です。`main` に push すると GitHub Pages に反映されます。

## 構成
- `core.js` — 計算エンジン（スタック、入力、関数、表示形式）
- `app.js` — 画面・タッチ・キーボード・保存
- `sw.js` / `manifest.webmanifest` / `icons/` — PWA
- `test/core.test.mjs` — エンジンのテスト
