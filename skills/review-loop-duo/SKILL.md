---
description: review-loop を Claude と Codex CLI の 2 モデルで「並列に」回し、両者の指摘を統合して Critical/Warning がゼロになるまでループするスキル。Claude の 9 観点並列レビューと Codex CLI（`codex exec` / `codex review`）の独立レビューを各イテレーションで同時起動し、両モデルが合致した指摘は信頼度を昇格、片方だけの指摘は精査ラベルを付けて統合する。「review-loop-duo」「duo review」「並列レビュー」「Claude と Codex 両方でレビュー」「2 つのモデルでクロスレビュー」「dual review」「review-loop codex」「Claude だけだと不安だから Codex も並走」「セカンドオピニオン込みでレビューループ」「両方の AI でゼロになるまで」などの発言で必ずこのスキルを使うこと。単体 `review-loop`（Claude のみ）と単体 `codex-cli`（Codex 単発）に対し、本スキルは「両者を同期させたループ」を提供する。指摘の網羅性を最優先したい時、片方のモデルが見落とすリスクを許容したくない時、PR の重要度が高い時にも積極的に発動してよい。
license: MIT
metadata:
    github-path: skills/review-loop-duo
    github-ref: refs/heads/main
    github-repo: https://github.com/FScoward/senju
    github-tree-sha: f4d9b05fb619a257ee043c99b29c7843a4723c84
name: review-loop-duo
---
# review-loop-duo

`review-loop` を **Claude（9 観点並列）** と **Codex CLI（独立 1 レビュー）** の 2 モデルで同時に回し、
両者の指摘を毎イテレーションで統合して、Critical/Warning がゼロになるまで自動ループする。

> 1 つのモデルだけで自分の出力を見ても、同じ訓練分布の癖からは抜けられない。
> Claude と Codex を並走させて差分を観測し、両方が拾った指摘を「高信頼」、片方だけを「精査必要」として扱う。
> Claude 単体の `review-loop` よりも網羅性が上がり、Codex 単発の `codex-cli` よりも反復改善が回る。

---

## 関係するスキル

| スキル | 役割 |
|---|---|
| `review-loop` | Claude 単体で 9 観点並列レビュー → 修正 → 再レビューをループ |
| `codex-cli` | Codex CLI に任意プロンプトを投げて単発レビュー |
| `codex-advisor` | Codex を「相談プロトコル」で advisor として呼ぶ |
| **本スキル** | review-loop の枠組みに Codex を「もう 1 人のレビュアー」として組み込み、両者を同期させてループ |

実行モード（PR あり / PR なし）、Phase 2/3 のゲート、Phase 7 のインラインコメント投稿、Phase 8 の commit/push 制御などは
`review-loop` と同じ規約に従う。本スキルは **Phase 4 と Phase 6（集計）を拡張** する。

---

## 全体フロー

```
[Iteration N]
  │
  ├─ Phase 1: 初期化（review-loop と同じ：HAS_PR / DIFF_CMD / IS_OWN_PR / TICKET_ID 判定）
  │
  ├─ Phase 2: External Signals Gate（PR ありモードのみ、review-loop と同じ）
  ├─ Phase 3: Database Migration Gate（migration 差分時のみ、review-loop と同じ）
  ├─ Phase 3.5: lossy fallback precheck（fallback + side effect 兆候を MUST_RECHECK_TOPICS に追加）
  │
  ├─ Phase 4-A: Claude 9 観点並列レビュー（run_in_background: true × 9）
  ├─ Phase 4-B: Codex 独立レビュー（codex exec --json をバックグラウンド実行）
  │   ※ 4-A と 4-B は同じターンで同時起動する
  │
  ├─ Phase 5: mihari 補完（条件付き、review-loop と同じ）
  │
  ├─ Phase 6: 結果統合・ループ判定
  │    - Claude 指摘集合 C と Codex 指摘集合 X をマージ
  │    - (path, line, category) で正規化して重複判定
  │    - 両方が拾った指摘 = 信頼度昇格（CONFIRMED）
  │    - 片方だけ = 精査ラベル付き（CLAUDE_ONLY / CODEX_ONLY）
  │    - 【v2】6-3.5: 観点内 LLM consolidate（同根論点を 1 件に統合）
  │
  ├─ Phase 6.6【v2 新設】: diff-runs（前回 run との new/carryover/fixed 判定）
  │
  ├─ Phase 7: インラインコメント投稿（PR ありモード、review-loop と同じ）
  │    ※ コメント body の冒頭に [CONFIRMED] / [Claude-only] / [Codex-only] を表示
  │
  ├─ Phase 8: 修正の適用 → commit（PR ありなら push）
  │
  └─ Phase 10: 完了レポート（Claude / Codex のヒット率と一致率を含める）
```

---

## Phase 1: 初期化

### 記憶の読み込み（Phase 1 先頭）

`~/.claude/skills-memory/review-loop-duo/memory.md` が存在すれば読む。
- **Calibration Notes** セクションを `MUST_RECHECK_TOPICS` の初期値として追加（Claude 側）
- **Codex Divergence Patterns** セクションを Phase 4-B の Codex プロンプトに注入する（Codex の過検出パターンを抑制）

`review-loop` の Phase 1 をそのまま実行する。`HAS_PR` / `PR_NUMBER` / `BASE` / `DIFF_CMD` / `TICKET_ID` / `IS_OWN_PR` を確定させて
`.omc/review-loop-state.json` に書き出す。本スキル固有の追加状態として以下を持つ:

```json
{
  "duo": {
    "codex_enabled": true,
    "codex_iterations": [],
    "agreement_rate": []
  },
  "pr_changed_files": []
}
```

`codex_enabled` は前提確認（後述）が通った時のみ `true`。
`pr_changed_files` は次節「PR 差分入力の確定（MUST）」で確定させる。

### PR 差分入力の確定（MUST）

> ⚠️ **PR #3600 インシデント教訓**: `git diff origin/main..<PR-branch>` を素朴に使うと、PR ブランチが取り込んだ merge コミット由来の「別 PR の変更」が PR の変更として diff に混入する。両モデル（Claude / Codex）に同じ汚染入力を渡すと、CONFIRMED が偽陽性を高信頼で押し上げる共倒れが発生する。詳細は [`references/pr-diff-acquisition.md`](references/pr-diff-acquisition.md) を参照。

`HAS_PR=true` の場合は **必ず** 以下を実行して `CHANGED_FILES` を確定する:

```bash
# 推奨: GitHub API で実 PR 変更ファイルを取得（ローカル ref の鮮度に依存しない）
gh api repos/{owner}/{repo}/pulls/${PR_NUMBER}/files --paginate \
  -q '.[].filename' | sort -u > /tmp/pr-changed-files.txt

# diff 本文も gh api の patch フィールド経由、または merge-base 基準を使う
# 方法 B: git fetch origin main && git diff $(git merge-base origin/main pr-${N})..pr-${N}
```

**禁止**: `git diff origin/main..<PR-branch>` の素朴な使用（`origin/main` が古いと別 PR 由来の変更を取り込む）。
**禁止**: `git fetch origin main 2>/dev/null` で fetch 失敗を握り潰すこと。

取得結果は `.omc/review-loop-state.json` の `pr_changed_files[]` に保存し、Phase 4-A / 4-B / Phase 6 から参照する。
`HAS_PR=false`（PR なしモード）では `git diff ${BASE}...HEAD --name-only | sort -u` の結果を `pr_changed_files[]` に保存する。

### PR head checkout（他人PR・巨大PR 向け）

`pr_changed_files[]` が 50件以上、または `IS_OWN_PR=false` の場合、reviewer Agent が変更後コードを正確に Read できるよう PR head に checkout する。詳細は [`references/pr-head-checkout.md`](references/pr-head-checkout.md) を参照。

### 前提確認（Codex 側）

```bash
which codex && codex --version
codex login status 2>/dev/null || echo "NOT_LOGGED_IN"
```

- 未インストール → `codex_enabled=false` にして「Codex なし」モードに落とし、`review-loop` 相当の動作に縮退する。ユーザーには警告を出す。
- 未ログイン → 同上。`codex login` をユーザーに案内（Claude からは走らせない）。

---

## Phase 2 / Phase 3

`review-loop` と完全に同じ。`MUST_RECHECK_TOPICS` を作って Phase 4-A / 4-B の両方に渡す。

### Phase 3.5: lossy fallback precheck

Phase 2 / 3 の後、または遅くとも Phase 4 の前に、差分内の fallback と副作用の近接を機械的に確認する。
これは個別の `operator snapshot` や audit log 専用ルールではなく、「区別すべき異常状態をデフォルト値に潰したまま不可逆な副作用へ進む」パターンを拾うための precheck である。

以下の兆候が同じ hunk または近傍（目安 ±20 行）にある場合は、`MUST_RECHECK_TOPICS` に `lossy-fallback-before-side-effect` を追加する:

- `?: ""`
- `?: false`
- `?: 0`
- `?: emptyList()`
- `?: run { logger.warn`
- `catch` + `logger.warn` + `null`
- `logger.warn` の後に処理継続
- nullable access `?.foo ?:`
- `insert`, `update`, `save`, `create`, `publish`, `send`, `notify`, `enqueue` の近傍に fallback がある

追加する `MUST_RECHECK_TOPICS` の例:

```yaml
- category: lossy-fallback-before-side-effect
  summary: fallback で欠落・解決失敗をデフォルト値に潰した後、DB 書き込み・履歴作成・通知・外部 API 呼び出しなどの副作用へ進んでいないか確認する
  required_followups:
    - 複数の異常状態が同じデフォルト値に畳み込まれていないか
    - logger.warn だけで失敗が呼び出し側へ伝播しないまま継続していないか
    - 保存後の値から「本当の値」か「解決失敗」か区別できるか
    - テストが fallback を正常系として固定していないか
```

---

## Phase 4-A: Claude 側 9 観点並列レビュー

`review-loop` の Phase 4 と同じ。1 メッセージで 9 つの Agent を `run_in_background: true` で起動する。
各レビュアーのモデル選択ルール（haiku / sonnet）、出力フォーマット（`FINDINGS: XC YW ZM VI`、`INLINE_COMMENTS_JSON:` ブロック）も同じ。

**v2 追加**: 各 Agent は **構造化 JSON 出力** も併存させる必要がある (Phase 6 の機械的集約と Phase 6-3.5 consolidate のため)。
**`review-loop` の reviewer-prompts.md は旧フォーマット（`[重大度] ファイル名:行番号 - 問題の説明`）のままなので、各 Claude reviewer Agent を起動する際は、プロンプト末尾に [`references/finding-output-format.md`](references/finding-output-format.md) の「指摘の 3 分解」セクションと「Claude 側 Agent への追加指示」を必ず追記すること**（これを怠ると Claude 側だけ `why_problem` / `impact` / `fix` が埋まらず、Codex 側のみ新フォーマットになる）。各 finding は `why_problem`（なぜ問題か＝機序・最重要）/ `impact`（なぜ修正が必要か＝帰結）/ `fix`（どう直すか＝方針）の 3 フィールドを必ず埋める。
schema 本体は [`references/schemas/finding.schema.json`](references/schemas/finding.schema.json)。
後方互換のため `FINDINGS:` 行と `INLINE_COMMENTS_JSON:` ブロックは引き続き出力する。

**duo 固有追加**: silent-failure Agent には `lossy-fallback-before-side-effect` を明示する。単なる empty catch や ignored return だけでなく、依存データの欠落・解決失敗・権限不一致・時点不一致を空文字、null、false、0、emptyList、UNKNOWN enum、デフォルトオブジェクトなどに潰し、そのまま DB 書き込み・履歴作成・監査ログ・通知・外部 API 呼び出しへ進む処理を Critical / Warning 候補として確認すること。保存後の値だけで「本当の値」と「解決失敗」を区別できないなら、category は既存の `implicit-fallback` より `lossy-fallback-before-side-effect` を優先する。

### scope guard プロンプト追記（MUST）

各 Claude reviewer Agent を起動するプロンプトの末尾に、Phase 1 で確定した `pr_changed_files[]` を埋め込んだ以下のブロックを必ず追記する:

```
レビュー対象は以下の <PR_CHANGED_FILES> リストに含まれるファイルのみ。
これ以外のファイルへの指摘は、たとえ diff 本文に出てきても出さないこと。
diff 本文には merge コミット由来のノイズが混じる可能性があるため、
list に無いファイルへの指摘は「自分の入力が壊れている」サインとして破棄する。

<PR_CHANGED_FILES>
{{pr_changed_files_joined_by_newline}}
</PR_CHANGED_FILES>
```

これを怠ると、PR #3600 のような「別 PR 由来の merge コミット差分」を PR の変更と誤認した指摘が大量に生成される。

---

## Phase 4-B: Codex 独立レビュー（同じターンで起動）

**Phase 4-A の 9 Agent と同じターン** で Codex を 1 本起動する。Bash の `run_in_background: true` でバックグラウンド実行し、
Phase 4-A の完了待ちと並行させる。

**v2 改修**: `codex review` / `codex exec` の使い分けを廃止し **`codex exec` 単一**で PR あり / なし両モードを統一。
`--output-schema` で JSON schema 出力を強制する。具体的なコマンドライン、オプション解説、`CODEX_MODEL` の罠 (ChatGPT account で `-m gpt-5` を指定すると `400 invalid_request_error`)、エラーハンドリングは [`references/codex-invocation.md`](references/codex-invocation.md) を参照。
schema 本体は [`references/schemas/finding.schema.json`](references/schemas/finding.schema.json)、Codex プロンプトの観点詳細・出力規約は [`references/finding-output-format.md`](references/finding-output-format.md)。

### 観点プロンプト本体 (Codex 側)

Codex プロンプトは Claude 側 reviewer-prompts.md の 9 観点要点を 1 本にまとめた以下を使う。`MUST_RECHECK_TOPICS` と差分は呼び出し時に埋め込む:

````
あなたはレビュアーです。以下の差分を 9 観点で網羅レビューしてください。

観点:
1. coding-rules - 命名・複雑度・DRY・マジックナンバー
2. architecture - レイヤー依存・責務分離・副作用局所化
3. security - OWASP Top 10・認可・テナント分離・入力検証
4. silent-failure - 空 catch・戻り値無視・暗黙フォールバック・lossy fallback before side effect・switch 網羅漏れ
5. requirements - チケット ${TICKET_ID} の AC との照合 (AC 不明なら省略)
6. test-adequacy - AC 未カバー・期待結果の曖昧さ・エッジケース不足
7. performance - N+1・不要 SELECT・バッチ未使用・キャッシュ未活用・全件取得
8. semantic-consistency - コメント/KDoc 宣言と実装の乖離・snapshot/audit/history 系の既存類似実装との横並び不整合・同一 INSERT/UPDATE 内での複合スナップショットフィールドの時系列不整合 (発動条件未充足ならスキップ可)
9. impact-regression - 呼び出し元への波及 (シグネチャ/例外契約/null 性/戻り値型の変更が caller を壊さないか)・データフロー波及 (テーブル/カラムの読み書き、enum 網羅性、API レスポンス型と FE zod の追従)・既存テスト fallout (変更対象を呼ぶ既存テストの期待値更新漏れ、回帰テストの追加要否)

silent-failure では、単なる empty catch や ignored return だけでなく、依存データの欠落や解決失敗をデフォルト値に潰して、そのまま副作用へ進む処理を重点的に確認すること。

例:
- nullable result を `?: ""`, `?: false`, `?: emptyList()` で潰した後に DB 書き込みする
- `logger.warn` だけして処理を継続する
- 複数の失敗理由を同じ sentinel / default に畳み込む
- 失敗を Result / exception / sealed type として呼び出し側に返さない
- テストが fallback を正常系として期待している

副作用後に保存されたデータから「本当の値」と「解決失敗」が区別できない場合は、`lossy-fallback-before-side-effect` として Critical / Warning 候補にする。

MUST_RECHECK_TOPICS (Phase 2/3 で収集された強制再確認カテゴリ):
${MUST_RECHECK_TOPICS_SUMMARY}

レビュー対象は以下の <PR_CHANGED_FILES> リストに含まれるファイルのみ。
これ以外のファイルへの指摘は、たとえ差分本文に出てきても出さないこと。
差分本文には merge コミット由来のノイズが混じる可能性があるため、
list に無いファイルへの指摘は「入力が壊れている」サインとして破棄する。

<PR_CHANGED_FILES>
${PR_CHANGED_FILES}
</PR_CHANGED_FILES>

差分:
${DIFF_CONTENT}

各 finding は説明を 3 フィールドに分けて書くこと (1 つの文章塊にしない):
- why_problem (最重要): なぜ問題か = 機序。コードが実際に何をしていて、どの不変条件・前提・契約・意図に反するか。問題の仕組みを具体的に書く。「危険」「規約違反」などのラベルや summary の言い換えで終わらせない
- impact: なぜ修正が必要か = 帰結。放置した場合の具体的な悪影響（誰が・どんな状況で・何を失うか）。重大度の根拠
- fix: どう直すか = 方針。具体コードは before / after に入れる
why_problem と impact は別物。why_problem=「コードが X をして不変条件 Y を破る」、impact=「その結果 Z の損害が誰々に起きる」。同じ文を両方に書かないこと。

出力フォーマット:
- JSON Schema (perspective / model / iteration / findings[] / summary) に従って response を返す
- **トップレベルの `perspective` は `"multi"` 固定** (本プロンプトは 9 観点を 1 レスポンスで返すため。単一観点に絞った出力にしない)
- **`findings[]` の各要素には `perspective` フィールドを必ず付ける**。値は 9 観点 (coding-rules / architecture / security / silent-failure / requirements / test-adequacy / performance / semantic-consistency / impact-regression) のいずれか。これにより 1 レスポンスで複数観点の指摘を保持する
- 各 finding は why_problem / impact / fix を必ず埋める (空・薄い why_problem は不採用扱いになりうる)
- findings[].id は CDX-1, CDX-2 のように "CDX" prefix を付ける (Claude 側 CR-, SE- 等と被らないため)
- findings[].model は "codex-cli-default" 固定 (CODEX_MODEL が設定されていればその値)
- summary の数値は findings 配列を集計した結果と一致させること
- category は finding-output-format.md の語彙を優先利用 (tenant-isolation / n-plus-one / empty-catch / lossy-fallback-before-side-effect ...)
- 発動条件未充足の観点は findings に含めない (該当 finding を出さなければ自然に省略される。トップレベル `perspective` は `"multi"` のまま固定)
````

### 起動コマンド

詳細は [`codex-invocation.md`](references/codex-invocation.md) に分離。要点だけ抜粋:

```bash
codex exec \
  -C "$PWD" \
  --skip-git-repo-check \
  -s read-only \
  --color never \
  --output-schema "$SKILL_DIR/references/schemas/finding.schema.json" \
  --output-last-message "$LOG_DIR/codex-iter${N}.json" \
  "$PROMPT" < /dev/null
```

⚠️ `CODEX_MODEL` は **未設定推奨** (ChatGPT account では `-m gpt-5` 指定で 400 エラー)。設定済みなら `-m "$CODEX_MODEL"` を追加。

### 待ち合わせ

Phase 4-A の 9 Agent と Codex の Bash 子プロセスが全て完了するまで待つ。
Codex はタイムアウトしうるので、上限を 5 分（300 秒）に設定し、超過時は「Codex タイムアウト」として
そのイテレーションは Claude 単独結果でループ判定する（Codex を無効にはしない、次イテレーションで再挑戦）。

Codex が親ランタイムの場合は、Bash `run_in_background: true` の代わりに、利用可能な shell 実行ツールで返される session id を polling して待ち合わせる。子 `codex exec` が sandbox 由来の `Operation not permitted` で失敗した場合は、承認付きの権限外実行で 1 回だけ再試行する。再試行できない場合は `codex_enabled=false` として Claude 単独結果に縮退する。

---

## Phase 5: mihari 補完

`review-loop` と同じ条件で `mihari` スキルを呼ぶ。mihari は Claude 側 test-adequacy の結果に対して動くので、
Codex の test-adequacy 指摘は Phase 6 の統合フェーズで合算する形でよい（mihari への直接入力はしない）。

---

## Phase 6: 結果統合・ループ判定

Claude 9 Agent の出力と Codex の出力（`$LOG_DIR/codex-iter${N}.json`）から指摘を抽出し、統合する。

### 6-0. scope filter（MUST）

Claude / Codex から集めた全 finding に対し、Phase 1 で確定した `pr_changed_files[]` に `path` が含まれているかを機械的に検証する。
含まれていない finding は **入力汚染由来の偽陽性** とみなし、自動で破棄する。

```python
# 擬似コード
discarded = []
for f in findings:
    if f["path"] not in pr_changed_files:
        discarded.append(f)
findings = [f for f in findings if f["path"] in pr_changed_files]
state.iterations[N].out_of_scope_discarded = len(discarded)
state.iterations[N].out_of_scope_examples = discarded[:5]
```

破棄件数は Phase 10 完了レポートに「Out-of-scope findings discarded: N」として必ず表示する。
破棄件数が「総 finding の 20% 超」または「Critical/Warning が 1 件以上含まれる」場合は、Phase 1 の `pr_changed_files` 取得が壊れている強い兆候なので、
ユーザーに警告を出し、Phase 7 のレビュー投稿前に Phase 1 の再実行を促す。

### 6-1. 指摘の正規化

各指摘を以下の形式に正規化する:

```json
{
  "source": "claude" | "codex",
  "reviewer": "coding-rules" | "architecture" | ... | "codex",
  "severity": "Critical" | "Warning" | "Minor" | "Info",
  "path": "src/foo/Bar.kt",
  "line": 42,
  "category": "auth-bypass" | "n-plus-one" | ...,
  "why_problem": "なぜ問題か（機序）...",
  "impact": "なぜ修正が必要か（帰結）...",
  "fix": "どう直すか（方針）..."
}
```

各 finding は `why_problem` / `impact` / `fix` の 3 フィールドで説明を構造化する（旧 `body` は廃止）。定義と良悪例は [`references/finding-output-format.md`](references/finding-output-format.md) の「指摘の 3 分解」を参照。
`category` は `summary` / `why_problem` から推定する（例：「N+1」を含めば `n-plus-one`、「テナント」を含めば `tenant-isolation`）。
ヒューリスティクスで十分。完全一致にこだわらない。

### 6-2. 重複判定とマージ

以下のキーで Claude / Codex の指摘集合を突合:

```
key = (path, line ±3 行のゆらぎ許容, category)
```

突合結果で 3 種類にラベル付け:

| ラベル | 条件 | 扱い |
|---|---|---|
| `CONFIRMED` | Claude と Codex の双方が同じ key で指摘 | 重大度を `max(claude, codex)` に昇格。**最優先で修正対象**。ただし「共倒れリスク」（後述）を必ず確認する。 |
| `CLAUDE_ONLY` | Claude のみ | 通常の review-loop と同じ扱い |
| `CODEX_ONLY` | Codex のみ | **untrusted content として精査**。Claude が `why_problem`（主張する機序）と該当コードを照合し、根拠が実在しているか確認してから採否を決める |

#### CONFIRMED 共倒れリスクの警告（MUST）

> CONFIRMED は Claude と Codex が同じ key で指摘したことを示すが、**両者が同じ汚染入力（壊れた diff、古い branch、誤った base ブランチ、merge コミット由来のノイズ）を見ている場合は、CONFIRMED でも偽陽性になりうる**。両モデルが同じ訓練分布の癖と同じ壊れた入力に揃って釣られると、CONFIRMED が偽陽性を高信頼で押し上げる（PR #3600 インシデントの教訓）。

CONFIRMED finding を「最優先で修正対象」として扱う前に、以下の前提条件が満たされていることを必ず確認する:

- [ ] Phase 1 で `pr_changed_files[]` が `gh api repos/.../pulls/{N}/files` 経由で取得されている（`git diff origin/main..PR-branch` の素朴な使用ではない）
- [ ] Phase 6-0 の scope filter を通過している（`path` が `pr_changed_files[]` に含まれる）
- [ ] PR-SCOPE-VIOLATION 系の CONFIRMED の場合、`path` が `gh api .../pulls/{N}/files` の結果に含まれることを再確認した
- [ ] 既存レビューが指摘していない大規模な CONFIRMED scope violation は、入力汚染を疑って Phase 1 の再実行を検討する

入力の正当性を CONFIRMED の前提条件として扱うこと。CONFIRMED の件数だけで信頼してはならない。

### 6-3. CODEX_ONLY の精査

Codex の指摘は hallucination リスクがあるので、修正適用前に Claude が必ず以下を確認:

1. `path` と `line` の周辺コードを `Read` で確認
2. 指摘の根拠が実在するか（存在しない関数を指摘していないか、削除済みコードを指摘していないか）
3. プロジェクト規約と整合するか

精査結果で `CODEX_ONLY` をさらに 3 つに分ける:
- `CODEX_VALID` → 通常の指摘として採用
- `CODEX_DOUBTFUL` → Minor に格下げして Phase 10 で「Codex 提案・要人判断」として残す
- `CODEX_HALLUCINATION` → 破棄

### 6-3a. semantic-consistency 観点の特例

**semantic-consistency（観点 8）に限り、CLAUDE_ONLY / CODEX_ONLY でも重大度を下げない**。
理由: コメント宣言と実装の乖離・複合スナップショットの時点ズレなどは Claude と Codex が同じ訓練分布の盲点を共有しやすい観点で、CONFIRMED に偏らず片方検出に偏ることが構造的に起こる。CONFIRMED でないことを理由に重大度を緩めるとこの観点で拾った Critical を取りこぼす。
適用ルール:
- `CODEX_ONLY` の semantic-consistency 指摘も Phase 6-3 の精査（実在確認・hallucination 破棄）は通常通り行う
- 精査を通った `CODEX_VALID` は元の重大度（Critical/Warning）を維持
- `CLAUDE_ONLY` の semantic-consistency 指摘も同じく重大度を維持
- Phase 6-5 のループ判定でも片側検出の semantic-consistency Critical/Warning を残指摘として正規にカウントする

### 6-3.5. 観点内 LLM consolidate（v2 新設）

機械 dedup (6-2) と CODEX 精査 (6-3 / 6-3a) を経た findings に対し、**観点内で同根論点を 1 件に統合**する LLM consolidate を実行する。
`parallel-review-codex` の Phase 3.5 を duo に移植したもので、別 file 同パターン違反や同 file 別 line の重複指摘をノイズとして圧縮する。

実行条件・Task agent プロンプト・出力フォーマット・失敗時挙動の詳細は [`references/consolidate-protocol.md`](references/consolidate-protocol.md) を参照。

要点だけ抜粋:

- 観点ごとに 1 つの Task agent を `run_in_background: true` で起動 (最大 9 並列、`model: sonnet`)
- 機械 dedup を通過したが「別問題」と判断したものは絶対に統合しない
- 統合後 severity は元 findings の最高値に昇格 (`severity_promoted: true` を立てる)
- CONFIRMED finding (両 backend 検出) は単独でも統合せず保持
- 件数の上限による絞り込みは禁止 (独立論点は全て保持)
- 観点跨ぎ統合は禁止

結果は `state.iterations[N].consolidatedFindings` に書き出し、6-4 以降の集計はこの結果を使う。
小規模 PR (findings 5 件未満) や Critical/Warning がない iteration ではこの Phase をスキップする。
`state.iterations[N].consolidate.status` に `success` / `partial` / `skipped` / `failed` を記録する。

### 6-4. 集計

```
Total Critical: X 件 (CONFIRMED: a, CLAUDE_ONLY: b, CODEX_VALID: c)
Total Warning:  Y 件 (...)
Total Minor:    Z 件 (...)
Total Info:     W 件 (...)

Agreement Rate: CONFIRMED / (CONFIRMED + CLAUDE_ONLY + CODEX_VALID) = NN%
```

`agreement_rate` を `.omc/review-loop-state.json` の `duo.agreement_rate[]` に追記。
イテレーションを跨いで agreement rate が上がっていれば「片方の見落とし」が減っていることを意味する。

### 6-5. ループ判定

`review-loop` Phase 6 の継続判定を使う。**ただし以下を追加**:

- `CONFIRMED Critical/Warning > 0` の場合、ユーザー確認をスキップして必ず継続する（両モデル合意した指摘は信頼度が高いため）
- `CODEX_ONLY` のみで Critical 件数が水増しされている場合に注意。集計表示時は CONFIRMED / CLAUDE_ONLY / CODEX_VALID の内訳を必ず出す

---

## Phase 6.6: diff-runs（v2 新設）

duo を **同じ PR / ブランチで複数回 run** したとき、前回 run の最終 `consolidatedFindings` と今回を比較して `new` / `carryover` / `fixed` を判定する。
ループ自動修正で「直したはずなのに再発した」や「何度回しても消えない指摘 (= 手動対応必要)」を即座に検知するために使う。
`parallel-review-codex` の Phase 3.7 を duo に移植したもの。

詳細手順 (state 配置 / マッチング key / カテゴリ分類 / ループ判定への影響 / 失敗時挙動) は [`references/run-diff-protocol.md`](references/run-diff-protocol.md) を参照。

### 実行条件と要点

- iteration が完了した直後 (6-4 集計後、Phase 7 投稿前) に実行
- 同じ PR 番号 OR 同じブランチで過去 run state (`.omc/review-loop-duo/runs/`) が存在する場合のみ
- 初回 run やファイル欠落時は `state.iterations[N].diffRuns = null` を記録してスキップ (ループは止めない)

### マッチング key

```
key = (path, category, line_bucket)
line_bucket = floor(line / 10)  # ±10 行のゆらぎ許容
```

`all_locations` が複数ある consolidated finding は locations のいずれかが一致すれば match 扱い。

### ループ判定への追加ルール

| 条件 | アクション |
|---|---|
| Critical/Warning 全件が `carryover_count >= 3` | 🔚 **収束** → Phase 10 (手動対応サマリー) |
| `new` カテゴリに Critical/Warning が含まれる | ⚠️ **副作用警告** → 修正は続行するが Phase 10 で前回 fix との関係を必ず報告 |
| `fixed` 件数 > 0 | ✅ 進捗あり → 通常通り次 iteration へ |

state スナップショットは各 iteration 終了時に `.omc/review-loop-duo/runs/YYYY-MM-DD-HHMM-pr{N}-iter{M}.json` に書き出す。
PR なしモードでは `pr{N}` を `branch-{slug}` に置換。

---

## Phase 7: インラインコメント投稿

PR ありモードで、`review-loop` Phase 7 と同じ手順で `gh api ...pulls/${PR_NUMBER}/reviews` に投稿する。
**ただし各コメント body は finding の 3 フィールドを「なぜ問題か」を先頭に置いた固定構造でレンダリングする**。
1 行で済ませず、読み手がコードを追い直さなくても PASS/FIX を判断できる粒度にすること。

コメント body テンプレート:

```
**[Critical] [CONFIRMED]** （Claude + Codex 一致指摘） `tenant-isolation`

**なぜ問題か**: {{why_problem}}

**放置するとどうなるか**: {{impact}}

**どう直すか**: {{fix}}

` ` `suggestion
{{after}}
` ` `
```

- **`なぜ問題か`（why_problem）を必ず最初に置く**。ここが指摘の核。
- `impact` は「放置するとどうなるか」、`fix` は「どう直すか」として続ける。
- `before` / `after` がある場合のみ末尾にコード（GitHub の ` ```suggestion ` ブロック or before→after の対比）を付ける。無ければ省略。
- ラベル `[severity] [confidence]` と `category` slug は 1 行目に出す。

ラベルの例: `[Critical] [CONFIRMED]`（両モデル一致）/ `[Warning] [Codex-only]`（Codex のみ・Claude 精査済み）/ `[Warning] [Claude-only]`。

Minor/Info は `review-loop` と同じく `<!-- minor-only -->` / `<!-- info-only -->` タグでフィルタしてインライン投稿から除外。

---

## Phase 8: 修正の適用

`review-loop` と同じ。`IS_OWN_PR=false` ならスキップ。
修正の優先順位:

1. `CONFIRMED Critical`
2. `CLAUDE_ONLY Critical` / `CODEX_VALID Critical`
3. `CONFIRMED Warning`
4. `CLAUDE_ONLY Warning` / `CODEX_VALID Warning`
5. high confidence Minor（判断のみ）

### 修正ジャーナル収集（duo 拡張）

`review-loop` の Phase 8-1 と同じ手順で `state.iterations[N].fixes[]` を append するが、
**各エントリに `confidence` フィールドを必ず付与する**。値は Phase 6-3 で確定したラベルを引き継ぐ:

```json
{
  "finding": {
    "reviewer": "security",
    "severity": "Critical",
    "path": "src/foo/Bar.kt",
    "line": 42,
    "category": "tenant-isolation",
    "summary": "tenantIdフィルタ漏れ",
    "why_problem": "findById が主キーだけで引き、テナント境界の不変条件を満たさない。tenantId が WHERE に無く id 列挙で越境できる",
    "impact": "他テナント利用者が id 差し替えで別企業の注文を閲覧（IDOR）。個人情報の越境漏洩"
  },
  "change": "OrderRepository.findById → findByIdAndTenantId に置換し SQL レベルで認可を強制",
  "confidence": "CONFIRMED"
}
```

`finding` には Phase 6 で確定した `why_problem` / `impact` を引き継いで保持する（Phase 10 ジャーナルの「なぜ問題か / 放置リスク」に直結するため）。`change` は実際に適用した修正内容。

`confidence` の取り得る値:
- `CONFIRMED`: Claude と Codex の両方が指摘（最優先で修正、最高信頼度）
- `CLAUDE_ONLY`: Claude のみが指摘
- `CODEX_VALID`: Codex のみが指摘し、Phase 6-3 で Claude が精査済み・採用

`CODEX_DOUBTFUL` / `CODEX_HALLUCINATION` は修正対象外なので `fixes[]` に積まない。

### コミット

commit メッセージは duo であることを明記:

```bash
git commit -m "review-loop-duo: iter${N} - fix ${X}C ${Y}W (CONFIRMED: ${a}, Claude-only: ${b}, Codex-valid: ${c})"
```

---

## Phase 9: 他人 PR モード（IS_OWN_PR=false）

`review-loop` の Phase 9 と同じ。コード修正・commit・push は行わず、インラインコメントで投稿のみ。
ラベル（CONFIRMED / Claude-only / Codex-only）はそのまま付ける。
深掘りループは最大 3 回。

---

## Phase 10: 完了レポート

`review-loop` の Phase 10 に加え、duo 統計を必ず出す:

```
## ✅ Review Loop Duo 完了

| Iter | Critical | Warning | Minor | Info | CONFIRMED | Claude-only | Codex-valid | Codex-doubtful | Agreement |
|------|----------|---------|-------|------|-----------|-------------|-------------|----------------|-----------|
| #1   |        3 |       5 |     1 |    2 |         4 |           3 |           1 |              1 |       50% |
| #2   |        1 |       2 |     1 |    1 |         2 |           1 |           0 |              0 |       67% |
| #3   |        0 |       0 |     1 |    1 |         0 |           0 |           0 |              0 |        —  |

Codex hallucination 検出: ${HALLUCINATION_COUNT} 件（破棄済み）
Codex タイムアウト: ${CODEX_TIMEOUT_COUNT} 回
```

agreement rate が低い（< 30%）場合は、両モデルの観点に大きな差があることを意味する。
報告に「Claude と Codex で観点ズレが大きい。指摘の独立性が高く、見逃しリスクが低かった可能性」と添えると有用。

### 入力検証セクション（MUST、PR #3600 教訓）

完了レポートには **必ず** 以下を含める。これは「入力汚染由来の偽陽性レビューを投稿していない」ことを後から検証可能にするための監査トレース:

```
## 🔍 入力検証

- Phase 1 取得方式: gh api repos/{owner}/{repo}/pulls/{N}/files (推奨A案)
- PR_CHANGED_FILES 件数: ${len(pr_changed_files)} 件
- Phase 6-0 で out-of-scope として破棄した finding: ${OUT_OF_SCOPE_DISCARDED} 件
  - うち Critical/Warning: ${OUT_OF_SCOPE_CW} 件
- PR-SCOPE-VIOLATION 系の指摘を投稿した場合の再確認:
  - ${each violation path} が gh api .../files の結果に含まれる: ✅ / ❌
```

`OUT_OF_SCOPE_DISCARDED` が「総 finding の 20% 超」または「Critical/Warning が 1 件以上含まれる」場合は、
Phase 1 の入力取得が壊れている強い兆候なので、レポートの先頭に ⚠️ 警告を必ず置く。

### v2 追加セクション: consolidate 統計

`state.iterations[N].consolidate.status` が `success` / `partial` だった iteration について、観点ごとに以下を追加表示する:

```
## 📦 観点内 consolidate 統計

| 観点 | Pre-consolidate | Post-consolidate | 圧縮率 | severity 昇格 |
|---|---:|---:|---:|---:|
| coding-rules | 12 | 7 | 42% | 2 件 |
| security | 5 | 3 | 40% | 1 件 |
| ...

合計: 71 → 48 件 (32% 圧縮)
```

`partial` の場合は失敗観点を脚注で示し、`skipped` の iteration は表から除外する。

### v2 追加セクション: diff-runs サマリ

`state.iterations[N].diffRuns` が記録された iteration について以下を追加:

```
## 🔁 連続 run の差分 (diff-runs)

前回 run: runs/2026-05-22-1620-pr3122-iter2.json

| 分類 | 件数 |
|---|---:|
| 🆕 new (今回新規) | 2 |
| ♻️ carryover (継続) | 3 |
| ✅ fixed (解消) | 5 |

### 🆕 今回新規発生した Critical/Warning
- [Critical] src/foo/Cache.kt:88 (PF-2) - キャッシュ初期化漏れ
  → 前回 fix した SE-1 の副作用の可能性あり

### ♻️ 3 run 連続で carryover している指摘 (手動対応推奨)
- [Warning] src/foo/Util.kt:17 (SF-1) - 空 catch  (carryover_count=3)
```

初回 run やスキップ iteration では本セクションを出さない。

### 修正ジャーナル（自分PR・duo 版）

`IS_OWN_PR=true` のときのみ、`review-loop` Phase 10 のジャーナルに加えて
各エントリの見出しに **confidence ラベル** を付ける。各エントリは finding の 3 分解
（なぜ問題か / 放置リスク / どう直したか）をそのまま引き継いで書く:

```
## 修正ジャーナル（自分PR）

### Iteration 1
#### [Critical] [CONFIRMED] src/foo/Bar.kt:42  (security / tenant-isolation)
- なぜ問題か: findById が主キーだけで引き、テナント境界の不変条件を満たさない。tenantId が WHERE に無く id 列挙で越境できる（Claude + Codex 一致）
- 放置リスク: 他テナント利用者が id 差し替えで別企業の注文を閲覧（IDOR）。個人情報の越境漏洩
- どう直したか: OrderRepository.findById → findByIdAndTenantId に置換し SQL レベルで認可を強制
- commit: abc1234

#### [Warning] [Codex-valid] src/foo/Cache.kt:88  (performance / cache-miss)
- なぜ問題か: 同一クエリを毎回 DB に投げており、結果が不変なのにキャッシュしていない（Codex のみ、Claude 精査済み）
- 放置リスク: N+1 ではないが高頻度アクセスで latency が累積。ピーク時に DB 負荷が線形に増える
- どう直したか: Caffeine.builder().maximumSize(256).build() を導入
- commit: def5678

### Iteration 2
#### [Warning] [Claude-only] src/foo/Util.kt:17  (silent-failure / empty-catch)
- なぜ問題か: catch (Exception) で握りつぶし、ログも再throwも無く処理を継続している（Claude のみ）
- 放置リスク: 失敗が呼び出し側に伝播せず、障害が無言で進行する。原因調査の手がかりも残らない
- どう直したか: logger.error 追加 + DomainException に変換して呼び出し側へ伝播
- commit: ghi9012

### Iteration 3
✅ 完了（Critical/Warning ゼロ）
```

`confidence` ラベルを見出しに出すことで、後から「両モデル合意の指摘」と「片方のみの指摘」を識別できる。
`CODEX_DOUBTFUL` / `CODEX_HALLUCINATION` は修正していないのでジャーナルに出ない（既存の duo 統計テーブルで件数のみ示す）。

---

## エラーハンドリング

| 症状 | 対処 |
|---|---|
| `codex: command not found` | `codex_enabled=false` に落として review-loop 相当で続行。完了レポートで明示 |
| `codex login` 未済 | 同上。ユーザーに `codex login` を案内 |
| Codex タイムアウト（>300s） | そのイテレーションは Claude 単独結果でループ判定。次イテレーションで再挑戦 |
| Codex 出力に `FINDINGS:` 行がない | 出力末尾を grep し、なければ「Codex 出力パース失敗」として CLAUDE_ONLY 扱いで続行 |
| Codex の指摘 line がファイル末尾を超える | hallucination として破棄 |
| Codex の指摘 path がリポジトリに存在しない | hallucination として破棄 |

**Codex 側の失敗で Claude 側ループを止めない**。これが本スキルの基本姿勢。

---

## やってはいけないこと

- Codex の指摘を精査せずそのまま commit する（必ず Phase 6-3 の精査を経る）
- `--sandbox workspace-write` で Codex を起動する（read-only で十分）
- Codex を直列で呼ぶ（Phase 4-A と同じターンでバックグラウンド起動すること。直列だと所要時間が倍になる）
- 「CONFIRMED 0 件だから完了」と判断する（CLAUDE_ONLY / CODEX_VALID の Critical/Warning が残っていればループ継続）
- レビュアー（Claude Agent / Codex）に base ブランチを示さず、作業ツリー（main 相当）のコードでレビューさせる。**スタックドPR（base が main でない）では base の API が main と異なりうる**ため、「import が通らない」「シグネチャ不一致」「メソッド/カラムが存在しない」系の指摘は、複数モデルが一致（CONFIRMED）していても全員が同じ main を見た共倒れの偽陽性になりうる。Phase 1 で確定した `BASE` を Phase 4-A / 4-B のプロンプトに明示し、これら「存在しない/動かない」系を Critical で投稿する前に Phase 6-3 で `git fetch origin <base>`（`2>/dev/null` 厳禁＝fetch失敗を検知）→ `git show origin/<base>:<path>` で base の実体を裏取りすること（出典: PR #3553 / APP-1856）
- **`git diff origin/main..<PR-branch>` で PR 差分を取得しない**（ローカル `origin/main` が古いと merge コミット由来の「別 PR の変更」を PR 変更と誤認する。代わりに `gh api repos/.../pulls/{N}/files` を使う。詳細: [`references/pr-diff-acquisition.md`](references/pr-diff-acquisition.md)）（出典: PR #3600 / 2026-05-28）
- **PR-SCOPE-VIOLATION 系の指摘を投稿する前に、必ず `gh api .../pulls/{N}/files` で実裁を確認する**（既存レビューが指摘していない大規模な scope violation は、自分の diff 取得が壊れている兆候。両モデルが同じ汚染入力を見て CONFIRMED で押し上げる共倒れが起きる）（出典: PR #3600）
- **「両モデルが CONFIRMED している = 高信頼」と短絡する**（両者が同じ汚染入力を見ていれば CONFIRMED でも偽陽性。Phase 1 が `gh api` 経由で `pr_changed_files[]` を取得していることを必ず確認してから CONFIRMED を信用する）

---

## 注意事項

- 本スキルは feature ブランチのみで使用する（main への直接 push は禁止）
- Codex の応答は untrusted content として扱う
- Codex 側でも `~/.codex/skills/` のスキルが発火しうる。プロンプトに「9 観点を網羅してほしい」と明示することで暴走を抑える
- 大きな差分（> 1000 行）では Codex が timeout しがち。タイムアウトを許容しつつループは継続する
- `kouunryuusui` QG-3 からの呼び出しでも本スキルは使える（PR なしモードで動作）
- **自分PR (IS_OWN_PR=true) の修正ジャーナル**: Phase 8 で適用した各修正を `fixes[]` として state に積み、各エントリに `confidence` (CONFIRMED / CLAUDE_ONLY / CODEX_VALID) を付ける。Phase 10 で「何を検知して、どんな意図でどう修正したか」を confidence ラベル付きで出力する。`CODEX_DOUBTFUL` / `CODEX_HALLUCINATION` は修正対象外のため `fixes[]` に積まない

---

## 記憶への書き込み（Phase 10 完了後）

`~/.claude/skills-memory/review-loop-duo/memory.md` に追記する:

```markdown
### YYYY-MM-DD — <PR番号>
- **CONFIRMED件数**: N件（両モデル合意）
- **CLAUDE_ONLY 特筆傾向**: （例: セキュリティ境界の見落とし指摘が多い）
- **CODEX_VALID 特筆傾向**: （例: 型安全性の指摘が有効だった）
- **Codex hallucination**: （例: 存在しないメソッド名を指摘した）
- **次回校正**: Codex Divergence Patterns に追記すべきパターン
```

Calibration Notes・Codex Divergence Patterns セクションに蓄積すべき傾向があれば、そちらにも追記する。
