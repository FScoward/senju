# foreign-pr-mode.md

`review-loop` Phase 9 の詳細手順。`IS_OWN_PR=false`（他人の PR）の場合のみ実行する。

**コード修正・commit・push は絶対に行わない。** 指摘は GitHub Review API を使って該当ファイルの該当行に紐づけたインラインコメントとして投稿する。

---

## 9-1. 投稿前の準備

```bash
# HEADコミットSHA（Reviews APIに必須）
COMMIT_SHA=$(gh pr view $PR_NUMBER --json headRefOid -q '.headRefOid')

# リポジトリ情報
OWNER=$(gh repo view --json owner -q '.owner.login')
REPO=$(gh repo view --json name -q '.name')

# diff内の追加行を確認（行番号の妥当性チェックに使用）
gh pr diff $PR_NUMBER > /tmp/pr.diff
```

---

## 9-2. 指摘の JSON への変換

各指摘の `ファイル名:行番号` を `comments[]` に変換する。

**変換ルール**:
- diff 内の追加行（`+` 行）への指摘 → `comments[]` に追加（`"side": "RIGHT"`）
- diff 外・削除行・行番号不明の指摘 → `fallback_comments` リストに退避

**投稿する JSON の構造**:
```json
{
  "commit_id": "<COMMIT_SHA>",
  "body": "## 🤖 AI レビュー（review-loop）\n\nCritical: X件 / Warning: Y件 / Minor: Z件 / Info: W件",
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

---

## 9-3. インラインコメントをバッチ投稿

```bash
# 1リクエストで全インラインコメントを投稿
gh api repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews \
  --method POST \
  --input /tmp/review-inline.json
```

**エラーハンドリング**:
- 422 が返った場合 → 特定の `comments[]` エントリが diff 外。そのエントリを除いて再投稿し、除いた指摘は `fallback_comments` に移す

---

## 9-4. diff 外指摘のフォールバック投稿

diff 内に存在しない行への指摘（既存コードへの言及など）は、インラインとして投稿できないため、まとめて一般 PR コメントとして追加する:

```bash
gh pr comment $PR_NUMBER --body "## 🤖 AI レビュー（行特定できなかった指摘）

以下の指摘はdiff外のため、インラインコメントで紐づけできませんでした。

- **[Critical]** FooService.kt 付近: 問題の説明
- **[Warning]** BarHelper.kt 付近: 問題の説明
"
```

---

## 9-5. 深掘りループ継続判定

他人の PR はコードを修正できないが、**指摘の深掘り**のためにループを継続する（最大 3 回）。

終了条件（いずれかを満たしたら Phase 10 へ）：
- 新たな指摘が 0 件だった（前回と同じ / 新規なし）
- iteration >= 3（深掘りループ上限に達した）

継続条件：
- 新規の Critical / Warning が発見された → Iteration N+1 へ（Phase 4 の深掘りモードで再実行）
- high confidence Minor が残る場合 → Phase 10 で判断を明記して終了するか、ユーザー文脈上 Warning 相当なら Warning に昇格して再ループする

**継続時の処理**: `PREV_FINDINGS` に今回の指摘サマリーをセットし、次イテレーションの各エージェントへ渡す。次イテレーションでは「前回の指摘を前提として、見落とした観点・深掘りが必要な点を探す」深掘りモードで実行する。
