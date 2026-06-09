---
description: Use when creating documents, plans, specs, reports, code reviews, design prototypes, or research summaries where rich visuals or interactivity matter. Prefer over Markdown when output exceeds ~100 lines or when color, diagrams, tables, or interactive elements would aid comprehension. 「HTMLで出力して」「HTMLファイルで作って」「リッチな出力で」「図や色を使って」「インタラクティブに」 「仕様書をHTMLで」「レポートをHTMLで」「デザインモックアップ」「プロトタイプ作って」などの発言で積極的に使うこと。
license: MIT
metadata:
    github-path: skills/html-output
    github-ref: refs/heads/main
    github-repo: https://github.com/FScoward/senju
    github-tree-sha: cb2c54fa625056a55dff556b071a49421ca08f17
name: html-output
---
# HTML Output

## Overview

Markdownの代わりにHTMLをアウトプット形式として使う技法。HTMLはテーブル・SVG・CSS・JS・インタラクティブ要素など、Claudeが読めるほぼすべての情報を表現できる。100行を超えるMarkdownは読まれないが、HTMLは視覚的に整理できる。

*参考: Thariq (@trq212) "Using Claude Code: The Unreasonable Effectiveness of HTML"*

---

## 必ず添える前提情報（Context Block）

HTML成果物は結論や図だけだと、後で読み返したとき・他人に渡したときに **何を前提に作られたか** が失われる。出力の前と中で、前提情報を必ず扱うこと。

### 生成前 — 前提を確定する

HTMLを書き始める前に、最低限これを固める。曖昧なら **1〜2問だけ** 確認するか、妥当な仮定を置いて「前提」として明記する（黙って進めない）。

- **目的** — この成果物で何を達成するか
- **対象読者** — 誰が読むか（自分 / レビュアー / PdM / 非エンジニア…）
- **スコープ** — 含むもの・含まないもの
- **入力ソース** — 根拠にしたチケットID・PR番号・ファイルパス・URL・会話

### 生成物の冒頭 — Context ブロックを置く

本文の先頭に、たためる前提セクションを必ず入れる。

```html
<details open class="context">
  <summary>前提・背景（Context）</summary>
  <dl>
    <dt>目的</dt><dd>…</dd>
    <dt>対象読者</dt><dd>…</dd>
    <dt>スコープ</dt><dd>含む: … ／ 含まない: …</dd>
    <dt>前提・制約</dt><dd>…</dd>
    <dt>入力ソース</dt><dd>APP-1234 ／ PR #56 ／ src/foo.ts</dd>
  </dl>
</details>
```

### 末尾 — メタ情報を添える

再現性のため、フッターに生成メタを書く。日付は推測で埋めず、不明なら「(日付不明)」と明記する。

```html
<footer class="meta">
  作成日: YYYY-MM-DD（セッションの現在日付） ・ 生成元: html-output skill ・ 参照: APP-1234, PR #56
</footer>
```

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

- [ ] **前提Contextを冒頭に置く** — 目的・対象読者・スコープ・入力ソースを明記
- [ ] **メタ情報をフッターに添える** — 作成日・生成元・参照したソース
- [ ] **SVGで図を描く** — ASCII図・Unicodeカラーは使わない
- [ ] **モバイル対応** — スマホ/PCで異なるレイアウト
- [ ] **ナビゲーション** — 長いドキュメントにはタブ・アンカー・折りたたみ
- [ ] **双方向エクスポート** — インタラクティブな場合は「JSON/プロンプトとしてコピー」ボタン
- [ ] **デザイン統一** — プロジェクトのCSSデザインシステムを参照する（無ければ下記デフォルト）
- [ ] **tmp/ に保存** — `tmp/<目的を表す名前>.html`（例: `sprint-plan.html`、`review-pr123.html`）
- [ ] **ブラウザで確認** — 生成後に `open tmp/<ファイル名>.html` を実行する

---

## デザインの前提（デフォルト）

プロジェクトに CSS デザインシステムがあれば **それを最優先** で使う。無ければ、毎回ブレないよう以下をデフォルトとし、`<style>` 内の `:root` 変数にまとめて使い回す。

- **配色**: 背景 `#ffffff` / 文字 `#1a1a1a` / アクセント1色（例 `#2563eb`）/ 罫線 `#e5e7eb`。ダークは `prefers-color-scheme` で対応
- **フォント**: 本文 `system-ui, -apple-system, "Segoe UI", "Hiragino Sans", Meiryo, sans-serif` / コード `ui-monospace, "SF Mono", Menlo, monospace`
- **レイアウト**: 本文幅 `max-width: 760px` 中央寄せ・行間 `1.7`・余白は広め
- **重要度カラー**: 🔴 `#dc2626` / 🟡 `#d97706` / 🟢 `#16a34a` を全成果物で統一

---

## トレードオフ

| | HTML | Markdown |
|--|------|----------|
| トークン消費 | 2〜4倍多い | 少ない |
| 生成時間 | 遅い | 速い |
| 可読性 | 高い（100行超でも） | 100行超で低下 |
| バージョン管理diff | ノイジー | クリーン |

> Opusの1Mコンテキストでは、トークン増加は実用上ほぼ問題にならない。

---

## 生成後の確認

生成後は以下を実行してブラウザで開く：

```bash
open tmp/<ファイル名>.html
```

Quick Look（スペースキー）でも確認可能。

### 保存先の規則

- `tmp/` 配下に保存（`.gitignore` 対象にすること）
- ファイル名は目的が分かる英語で：`sprint-plan.html`、`review-pr123.html`、`spec-login.html` など
