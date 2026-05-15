#!/usr/bin/env bash
# qg-required.sh
#
# PreToolUse フック: git push 前に QG (Quality Gate) 完了証跡を確認する。
# kouunryuusui スキル下位フロー T5 の物理的なゲートとして動作する。
#
# フック入力 (stdin): Claude Code が渡す JSON
#   { "tool_name": "Bash", "tool_input": { "command": "..." }, "cwd": "..." }
#
# 通過条件 (全て満たすこと):
#   1. ブランチ名が feature/APP-xxxx 形式（kouunryuusui 対象ブランチ）
#   2. worktree ルートに .claude/tmp/qg-result.md が存在
#   3. ファイル内に "Final: PASS" の行がある
#   4. ファイル内に "mihari" と "review-loop" の PASS 記録がある
#
# スキップ条件:
#   - git push 以外のコマンド
#   - APP- チケットブランチ以外（hotfix, main 直 push, docs リポジトリ等）
#   - QG_REQUIRED_SKIP=1 環境変数（緊急用エスケープハッチ）
#
# 失敗時: exit 2 + stderr に JSON {"decision":"block","reason":"..."} を出す。

set -uo pipefail

# ── stdin から Bash コマンドを取得 ──────────────────────────────────────────
INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" \
  2>/dev/null || echo "")

# git push 以外はスキップ
if ! printf '%s' "$COMMAND" | grep -qE '^\s*git push'; then
    exit 0
fi

# 緊急エスケープハッチ
if [ "${QG_REQUIRED_SKIP:-0}" = "1" ]; then
    printf '⚠️  QG_REQUIRED_SKIP=1 のため QG 証跡チェックをスキップします\n' >&2
    exit 0
fi

# ── ブランチ名からチケット ID を抽出 ────────────────────────────────────────
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "")
TICKET_ID=$(printf '%s' "$BRANCH" \
  | grep -oE '(APP|app)-[0-9]+' \
  | head -1 \
  | tr '[:lower:]' '[:upper:]' \
  || true)

# チケットブランチでなければスキップ（main直push, hotfix, U-xxxx 等）
if [ -z "$TICKET_ID" ]; then
    exit 0
fi

# ── worktree ルートを確定 ───────────────────────────────────────────────────
WORKTREE_ROOT=$(git -C "$PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$PROJECT_DIR")
QG_FILE="$WORKTREE_ROOT/.claude/tmp/qg-result.md"

# ── ブロック理由生成のヘルパー ──────────────────────────────────────────────
block_with_reason() {
    local reason="$1"
    python3 - "$reason" <<'PY' >&2
import json, sys
print(json.dumps({"decision": "block", "reason": sys.argv[1]}))
PY
    exit 2
}

# ── ファイル存在確認 ────────────────────────────────────────────────────────
if [ ! -f "$QG_FILE" ]; then
    block_with_reason "$(cat <<EOF
【QG 証跡チェック失敗】push をブロックします。

worktree: $WORKTREE_ROOT
チケット: $TICKET_ID

🚫 .claude/tmp/qg-result.md が存在しません。

kouunryuusui スキルの下位フロー T5 (Push 確認) は、QG (品質ゲート) の完了証跡を必須としています。
push する前に以下を実施してください:

1. lower-flow.md の QG-1〜QG-3 (mihari / review-loop) を実行する
2. 結果を .claude/tmp/qg-result.md に書き出す（フォーマットは下記参照）
3. Final: PASS を確認してから git push を再実行する

📄 qg-result.md フォーマット:

  # QG Result: $TICKET_ID
  - **Date**: <ISO8601>
  - **Branch**: $BRANCH
  - **Base**: <base ブランチ>

  ## Stages
  | Stage | Status | Evidence |
  |-------|--------|----------|
  | QG-1 build/lint/test | PASS | <コマンド & exit code> |
  | QG-2 simplify | PASS | <スキル呼び出し結果> |
  | QG-3 Stage 1 mihari | PASS | Round N, Critical=0 |
  | QG-3 Stage 2 review-loop | PASS | Iterations N |
  | QG-4 advisor | PASS or SKIPPED (Tier 1) | <根拠> |

  ## Final: PASS

緊急時は QG_REQUIRED_SKIP=1 で迂回できますが、kouunryuusui の品質保証を放棄することになります。
EOF
)"
fi

# ── Final: PASS チェック ────────────────────────────────────────────────────
if ! grep -qE '^##?\s*Final\s*[:：]\s*PASS\s*$' "$QG_FILE"; then
    block_with_reason "$(cat <<EOF
【QG 証跡チェック失敗】push をブロックします。

worktree: $WORKTREE_ROOT
チケット: $TICKET_ID
qg-result: $QG_FILE

🚫 qg-result.md に "Final: PASS" が記録されていません。

QG-1〜QG-4 を再実行し、Critical 0 件・全 Stage PASS を確認してから
qg-result.md の末尾に "## Final: PASS" を追記してください。

未解決の Critical 指摘がある場合は QG-4 の修正ループ (最大5回) を実行すること。
EOF
)"
fi

# ── mihari / review-loop の PASS 記録チェック ───────────────────────────────
MISSING_STAGES=()
grep -qiE 'mihari.*PASS|PASS.*mihari' "$QG_FILE" || MISSING_STAGES+=("mihari (QG-3 Stage 1)")
grep -qiE 'review-loop.*PASS|PASS.*review-loop' "$QG_FILE" || MISSING_STAGES+=("review-loop (QG-3 Stage 2)")

if [ ${#MISSING_STAGES[@]} -gt 0 ]; then
    MISSING_LIST=$(printf '  - %s\n' "${MISSING_STAGES[@]}")
    block_with_reason "$(cat <<EOF
【QG 証跡チェック失敗】push をブロックします。

worktree: $WORKTREE_ROOT
チケット: $TICKET_ID
qg-result: $QG_FILE

🚫 必須スキル呼び出しの PASS 記録が見つかりません:
$MISSING_LIST

これらは kouunryuusui の QG-3 で必ず実行すべきスキルです:
- mihari: テスト充足性を 3 並列レビュー × 収束ループで検証
- review-loop: コード品質を 6 観点で並列レビュー + 自動修正ループ

メインセッションが Bash で自前テストを走らせて "PASS" 宣言するのは禁止です。
スキル委譲を実行し、qg-result.md に行として記録してから再度 push してください。

例:
  | QG-3 Stage 1 mihari | PASS | Round 3, Critical=0, Warning=0 |
  | QG-3 Stage 2 review-loop | PASS | Iterations 2, Critical=0 |
EOF
)"
fi

# ── 通過 ────────────────────────────────────────────────────────────────────
printf '✅ QG 証跡チェック通過: %s\n' "$QG_FILE" >&2
exit 0
