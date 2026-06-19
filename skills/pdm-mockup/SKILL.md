---
name: pdm-mockup
description: >-
  実装前にPdMへ画面イメージを見せて合意を取るためのHTMLモックを生成するスキル。
  「PdMに見せる画面モック作って」「作る前に画面イメージ見せて」「合意取るモック」
  「画面のイメージを固めたい」「PdMに確認してから実装したい」「モックアップ作って」
  「実装前にデザイン確認したい」「PdMとUI合意取りたい」「画面モックをHTMLで」
  「仕様書に画面イメージつけて」「既存画面上でモック作って」「爆速でモック見せて」
  「既存ページに要素を追加してモックにして」「ブラウザでその場でモック」といった発言でも使うこと。
  既存コードから隣接画面のJSX/コンポーネントを読み取り、実際のデザイントークンで
  「本物そっくり」のHTMLモックを生成する。確認ポイントをラジオ選択式で提示し、
  PdMのフィードバックを1クリックでコピーできる合意ドキュメントにする。
  既存ページが開いている場合はJS注入（Lightning Mode）で爆速モックも可能。
license: MIT
---

# pdm-mockup — PdM合意取り画面モック

実装を始める前に「こういう画面にするつもりです」を **本物そっくりのHTMLで** 見せ、  
PdMからフィードバックを1クリックでもらう。

> 「雰囲気伝わったよ」で終わらせない。**具体的な確認ポイントへの回答** が合意の証拠。

---

## このスキルが解くこと

- 実装着手前に「どんな画面か」を可視化し、手戻りを防ぐ
- 既存アプリの見た目に忠実なモックで「思ってたのと違う」を事前に消す
- 「どう？」ではなく **具体的な選択肢**（カード vs テーブル、など）に絞って聞く
- PdMが非同期で見ることを前提に、スクショ映えする構成にする
- フィードバックをそのままSlack / Jiraに貼れるテキストとして出力する

---

## モード選択

まず **どちらのモードで作るか** を判断する。

| | Mode A: Lightning ⚡ | Mode B: Standalone 📄 |
|---|---|---|
| **スピード** | 5〜10分 | 20〜40分 |
| **本物感** | 最高（CSS・データ込み） | 高い（再現） |
| **永続性** | リロードで消える | ファイルに残る |
| **向いている場面** | 既存画面に要素を追加・変更 | まだ存在しない新画面 |
| **ブラウザ必要** | 必須（Claude in Chrome） | 不要 |
| **複雑な状態遷移** | 苦手 | 得意 |

**Lightning を優先する条件**（1つでも満たせば Lightning）:
- 既存ページがブラウザで開いている、または開ける
- 追加・変更したいUI要素が画面の一部（新ボタン・新セクション・文言変更など）
- 「とりあえず5分で見せたい」という状況

**Standalone を選ぶ条件**:
- 全く新しい画面（ルートが存在しない）
- ログイン不要で共有ファイルとして残したい
- 4状態（ローディング/空/エラー）の切り替えが必要

---

## Mode A: Lightning ⚡ — 既存画面にJS注入（爆速）

### L1: 対象ページをブラウザで開く

`mcp__claude-in-chrome__tabs_context_mcp` で既存タブを確認し、なければ対象URLへ遷移。

```
tabs_context_mcp → 既存タブに対象ページがあるか確認
→ あれば: そのタブをそのまま使う
→ なければ: navigate で開く
```

### L2: 既存のクラス・スタイルを読み取る

DOM構造を把握してからJSを書く。同じクラスを使えば見た目が自動で合う。

```
read_page → ページのDOM構造・クラス名を把握
```

注目すべきもの:
- 既存ボタンのクラス名（`btn-primary` など）
- カード・リスト行のクラス名と構造
- ヘッダ・サイドバーのセレクタ

### L3: JSでモック要素を注入する

`javascript_tool` で DOM を操作する。**追加した要素には必ず `data-mock="true"` を付ける**（後でまとめて消せる）。

#### パターン別注入例

**新しいセクションを追加する**
```javascript
// 既存のmain要素の中に新セクションを追加
const main = document.querySelector('main') || document.body;
const section = document.createElement('div');
section.setAttribute('data-mock', 'true');
// 既存のクラスをそのまま使う
section.className = '既存カードと同じクラス';
section.innerHTML = `
  <h3>新機能エリア <span style="background:#fef3c7;color:#92400e;font-size:11px;padding:2px 6px;border-radius:3px;font-weight:bold;">仮</span></h3>
  <p>ここに新機能のコンテンツが入る</p>
`;
main.appendChild(section);
```

**既存テキスト・ボタンを変更する**
```javascript
// 既存ボタンのラベルを変える
const btn = document.querySelector('#submit-btn');
if (btn) {
  btn.setAttribute('data-mock', 'true');
  btn.setAttribute('data-original-text', btn.textContent);
  btn.textContent = '新しいラベル（仮）';
}
```

**新しいボタンを既存の隣に追加する**
```javascript
// 既存ボタンをcloneして隣に挿入
const existingBtn = document.querySelector('.action-btn');
if (existingBtn) {
  const newBtn = existingBtn.cloneNode(true);
  newBtn.setAttribute('data-mock', 'true');
  newBtn.textContent = '新アクション';
  newBtn.style.marginLeft = '8px';
  existingBtn.parentNode.insertBefore(newBtn, existingBtn.nextSibling);
}
```

**バナー・通知エリアを追加する**
```javascript
const banner = document.createElement('div');
banner.setAttribute('data-mock', 'true');
Object.assign(banner.style, {
  position: 'fixed', top: '60px', left: '0', right: '0',
  background: '#eff6ff', borderBottom: '1px solid #bfdbfe',
  padding: '10px 20px', zIndex: '9998', textAlign: 'center',
  fontSize: '14px', color: '#1e40af'
});
banner.textContent = '🔔 新しい通知エリア（仮）';
document.body.appendChild(banner);
```

**モーダル・ダイアログを追加する**
```javascript
const overlay = document.createElement('div');
overlay.setAttribute('data-mock', 'true');
Object.assign(overlay.style, {
  position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', zIndex: '9999',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
});
const modal = document.createElement('div');
// 既存のカードクラスを使う
modal.className = '既存モーダルクラス';
modal.innerHTML = `<h2>確認</h2><p>この操作を実行しますか？</p>
  <button onclick="this.closest('[data-mock]').remove()">キャンセル</button>`;
overlay.appendChild(modal);
document.body.appendChild(overlay);
```

### L4: モックUIオーバーレイを注入する（必須）

「これはモックです」をページ上で明示する常駐バーを入れる。  
スクショを見た人が本物と混同しないために **必ず入れる**。

```javascript
const mockBar = document.createElement('div');
mockBar.setAttribute('data-mock', 'true');
Object.assign(mockBar.style, {
  position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: '99999',
  background: '#7c3aed', color: 'white', padding: '6px 16px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  fontSize: '13px', fontFamily: 'system-ui, sans-serif'
});
mockBar.innerHTML = `
  <span>🎨 <strong>モック表示中</strong> — 実装前の確認用です</span>
  <button onclick="document.querySelectorAll('[data-mock]').forEach(e=>e.remove())"
    style="background:rgba(255,255,255,0.2);border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">
    モック解除
  </button>
`;
document.body.appendChild(mockBar);
```

### L5: スクショ撮影 & サマリ出力

```
computer（スクリーンショット） → 全体像を撮影
→ 必要なら特定エリアをクローズアップ
→ gif_creator でインタラクション（クリック→モーダル表示など）を録画
```

撮影後、確認ポイントをテキストで出力（HTMLファイルは不要）:

```
📐 [機能名] 画面モック（Lightning）

👀 既存の[画面名]ページ上に新UI要素を注入しました

確認ポイント (N点):
1. [質問1]: A案 / B案 ?
2. [質問2]: この文言でよい？
3. [質問3]: ボタンの位置はここ？

🔗 スクショ添付 → (スクショを貼る)
💬 回答はそのままSlackに返信してください
```

### Lightning Gotchas

**React/Vue のSPAはDOM再描画でモック要素が消える**

stateが変わると仮想DOMが再レンダリングされ、手動で追加した要素が消える。

→ **静的な要素（`position: fixed` のバナー・バーなど）に限定するか、`MutationObserver` で再注入する。**

```javascript
// 再注入パターン（消えたら自動で戻す）
const observer = new MutationObserver(() => {
  if (!document.querySelector('[data-mock="banner"]')) injectBanner();
});
observer.observe(document.body, { childList: true, subtree: true });
```

**クラス名が `cn()` で動的生成されている（shadcn/ui等）**

`cn()` が生成したクラスは `class="abc123 xyz456"` のようなハッシュ値になっている場合がある。

→ **`read_page` でレンダリング済みHTMLを読み、実際に付いているクラス名を使う。**

**注入後にリロードすると全部消える**

Lightning Modeは一時的。リロードで消えることを想定内として扱う。

→ **スクショ撮影を先に完了させる。保存したい場合は Standalone モードへ切り替える。**

**`innerHTML` にはリテラル文字列のみ使う**

注入するHTMLはモック文言のハードコード文字列のみにする。APIレスポンスやユーザー入力を直接 `innerHTML` に埋め込むとXSSになる（ブラウザ内でも）。

→ **動的な値を表示したい場合は `textContent` を使う。`innerHTML` はリテラルのみ。**

```javascript
// NG: APIレスポンスをそのまま埋め込む
el.innerHTML = apiData.name;          // XSSリスク

// OK: textContent を使う
el.textContent = apiData.name;        // 安全

// OK: innerHTML はリテラルのみ
el.innerHTML = '<span class="badge">仮</span>';  // 固定文字列のみ
```

---

## Mode B: Standalone 📄 — HTML単体ファイル

## ワークフロー

```
Step 1: 要件把握
Step 2: 隣接画面を特定 & デザイントークン抽出
Step 3: 確認ポイントを策定
Step 4: HTMLモックを生成（状態・フロー込み）
Step 5: ブラウザで確認 & Slack向けサマリ生成
```

---

### Step 1: 要件を把握する

チケット / 会話 / 仕様書から以下を確定させる。不明点は **2問まで**、選択肢形式で聞く。

| 確定すべきこと | 例 |
|---|---|
| どの機能の画面か | 「注文一覧 + 詳細ページ」 |
| 主な操作フロー | 「一覧から選んで詳細へ、ステータスを変更できる」 |
| ユーザー種別 | 「管理者のみ」「一般ユーザー＋管理者で権限差あり」 |
| 含まないもの | 「モバイル対応は今回スコープ外」 |

---

### Step 2: 隣接画面を特定し、デザイントークンを実値で抽出する

**抽象的なデザインシステム調査より、実際の隣接画面のコピーが100倍速く「本物に寄せ」られる。**

#### 2-1. 最も近い既存画面を2〜3本選ぶ

```bash
# ルーティングからページコンポーネントを探す
find . -type f \( -name "page.tsx" -o -name "*.page.tsx" -o -name "*.screen.tsx" \) \
  | grep -v node_modules | grep -v ".next" | head -20

# ファイル名から推測して絞る
# 例: "List", "Detail", "Form", "Table" を含むもの
```

隣接画面の判断基準（優先順）:
1. 同じドメインの既存一覧・詳細画面（最優先）
2. 同じレイアウト構造（サイドバー有無・ヘッダ種別）を持つ画面
3. 同じコンポーネント（テーブル・カード・フォーム）を使っている画面

#### 2-2. 選んだ画面のコンポーネントを読んでトークン実値を抽出する

読むべき対象（多くても3ファイル、深追いしない）:

```bash
# tailwind使用時: config からカラーパレットを読む
cat tailwind.config.js tailwind.config.ts 2>/dev/null | head -80

# CSS変数使用時
grep -r "var(--" src/ --include="*.css" --include="*.module.css" -l | head -5

# shadcn/ui等: components/ui/ から実際のクラス名を読む
ls src/components/ui/ 2>/dev/null | head -20
```

抽出すべき実値:

| カテゴリ | 取り出すもの |
|---|---|
| **カラー** | ページ背景色・カード背景色・ボーダー色・プライマリ色・テキスト色の実値 |
| **スペーシング** | カードのpadding・セクション間のmarginの実値 |
| **タイポグラフィ** | 見出しのfont-size・font-weight・文字色 |
| **ボーダー** | border-radius・border-widthの実値 |
| **シャドウ** | カードやモーダルのbox-shadowの実値 |
| **コンポーネントマークアップ** | ボタン・バッジ・テーブル行のHTMLクラス構造をコピー |

---

### Step 3: 確認ポイントを策定する

「どう？」は禁止。**実装に直結する分岐点** だけを選ぶ。1モックあたり3〜6問が上限。

確認ポイントの種類と例:

| 種類 | 例 |
|---|---|
| **レイアウト選択** | 「一覧表示は カード形式 / テーブル形式 のどちら？」 |
| **情報の優先度** | 「サムネイルは必要？ 文字情報だけで十分？」 |
| **空状態の文言** | 「データが0件の時: 『まだデータがありません』でよい？」 |
| **アクションの配置** | 「編集・削除ボタンは行内 / ツールバー のどちら？」 |
| **必須 vs 任意項目** | 「このフォーム項目は必須にする？」 |
| **権限・表示切り替え** | 「一般ユーザーには削除ボタンを隠す？グレーアウト？」 |

---

### Step 4: HTMLモックを生成する

`tmp/mock-<機能名>-<YYYYMMDD>.html` に保存。単一ファイル完結（外部CDN・ライブラリ禁止）。

レンダリングの基本は `html-output` スキルの技法に従う。以下はこのスキル固有の追加要件。

#### 4-1. モックに必須の構成（この順序で）

1. **ヘッダ帯** — 既存アプリのヘッダをそのまま再現（ナビ・ロゴ・ユーザー名）
2. **画面本体** — 実装予定の画面。状態別に切り替えられるようにする（後述）
3. **注釈レイヤー** — 実値でない部分に明示的なラベルを貼る（後述）
4. **確認ポイント** — Step 3で策定した質問をラジオ選択式で提示
5. **フィードバックコピー欄** — 全回答 + 自由コメントを1クリックでコピー

#### 4-2. 必ず4状態を用意する

モックに「通常データあり状態」だけ作ってもPdMが気づけない罠が多い。  
状態切り替えタブ（`通常 / ローディング / 空 / エラー`）を上部に置く。

```html
<!-- 状態切り替えの例 -->
<div class="state-switcher">
  <button onclick="showState('normal')" class="active">通常</button>
  <button onclick="showState('loading')">ローディング</button>
  <button onclick="showState('empty')">空状態</button>
  <button onclick="showState('error')">エラー</button>
</div>
```

#### 4-3. 注釈ラベル（仮 vs 確定を区別する）

モックの中で「仮」の部分と「確定」の部分を明確にラベリングする。

```html
<!-- 仮文言ラベル -->
<span class="mock-label mock-wip">仮文言</span>

<!-- APIから取得する部分 -->
<span class="mock-label mock-api">APIから取得</span>

<!-- 確定済み -->
<span class="mock-label mock-fixed">確定</span>
```

```css
.mock-label {
  font-size: 10px; padding: 1px 6px; border-radius: 3px;
  font-weight: bold; vertical-align: middle; margin-left: 4px;
}
.mock-wip  { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.mock-api  { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
.mock-fixed { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
```

#### 4-4. 画面フローを矢印でつなぐ（複数画面がある場合）

画面遷移がある場合は、モックの下にフロー図（SVG）を添える。

```
[一覧画面] → クリック → [詳細画面] → 「ステータス変更」ボタン → [確認ダイアログ]
```

#### 4-5. 確認ポイントセクション（必須）

各質問はカード形式。ラジオ変更でフィードバックテキストが自動更新される。

```html
<section class="feedback-section">
  <h2>確認ポイント</h2>

  <div class="question-card">
    <div class="question-id">Q1</div>
    <div class="question-body">
      <p class="question-text">一覧の表示形式はどちらを希望しますか？</p>
      <div class="options">
        <label><input type="radio" name="q1" value="card"> カード形式（サムネイル付き）</label>
        <label><input type="radio" name="q1" value="table"> テーブル形式（情報密度高め）</label>
        <label><input type="radio" name="q1" value="discuss"> どちらでもよい / 要議論</label>
      </div>
    </div>
  </div>
  <!-- 質問を繰り返す -->
</section>
```

#### 4-6. フィードバックコピー欄（必須）

```html
<section class="copy-section">
  <h2>フィードバックをコピー</h2>
  <textarea id="feedback-text" rows="10" readonly></textarea>
  <button onclick="copyFeedback()">📋 コピー</button>
</section>

<script>
function updateFeedback() {
  const lines = ['## 画面モック フィードバック', ''];
  document.querySelectorAll('.question-card').forEach((card, i) => {
    const q = card.querySelector('.question-text').textContent;
    const checked = card.querySelector('input[type=radio]:checked');
    const a = checked ? checked.nextSibling.textContent.trim() : '（未回答）';
    lines.push(`Q${i+1}: ${q}`);
    lines.push(`A: ${a}`);
    lines.push('');
  });
  const memo = document.getElementById('free-comment').value;
  if (memo) { lines.push('## 自由コメント'); lines.push(memo); }
  document.getElementById('feedback-text').value = lines.join('\n');
}
</script>
```

---

### Step 5: ブラウザで確認 & 非同期向けサマリ

```bash
open tmp/mock-<機能名>-<YYYYMMDD>.html
```

**加えて**、PdMへSlack/Jiraで非同期共有するためのテキストを会話に出力する：

```
📐 [機能名] 画面モック作りました

確認ポイント (3点):
1. 一覧の表示形式: カード / テーブル ?
2. 空状態の文言はこれでいい?
3. 削除ボタンは一般ユーザーに見せる?

👉 HTMLで確認 → tmp/mock-xxxx.html
   (ブラウザで開いて各質問に回答 → コピーして返信してください)
```

---

## Gotchas（ハマりやすい罠）

### デザイントークンを「構造」から読んでも実値が出ない

tailwind.config で `colors: { primary: 'var(--color-primary)' }` のように変数参照になっている場合、  
実値は CSS ファイルか `:root` の定義を別途読まないと取れない。

→ **`grep -r -- "--color-" src/ --include="*.css" -l` で変数定義ファイルを先に探す。**

### shadcn/ui は Tailwind クラス名だけ読んでも再現できない

shadcn/uiのコンポーネントは `cn()` で動的にクラスが決まる。クラス名を写しても同じ見た目にならない。

→ **隣接画面のレンダリング済みHTMLをブラウザDevToolsでコピーするか、コンポーネントのtailwindクラスをベタ書きで展開する。**

### PdMに「どう？」と聞くと「いいと思います」が返ってくる

曖昧な確認は曖昧な合意しか生まない。  
→ **「テーブル派 / カード派 / どちらでも」のような排他選択を必ず用意する。**

### 状態が「通常のみ」だと空状態・エラーで「思ってたのと違う」が起きる

実際の画面は状態変化する。通常だけ合意しても空/エラーで手戻りが発生する。  
→ **4状態（通常 / ローディング / 空 / エラー）のタブ切り替えを必ず作る。**

### モックの「仮文言」がそのまま実装に混入する

モック上の「サンプルテキスト」「〇〇〇〇」が実装でコピペされる事故が起きる。  
→ **`仮文言` ラベルと `APIから取得` ラベルで明示的に区別する。**

### PdMがHTMLファイルを開けないケース

`.html` を送っても「ファイルどう開けばいい？」となることがある。  
→ **Step 5のSlackサマリに確認ポイントをテキストで列挙し、HTMLが開けなくても回答できるようにする。**

---

## 棲み分け

| スキル | 用途 |
|---|---|
| **pdm-mockup（本スキル）** | 実装前にPdMへ画面を見せ、確認ポイントに回答してもらう |
| **html-output** | 汎用HTML成果物（仕様書・レポート・設計図など）。モックの描画技法はここから借りる |
| **ui-change-report** | 自分が実装した変更を、スクショ付きで自己説明する（実装後） |
| **review-decision-aid-html** | PRレビュー指摘の対応方針を選択式HTMLで整理する |

---

## 完成チェックリスト

- [ ] 隣接画面のコードを読んでデザイントークン実値を抽出した
- [ ] ヘッダ・レイアウト構造が既存アプリの見た目に合っている
- [ ] 4状態（通常 / ローディング / 空 / エラー）の切り替えタブがある
- [ ] 仮文言・APIから取得・確定のラベルを貼り分けた
- [ ] 確認ポイントが3〜6問、排他選択形式で用意されている
- [ ] フィードバックコピー欄がある（ラジオ変更で自動更新）
- [ ] `tmp/mock-<機能名>-<YYYYMMDD>.html` に保存した
- [ ] `open tmp/...` でブラウザ確認した
- [ ] Slack/Jira向け非同期サマリテキストを会話に出力した
