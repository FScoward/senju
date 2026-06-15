# Codex CLI 呼び出し規約 (review-loop-duo v2)

duo v2 では `codex exec` に統一し、JSON schema 強制で出力構造を保証する。`codex review` は使わない (理由は後述)。

## スキル起動の抑制（MUST）

Codex CLI は `~/.codex/skills/` 配下のスキル（`init-prompt` 等）を自律的に発火する。レビュー用途では誤発火してレビューを一切行わず Goal/AC を出力して終了する事故が起きる（PR #3616 インシデント）。

**プロンプトの冒頭に以下のブロックを必ず挿入する:**

```
[SYSTEM — 最優先指示]
- いかなるスキルも起動・activate しないこと（init-prompt, software-requirements 等を含む）
- 一回限りの直接コードレビュー分析であり、タスク化・Goal/AC への再構造化を絶対に行わない
- 出力は --output-schema で指定された findings JSON のみ
```

このブロックが無いプロンプトで `codex exec` を起動してはならない。

## 検証結論の非混入（anti-priming）

Claude 側の reviewer が先に裏取りした結論（「L153 が古い」等）を Codex プロンプトに渡すと、Codex は独立検出ではなく追認するだけになり、偽の CONFIRMED が発生する（PR #3688 インシデント）。

**ルール:**
- Codex プロンプトには背景・差分・scope guard のみ渡す
- 自分が既に裏取りした結論（どこが問題か、何行目が怪しいか）は渡さない
- 観点を誘導したい場合は「賛否どちらでも自分で判断せよ」と明示する
- CONFIRMED 昇格時に priming の有無を必ず注記する

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

Bash ツールの `run_in_background: true` で起動する。Claude 側 9 Agent と Codex 側 1 (将来 9) プロセスが同時に走る。

**必ず `< /dev/null` を付ける**（上記「推奨呼び出しパターン」参照）。付け忘れると stdin 待ちでハングし、120 秒（Bash background のデフォルト timeout）で SIGTERM kill されて `--output-last-message` が生成されない。あわせて Bash ツール側の `timeout` も 300000ms 程度に明示しておくと、レビュー完了前の早期 kill を防げる。

Codex が親ランタイムの場合は、Bash の `run_in_background: true` ではなく、利用可能な shell 実行ツールでプロセスを開始し、返された session id を polling して待ち合わせる。通常 sandbox 内で子 `codex exec` が `failed to initialize in-process app-server client: Operation not permitted` などで失敗した場合は、同じコマンドを承認付きの権限外実行で 1 回だけ再試行する。権限外実行が使えない場合は `codex_enabled=false` に落とし、Claude 単独結果として扱う。認証失敗・未インストールと sandbox 失敗を混同しないこと。

## macOS での gtimeout（タイムアウト制御）

macOS はデフォルトで GNU `timeout` コマンドを持たない。Bash ツールの `timeout` パラメータ（ミリ秒）で代替できるが、シェルスクリプト内でプロセスをタイムアウト制御するには `gtimeout` が必要（GNU coreutils 9.11+ で動作確認済み）。

```bash
brew install coreutils  # 一度だけ。/opt/homebrew/bin/gtimeout として配備される
```

タイムアウト付き起動例（300 秒制限）:

```bash
gtimeout 300 codex exec \
  -C "$PWD" \
  --skip-git-repo-check \
  -s read-only \
  --color never \
  --output-schema "$SKILL_DIR/references/schemas/finding.schema.json" \
  --output-last-message "$OUTPUT_DIR/codex-iter${N}.json" \
  "$PROMPT" < /dev/null
```

`gtimeout` 未インストール環境では Bash ツールの `timeout: 300000` で代替する。`< /dev/null` は `gtimeout` 使用時も必須。

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

codex exec "${MODEL_OPT[@]}" -C "$PWD" --skip-git-repo-check ... "$PROMPT" < /dev/null
```

## `codex review` を使わない理由

`codex review --base $BASE` は差分レビュー特化のサブコマンドだが、以下の理由で v2 では採用しない:

- `--output-schema` / `--output-last-message` のオプション可用性が `codex exec` ほど安定していない
- `codex exec` なら差分を stdin / プロンプト内に流せばよいので、PR あり / なしモードを統一実装できる
- 段階 2 (観点 × backend マトリクス化) で 9 並列起動する際に同じ呼び出しテンプレで再利用できる

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
| `failed to initialize in-process app-server client: Operation not permitted` | 親 Codex ランタイムの shell sandbox で子 `codex exec` がブロックされている。承認付きの権限外実行で 1 回だけ再試行し、不可なら `codex_enabled=false` |
| `codex: command not found` | `codex_enabled=false` に落として Claude 単独 (review-loop 相当) で続行 |
| `codex login required` | 同上。ユーザーに `codex login` を案内 |
| `--output-last-message` のファイルが空 | 出力欠落。1 度だけリトライ。再度失敗で当該 iteration の Codex 結果は破棄 (CLAUDE_ONLY 扱い) |
| JSON parse 失敗 | 同上 |
| schema validation エラー (`additionalProperties` 違反など) | 開発時のみ。schema 設計を見直す |
| 300 秒タイムアウト | duo Phase 4-B の既存挙動: 次イテレーションで再挑戦 |
| 指摘 line がファイル末尾超 | hallucination として Phase 6-3 で破棄 |
| 指摘 path がリポジトリ非存在 | 同上 |
| Codex 出力ファイルが Read 上限超（数万 tokens） | `tail -100 /tmp/codex-iter${N}.json` / `grep -A5 "WARNING\|Critical"` で必要部分のみ抽出。全件 Read は不要かつ失敗する |
| `gh pr diff {N} -- file1 file2` が `accepts at most 1 arg(s)` で失敗 | `gh pr diff` は複数ファイル指定不可。ファイルを個別 Read させるか `gh pr diff {N}` で全差分を取得する（出典: PR #3828）|

## 段階 2 への布石

段階 2 では Codex を観点ごとに 9 本並列起動するが、本ファイルの呼び出しテンプレを envsubst で `$PROMPT` を観点別プロンプトに差し替えれば動く構造にしてある:

```bash
for p in coding-rules architecture security silent-failure requirements test-adequacy performance semantic-consistency impact-regression; do
  PROMPT=$(envsubst < "$SKILL_DIR/references/codex-prompts/${p}.md")
  codex exec ... --output-last-message "$OUTPUT_DIR/codex-${p}.json" "$PROMPT" &
done
wait
```

段階 2 着手時に `references/codex-prompts/{perspective}.md` を新設すればよい (現状は段階 1A のため `references/codex-prompts/all-perspectives.md` 相当を `codex-invocation.md` の本体プロンプトに inline で保持)。
