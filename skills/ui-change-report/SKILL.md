---
name: ui-change-report
license: MIT
description: >-
  フロントエンドのUI・UXに変更を加えた直後に、変更内容をスクリーンショット付きのMarkdownレポートで自己報告するスキル。
  コンポーネント・画面・スタイル（CSS / SCSS / Tailwind / styled-components）・レイアウト・画像・表示文言など
  ビジュアルに影響する実装を終えたら、明示的に頼まれなくても発火させること。
  git diff から変更された画面を推定し、dev server を起動して、Claude Code では Playwright MCP / Claude in Chrome、
  Codex では Browser / Chrome プラグインなど実行環境で使えるブラウザツールで撮影、
  可能なら before/after を並べて「何が・なぜ変わったか」を説明する。
  「UIの変更を報告して」「スクショ付きで見せて」「画面どう変わった？」「ビフォーアフター見せて」「UI変更レポート」「ui-change-report」
  などの発言でも必ず使うこと。
  ただし型定義のみ・テストのみ・サーバ側ロジックのみ・import 並び替え・見た目を変えないリファクタや最適化など、
  ビジュアルに影響しない変更では発火しない。
  また、自分が実装していない外部サイト・競合サービスのスクショ取得（観察・参考用途。これは smart-browser の領域）や、
  UIから作成してDB・メール・後続処理まで検証する一気通貫テスト（これは e2e-flow-test の領域）、
  受入テストの証跡を残す petapeta-evidence とも別物で、本スキルは「自分が実装したUI変更内容の自己説明」に特化する。
aliases:
  - ui-report
  - uichange
---

# ui-change-report — UI/UX 変更の自己報告

フロントエンドを実装したあと、「で、画面はどう変わったの？」に**自分から**答えるためのスキル。

コードの diff だけ見せられても、UI の変更は伝わらない。色が変わった、余白が詰まった、ボタンが移動した —
これらは**目で見て初めて分かる**。だからスクショを撮り、何が・なぜ変わったかを言葉にして、Markdown レポートに残す。

> このスキルは「実装の最後の一歩」だ。コードを書き終えた ≠ 仕事が終わった。
> 変更が画面にどう現れるかを確認し、説明できて初めて UI 実装は完了する。

---

## いつ発火するか

UI/UX にビジュアルな影響を与える実装を**終えた直後**に、頼まれなくても発火する。
明示的に「UIの変更を報告して」「ビフォーアフター見せて」と言われた時も発火する。

### 撮る（発火する）変更

- `.tsx` / `.jsx` / `.vue` / `.svelte` / `.astro` の **JSX / template 部分**の変更
- `.css` / `.scss` / `.less` / CSS Modules の変更
- Tailwind / styled-components / emotion など**クラス名・スタイル定義**の追加・変更
- レイアウト構造（flex / grid / 配置順）の変更
- 画像・アイコン・フォントの差し替え
- **ユーザーに見える文言**（ラベル・ボタンテキスト・エラーメッセージ）の変更
- アニメーション・トランジション・hover/focus などインタラクションの変更

### 撮らない（発火しない）変更

ここを厳密に守る。auto-trigger なので、判定が緩いと些細な変更のたびに無駄にブラウザを起動してしまう。

- 型定義（`.d.ts` / interface / type）のみの変更
- テストファイル（`*.test.*` / `*.spec.*` / `__tests__/`）のみの変更
- コメント・import 並び替え・フォーマットのみ
- サーバ側ロジック（API ハンドラ・DB アクセス・バリデーション）でビジュアルに出ない変更
- ビルド設定・依存追加・環境変数（画面の見た目を変えない範囲）
- ユーザーに見えない定数・内部ロジック
- **見た目を変えないリファクタリング・パフォーマンス最適化・ロジックのみのバグ修正**
  （フック抽出 / `useMemo` でレンダ削減 / デバウンス修正 など、ピクセルが変わらない変更）
- **自分が実装していない外部サイト・競合サービスのスクショ取得**（観察・参考目的 — 別タスクで `smart-browser` を使う）
- **UI から作成して DB・メール・後続処理まで検証する一気通貫テスト**（`e2e-flow-test` の領域）

**迷ったら**: 「この変更で画面のピクセルが 1px でも変わるか？」を自問する。変わるなら撮る。変わらないなら撮らない。

---

## ワークフロー

```
1. 変更スコープ特定 → 2. framework 検出 & URL マッピング → 3. dev server 確保
→ 4. 撮影（before/after 判定込み）→ 5. Markdown レポート生成
```

### 実行環境の互換性

このスキルは Claude Code と Codex の両方で同じ `SKILL.md` を使う。
Claude 専用の MCP 名だけに依存せず、実行中のエージェントで利用できるブラウザ機能へ読み替える。

| 実行環境 | ローカル・公開ページ | 認証済みセッションが必要なページ | 備考 |
|---|---|---|---|
| Claude Code | Playwright MCP | Claude in Chrome | 既存の Claude 運用を維持する |
| Codex | Browser プラグイン（in-app browser） | Chrome プラグイン | localhost / file URL は Browser、ユーザーのログイン状態が必要なら Chrome |
| どちらも不可 | 使える CLI / 手動撮影を検討 | ユーザーに依頼 | 無理に外部ツールを導入しない |

Codex で repo-local skill として使う場合は、`skills/ui-change-report/` を Codex が読む skill root
（例: `~/.codex/skills/ui-change-report/` またはプロジェクトの `.agents/skills/ui-change-report/`）へ同期する。
本文・成果物フォーマットは Claude と共通に保つ。
Codex セッションで Browser / Chrome のツールが見えていない場合は、まず `browser` / `chrome` でツール発見し、
利用可能なブラウザ操作ツールへ読み替える。

### Step 1: 変更スコープを特定する

```bash
git diff --name-only origin/main...HEAD   # PR 想定。なければ HEAD~1..HEAD やワーキングツリー
git status --short                         # 未コミット変更も拾う
```

変更ファイル一覧から、上の「撮る／撮らない」基準でフィルタする。
**撮る対象が 1 つも無ければ、ここで終了**し「ビジュアルに影響する変更は無かった」とだけ報告する（ブラウザは起動しない）。

### Step 2: framework を検出し、変更ファイル → URL をマッピングする

`package.json` の dependencies / scripts から framework を判定する。
ファイルから URL への対応はルーティング規約に依存するので、framework ごとに変える:

| framework | 検出キー | ファイル → ルートの目安 |
|---|---|---|
| Next.js (app router) | `next` + `app/` ディレクトリ | `app/foo/page.tsx` → `/foo`、`app/page.tsx` → `/` |
| Next.js (pages router) | `next` + `pages/` ディレクトリ | `pages/foo.tsx` → `/foo`、`pages/index.tsx` → `/` |
| Vite + React Router | `vite` + `react-router-dom` | ルート定義ファイル（`App.tsx` 等）を読んで `path` を引く |
| Remix | `@remix-run/*` | `app/routes/foo.tsx` → `/foo` |
| SvelteKit | `@sveltejs/kit` | `src/routes/foo/+page.svelte` → `/foo` |
| Astro | `astro` | `src/pages/foo.astro` → `/foo` |

**共通コンポーネント**（`components/Button.tsx` のように特定ルートに紐づかないもの）を変更した場合、
影響範囲が広いので URL を機械的に決められない。この時は**それを使っている代表的な画面の URL をユーザーに尋ねる**:

```
共通コンポーネント（Button.tsx）の変更だね。どの画面で確認する？
1. ログイン画面 (/login)
2. ダッシュボード (/dashboard)
3. 全部
4. URLを直接指定
```

framework が判定できない・URL が引けない時も、**推測で突っ走らず対象 URL を尋ねる**。

### Step 3: dev server を確保する

すでに起動している dev server を最優先で使う（無駄に起動しない）:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3001|5173|4321|8080|5174)' || echo "no dev server"
```

起動していなければ `package.json` の scripts から起動コマンドを判断して**バックグラウンドで**起動し、
ポートが listen するまで待つ（`run_in_background: true` を使う）。起動コマンドが曖昧なら候補を提示して尋ねる。

### Step 4: 撮影する（before/after 判定込み）

#### 撮影ツールの選択（smart-browser には依存しない。standalone で判断する）

- **Claude Code / 認証済みセッション・ログインが必要** → Claude in Chrome（`mcp__claude-in-chrome__*`）。先に `tabs_context_mcp` でタブ状況を取る。
- **Claude Code / それ以外（公開ページ・ローカル開発）** → Playwright MCP（`mcp__plugin_playwright_playwright__*`）。ヘッドレスで速い。
- **Codex / localhost・file URL・公開ページ** → Browser プラグイン。ローカル UI 変更後の確認ではこれを第一候補にする。
- **Codex / ユーザーの Cookie・ログイン状態・既存タブが必要** → Chrome プラグイン。既存のユーザープロファイルが必要な時だけ使う。
- **どちらも未導入** → ユーザーに導入を案内し、撮影は中断（レポートのテンプレートだけ用意して説明文は埋める）。

各対象 URL について、必要なら複数ビューポートで撮る:
- デスクトップ（1280px 幅）は必ず
- レスポンシブ・モバイル対応の変更を含むなら 375px（モバイル）も撮る

#### before/after の判定（優先順位を守る — ここを雑にやると作業を壊す）

「変更後（after）」は今のコードでそのまま撮れる。問題は「変更前（before）」をどう再現するか。
**安全な順に**試し、無理なら after のみにする:

1. **deployed before URL がある** → staging / preview / 本番の旧バージョン URL をそのまま before として撮る。一番安全。
2. **git worktree で別ディレクトリに before を立てる**:
   ```bash
   git worktree add ../<repo>-before origin/main   # 比較したいベース
   # そのディレクトリで dev server を別ポート（例 3100）で起動して撮影
   # 撮り終えたら git worktree remove ../<repo>-before
   ```
   現在の作業ツリーを一切触らないので安全。dev server をもう一本立てる手間はかかる。
3. **`git stash -u` で退避**（最終手段）:
   ```bash
   git stash -u   # -u で未追跡ファイル（新規コンポーネント）も含める。これを忘れると before が壊れる
   # before を撮影
   git stash pop  # 必ず戻す。HMR が追従しない場合は dev server を再起動
   ```
   他作業中の WIP を巻き込む・pop 忘れで作業消失のリスクがある。1・2 が無理な時だけ。
4. **上記すべて無理** → after のみ撮り、「変更前は再現できなかったので after のみ」とレポートに明記する。

スクショは `.claude/ui-reports/<YYYYMMDD-HHMM>-<branch>/` に保存する（`before-<screen>.png` / `after-<screen>.png`）。
Codex で実行する場合も、Claude 互換を壊さないためユーザーから別指定がなければ同じ保存先を使う。
プロジェクトに `.codex/ui-reports/` の既存規約がある場合だけ、そちらを優先してよい。

### Step 5: Markdown レポートを生成する

`.claude/ui-reports/<YYYYMMDD-HHMM>-<branch>/report.md` に下記テンプレートで出力する。
生成後、**会話でもファイルパスとサマリを 2〜3 行で報告**する（レポートは詳細、会話は要約）。

---

## レポートのテンプレート

このフォーマットで出力する:

```markdown
# UI変更レポート: <ブランチ名 or 機能名>

- **日時**: YYYY-MM-DD HH:MM
- **ブランチ**: feature/xxx
- **変更スコープ**: <変更したフロントファイル数>ファイル / <画面数>画面
- **撮影ツール**: Playwright MCP | Claude in Chrome | Codex Browser | Codex Chrome
- **比較**: before/after | after のみ（理由: ...）

## サマリ

<このPR/変更で UI・UX がどう変わったかを 2〜4 行で。ユーザー目線で書く>

---

## 画面: <画面名>（`/path`）

| Before | After |
|---|---|
| ![before](./before-xxx.png) | ![after](./after-xxx.png) |

<!-- after のみの場合は After 列だけ -->

### 何が変わったか（WHAT）

- <見た目・配置・文言などの変化を箇条書き>

### なぜ変えたか（WHY / UX上の意図）

- <その変更がユーザー体験をどう良くするか。操作が減った/迷いが減った/視認性が上がった 等>

### 確認した観点

- [ ] レイアウト崩れがないか（デスクトップ）
- [ ] レスポンシブ（モバイル幅）※レイアウト変更がある場合
- [ ] hover / focus / disabled などの状態
- [ ] 既存機能のデグレがないか

---

<画面が複数あれば上記セクションを繰り返す>

## 残課題・気づき

- <撮影中に気づいた懸念・未対応・要レビュー箇所があれば>
```

---

## 他スキルとの棲み分け

紛らわしいので明確に書く:

- **ui-change-report（本スキル）**: 自分が今書いた UI 変更を、スクショ＋言葉で**自己説明する**。実装の最後の一歩。
- **petapeta-evidence**: 受入テスト（AT）の**証跡**。テストケースを実行し、操作ごとのスクショ・GIF を残す。「テストの合否を証明する」用途。
- **e2e-flow-test**: UI 操作 → DB → API → メールなど、**一気通貫の動作確認**フロー。「機能が end-to-end で動くか検証する」用途。
- **smart-browser**: ブラウザ操作の汎用基盤。**自分が実装していない外部サイト**のスクショ取得や情報収集はこちら。

判定の目安: 自分が書いた変更の説明 = 本スキル / テストの合否証跡 = petapeta-evidence / 機能の動作検証 = e2e-flow-test / 外部観察 = smart-browser。

---

## 注意点

- **ブラウザを無駄に起動しない**。Step 1 でビジュアル変更が無いと判定したら、即終了する。
- **実行環境を決め打ちしない**。Claude 用の MCP 名と Codex 用の Browser / Chrome プラグインは同じ役割の別実装として扱う。
- **作業ツリーを壊さない**。before 再現は worktree を優先し、stash は `-u` 付きの最終手段。`git stash pop` を忘れない。
- **推測で URL を決めない**。共通コンポーネントや framework 不明時は、選択肢を出してユーザーに尋ねる。
- **dev server は使い回す**。すでに動いていれば起動しない。worktree の before 用は別ポートで立てる。
- スクショと report.md は同じディレクトリに置き、相対パスでリンクする（後で移動しても崩れにくい）。
