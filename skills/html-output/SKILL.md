---
name: html-output
license: MIT
description: >-
  Use when creating documents, plans, specs, reports, code reviews, design prototypes,
  or research summaries where rich visuals or interactivity matter.
  Prefer over Markdown when output exceeds ~100 lines or when color, diagrams, tables,
  or interactive elements would aid comprehension.
  「HTMLで出力して」「HTMLファイルで作って」「リッチな出力で」「図や色を使って」「インタラクティブに」
  「仕様書をHTMLで」「レポートをHTMLで」「デザインモックアップ」「プロトタイプ作って」などの発言で積極的に使うこと。
---

# HTML Output

## Overview

Markdownの代わりにHTMLをアウトプット形式として使う技法。HTMLはテーブル・SVG・CSS・JS・インタラクティブ要素など、Claudeが読めるほぼすべての情報を表現できる。100行を超えるMarkdownは読まれないが、HTMLは視覚的に整理できる。

*参考: Thariq (@trq212) "Using Claude Code: The Unreasonable Effectiveness of HTML"*

---

## HTML vs Markdown の選択基準

| HTML を選ぶ | Markdown を選ぶ |
|-------------|----------------|
| 仕様書・計画書・レポート（50行超） | 短い回答・メモ |
| 図・色・テーブルが必要 | gitでテキストとして編集する |
| インタラクティブな探索・調整 | コードコメント・READMEの一部 |
| デザインモックアップ・プロトタイプ | 差分管理が重要 |

---

## ユースケース別プロンプト例

### 1. 仕様書・計画書
```
実装計画をHTMLファイルで作成して。
モックアップ、データフロー図（SVG）、重要なコードスニペットを含め、
タブやアンカーで読みやすく整理すること。
```

### 2. コードレビュー説明
```
このPRをHTMLアーティファクトとして説明して。
差分をインライン注釈付きでレンダリングし、
指摘の重要度（🔴/🟡/🟢）で色分けすること。
```

### 3. 技術レポート・学習資料
```
レート制限の仕組みをHTMLエクスプレイナーページとして作成して。
トークンバケットフローの図（SVG）、主要コードスニペット（注釈付き）、
gotchasセクションを含め、一度読めば理解できるように最適化すること。
```

### 4. デザインプロトタイプ
```
このボタンのアニメーションをHTMLファイルで試作して。
スライダーとオプションで調整できるようにし、
気に入ったパラメータをコピーするボタンも付けること。
```

### 5. 使い捨て編集UI
```
30件のLinearチケットをNow/Next/Later/Cutの列で
ドラッグ可能なHTMLカードとして表示して。
並べ替え後に理由付きMarkdownをコピーするボタンを付けること。
```

---

## 品質チェックリスト

- [ ] **SVGで図を描く** — ASCII図・Unicodeカラーは使わない
- [ ] **モバイル対応** — スマホ/PCで異なるレイアウト
- [ ] **ナビゲーション** — 長いドキュメントにはタブ・アンカー・折りたたみ
- [ ] **双方向エクスポート** — インタラクティブな場合は「JSON/プロンプトとしてコピー」ボタン
- [ ] **デザイン統一** — プロジェクトのCSSデザインシステムを参照する

---

## トレードオフ

| | HTML | Markdown |
|--|------|----------|
| トークン消費 | 2〜4倍多い | 少ない |
| 生成時間 | 遅い | 速い |
| 可読性 | 高い（100行超でも） | 100行超で低下 |
| バージョン管理diff | ノイジー | クリーン |

> Opusの1Mコンテキストでは、トークン増加は実用上ほぼ問題にならない。
