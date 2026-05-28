# PR 差分入力の取得方法（MUST）

このドキュメントは review-loop / review-loop-duo の Phase 1 で **PR の変更ファイルと diff** を確定するための手順を定義する。
過去のインシデント（後述「失敗事例: PR #3600」）を再発させないために、ここに書かれた手順は **MUST** として守ること。

## なぜ重要か

`git diff origin/main..<PR-branch>` を素朴に使うと、PR ブランチが取り込んだ「**別 PR 由来の merge コミット**」が PR の変更として diff に現れる。
ローカルの `origin/main` ref が古ければ古いほど、別 PR が main にマージされた変更が「PR の変更」として混入する。

レビュアー（Claude Agent / Codex CLI）はこの汚染 diff を見て、別 PR 由来のコードに対して指摘を生成する。
duo の信頼度ラベリング（CONFIRMED = 両モデル合致）も、両者が同じ汚染入力を見ているため共倒れし、**CONFIRMED が偽陽性を高信頼で押し上げる** 事態になる。

したがって PR の「正しい変更ファイル一覧」と「正しい diff 本文」は、ローカル ref の鮮度に依存しない方法で取得する必要がある。

## 取得方法（3 案）

### A. GitHub API（推奨・第一選択）

`gh api` で PR の実変更ファイルを直接取得する。GitHub 側の merge-base 計算結果を信頼するため、ローカル ref の鮮度に依存しない。

```bash
# 変更ファイル一覧
gh api repos/{owner}/{repo}/pulls/{N}/files --paginate -q '.[].filename' | sort -u

# diff 本文（patch フィールド）
gh api repos/{owner}/{repo}/pulls/{N}/files --paginate -q '.[].patch'
```

- 利点: GitHub の正解そのもの。merge コミット由来のノイズは原理的に混入しない
- 欠点: API rate limit（通常運用では問題にならない）
- **review-loop / review-loop-duo の既定**

### B. merge-base 基準の git diff（API 不可時のフォールバック）

```bash
git fetch origin main  # 先に origin/main を最新化することが必須
git diff $(git merge-base origin/main pr-{N})..pr-{N}
```

- 利点: ローカル完結
- 欠点: `git fetch` 漏れ・失敗を検知しない運用だと、結局 A 案を使う動機と同じ事故が起きる
- 注意: `git fetch origin main 2>/dev/null` で失敗を握り潰さないこと

### C. PR の commit に閉じた diff（差分ファイル一覧の補助）

```bash
git log origin/main..pr-{N} --name-only
```

- 利点: PR の commit 群に含まれるファイルだけを列挙できる
- 欠点: merge コミットを含む場合の挙動が紛らわしい
- 用途: A 案の結果と突合する補助手段（数が一致しなければ A 案が正解）

## 禁止事項

- ❌ `git diff origin/main..<PR-branch>` を素朴に使う（origin/main が古い場合に別 PR の変更を取り込む）
- ❌ `git fetch origin main 2>/dev/null` で fetch 失敗を握り潰す
- ❌ `CHANGED_FILES` を取らずに Phase 4 を起動する
- ❌ レビュアー（Claude Agent / Codex）にファイル絞り込みを伝えずに diff だけ渡す

## Phase 4 起動前のチェックリスト

Phase 4-A / 4-B を起動する前に以下が完了していることを確認する:

- [ ] `HAS_PR=true` の場合、`gh api repos/.../pulls/{N}/files` で `CHANGED_FILES` を取得済み
- [ ] `CHANGED_FILES` を `.omc/review-loop-state.json` の `pr_changed_files[]` に保存済み
- [ ] diff 本文は A 案（gh api の patch）または B 案（merge-base 基準）で取得済み
- [ ] `git diff origin/main..<PR-branch>` を素朴に使っていない
- [ ] Phase 4-A / 4-B のプロンプトに `<PR_CHANGED_FILES>` ブロックを埋め込み、scope guard を明示している

## scope guard プロンプト雛形

各 reviewer Agent / Codex に必ず以下を追加する:

```
レビュー対象は以下の <PR_CHANGED_FILES> リストに含まれるファイルのみ。
これ以外のファイルへの指摘は、たとえ diff 本文に出てきても出さないこと。
diff 本文には merge コミット由来のノイズが混じる可能性があるため。

<PR_CHANGED_FILES>
{{filenames_from_gh_api}}
</PR_CHANGED_FILES>
```

## Phase 6 の scope filter

各 finding の `path` が `CHANGED_FILES` に含まれているか機械的に検証し、含まれていなければ自動で破棄する。
破棄件数は Phase 10 完了レポートに「Out-of-scope findings discarded: N」として表示すること。

## 失敗事例: PR #3600（2026-05-28）

### 何が起きたか

- review-loop-duo を実行し、Claude + Codex CLI で 13 件指摘（Critical 2 / Warning 7 / Minor 4）を PR にレビュー投稿
- ユーザーから「本当に混入してる？」と問われ確認したところ、**13 件中 5 件が完全な誤指摘** だった
- 撤回した 5 件:
  - `PR-SCOPE-VIOLATION`（interview 系 OpenAI proxy 混入）
  - `CROSS-SURVEY-STATE-LEAK`（sessionStorage）
  - `MISSING-RATE-LIMIT`（openai proxy）
  - `PII-LOG-LEAK`（summarize console.log）
  - `LOSSY-FALLBACK-BEFORE-SIDE-EFFECT`（edit page submit）
- これら 5 件は **PR #3600 の変更ではなく、別 PR で既に main にマージ済みの変更** だった
- 投稿済みレビューは `PUT /repos/.../reviews/{review_id}` で訂正版に上書きして対応

### 失敗の機序

1. Phase 1 / Phase 4 で **PR 差分を `git diff origin/main..pr-3600` で取得** した
2. ローカル `origin/main` ref が古く、PR ブランチが merge コミット（`Merge remote-tracking branch 'origin/main' into ...`）で取り込んだ「別 PR 由来の新しい main の変更」が、`origin/main..pr-3600` の diff に「PR の変更」として現れた
3. Claude 側 4 観点と Codex 側 1 本に同じ汚染 diff を渡したため、両モデルが共倒れで誤指摘を量産
4. duo の信頼度ラベリング（CONFIRMED = 両モデル合致 = 信頼度昇格）が機能せず、CONFIRMED が偽陽性を高信頼で押し上げた

### 教訓

- **両モデルが同じ汚染入力を見ている場合、CONFIRMED は信頼度のシグナルにならない**
- Phase 1 で `CHANGED_FILES` を必ず `gh api` 経由で取得し、入力の正当性を CONFIRMED の前提条件とすること
- PR-SCOPE-VIOLATION 系の指摘を投稿する前に、必ず `gh api .../pulls/N/files` で実在を確認する
- 既存レビューが指摘していない大規模な scope violation は、**自分の diff 取得が壊れている兆候**

### 再発防止チェック

レビュー投稿前に最低限以下を確認する:

- [ ] Phase 1 で取得した `CHANGED_FILES` の件数を完了レポートに記載しているか
- [ ] Phase 6 で out-of-scope として破棄した finding の件数を完了レポートに記載しているか
- [ ] PR-SCOPE-VIOLATION 系の指摘を出した場合、その path が `gh api .../files` の結果に含まれることを再確認したか
- [ ] CONFIRMED 指摘について、Phase 1 の入力取得が A 案（gh api）で行われているか
