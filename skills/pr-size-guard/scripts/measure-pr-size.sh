#!/usr/bin/env bash
# measure-pr-size.sh — 現ブランチと base（デフォルト: origin/main）の差分サイズを診断
#
# Usage:
#   ./measure-pr-size.sh                  # base: origin/main
#   ./measure-pr-size.sh main              # base: ローカル main
#   ./measure-pr-size.sh origin/develop    # base: origin/develop
#
# 終了コード:
#   0 - 全てGreen
#   1 - 1つ以上Yellow
#   2 - 1つ以上Red

set -euo pipefail

BASE="${1:-origin/main}"

if ! git rev-parse --verify "$BASE" > /dev/null 2>&1; then
  echo "ERROR: base '$BASE' が見つからない。origin を fetch するか、base を指定してください。" >&2
  exit 3
fi

echo "=== PR Size Diagnostic (base: $BASE) ==="
echo ""

# 行数（全体）
lines=$(git diff --numstat "$BASE...HEAD" | awk '{sum += $1 + $2} END {print sum+0}')

# 行数（テスト除く）
lines_no_test=$(git diff --numstat "$BASE...HEAD" \
  | { grep -vE '_test\.|/test/|__tests__|\.test\.' || true; } \
  | awk '{sum += $1 + $2} END {print sum+0}')

# ファイル数（全て）
files=$(git diff --name-only "$BASE...HEAD" | wc -l | tr -d ' ')

# ファイル数（テスト除く）
files_no_test=$(git diff --name-only "$BASE...HEAD" \
  | { grep -vE '_test\.|/test/|__tests__|\.test\.' || true; } \
  | wc -l | tr -d ' ')

# コミット数
commits=$(git log --oneline "$BASE..HEAD" | wc -l | tr -d ' ')

# 判定関数
judge() {
  local val=$1 green=$2 yellow=$3
  if [ "$val" -le "$green" ]; then echo "🟢 Green"; return 0
  elif [ "$val" -le "$yellow" ]; then echo "🟡 Yellow"; return 1
  else echo "🔴 Red"; return 2
  fi
}

max_status=0
update_max() {
  if [ "$1" -gt "$max_status" ]; then max_status=$1; fi
}

echo "■ サイズ指標"
result=$(judge "$lines_no_test" 200 400); status=$?; update_max $status
printf "  行数（テスト除く）:       %6d行    %s\n" "$lines_no_test" "$result"

result=$(judge "$lines" 400 800); status=$?; update_max $status
printf "  行数（全て）:             %6d行    %s\n" "$lines" "$result"

result=$(judge "$files_no_test" 7 15); status=$?; update_max $status
printf "  ファイル数（テスト除く）: %6d件    %s\n" "$files_no_test" "$result"

result=$(judge "$files" 10 20); status=$?; update_max $status
printf "  ファイル数（全て）:       %6d件    %s\n" "$files" "$result"

result=$(judge "$commits" 5 15); status=$?; update_max $status
printf "  コミット数:               %6d件    %s\n" "$commits" "$result"

echo ""
echo "■ 変更ファイル上位5（行数順）"
git diff --numstat "$BASE...HEAD" \
  | awk '{print $1+$2, $3}' \
  | sort -rn \
  | head -5 \
  | awk '{printf "  %5d行  %s\n", $1, $2}'

echo ""
echo "■ レイヤー影響"
layers_file=$(mktemp)
trap 'rm -f "$layers_file"' EXIT
git diff --name-only "$BASE...HEAD" | awk '
  /migration|flyway|\.sql$/              { l["DB"]=1 }
  /backend|server|\.kt$|\.java$/         { l["BE"]=1 }
  /frontend|web|\.tsx?$|\.jsx?$/         { l["FE"]=1 }
  /config|settings|\.env|\.yaml$|\.yml$/ { l["Config"]=1 }
  /k8s|docker|terraform|\.github\/|ci\// { l["Infra"]=1 }
  END {
    for (k in l) print k
  }
' > "$layers_file"

if [ -s "$layers_file" ]; then
  while IFS= read -r layer; do
    echo "  - $layer"
  done < "$layers_file"
else
  echo "  (判定対象のレイヤーなし)"
fi
layer_count=$(wc -l < "$layers_file" | tr -d ' ')
result=$(judge "$layer_count" 2 3); status=$?; update_max $status
echo "  レイヤー数: $layer_count  $result"

echo ""
echo "■ 総合判定"
case $max_status in
  0) echo "🟢 Green — そのまま push OK" ;;
  1) echo "🟡 Yellow — 分割検討。分割しない場合は PR 説明文に理由を1行書く" ;;
  2) echo "🔴 Red — 分割必須 or 明示的な justification（PR 説明文に段落で記載）" ;;
esac

exit $max_status
