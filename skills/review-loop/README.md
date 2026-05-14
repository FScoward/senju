# review-loop

PRのAIレビューを指摘事項（Critical/Warning）が**ゼロになるまで**自動ループするスキル。

## 概要

7つの観点（コーディング規約・アーキテクチャ・セキュリティ・サイレント障害・要件充足・テスト妥当性・パフォーマンス）を並列エージェントでレビューし、指摘が残る限り「修正 → commit → 再レビュー」を繰り返す。

重大指摘の見落としを減らすため、DB列・enum・API DTO・フォーム値・raw SQL などの変更では差分外の seed / fixture / setup script / caller も追跡する。

## 使用シーン

| シーン | 呼び出し例 |
|-------|-----------|
| レビュー指摘をゼロにしたい | `/review-loop` |
| 繰り返しレビューで品質を上げたい | `/review-loop` |
| 他人のPRをレビューしてコメントしたい | `/review-loop`（修正はスキップ、コメント投稿のみ） |

## `parallel-review` との違い

| | parallel-review | review-loop |
|--|----------------|-------------|
| サイクル数 | 1回（Critical再チェック込み） | Critical/Warning=0 になるまで繰り返す |
| 自動修正 | なし | あり（自分のPRのみ） |
| 用途 | 現状把握・スポットチェック | 品質を収束させるまで走り続ける |

## 動作フロー

```
Phase 0: 初期化（PR番号・チケットID・自分のPRか判定）
  ↓
Phase 1: 7観点並列レビュー（run_in_background × 7）
  ↓
Phase 2: 結果集計・ループ判定
  ↓ Critical/Warning が残っていれば
Phase 3: 修正適用 → commit & push（自分のPRのみ）
  ↓
Phase 1 に戻る（最大5回、超過時はユーザーに確認）
  ↓
Phase 4: 完了レポート
```

## インストール

```bash
gh skill install FScoward/senju review-loop
```

## 注意事項

- 他人のPRではコード修正・commit・pushは行わない（レビューコメント投稿のみ）
- featureブランチのみで使用する
- Info レベルの指摘は修正対象外
