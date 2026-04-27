# 下位フロー（Ticket Level）

個別の実装チケットに対して、Worktree作成からPR作成まで実行する。
上位フローから呼ばれる場合は `design.md` と `spec.md` の該当チケット分を参照する。

> **⚠️ 既存修正時のステップ実行ルール**
>
> 対象コードが既に存在する場合でも、T1〜T5の各ステップを実行する。
> 「テストが既にある」「コードが既にある」はスキップの理由にならない。
>
> | ステップ | 新規開発時の目的 | **修正時の目的** |
> |---------|---------------|----------------|
> | T1 | 隔離環境作成 | 同左（修正も隔離して行う） |
> | T2 | モック/スケルトン生成 | **修正箇所の既存UIの挙動を確認し、変更前の状態を記録** |
> | T3 | 検証基準定義 + TDD実装 | **修正後の期待動作・回帰基準を定義 + 既存テストの修正 + 新規テスト追加 + 実装変更**（既存テストが通る ≠ 修正完了） |
> | QG | 品質ゲート | **回帰テスト + 修正の副作用チェック + 品質改善 + セルフレビュー + 自己修正**（既存機能が壊れていないことの確認） |
> | T5 | PR作成 | 同左 |

## T0: AC品質チェック（必須・スキップ禁止）

> **⚠️ 絶対ルール: ACがGWT+Examples形式でない場合、T1に進む前に必ずブラッシュアップする。**
> 「ACはある」はスキップの理由にならない。形式・網羅性・具体性の全てを満たしていることを確認してから進む。

**→ `references/ac-guidelines.md` を読み込み、以下を実行すること。**

### チェック手順

0. **チケット内容の充足性確認**: ACが存在しない、または1行の抽象的な記述のみの場合、フォーマット修正の前に**親チケット/Epicを参照**してコンテキストを補完する。
   - 参照手順は `references/upper-flow.md` の「Step 1a: 周辺チケット参照」に準ずる
   - 上位フロー E1 を経由している場合は `spec.md` / `spec-draft.md` を先に確認し、そちらに情報があれば参照不要
   - 1回の参照で打ち切り、不明点は Decision Record に記録して次のステップへ進む

1. **フォーマット確認**: ACが `Given / When / Then + Examples テーブル` 形式か確認
   - 形式不備 → `ac-guidelines.md` の必須フォーマットに従ってリライト
   - 抽象表現（「正しく表示される」等）→ 具体値に置き換え

2. **7項目チェックリスト**: `ac-guidelines.md` の品質基準（具体性・テスト可能性・正常系網羅性・異常系・境界値・副作用・非機能要件）で網羅性検査
   - 不足項目 → 仕様・コードベース・ドメイン知識から補完。補完ACに `[補完]` マークを付与

3. **ブラッシュアップ結果の記録**: worktreeルートの `scratch.md` に確認結果を記録
   ```markdown
   ## T0: AC品質チェック結果
   - フォーマット: GWT+Examples ✅ / リライト済み ✅
   - 7項目: {充足 / 補完した項目}
   - 補完AC: {件数}件（`[補完]` マーク付き）
   ```

### スキップ条件

以下の**全て**に該当する場合のみスキップ可:
- 上位フロー E1 を通過しており、ACブラッシュアップ済みであることが `spec.md` に記録されている
- **かつ** E1完了から間もない（同一セッション内）

> **⚠️ 修正時もスキップしない**: 修正チケットのACは「修正後の期待動作・回帰基準」を含む形式でブラッシュアップが必要。既存ACが存在しても修正時の観点で再確認する。

---

## T1: Worktree作成と隔離

### base ブランチの決定（stacked-pr 考慮）

> **⚠️ base は `main` 固定ではない**
>
> 通常は `main`（または `origin/main`）が base だが、**stacked-pr** 運用時は親 feature ブランチが base になる。
> `$BASE` を正しく決定し、後続フェーズ（特に QG-2）で参照できるよう記録する。

| 条件 | base ブランチ |
|------|-------------|
| 独立した新規チケット | `origin/main` |
| stacked-pr の子チケット（親PR未マージ） | 親 feature ブランチ（例: `feature/parent-ticket`） |
| stacked-pr の子チケット（親PRマージ済み） | `origin/main` |
| E&C の後続チケット | 前段チケットの feature ブランチまたは main（design に従う） |

### Worktree 作成コマンド

```bash
# base ブランチを決定（ticket-plan.md や stacked-pr の指示を参照）
BASE="origin/main"  # または feature/parent-ticket など

git fetch origin
git branch feature/{チケットID} $BASE
git worktree add ../feature-{チケットID} feature/{チケットID}
cd ../feature-{チケットID}
```

### 記録（QG-2 から参照されるため必須）

worktreeルートに以下を作成:
- `scratch.md`（スクラッチパッド）
- `.claude/tmp/decisions/` ディレクトリ
- **`.claude/tmp/base-branch.txt`**: base ブランチ名を記録（改行なしで1行）

```bash
mkdir -p .claude/tmp/decisions
echo -n "$BASE" > .claude/tmp/base-branch.txt
```

> **なぜ記録が必要か**: QG-2 の `/simplify` 呼び出しで PR 差分範囲を特定するために `$BASE` を参照する。ハードコードすると stacked-pr で誤った差分範囲を見てしまう。

### Native Team ワーカーモード（E4から呼ばれる場合）

上位フロー E4 のチケット実行ループから呼ばれる場合、**T1〜T5の全工程をClaude Code Native Teamのワーカーとして実行する**。
これにより、メインセッション（Team Lead）は E4 のオーケストレーションに専念し、各チケットの実装はワーカーエージェントとして並列進行する。

> **設計思想**: tmuxペーン+ファイルポーリングの代わりに、Native Team の `SendMessage` によるリアルタイムメッセージングを使用する。これにより進捗共有・コンフリクト予防・段階的エスカレーションが可能になる。

| 項目 | 値 |
|------|-----|
| 起動方法 | `Agent(team_name="rdf-{EPIC-ID}", name="worker-{チケットID}", subagent_type="general-purpose")` |
| 作業ディレクトリ | worktreeルート |
| 進捗通知 | `SendMessage` で Team Lead にリアルタイム報告 |
| 完了通知 | `SendMessage("DONE: {チケットID} {status} ...")` |
| 結果収集 | Team Lead がメッセージ受信でリアルタイムに収集 |

#### 通信プロトコル

ワーカーは以下のタイミングで `SendMessage` を使って Team Lead に報告する:

| タイミング | メッセージ形式 | 例 |
|-----------|--------------|-----|
| フェーズ移行時 | `PROGRESS: {ticket_id} T{N}→T{N+1} {概要}` | `PROGRESS: APP-123 T3→QG TDD実装完了、品質ゲートへ` |
| 変更ファイル確定時 | `FILES: {ticket_id} {ファイルパスのカンマ区切り}` | `FILES: APP-123 UserRepository.kt, UserController.kt` |
| ブロッカー発生時 | `BLOCKED: {ticket_id} {問題の詳細}` | `BLOCKED: APP-123 UserEntity.ktの型定義が不整合` |
| QGエスカレーション時 | `ESCALATE: {ticket_id} QG {iteration}/{max} {残存問題}` | `ESCALATE: APP-123 QG 4/5 ビルドエラー収束せず` |
| 完了時 | `DONE: {ticket_id} {status} {変更サマリー} DR:{件数}` | `DONE: APP-123 awaiting_approval 5files,+200/-30 DR:2` |

#### Team Lead からの指示メッセージ

Team Lead（E4メインセッション）からワーカーに以下の指示が送られることがある:

| メッセージプレフィクス | 意味 | ワーカーの対応 |
|----------------------|------|--------------|
| `CONFLICT_WARN:` | 他ワーカーとファイル競合の警告 | 指示に従い、競合ファイルの作業を遅延 or mainマージ後に着手 |
| `RESOLVE:` | ブロッカーへの解決策指示 | 指示に従い作業を再開 |
| `SYNC:` | mainマージ指示 | `git fetch && git merge origin/main` 実行後に作業再開 |
| `ABORT:` | 作業中止指示 | 現在の作業を中断し、状態を報告して停止 |

### DB変更がある場合

> **鉄則: DBマイグレーションはアプリコード変更とは別PRにする。同じPRに混ぜてはならない。**
>
> 理由:
> 1. マイグレーションファイル名はタイムスタンプベース（`V{major}.{timestamp}__description.sql`）のため、複数ブランチで同時にマイグレーションを作ると**ファイル名が衝突する**
> 2. マイグレーションを先にマージ・デプロイすることで、DBスキーマ変更が安全に適用されたことを確認してからアプリコードをデプロイできる
> 3. 問題発生時の切り分けが容易（DB起因かアプリ起因か）

#### 分割フロー

DBマイグレーションを含むチケットは、以下の2段階で実装する:

```
PR 1: マイグレーションのみ（DDLのみ、アプリコード変更なし）
  ├─ T1: Worktree作成（feature/{チケットID}-migration）
  ├─ マイグレーションファイル作成（/managing-database-migrations スキル参照）
  ├─ QG: ./gradlew build でマイグレーション適用確認
  └─ T5: Push & PR作成 → マージを待つ

PR 2: アプリコード変更（PR 1 マージ後）
  ├─ T1: Worktree作成（feature/{チケットID}）
  ├─ main をマージして PR 1 のマイグレーションを取り込む
  ├─ T2〜T5: 通常の実装フロー
  └─ T5: Push & PR作成
```

#### マイグレーションファイル名の衝突防止

- マイグレーションファイルは**PRを作成する直前に作成する**（早く作りすぎると他ブランチと衝突しやすい）
- ファイル名のタイムスタンプは `YYYYMMDDHHmmss` 形式で、作成時点の時刻を使う
- 同じチケットで複数のマイグレーションが必要な場合、タイムスタンプを1秒ずつずらす

#### 例外: マイグレーションのみのチケット

E&Cの DB Expand チケットや Contract チケットなど、マイグレーションだけで完結するチケットは分割不要。そのまま1つのPRで進む。

---

## T2: モック/スケルトン生成（UI変更時のみ）

**UI変更がない場合はスキップして T3 へ。** ただし修正タスクでUIに影響する変更がある場合はスキップしない（既存UIの挙動確認と変更前状態の記録が必要）。

1. チケット要件（+ `spec.md` のAC）に基づきモック/スケルトンを生成
2. **自律判断**:
   - モックがACの全項目をカバー → T3 へ
   - 一部不足だがACから推定可能 → 自動修正して T3 へ
   - 複数の解釈が可能 → Decision Record作成、ACに最も忠実な方向で T3 へ

---

## T3: 実装（TDD / Team並列）

### 検証基準定義（旧T3-pre）

実装開始前に、ACから検証可能な成功基準を定義する。sprint-contract.mdとして保存。

> **設計背景**: 実装前に「何を作るか」「どう検証するか」を明示的にファイルに書き出すことで、QGの評価基準が定量化され、Evaluatorの判定が安定する（[Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) のスプリントコントラクトパターン）。

#### 生成ルール

`spec.md`（または チケットのAC）から以下を抽出し、worktreeルートの `sprint-contract.md` に保存:

```markdown
# Sprint Contract: {チケットID}

## 実装スコープ
- [ ] {実装項目1}
- [ ] {実装項目2}
...

## 検証基準（QGでチェック）

### 機能検証（必須）
| # | 基準 | 検証方法 | 判定 |
|---|------|---------|------|
| F1 | {ACから導出した機能要件} | {テスト名 or 手動確認方法} | ⬜ |
| F2 | ... | ... | ⬜ |

### 品質検証（必須）
| # | 基準 | 検証方法 | 判定 |
|---|------|---------|------|
| Q1 | ビルド成功 | ./gradlew build / npm run typecheck | ⬜ |
| Q2 | lint PASS | ktlintFormat / check:fix | ⬜ |
| Q3 | テスト全PASS | ./gradlew test / npm run test | ⬜ |
| Q4 | 重複コードなし | QG-2レビュー | ⬜ |

### エッジケース検証（推奨）
| # | 基準 | 検証方法 | 判定 |
|---|------|---------|------|
| E1 | {境界値/異常系} | {テスト名} | ⬜ |
```

#### スキップ条件

以下の**全て**に該当する場合のみスキップ可:
- DB変更のみのチケット（マイグレーションファイルのみ）
- **かつ新規開発**（既存修正ではない）

> **⚠️ 修正時: 検証基準定義はスキップしない**
>
> 既存コードの修正では、変更ファイルが少なくてもスプリントコントラクトを生成する。
> 修正時のコントラクトには以下を含める:
> - **修正後の期待動作**（ACから導出）
> - **回帰しないことの基準**（既存テストが全て通ること + 修正が既存動作を壊さないこと）
> - **影響を受ける既存テストの一覧**

### 実装方式判定

| 条件 | 方式 |
|------|------|
| BE + FE 両方に変更あり | **パスA: Team並列** |
| BEのみ or FEのみ | **パスB: 単一エージェント** |
| 独立タスク3つ以上 | **パスA: Team並列** |

### パスA: Team並列

```
TeamCreate("rdf-{timestamp}")
→ worker-be (general-purpose/sonnet): BE実装
→ worker-fe (general-purpose/sonnet): FE実装
→ team-verify: T4統合
```

**Team並列時の品質要件**: 各ワーカーのプロンプトに以下のTDDリファクタリング要件を含めること。

### パスB: 単一エージェント

`general-purpose` (sonnet) でTDD実装: Red → Green → Refactor → コミット

### TDDリファクタリング要件 & テスト品質基準

**→ `references/tdd-quality.md` を読み込み、実装エージェントのプロンプトに含めること。**

リファクタリング要件（Red/Green/Refactor各ステップの詳細要件）、コミット粒度ガイドライン、テスト品質基準が定義されている。

### コンテキスト

上位フローから呼ばれている場合、以下を実装エージェントに渡す:
- `design.md` の該当セクション
- `spec.md` の該当チケットのAC
- `ticket-plan.md` の依存関係情報
- **品質原則（SKILL.md の品質原則セクション）**
- **`references/tdd-quality.md`（TDDリファクタリング要件 & テスト品質基準）**

### テスト戦略

テストピラミッド型（Unit多・Integration中・E2E少）。

> **T3完了を宣言する前に: `references/quality-rules.md` の Verification Before Completion 鉄則を実行すること。**
`spec.md` に記載されたテストスコープに従う。

---

## QG: 品質ゲート（T3完了後に自動実行）

> **⚠️ 絶対ルール: T3完了後、判断・確認なしで即座にQGを起動せよ。**
> 「PR作りますか？」「次に進みますか？」と聞くのはフロー違反。

QGは**単一のサブエージェント**（`general-purpose` sonnet）内で以下を順番に実行する。
メインセッションに返すのは最終結果（PASS/FAIL + サマリー）のみ。

### QG-1: コードフォーマットとビルド

BEとFEを並列で実行:

| タスク | コマンド |
|--------|---------|
| BE品質 | `./gradlew ktlintFormat && ./gradlew build` |
| FE品質 | `npm run check:fix && npm run typecheck && npm run test` |

### QG-2: コード品質改善（旧T3b）

**→ `/simplify` スキルを呼び出してコード品質改善を委譲する。**

`simplify` スキルは「変更されたコード」を対象に reuse / quality / efficiency の3観点でレビューし、問題があれば自動修正する（kouunryuusui の QG-2 の責務とほぼ同じ）。

> **⚠️ 対象範囲の明示が必須**
>
> `simplify` のデフォルトは "recently modified code"（直近の編集）のみ。
> kouunryuusui の QG-2 は **PR 全体の変更差分**（base ブランチからの全差分）を対象にする必要があるため、呼び出し時に対象範囲を明示的に指定する。

#### base ブランチ検出（ハードコード禁止）

`origin/main` をハードコードしてはいけない。**stacked-pr** などで base が別の feature ブランチになるケースがあるため、以下の順で検出する:

| 優先度 | 検出ソース | コマンド例 |
|-------|----------|----------|
| 1 | T1 で記録された base（`.claude/tmp/base-branch.txt`） | `cat .claude/tmp/base-branch.txt` |
| 2 | GitHub PR のメタデータ（PR が既に作成済みの場合） | `gh pr view --json baseRefName -q .baseRefName` |
| 3 | 現在ブランチの upstream tracking | `git rev-parse --abbrev-ref @{upstream}` |
| 4 | `git config` で設定された default base | `git config --get branch.$(git branch --show-current).merge` |
| 5 | フォールバック（最終手段） | `origin/main` |

> **T1 での記録（推奨）**: T1 で worktree を作成するときに、base ブランチを `.claude/tmp/base-branch.txt` に書き出しておく。stacked-pr 運用時はここに `feature/parent-ticket` のような値が入る。

検出後、`$BASE` として以下の手順で使う（検出は QG サブエージェント内で実行）:

```bash
BASE=$(cat .claude/tmp/base-branch.txt 2>/dev/null \
  || gh pr view --json baseRefName -q .baseRefName 2>/dev/null \
  || git rev-parse --abbrev-ref @{upstream} 2>/dev/null \
  || echo "origin/main")

# ドットが3つの ... は merge-base からの差分（PR と等価）
DIFF_RANGE="${BASE}...HEAD"
```

#### 呼び出し定義

| 呼び出し方 | 内容 |
|----------|------|
| スキル起動 | `Skill(skill="simplify", args="<PR差分の指定>")` |
| 対象範囲指定 | 検出した `$BASE` を使って `git diff $BASE...HEAD` の全ファイルを対象にする旨を args に明示 |
| 対象ファイル | PR で変更したファイル全て（T3 の複数コミットやパス A の BE/FE ワーカーがそれぞれ触ったファイルも含む） |
| 完了条件 | simplify が「修正なし」または「全修正適用済み」を返すこと |

#### 呼び出しテンプレート

base ブランチを検出してから args を組み立てて呼び出す:

```
# 事前に上記の検出ロジックで $BASE を決定する（例: feature/parent-ticket or origin/main）

Skill(
  skill="simplify",
  args="Target: the full PR diff (`git diff ${BASE}...HEAD`, where base branch is '${BASE}'). Review every file changed in this PR for reuse, quality, and efficiency. Do NOT limit to the most recent edit. Do NOT touch files outside the PR diff."
)
```

> **stacked-pr 運用時の注意**: 親PRがマージされて base が `origin/main` に変わるタイミングで差分範囲も変わる。QG-2 は常に「その時点の base」からの差分を対象にする（親PR未マージ時は親ブランチからの差分、マージ後は main からの差分）。

#### フォールバック（`/simplify` が利用不可の場合）

`simplify` スキルが未インストールの環境では、QGサブエージェント内で以下の3観点を手動チェックし問題があれば自動修正する:
1. 既存コードとの重複排除
2. 命名と可読性
3. 不要な複雑さの除去

> **⚠️ スコープ厳守**: simplify / 手動チェックのいずれも、**PR 全体の変更差分（`git diff $BASE...HEAD`）の中だけ**を対象とする。
> - `$BASE` は上記の検出ロジックで決定（`origin/main` 固定ではなく stacked-pr の親ブランチを考慮）
> - PR で変更したファイル全部（T3 の複数コミット・BE/FE ワーカーの全成果物）を見る
> - PR 差分に含まれないファイルは触らない。関連ファイルで気づいた改善点は Decision Record に記録するに留め、このチケット/PR では触らない（CLAUDE.md の「変更スコープの厳守」に従う）

### QG-3: セルフレビュー（Two-stage）

> **ステージ1 PASS後にのみステージ2を実行する。**
> 要件が満たされていない状態でコード品質を見ても意味がないため。

#### ステージ1: Spec Compliance（要件適合チェック）

ステージ1 は **2 パート** で構成される:

1. **パート A: AC 適合チェック**（Agent A 単独、軽量）
2. **パート B: テスト充足性ループ**（`mihari` スキル呼び出し、反復）

**ステージ1 PASS = パート A PASS + パート B PASS** の両方を満たすこと。

---

##### パート A: AC 適合チェック（Agent A 単独）

`general-purpose` sonnet の Agent A で以下をチェック:

| チェック項目 | 内容 | 判定 |
|------------|------|------|
| AC vs 実装の適合 | 全AC項目が実装されているか（漏れ・過剰実装の両方を検出） | 漏れあり → Critical、過剰実装 → Warning |
| `[補完]` AC の整合性 | E1 で自動補完された AC（`[補完]` マーク）の仮定が実装と整合しているか | 不整合 → Info（E1 差し戻しを報告） |

> **パート A はテスト充足性を見ない**。テスト充足性は次の「パート B」で `mihari` スキルに委譲する。

パート A 出力:

```markdown
## パート A: AC 適合結果

### 要件適合
- AC1: ✅ 実装済み
- AC2: ❌ 未実装 → Critical

### 過剰実装
- なし

### [補完] AC 整合性
- AC3（[補完]）: ✅ 整合（仮定が実装と一致）
```

---

##### パート B: テスト充足性ループ（`mihari` スキル呼び出し）

> **⚠️ テスト充足性は単発評価ではなく「指摘が出なくなるまでの反復ループ」で検証する。**
> 単一エージェントの1回評価は観点の盲点を残す。mihari の3並列レビュー × 収束ループで担保する。

**呼び出し方法**: `mihari` スキルを起動し、以下の入力を渡す:

```yaml
target:
  ac_source: |
    {spec.md の該当チケット AC 本文、または本チケットの AC 全文}
  test_code_paths:
    - {実装されたテストファイルのパス（*Test.kt / *.test.ts / *.test.tsx）}
  implementation_paths:
    - {実装コードのパス}
  scope_description: "{チケットID}: {チケットタイトル} のテスト充足性検証"

config:
  max_iterations: 5
  log_path: scratch.md
  allow_warning_with_dr: true
  run_tests_on_each_iteration: true
  test_command: "{BE: ./gradlew test --tests ..., FE: npm run test -- --testPathPattern=...}"
  calibration_enabled: true
```

**mihari 内部動作**:

- 3 並列レビュー（X: 等価分割・境界値 / Y: デシジョンテーブル・状態遷移 / Z: エラー推測・副作用・assertion 品質）
- Critical 0 + Warning 0（または DR 記録済み）になるまで反復
- 各 Round でテスト追加実装 → テスト実行 → 再レビュー
- 詳細は `mihari` スキルの `references/review-patterns.md`, `references/loop-protocol.md` 参照

**mihari の返却による分岐**:

| mihari status | 下位フローでの扱い |
|--------------|------------------|
| `PASS` | ステージ1 パート B PASS → ステージ2 へ進む |
| `FAIL` | ステージ1 FAIL → **T3 に差し戻し**（mihari が scratch.md に理由を記録済み） |
| `ESCALATE` | ユーザー判断を仰ぐ。mihari の recommended_actions を提示する |

**`[補完]` AC の特殊ケース**:

パート A で `[補完]` AC の仮定が実装と不整合と判定された場合、**先に E1 差し戻しを実行**し、mihari には正しい AC を渡す（誤った AC を mihari に渡すと無駄な Round を消費する）。

---

##### ステージ1 FAIL → T3 に戻る際の記録

mihari が FAIL または ESCALATE を返した場合、mihari のログ（scratch.md）に加えて、以下を scratch.md に追記して T3 に戻る:

```markdown
### T3→QG 差し戻し理由（mihari {status}）
- mihari Round: {N}/{max}
- Critical 残存: {件}
- Warning 残存: {件}
- 代表的な指摘:
  - [足りない] {AC の境界値テストが未実装 等}
  - [違う] {assertion が副作用を検証していない 等}
- mihari の推奨アクション: {mihari 返却の recommended_actions から抜粋}
```

#### ステージ2: Code Quality（コード品質チェック）

ステージ1 PASS後に**2並列**で実行。

| Agent | 観点 | `model` |
|-------|------|---------|
| A | コードレビュー（ロジック、DDD、規約） | Tier 1〜2: sonnet / Tier 3: opus |
| B | セキュリティレビュー（OWASP、認証認可） | opus（全Tier共通） |

### QG-4: 修正ループ（max 5回）

QG-1〜QG-3で問題が検出された場合、QGサブエージェント内で修正ループを実行:

| パラメータ | 値 |
|-----------|-----|
| max_iterations | **5** |
| 完了シグナル | 品質全PASS + Critical 0件 |

| Tier | イテレーション 1〜2（修正1〜2回目） | イテレーション 3〜5（修正3回目以降） |
|------|-----------------|-----------------|
| Tier 1〜2 | sonnet で標準修正 | opus で根本原因分析 + advisor() + 修正 |
| Tier 3 | opus で根本原因分析 + advisor() + 修正 | opus で根本原因分析 + advisor() + 修正 |

#### QG-4 での advisor 呼び出し

根本原因分析（opus）を実行した後、修正に入る前に `advisor()` を呼ぶ:

1. opus で根本原因を分析し、分析結果を会話コンテキストに展開する
2. `advisor()` を呼び出す（分析の妥当性と修正方針のセカンドオピニオン）
3. advisor の応答を確認:
   - **分析に追加の視点あり** → 分析を補足してから修正へ
   - **問題なし** → 修正へ進む
4. 修正を実施

#### scratch.md への記録フォーマット（各イテレーション必須）

```markdown
### QG-4 イテレーション {N}/{max}

**問題**: {何が失敗したか}
**原因分析**: {なぜ失敗したか}
**修正内容**: {何をどう変えたか}
**修正理由**: {なぜその修正が正しいと判断したか}
**結果**: PASS / FAIL（FAIL の場合、残存する問題を記述）
**コード品質への影響**: {修正がコード品質を下げていないか}
**仕様と実装の差分ログ**:
- [足りない] {仕様に書いてなかったが必要だったもの}
- [違う] {書いたが意図と違う解釈をされたもの}
- [過剰] {要らないのに生成されたもの}
- 差分がない場合は「差分なし」と明記する

#### キャリブレーション（イテレーション2以降で追加）

**前回QG-3の指摘の妥当性評価**:
- [Agent {X}] {指摘内容} → {妥当 / 過検出(false positive) / 検出漏れ(false negative)}
- 過検出理由: {なぜ誤検出だったか（該当時のみ）}
- 検出漏れ: {QG-3で見逃されてQG-4で判明した問題（該当時のみ）}

**パターン検出**:
- 同一カテゴリの指摘が連続 {N}回 → {根本原因の仮説}
- Agent {X} の過検出率: {高/中/低}
```

#### Evaluatorキャリブレーション

> **設計背景**: レビューエージェントの評価精度は放置すると劣化する。過検出（false positive）と検出漏れ（false negative）のパターンを蓄積し、次回レビューのプロンプトに注入することで精度を向上させる（[Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) のEvaluatorキャリブレーションパターン）。

イテレーション3以降で、scratch.md に蓄積されたキャリブレーション履歴を分析し、以下の判定を行う:

| パターン | アクション |
|---------|-----------|
| 同一Agentの同一カテゴリ指摘が3回連続 | 根本原因がT3の実装にある → T3に戻り設計レベルで修正 |
| Agent Xの過検出が2回以上 | そのAgentの次回QG-3プロンプトに「前回の過検出パターン」を注入して精度向上 |
| QG-3で見逃されQG-4で発覚した問題が2回以上 | QG-3のレビューAgentプロンプトに「見逃しパターン」を注入して検出力向上 |

#### プロンプト注入の例

```
## キャリブレーション情報（前回イテレーションの学び）

### 過検出パターン（以下は指摘不要）
- Agent A が「nullチェック不足」を指摘したが、Kotlin の non-null 型で保証済みだった

### 見逃しパターン（以下を重点チェック）
- テストで戻り値のみ検証し、副作用（DB更新）の検証が漏れていた
```

max_iterations超過時はエスカレーション:
```
⚠️ QG修正ループ上限到達（5/5）

【収束しなかった問題】
- {問題}: {試した修正と結果の履歴}

【推定される根本原因】
- {opus分析の結果}

【試行した修正アプローチ（重複排除済み）】
- アプローチ1: {内容} → {結果}
- アプローチ2: {内容} → {結果}

選択肢:
  1: 手動で修正箇所を指示 → 修正後に品質チェック再実行
  2: 設計からやり直す → E2に戻る
```

> **旧ルールとの変更点**: 「問題を無視してPR作成」の選択肢を削除した。
> 品質に妥協したPRは出さない。

### QG完了シグナル

> **PASS を宣言する前に: `references/quality-rules.md` の Verification Before Completion 鉄則を実行すること。**
> コマンドを実行し、出力を読み、exit code を確認してから PASS と主張する。

以下の全てを満たした時にQGはPASSを返す:
- ビルド・lint・typecheck・テスト全てPASS
- Critical指摘が0件
- sprint-contract.mdの全基準が✅（生成した場合のみ）

### QGからメインへの返却フォーマット

```
QG結果: PASS / FAIL
修正ループ: {N}回で収束
Critical指摘: {M}件（全て解消済み / エスカレーション）
Warning: {K}件（{L}件対応済み、{K-L}件DR記録）
```

### Warning / Info の処理

- **Warning**: 可能な限り修正する。修正しない場合はDecision Recordに理由を記録し、T5のPR説明文に含める
- **Info のみ / 指摘なし**: T5 へ

---

## T5: Push確認とPR作成（唯一の停止点）

**ここだけはユーザー確認で停止する。**

### PRサイズチェック（最初に実行）

> **デモ確認より先に、`pr-size-guard` スキルで差分サイズを測定する。**
> 実装完了後の「最後の砦」として、レビュアーに出せるサイズか定量的に判定する。

```bash
# base ブランチを検出（T1 で記録した値を優先）
BASE=$(cat .claude/tmp/base-branch.txt 2>/dev/null \
  || gh pr view --json baseRefName -q .baseRefName 2>/dev/null \
  || git rev-parse --abbrev-ref @{upstream} 2>/dev/null \
  || echo "origin/main")

# pr-size-guard インストール済みなら以下が使える
./scripts/measure-pr-size.sh "$BASE"

# または手動で
git diff --shortstat "${BASE}...HEAD"
git diff --name-only "${BASE}...HEAD" | wc -l
```

> **⚠️ `origin/main` 固定禁止**: stacked-pr 運用時は親 feature ブランチが base になるため、T1 で記録した `$BASE` を使う。

判定結果に応じてアクションを取る:

| 判定 | アクション |
|------|-----------|
| 🟢 Green（全指標Green）| そのまま次の「デモ確認」へ進む |
| 🟡 Yellow（1つ以上Yellow）| 分割を検討。分割不要と判断する場合は PR 説明文に理由を1行記載 |
| 🔴 Red（1つ以上Red）| **分割必須** または **明示的な justification**。`split-on-the-fly` で事後分割するか、PR 説明文に「なぜ分割しないか」を段落で記載 |

Red 判定時に分割する場合、`split-on-the-fly` の4パターン（A: コミット境界 / B: ファイル単位 / C: soft reset / D: push済み対応）から選ぶ。分割後は各PRで再度サイズ測定し、Green/Yellow に収まることを確認する。

> **なぜ T5 で測るか**: E3で事前分割（`feature-flag-strategy` / `vertical-slice` / `tidy-first`）していても、実装中に想定より膨らむことがある。T5 は「レビュアーに出す前の最後の防波堤」。

### デモ確認（自律判断）

> **Go/No-Go 判定前に: `references/quality-rules.md` の Verification Before Completion 鉄則を実行すること。**

1. UI変更あり → スクリーンショット撮影
2. **自律Go/No-Go判定**:

| 条件 | 判定 | アクション |
|------|------|-----------|
| 全AC実装済み + テスト全PASS | **Go** | Push確認へ |
| AC一部未実装 | **No-Go** | T3に戻って補完 |
| テスト不足 | **No-Go** | テスト追加してT4再実行 |
| 仕様の解釈に迷い | DR作成 | 保守的な判断でGo/No-Go |

T2をスキップ（UI変更なし）かつ T4bで指摘なし → デモ確認もスキップ可。

### advisor チェック（Tier 2/3 のみ）

> **⚠️ Push 前の最終確認。Go 判定後かつ Push 確認の前に呼ぶ。**

Tier 判定が **Tier 2 または Tier 3** の場合、Go 判定後に:

1. `sprint-contract.md` と QG の PASS サマリーを会話コンテキストに展開する
2. `advisor()` を呼び出す
3. advisor の応答を確認:
   - **懸念点あり** → 対応してから Push 確認へ
   - **問題なし** → Push 確認へ進む

> **Tier 1 はスキップ**: 軽量タスクでは Go/No-Go 判定後に直接 Push 確認へ。

### チケット↔コード整合性確認

Push前の最終チェック。チケット（AC・仕様）と実装の対応を確認する。

| チェック項目 | 確認方法 | NG時のアクション |
|------------|---------|----------------|
| 全AC項目が実装されているか | sprint-contract.md の機能検証欄（F1〜）を全項目確認 | T3に戻って補完 |
| 過剰実装がないか（スコープ外変更） | `git diff --stat` で変更ファイルを確認 | 不要な変更を削除 |
| チケットの意図と実装の方向性が一致しているか | チケット概要と実装概要を照合 | Decision Recordに記録して判断 |
| Decision RecordがACと矛盾していないか | `.claude/tmp/decisions/` を確認 | 矛盾するDRは再判断 |

**整合性NG → 対応するステップに戻って修正。整合性OKの場合のみ最終報告書へ進む。**

### 最終報告書（Push確認前）

**→ `references/final-report.md` を読み込み、報告書を生成してユーザーに提示する。**

Push確認の前に報告書を提示することで、ユーザーがPush可否の判断材料として活用できる。報告書確認後にPush確認へ進む。

### Push確認

```
📋 Push確認

ブランチ: feature/{チケットID}
変更サマリー: {ファイル数}ファイル, +{追加行}/-{削除行}
品質チェック: PASS
自己修正ループ: {N}回で収束

📝 Decision Records ({M}件):
  - DR-001: {タイトル} → {選択した案}
  - DR-002: {タイトル} → {選択した案}
  ※ 詳細は .claude/tmp/decisions/ を参照

⚠️ 仮定した事項:
  - {仮定があれば列挙}

pushしてPRを作成しますか？
```

**ユーザーが承認するまで `git push` は実行しない。**

### Native Team ワーカーとして実行されている場合（E4経由）

Team ワーカーとして実行されている場合、T5は**pushせずに停止**する。**DONEメッセージ送信前に、ハンドオフアーティファクトを書き出す**:

```markdown
# ハンドオフアーティファクト書き出し（DONE送信前に必ず実行）
# 保存先: .claude/tmp/handoffs/{チケットID}.md
# フォーマット: upper-flow.md の「ハンドオフアーティファクト」セクション参照
```

その後、`SendMessage` で Team Lead に完了を報告する:

```
SendMessage(
  to="team-lead",
  message="DONE: {チケットID} awaiting_approval {ファイル数}files,+{追加}/-{削除} DR:{件数}",
  summary="{チケットID} Push承認待ち"
)
```

報告内容に含める情報:
- `ticket_id`: チケットID
- `status`: `awaiting_approval`
- `branch`: `feature/{チケットID}`
- `change_summary`: ファイル数、追加行数、削除行数
- `quality_check`: PASS
- `iterations`: 自己修正ループ回数
- `decision_records`: DR一覧（件数とタイトル）

Push と PR 作成はメインセッション（E4 Team Lead）の一括承認フローで実行される。ワーカーはメッセージ送信後、Team Lead からの指示を待つ（承認 → push実行、または追加修正指示）。

### 下位フロー単独実行の場合

従来通りユーザーの承認を待ち、承認後プロジェクトで定義されたPR作成フローに従いPRを作成する。PR説明文にDecision Recordsのサマリーを含める。

### リリース・デプロイ戦略（PR説明文に含める）

PR作成時、以下のリリース戦略をPR説明文に明記する:

| 項目 | 内容 |
|------|------|
| **デプロイ順序** | このPRの前にマージ・デプロイが必要なPRがあるか（マイグレーションPR等） |
| **デプロイ前提条件** | マイグレーション適用済み、設定変更済み、外部サービス設定済み等 |
| **ロールバック安全性** | このPRをリバートした場合に安全か。データロスのリスクがないか |
| **後続PR** | このPRのマージ後に続くPRがあるか（E&C の App Expand → Contract 等） |

#### DB変更を含むPRの場合

マイグレーションPRとアプリコードPRが分かれている場合、**両方のPR説明文に依存関係を明記する**:

```markdown
## リリース戦略

⚠️ **デプロイ順序あり**

1. ✅ PR #{migration-pr}: マイグレーション（先にマージ・デプロイすること）
2. 📝 このPR: アプリコード変更（PR #{migration-pr} デプロイ後にマージ可能）

**ロールバック**: このPRをリバートしてもDB側に影響なし（安全）
```
