# サブエージェント通信プロトコル

E4（Team / file-handoff オーケストレーション）で使用する、ワーカー↔Team Lead 間のメッセージング定義。

Claude では `SendMessage` で送受信する。Codex で同等の Team tool が使えない場合は、同じ行形式を `.claude/tmp/team/{team_id}/events.log` に追記し、Team Lead がそのログを読む。`.claude/tmp` は互換 artifact namespace であり、Codex 実行時も同じパスを使う。

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
   → Decision Record に記録してから承認フローへ（種別は内容に応じて 通常判断 / 妥協 / 先送り から選ぶ。フォーマットは SKILL.md の DR 節を参照）
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

## Codex fallback のログ運用

Team tool が無い場合、Team Lead は以下を守る:

1. E4 開始時に `.claude/tmp/team/{team_id}/events.log` と `tasks/*.md` を作成する
2. ワーカー相当の作業を開始するたびに `PROGRESS:` を追記する
3. 変更予定ファイルが分かった時点で `FILES:` を追記し、既存 `FILES:` 行と衝突しないか確認する
4. ブロッカー・完了・懸念は `BLOCKED:` / `DONE:` / `DONE_WITH_CONCERNS:` として追記する
5. Team Lead からの指示は `tasks/{id}.md` の `## Instructions` に追記し、必要なら events.log にも同じプレフィクスで残す
