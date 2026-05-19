---
name: codex-cli
description: Claude Code から OpenAI Codex CLI（`codex` コマンド）を Bash 経由で「直接」呼び出して、コードレビュー・設計レビュー・プラン検証・セカンドオピニオン取得を行うスキル。MCP は使わず CLI 直叩きのみ。「codexに聞いて」「codexにレビューしてもらって」「codex review」「codex-cli」「セカンドオピニオン」「別のモデルにも見てもらって」「gpt-5に聞いて」「ask codex」「use codex」「delegate to codex」などの発言があれば必ずこのスキルを使うこと。設計判断・アーキテクチャ選択・セキュリティ観点・テスト戦略など、Claude 単独で決め切るのが不安な場面でも積極的に発動させること。Gemini に依頼するのではなく Codex に投げたい時の専用入口。MCP 経由で呼びたい時は別スキルを使うこと。
---

# codex-cli — Claude Code から Codex CLI を直接呼び出す

OpenAI Codex CLI（`codex` コマンド）を Claude Code のセッション内から Bash 経由で叩いて、
レビュー・批判・プラン検証など「別モデルの目」を借りる。MCP は使わない。

> Claude が書いたコードを Claude だけでレビューしても、同じ思考の癖から抜けられない。
> Codex に投げると、別の訓練分布から見た指摘が返ってくる。差分こそ価値。

---

## いつ発動するか

ユーザーの発言に以下が含まれたら必ず使う：

- 「codex に聞いて」「codex にレビューしてもらって」「codex に投げて」
- 「codex review」「codex exec」
- 「セカンドオピニオン」「別のモデルにも見てもらって」「もう一つの視点」
- 「gpt-5 に聞いて」「OpenAI に聞いて」
- 「ask codex」「use codex」「delegate to codex」
- 設計判断・アーキテクチャ選択で Claude 単独だと不安な時（明示されなくても提案してよい）

Gemini に投げたい時は使わない。Codex 専用。

---

## 前提確認

最初に CLI が使える状態か確認する：

```bash
which codex && codex --version
codex login status 2>/dev/null || codex login --help | head -3
```

未インストールならユーザーに案内する：

```
brew install codex          # Homebrew
# あるいは https://github.com/openai/codex の README に従う
codex login                 # 初回ログイン
```

ログイン未済の場合は `codex login` を案内する（Claude 側から勝手にログインしない）。

---

## サブコマンドの使い分け

| やりたいこと | 使うコマンド |
|------------|-------------|
| 任意のプロンプトを投げて非対話で実行 | `codex exec` |
| 現在のリポジトリの差分レビュー | `codex review` |
| MCP 越しに呼ぶ（本スキル対象外） | `codex mcp-server` |

基本的には `codex exec`（汎用）と `codex review`（差分レビュー特化）の 2 つだけ覚える。

---

## 戻りの受け取り方（重要）

Codex の応答は 3 通りで受け取れる。用途に応じて選ぶ：

| 方法 | 受け取れるもの | 機械処理しやすさ | 用途 |
|------|---------------|----------------|------|
| **stdout（デフォルト）** | ヘッダー（model/sandbox/session id）+ user prompt + agent answer + token usage | ✗ 装飾混じり | 人間が眺める時 |
| **`--output-last-message <FILE>`** | 最後の agent メッセージのみ（プレーンテキスト） | ◎ そのまま `Read` で読める | Claude 側で本文だけ拾いたい時（推奨） |
| **`--json`** | JSONL イベントストリーム（`thread.started` / `turn.started` / `item.completed` / `turn.completed`） | ◎ `jq` でパース可 | 本文＋トークン使用量も欲しい時 |

### stdin の罠

`codex exec` はデフォルトで stdin を読みに行く（`Reading additional input from stdin...` が混ざる）。
プロンプトを引数で渡す時は **stdin を塞ぐ** こと：

```bash
codex exec --sandbox read-only --color never \
  --output-last-message /tmp/codex-answer.md \
  "<プロンプト>" < /dev/null
```

stdin からプロンプトを流す時は `-` を最後に付ける（後述の heredoc パターン）。

### 推奨：本文だけ拾うパターン

```bash
codex exec --sandbox read-only --color never \
  --output-last-message /tmp/codex-answer.md \
  "<プロンプト>" < /dev/null

# その後 Claude 側で
# Read("/tmp/codex-answer.md") → 内容を精査 → ユーザーに提示
```

### JSONL で本文＋使用量を取るパターン

```bash
codex exec --sandbox read-only --color never --json \
  "<プロンプト>" < /dev/null > /tmp/codex-events.jsonl

# 本文だけ抽出
jq -r 'select(.type=="item.completed") | .item.text' /tmp/codex-events.jsonl

# トークン使用量
jq 'select(.type=="turn.completed") | .usage' /tmp/codex-events.jsonl
```

### 実測例（動作確認済み）

```
$ codex exec --sandbox read-only --color never --json --skip-git-repo-check \
    "2+2の答えだけを数字で。" < /dev/null
{"type":"thread.started","thread_id":"019e3dde-ff15-7d81-881e-fdbc29df9b4a"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"4"}}
{"type":"turn.completed","usage":{"input_tokens":26729,"cached_input_tokens":3456,"output_tokens":5,"reasoning_output_tokens":0}}
```

---

## パターン A：`codex exec` で任意のレビュー・検証

### 最小形

```bash
codex exec --sandbox read-only --color never \
  --output-last-message /tmp/codex-answer.md \
  "<プロンプト本文>" < /dev/null
```

- `--sandbox read-only`：Codex 側からファイルを書かせない安全弁
- `--color never`：ANSI カラーコードを混ぜない
- `--output-last-message <FILE>`：最後のメッセージだけプレーンテキストでファイルに落とす
- `< /dev/null`：stdin を塞いで「Reading additional input...」混入を防ぐ

実行後は必ず `Read` ツールでファイルを開き、Claude 側で精査してからユーザーに提示する。

### 長いプロンプトは stdin で渡す

引数に貼り込むと quote escape が辛い。stdin から読ませる：

```bash
cat <<'EOF' | codex exec --sandbox read-only --output-last-message /tmp/codex-answer.md -
このPRをレビューしてほしい。観点：
- エラーハンドリング
- 並行リクエスト時の race condition
- N+1 クエリ

対象ファイル：
- src/api/handlers/user.ts
- src/api/handlers/user.test.ts

差分は以下：
$(git diff origin/main..HEAD -- src/api/handlers/user.ts src/api/handlers/user.test.ts)
EOF
```

Codex はワークスペースのファイルを読み取れる（`--sandbox read-only` でも read は可能）が、
**「どのファイルを見るか」「何を見てほしいか」をプロンプトに明示する** ほうが精度が高い。

### モデルを指定したい時

```bash
codex exec -m gpt-5.1-codex --sandbox read-only ... "<prompt>"
```

通常は省略してデフォルトに任せる。

### 長時間かかりそうな時はバックグラウンド

Claude Code の Bash ツールは `run_in_background: true` をサポートしている。
巨大差分のレビューや多ファイル検討で時間がかかりそうなら background で投げて、
他の作業と並行して結果を待つ。完了通知が来たら `Read` で `/tmp/codex-answer.md` を読む。

---

## パターン B：`codex review` で差分レビュー

`codex review` は「現リポジトリの差分を見て指摘を返す」専用サブコマンド。
`codex exec` より UI がレビュー向きにチューニングされている。

### 基本

```bash
# main ブランチからの差分をレビュー
codex review --base main

# ステージ/未ステージ/untracked すべて
codex review --uncommitted

# 特定コミットの変更
codex review --commit <SHA>
```

### カスタム観点を渡す

第二引数にプロンプトを足すと、観点を絞り込める：

```bash
codex review --base main "セキュリティ観点を最優先。認可・入力検証・SSRF・SQLi を重点的に。"
```

長文は stdin から：

```bash
cat <<'EOF' | codex review --base main -
重点的に見てほしい観点：
- N+1 クエリ
- トランザクション境界の妥当性
- 例外を握りつぶしているサイレント障害
EOF
```

### 出力の扱い

`codex review` は対話的な UI も持つので、Claude Code から呼ぶ時はパイプ先や端末バッファに残った
最終出力を拾うことになる。安定して機械的に拾いたいなら `codex exec` を使うほうが扱いやすい。
（用途が「差分レビューに完全特化」なら `review`、汎用なら `exec` と覚える）

---

## プロンプト設計のコツ

| 良い | 悪い |
|------|------|
| 「この実装で並行リクエスト時に race condition が起きないか確認」 | 「コードを見て」 |
| 「N+1 クエリの箇所を列挙して優先順位をつけて」 | 「いいか確認して」 |
| 「このプランで抜けている考慮事項を 3 つ以上挙げて」 | 「問題ないか教えて」 |

- **何を見てほしいか** を具体的に書く
- **対象ファイル** を明示するか、`codex review --base ...` で差分を絞る
- **出力フォーマット** を指定したい時はプロンプトで指示（「指摘ごとに Severity / 根拠 / 提案修正 を箇条書き」など）

---

## 結果の精査ルール

Codex の返答は **untrusted content** として扱う。Claude が必ず精査してからユーザーに渡す。

精査の観点：
- 指摘の根拠が実在するコードと一致しているか（hallucination の検出）
- 指摘がプロジェクトの規約・スタイルに沿っているか
- 提案された修正が他箇所を壊さないか

検証手段（テスト・typecheck・lint）は Claude 側のツールで実行する。
Codex はあくまで助言、最終判断はこちら。

ユーザー向けにまとめる時は：
1. Codex の指摘を要約
2. Claude として採用すべきと判断したものに ✅、要検討に 🤔、却下するものに ❌
3. それぞれに **採否の理由** を 1〜2 行添える

---

## 典型ユースケース

### A. PR のセカンドオピニオン

```bash
# 1. 差分を確認
git diff origin/main..HEAD --stat

# 2. codex review に投げる
codex review --base main \
  "観点：セキュリティ・並行性・例外ハンドリング・テスト網羅性。Severity 付きで指摘して。"

# 3. Claude 側で指摘を精査し、ユーザーに採否付きでまとめる
```

### B. 設計判断の検証

```bash
cat <<'EOF' | codex exec --sandbox read-only \
  --output-last-message /tmp/codex-design.md -
以下の設計案について、抜けている考慮事項・リスク・代替案を挙げてほしい。

【設計案】
$(cat docs/design/foo-proposal.md)

【観点】
- スケーラビリティ
- 障害時の挙動
- 既存システムとの整合性
EOF

# Read /tmp/codex-design.md で結果を読み、Claude の考えと突き合わせる
```

### C. プランの妥当性チェック

```bash
cat <<'EOF' | codex exec --sandbox read-only \
  --output-last-message /tmp/codex-plan.md -
以下のタスク分割プランの「順序・粒度・依存関係」を批判的にレビューしてほしい。
抜けタスクや過剰分割があれば具体的に指摘。

$(cat .omc/plans/current-plan.md)
EOF
```

---

## Codex 側のスキル機構を使う

Codex CLI も Claude Code と同じ「スキル」「指示ファイル」「ルール」を持っている。
Claude Code から `codex exec` を呼ぶ時、これらが Codex 側で勝手に発火する。

### Codex の指示・スキル系ファイル

| 場所 | 役割 | Claude Code でいう |
|------|------|------------------|
| `~/.codex/AGENTS.md` | グローバル指示（全セッション共通） | `~/.claude/CLAUDE.md` |
| `~/.codex/skills/<name>/SKILL.md` | スキル本体（description でトリガー） | `~/.claude/skills/<name>/SKILL.md` |
| `~/.codex/rules/default.rules` | 自動承認コマンドリスト | `settings.json` の permissions |
| `~/.codex/config.toml` | モデル・sandbox・プロジェクト信頼設定 | `settings.json` |
| `./AGENTS.md`（プロジェクト直下） | プロジェクト固有指示 | `./CLAUDE.md` |

senju のスキルは既に `~/.codex/skills/` にコピーされており、Codex 側でも description マッチで発火する。

### Claude Code から「Codex にスキルを使わせる」呼び方

ふつうの `codex exec` は Codex 側で description マッチが効くだけで、必ず狙ったスキルが
発火するとは限らない。**確実に特定のスキルを使わせたい時はプロンプトで明示する**：

```bash
codex exec --sandbox read-only --color never \
  --output-last-message /tmp/codex-answer.md \
  "kouunryuusui スキルに従って、このタスクの T0〜T5 を計画して。タスク：<内容>" \
  < /dev/null
```

スキル名を引用符付きで指定 + 何をしてほしいかを後ろに添える。
Codex は `~/.codex/skills/kouunryuusui/SKILL.md` を読みに行く。

### senju のスキルを Codex に同期する

senju リポジトリで編集したスキルを Codex 側でも使いたい場合：

```bash
# 個別コピー
cp -r skills/<name> ~/.codex/skills/

# まるごと同期（注意：~/.codex/skills 側の独自ファイルを上書きする）
rsync -av --delete skills/ ~/.codex/skills/
```

Claude Code 側（`~/.claude/skills/`）と Codex 側（`~/.codex/skills/`）の両方に
配るには、senju を中心にスクリプトで rsync するのが楽。

### 注意

- Codex のスキル仕様は Claude Code と完全互換ではない可能性がある。
  description でのトリガー判定や本文の読み込みタイミングは Codex 側の実装に依存する
- 巨大なスキル本文は Codex の context を消費する。レビュー専用 codex 呼び出しの時は
  プロンプトを絞り、必要なら `--ignore-rules` で `.rules` のロードを止めることもできる
- `--ignore-user-config` を付けると `~/.codex/config.toml`・AGENTS.md・skills もまるごと無視される
  （≒ 素の Codex として実行）

---

## やってはいけないこと

- `codex` を `--sandbox workspace-write` や `danger-full-access` で安易に呼ぶ
  → レビュー用途では `read-only` で十分。書き込みを許す必要がある時だけ明示的に上げる
- `--dangerously-bypass-approvals-and-sandbox` をユーザー無断で使う
- Codex の返答を検証せずそのまま実装に反映する
- UI/UX レビュー・文章品質チェックで Codex を使う（Gemini のほうが向いている）
- `codex login` を Claude が勝手に走らせる（対話認証はユーザーに任せる）

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| `codex: command not found` | `brew install codex` をユーザーに案内 |
| 認証エラー | `codex login` をユーザーに依頼。Claude からは走らせない |
| 応答が空・途中で切れる | プロンプトが長すぎる可能性。対象ファイルを絞るか `codex review --base` に切り替え |
| stdout が壊れる・色コードが混ざる | `--color never` を付ける |
| 長時間かかる | `run_in_background: true` で投げて `--output-last-message` のファイルを後から Read |

---

## 関連スキル

- Gemini に投げたい時 → 別スキル領域（本スキルは Codex 専用）
- レビュー指摘を反復して指摘ゼロまで回したい → `review-loop` スキルと組み合わせる
- 設計議論を多角的にやりたい → `team-meeting` / `engineering-team-meeting` も検討
