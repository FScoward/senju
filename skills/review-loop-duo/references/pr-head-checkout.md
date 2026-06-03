# PR head checkout（他人PR・巨大PR 向け）

reviewer Agent が diff の周辺コードを Read する際、worktree が merge-base（main）相当のままだと **変更前のコードを読んで誤読する**（PR #3663 インシデント: 250ファイルの他人PRで、変更後に存在するはずの `displayName` を読めず `.name`（enum識別子）を表示見出しに使う退行を見落とした）。

## 発動条件

以下のいずれかに該当する場合に実行する:

- `pr_changed_files[]` の件数が **50件以上**
- `IS_OWN_PR=false`（他人PRのレビュー）

## 手順

```bash
# PR head の ref を取得（detached HEAD で checkout）
PR_HEAD_SHA=$(gh pr view $PR_NUMBER --json headRefOid -q .headRefOid)
ORIGINAL_REF=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || git rev-parse HEAD)

git fetch origin pull/${PR_NUMBER}/head:pr-${PR_NUMBER}
git checkout pr-${PR_NUMBER}
```

これにより reviewer Agent が `Read` ツールで参照するファイルが PR head の状態になり、変更後コードの文脈で正確にレビューできる。

## 復元

Phase 8（修正適用）または Phase 10（完了）の後に元のブランチに戻す。

```bash
git checkout "$ORIGINAL_REF"
git branch -D pr-${PR_NUMBER} 2>/dev/null
```

## 状態の記録

`.omc/review-loop-state.json` に追加:

```json
{
  "duo": {
    "pr_head_checkout": true,
    "original_ref": "feature/APP-XXXX",
    "pr_head_sha": "abc1234..."
  }
}
```

## 注意事項

- 自分のPRかつ50件未満の場合はスキップ（worktree が既に PR head 相当のため）
- checkout 後にファイルを変更しない（read-only 目的）。修正適用（Phase 8）は復元後に行う
- Codex CLI は `-C "$PWD"` で動くため、checkout の影響を自動的に受ける
