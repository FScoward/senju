---
description: Use when creating documents, plans, specs, reports, code reviews, design prototypes, or research summaries where rich visuals or interactivity matter. Prefer over Markdown when output exceeds ~100 lines or when color, diagrams, tables, or interactive elements would aid comprehension. 「HTMLで出力して」「HTMLファイルで作って」「リッチな出力で」「図や色を使って」「インタラクティブに」 「仕様書をHTMLで」「レポートをHTMLで」「デザインモックアップ」「プロトタイプ作って」などの発言で積極的に使うこと。
license: MIT
metadata:
    github-path: skills/html-output
    github-ref: refs/heads/main
    github-repo: https://github.com/FScoward/senju
    github-tree-sha: 7a2dbce3b5688afe40a1972e12d6f97a3a324093
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
- [ ] **SVGで図を描く** — ASCII図・Unicodeカラーは使わない。状態遷移・フロー・複雑な論点は積極的に図化する（後述の「図・シミュレーターの使い方」参照）
- [ ] **モバイル対応** — スマホ/PCで異なるレイアウト
- [ ] **ナビゲーション** — 長いドキュメントにはタブ・アンカー・折りたたみ
- [ ] **双方向エクスポート** — インタラクティブな場合は「JSON/プロンプトとしてコピー」ボタン
- [ ] **デザイン統一** — プロジェクトのCSSデザインシステムを参照する（無ければ下記デフォルト）
- [ ] **単体ファイル完結** — 外部CDN・ライブラリ・フォントファイルを参照しない。CSS/JSは `<style>`/`<script>` に全て埋め込む
- [ ] **tmp/ に保存** — `tmp/<目的を表す名前>.html`（例: `sprint-plan.html`、`review-pr123.html`）
- [ ] **ブラウザで確認** — 生成後に `open tmp/<ファイル名>.html` を実行する

---

## 図・シミュレーターの使い方

視覚化は「テキストだと混乱する構造」に限定する。装飾として入れない。

### いつ図を入れるか

| 入れる | 入れない |
|--------|---------|
| 分岐・遷移が2つ以上ある | 単純な順序（A → B → C のみ） |
| 状態に名前があり遷移条件がある | 「on/off」だけの状態 |
| テキスト説明だけで3秒以内に構造が掴めない | 1文で説明できる |
| ユーザーが試しながら理解したい数値関係 | 固定値の説明 |

### 使い分け

| 使う場面 | 形式 |
|---------|------|
| 状態の遷移・ライフサイクル | 状態遷移図（SVG） |
| 処理の順序・条件分岐 | フロー図（SVG） |
| パラメータを変えて結果を試す | インタラクティブシミュレーター（JS） |
| 数値比較・時系列推移 | バーチャート・タイムライン（SVG） |

### 状態遷移図（ステートマシーン）の例

```svg
<svg width="520" height="130" viewBox="0 0 520 130" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#64748b"/>
    </marker>
  </defs>
  <rect x="10" y="40" width="100" height="40" rx="4" fill="#e2e8f0" stroke="#94a3b8"/>
  <text x="60" y="65" text-anchor="middle" font-size="13" fill="#1e293b">PENDING</text>
  <line x1="110" y1="60" x2="160" y2="60" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="135" y="52" text-anchor="middle" font-size="10" fill="#64748b">start()</text>
  <rect x="160" y="40" width="100" height="40" rx="4" fill="#dcfce7" stroke="#86efac"/>
  <text x="210" y="65" text-anchor="middle" font-size="13" fill="#166534">RUNNING</text>
  <line x1="260" y1="60" x2="310" y2="60" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="285" y="52" text-anchor="middle" font-size="10" fill="#64748b">complete()</text>
  <rect x="310" y="40" width="100" height="40" rx="4" fill="#bfdbfe" stroke="#93c5fd"/>
  <text x="360" y="65" text-anchor="middle" font-size="13" fill="#1e3a8a">DONE</text>
  <!-- エラー遷移 -->
  <line x1="210" y1="80" x2="210" y2="107" stroke="#fca5a5" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="222" y="100" font-size="10" fill="#dc2626">error()</text>
  <rect x="160" y="107" width="100" height="18" rx="3" fill="#fee2e2" stroke="#fca5a5"/>
  <text x="210" y="120" text-anchor="middle" font-size="11" fill="#7f1d1d">FAILED</text>
</svg>
```

### フロー図の例

```svg
<svg width="220" height="220" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arr2" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#64748b"/>
    </marker>
  </defs>
  <rect x="60" y="10" width="100" height="32" rx="16" fill="#3b82f6"/>
  <text x="110" y="31" text-anchor="middle" font-size="13" fill="white">開始</text>
  <line x1="110" y1="42" x2="110" y2="65" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr2)"/>
  <polygon points="110,70 180,105 110,140 40,105" fill="#fef9c3" stroke="#ca8a04"/>
  <text x="110" y="109" text-anchor="middle" font-size="12" fill="#713f12">条件A?</text>
  <line x1="110" y1="140" x2="110" y2="165" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr2)"/>
  <text x="118" y="158" font-size="10" fill="#16a34a">Yes</text>
  <rect x="60" y="165" width="100" height="32" rx="4" fill="#dcfce7" stroke="#86efac"/>
  <text x="110" y="186" text-anchor="middle" font-size="12" fill="#166534">処理A</text>
  <line x1="180" y1="105" x2="210" y2="105" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr2)"/>
  <text x="184" y="98" font-size="10" fill="#dc2626">No</text>
</svg>
```

### インタラクティブシミュレーターの例

```html
<div class="simulator">
  <label>閾値: <input type="range" id="threshold" min="0" max="100" value="50">
    <span id="threshold-val">50</span>
  </label>
  <div id="sim-result"></div>
</div>
<script>
  const slider = document.getElementById('threshold');
  const valEl  = document.getElementById('threshold-val');
  const result = document.getElementById('sim-result');
  function update() {
    valEl.textContent = slider.value;
    result.textContent = +slider.value >= 70 ? '⚠️ 超過' : '✅ 正常';
  }
  slider.addEventListener('input', update);
  update();
</script>
```

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
