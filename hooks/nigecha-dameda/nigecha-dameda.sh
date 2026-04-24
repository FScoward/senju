#!/bin/bash
# nigecha-dameda（逃げちゃダメだ）- 先送りサボタージュ防止 Stop Hook
#
# Stop hook の contract:
#   - exit 0          : 通過（stdout は transcript に出るが Claude には届かない）
#   - exit 2 + stderr : Claude にフィードバックを届けつつ stop をブロック
#   - stderr に JSON  : {"decision":"block","reason":"..."} で Claude に伝える

set -euo pipefail

# stdin から Stop hook の入力 JSON を読む
INPUT=$(cat)

# 既にブロック済みの場合は無限ループ防止のため通過
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# transcript_path を取得
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)

# transcript が読めない場合は静かに通過
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# 最後のアシスタントメッセージのテキストを取得（全行、multi-line 対応）
LAST_ASSISTANT_TEXT=$(
  jq -rs '[.[] | select(.type == "assistant")] | last | .message.content[]? | select(.type == "text") | .text' \
    "$TRANSCRIPT_PATH" 2>/dev/null
)

if [ -z "$LAST_ASSISTANT_TEXT" ]; then
  exit 0
fi

# 先送りキーワードを検知（日本語・英語）
SABOTAGE_PATTERN="後続チケット|後でやります|後ほど対応|次のPRで|別途対応|別チケット|後続タスク|後回し|following ticket|follow-up ticket|will address later|separate PR|future PR"

if echo "$LAST_ASSISTANT_TEXT" | grep -qE "$SABOTAGE_PATTERN"; then
  REASON=$(cat <<'EOF'
【逃げちゃダメだチェック】先送りを検知しました。

今の返答に「後続チケット」「後でやります」「次のPRで」などの表現があります。
以下を今すぐ確認してください：

1. チケット番号（APP-XXXX）を明記しましたか？
   → 未明記なら今すぐ書いてください

2. チケットがまだ存在しない場合：
   → 「新規チケットを作成しますか？」とユーザーに確認してください

3. 先送りの理由を1行で書きましたか？
   （スコープ外 / 設計変更が必要 / ユーザー合意あり のどれか）

上記3点を満たしていれば、もう一度返答してください。
EOF
)
  jq -nc --arg reason "$REASON" '{decision:"block", reason:$reason}' >&2
  exit 2
fi

exit 0
