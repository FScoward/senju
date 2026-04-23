# 見張り（mihari）

> テストが観点的に十分か、指摘が出なくなるまで反復する見張り番

「テストがある」≠「テストが足りている」。単一のレビュアーでは盲点が残る。mihari はテスト充足性を多角的に検証する 3 並列エージェントを収束するまで繰り返す専門スキルです。

## インストール

```bash
gh skill install FScoward/senju mihari
```

## 使い方

### 単独使用

```bash
# チケットIDから対象特定
/mihari APP-1234

# PR番号から対象特定
/mihari PR=2993

# 対象ディレクトリ指定
/mihari backend/src/test/kotlin/com/example/feature/user/

# テストファイル単体
/mihari UserRegistrationUseCaseTest.kt
```

### 他スキルから呼び出し

`kouunryuusui` など統合開発フロースキルの QG（品質ゲート）から内部呼び出しできます。呼び出し側は AC・テストコードパス・実装コードパスを渡し、mihari が収束ループを回して PASS/FAIL/ESCALATE を返します。

詳細は [`references/io-contract.md`](references/io-contract.md) を参照。

## フロー概要

```
mihari ループ（max_iterations=5）
│
├─ Round N:
│   ├─ 3並列レビュー
│   │   ├─ Agent X: 等価分割 + 境界値
│   │   ├─ Agent Y: デシジョンテーブル + 状態遷移
│   │   └─ Agent Z: エラー推測 + 副作用 + assertion品質
│   │
│   ├─ 指摘集約 → Critical / Warning 分類
│   ├─ 判定（PASS / CONTINUE / STACK / ESCALATE）
│   ├─ CONTINUE → テスト追加実装 → 次 Round
│   └─ ログ記録（scratch.md）
│
└─ 完了: PASS / FAIL / ESCALATE を呼び出し側に返却
```

## 核心原則

1. **観点の網羅**: 単一視点は盲点を生む。3並列で担当分担
2. **収束するまで回す**: 指摘が0件になるまで継続（上限あり）
3. **証拠ベース判定**: テスト追加後、実行して PASS することを exit code で確認
4. **過検出の学習**: 誤検出パターンを次 Round のプロンプトに注入して精度向上

## レビュー観点（3並列の分担）

| Agent | 観点 |
|-------|------|
| **X** | 等価分割・境界値・null/空・数値特殊値・文字エンコーディング境界 |
| **Y** | デシジョンテーブル・状態遷移・冪等性・認可マトリクス |
| **Z** | 並行性・外部依存失敗・タイムゾーン・副作用 assertion・assertion 具体性/多角性・空テスト検出 |

詳細は [`references/review-patterns.md`](references/review-patterns.md)。

## 収束条件

| 状況 | 判定 |
|------|------|
| Critical=0 + Warning=0（または DR 記録済み）+ テスト実行 PASS | **PASS** |
| Critical または Warning 残存、スタックなし、max 未到達 | **CONTINUE** |
| 同一カテゴリ指摘が 2 Round 連続 | **STACK**（opus 分析→再試行） |
| max_iterations 到達 or STACK 2連続 | **ESCALATE**（ユーザー判断） |

詳細は [`references/loop-protocol.md`](references/loop-protocol.md)。

## 動作要件

- [Claude Code](https://claude.ai/code) CLI
- 対象プロジェクトでテスト実行コマンドが利用可能（例: `./gradlew test`, `npm run test`）

## 併用推奨スキル

| スキル | 用途 |
|-------|------|
| `kouunryuusui` | 統合開発フローの品質ゲートから mihari を呼び出す |

## ライセンス

MIT
