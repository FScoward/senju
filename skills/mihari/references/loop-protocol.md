# ループ制御プロトコル

mihari の反復ループの構造、収束条件、スタック判定、エスカレーション、ログフォーマットを定義する。

---

## ループ構造

```
Round 1, 2, 3, ..., max_iterations（デフォルト 5）

各 Round:
  1. 並列レビュー起動（Agent X, Y, Z）
  2. 指摘集約 → Critical / Warning / Info 分類
  3. 判定（PASS / CONTINUE / STACK / ESCALATE）
  4. CONTINUE の場合: テスト追加実装 → 次 Round へ
  5. ログ記録（指定ファイルに追記）
```

### ステートマシン

```
START
  │
  ▼
[Round N 開始]
  │
  ▼
[3並列レビュー実行]
  │
  ▼
[指摘集約]
  │
  ├─ Critical=0 かつ (Warning=0 or 全DR記録済み)
  │    → PASS 宣言 → テスト実行で最終確認 → END (PASS)
  │
  ├─ 同一カテゴリ指摘が2Round連続
  │    → STACK 判定 → opus 根本原因分析 → ESCALATE 候補
  │
  ├─ Round == max_iterations
  │    → ESCALATE → END (ESCALATE)
  │
  └─ 改善余地あり
       → テスト追加実装エージェント起動
       → 実装完了確認 → Round N+1 へ
```

---

## 判定ロジック

### PASS 判定

全て満たす時 PASS:

1. Critical 指摘: **0 件**
2. Warning 指摘: **0 件**、または `allow_warning_with_dr=true` かつ全 Warning に Decision Record が紐づいている
3. 追加したテストが **実際に実行して PASS する**（Verification Before Completion）
4. 空テスト・TODO テストが残っていない

> **⚠️ 「指摘が無くなった」だけでは PASS にしない**
> Agent が「指摘なし」と返した場合でも、テスト実行結果を exit code で確認するまで PASS を宣言しない。
> `references/quality-rules.md` の Verification Before Completion を参照。

### CONTINUE 判定

Critical または Warning が残っているが、スタックしておらず max 未到達:

- テスト追加実装エージェントを起動し、次 Round に進む

### STACK 判定

以下のいずれかを満たす時 STACK:

- 同一 Agent の同一カテゴリ指摘が **2 Round 連続** で出現
- Round 3 以降で Critical 件数が前 Round と **同一または増加**

STACK 判定時の対応:

1. opus 根本原因分析エージェントを起動
   - 入力: 直近 2 Round の指摘履歴、追加されたテスト、実装コード、AC
   - 出力: 根本原因仮説と推奨アクション
2. 推奨アクションに従い次 Round を実行
3. 2 回連続で STACK → ESCALATE へ

### ESCALATE 判定

以下のいずれかを満たす時 ESCALATE:

- `max_iterations` に到達
- STACK が 2 連続
- 追加テストが実行で失敗し続ける（テスト追加→実行失敗→修正→実行失敗 が 2 Round 連続）

ESCALATE 時の返却:

```yaml
status: ESCALATE
iterations: N
escalation_reason: "max_iterations 到達。Agent X が境界値テスト不足を5Round継続指摘したが、実装側のバリデーション仕様が曖昧でテスト追加が収束しない"
recommended_action: |
  1. T3 に差し戻し、バリデーション仕様を AC レベルで明確化する
  2. または Decision Record を作成して境界値テストを意図的にスキップし、次工程へ
critical_remaining: 2
warning_remaining: 3
```

---

## テスト追加実装エージェント

### 起動条件

Round N のレビューで Critical または Warning の追加すべきテストが1件以上ある場合。

### パラメータ

| 項目 | 値 |
|------|-----|
| subagent_type | `general-purpose` |
| model | `sonnet` |
| 入力 | 指摘内容（推奨テストを含む）、AC、既存テストファイル、実装コード |
| 出力 | 追加したテストファイルパスと追加テスト名のリスト |

### プロンプトテンプレート

```
あなたは「テスト追加実装エージェント」です。
以下のレビュー指摘に基づき、テストを追加実装してください。

【レビュー指摘】
{Agent X/Y/Z の Critical + Warning 指摘を集約したもの}

【AC】
{AC 本文}

【既存テストファイル】
{テストファイルパス + 現在の内容}

【実装ファイル】
{実装コードの抜粋（テストが何を検証すべきかの参考）}

【制約】
- 既存テストは削除・変更しない（追加のみ）
- 推奨テスト名・assertion は指摘に従う
- ユニットテストとして記述（外部依存はモック）
- 1テスト = 1振る舞いの原則を守る
- 意味のある assertion を2つ以上（戻り値 + 副作用 等）

【完了条件】
- 全ての Critical 指摘にテストを追加する
- Warning 指摘は可能な限り追加する（時間的制約で追加できない場合 DR に記録）
- 追加したテストがローカルで PASS することを確認する（テスト実行コマンドを実行し exit 0 を確認）
- 追加テストのリスト（ファイルパス + テスト名）を出力する
```

### 完了検証（必須）

テスト追加実装エージェントが「完了」と報告しても、mihari は以下を独立に検証する:

1. VCS diff で追加されたテストコードを確認
2. 指定のテストコマンドを実行し、exit code 0 を確認
3. 追加テストが **PASS** していることを出力から確認（single test filter が使えるなら個別実行）
4. 失敗 → テスト追加実装エージェントを再起動（次 Round で扱う）

---

## キャリブレーション（過検出の学習）

### 記録

各 Round のレビュー結果から以下を抽出し、scratch.md に追記:

```markdown
### キャリブレーション（Round {N} 後）

#### 過検出パターン（次 Round のプロンプトで除外指示）
- [Agent X] {指摘内容} → {過検出理由: 実装で既に保証されているため不要}
- [Agent Z] {指摘内容} → {過検出理由: ライブラリ側で検証済み}

#### 検出漏れパターン（次 Round のプロンプトで重点チェック指示）
- Round {N-1} で見逃されていた {指摘カテゴリ} が Round {N} で検出された
```

### 注入

次 Round のエージェント起動プロンプトの「過検出回避」セクションに、上記の「過検出パターン」を注入する。

```
【過検出回避】
以下は過検出なので指摘しないこと（前ラウンドで誤検出されたパターン）:
- {過検出パターン1}
- {過検出パターン2}

【検出強化】
以下は前ラウンドで見逃されたため重点チェックすること:
- {検出漏れパターン1}
```

---

## ログフォーマット（scratch.md or 指定ファイル）

### Round ごとの記録

各 Round 完了時に以下を追記:

```markdown
### mihari Round {N}/{max}

**実行時刻**: {ISO 8601}
**対象**: {対象ファイル or AC 名}

#### 並列レビュー結果

| Agent | Critical | Warning | Info |
|-------|----------|---------|------|
| X (等価分割/境界値) | {件} | {件} | {件} |
| Y (デシジョン/状態遷移) | {件} | {件} | {件} |
| Z (エラー推測/副作用/assertion) | {件} | {件} | {件} |
| **合計** | **{件}** | **{件}** | **{件}** |

#### 集約後の指摘（重複排除済み）

##### Critical
- [X] {指摘1}
- [Y] {指摘2}
- [Z] {指摘3}

##### Warning
- [X] {指摘4}

#### 判定
- **PASS / CONTINUE / STACK / ESCALATE**
- 理由: {判定理由}

#### 追加したテスト（CONTINUE 時のみ）
- `UserRegistrationUseCaseTest#registerWithDuplicateEmail`（AC1 重複メール Critical 対応）
- `UserRegistrationUseCaseTest#registerWithMaxLengthName`（AC2 最大長 Critical 対応）

#### テスト実行結果
- コマンド: `./gradlew test --tests "com.u_zero.app.feature.user.UserRegistrationUseCaseTest"`
- exit code: 0
- PASS: {件} / FAIL: 0

#### 残存指摘（次 Round で対応）
- [Z] Warning: assertion 多角性（次 Round で改善）

#### キャリブレーション
- 過検出: なし
- 検出漏れ: なし
```

### 最終サマリー（ループ完了時）

```markdown
### mihari 実行サマリー

**結果**: PASS / FAIL / ESCALATE
**総 Round 数**: {N}
**総追加テスト数**: {M}
**総実行時間**: {秒}

#### 最終状態
- Critical 残存: {件}
- Warning 残存: {件}
- カバー率:
  - 正常系: {%}
  - 異常系: {%}
  - 境界値: {%}
  - デシジョン組合せ: {%}
  - 副作用検証: {%}

#### Round 履歴
| Round | Critical 減少 | Warning 減少 | 追加テスト |
|-------|--------------|-------------|-----------|
| 1 | 12 → 8 | 5 → 5 | 4 |
| 2 | 8 → 3 | 5 → 3 | 5 |
| 3 | 3 → 0 | 3 → 1 | 3 |

#### ESCALATE 時の追加情報（該当時のみ）
- エスカレーション理由: {}
- 推奨アクション: {}
```

---

## max_iterations の設定指針

| 状況 | 推奨値 |
|------|-------|
| kouunryuusui QG-3 から呼び出し（通常） | 5 |
| 単発使用・レガシーコード強化 | 7〜10 |
| CI / 事前チェック（早期打ち切り） | 3 |
| 実験・学習用 | 10+ |

> 無制限は禁止。必ず上限を設定する。

---

## 呼び出し側との連携

呼び出し側（kouunryuusui 等）が mihari の返却を受けた後の推奨処理:

| 返却 status | 呼び出し側の推奨アクション |
|------------|------------------------|
| PASS | 次工程へ進む（kouunryuusui なら QG-3 Stage 2 へ） |
| FAIL（Critical 残存） | T3 相当に差し戻し、mihari の指摘を元に実装を見直す |
| ESCALATE | ユーザー判断を仰ぐ。scratch.md の「推奨アクション」を提示 |

> mihari 自身は呼び出し側を知らない。返却フォーマットを統一することで、どの呼び出し側とも疎結合に動作する。
