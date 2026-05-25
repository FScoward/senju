# Codex CLI 呼び出し規約 (review-loop-duo v2)

duo v2 では `codex exec` に統一し、JSON schema 強制で出力構造を保証する。`codex review` は使わない (理由は後述)。

## 推奨呼び出しパターン

### PR ありモード / PR なしモード共通

```bash
codex exec \
  -C "$PWD" \
  --skip-git-repo-check \
  -s read-only \
  --color never \
  --output-schema "$SKILL_DIR/references/schemas/finding.schema.json" \
  --output-last-message "$OUTPUT_DIR/codex-iter${N}.json" \
  "$PROMPT" < /dev/null
```

> ⚠️ **`< /dev/null` は必須**。`codex exec` はプロンプトを引数で渡しても stdin に追加入力があると判断すると `Reading additional input from stdin...` で待機に入る。バックグラウンド実行（Bash `run_in_background: true`）では stdin が EOF にならず**ハングしたままタイムアウト kill（exit 144 = SIGTERM）**される。`< /dev/null` で stdin を即 EOF にすればこの待機を回避できる。

### バックグラウンド起動 (Phase 4-A の Claude 並列起動と同じターンで実行)

Bash ツールの `run_in_background: true` で起動する。Claude 側 7 Agent と Codex 側 1 (将来 7) プロセスが同時に走る。

**必ず `< /dev/null` を付ける**（上記「推奨呼び出しパターン」参照）。付け忘れると stdin 待ちでハングし、120 秒（Bash background のデフォルト timeout）で SIGTERM kill されて `--output-last-message` が生成されない。あわせて Bash ツール側の `timeout` も 300000ms 程度に明示しておくと、レビュー完了前の早期 kill を防げる。

## オプション解説

| オプション | 役割 | 必須 |
|---|---|---|
| `-C "$PWD"` | working directory を明示。worktree や `cd` 後でも正しく動く | ✅ |
| `--skip-git-repo-check` | worktree や shallow clone で誤判定回避 | ✅ |
| `-s read-only` | sandbox を read-only に。Codex 側からファイル書き込み禁止 | ✅ |
| `--color never` | ANSI escape を出さない (パース容易化) | ✅ |
| `--output-schema <path>` | JSON Schema を強制。strict mode 準拠で書く | ✅ |
| `--output-last-message <path>` | 最終 message を指定ファイルに JSON で書き出す | ✅ |
| `-m <model>` | モデル明示。**ChatGPT account では指定しない** (下記の罠参照) | ❌ |

## CODEX_MODEL の罠 (重要)

ChatGPT Plus / Pro account 経由で Codex CLI を使う場合、`-m gpt-5` を明示すると以下のエラーで弾かれる:

```
400 invalid_request_error: gpt-5 model is not supported when using Codex with a ChatGPT account
```

**対処**:
- `CODEX_MODEL` を **未設定にして CLI default を使う** (推奨)
- API key 直接利用の場合のみ `-m gpt-5` / `-m gpt-5-mini` を明示可

duo v2 のコード内では以下のように扱う:

```bash
if [ -n "${CODEX_MODEL:-}" ]; then
  MODEL_OPT=(-m "$CODEX_MODEL")
else
  MODEL_OPT=()
fi

codex exec "${MODEL_OPT[@]}" -C "$PWD" --skip-git-repo-check ... "$PROMPT"
```

## `codex review` を使わない理由

`codex review --base $BASE` は差分レビュー特化のサブコマンドだが、以下の理由で v2 では採用しない:

- `--output-schema` / `--output-last-message` のオプション可用性が `codex exec` ほど安定していない
- `codex exec` なら差分を stdin / プロンプト内に流せばよいので、PR あり / なしモードを統一実装できる
- 段階 2 (観点 × backend マトリクス化) で 7 並列起動する際に同じ呼び出しテンプレで再利用できる

PR ありモードでは事前に `gh pr diff` で差分を取得し、プロンプト内に埋め込む or 一時ファイル経由で渡す。

## JSON Schema strict mode 要件

`--output-schema` に渡す JSON Schema は OpenAI strict mode に準拠する必要がある。違反するとリクエスト時に弾かれる:

- 全 `object` 階層に `additionalProperties: false` を明示
- 全 property を `required` に列挙
- 任意フィールドは `type: ["string", "null"]` のように null 許容で表現
- `pattern` 等の制約は標準 Draft 7+ サポート範囲のみ使用可

→ `references/schemas/finding.schema.json` がこの規約に従って書かれている。新規 schema 追加時も同じ規約で書く。

## エラーハンドリング

| 症状 | 対処 |
|---|---|
| `Reading additional input from stdin...` でハング / exit 144 (SIGTERM) / `--output-last-message` 未生成 | stdin 待ち。`"$PROMPT" < /dev/null` で stdin を即 EOF にして再実行。Bash background の `timeout` も 300000ms に明示 |
| `codex: command not found` | `codex_enabled=false` に落として Claude 単独 (review-loop 相当) で続行 |
| `codex login required` | 同上。ユーザーに `codex login` を案内 |
| `--output-last-message` のファイルが空 | 出力欠落。1 度だけリトライ。再度失敗で当該 iteration の Codex 結果は破棄 (CLAUDE_ONLY 扱い) |
| JSON parse 失敗 | 同上 |
| schema validation エラー (`additionalProperties` 違反など) | 開発時のみ。schema 設計を見直す |
| 300 秒タイムアウト | duo Phase 4-B の既存挙動: 次イテレーションで再挑戦 |
| 指摘 line がファイル末尾超 | hallucination として Phase 6-3 で破棄 |
| 指摘 path がリポジトリ非存在 | 同上 |

## 段階 2 への布石

段階 2 では Codex を観点ごとに 7 本並列起動するが、本ファイルの呼び出しテンプレを envsubst で `$PROMPT` を観点別プロンプトに差し替えれば動く構造にしてある:

```bash
for p in coding-rules architecture security silent-failure requirements test-adequacy performance semantic-consistency; do
  PROMPT=$(envsubst < "$SKILL_DIR/references/codex-prompts/${p}.md")
  codex exec ... --output-last-message "$OUTPUT_DIR/codex-${p}.json" "$PROMPT" &
done
wait
```

段階 2 着手時に `references/codex-prompts/{perspective}.md` を新設すればよい (現状は段階 1A のため `references/codex-prompts/all-perspectives.md` 相当を `codex-invocation.md` の本体プロンプトに inline で保持)。
