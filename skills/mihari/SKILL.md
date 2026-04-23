---
name: mihari
description: "テスト充足性を多観点で反復レビューするスキル。3並列エージェント（等価分割/境界値、デシジョン/状態遷移、エラー推測/副作用）で指摘が出なくなるまでループする。テストの観点網羅を担保したい開発フローから呼び出される。明示的に「/mihari」と指示された場合、または他スキル（kouunryuusui 等）から呼び出された場合に使用。"
aliases:
  - test-mihari
license: MIT
---

# 見張り（mihari） $ARGUMENTS

**テストが観点的に十分か** を多角的に検証し、指摘が出なくなるまで反復する専門スキル。

「テストがある」≠「テストが足りている」。網羅すべき観点（等価分割・境界値・デシジョン・状態遷移・エラー推測）を単一エージェントで見ると盲点が残る。mihari は観点を3並列で分担し、レビュー→テスト追加→再レビューを収束するまで繰り返す。

## 使用シーン

| シーン | 呼び出し例 |
|-------|----------|
| 開発フロー内（kouunryuusui QG-3等）| 他スキルから内部呼び出し |
| 単発のテスト充足性監査 | `/mihari <対象ディレクトリ or チケットID>` |
| PR レビュー補助 | `/mihari PR=<番号>` |
| レガシーコードのテスト強化 | `/mihari <対象モジュール>` |

## 核心原則

1. **観点の網羅**: 単一視点では盲点が生じる。複数観点を並列でかける
2. **収束するまで回す**: 指摘が0件になるまで（もしくは収束判定がかかるまで）継続
3. **テスト追加は内部で完結**: 呼び出し側に「不足あり」と返すのではなく、内部で追加実装→再レビュー
4. **証拠ベース判定**: `references/quality-rules` の Verification Before Completion を遵守（テスト実行し PASS を確認してから PASS 宣言）
5. **過検出の学習**: イテレーション中の false positive を記録し、次回レビューに注入（Evaluator キャリブレーション）

## アーキテクチャ

```
mihari ループ (max_iterations=5, デフォルト)
│
├─ 準備: 入力（AC, テストコード, 実装コード, ログ先）を読み込む
│
├─ Round N:
│   ├─ 3並列レビュー
│   │   ├─ Agent X (general-purpose/sonnet): 等価分割 + 境界値分析
│   │   ├─ Agent Y (general-purpose/sonnet): デシジョンテーブル + 状態遷移
│   │   └─ Agent Z (general-purpose/sonnet): エラー推測 + 副作用 + assertion品質
│   │
│   ├─ 指摘集約 → Critical / Warning / Info に分類
│   │
│   ├─ 判定:
│   │   ├─ Critical=0 かつ (Warning=0 or 全 DR 記録済み)
│   │   │    → PASS を返却して終了
│   │   ├─ 同一カテゴリ指摘が2Round連続
│   │   │    → スタック判定 → opus 根本原因分析
│   │   ├─ max_iterations 到達
│   │   │    → ESCALATE を返却
│   │   └─ それ以外
│   │        → テスト追加実装エージェント（general-purpose/sonnet）起動
│   │
│   └─ ログ記録（scratch.md または指定ファイル）: 指摘・追加テスト・残存・収束状態
│
└─ 完了: 結果を返却（PASS / FAIL / ESCALATE + サマリー）
```

## 入出力プロトコル

**→ `references/io-contract.md` を読み込む**

呼び出し側から渡される入力、mihari が返す出力の仕様を記載。

## ループ制御

**→ `references/loop-protocol.md` を読み込む**

イテレーション構造、収束条件、スタック判定、エスカレーション、ログフォーマットを記載。

## レビュー観点（3並列エージェントの詳細）

**→ `references/review-patterns.md` を読み込む**

各エージェント（X / Y / Z）が担当する観点、チェック項目、判定基準、プロンプトテンプレートを記載。

## 呼び出し形式

### 単独使用（ユーザーから直接）

```
/mihari <対象の手がかり>
```

手がかりの例:
- チケットID（`APP-1234`）
- 対象ディレクトリ（`backend/src/.../feature/xxx/`）
- PR番号（`PR=2993`）
- テストファイルパス（`UserRegistrationUseCaseTest.kt`）

$ARGUMENTS が空の場合、ユーザーに確認して対象を明確化する。

### 他スキルから呼び出し

呼び出し側は以下の情報を渡す:

```yaml
target:
  ac_source: spec.md の該当セクション or チケットの AC 本文
  test_code_paths: [テストファイルパスのリスト]
  implementation_paths: [実装ファイルパスのリスト] # コンテキスト用
  scope_description: "何を検証したいか"
config:
  max_iterations: 5              # デフォルト5、1-10 で指定可
  log_path: scratch.md           # イテレーションログの書き出し先
  allow_warning_with_dr: true    # Warning は DR 記録で許容するか
  run_tests_on_each_iteration: true  # テスト追加後に実際にテスト実行して PASS 確認
```

返却:

```yaml
status: PASS | FAIL | ESCALATE
iterations: N
critical_remaining: 0
warning_remaining: L
tests_added:
  - "UserRegistrationUseCaseTest#registerWithDuplicateEmail"
  - "UserRegistrationUseCaseTest#registerWithMaxLengthName"
escalation_reason: null  # ESCALATE のときのみ
log_path: "scratch.md"
summary: "5ラウンドで収束。正常系100%、異常系92%、境界値100%。"
```

## 品質ルール（全フェーズ共通）

**→ `references/quality-rules.md` を読み込む**（kouunryuusui と共有する横断ルール）

Verification Before Completion 鉄則と Anti-rationalization パターン集に従う。mihari が PASS を返す前に、追加したテストが実際にテスト実行で通ることをコマンド実行で確認する。

## 前提スキル（任意）

| スキル | 用途 |
|-------|------|
| `kouunryuusui` | 統合開発フローの QG-3 から mihari を呼び出す |

mihari は単独でも動作する。前提スキルなしで `/mihari` として起動可能。

## 設計思想

- **分担 vs 重複**: 3観点は重複ではなく担当範囲が異なる（等価分割/境界値 ≠ デシジョン/状態遷移 ≠ エラー推測/副作用）。重複させると並列コストが無駄になる
- **収束 vs 打ち切り**: 「指摘0件になるまで」を基本とするが、max_iterations と「同一指摘2Round連続」の2つの打ち切り条件で無限ループを防ぐ
- **過検出の許容**: レビューは過剰寄りで出してよい。mihari はイテレーションで過検出を学習し次ラウンドのプロンプトに注入する
- **テスト追加は実装エージェント**: レビュアーはテストを書かない（判定の独立性を保つため）
- **PASS 宣言は実行証拠ベース**: 「テストを書いた」ではなく「テストが PASS する実行結果を確認した」が PASS の条件

## 使用例

### 例1: kouunryuusui 下位フロー QG-3 から

kouunryuusui の `lower-flow.md` QG-3 Stage1 で呼び出される:

```
入力: spec.md の AC + UserRegistrationUseCaseTest.kt + scratch.md ログ先
処理: 5ラウンド以内にレビュー→テスト追加→再レビューを繰り返す
返却: PASS → QG-3 Stage2 (コード品質レビュー) に進む
      FAIL → T3 に差し戻し（scratch.md に理由記録済み）
```

### 例2: 単発使用

```
/mihari APP-1234
```

mihari はチケットから AC を取得し、関連テストコードを特定し、ループを開始する。5ラウンド後に `scratch.md` にレポートを残す。

### 例3: PR レビュー補助

```
/mihari PR=2993
```

PR の差分からテストコード・実装コードを抽出し、追加テストが充足しているかレビューする。
