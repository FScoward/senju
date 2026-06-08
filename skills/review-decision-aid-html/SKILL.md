---
name: review-decision-aid-html
description: PRレビュー指摘の対応方針を、ユーザーが選択しやすいHTML decision aidとして出力するスキル。「レビュー指摘を選択しやすくして」「レビュー対応方針をHTMLで」「どれを対応するか選べるように」「NICE / DISCUSS / DEFER を判断しやすく」「指摘の対応方針をdecision aidにして」「receive-review の結果をHTML化して」「レビュー指摘を分類してHTMLにして」「対応/見送り/後続化を選べるページ作って」「どの指摘に対応すべか整理して」といった依頼で必ず使うこと。receive-review スキルの出力をそのまま渡してもよい。PRレビューの指摘分類結果（SHOULD/NICE/DISCUSS/DEFER）を、ユーザーが各項目の対応方針を選択・コピーできるインタラクティブなHTMLページに変換する。
---

# レビュー対応 Decision Aid HTML スキル

PRレビューの指摘を受け取り、各指摘に対して「今回対応 / スキップ / 後続化 / レビュアー確認」のいずれかを選択できるHTMLページを生成する。

## このスキルが解くこと

receive-review や手動トリアージの結果があっても、「どれをやるか」の意思決定は依然として難しい。このスキルは：

- 各指摘に「対象コード・指摘の意味・必要な理由・放置リスク・推奨判断」を揃えて提示する
- 各項目の直下に選択肢ラジオボタンを置く（最後にまとめて選ばせない）
- 最後に全選択結果を1クリックでコピーできるテキストにまとめる

を実現し、「意思決定 → 実装指示のコピー」まで1つのHTMLで完結させる。

---

## Step 1: 入力を解析する

入力は以下のいずれか：

1. receive-review スキルの出力テキスト（SHOULD/NICE/DISCUSS/DEFER 分類済み）
2. 生のレビューコメント一覧（未分類なら自分で SHOULD/NICE/DISCUSS/DEFER に分類する）
3. ユーザーが手入力した指摘リスト

各指摘について以下を確定させてから HTML 生成に進む：

| 項目 | 内容 |
|------|------|
| 分類 | SHOULD / NICE / DISCUSS / DEFER |
| ID | S1, N1, D1, F1 形式（S=SHOULD, N=NICE, D=DISCUSS, F=DEFER） |
| タイトル | 「何のファイルの何についての話か」が分かる日本語。英語ラベル1単語は禁止 |
| 対象 | ファイルパス または クラス名/メソッド名 |
| 指摘の意味 | レビュアーが何を言っているか（1〜3文） |
| なぜ必要か | 放置した場合にどんな問題が起きるか |
| 推奨判断 | このスキルとして推奨する選択肢（理由付き） |

---

## Step 2: HTMLを生成する

`tmp/pr-{PR番号}-review-decision-aid.html` に保存する。PR番号が不明な場合は `tmp/review-decision-aid.html`。

**HTMLは単体ファイルで完結**させること。外部ライブラリ・CDN・フォントファイルの参照は禁止。CSS/JS はすべて `<style>` / `<script>` タグに埋め込む。

### ページ構成（この順序で）

#### 1. Hero セクション

```html
<section class="hero">
  <h1>PR #XXXX レビュー対応方針</h1>
  <div class="hero-stats">
    <div class="stat"><span class="stat-num">N</span><span class="stat-label">未解決</span></div>
    <div class="stat"><span class="stat-num">N</span><span class="stat-label">今回対応候補</span></div>
    <div class="stat"><span class="stat-num">N</span><span class="stat-label">要確認</span></div>
    <div class="stat"><span class="stat-num">N</span><span class="stat-label">後続化候補</span></div>
  </div>
  <div class="recommend-flow">推奨の進め方: ...</div>
</section>
```

#### 2. Context セクション（折りたたみ）

```html
<details class="context-section">
  <summary>このドキュメントについて</summary>
  <ul>
    <li><strong>目的</strong>: ...</li>
    <li><strong>入力ソース</strong>: ...</li>
    <li><strong>スコープ</strong>: ...</li>
  </ul>
</details>
```

#### 3. SHOULD セクション（対応必須）

表形式で簡潔に一覧化する。各行に選択肢を直接置く。

```html
<section class="category should-section">
  <h2 class="category-heading should">🔴 SHOULD — 対応必須</h2>
  <div class="should-item">
    <div class="should-summary">
      <span class="item-id">S1</span>
      <span class="item-title">EPAlertAnalysisResult の状態遷移ガードをテストで補強するか</span>
      <span class="item-file">backend/src/…/EPAlertAnalysisResult.kt</span>
    </div>
    <details class="item-detail">
      <summary>詳細を見る</summary>
      <dl>
        <dt>指摘の意味</dt><dd>…</dd>
        <dt>なぜ必要か</dt><dd>…</dd>
        <dt>放置リスク</dt><dd>…</dd>
      </dl>
    </details>
    <div class="item-choice">
      <div class="item-choice-title">この項目の選択</div>
      <label class="choice-label default">
        <input type="radio" name="decision-s1" value="S1 ガードテスト補強: 今回対応" checked>
        <span class="choice-inner"><strong>今回対応</strong><span class="choice-desc">推奨。レビュアー指摘事項のため。</span></span>
      </label>
      <label class="choice-label">
        <input type="radio" name="decision-s1" value="S1 ガードテスト補強: 後続化">
        <span class="choice-inner"><strong>後続化</strong><span class="choice-desc">理由を説明してスコープ外にする。</span></span>
      </label>
      <label class="choice-label">
        <input type="radio" name="decision-s1" value="S1 ガードテスト補強: スキップ">
        <span class="choice-inner"><strong>スキップ</strong><span class="choice-desc">対応不要の理由をコメントで返す。</span></span>
      </label>
    </div>
  </div>
  <!-- 以下、S2, S3... を繰り返す -->
</section>
```

#### 4. NICE セクション（対応推奨だが任意）

縦型ブロック。SHOULD と同構造だが選択肢のデフォルトが「スキップ」。

選択肢の種類:
- `スキップ`（デフォルト）
- `今回対応`
- `後続化`

#### 5. DISCUSS セクション（要確認・議論が必要）

縦型ブロック＋SVG図。複雑な論点には必ずSVG図を入れる（後述）。

選択肢の種類:
- `レビュアー確認`（デフォルト）
- `今回対応`
- `対応不要返信`

詳細なコメント案は `<details>` で折りたたむ：

```html
<details class="comment-draft">
  <summary>確認コメント案（クリックで展開）</summary>
  <pre class="comment-text">ご指摘ありがとうございます。
  ...コメント本文...
  </pre>
</details>
```

#### 6. DEFER セクション（後続PR化）

ロードマップSVG＋縦型ブロック。

選択肢の種類:
- `後続化`（デフォルト）
- `今回対応`
- `対応不要`

#### 7. Copy セクション（全選択結果のコピー）

```html
<section class="copy-section">
  <h2>対応方針をコピー</h2>
  <button onclick="updateCopy()" class="refresh-btn">選択を反映</button>
  <textarea id="copy-result" readonly></textarea>
  <button onclick="copyToClipboard()" class="copy-btn">コピー</button>
</section>
```

JS でラジオボタン全選択値を集約して textarea に流す。

---

## Step 3: SVG図の使い方

**DISCUSS の複雑な論点には必ずSVG図を入れる**。装飾ではなく、判断構造を説明するためだけに使う。

### 状態遷移図の例

```svg
<svg width="500" height="120" viewBox="0 0 500 120" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="40" width="100" height="40" rx="4" fill="#e2e8f0" stroke="#94a3b8"/>
  <text x="60" y="65" text-anchor="middle" font-size="13" fill="#1e293b">RUNNING</text>
  <line x1="110" y1="60" x2="160" y2="60" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr)"/>
  <rect x="160" y="40" width="100" height="40" rx="4" fill="#dcfce7" stroke="#86efac"/>
  <text x="210" y="65" text-anchor="middle" font-size="13" fill="#166534">SUCCEEDED</text>
  <!-- 以下省略 -->
</svg>
```

### ロードマップ図の例（DEFER セクション用）

```svg
<svg width="600" height="80" viewBox="0 0 600 80" xmlns="http://www.w3.org/2000/svg">
  <line x1="40" y1="40" x2="560" y2="40" stroke="#cbd5e1" stroke-width="2"/>
  <!-- 現PR -->
  <circle cx="100" cy="40" r="12" fill="#3b82f6"/>
  <text x="100" y="44" text-anchor="middle" font-size="11" fill="white" font-weight="bold">現PR</text>
  <text x="100" y="65" text-anchor="middle" font-size="11" fill="#475569">#3798</text>
  <!-- 後続PR -->
  <circle cx="300" cy="40" r="12" fill="#e2e8f0" stroke="#94a3b8"/>
  <text x="300" y="44" text-anchor="middle" font-size="11" fill="#64748b">後続</text>
  <text x="300" y="65" text-anchor="middle" font-size="11" fill="#64748b">F1対応</text>
</svg>
```

---

## Step 4: コピーJS の実装

ページ下部の `<script>` タグ内に実装する。

```javascript
function updateCopy() {
  const items = [];
  document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
    items.push('- ' + radio.value);
  });

  const pr = document.querySelector('.hero h1').textContent;
  const today = new Date().toLocaleDateString('ja-JP');

  const lines = [
    pr + ' 対応方針 (' + today + ')',
    '',
    ...items,
    '',
    '次アクション:',
  ];

  const shouldItems = items.filter(i => i.includes('今回対応'));
  const discussItems = items.filter(i => i.includes('レビュアー確認'));
  const deferItems = items.filter(i => i.includes('後続化'));

  let n = 1;
  if (shouldItems.length) lines.push(n++ + '. 「今回対応」とした項目を実装・PR本文更新する');
  if (discussItems.length) lines.push(n++ + '. 「レビュアー確認」とした項目は確認コメントを投稿する');
  if (deferItems.length) lines.push(n++ + '. 「後続化」とした項目は現PRスコープ外として整理する');

  document.getElementById('copy-result').value = lines.join('\n');
}

function copyToClipboard() {
  const ta = document.getElementById('copy-result');
  ta.select();
  document.execCommand('copy');
  const btn = document.querySelector('.copy-btn');
  btn.textContent = 'コピーしました！';
  setTimeout(() => btn.textContent = 'コピー', 2000);
}

// ページ読み込み時に自動反映
window.addEventListener('load', updateCopy);
// ラジオボタン変更時にも自動反映
document.addEventListener('change', e => {
  if (e.target.type === 'radio') updateCopy();
});
```

---

## Step 5: CSSデザインルール

以下の設計原則を必ず守る：

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  max-width: 1050px;
  margin: 0 auto;
  padding: 2rem 1.5rem 6rem;
  color: #1e293b;
  background: #f8fafc;
  line-height: 1.6;
}

/* セクション間は十分な余白 */
section { margin-bottom: 3rem; }

/* カード半径は8px以下 */
.item-block, .should-item { border-radius: 6px; }

/* 選択肢は押せる見た目に */
.choice-label {
  display: flex;
  align-items: flex-start;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  border: 1.5px solid #e2e8f0;
  margin-bottom: 0.5rem;
  transition: border-color 0.15s;
}
.choice-label:has(input:checked) {
  border-color: #3b82f6;
  background: #eff6ff;
}

/* モバイルでは1カラム */
@media (max-width: 640px) {
  .hero-stats { flex-direction: column; }
}
```

カテゴリカラー：
- SHOULD: `#dc2626` （赤）
- NICE: `#d97706` （オレンジ）
- DISCUSS: `#7c3aed` （紫）
- DEFER: `#0369a1` （青）

---

## 説明文の書き方ルール（最重要）

**読む人は「判断したい人」であって「実装を理解したい人」ではない。** 技術用語を並べた説明は頭に入ってこない。読んで3秒で意味がつかめる文章にする。

### 基本ルール

- **一文を短く**。「〜できないため、〜が必要で、〜するとよい」のように3つ以上繋がったら分割する
- **英語技術用語を使う場合は括弧で言い換え**を添える。または言い換えだけにする
- **「なぜ問題か」を具体的に**。「設計上の懸念」は説明になっていない。「将来Xを変えると壊れる」まで書く
- **放置した場合のリスクは「何が起きるか」を書く**。「問題が発生する可能性」は説明になっていない

### NG / OK 例

| NG（頭に入らない） | OK（3秒で分かる） |
|-------------------|-----------------|
| claim作成とCloud Tasks enqueueは同一transactionにできないため、Cloud Tasks outage時にRUNNING claimをFAILEDへ戻す補償処理が必要です | DB保存とタスク登録は一緒に取り消せない。タスク登録だけ失敗すると「処理中」のまま宙に浮く。手動修正が必要になる |
| outbox patternはこの非原子的な境界をきれいに扱う案です | 「DBに登録 → あとでタスクを送る」という順番にすれば失敗しても再試行できる |
| QueryModelがDomain Entityを直接参照しているのは設計上の懸念 | 検索用の処理がドメインロジックに直接触れている。将来ドメイン側を変えると検索も壊れやすくなる |
| @Transactionalなしで呼ばれる箇所がある。適切なアイソレーションレベルが必要 | 同時に別の処理がDBを書き換えていると、古い値を読んでしまうことがある（phantom read） |

### 文体チェック

文章を書いたら次を確認する：
- 技術英語（transaction, outbox, atomic, outage）を文脈なしで使っていないか
- 「〜する必要があります」の理由が具体的か（「手動修正が必要」「データが壊れる」「本番で500エラーが出る」など）
- 読んだ人が「で、何すればいいの？」と思わない文になっているか

---

## 禁止事項（これをやると品質が落ちる）

| 禁止 | 理由 |
|------|------|
| 英語ラベル1単語だけのタイトル | どのコードの話か分からない |
| 横並びカードで複雑な論点 | 読み飛ばしが発生する |
| 最後だけに選択肢 | 各項目を読みながら選べない |
| 画面を情報で詰め込む | 判断疲れが起きる |
| 「なぜ必要か」の省略 | NICE以上の指摘は理由があって出ている |
| 状態遷移を長文テキストだけで説明 | 視覚化しないと境界条件が伝わらない |
| コピー欄の省略 | 次の作業指示につなげられない |
| 外部CSS/JS依存 | オフライン・セキュアな環境で使えなくなる |
| 技術用語を言い換えなしで使う | 判断したい人が読んで3秒で分からない文章になる |

---

## 完成チェックリスト

生成後に確認する：

- [ ] 各レビュー項目に個別のラジオボタン選択肢がある
- [ ] タイトルが「何のファイルの何についての話か」分かる日本語になっている
- [ ] NICE/DISCUSS/DEFER の各項目に「対象ファイル」「指摘の意味」「なぜ必要か」「放置リスク」が書かれている
- [ ] DISCUSS に複雑な論点がある場合、SVG図がある
- [ ] 詳細情報は `<details>` で折りたたまれている
- [ ] 最後にコピー欄があり、ラジオ変更で自動更新される
- [ ] 横並びカードだけで説明していない
- [ ] ファイルを `tmp/` 配下に保存した

---

## 出力ファイルの確認

生成後は以下を実行してブラウザで開く：

```bash
open tmp/pr-XXXX-review-decision-aid.html
```

Quick Look (スペースキー) でも確認可能。
