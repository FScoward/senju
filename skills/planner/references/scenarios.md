# Scenarios — シナリオ別の段取りパターン

各シナリオごとに「Goal/Constraints/Acceptance criteriaを引き出す質問」「典型的なステップ構成」「よくあるリスク」を示す。

---

## implementation

**いつ**: 新機能・新エンドポイント・新画面の実装、または既存機能への追加。

### 引き出すべき情報

- **Goal**: ユーザーにとって何ができるようになるか（機能ではなく成果で書く）
- **Constraints**:
  - 既存アーキテクチャの制約（DDD/レイヤー分離・マルチテナント・認証方式）
  - 使用必須/使用禁止のライブラリ
  - 期限・PR分割の有無
- **Acceptance criteria**:
  - 動作: 「Xの操作をするとYになる」
  - テスト: 「ユニット/結合テストが通る」
  - 型/lint: 「typecheck・lint・format がパス」
  - レビュー観点: 「コーディング規約に違反しない」

### 典型ステップ構成

1. **ドメインモデル/型の確認・追加** — 影響範囲を確定する
2. **Repository/Service 層の実装** — TDDが推奨（test-engineer起動）
3. **API/Controller 層の実装**
4. **フロントエンド（必要なら）** — React Query / DTO 整備
5. **結合テスト追加**
6. **lint/format/typecheck/test 一括実行**
7. **セルフレビュー** — 重複ロジックがないか、既存パターンに沿っているか

### よくあるリスク

- マルチテナント条件の漏れ → Constraints に必ず書く
- DTO/enum の不整合 → 型定義を最初のステップに置く
- N+1クエリ → 設計時に検討
- 既存パターンを無視した独自実装 → Step 0 で類似実装を `Explore` する

---

## ticket-split

**いつ**: 1つのチケットや機能要件が大きすぎて、複数PRに分けたいとき。

### 引き出すべき情報

- **Goal**: ユーザー価値として最終的に何を届けるか
- **Constraints**:
  - リリース順序の制約（DB先行 → API → UI など）
  - フィーチャーフラグの有無
  - 後方互換性
- **Acceptance criteria**:
  - 各PRが**独立してマージ・リリース可能**であること
  - 各PRが3V（Vertical / Visible / Value）の少なくとも1つを満たすこと

### 典型ステップ構成

3Vで分割する：

- **Vertical**: UIからDBまでの薄い縦串を通す（最初のPR）
- **Visible**: ユーザーに見える形で増分する（中間PRs）
- **Value**: 各PRが単体で価値を持つように区切る

```
PR1: Flyway migration（DB schema）
PR2: Domain/Repository 層
PR3: Service/UseCase 層
PR4: API endpoint（read系）
PR5: API endpoint（write系）
PR6: Frontend統合
```

### よくあるリスク

- PR間の依存が一方向にならない（循環依存） → 順序を Steps の `Depends on` で厳密に
- 中間PRがリリース不可（半完成） → フィーチャーフラグ or 内部API化を Constraints に
- レビュー負荷が偏る → 各PRを300〜500行以内に収める

### 連携エージェント

- `issue-splitter-3v` を呼び出すことを推奨

---

## refactor

**いつ**: 既存コードの整理・パターン統一・命名変更・アーキテクチャ修正。

### 引き出すべき情報

- **Goal**: なぜリファクタするか（読みやすさ？再利用？性能？）
- **Constraints**:
  - **振る舞いは変えない**（テストが緑のまま）
  - 影響範囲（呼び出し元の数）
  - rollback戦略
- **Acceptance criteria**:
  - 既存テストがすべて通る
  - 新規バグが入っていない（型/lint/動作確認）
  - 変更前後で動作差分がない

### 典型ステップ構成

Red-Greenを徹底する：

1. **影響範囲調査** — `Explore` で呼び出し元を全特定
2. **既存テストの確認・補強** — リファクタ前に safety net を厚くする
3. **小さく機械的な変更** — 1コミット1変更を意識
4. **テスト実行（毎ステップ）**
5. **段階的な呼び出し元の置換**
6. **旧実装の削除**
7. **最終 lint/format/typecheck/test**

### よくあるリスク

- 「ついで」の挙動変更が混入 → Out of scope に「振る舞い変更は含まない」を明示
- 並列作業中のPRと衝突 → Constraints に「rebase戦略」を書く
- 命名変更で grep が壊れる → 影響範囲の網羅性を Step 1 で確認

### 連携エージェント

- Kotlinなら `backend-refactoring-assistant`
- 設計監査が必要なら `architecture-auditor`
- 一般的な簡素化は `code-simplifier`

---

## investigation

**いつ**: バグ調査・原因究明・パフォーマンス問題の追跡。

### 引き出すべき情報

- **Goal**: 何を解明したいか（再現条件？根本原因？影響範囲？）
- **Constraints**:
  - 本番環境に触れるかどうか
  - 個人情報の扱い
  - 時間制限（10分以内に結論を出す等）
- **Acceptance criteria**:
  - 根本原因が特定できる
  - 再現手順が記述できる
  - 影響を受けるユーザー/データ範囲が見積もれる
  - 修正方針が決まる

### 典型ステップ構成

Hypothesis-driven で進める：

1. **症状の確認** — エラーログ・スクショ・再現手順
2. **仮説リスト作成** — 競合する仮説を3つ程度
3. **証拠収集（並列）** — 各仮説に対する evidence for/against
4. **DB状態のクエリ**（必要なら、最大2クエリ）
5. **関連コードのgrep**（最大3検索）
6. **再現試行**（ブラウザ or API）
7. **根本原因の特定** — 結論と修正方針

### よくあるリスク

- 「探索ループ」に入って10分以上溶ける → 時間ボックスをConstraintsに
- 計画モードに入って実調査が始まらない → 即座に実調査開始（u0プロジェクトのルール）
- 1つの仮説に固執して反証を無視する → 競合仮説を必ず3つ立てる

### 連携エージェント

- `oh-my-claudecode:debugger` (sonnet) — root cause分析
- `oh-my-claudecode:tracer` — evidence-driven causal tracing
- `Explore` — 関連コード特定

---

## generic

**いつ**: 上記4シナリオに当てはまらない汎用的な計画依頼。

### 進め方

1. ユーザーの依頼を要約して **シナリオ判定が難しい理由** を一文で示す
2. それでも3点セット（Goal/Constraints/Acceptance criteria）は必ず引き出す
3. ステップを3〜5個に分解
4. 各ステップに必要そうなエージェントを `references/agent-routing.md` から選ぶ
5. **不確実性が高い場合は最初のステップを "spike"（小さな試作で検証）にする**

### よくあるリスク

- スコープが広すぎて計画自体が頓挫 → Out of scope を最初に決める
- 後続の手戻りが多い → Open questions を残し、判断ポイントを明示
