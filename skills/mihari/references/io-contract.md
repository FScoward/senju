# 入出力プロトコル（IO Contract）

mihari と呼び出し側（ユーザー直接 / 他スキル）の間の入出力仕様。

---

## 入力プロトコル

### パターン1: ユーザーから直接呼び出し

```
/mihari <手がかり>
```

手がかりの種類と mihari 側の処理:

| 手がかり形式 | mihari の処理 |
|------------|--------------|
| チケットID（`APP-1234`） | チケットから AC を取得し、関連するテストファイル・実装ファイルを特定 |
| PR 番号（`PR=2993`） | PR の差分からテストコード・実装コードを抽出、AC は PR 説明文 or 関連チケットから取得 |
| ディレクトリ（`backend/src/.../feature/xxx/`） | ディレクトリ配下のテストファイルを対象とし、AC はユーザーに確認 |
| テストファイルパス（`XxxTest.kt`） | ファイル単体を対象、AC と実装はユーザー確認 or 推論 |
| 空文字列 | ユーザーに対象を確認する |

### パターン2: 他スキルから呼び出し

呼び出し側は以下の YAML 相当の情報を prompt に含めて mihari を起動する:

```yaml
target:
  # 必須
  ac_source: |
    # 該当チケットの AC 本文（または spec.md の該当セクション）
    ## AC1: ユーザー登録成功
    Given: 未登録メールアドレスが入力されたとき
    When: 登録APIが呼ばれる
    Then: ユーザーが DB に保存され、ウェルカムメールが送信される
    ...

  # 必須
  test_code_paths:
    - "backend/src/test/kotlin/com/.../UserRegistrationUseCaseTest.kt"
    - "backend/src/test/kotlin/com/.../UserRegistrationIntegrationTest.kt"

  # 必須（レビュアーのコンテキスト用）
  implementation_paths:
    - "backend/src/main/kotlin/com/.../RegisterUserUseCase.kt"
    - "backend/src/main/kotlin/com/.../UserRepository.kt"

  # 任意
  scope_description: "ユーザー登録機能のテスト充足性検証"

config:
  max_iterations: 5              # デフォルト 5、1-10 で指定可
  log_path: "scratch.md"         # イテレーションログの書き出し先（worktree 相対パス）
  allow_warning_with_dr: true    # Warning を DR 記録で許容するか
  run_tests_on_each_iteration: true  # テスト追加後に実際にテスト実行して PASS 確認
  test_command: "./gradlew test --tests \"*UserRegistration*\""  # テスト実行コマンド
  calibration_enabled: true      # 過検出学習を有効化
```

### 必須項目の検証

mihari は起動時に以下を検証する:

| 項目 | 必須 | デフォルト |
|------|-----|----------|
| `target.ac_source` | ✅ | — |
| `target.test_code_paths` | ✅ | — |
| `target.implementation_paths` | ✅ | — |
| `config.max_iterations` | — | 5 |
| `config.log_path` | — | `scratch.md` |
| `config.allow_warning_with_dr` | — | `true` |
| `config.run_tests_on_each_iteration` | — | `true` |
| `config.test_command` | — | 推論（BE: `./gradlew test`, FE: `npm run test`） |
| `config.calibration_enabled` | — | `true` |

必須項目が欠けている場合、ユーザーまたは呼び出し元に確認する（推測で埋めない）。

---

## 出力プロトコル

### 成功時（PASS）

```yaml
status: PASS
iterations: 3              # 実際に回した Round 数
critical_remaining: 0
warning_remaining: 0
tests_added:
  - "UserRegistrationUseCaseTest#registerWithDuplicateEmail"
  - "UserRegistrationUseCaseTest#registerWithMaxLengthName"
  - "UserRegistrationUseCaseTest#registerWithInvalidEmailFormat"
  - "UserRegistrationUseCaseTest#verifyWelcomeEmailSent"
  - "UserRegistrationUseCaseTest#verifyCreatedEventEmitted"
coverage:
  normal_case: "100%"
  error_case: "100%"
  boundary: "100%"
  decision: "100%"
  side_effect: "100%"
test_execution:
  command: "./gradlew test --tests \"*UserRegistration*\""
  exit_code: 0
  passed: 15
  failed: 0
log_path: "scratch.md"
summary: "3ラウンドで収束。Agent X/Y/Z 全ての観点で Critical=0, Warning=0 を達成。"
escalation_reason: null
```

### 失敗時（FAIL）

呼び出し側が「差し戻し」処理を期待する場合に使用。Critical が残っているが、呼び出し側で実装見直しが必要なケース。

```yaml
status: FAIL
iterations: 5
critical_remaining: 2
warning_remaining: 3
tests_added:
  - "UserRegistrationUseCaseTest#registerWithDuplicateEmail"
critical_issues:
  - agent: X
    category: "境界値"
    description: "AC2 氏名最大長の境界値テスト未実装。実装側のバリデーションロジックが不明瞭で、テスト追加が収束しない"
    recommendation: "T3 に差し戻し、バリデーション仕様を明確化"
  - agent: Y
    category: "認可マトリクス"
    description: "未ログイン時の AC3 権限チェックテスト未実装"
    recommendation: "T3 に差し戻し、認証ミドルウェアの統合を追加"
log_path: "scratch.md"
summary: "5ラウンド実行。Critical が2件残存、実装側の仕様曖昧さが原因"
```

### エスカレーション時（ESCALATE）

ユーザー判断が必要なケース。

```yaml
status: ESCALATE
iterations: 5
critical_remaining: 1
warning_remaining: 4
escalation_reason: |
  max_iterations (5) に到達。同一の境界値指摘が5Round連続で出現し、
  追加したテストが実行で失敗し続けた（バリデーション実装側に問題の可能性）。
stack_pattern:
  - round: 2
    agent: X
    category: "境界値"
  - round: 3
    agent: X
    category: "境界値"
  - round: 4
    agent: X
    category: "境界値"
recommended_actions:
  - "1. T3 に戻り、RegisterUserUseCase.kt のバリデーションロジックを見直す"
  - "2. Decision Record を作成して境界値テストを意図的にスキップし、次工程へ"
  - "3. 仕様が曖昧な場合は E1 / T0 に戻り AC をブラッシュアップ"
log_path: "scratch.md"
summary: "収束せず。実装側の問題が疑われる"
```

---

## 返却フォーマットの保証

mihari は呼び出し側に以下のいずれかの形式で結果を返す:

1. **構造化（Markdown + YAML ブロック）**: 機械可読性を優先
2. **自然言語サマリー**: ユーザー直接呼び出し時の最終報告

他スキルから呼び出される場合は **構造化形式** を使う。

### 構造化出力例

````markdown
## mihari 実行結果

```yaml
status: PASS
iterations: 3
critical_remaining: 0
...
```

### サマリー

3ラウンドで収束。以下 12 件のテストを追加:

- `UserRegistrationUseCaseTest#registerWithDuplicateEmail` (Agent X Critical)
- `UserRegistrationUseCaseTest#registerWithMaxLengthName` (Agent X Critical)
- ...

### 詳細ログ

`scratch.md` を参照。
````

---

## エラーケース

### 必須入力不足

```yaml
status: ERROR
error_type: "INVALID_INPUT"
missing_fields:
  - "target.ac_source"
  - "target.test_code_paths"
message: "必須項目が不足している。呼び出し側で以下を指定してから再度 mihari を呼び出すこと"
```

### テスト実行環境の問題

```yaml
status: ERROR
error_type: "TEST_EXECUTION_FAILED"
details: "テスト実行コマンドが exit code 1 を返すが、既存テストの失敗ではなくビルドエラー"
recommendation: "呼び出し側の QG-1（ビルド・lint）を先に PASS させてから mihari を呼び出すこと"
```

### 対象コード不一致

```yaml
status: ERROR
error_type: "TARGET_MISMATCH"
details: "test_code_paths に指定されたファイルが存在しない、または空"
```

---

## 設計思想

- **疎結合**: mihari は呼び出し側を知らない。kouunryuusui でも dev-pipeline でも単独 CLI でも同じ契約で動作する
- **べき等**: 同じ入力に対しては同じ結果（テスト追加内容は LLM 非決定性で揺らぐが、最終状態としての PASS/FAIL は同一）
- **透明性**: 全ての判定理由をログに残す。呼び出し側・ユーザーが追跡可能
- **ESCALATE は万能の逃げ道ではない**: ESCALATE する時は必ず推奨アクションを示す。丸投げしない
