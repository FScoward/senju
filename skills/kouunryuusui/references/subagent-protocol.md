# サブエージェント通信プロトコル

E4（Native Team オーケストレーション）で使用する、ワーカー↔Team Lead 間のメッセージング定義。

---

## ワーカー → Team Lead: ステータスメッセージ

### ステータス一覧

| ステータス | 意味 | Team Lead の対応 |
|-----------|------|----------------|
| `PROGRESS: {id} {from}→{to} {概要}` | フェーズ移行 | ログのみ |
| `FILES: {id} {ファイルパス,...}` | 変更ファイル確定 | コンフリクト検出・警告 |
| `BLOCKED: {id} {問題詳細}` | ブロッカー発生、作業停止 | `RESOLVE:` で解決策を送信 |
| `ESCALATE: {id} QG {n}/{max} {残存問題}` | QG修正ループ上限、自動解決不能 | ユーザーエスカレーション |
| `DONE: {id} {status} {変更サマリー} DR:{件数}` | 全工程完了、Push承認待ち | 一括Push承認フローへ |
| `NEEDS_CONTEXT: {id} {不足情報の説明}` | コンテキスト不足で作業開始不能 | 不足情報を補充して再ディスパッチ |
| `DONE_WITH_CONCERNS: {id} {懸念内容}` | 完了したが懸念あり | 懸念内容を読み、対処か記録かを判断 |

### メッセージ例

```
PROGRESS: APP-123 T3→QG TDD実装完了、品質ゲートへ
FILES: APP-123 UserRepository.kt, UserController.kt
BLOCKED: APP-123 UserEntity.ktの型定義が他ブランチの変更と競合
ESCALATE: APP-123 QG 4/5 ビルドエラー収束せず
DONE: APP-123 awaiting_approval 5files,+200/-30 DR:2
NEEDS_CONTEXT: APP-123 spec.mdのAC3の解釈が2通りあり、どちらで実装するか不明
DONE_WITH_CONCERNS: APP-123 UserRepository.ktが800行を超えており分割を検討すべきかもしれない
```

---

## `NEEDS_CONTEXT` の処理フロー

```
受信時:
1. 不足コンテキストを特定する
2. `CONTEXT:` メッセージで情報を補充し、同じモデルで再ディスパッチ
3. 2回連続 NEEDS_CONTEXT → タスク粒度が大きすぎる可能性 → タスク分割を検討
4. 3回連続 → ユーザーエスカレーション（タスク定義自体に問題あり）
```

---

## `DONE_WITH_CONCERNS` の処理フロー

```
受信時:
1. 懸念内容を必ず読む（スキップ禁止）
2. 正確性・スコープに関わる懸念（バグの可能性、要件の未達等）
   → 対処してから承認フローへ
3. 観察的な懸念（「このファイルが大きくなってきた」「命名が迷った」等）
   → Decision Record に記録してから承認フローへ
4. 絶対にそのまま無視しない
```

---

## Team Lead → ワーカー: 指示メッセージ

| プレフィクス | 意味 | ワーカーの対応 |
|------------|------|--------------|
| `CONFLICT_WARN: {id} {ファイル}` | 他ワーカーとファイル競合の警告 | 該当ファイルの作業を遅延 or mainマージ後に着手 |
| `RESOLVE: {id} {解決策}` | ブロッカーへの解決策指示 | 指示に従い作業を再開 |
| `SYNC: {id}` | mainマージ指示 | `git fetch && git merge origin/main` 後に作業再開 |
| `ABORT: {id}` | 作業中止指示 | 現在の作業を中断し、状態を報告して停止 |
| `CONTEXT: {id} {補充情報}` | NEEDS_CONTEXT への回答 | 提供された情報を参照して作業を開始 |
