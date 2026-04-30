---
description: PRのAIレビューを指摘事項（Critical/Warning）がゼロになるまで自動ループするスキル。PRなし（ローカルdiff）モード対応で、kouunryuusui QG-3 Stage 2からも直接呼び出し可能。「指摘が無くなるまでレビューして」「クリーンになるまでレビュー」「review-loop」「全部直してから終わって」「指摘ゼロになるまで続けて」「レビューを繰り返して」などの指示で必ず使うこと。6観点（コーディング規約・アーキテクチャ・セキュリティ・サイレント障害・要件充足・テスト妥当性）を並列レビューし、修正→再レビューを最大5回繰り返して自動的にコードをクリーンな状態にする。指摘が出続ける限り止まらない点が parallel-review との違い。
license: MIT
metadata:
    github-path: skills/review-loop
    github-ref: refs/heads/main
    github-repo: https://github.com/FScoward/senju
    github-tree-sha: d7e5a671f7181ce4b86c29cefd7993ec57b1692d
name: review-loop
---
# review-loop

PRのAIレビューを指摘事項が**ゼロになるまで**自動ループする。

**PR ありモード**: `gh pr diff` で PR 差分を取得し、各イテレーション後に GitHub インラインコメントを投稿する。  
**PR なしモード**: `git diff $BASE...HEAD` でローカル差分を使用。インラインコメント投稿をスキップし、commit のみ行い push は行わない（kouunryuusui QG からの呼び出しを想定）。

`/parallel-review` が「1サイクル（Critical再チェック込み）」で終わるのに対し、
このスキルは「Critical/Warning がゼロになるまで何度でも繰り返す」。

## ループフロー

```
[Iteration N]
  │
  ├─ 6観点を並列レビュー（run_in_background: true × 6）
  │
  ├─ 全指摘を統合・集計
  │    Critical: X件 / Warning: Y件 / Info: Z件
  │
  ├─ X == 0 AND Y == 0？
  │    YES → ✅ 完了（Phase 4へ）
  │
  ├─ N >= 5 AND 残指摘あり？
  │    YES → 🙋 ユーザーに「続けますか？」と確認
  │            A: はい  → max_iterations += 5、Iteration N+1 へ
  │            B: いいえ → ⚠️ 残指摘サマリー（Phase 4へ）
  │
  ├─ 同じ指摘が収束（自動修正不可）？
  │    YES → ⚠️ 手動対応サマリー（Phase 4へ）
  │
  └─ それ以外 → 修正を適用 → commit（PR ありの場合のみ push）→ Iteration N+1
```

**収束チェック（無限ループ防止）**:
前回と同じ件数・同じファイルの指摘が繰り返される場合（auto-fix 不可の指摘が残っている状態）は、
それ以上ループしても意味がないため「手動対応が必要な指摘あり」として終了する。

---

## Phase 0: 初期化

### モード判定（最初に実行）

```bash
# PR の存在確認
PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null)
if [ -n "$PR_NUMBER" ] && [ "$PR_NUMBER" != "null" ]; then
  HAS_PR=true
else
  HAS_PR=false
  PR_NUMBER=""
fi

# チケットID（ブランチ名から抽出、なければ空文字）
TICKET_ID=$(git branch --show-current | grep -oE '[A-Z]+-[0-9]+' | head -1 || echo "")

if [ "$HAS_PR" = "true" ]; then
  # PR ありモード
  DIFF_CMD="gh pr diff ${PR_NUMBER}"
  PR_BODY=$(gh pr view $PR_NUMBER --json body -q '.body' 2>/dev/null || echo "")
else
  # PR なしモード: ベースブランチを検出してローカル diff を使う
  BASE=$(cat .claude/tmp/base-branch.txt 2>/dev/null \
    || git rev-parse --abbrev-ref @{upstream} 2>/dev/null \
    || echo "origin/main")
  DIFF_CMD="git diff ${BASE}...HEAD"
  # AC 情報: sprint-contract.md → scratch.md → なし の優先順で取得
  PR_BODY=$(cat sprint-contract.md 2>/dev/null || cat scratch.md 2>/dev/null || echo "")
fi
```

### 自分のPRかどうかの判定（修正可否の決定）

```bash
if [ "$HAS_PR" = "true" ]; then
  PR_AUTHOR=$(gh pr view $PR_NUMBER --json author -q '.author.login')
  CURRENT_USER=$(gh api user -q '.login')
  if [ "$PR_AUTHOR" = "$CURRENT_USER" ]; then
    IS_OWN_PR=true
  else
    IS_OWN_PR=false
  fi
else
  # PR なしモード: 常に自分のコード
  IS_OWN_PR=true
fi
```

**`IS_OWN_PR=false` の場合（他人のPR）**:
- レビューは全て実行する（指摘内容を報告する）
- **コードへの修正・Edit・commit・push は一切行わない**
- Phase 3 はスキップし、代わりに **Phase 3b** でインラインコメントとして投稿する
- 各指摘を該当ファイルの該当行に紐づけてGitHub Reviewとして1件で投稿する
- ループは「修正なし → 指摘が減らないため1回で終了」となる

---

状態を `.omc/review-loop-state.json` に記録:
```json
{
  "pr_number": 0,
  "has_pr": true,
  "base": "origin/main",
  "diff_cmd": "gh pr diff 123",
  "ticket_id": "",
  "is_own_pr": true,
  "max_iterations": 5,
  "current_iteration": 0,
  "iterations": [],
  "status": "running"
}
```

---

## Phase 1（各イテレーション）: 6観点並列レビュー

**1メッセージで6つのAgentを同時起動**（`run_in_background: true`）。

各レビュアーへの共通追加指示:
- `{DIFF_CMD}` で差分を取得してレビュー対象を絞ること（リポジトリ全体を見ない）
  - PR ありモード: `gh pr diff {PR_NUMBER}`
  - PR なしモード: `git diff {BASE}...HEAD`
- 指摘は `ファイル名:行番号` 形式で具体的に
- **行番号はdiff内の追加行（`+` で始まる行）に存在する行を優先して特定すること**（PR ありモード: インラインコメント投稿に使用）
- 重大度を **Critical / Warning / Info** で分類
- 修正案は Before/After のコード例を含める
- 出力の**最終行**に必ず `FINDINGS: {critical}C {warning}W {info}I` の形式で集計を記載
- **PR ありモードのみ**: `FINDINGS:` 行の**直前**に `INLINE_COMMENTS_JSON:` ブロックを出力すること（後述フォーマット参照）
- **PR なしモード**: `INLINE_COMMENTS_JSON:` ブロックの出力は不要

**`INLINE_COMMENTS_JSON:` ブロックのフォーマット**（PR ありモードのみ）:

```
INLINE_COMMENTS_JSON:
[
  {
    "path": "src/foo/Bar.kt",
    "line": 42,
    "side": "RIGHT",
    "body": "**[Critical]** 問題の説明\n\n```kotlin\n// Before\nval x = ...\n// After\nval x = ...\n```"
  }
]
INLINE_COMMENTS_JSON_END
```

- `path`: 差分内のファイルパス（リポジトリルートからの相対パス）
- `line`: 差分の右辺（変更後）の行番号。削除のみの場合は `side: "LEFT"`
- `body`: GitHub Markdown 形式。先頭に `**[Critical]**` / `**[Warning]**` / `**[Info]**` を付ける
- **Info は `body` 末尾に `<!-- info-only -->` を付加する**（Phase 2.5 でフィルタリングに使用）
- 指摘がない場合は空配列 `[]` を出力する

### 1. coding-rules レビュアー

```
Agent(
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "コーディング規約レビュー（iteration {N}）",
  prompt: """
  あなたはコーディング規約の専門レビュアーです。

  変更差分をコーディング規約の観点でレビューしてください。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 変更ファイルを読み取り、以下の観点でレビュー

  チェック観点:
  - 命名規則（変数・関数・クラス名の一貫性）
  - 関数・メソッドの長さと複雑度
  - コメントの適切さ（WHYを説明しているか）
  - 重複コードの排除（DRY原則）
  - 言語・フレームワーク固有のイディオム違反
  - フォーマット・インデントの統一性
  - マジックナンバー・ハードコード値

  出力形式:
  - [重大度] ファイル名:行番号 - 問題の説明
  - Before/After コード例

  最終行: FINDINGS: {critical}C {warning}W {info}I
  """
)
```

### 2. architecture レビュアー

```
Agent(
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "アーキテクチャレビュー（iteration {N}）",
  prompt: """
  あなたはアーキテクチャの専門レビュアーです。

  変更差分をアーキテクチャ観点でレビューしてください。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 変更ファイルを読み取り、以下の観点でレビュー

  重点チェック:
  - レイヤー間の依存方向（上位レイヤーが下位に依存していないか）
  - ドメインロジックの適切な配置（ビジネスロジックがUIやDBに漏れていないか）
  - 責務分離（単一責任原則）
  - インターフェース設計（疎結合・高凝集）
  - 副作用の局所化

  最終行: FINDINGS: {critical}C {warning}W {info}I
  """
)
```

### 3. security レビュアー

```
Agent(
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "セキュリティレビュー（iteration {N}）",
  prompt: """
  あなたはセキュリティ専門のレビュアーです。

  変更差分をセキュリティ観点でレビューしてください。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 変更ファイルを読み取り、以下の観点でレビュー

  チェック観点:
  - OWASP Top 10（SQLインジェクション、XSS、CSRF等）
  - 認証・認可（権限チェック漏れ、IDOR）
  - 入力バリデーション（未検証のユーザー入力）
  - シークレット管理（ハードコード認証情報）
  - データ露出（ログへの機密情報出力）
  - マルチテナント環境ではテナント分離（tenantIdフィルタ漏れ）

  最終行: FINDINGS: {critical}C {warning}W {info}I
  """
)
```

### 4. silent-failure レビュアー

```
Agent(
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "サイレント障害検出（iteration {N}）",
  prompt: """
  あなたはサイレント障害の検出に特化したレビュアーです。

  変更差分でサイレント障害リスクを検出してください。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 以下のパターンを検出

  検出パターン:
  - 空catchブロック（例外を握りつぶし）
  - 戻り値の無視（Result型・Optional）
  - 暗黙のフォールバック（エラー時にデフォルト値で続行）
  - FailFast回避（空リスト・nullを返して続行）
  - ログなし例外処理
  - switch/when 文の網羅漏れ
  - 非同期処理のエラー無視

  最終行: FINDINGS: {critical}C {warning}W {info}I
  """
)
```

### 5. requirements レビュアー

```
Agent(
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "要件充足度レビュー（iteration {N}）",
  prompt: """
  あなたは要件充足度を検証する専門レビュアーです。

  チケット {TICKET_ID} のACと変更差分の実装を照合してください。
  （チケットIDがない場合はこのレビューをスキップして FINDINGS: 0C 0W 0I と返す）

  【PR ありモード（PR_NUMBER が指定されている場合）】
  手順:
  1. `{DIFF_CMD}` でPR差分を取得
  2. `gh pr view {PR_NUMBER} --json body -q '.body'` でPR descriptionのAC項目を取得
  3. 各AC項目を実装と照合し、漏れ・乖離・スコープクリープを検出

  【PR なしモード（PR_NUMBER が空の場合）】
  手順:
  1. `{DIFF_CMD}` でローカル差分を取得
  2. `cat sprint-contract.md 2>/dev/null || cat scratch.md 2>/dev/null` でAC情報を取得
  3. AC情報が取得できない場合は FINDINGS: 0C 0W 0I と返す
  4. 各AC項目を実装と照合し、漏れ・乖離・スコープクリープを検出

  出力形式:
  各ACに対して: AC項目 / 充足状態（✅/⚠️/❌）/ 対応実装箇所

  最終行: FINDINGS: {critical}C {warning}W {info}I
  """
)
```

### 6. test-adequacy レビュアー

```
Agent(
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "テストケース妥当性レビュー（iteration {N}）",
  prompt: """
  あなたはQAの専門レビュアーです。
  テストケースがACを適切にカバーしているか検証してください。

  【PR ありモード（PR_NUMBER が指定されている場合）】
  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. `gh pr view {PR_NUMBER} --json body -q '.body'` でPR descriptionのテストケースを取得
  3. 実装されたテストファイルの内容を確認

  【PR なしモード（PR_NUMBER が空の場合）】
  手順:
  1. `{DIFF_CMD}` でローカル差分を取得
  2. `cat sprint-contract.md 2>/dev/null || cat scratch.md 2>/dev/null` でAC/テスト基準を取得
  3. 差分内の *Test.kt / *.test.ts / *.test.tsx ファイルを確認
  4. AC情報が取得できない場合は FINDINGS: 0C 0W 0I と返す

  チェック観点:
  - AC未カバーのテストケース
  - 期待結果の曖昧さ（「正常に表示される」等）
  - エッジケース・異常系の不足
  - テスト間の依存関係（前のテストに依存）

  最終行: FINDINGS: {critical}C {warning}W {info}I
  """
)
```

---

## Phase 2: 結果集計・ループ判定

6エージェント完了後、各出力末尾の `FINDINGS: XC YW ZI` 行をパースして集計する。

```
Total Critical: X件
Total Warning:  Y件
Total Info:     Z件（修正対象外）
```

**ループ継続判定**:

| 条件 | アクション |
|------|-----------|
| Critical=0 AND Warning=0 | ✅ **完了** → Phase 4 |
| 前回と全く同じ指摘（収束） | ⚠️ **手動対応が必要** → Phase 4 |
| iteration >= 5 AND Critical/Warning > 0 | 🙋 **ユーザーに継続するか尋ねる** |
| それ以外 | 🔄 **Phase 3 へ（修正して再ループ）** |

**最大回数到達時のユーザー確認**:

```
## ⏸️ Review Loop — 5回完了しましたが、まだ指摘が残っています

| 指摘の種類 | 件数 |
|-----------|------|
| Critical  |   X  |
| Warning   |   Y  |

残っている主な指摘:
- [Critical] ファイル名:行番号 - 概要
- [Warning] ファイル名:行番号 - 概要

引き続きループを続けますか？

A) はい — さらに5回ループを続ける
B) いいえ — 残指摘をサマリーして終了
```

---

## Phase 2.5: インラインコメントをPRに投稿

> **⛔ `HAS_PR=false`（PR なしモード）の場合はこのPhaseをスキップ。**
> PR が存在しない状態ではインラインコメントを投稿できない。GitHub 連携は PR 作成後に行う。

6エージェントの出力から `INLINE_COMMENTS_JSON:` ブロックを全て抽出・統合し、
GitHub PR Review として一括投稿する。

### 2.5-1. JSONの抽出・統合

各エージェント出力の `INLINE_COMMENTS_JSON:` ～ `INLINE_COMMENTS_JSON_END` の間を抽出し、
全コメントを1つの配列に統合する。**Info (`<!-- info-only -->`) はここで除外する**（Critical/Warning のみ投稿）。

### 2.5-2. ヘッドコミットSHAを取得

```bash
COMMIT_ID=$(gh pr view {PR_NUMBER} --json headRefOid -q '.headRefOid')
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
```

### 2.5-3. PRレビューとしてインラインコメントを一括投稿

```bash
# comments を JSON で組み立てて gh api で送信
# 例: jq を使って動的に組み立てる

COMMENTS_JSON='[コメントの配列]'

gh api "repos/{REPO}/pulls/{PR_NUMBER}/reviews" \
  --method POST \
  --field commit_id="{COMMIT_ID}" \
  --field body="## AI Review Loop — Iteration {N}\n\n| 観点 | Critical | Warning | Info |\n|---|---|---|---|\n| コーディング規約 | X | Y | Z |\n| アーキテクチャ | X | Y | Z |\n| セキュリティ | X | Y | Z |\n| サイレント障害 | X | Y | Z |\n| 要件充足度 | X | Y | Z |\n| テスト妥当性 | X | Y | Z |\n\n**合計: {total_critical}C / {total_warning}W**" \
  --field event="COMMENT" \
  --field "comments={COMMENTS_JSON}"
```

投稿後にレスポンスの `html_url` をログ出力してリンクを確認する。

### 2.5-4. 投稿エラー時の扱い

- `line` がdiff範囲外の場合 → `position` 指定に切り替えて再試行
- それでも失敗した場合 → そのコメントをPR本文コメント（`gh pr comment`）にフォールバック
- **インラインコメント投稿失敗はレビューループを止めない**（修正フェーズは続行する）

---

## Phase 3: 修正の適用

> **⛔ `IS_OWN_PR=false` の場合はこの Phase を丸ごとスキップ。**
> 他人のPRへのコード修正・commit・push は絶対に行わない。

### 3-1. コード修正（Critical / Warning のみ）

1. 指摘ファイルを `Read`
2. `Edit` で修正を適用
3. フォーマット・型チェック（プロジェクトのlintコマンドを実行）

**修正できない指摘の扱い**:
設計判断・仕様確認が必要な指摘は自動修正せず「手動対応リスト」に追加してループから除外する。

### 3-2. Commit & Push

```bash
git add -A
git commit -m "review-loop: iter{N} - fix {X}C {Y}W ({ファイル名の簡単なサマリ})"

# PR ありモードのみ push する
# PR なしモード（kouunryuusui QG 等）では push しない（T5 の Push 確認まで push を保留）
if [ "$HAS_PR" = "true" ]; then
  git push
fi
```

### 3-3. 状態更新

`.omc/review-loop-state.json` を更新:
```json
{
  "iterations": [
    {
      "iteration": 1,
      "critical": 3,
      "warning": 5,
      "info": 2,
      "auto_fixed": 8,
      "manual_required": 0,
      "commit": "abc1234"
    }
  ]
}
```

---

## Phase 3b（他人のPR専用）: インラインコメント投稿

> **このPhaseは `IS_OWN_PR=false` の場合のみ実行する。コード修正・commit・push は絶対に行わない。**

指摘をまとめて1件の一般PRコメントにするのではなく、
GitHub Review APIを使って各指摘を**該当ファイルの該当行に紐づけたインラインコメント**として投稿する。

### 3b-1. 投稿前の準備

```bash
# HEADコミットSHA（Reviews APIに必須）
COMMIT_SHA=$(gh pr view $PR_NUMBER --json headRefOid -q '.headRefOid')

# リポジトリ情報
OWNER=$(gh repo view --json owner -q '.owner.login')
REPO=$(gh repo view --json name -q '.name')

# diff内の追加行を確認（行番号の妥当性チェックに使用）
gh pr diff $PR_NUMBER > /tmp/pr.diff
```

### 3b-2. 指摘のJSONへの変換

各指摘の `ファイル名:行番号` を `comments[]` に変換する。

**変換ルール**:
- diff内の追加行（`+` 行）への指摘 → `comments[]` に追加（`"side": "RIGHT"`）
- diff外・削除行・行番号不明の指摘 → `fallback_comments` リストに退避

**投稿するJSONの構造**:
```json
{
  "commit_id": "<COMMIT_SHA>",
  "body": "## 🤖 AI レビュー（review-loop）\n\nCritical: X件 / Warning: Y件 / Info: Z件",
  "event": "COMMENT",
  "comments": [
    {
      "path": "src/main/kotlin/FooService.kt",
      "line": 42,
      "side": "RIGHT",
      "body": "**[Critical]** 問題の説明\n\n**Before:**\n```kotlin\n// 修正前のコード\n```\n\n**After:**\n```kotlin\n// 修正後のコード\n```"
    },
    {
      "path": "src/main/kotlin/BarController.kt",
      "line": 17,
      "side": "RIGHT",
      "body": "**[Warning]** 問題の説明"
    }
  ]
}
```

### 3b-3. インラインコメントをバッチ投稿

```bash
# 1リクエストで全インラインコメントを投稿
gh api repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews \
  --method POST \
  --input /tmp/review-inline.json
```

**エラーハンドリング**:
- 422 が返った場合 → 特定の `comments[]` エントリがdiff外。そのエントリを除いて再投稿し、除いた指摘は `fallback_comments` に移す

### 3b-4. diff外指摘のフォールバック投稿

diff内に存在しない行への指摘（既存コードへの言及など）は、
インラインとして投稿できないため、まとめて一般PRコメントとして追加する:

```bash
gh pr comment $PR_NUMBER --body "## 🤖 AI レビュー（行特定できなかった指摘）

以下の指摘はdiff外のため、インラインコメントで紐づけできませんでした。

- **[Critical]** FooService.kt 付近: 問題の説明
- **[Warning]** BarHelper.kt 付近: 問題の説明
"
```

### 3b-5. Phase 4へ

他人のPRはコードを修正できないため、Phase 3b 完了後は **1回でPhase 4へ進む**。
（コードが変わらない → 再レビューしても同じ指摘が出る → ループしても無意味）

---

## Phase 4: 完了レポート

### ✅ クリーン達成（PR ありモード）

```
## ✅ Review Loop 完了 — Critical/Warning がゼロになりました！

| Iter | Critical | Warning | Info | Auto-fix | PR Review |
|------|----------|---------|------|----------|-----------|
| #1   |        3 |       5 |    2 |        8 | https://github.com/…/pull/N#pullrequestreview-xxx |
| #2   |        1 |       2 |    1 |        3 | https://github.com/…/pull/N#pullrequestreview-yyy |
| #3   |        0 |       0 |    1 |        — | —                                                  |

総修正: 11件 / 3イテレーション
PRはレビュー観点でクリーンな状態です。
各イテレーションのインラインコメントはPR上で確認できます。
```

### ✅ クリーン達成（PR なしモード）

```
## ✅ Review Loop 完了 — Critical/Warning がゼロになりました！

| Iter | Critical | Warning | Info | Auto-fix | Commit  |
|------|----------|---------|------|----------|---------|
| #1   |        3 |       5 |    2 |        8 | abc1234 |
| #2   |        1 |       2 |    1 |        3 | def5678 |
| #3   |        0 |       0 |    1 |        — | —       |

総修正: 11件 / 3イテレーション
コードはレビュー観点でクリーンな状態です。
※ PR なしモードで実行。push は呼び出し元（T5 Push 確認）で行います。
```

### ⚠️ 残指摘あり（収束 or ユーザーが終了を選択）

```
## ⚠️ Review Loop 終了 — 手動対応が必要な指摘が残っています

## 手動対応が必要な指摘
- [Critical] ServiceImpl.kt:45 - 設計判断が必要（...）
- [Warning]  Controller.kt:12 - 仕様確認が必要（...）

{PR ありモードの場合}
PR Review URL: https://github.com/…/pull/N#pullrequestreview-zzz
次のアクション: PR上のインラインコメントを確認して対応方針を決めてください。

{PR なしモードの場合}
次のアクション: 上記の指摘を手動で確認して対応してください。
```

---

## 注意事項

- **⛔ 他人のPRは修正禁止**: PRの作成者が自分でない場合、Edit・commit・push は一切行わない
- **PR ありモード: commit & push はイテレーション毎に実行**する（次のレビューが最新の差分を見るために必須）
- **PR なしモード: commit のみ、push は行わない**（呼び出し元 T5 の Push 確認まで push を保留）
- **PR ありモード: インラインコメントはイテレーション毎に投稿**する（Phase 2.5 は各イテレーションで必ず実行）
- **PR なしモード: Phase 2.5（インラインコメント投稿）はスキップ**する
- **Info はインラインコメントから除外**する（`<!-- info-only -->` タグでフィルタリング）
- **手動対応リストに入った指摘**は以降のループ判定から除外する
- **このスキルは featureブランチのみ**で使用する（mainへの直接pushは行わない）
- **インラインコメント投稿失敗はループを止めない**（フォールバックとして `gh pr comment` を使用）
- **kouunryuusui QG からの呼び出し時**: PR なしモードで動作する。QG-3 Stage 1（mihari）で既にテスト充足性・AC 適合を確認済みのため、requirements / test-adequacy 観点での指摘は参考情報として扱ってよい
