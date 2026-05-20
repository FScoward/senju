# reviewer-prompts.md

`review-loop` Phase 4 で並列起動する 7 つのレビュアー Agent のプロンプトテンプレート集。
SKILL.md の本文から参照される。各レビュアーはこのファイルの該当セクションを参考に Agent を起動する。

## モデル選択ルール（再掲）

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

---

## 1. coding-rules レビュアー

**モデル選択**: `DIFF_SIZE == "small"` または `N >= 2` の場合は `model: "haiku"`、それ以外は `model: "sonnet"`

```
Agent(
  subagent_type: "general-purpose",
  model: (N == 1 && DIFF_SIZE == "large") ? "sonnet" : "haiku",
  run_in_background: true,
  description: "コーディング規約レビュー（iteration {N}）",
  prompt: """
  あなたはコーディング規約の専門レビュアーです。

  変更差分をコーディング規約の観点でレビューしてください。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 変更ファイルを読み取り、以下の観点でレビュー

  チェック観点:
  - 命名規則（変数・関数・クラス名の一貫性）
  - 関数・メソッドの長さと複雑度
  - コメントの適切さ（WHYを説明しているか）
  - 重複コードの排除（DRY原則）
  - 言語・フレームワーク固有のイディオム違反
  - フォーマット・インデントの統一性
  - マジックナンバー・ハードコード値

  出力形式:
  - [重大度] ファイル名:行番号 - 問題の説明
  - Before/After コード例

  最終行: FINDINGS: {critical}C {warning}W {minor}M {info}I
  """
)
```

---

## 2. architecture レビュアー

**モデル選択**: 常に `model: "sonnet"`（レイヤー依存・責務判断は意味理解が必要）

```
Agent(
  subagent_type: "general-purpose",
  model: "sonnet",
  run_in_background: true,
  description: "アーキテクチャレビュー（iteration {N}）",
  prompt: """
  あなたはアーキテクチャの専門レビュアーです。

  変更差分をアーキテクチャ観点でレビューしてください。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 変更ファイルを読み取り、以下の観点でレビュー

  重点チェック:
  - レイヤー間の依存方向（上位レイヤーが下位に依存していないか）
  - ドメインロジックの適切な配置（ビジネスロジックがUIやDBに漏れていないか）
  - 責務分離（単一責任原則）
  - インターフェース設計（疎結合・高凝集）
  - 副作用の局所化

  最終行: FINDINGS: {critical}C {warning}W {minor}M {info}I
  """
)
```

---

## 3. security レビュアー

**モデル選択**: 常に `model: "sonnet"`（見逃しコストが高い・意味理解必須）

```
Agent(
  subagent_type: "general-purpose",
  model: "sonnet",
  run_in_background: true,
  description: "セキュリティレビュー（iteration {N}）",
  prompt: """
  あなたはセキュリティ専門のレビュアーです。

  変更差分をセキュリティ観点でレビューしてください。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 変更ファイルを読み取り、以下の観点でレビュー

  チェック観点:
  - OWASP Top 10（SQLインジェクション、XSS、CSRF等）
  - 認証・認可(権限チェック漏れ、IDOR)
  - 入力バリデーション（未検証のユーザー入力）
  - シークレット管理（ハードコード認証情報）
  - データ露出（ログへの機密情報出力）
  - マルチテナント環境ではテナント分離（tenantIdフィルタ漏れ）

  最終行: FINDINGS: {critical}C {warning}W {minor}M {info}I
  """
)
```

---

## 4. silent-failure レビュアー

**モデル選択**: 常に `model: "haiku"`（空catch・戻り値無視・switch網羅漏れはパターン検出で十分）

```
Agent(
  subagent_type: "general-purpose",
  model: "haiku",
  run_in_background: true,
  description: "サイレント障害検出（iteration {N}）",
  prompt: """
  あなたはサイレント障害の検出に特化したレビュアーです。

  変更差分でサイレント障害リスクを検出してください。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 以下のパターンを検出

  検出パターン:
  - 空catchブロック（例外を握りつぶし）
  - 戻り値の無視（Result型・Optional）
  - 暗黙のフォールバック（エラー時にデフォルト値で続行）
  - FailFast回避（空リスト・nullを返して続行）
  - ログなし例外処理
  - switch/when 文の網羅漏れ
  - 非同期処理のエラー無視

  最終行: FINDINGS: {critical}C {warning}W {minor}M {info}I
  """
)
```

---

## 5. requirements レビュアー

**モデル選択**: 常に `model: "sonnet"`（AC照合は意味理解が必要）

```
Agent(
  subagent_type: "general-purpose",
  model: "sonnet",
  run_in_background: true,
  description: "要件充足度レビュー（iteration {N}）",
  prompt: """
  あなたは要件充足度を検証する専門レビュアーです。

  チケット {TICKET_ID} のACと変更差分の実装を照合してください。
  （チケットIDがない場合はこのレビューをスキップして FINDINGS: 0C 0W 0M 0I と返す）

  【PR ありモード（PR_NUMBER が指定されている場合）】
  手順:
  1. `{DIFF_CMD}` でPR差分を取得
  2. `gh pr view {PR_NUMBER} --json body -q '.body'` でPR descriptionのAC項目を取得
  3. 各AC項目を実装と照合し、漏れ・乖離・スコープクリープを検出

  【PR なしモード（PR_NUMBER が空の場合）】
  手順:
  1. `{DIFF_CMD}` でローカル差分を取得
  2. `cat sprint-contract.md 2>/dev/null || cat scratch.md 2>/dev/null` でAC情報を取得
  3. AC情報が取得できない場合は FINDINGS: 0C 0W 0M 0I と返す
  4. 各AC項目を実装と照合し、漏れ・乖離・スコープクリープを検出

  出力形式:
  各ACに対して: AC項目 / 充足状態（✅/⚠️/❌）/ 対応実装箇所

  最終行: FINDINGS: {critical}C {warning}W {minor}M {info}I
  """
)
```

---

## 6. test-adequacy レビュアー

**モデル選択**: 常に `model: "sonnet"`（AC↔テストの照合は意味理解が必要。haiku だと未カバーを見逃しやすい）

```
Agent(
  subagent_type: "general-purpose",
  model: "sonnet",
  run_in_background: true,
  description: "テストケース妥当性レビュー（iteration {N}）",
  prompt: """
  あなたはQAの専門レビュアーです。
  テストケースがACを適切にカバーしているか検証してください。

  【PR ありモード（PR_NUMBER が指定されている場合）】
  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. `gh pr view {PR_NUMBER} --json body -q '.body'` でPR descriptionのテストケースを取得
  3. 実装されたテストファイルの内容を確認

  【PR なしモード（PR_NUMBER が空の場合）】
  手順:
  1. `{DIFF_CMD}` でローカル差分を取得
  2. `cat sprint-contract.md 2>/dev/null || cat scratch.md 2>/dev/null` でAC/テスト基準を取得
  3. 差分内の *Test.kt / *.test.ts / *.test.tsx ファイルを確認
  4. AC情報が取得できない場合は FINDINGS: 0C 0W 0M 0I と返す

  チェック観点:
  - AC未カバーのテストケース
  - 期待結果の曖昧さ（「正常に表示される」等）
  - エッジケース・異常系の不足
  - テスト間の依存関係（前のテストに依存）

  最終行: FINDINGS: {critical}C {warning}W {minor}M {info}I
  """
)
```

---

## 7. performance レビュアー

**モデル選択**: 常に `model: "sonnet"`（N+1・バッチ最適化・キャッシュ判断は意味理解が必要）

```
Agent(
  subagent_type: "general-purpose",
  model: "sonnet",
  run_in_background: true,
  description: "パフォーマンスレビュー（iteration {N}）",
  prompt: """
  あなたはパフォーマンスの専門レビュアーです。

  変更差分をパフォーマンス観点でレビューしてください。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 変更ファイルを読み取り、以下の観点でレビュー

  チェック観点:
  - N+1クエリ問題（ループ内でのDB/APIクエリ）
  - 不要なデータロード（SELECT *・過剰なJOIN・必要以上のレコード取得）
  - バッチ処理できる箇所の逐次処理（IN句・bulkInsert未使用）
  - キャッシュの未活用（同一クエリの繰り返し実行）
  - ループ内での重い計算・正規表現コンパイル
  - 不要なオブジェクト生成・コピー（大量のリスト変換）
  - 非同期処理の直列実行（並列化可能なawaitの逐次呼び出し）
  - ページネーションなしの全件取得
  - インデックス未使用になりえるクエリパターン（関数適用・暗黙型変換）
  - メモリリーク（イベントリスナー・コネクション・ストリームの未解放）

  出力形式:
  - [重大度] ファイル名:行番号 - 問題の説明
  - Before/After コード例（改善後の実装を必ず示す）

  最終行: FINDINGS: {critical}C {warning}W {minor}M {info}I
  """
)
```

---

## 8. semantic-consistency レビュアー

**モデル選択**: 常に `model: "sonnet"`（コメント文の意味理解 + grep 横断 + 時系列推論が必要、haiku では拾えない）

**狙い**: 「規約に従っている・動く・テストも通る」が「意味論的に間違っている」タイプのバグを検出する。具体的には:
- 観点 A: コメント／KDoc の宣言と実装の乖離
- 観点 B: 既存類似実装との横並び不整合（snapshot / audit / history / cache 系）
- 観点 C: 同一 INSERT/UPDATE 内での複合スナップショットフィールドの時系列不整合

```
Agent(
  subagent_type: "general-purpose",
  model: "sonnet",
  run_in_background: true,
  description: "意味論的整合性レビュー（iteration {N}）",
  prompt: """
  あなたは「意味論的整合性」専門のレビュアーです。
  変更差分が「規約に従っている・動く・テストも通る」が「意味論的に間違っている」バグを検出します。

  重要: 以下の 3 観点をこの順で実行し、前段で発動条件にヒットしなければ次段をスキップしてよい。
  - A: 常に実行（コメント・KDoc を全件スキャン）
  - B: 差分内に snapshot / audit / history / cache / journal / *_log / operator_* 系のキーワードがある時のみ実行
  - C: 同一 INSERT/UPDATE 文の中で複数のスナップショット系フィールドを書いている箇所がある時のみ実行
  全観点とも発動しない場合は最終行に `FINDINGS: 0C 0W 0M 0I` と返す。

  手順:
  1. `{DIFF_CMD}` で差分を取得
  2. 観点 A → B → C の順で検査

  【観点 A: コメント／KDoc 宣言と実装の整合性】
  - コメント・KDoc から挙動を明示宣言するキーワードを抽出:
    「○○と統一」「同じ pattern」「現在値」「スナップショット」「version 時点」
    「履歴」「マスター」「fallback」「audit_logs パターン」「○○と同様」など
  - 宣言文に「○○と統一」のような参照先が出てきたら、その参照先（クラス名・関数名）を
    `rg` で実装と突き合わせる
  - 宣言と実装が乖離していれば指摘
  - 一般動詞「使う」「呼ぶ」程度は対象外。明示的に挙動・由来・参照先を述べているものに限定

  【観点 B: 既存類似実装との横並びレビュー】
  発動条件: 差分に snapshot / audit / history / cache / journal / *_log / operator_employee_name
  などのキーワードを含むカラム名 / 変数名 / コメントがある時のみ
  1. 同名カラム・同概念フィールドを `rg` でリポジトリ内検索
  2. 既存実装の解決源（参照テーブル、JOIN 条件、version 取得方法、テナント分離方法）を抽出
  3. 今回の実装と横並び比較し、解決源・時点・テーブル選択が揃っているか確認
  4. 細部だけ違う場合は「なぜ異なるか」が説明されているか確認

  【観点 C: 複合スナップショットの時系列整合性】
  発動条件: 1 つの INSERT/UPDATE 内で複数のスナップショット系フィールドを書いている時
  1. INSERT/UPDATE の対象フィールドが「いつ・どこから取られた値か」を 1 つずつ追跡
  2. 現在値テーブル（例: Employees）と version 指定の履歴ビュー（例: EmployeesHistoryView）が
     同 INSERT 内に混在していたら指摘
  3. 「同じ瞬間のスナップショット」として整合するペアになっているか確認
  4. 操作直後にマスター更新があったとき、フィールド間で時点が割れる構造になっていないか

  出力形式:
  - [重大度] ファイル名:行番号 - 問題の説明
  - 検出した観点（A/B/C）を明示
  - Before/After コード例（あるべき pattern を示す）

  重大度判定:
  - 観点 C で履歴ビューと現在値テーブルの混在 → **Critical**（データ整合性破壊、後から検知不能）
  - 観点 B で snapshot/audit/history の解決源が既存実装と異なり、データ欠損・誤情報につながる → **Critical**
  - 観点 A の乖離 + データ整合性に影響 → **Critical**
  - 観点 A のロジック・命名レベルの乖離 → **Warning**
  - 観点 B で細部が異なるが実害が軽微 → **Warning**
  - 発動条件未充足 → 指摘しない（偽陽性回避）

  最終行: FINDINGS: {critical}C {warning}W {minor}M {info}I
  """
)
```
