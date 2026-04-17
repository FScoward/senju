#!/usr/bin/env bash
# check-frontmatter.sh — senju/skills/ 配下の全 SKILL.md について
#                        必須 frontmatter フィールドの存在を検証する。
#
# Usage:
#   ./scripts/check-frontmatter.sh           # すべてチェック
#   ./scripts/check-frontmatter.sh --strict  # 推奨フィールド (license, author) の欠如も警告
#
# 終了コード:
#   0 - すべての SKILL.md が必須フィールドを満たす
#   1 - 1つ以上の SKILL.md でエラーあり

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SENJU_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SKILLS_ROOT="${SENJU_ROOT}/skills"
STRICT=0

REQUIRED_FIELDS=("name" "description")
RECOMMENDED_FIELDS=("license" "author")

for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [ ! -d "$SKILLS_ROOT" ]; then
  echo "ERROR: skills directory not found: $SKILLS_ROOT" >&2
  exit 1
fi

errors=0
warnings=0
checked=0

extract_frontmatter() {
  local file="$1"
  # yaml frontmatter は最初の --- から次の --- まで
  awk '
    BEGIN { count = 0 }
    /^---[[:space:]]*$/ {
      count++
      if (count == 1) { next }
      if (count == 2) { exit }
    }
    count == 1 { print }
  ' "$file"
}

has_field() {
  local frontmatter="$1"
  local field="$2"
  # "field:" が行頭にあるかチェック。値が空でも OK とする
  grep -qE "^${field}:" <<< "$frontmatter"
}

while IFS= read -r -d '' file; do
  checked=$((checked + 1))
  rel_path="${file#${SENJU_ROOT}/}"

  first_line="$(head -n 1 "$file")"
  if [ "$first_line" != "---" ]; then
    echo "ERROR  $rel_path: no YAML frontmatter (first line must be '---')" >&2
    errors=$((errors + 1))
    continue
  fi

  frontmatter="$(extract_frontmatter "$file")"
  if [ -z "$frontmatter" ]; then
    echo "ERROR  $rel_path: frontmatter block is empty or malformed" >&2
    errors=$((errors + 1))
    continue
  fi

  for field in "${REQUIRED_FIELDS[@]}"; do
    if ! has_field "$frontmatter" "$field"; then
      echo "ERROR  $rel_path: missing required field '${field}'" >&2
      errors=$((errors + 1))
    fi
  done

  # Check that `name` in frontmatter matches the directory name
  dir_name="$(basename "$(dirname "$file")")"
  name_value="$(grep -E '^name:' <<< "$frontmatter" | head -n 1 | sed -E 's/^name:[[:space:]]*//; s/^["'"'"']//; s/["'"'"']$//')"
  if [ -n "$name_value" ] && [ "$name_value" != "$dir_name" ]; then
    echo "ERROR  $rel_path: name '${name_value}' does not match directory '${dir_name}'" >&2
    errors=$((errors + 1))
  fi

  if [ "$STRICT" -eq 1 ]; then
    for field in "${RECOMMENDED_FIELDS[@]}"; do
      if ! has_field "$frontmatter" "$field"; then
        echo "WARN   $rel_path: recommended field '${field}' is missing" >&2
        warnings=$((warnings + 1))
      fi
    done
  fi
done < <(find "$SKILLS_ROOT" -type f -name SKILL.md -print0)

echo ""
printf 'Checked %d SKILL.md file(s). %d error(s)' "$checked" "$errors"
if [ "$STRICT" -eq 1 ]; then
  printf ', %d warning(s)' "$warnings"
fi
echo "."

if [ "$errors" -gt 0 ]; then
  exit 1
fi
