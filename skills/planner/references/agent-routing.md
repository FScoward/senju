# Agent Routing — 状況→エージェント マッピング表

プラン内の各ステップに、最も適切なエージェントを割り当てるための参照表。

**鉄則**: エージェント選定には必ず「**なぜそれを選んだか**」を添える。形式は `Agent: <名前> — <選定理由>`。

良い理由の書き方：
- ✅ なぜ**他のエージェントではないか**を含める: 「Repository層は仕様明確で Red-Green の検証コストが低いため `tdd-senior-engineer`。`executor` だと TDD強制力が弱く、テストが後回しになるリスクがある」
- ✅ プロジェクト固有の文脈を含める: 「マルチテナント条件の漏れチェックが必要なため `code-reviewer`（u0プロジェクトで頻発する観点）」
- ❌ 「適切なエージェントだから」「ベストだから」のような循環理由
- ❌ 用途名のオウム返し（「リファクタだから refactoring-assistant」だけでは不十分）

---

## 用途別マッピング

### 🔍 探索 / 調査

| 状況 | 推奨エージェント | 備考 |
|---|---|---|
| ファイル・シンボルの位置特定 | `Explore` | 1〜数件の的を絞った検索。読み取り専用 |
| キーワード/パターン跨ぎ調査 | `Explore` (breadth: "very thorough") | 命名揺れがあるとき |
| ライトな内部探索 | `oh-my-claudecode:explore` (haiku) | 軽量・高速 |
| 大規模コードベース横断調査 | `general-purpose` | 複数ステップの探索 |
| 外部ドキュメント・API仕様 | `oh-my-claudecode:document-specialist` | ライブラリの公式ドキュ参照 |
| 統計/データ分析 | `oh-my-claudecode:scientist` | DBクエリ・トレンド分析 |

### 🛠 実装

| 状況 | 推奨エージェント | 備考 |
|---|---|---|
| 段階的・体系的な実装 | `ic-engineer` | TodoWriteで進捗管理。標準的な実装 |
| TDD で実装 (Linear/JIRA連携あり) | `tdd-senior-engineer` | Red-Green-Refactor を徹底 |
| マルチファイル実装 (汎用) | `oh-my-claudecode:executor` (sonnet) | 自律的実装 |
| 複雑な goal-oriented 実装 | `oh-my-claudecode:deep-executor` (opus) | 大規模・自律性高 |
| UI/コンポーネント実装 | `oh-my-claudecode:designer` | スタイリング・UX含む |
| ビルド/型エラー修正 | `oh-my-claudecode:build-fixer` | tsc/gradle 系の不具合 |

### 🧹 リファクタ / 整理

| 状況 | 推奨エージェント | 備考 |
|---|---|---|
| Kotlin の DDD/クリーンアーキ準拠リファクタ | `backend-refactoring-assistant` | 小さなRed-Greenサイクル |
| 一般的なコード簡素化 | `code-simplifier` / `oh-my-claudecode:code-simplifier` | 機能維持 |
| アーキテクチャ監査 | `architecture-auditor` | DDD/Clean Architecture 観点 |
| 大局的設計判断 | `oh-my-claudecode:architect` (opus, read-only) | アドバイザリー |

### 🐛 デバッグ / 調査

| 状況 | 推奨エージェント | 備考 |
|---|---|---|
| 根本原因分析 | `oh-my-claudecode:debugger` (sonnet) | スタックトレース・回帰分離 |
| Evidence-driven 因果追跡 | `oh-my-claudecode:tracer` | 競合仮説・evidence収集 |
| パフォーマンス問題 | `oh-my-claudecode:performance-reviewer` (※レビュー側) | hotspot特定 |

### ✅ レビュー

| 状況 | 推奨エージェント | 備考 |
|---|---|---|
| 包括的コードレビュー | `code-reviewer` / `oh-my-claudecode:code-reviewer` | severity rated |
| セキュリティレビュー | `oh-my-claudecode:security-reviewer` | OWASP・認証認可 |
| API契約レビュー | `oh-my-claudecode:api-reviewer` | versioning・互換性 |
| 計画/設計レビュー (Devil's Advocate) | `oh-my-claudecode:critic` (opus) | 多角的批判 |
| u0コーディング規約準拠監査 | `coding-rules-audit` | `docs/coding-rules/` |
| 設計ドキュ準拠監査 | `design-rules-validator` | 設計→規約整合 |
| サイレント失敗の検出 | `pr-review-toolkit:silent-failure-hunter` | catch/fallback 検査 |
| 型設計レビュー | `pr-review-toolkit:type-design-analyzer` | 不変条件・表現力 |
| テスト網羅レビュー | `pr-review-toolkit:pr-test-analyzer` | カバレッジ・edge case |

### 🧪 テスト

| 状況 | 推奨エージェント | 備考 |
|---|---|---|
| テスト戦略立案 | `oh-my-claudecode:test-engineer` | TDD・統合・E2E |
| 結合テストケース生成 | `qa-test-creator` | チケット→テスト観点 |
| E2E テスト作成 | `e2e-test-generator` | CodeceptJS + Playwright |
| E2E テストの修復 | `e2e-test-healer` | flaky/壊れたテストの修復 |
| E2E テスト計画 | `e2e-test-planner` | シナリオ設計 |
| 対話的CLI/サービス検証 | `oh-my-claudecode:qa-tester` | tmux管理 |
| 完了基準・evidence検証 | `oh-my-claudecode:verifier` | 主張の裏取り |

### 📋 計画 / 分析 (planner自身が委譲する先)

| 状況 | 推奨エージェント | 備考 |
|---|---|---|
| 要件明確化 (6つの問い) | `issue-clarifier` | Linear/JIRA連携 |
| 大型チケットを3V分割 | `issue-splitter-3v` | Vertical/Visible/Value |
| 仕様駆動設計 (requirements→design→tasks) | `expert-designer` | Mermaid図つき |
| 戦略的計画立案 | `oh-my-claudecode:planner` (opus) | インタビュー型 |
| 要件分析 | `oh-my-claudecode:analyst` | プリプランニング |
| 調査専門 (Markdown報告書) | `researcher` | ハルシネーション防止 |

### 📝 ドキュメント / コミュニケーション

| 状況 | 推奨エージェント | 備考 |
|---|---|---|
| 技術ドキュ作成 | `oh-my-claudecode:writer` (haiku) | README/API doc |
| コミット履歴管理・整形 | `oh-my-claudecode:git-master` | atomic commit |

### 🚦 並列・統括

| 状況 | 推奨エージェント | 備考 |
|---|---|---|
| タスク分解 + 並列実装統括 | `parallel-implementation-manager` | project-manager → ic-engineer×N |
| 単体タスク分解 | `project-manager` | 依存関係明示 |
| チケット全ライフサイクル自律処理 | `ticket-worker` | branch→impl→PR→review→test |

---

## モデル選択の目安

`Task(subagent_type=..., model=..., prompt=...)` で `model` を渡して複雑さに合わせる：

- **haiku**: 軽量探索・スキャン・狭い範囲のチェック
- **sonnet**: 標準的な実装・デバッグ・レビュー
- **opus**: アーキテクチャ・深い分析・複雑なリファクタ

---

## planner→エージェントの委譲例

### 例1: 「新機能Xを実装したい」

```markdown
## Steps

### 1. 既存パターンの調査
- Agent: `Explore` (breadth: "medium") — 類似機能の実装場所と命名規約を特定。
  *なぜ Explore か*: 読み取り専用かつ的を絞った検索に最適化されているため、grep連打より早い。`general-purpose` だと探索範囲が広がりすぎてコスト過剰。

### 2. ドメインモデル・型の追加
- Agent: `ic-engineer` — レイヤー横断の小さな修正、TodoWriteで管理。
  *なぜ ic-engineer か*: 段階的・体系的な実装に強く、進捗管理が自動化される。`executor` でも実装できるが、複数レイヤーまたぐ場合は ic-engineer の TodoWrite ベースの方が抜け漏れを防げる。

### 3. Repository/UseCase 実装 (TDD)
- Agent: `tdd-senior-engineer` — Red-Green-Refactor で AC を担保。
  *なぜ TDD か*: Acceptance criteria が明確で、Repository層は副作用が局所化されており Red-Green の反復コストが低い。`executor` だとテスト後回しのリスク。

### 4. レビュー
- Agent: `code-reviewer` — マルチテナント漏れ・規約違反を検出。
  *なぜこの段階か*: 実装完了直後で記憶が新しく、修正コストが最小。リリース直前だと手戻りが大きい。
```

### 例2: 「このバグを調査したい」

```markdown
## Steps

### 1. 症状確認 & 仮説立案
- Agent: なし（自分で実施）— エラーログ確認、3つの競合仮説を立てる

### 2. Evidence-driven な原因追跡
- Agent: `oh-my-claudecode:tracer` — 各仮説の evidence for/against を収集

### 3. 修正方針の決定
- Agent: `oh-my-claudecode:debugger` — root cause 確定と修正提案
```

### 例3: 「大きすぎるチケットを分割したい」

```markdown
## Steps

### 1. 3V観点での分割案作成
- Agent: `issue-splitter-3v` — Vertical/Visible/Value で N個のサブチケットに分解

### 2. 依存関係と順序付け
- Agent: なし（planner自身）— Steps.Depends on で図示

### 3. 各PRのAC明確化
- Agent: `issue-clarifier` — 6つの問いで各サブチケットを締める
```

---

## 委譲しない判断

すべてのステップにエージェントを当てる必要はない。次の場合はpranner自身（または呼び出し元）で実行する：

- 1ファイル・数行の修正
- 確認 / 報告 / ステータス更新
- 既に明確な小タスク（ts型を1つ追加するだけ等）

過剰委譲はオーバーヘッドになる。**「これは別エージェントに任せる価値があるか？」を毎回問う**。
