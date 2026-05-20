# inline-comment-posting.md

`review-loop` Phase 7 の詳細手順。PR ありモード（`HAS_PR=true`）のときのみ実行する。

8 エージェントの出力から `INLINE_COMMENTS_JSON:` ブロックを全て抽出・統合し、GitHub PR Review として一括投稿する。

---

## 7-1. JSON の抽出・統合

各エージェント出力の `INLINE_COMMENTS_JSON:` 〜 `INLINE_COMMENTS_JSON_END` の間を抽出し、全コメントを 1 つの配列に統合する。**Minor (`<!-- minor-only -->`) と Info (`<!-- info-only -->`) はここで除外する**（Critical/Warning のみ投稿）。

---

## 7-2. ヘッドコミット SHA を取得

```bash
COMMIT_ID=$(gh pr view {PR_NUMBER} --json headRefOid -q '.headRefOid')
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
```

---

## 7-3. PR レビューとしてインラインコメントを一括投稿

```bash
# comments を JSON で組み立てて gh api で送信
# 例: jq を使って動的に組み立てる

COMMENTS_JSON='[コメントの配列]'

gh api "repos/{REPO}/pulls/{PR_NUMBER}/reviews" \
  --method POST \
  --field commit_id="{COMMIT_ID}" \
  --field body="## AI Review Loop — Iteration {N}\n\n| 観点 | Critical | Warning | Minor | Info |\n|---|---|---|---|---|\n| External Signals Gate | X | Y | Z | W |\n| Database Migration Gate | X | Y | Z | W |\n| コーディング規約 | X | Y | Z | W |\n| アーキテクチャ | X | Y | Z | W |\n| セキュリティ | X | Y | Z | W |\n| サイレント障害 | X | Y | Z | W |\n| 要件充足度 | X | Y | Z | W |\n| テスト妥当性 | X | Y | Z | W |\n| パフォーマンス | X | Y | Z | W |\n| 意味論的整合性 | X | Y | Z | W |\n\n**合計: {total_critical}C / {total_warning}W / {total_minor}M**" \
  --field event="COMMENT" \
  --field "comments={COMMENTS_JSON}"
```

投稿後にレスポンスの `html_url` をログ出力してリンクを確認する。

---

## 7-4. 投稿エラー時の扱い

- `line` が diff 範囲外の場合 → `position` 指定に切り替えて再試行
- それでも失敗した場合 → そのコメントを PR 本文コメント（`gh pr comment`）にフォールバック
- **インラインコメント投稿失敗はレビューループを止めない**（修正フェーズは続行する）
