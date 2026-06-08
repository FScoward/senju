---
description: PRのAIレビューを指摘事項（Critical/Warning）がゼロになるまで自動ループするスキル。PRなし（ローカルdiff）モード対応で、kouunryuusui QG-3 Stage 2からも直接呼び出し可能。「指摘が無くなるまでレビューして」「クリーンになるまでレビュー」「review-loop」「全部直してから終わって」「指摘ゼロになるまで続けて」「レビューを繰り返して」などの指示で必ず使うこと。9観点（コーディング規約・アーキテクチャ・セキュリティ・サイレント障害・要件充足・テスト妥当性・パフォーマンス・意味論的整合性・影響範囲回帰）を並列レビューし、テスト不足が検出された場合はmihariスキルを自動呼び出しして深掘り補完する。修正→再レビューを最大5回繰り返して自動的にコードをクリーンな状態にする。指摘が出続ける限り止まらない点が parallel-review との違い。
license: MIT
metadata:
    github-path: skills/review-loop
    github-ref: refs/heads/main
    github-repo: https://github.com/FScoward/senju
    github-tree-sha: 814624ef089112570c851df3d7d051800a1831ff
name: review-loop
---
# review-loop

PRのAIレビューを指摘事項が**ゼロになるまで**自動ループする。

**PR ありモード**: `gh pr diff` で PR 差分を取得し、各イテレーション後に GitHub インラインコメントを投稿する。  
**PR なしモード**: `git diff $BASE...HEAD` でローカル差分を使用。インラインコメント投稿をスキップし、commit のみ行い push は行わない（kouunryuusui QG からの呼び出しを想定）。

`/parallel-review` が「1サイクル（Critical再チェック込み）」で終わるのに対し、
このスキルは「Critical/Warning がゼロになるまで何度でも繰り返す」。

## ループフロー

```
[Iteration N]
  │
  ├─ Phase 2: External Signals Gate（PRありモードのみ）
  │    既存review thread / failed CI / PR metadataを取得し、MUST_RECHECK_TOPICSを作る
  │
  ├─ Phase 3: Database Migration Gate（migration差分がある場合のみ）
  │    Flyway version / timestamp / index / lock / scopeをdeterministicに確認する
  │
  ├─ 9観点を並列レビュー（run_in_background: true × 9）
  │
  ├─ 全指摘を統合・集計
  │    Critical: X件 / Warning: Y件 / Minor: Z件 / Info: W件
  │
  ├─ X == 0 AND Y == 0？
  │    YES → high confidence Minorの扱いを確定 → ✅ 完了（Phase 10へ）
  │
  ├─ N >= 5 AND 残指摘あり？
  │    YES → 🙋 ユーザーに「続けますか？」と確認
  │            A: はい  → max_iterations += 5、Iteration N+1 へ
  │            B: いいえ → ⚠️ 残指摘サマリー（Phase 10へ）
  │
  ├─ 同じ指摘が収束（自動修正不可）？
  │    YES → ⚠️ 手動対応サマリー（Phase 10へ）
  │
  └─ それ以外 → 修正を適用 → commit（PR ありの場合のみ push）→ Iteration N+1
```

**収束チェック（無限ループ防止）**:
前回と同じ件数・同じファイルの指摘が繰り返される場合（auto-fix 不可の指摘が残っている状態）は、
それ以上ループしても意味がないため「手動対応が必要な指摘あり」として終了する。

---

## Phase 1: 初期化

### 記憶の読み込み（Phase 1 先頭）

`~/.claude/skills-memory/review-loop/memory.md` が存在すれば読む。
- **Calibration Notes** セクションを `MUST_RECHECK_TOPICS` の初期値として追加（繰り返し出る true positive を優先チェックに）
- 確証のある false positive パターンを除外条件として Phase 4 の各レビュアープロンプトに注入する

### モード判定（最初に実行）

```bash
# PR の存在確認
PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null)
if [ -n "$PR_NUMBER" ] && [ "$PR_NUMBER" != "null" ]; then
  HAS_PR=true
else
  HAS_PR=false
  PR_NUMBER=""
fi

# チケットID（ブランチ名から抽出、なければ空文字）
TICKET_ID=$(git branch --show-current | grep -oE '[A-Z]+-[0-9]+' | head -1 || echo "")

if [ "$HAS_PR" = "true" ]; then
  # PR ありモード
  DIFF_CMD="gh pr diff ${PR_NUMBER}"
  PR_BODY=$(gh pr view $PR_NUMBER --json body -q '.body' 2>/dev/null || echo "")
else
  # PR なしモード: ベースブランチを検出してローカル diff を使う
  # 3 ドット形式 (...) で merge-base 起点の diff を取得する
  BASE=$(cat .claude/tmp/base-branch.txt 2>/dev/null \
    || git rev-parse --abbrev-ref @{upstream} 2>/dev/null \
    || echo "origin/main")
  DIFF_CMD="git diff ${BASE}...HEAD"
  # AC 情報: sprint-contract.md → scratch.md → なし の優先順で取得
  PR_BODY=$(cat sprint-contract.md 2>/dev/null || cat scratch.md 2>/dev/null || echo "")
fi
```

### PR 差分入力の確定（MUST、PR #3600 教訓）

> ⚠️ `git diff origin/main..<PR-branch>`（2 ドット）を素朴に使うとローカル `origin/main` が古い場合に「別 PR 由来の merge コミット差分」が PR の変更として diff に混入する。レビュアーがこれを「PR の変更」と誤認すると、別 PR で既に main にマージ済みのコードに対して指摘を量産する。`review-loop-duo` で発生したインシデントの再発防止策をここにも反映する。

`HAS_PR=true` の場合は **必ず** GitHub API で変更ファイル一覧を別途取得し、`pr_changed_files[]` として state に保存する:

```bash
gh api repos/{owner}/{repo}/pulls/${PR_NUMBER}/files --paginate \
  -q '.[].filename' | sort -u > /tmp/pr-changed-files.txt
```

`HAS_PR=false`（PR なしモード）では `git diff ${BASE}...HEAD --name-only | sort -u` を `pr_changed_files[]` に保存する。

**禁止**: `git diff origin/main..<PR-branch>`（2 ドット形式）の素朴な使用。`gh pr diff` または 3 ドット形式（`...HEAD`）を使うこと。
**禁止**: `git fetch origin main 2>/dev/null` で fetch 失敗を握り潰すこと。

### diffサイズ判定（モデル選択に使用）

```bash
# diff の行数を取得してサイズを判定
DIFF_LINES=$(eval "$DIFF_CMD" | wc -l | tr -d ' ')
if [ "$DIFF_LINES" -lt 200 ]; then
  DIFF_SIZE="small"   # 200行未満: coding-rules も haiku 可
else
  DIFF_SIZE="large"   # 200行以上: coding-rules は sonnet
fi
```

**モデル選択ルール（コンテキスト消費を抑えるため）**:

| レビュアー | Iter 1 + diff large | Iter 1 + diff small | Iter 2以降 |
|---|---|---|---|
| coding-rules | **sonnet** | **haiku** | **haiku** |
| architecture | **sonnet** | sonnet | sonnet |
| security | **sonnet** | sonnet | sonnet |
| silent-failure | **haiku** | haiku | haiku |
| requirements | **sonnet** | sonnet | sonnet |
| test-adequacy | **sonnet** | sonnet | sonnet |
| performance | **sonnet** | sonnet | sonnet |
| semantic-consistency | **sonnet** | sonnet | sonnet |
| impact-regression | **sonnet** | sonnet | sonnet |

- `silent-failure` は常にhaiku（パターン検出が主体で判断不要）
- `coding-rules` はIteration 1 かつ diff が大きい場合のみsonnet（初回網羅後は差分確認のみ）
- `architecture / security / requirements / test-adequacy / performance / semantic-consistency / impact-regression` は常にsonnet（意味理解・判断が必要）

### 自分のPRかどうかの判定（修正可否の決定）

```bash
if [ "$HAS_PR" = "true" ]; then
  PR_AUTHOR=$(gh pr view $PR_NUMBER --json author -q '.author.login')
  CURRENT_USER=$(gh api user -q '.login')
  if [ "$PR_AUTHOR" = "$CURRENT_USER" ]; then
    IS_OWN_PR=true
  else
    IS_OWN_PR=false
  fi
else
  # PR なしモード: 常に自分のコード
  IS_OWN_PR=true
fi
```

**`IS_OWN_PR=false` の場合（他人のPR）**:
- レビューは全て実行する（指摘内容を報告する）
- **コードへの修正・Edit・commit・push は一切行わない**
- Phase 8 はスキップし、代わりに **Phase 9** でインラインコメントとして投稿する
- 各指摘を該当ファイルの該当行に紐づけてGitHub Reviewとして1件で投稿する
- **深掘りループを最大3回実行する**: 各イテレーションで前回の指摘を踏まえた深掘りレビューを行い、新たな指摘が出なくなったら終了する

---

状態を `.omc/review-loop-state.json` に記録:
```json
{
  "pr_number": 0,
  "has_pr": true,
  "base": "origin/main",
  "diff_cmd": "gh pr diff 123",
  "pr_changed_files": [],
  "ticket_id": "",
  "is_own_pr": true,
  "must_recheck_topics": [],
  "external_signals": {},
  "migration_gate": {},
  "max_iterations": 5,
  "current_iteration": 0,
  "iterations": [],
  "status": "running"
}
```

`pr_changed_files[]` は Phase 1 の「PR 差分入力の確定」セクションで確定させたファイル一覧。Phase 4 / Phase 6 の scope guard と scope filter で参照される。

各 `iterations[]` 要素は Phase 8 で以下のフィールドを持つ（`IS_OWN_PR=true` のみ `fixes` を埋める）:

```json
{
  "iteration": 1,
  "critical": 3, "warning": 5, "minor": 1, "info": 2,
  "auto_fixed": 8,
  "fixes": [
    {
      "finding": {
        "reviewer": "security",
        "severity": "Critical",
        "path": "src/foo/Bar.kt",
        "line": 42,
        "category": "tenant-isolation",
        "summary": "tenantIdフィルタ漏れで他テナントの注文を読める"
      },
      "intent": "認可境界の侵害。tenantId必須化でIDORを防ぐ",
      "change": "OrderRepository.findById を findByIdAndTenantId に置換し、Service層から呼び出し変更"
    }
  ],
  "minor_dispositions": [],
  "manual_required": 0,
  "commit": "abc1234"
}
```

---

## Phase 2: External Signals Gate（PRありモードのみ）

> **⛔ `HAS_PR=false`（PRなしモード）の場合はこのPhaseをスキップ。**

AI レビューを始める前に、GitHub 上の既存シグナル（`statusCheckRollup` / review threads / PR body）を取得し、以降のレビュアーへ渡す `MUST_RECHECK_TOPICS` を作る。failed check や既存 review thread は「参考情報」ではなく、review-loop の入力として扱う。

**詳細手順（必須コマンド・GraphQL クエリ・出力フォーマット）は [`references/external-signals-gate.md`](references/external-signals-gate.md) を参照すること。** Phase 2 を実行する時はそのファイルを読んで該当セクション（2-1 / 2-2 / 2-3 / 2-4）の手順を使う。

出力末尾は必ず `FINDINGS: {critical}C {warning}W {minor}M {info}I` 行で締める。failed Migration Version Check は **Critical** として扱い、CI failure の root cause が未確定のまま Phase 4 へ進まない。

---

## Phase 3: Database Migration Gate（migration差分がある場合のみ）

> **実行条件**: `git diff --name-status origin/main...HEAD` または PR files に `backend/src/main/resources/db/migration/*.sql` が含まれる場合のみ実行する。

このPhaseは通常 reviewer とは別に必ず実行する。結果は `MIGRATION_GATE_FINDINGS` として Phase 6 の集計対象に含め、同時に `MUST_RECHECK_TOPICS` へ追加して Phase 4 の全レビュアーへ渡す。

**詳細手順（必須コマンド・必須確認項目・重大度基準・出力フォーマット）は [`references/database-migration-gate.md`](references/database-migration-gate.md) を参照すること。** Phase 3 を実行する時はそのファイルを読んで該当セクション（3-1 / 3-2 / 3-3 / 3-4）の手順を使う。

主要な deterministic gate（必ず Critical として扱う条件）:
- 同一 Flyway version collision
- failed Migration Version Check
- main 最新 migration より古い timestamp

出力末尾は必ず `FINDINGS: {critical}C {warning}W {minor}M {info}I` 行で締め、`MUST_RECHECK_TOPICS_APPEND` で Phase 4 のレビュアーに横展開する。

---

## Phase 4（各イテレーション）: 9観点並列レビュー

**1メッセージで9つのAgentを同時起動**（`run_in_background: true`）。

各レビュアーへの共通追加指示:
- `{DIFF_CMD}` で差分を取得してレビュー対象を絞ること（リポジトリ全体を見ない）
  - PR ありモード: `gh pr diff {PR_NUMBER}`
  - PR なしモード: `git diff {BASE}...HEAD`
- **scope guard（MUST）**: レビュー対象は Phase 1 で確定した `{PR_CHANGED_FILES}` リストに含まれるファイルのみ。これ以外のファイルへの指摘は、たとえ差分本文に出てきても出さないこと（差分本文には merge コミット由来のノイズが混じる可能性があるため。list に無いファイルへの指摘は「入力が壊れている」サインとして破棄する）
- Phase 2 / 3 で作った `{MUST_RECHECK_TOPICS}` を必ず再確認すること
  - 既存 review thread と同じ指摘を重複投稿するだけで終わらず、同カテゴリの横展開を確認すること
  - 例: Flyway collision が出たら、timestamp 最新性、同一 version、migration ordering、CI gate を横断確認する
  - 例: partial index predicate が出たら、Kotlin enum、query constant、CHECK制約、将来enum追加時の性能退行を横断確認する
  - failed check がある場合、その root cause が修正済みか、または今回の差分で未解決のままかを明示すること
- ただし重大リスクは diff 内だけで判断しない。変更された型・DB列・enum・API DTO・フォーム値・raw SQL は `rg` で参照元を追い、差分外の seed / fixture / setup script / caller / mapper への波及も確認すること
- diff外で見つけた Critical / Warning 相当の問題は、diff内の起点行に紐づけるか、紐づけできない場合は fallback finding として出力すること
- 指摘は `ファイル名:行番号` 形式で具体的に
- **行番号はdiff内の追加行（`+` で始まる行）に存在する行を優先して特定すること**（PR ありモード: インラインコメント投稿に使用）
- 重大度を **Critical / Warning / Minor / Info** で分類
- 重大度基準:
  - **Critical**: 本番データ破壊、権限/テナント漏れ、確実な migration 失敗、データ消失
  - **Warning**: 環境依存の migration 失敗、API不整合、schema変更の波及漏れ、fixture/seed破壊、仕様上危険な default
  - **Minor**: 直ちに壊れないが high confidence で直す / 判断を残す価値がある保守性・運用リスク・scope creep・テスト説明不足
  - **Info**: JSDoc、軽微な命名、軽微な a11y、参考情報のみ
- Critical / Warning がある場合、Minor / Info / Nit は最大3件までに抑え、投稿ノイズより重大指摘の精度を優先すること
- 変更種別ごとの必須クロスチェック:
  - DB migration: backfill / precondition、seed、fixture、setup script、raw SQL INSERT、Flyway version、timestamp、index naming、lock影響、partial index predicate、query shape
  - enum / value object 追加: 全 mapping、default値、未知値処理、frontend 定数同期
  - API request / response 変更: 既存 field との整合性、client payload、validation
  - UI form 変更: default値が仕様を歪めないか、submit payload、component test
  - destructive script 追加: 実行時ガード、対象環境制限、誤実行時の被害範囲
- 修正案は Before/After のコード例を含める
- 出力の**最終行**に必ず `FINDINGS: {critical}C {warning}W {minor}M {info}I` の形式で集計を記載
- **PR ありモードのみ**: `FINDINGS:` 行の**直前**に `INLINE_COMMENTS_JSON:` ブロックを出力すること（後述フォーマット参照）
- **PR なしモード**: `INLINE_COMMENTS_JSON:` ブロックの出力は不要
- **深掘りモード（IS_OWN_PR=false かつ N >= 2）**: 前回イテレーションの指摘 `{PREV_FINDINGS}` を踏まえた上で、前回見落とした観点・深掘りが必要な点を重点的に確認すること。前回と同じ指摘は出力不要。特に前回の指摘カテゴリ（migration / API / enum / UI / destructive script 等）から波及する関連箇所を追加探索し、新たな指摘のみを出力する。新規指摘が0件の場合は `FINDINGS: 0C 0W 0M 0I` と返す

**`INLINE_COMMENTS_JSON:` ブロックのフォーマット**（PR ありモードのみ）:

```
INLINE_COMMENTS_JSON:
[
  {
    "path": "src/foo/Bar.kt",
    "line": 42,
    "side": "RIGHT",
    "body": "**[Critical]** 問題の説明\n\n```kotlin\n// Before\nval x = ...\n// After\nval x = ...\n```"
  }
]
INLINE_COMMENTS_JSON_END
```

- `path`: 差分内のファイルパス（リポジトリルートからの相対パス）
- `line`: 差分の右辺（変更後）の行番号。削除のみの場合は `side: "LEFT"`
- `body`: GitHub Markdown 形式。先頭に `**[Critical]**` / `**[Warning]**` / `**[Minor]**` / `**[Info]**` を付ける
- **Minor は `body` 末尾に `<!-- minor-only -->` を付加する**（Phase 7 でフィルタリングに使用）
- **Info は `body` 末尾に `<!-- info-only -->` を付加する**（Phase 7 でフィルタリングに使用）
- 指摘がない場合は空配列 `[]` を出力する

### 9観点のレビュアー Agent

各レビュアーの **Agent 起動プロンプト全文** は [`references/reviewer-prompts.md`](references/reviewer-prompts.md) に切り出している。Phase 4 を実行する時は、そのファイルを読んで該当セクションの Agent テンプレートを使うこと。

| # | レビュアー | モデル選択ルール | 重点 |
|---|---|---|---|
| 1 | coding-rules | Iter1+large は sonnet、それ以外 haiku | 命名・複雑度・DRY・マジックナンバー |
| 2 | architecture | 常に sonnet | レイヤー依存・責務分離・副作用局所化 |
| 3 | security | 常に sonnet | OWASP・認可・テナント分離・入力検証 |
| 4 | silent-failure | 常に haiku | 空catch・戻り値無視・switch網羅漏れ |
| 5 | requirements | 常に sonnet | チケット AC との照合・スコープクリープ |
| 6 | test-adequacy | 常に sonnet | AC未カバー・期待結果の曖昧さ・エッジケース |
| 7 | performance | 常に sonnet | N+1・不要 SELECT・バッチ未使用・キャッシュ未活用 |
| 8 | semantic-consistency | 常に sonnet | コメント宣言と実装の乖離・既存類似実装との横並び不整合・複合スナップショットの時系列不整合 |
| 9 | impact-regression | 常に sonnet | 呼び出し元波及・データフロー上下流への影響・既存テスト fallout・enum/型変更の網羅性 |

詳細プロンプトテンプレートは references/reviewer-prompts.md の対応セクション（1〜9）を参照。各テンプレートには `{DIFF_CMD}` / `{N}` / `{PR_NUMBER}` / `{TICKET_ID}` / `{DIFF_SIZE}` / `{PR_CHANGED_FILES}` のプレースホルダーがあるので、Phase 1 で確定した値で差し替えてから Agent に渡す（`{PR_CHANGED_FILES}` は scope guard 用、改行区切りのファイル名リスト）。

---

## Phase 5（条件付き）: mihari によるテスト充足性深掘り

> **実行条件（全て満たす場合のみ）**:
> 1. `test-adequacy` レビュアーの結果が **Critical ≥ 1 OR Warning ≥ 2**
> 2. `IS_OWN_PR=true`（テスト追加ができる自分のコード）
> 3. 差分にテストファイルが含まれる（`git diff` に `*Test.kt` / `*.test.ts` 等が存在する）
>
> 上記いずれかを満たさない場合は **このPhaseをスキップ** してPhase 6へ進む。

### 呼び出し

```
Skill("mihari") を呼び出す（内部ループスキル）

渡す情報:
  target:
    ac_source:            {PR_BODY}  # PRのAC本文 or sprint-contract.md
    test_code_paths:      差分内の *Test.kt / *.test.ts / *.test.tsx のパスリスト
    implementation_paths: 差分内の非テストファイルのパスリスト
    scope_description:    "review-loop iter{N} — test-adequacyで {X}Critical {Y}Warning を検出"
  config:
    max_iterations:           3          # review-loop内呼び出しなので短めに
    log_path:                 scratch.md
    allow_warning_with_dr:    true
    run_tests_on_each_iteration: true
```

### mihari 結果の扱い

| mihari 返却 | review-loop の扱い |
|---|---|
| `PASS` | test-adequacy の指摘をクリア扱いにしてPhase 6へ |
| `FAIL` | mihari の残存指摘を test-adequacy 分に合算してPhase 6へ |
| `ESCALATE` | mihari の結果をそのまま手動対応リストに追加してPhase 6へ |

mihari が追加したテストは commit 対象に含める（Phase 8 の `git add -A` で自動的に含まれる）。

---

## Phase 6: 結果集計・ループ判定

7エージェント完了後（mihari 呼び出し時はその結果も反映）、各出力末尾の `FINDINGS: XC YW ZM VI` 行をパースして集計する。
Phase 2 / 3 の gate findings は通常 reviewer と同じ重みで集計し、特に migration gate の Critical / Warning はループ判定から除外しない。

### scope filter（MUST、PR #3600 教訓）

集計の **前** に、全 finding の `path` が Phase 1 で確定した `pr_changed_files[]` に含まれているかを機械的に検証する。
含まれていない finding は **入力汚染由来の偽陽性** とみなし、自動で破棄する。破棄件数は Phase 10 完了レポートに「Out-of-scope findings discarded: N」として必ず表示する。

破棄件数が「総 finding の 20% 超」または「Critical/Warning が 1 件以上含まれる」場合は、Phase 1 の `pr_changed_files` 取得が壊れている強い兆候なので、ユーザーに警告を出し、Phase 7 のレビュー投稿前に Phase 1 の再実行を促す。

```
Total Critical: X件
Total Warning:  Y件
Total Minor:    Z件（対応判断を必ず残す）
Total Info:     W件（修正対象外。ただし運用リスク系はsummaryへ）
```

**ループ継続判定**:

| 条件 | アクション |
|------|-----------|
| Critical=0 AND Warning=0 AND high confidence Minorの判断完了 | ✅ **完了** → Phase 10 |
| IS_OWN_PR=false かつ 新規指摘なし（前回と同じ / 0件） | ⚠️ **収束** → Phase 10（コード修正できないため終了） |
| IS_OWN_PR=false かつ iteration >= 3 | 🔚 **深掘りループ上限** → Phase 10 |
| IS_OWN_PR=false かつ 新規指摘あり | 🔄 **Phase 9 へ（コメント投稿→再ループ）** |
| 前回と全く同じ指摘（収束） | ⚠️ **手動対応が必要** → Phase 10 |
| iteration >= 5 AND Critical/Warning > 0 | 🙋 **ユーザーに継続するか尋ねる** |
| それ以外 | 🔄 **Phase 8 へ（修正して再ループ）** |

**Minor / Info の扱い**:

- Critical / Warning が 0 でも、high confidence の Minor は黙って捨てない
- Minor は「対応済み」「対応不要」「別チケット」「スコープ外」のいずれかを Phase 10 の final summary に必ず残す
- scope creep / test description / migration operation risk は Info でも summary に残す
- Info は inline 投稿しなくてよい。ただし deterministic gate で拾った operational risk は final summary の補足に入れる

**修正ジャーナル収集の条件**:

- `IS_OWN_PR=true` のときのみ、Phase 8 で適用した各修正を `state.iterations[N].fixes[]` に追記し、Phase 10 でジャーナル出力する
- `IS_OWN_PR=false` のときは Phase 9 のインラインコメント投稿のみで、修正ジャーナルは記録しない

**最大回数到達時のユーザー確認**:

```
## ⏸️ Review Loop — 5回完了しましたが、まだ指摘が残っています

| 指摘の種類 | 件数 |
|-----------|------|
| Critical  |   X  |
| Warning   |   Y  |

残っている主な指摘:
- [Critical] ファイル名:行番号 - 概要
- [Warning] ファイル名:行番号 - 概要

引き続きループを続けますか？

A) はい — さらに5回ループを続ける
B) いいえ — 残指摘をサマリーして終了
```

---

## Phase 7: インラインコメントをPRに投稿

> **⛔ `HAS_PR=false`（PR なしモード）の場合はこのPhaseをスキップ。**
> PR が存在しない状態ではインラインコメントを投稿できない。GitHub 連携は PR 作成後に行う。

8 エージェントの出力から `INLINE_COMMENTS_JSON:` ブロックを全て抽出・統合し、GitHub PR Review として一括投稿する。**Minor / Info はここで除外**（Critical/Warning のみ投稿）。

**詳細手順（JSON 抽出ルール・ヘッドコミット SHA 取得・`gh api` 投稿コマンド・エラーフォールバック）は [`references/inline-comment-posting.md`](references/inline-comment-posting.md) を参照すること。** Phase 7 を実行する時はそのファイルを読んで該当セクション（7-1 / 7-2 / 7-3 / 7-4）の手順を使う。

**インラインコメント投稿失敗はレビューループを止めない**（フォールバックとして `gh pr comment` を使用、修正フェーズは続行）。

---

## Phase 8: 修正の適用

> **⛔ `IS_OWN_PR=false` の場合はこの Phase を丸ごとスキップ。**
> 他人のPRへのコード修正・commit・push は絶対に行わない。

### 8-1. コード修正（Critical / Warning + 対応する high confidence Minor）

1. 指摘ファイルを `Read`
2. `Edit` で修正を適用
3. **修正ジャーナルを記録**: 直後に `state.iterations[N].fixes[]` へ以下を append（自分PR専用）:
   ```json
   {
     "finding": {
       "reviewer": "<指摘元のレビュアー名>",
       "severity": "Critical | Warning | Minor",
       "path": "<file>",
       "line": <int>,
       "category": "<指摘カテゴリ>",
       "summary": "<元の指摘の1行要約>"
     },
     "intent": "<なぜ修正したか。重大度の根拠＋設計意図を1〜2行>",
     "change": "<どう直したか。Before/After要点を1〜3行（差分そのものは入れない）>"
   }
   ```
4. フォーマット・型チェック（プロジェクトのlintコマンドを実行）

**ジャーナル粒度ルール**:
- `intent` は 1〜2 行（例: "認可境界の侵害。tenantId 必須化で IDOR を防ぐ"）
- `change` は 1〜3 行（例: "OrderRepository.findById → findByIdAndTenantId に置換、Service 層から呼び出し変更"）
- 1 イテレーションで 10 修正を超える場合は、Critical/Warning のみ詳細化し、Minor は `change` を 1 行に圧縮する
- 修正対象が複数ファイルにまたがる場合は、起点 finding に紐づけて `change` 内で「+ X, Y へ波及」と書く

**修正できない指摘の扱い**:
設計判断・仕様確認が必要な指摘は自動修正せず「手動対応リスト」に追加してループから除外する。
high confidence Minor は、自動修正するか、修正しない理由を「対応不要」「別チケット」「スコープ外」のいずれかで記録する。

### 8-2. Commit & Push

```bash
git add -A
git commit -m "review-loop: iter{N} - fix {X}C {Y}W ({ファイル名の簡単なサマリ})"

# PR ありモードのみ push する
# PR なしモード（kouunryuusui QG 等）では push しない（T5 の Push 確認まで push を保留）
if [ "$HAS_PR" = "true" ]; then
  git push
fi
```

### 8-3. 状態更新

`.omc/review-loop-state.json` を更新:
```json
{
  "iterations": [
    {
      "iteration": 1,
      "critical": 3,
      "warning": 5,
      "minor": 1,
      "info": 2,
      "auto_fixed": 8,
      "fixes": [
        {
          "finding": {
            "reviewer": "security",
            "severity": "Critical",
            "path": "src/foo/OrderService.kt",
            "line": 42,
            "category": "tenant-isolation",
            "summary": "tenantIdフィルタ漏れで他テナントの注文を読める"
          },
          "intent": "認可境界の侵害。tenantId必須化でIDORを防ぐ",
          "change": "OrderRepository.findById を findByIdAndTenantId に置換、Service 層から呼び出し変更"
        }
      ],
      "minor_dispositions": [
        {
          "finding": "migration operation risk の説明不足",
          "decision": "対応済み",
          "reason": "PR本文にlock影響とCONCURRENTLY不要理由を追記"
        }
      ],
      "manual_required": 0,
      "commit": "abc1234"
    }
  ]
}
```

`fixes[]` は `IS_OWN_PR=true` のときのみ埋める。`IS_OWN_PR=false` では空配列のまま。

---

## Phase 9（他人のPR専用）: インラインコメント投稿

> **このPhaseは `IS_OWN_PR=false` の場合のみ実行する。コード修正・commit・push は絶対に行わない。**

指摘をまとめて 1 件の一般 PR コメントにするのではなく、GitHub Review API を使って各指摘を**該当ファイルの該当行に紐づけたインラインコメント**として投稿する。深掘りループは最大 3 回、新規指摘が出なくなったら終了。

**詳細手順（HEAD SHA 取得・JSON 変換ルール・バッチ投稿・エラーハンドリング・フォールバック・深掘り継続判定）は [`references/foreign-pr-mode.md`](references/foreign-pr-mode.md) を参照すること。** Phase 9 を実行する時はそのファイルを読んで該当セクション（9-1 〜 9-5）の手順を使う。

---

## Phase 10: 完了レポート

完了レポートのテンプレート全文は [`references/report-formats.md`](references/report-formats.md) を参照すること。Phase 10 を出力する時はそのファイルを読んで該当フォーマットを使う。

### 出力ケース

| ケース | 条件 | テンプレート |
|---|---|---|
| ✅ クリーン達成（PR ありモード） | `HAS_PR=true` AND Critical=0 AND Warning=0 | references/report-formats.md セクション 1 |
| ✅ クリーン達成（PR なしモード） | `HAS_PR=false` AND Critical=0 AND Warning=0 | references/report-formats.md セクション 2 |
| ⚠️ 残指摘あり | 収束 / max iterations / ユーザー終了で打ち切り | references/report-formats.md セクション 3 |

### 共通の構成

- イテレーション別の件数テーブル（Critical / Warning / Minor / Info / Auto-fix / PR Review or Commit）
- 観点別サマリー（External Signals Gate / Database Migration Gate / 9 観点）
- Minor 判断（対応済み / 対応不要 / 別チケット / スコープ外）
- **修正ジャーナル**（`IS_OWN_PR=true` のときのみ）— `state.iterations[].fixes[]` をイテレーション昇順に展開
- 残指摘ありの場合は「手動対応が必要な指摘」セクションを末尾に追加

修正ジャーナルの書式・エントリ構造は references/report-formats.md 末尾の「修正ジャーナルのエントリ書式」セクションを参照。

---

## 注意事項

- **⛔ 他人のPRは修正禁止**: PRの作成者が自分でない場合、Edit・commit・push は一切行わない
- **PR ありモード: commit & push はイテレーション毎に実行**する（次のレビューが最新の差分を見るために必須）
- **PR なしモード: commit のみ、push は行わない**（呼び出し元 T5 の Push 確認まで push を保留）
- **PR ありモード: インラインコメントはイテレーション毎に投稿**する（Phase 7 は各イテレーションで必ず実行）
- **PR なしモード: Phase 7（インラインコメント投稿）はスキップ**する
- **Minor / Info はインラインコメントから除外**する（`<!-- minor-only -->` / `<!-- info-only -->` タグでフィルタリング）
- **Critical/Warning が0でも即完了にしない**。high confidence Minor の対応判断を final summary に残してから完了する
- **External Signals Gate / Database Migration Gate の結果は reviewer と同じ入力**として扱う。failed CI や既存 review thread を「参考情報」として読み捨てない
- **手動対応リストに入った指摘**は以降のループ判定から除外する
- **このスキルは featureブランチのみ**で使用する（mainへの直接pushは行わない）
- **インラインコメント投稿失敗はループを止めない**（フォールバックとして `gh pr comment` を使用）
- **kouunryuusui QG からの呼び出し時**: PR なしモードで動作する。QG-3 Stage 1（mihari）で既にテスト充足性・AC 適合を確認済みのため、requirements / test-adequacy 観点での指摘は参考情報として扱ってよい
- **自分PR (IS_OWN_PR=true) の修正ジャーナル**: Phase 8 で適用した各修正を `fixes[]` として state に積み、Phase 10 で「何を検知して、どんな意図でどう修正したか」をイテレーション横断で出力する。`IS_OWN_PR=false` ではジャーナルは出さない（コード修正していないため）
- **`git diff origin/main..<PR-branch>`（2 ドット）で PR 差分を取得しない**（ローカル `origin/main` が古いと merge コミット由来の「別 PR の変更」を PR 変更と誤認する。`gh pr diff` または 3 ドット形式を使う。詳細: `review-loop-duo/references/pr-diff-acquisition.md`）（出典: PR #3600 / 2026-05-28）
- **PR-SCOPE-VIOLATION 系の指摘を投稿する前に、必ず `gh api .../pulls/{N}/files` で実在を確認する**（既存レビューが指摘していない大規模な scope violation は、自分の diff 取得が壊れている兆候）

---

## 記憶への書き込み（Phase 10 完了後）

`~/.claude/skills-memory/review-loop/memory.md` に追記する:

```markdown
### YYYY-MM-DD — <PR番号 or ブランチ名>
- **結果**: Critical=0 Warning=0 達成 / N件残存（Nイテレーション）
- **繰り返し出た真陽性**: （例: UseCase層のトランザクション欠如、IDORガード漏れ）
- **false positive**: （例: テストコードの直接INSERT は有効パターン）
- **次回の校正**:
```

Calibration Notes セクションに蓄積すべき傾向があれば、そちらにも追記する。
