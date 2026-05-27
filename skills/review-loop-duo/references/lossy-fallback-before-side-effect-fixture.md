# lossy-fallback-before-side-effect fixture

この fixture は、`review-loop-duo` の silent-failure 観点が「依存データの欠落や解決失敗を default に潰したまま副作用へ進む」構造を検出できるか確認するための最小例である。

## 検出対象コード

```kotlin
val snapshot = snapshotQuery.findBy(...) ?: run {
    logger.warn("snapshot not found")
    null
}

historyRepository.create(
    History(
        operatorName = snapshot?.displayName ?: "",
        externalId = snapshot?.externalId ?: "",
    )
)
```

## 期待 finding

- severity: `Critical` または `Warning`
- perspective: `silent-failure`
- category: `lossy-fallback-before-side-effect`
- summary: snapshot 解決失敗が空文字に潰され、履歴 INSERT 後に原因を復元できない
- why_problem（なぜ問題か＝機序）: `findBy` が null を返したとき `?: ""` で空文字に潰したまま `create` へ進むため、「解決成功で値が空」と「解決失敗」が同じ空文字に畳み込まれ、保存行から区別できなくなる
- impact（なぜ修正が必要か＝帰結）: 履歴に原因不明の空文字レコードが残り、解決失敗を後から検知・追跡・再実行できない。監査・障害調査でデータの信頼性が損なわれる

## 推奨修正（fix）

- fail-closed にして `Err` / exception で副作用を止める
- または unresolved 状態を明示的な型・カラム・sentinel として保存する
- いずれの場合も、呼び出し側が失敗を観測できる形にする

## 汎用化条件

この fixture は `snapshot` という語彙に依存しない。nullable result を `?: ""`, `?: false`, `?: 0`, `?: emptyList()` などで潰し、その後に `insert`, `update`, `save`, `create`, `publish`, `send`, `notify`, `enqueue` へ進む差分では、同じカテゴリで検出する。
