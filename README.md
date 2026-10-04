# RPN Programmer Calc (PWA)

`cardputer-rpn` の Android / ブラウザ版。HP-16C 風の RPN プログラマ電卓を、タッチ操作の PWA にしたものです。
ホーム画面に追加すればアプリとして起動し、オフラインでも動きます。

- HEX / DEC / OCT / BIN、ワードサイズ 8/16/32/64bit、符号付き(2の補数)/符号なし
- 64bit は `BigInt` で正確に計算
- X を他の基数とビット表示で常時表示。**ビットをタップすると反転**
- 基数で使えない数字キーは自動でグレーアウト
- タップ時に軽く振動、エラー時は2回振動
- 状態（スタック・モード）は端末に自動保存

## キー
| キー | 機能 |
|---|---|
| AND OR XOR NOT | ビット演算（Y op X） |
| #1 | ポップカウント |
| ≪ ≫ | Y を X ビットシフト（符号付きなら ≫ は算術シフト） |
| RL RR | Y を X ビットローテート |
| MOD ÷ × − + | 演算（Y op X） |
| x⇄y R↓ R↑ LSTx | スタック操作 |
| ± | 符号反転（DEC 符号付きで入力中なら入力値の符号） |
| ⌫ | 入力中は1文字削除、それ以外は DROP |
| CLX / CLR | X をクリア / 全クリア |
| ↶ | アンドゥ（もう一度でリドゥ） |

上部: 基数切替、ワードサイズ、Signed/Unsigned、桁区切り、フラグ（C=キャリー、G=オーバーフロー）

PC のキーボードでも Cardputer 版と同じキーで操作できます（Enter, Backspace, Esc=CLX, Delete=CLR, Tab=基数, ↑↓=ロール, Ctrl+Z）。

## 開発

```bash
npm test                       # 計算エンジンのテスト
py -m http.server 8765         # http://localhost:8765 で確認
py tools/make_icons.py         # アイコン再生成
```

ビルド不要の素の HTML/CSS/JS です。Service Worker はネットワーク優先なので、更新はすぐ反映されます（オフライン時のみキャッシュを使用）。

## 構成
- `core.js` — 計算エンジン（`cardputer-rpn/src/rpn_core.cpp` の移植）
- `app.js` — 画面・タッチ・キーボード・保存
- `sw.js` / `manifest.webmanifest` / `icons/` — PWA
- `test/core.test.mjs` — エンジンのテスト
