# HTML実装テンプレート集

SKILL.mdのStep 2〜5で参照する実装テンプレート。

---

## HTML構造テンプレート

### Hero セクション

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

### Context セクション

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

### 指摘カード（SHOULD）

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
      <div class="choice-custom-container">
        <label class="choice-label">
          <input type="radio" name="decision-s1" value="__custom__" data-prefix="S1 ガードテスト補強">
          <span class="choice-inner"><strong>その他（自由入力）</strong><span class="choice-desc">上記以外の方針を直接入力する。</span></span>
        </label>
        <input type="text" class="custom-input" placeholder="対応方針を入力...">
      </div>
    </div>
  </div>
</section>
```

NICE: デフォルト選択肢は「スキップ」。選択肢は `スキップ / 今回対応 / 後続化`。
DEFER: デフォルトは「後続化」。選択肢は `後続化 / 今回対応 / 対応不要`。

### 指摘カード（DISCUSS）

```html
<section class="category discuss-section">
  <h2 class="category-heading discuss">💬 DISCUSS — 要判断</h2>
  <div class="discuss-item">
    <div class="item-summary">
      <span class="item-id">D1</span>
      <span class="item-title">〇〇の設計方針についての選択</span>
      <span class="item-file">backend/src/…/Foo.kt</span>
    </div>

    <!-- A案/B案の比較ブロック（常時表示） -->
    <div class="discuss-options">
      <div class="discuss-option option-a">
        <div class="option-header">A案（現状の実装）</div>
        <div class="option-desc">〜〜〜</div>
        <div class="option-trade"><span class="trade-pro">✓ </span>〜〜 / <span class="trade-con">✗ </span>〜〜</div>
      </div>
      <div class="discuss-option option-b">
        <div class="option-header">B案（提案内容）</div>
        <div class="option-desc">〜〜〜</div>
        <div class="option-trade"><span class="trade-pro">✓ </span>〜〜 / <span class="trade-con">✗ </span>〜〜</div>
      </div>
    </div>

    <!-- Claude の推奨（常時表示） -->
    <div class="claude-opinion">
      <span class="claude-opinion-label">💡 推奨</span>
      <span class="claude-opinion-text">A案を推奨。理由: 〜〜〜</span>
    </div>

    <!-- 詳細（折りたたみ） -->
    <details class="item-detail">
      <summary>詳細を見る</summary>
      <dl>
        <dt>指摘の意味</dt><dd>…</dd>
        <dt>なぜ問題か</dt><dd>…</dd>
        <dt>放置リスク</dt><dd>…</dd>
      </dl>
    </details>

    <!-- 確認コメント案（常時表示・編集可） -->
    <div class="discuss-comment">
      <div class="discuss-comment-label">📝 確認コメント案（そのままコピーして投稿できます）</div>
      <textarea class="comment-template">〇〇の方針についてですが、A案（現状）とB案（〇〇への変更）のどちらがよいでしょうか？
個人的にはA案を推します。〜〜〜 ご意見をいただけますか？</textarea>
      <button class="copy-comment-btn" onclick="copyComment(this)">コメントをコピー</button>
    </div>

    <!-- 選択肢 -->
    <div class="item-choice">
      <div class="item-choice-title">この項目の選択</div>
      <label class="choice-label default">
        <input type="radio" name="decision-d1" value="D1 〇〇方針: レビュアー確認" checked>
        <span class="choice-inner"><strong>レビュアー確認</strong><span class="choice-desc">上の確認コメントを投稿して返答を待つ。</span></span>
      </label>
      <label class="choice-label">
        <input type="radio" name="decision-d1" value="D1 〇〇方針: A案で対応">
        <span class="choice-inner"><strong>A案で対応</strong><span class="choice-desc">現状の実装を維持する。</span></span>
      </label>
      <label class="choice-label">
        <input type="radio" name="decision-d1" value="D1 〇〇方針: B案で対応">
        <span class="choice-inner"><strong>B案で対応</strong><span class="choice-desc">提案通りに変更する。</span></span>
      </label>
      <label class="choice-label">
        <input type="radio" name="decision-d1" value="D1 〇〇方針: 対応不要返信">
        <span class="choice-inner"><strong>対応不要返信</strong><span class="choice-desc">現状で問題ないとレビュアーに返信する。</span></span>
      </label>
      <div class="choice-custom-container">
        <label class="choice-label">
          <input type="radio" name="decision-d1" value="__custom__" data-prefix="D1 〇〇方針">
          <span class="choice-inner"><strong>その他（自由入力）</strong><span class="choice-desc">上記以外の方針を直接入力する。</span></span>
        </label>
        <input type="text" class="custom-input" placeholder="対応方針を入力...">
      </div>
    </div>
  </div>
</section>
```

### Copy セクション

```html
<section class="copy-section">
  <h2>対応方針をコピー</h2>
  <button onclick="updateCopy()" class="refresh-btn">選択を反映</button>
  <textarea id="copy-result" readonly></textarea>
  <button onclick="copyToClipboard()" class="copy-btn">コピー</button>
</section>
```

---

## SVGテンプレート

### 状態遷移図（DISCUSS の複雑な論点に使う）

```svg
<svg width="500" height="120" viewBox="0 0 500 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8"/>
    </marker>
  </defs>
  <rect x="10" y="40" width="100" height="40" rx="4" fill="#e2e8f0" stroke="#94a3b8"/>
  <text x="60" y="65" text-anchor="middle" font-size="13" fill="#1e293b">RUNNING</text>
  <line x1="110" y1="60" x2="160" y2="60" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arr)"/>
  <rect x="160" y="40" width="100" height="40" rx="4" fill="#dcfce7" stroke="#86efac"/>
  <text x="210" y="65" text-anchor="middle" font-size="13" fill="#166534">SUCCEEDED</text>
</svg>
```

### ロードマップ図（DEFER セクション用）

```svg
<svg width="600" height="80" viewBox="0 0 600 80" xmlns="http://www.w3.org/2000/svg">
  <line x1="40" y1="40" x2="560" y2="40" stroke="#cbd5e1" stroke-width="2"/>
  <circle cx="100" cy="40" r="12" fill="#3b82f6"/>
  <text x="100" y="44" text-anchor="middle" font-size="11" fill="white" font-weight="bold">現PR</text>
  <text x="100" y="65" text-anchor="middle" font-size="11" fill="#475569">#3798</text>
  <circle cx="300" cy="40" r="12" fill="#e2e8f0" stroke="#94a3b8"/>
  <text x="300" y="44" text-anchor="middle" font-size="11" fill="#64748b">後続</text>
  <text x="300" y="65" text-anchor="middle" font-size="11" fill="#64748b">F1対応</text>
</svg>
```

---

## JavaScriptテンプレート

```javascript
function updateCopy() {
  const items = [];
  document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
    if (radio.value === '__custom__') {
      const container = radio.closest('.choice-custom-container');
      const customText = container
        ? (container.querySelector('.custom-input').value.trim() || '（入力中）')
        : '（入力中）';
      items.push('- ' + radio.dataset.prefix + ': ' + customText);
    } else {
      items.push('- ' + radio.value);
    }
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

function copyComment(btn) {
  const textarea = btn.previousElementSibling;
  textarea.select();
  document.execCommand('copy');
  btn.textContent = 'コピーしました！';
  setTimeout(() => btn.textContent = 'コメントをコピー', 2000);
}

function copyToClipboard() {
  const ta = document.getElementById('copy-result');
  ta.select();
  document.execCommand('copy');
  const btn = document.querySelector('.copy-btn');
  btn.textContent = 'コピーしました！';
  setTimeout(() => btn.textContent = 'コピー', 2000);
}

window.addEventListener('load', updateCopy);
document.addEventListener('change', e => {
  if (e.target.type === 'radio') updateCopy();
});
document.addEventListener('input', e => {
  if (e.target.classList.contains('custom-input')) updateCopy();
});
```

---

## CSSテンプレート

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

section { margin-bottom: 3rem; }

.item-block, .should-item { border-radius: 6px; }

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

.choice-custom-container .custom-input {
  display: none;
  width: 100%;
  margin-top: -0.3rem;
  margin-bottom: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 0.9rem;
  box-sizing: border-box;
  color: #1e293b;
}
.choice-custom-container:has(input[type="radio"]:checked) .custom-input {
  display: block;
}

/* DISCUSS 専用スタイル */
.discuss-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin: 1rem 0;
}
@media (max-width: 640px) {
  .discuss-options { grid-template-columns: 1fr; }
}

.discuss-option {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  border: 1.5px solid #e2e8f0;
}
.option-a { border-left: 3px solid #7c3aed; }
.option-b { border-left: 3px solid #0369a1; }

.option-header {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.3rem;
  color: #1e293b;
}
.option-desc { font-size: 0.9rem; color: #475569; margin-bottom: 0.3rem; }
.option-trade { font-size: 0.85rem; color: #64748b; }
.trade-pro { color: #16a34a; font-weight: 600; }
.trade-con { color: #dc2626; font-weight: 600; }

.claude-opinion {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: #faf5ff;
  border: 1.5px solid #c4b5fd;
  border-radius: 6px;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}
.claude-opinion-label { font-weight: 600; color: #7c3aed; white-space: nowrap; }
.claude-opinion-text { color: #1e293b; }

.discuss-comment {
  margin: 0.75rem 0;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.discuss-comment-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 0.5rem;
}
.comment-template {
  width: 100%;
  min-height: 80px;
  padding: 0.5rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 0.875rem;
  color: #1e293b;
  line-height: 1.5;
  box-sizing: border-box;
  resize: vertical;
}
.copy-comment-btn {
  margin-top: 0.5rem;
  padding: 0.35rem 0.9rem;
  background: #7c3aed;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}
.copy-comment-btn:hover { background: #6d28d9; }

@media (max-width: 640px) {
  .hero-stats { flex-direction: column; }
}
```

カテゴリカラー:
| カテゴリ | カラー |
|----------|--------|
| SHOULD   | `#dc2626`（赤） |
| NICE     | `#d97706`（オレンジ） |
| DISCUSS  | `#7c3aed`（紫） |
| DEFER    | `#0369a1`（青） |
