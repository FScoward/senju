---
name: review-response-loop
description: PRレビュー指摘の修正が完了した後、QG（品質ゲート）→ commit → push → 全スレッドへの返信＆Resolve を一気通貫で実行するスキル。receive-review（トリアージ＋プラン）の後半ライフサイクルを自動化する。「修正終わった」「全部直した」「スレッド返信して」「QG回してpush」「レビュー対応の仕上げ」「review-response-loop」「返信してResolve」「レビュー対応完了まで」「修正してpushしてResolve」などの発言で必ずこのスキルを使うこと。receive-review のトリアージ結果（MUST/SHOULD/NICE/DISCUSS/DEFER）を受け取って実行フェーズに移行する場合にも使う。
license: MIT
---

# review-response-loop

receive-review（トリアージ＋プラン）で仕分けた指摘を、修正→QG→commit→push→返信＆Resolve まで一気に駆け抜ける。

## なぜこのスキルが必要か

receive-review はトリアージで止まる。実際の作業はその先：

```
修正実装 → QG → commit → push → 全スレッド返信＆Resolve
```

この後半ライフサイクルが毎PR手動で繰り返されている。本スキルはこれを構造化する。

---

## 前提

- receive-review（または手動トリアージ）で指摘が MUST / SHOULD / NICE / DISCUSS / DEFER に分類済み
- 修正対象のタスクリストが存在する（TodoWrite / タスクボード / 会話コンテキスト）
- PR が存在する場合は PR 番号がわかっている

---

## Phase 1: 修正実装（severity バッチ順）

### 実行順序

```
MUST → SHOULD → NICE（対応と判断されたもの） → DISCUSS（対応と判断されたもの）
```

DEFER はスキップ。各タスクについて：

1. **修正を実装する**
2. **タスクを完了にマークする**（TodoWrite / TaskUpdate）
3. **対応した thread ID を記録する**（Phase 4 で使う）

### thread ID とタスクの対応表

Phase 1 の開始時に、未解決スレッド一覧を取得して対応表を作る：

```bash
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=$(echo $OWNER_REPO | cut -d'/' -f1)
REPO=$(echo $OWNER_REPO | cut -d'/' -f2)

gh api graphql -f query='
query($owner:String!, $repo:String!, $number:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      reviewThreads(first:100) {
        nodes {
          id
          isResolved
          path
          line
          originalLine
          comments(first:1) {
            nodes {
              author { login }
              body
            }
          }
        }
      }
    }
  }
}' -F owner=$OWNER -F repo=$REPO -F number=$PR_NUMBER \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[]
    | select(.isResolved == false)
    | {id, path, line: (.line // .originalLine), author: .comments.nodes[0].author.login, body: (.comments.nodes[0].body | .[0:80])}'
```

この結果を使って「タスク ↔ thread ID」を path:line で紐付ける。

---

## Phase 2: QG（品質ゲート）

全修正が終わったら QG を実行する。プロジェクトの技術スタックを検出して適切なコマンドを選ぶ。

### 検出ロジック

```
backend/ に gradlew がある → Kotlin/Spring プロジェクト
package.json がある          → Node.js/TypeScript プロジェクト
両方ある                     → フルスタック（両方実行）
```

### Kotlin/Spring の場合

```bash
# 1. フォーマット
backend/gradlew -p backend ktlintFormat

# 2. ビルド + テスト
backend/gradlew -p backend build
```

### TypeScript/Next.js の場合

```bash
# 1. フォーマット
npx biome check --write .

# 2. 型チェック
npx tsc --noEmit

# 3. テスト
npx jest --passWithNoTests
```

### フルスタックの場合

BE と FE を並列で実行する（独立しているため）。

### QG 失敗時

- フォーマット修正は自動適用して続行
- ビルドエラー・テスト失敗は修正してから再実行
- 最大3回リトライ。3回失敗したら停止してユーザーに報告

---

## Phase 3: Commit + Push

### コミットメッセージ

```
APP-XXXX fix: address review feedback

- [MUST] 指摘1の要約
- [SHOULD] 指摘2の要約
- [NICE] 指摘3の要約
```

チケット番号はブランチ名から自動抽出（`feature/APP-XXXX` パターン）。

### Push

```bash
git push origin HEAD
```

push 前に `gh pr checks` で CI 状態を確認はしない（push 後に CI が走る）。

---

## Phase 4: スレッド返信 + Resolve

Phase 1 で記録した「タスク ↔ thread ID」対応表を使い、各スレッドに返信して Resolve する。

### per-thread フロー

```
スレッドを特定 → 意思決定を確認 → 返信コメント投稿（必須） → Resolve（カテゴリ次第）
```

**一括 Resolve は禁止**。直していないスレッドを Resolve する事故を防ぐため、タスク単位で実施する。

**返信なしのスキップも禁止**。DEFER・push back・スキップなど、どんな意思決定をしても必ずそのスレッドにコメントを残す。

### 返信コメントの生成

#### 対応済み（MUST / SHOULD / NICE）

```
対応しました。

{変更の説明}

[commit: {SHA}]
```

#### NICE をスキップした場合

```
今回はスキップします。

理由: {スキップの理由（スコープ外 / 優先度 / 別チケットで対応予定 など）}
```

#### DEFER（後続対応）

```
後続チケットで対応します。

チケット: {APP-XXXX}
対応内容: {概要}
```

#### push back（対応しない判断）

```
現状の実装を維持します。

理由: {技術的根拠}
```

#### DISCUSS（確認待ち）

```
{質問・確認内容}
```

### 投稿コマンド

```bash
THREAD_ID="<thread id>"
REPLY_BODY="対応しました。\n\n{変更の説明}\n\n[commit: $(git rev-parse --short HEAD)]"

# 返信
gh api graphql -f query='
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {
    pullRequestReviewThreadId: $threadId
    body: $body
  }) {
    comment { id }
  }
}' -F threadId="$THREAD_ID" -F body="$REPLY_BODY"

# Resolve
gh api graphql -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}' -F threadId="$THREAD_ID"
```

### 意思決定ごとの返信ルール

**どのカテゴリでも返信は必須**。意思決定の内容をスレッドに残す。

| カテゴリ | 返信内容 | Resolve |
|---------|---------|---------|
| MUST / SHOULD / NICE（対応済み） | 修正内容 + commit SHA | する |
| NICE（今回スキップ） | スキップ理由 | する |
| DISCUSS（対応した場合） | 修正内容 + commit SHA | する |
| DISCUSS（レビュアー確認待ち） | 質問・確認コメント | しない |
| DEFER（後続対応） | チケット番号 + 対応予定 | する |
| 対応不要（push back） | 技術的根拠を添えた返信 | しない（レビュアーの判断を待つ） |

### bot スレッドのスキップ

`copilot-pull-request-reviewer`, `coderabbitai`, `claude` 等の bot スレッドは自動 Resolve しない。人間レビュアーのスレッドのみ対象。

---

## Phase 5: 完了サマリ

全スレッドの処理が終わったら、サマリを出力する。

```
## レビュー対応サマリ

- 対応済み: N件（MUST: X, SHOULD: Y, NICE: Z）
- push back: N件（レビュアー返答待ち）
- DEFER: N件（チケット: APP-XXXX, APP-YYYY）
- 未解決スレッド: N件（DISCUSS 確認待ち）

commit: {SHA}
push: 完了
QG: PASS
```

---

## receive-review との連携

典型的なフロー：

```
1. 「レビューが来た」 → /receive-review でトリアージ
2. トリアージ結果を確認・承認
3. 「修正終わった」or「レビュー対応の仕上げ」 → /review-response-loop で仕上げ
```

receive-review が作成したタスクリスト（MUST/SHOULD/NICE/DISCUSS/DEFER）をそのまま引き継ぐ。receive-review を経由せず直接このスキルを呼んでもよい（その場合は Phase 1 の前にトリアージから始める）。

---

## 禁止事項

- **対応していないスレッドを Resolve しない**
- **push back は技術的根拠なしに行わない**（`receive-review` Step 2.5 の advisor 確認を参照）
- **DEFER のスレッドにチケット番号なしで「後で」と返信しない**
- **他人の PR のスレッドを承認なしに Resolve しない**（他人 PR の場合は返信内容をユーザーに確認してから投稿）
