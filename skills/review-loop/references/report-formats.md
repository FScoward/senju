# report-formats.md

`review-loop` Phase 10 が出力する完了レポートのテンプレート集。
SKILL.md の本文から参照される。Phase 10 を実行する時はこのファイルを読んで該当フォーマットを使うこと。

レポート種別は 3 つ:

1. **クリーン達成（PR ありモード）** — Critical / Warning がゼロになって PR をレビュー一巡完了したケース
2. **クリーン達成（PR なしモード）** — kouunryuusui QG 等から呼ばれて、ローカル diff で完了したケース
3. **残指摘あり** — 収束 / 最大イテレーション到達 / ユーザー終了で打ち切ったケース

各レポートには `IS_OWN_PR=true` の場合のみ「修正ジャーナル」セクションを追記する。

---

## 1. クリーン達成（PR ありモード）

```
## ✅ Review Loop 完了 — Critical/Warning がゼロになりました！

| Iter | Critical | Warning | Minor | Info | Auto-fix | PR Review |
|------|----------|---------|-------|------|----------|-----------|
| #1   |        3 |       5 |     1 |    2 |        8 | https://github.com/…/pull/N#pullrequestreview-xxx |
| #2   |        1 |       2 |     1 |    1 |        3 | https://github.com/…/pull/N#pullrequestreview-yyy |
| #3   |        0 |       0 |     1 |    1 |        — | —                                                  |

観点別サマリー（最終イテレーション）:
| 観点 | Critical | Warning | Minor | Info |
|---|---|---|---|---|
| External Signals Gate | 0 | 0 | 0 | 0 |
| Database Migration Gate | 0 | 0 | 1 | 0 |
| コーディング規約 | 0 | 0 | 0 | 0 |
| アーキテクチャ | 0 | 0 | 0 | 0 |
| セキュリティ | 0 | 0 | 0 | 0 |
| サイレント障害 | 0 | 0 | 0 | 0 |
| 要件充足度 | 0 | 0 | 0 | 0 |
| テスト妥当性 | 0 | 0 | 0 | 0 |
| パフォーマンス | 0 | 0 | 0 | 0 |

Minor判断:
- [対応済み] migration operation risk - PR本文にlock影響とCONCURRENTLY要否を記載
- [対応不要] test description wording - 実装リスクではなく説明品質のみのため

## 修正ジャーナル（自分PR）

> `IS_OWN_PR=true` のときのみ出力。`state.iterations[].fixes[]` をイテレーション昇順に展開する。

### Iteration 1
#### [Critical] src/foo/OrderService.kt:42  (security / tenant-isolation)
- 検知: tenantIdフィルタ漏れで他テナントの注文を読める
- 意図: 認可境界の侵害。tenantId必須化でIDORを防ぐ
- 修正: OrderRepository.findById を findByIdAndTenantId に置換、Service 層から呼び出し変更
- commit: abc1234

#### [Warning] src/foo/OrderController.kt:17  (silent-failure / empty-catch)
- 検知: catch (Exception) で握りつぶし、ログなし
- 意図: 例外が発生しても呼び出し元が正常終了と区別できず、サイレント障害化する
- 修正: logger.error 追加 + DomainException に変換して上位へ伝搬
- commit: abc1234

### Iteration 2
修正なし（新規指摘は発生せず）

### Iteration 3
✅ 完了（Critical/Warning ゼロ）

総修正: 11件 / 3イテレーション
PRはレビュー観点でクリーンな状態です。
各イテレーションのインラインコメントはPR上で確認できます。
```

---

## 2. クリーン達成（PR なしモード）

```
## ✅ Review Loop 完了 — Critical/Warning がゼロになりました！

| Iter | Critical | Warning | Minor | Info | Auto-fix | Commit  |
|------|----------|---------|-------|------|----------|---------|
| #1   |        3 |       5 |     1 |    2 |        8 | abc1234 |
| #2   |        1 |       2 |     1 |    1 |        3 | def5678 |
| #3   |        0 |       0 |     1 |    1 |        — | —       |

観点別サマリー（最終イテレーション）:
| 観点 | Critical | Warning | Minor | Info |
|---|---|---|---|---|
| External Signals Gate | 0 | 0 | 0 | 0 |
| Database Migration Gate | 0 | 0 | 1 | 0 |
| コーディング規約 | 0 | 0 | 0 | 0 |
| アーキテクチャ | 0 | 0 | 0 | 0 |
| セキュリティ | 0 | 0 | 0 | 0 |
| サイレント障害 | 0 | 0 | 0 | 0 |
| 要件充足度 | 0 | 0 | 0 | 0 |
| テスト妥当性 | 0 | 0 | 0 | 0 |
| パフォーマンス | 0 | 0 | 0 | 0 |

Minor判断:
- [スコープ外] APP-XXXX由来の無関係なdocs差分 - 今回PRからは除外済み

## 修正ジャーナル（自分PR）

> PR なしモードは `IS_OWN_PR=true` 固定。PR ありモードと同じ形式で出力する。

### Iteration 1
#### [Critical] src/foo/Bar.kt:42  (security / tenant-isolation)
- 検知: tenantIdフィルタ漏れで他テナントの注文を読める
- 意図: 認可境界の侵害。tenantId必須化でIDORを防ぐ
- 修正: OrderRepository.findById を findByIdAndTenantId に置換

### Iteration 2
#### [Warning] src/foo/Baz.kt:17  (silent-failure / empty-catch)
- 検知: catch (Exception) で握りつぶし、ログなし
- 意図: サイレント障害化する
- 修正: logger.error 追加 + DomainException に変換

### Iteration 3
✅ 完了（Critical/Warning ゼロ）

総修正: 11件 / 3イテレーション
コードはレビュー観点でクリーンな状態です。
※ PR なしモードで実行。push は呼び出し元（T5 Push 確認）で行います。
```

---

## 3. 残指摘あり（収束 or ユーザー終了選択）

```
## ⚠️ Review Loop 終了 — 手動対応が必要な指摘が残っています

## 修正ジャーナル（自分PR）

> `IS_OWN_PR=true` の場合のみ出力。終了パスでも、それまでに適用した修正分を必ず出す。

### Iteration 1
#### [Critical] src/foo/Bar.kt:42  (security / tenant-isolation)
- 検知: tenantIdフィルタ漏れ
- 意図: IDOR防止
- 修正: findByIdAndTenantId に置換
- commit: abc1234

### Iteration 2
（自動修正なし。残指摘は下記「手動対応リスト」へ）

## 手動対応が必要な指摘
- [Critical] ServiceImpl.kt:45 - 設計判断が必要（...）
- [Warning]  Controller.kt:12 - 仕様確認が必要（...）

{PR ありモードの場合}
PR Review URL: https://github.com/…/pull/N#pullrequestreview-zzz
次のアクション: PR上のインラインコメントを確認して対応方針を決めてください。

{PR なしモードの場合}
次のアクション: 上記の指摘を手動で確認して対応してください。
```

---

## 修正ジャーナルのエントリ書式（自分PR専用）

各エントリは以下の構成で必ず出力する:

```
#### [<severity>] <path>:<line>  (<reviewer> / <category>)
- 検知: <findings.summary>
- 意図: <intent>  ← 1〜2行
- 修正: <change>  ← 1〜3行
- commit: <commit_sha>  ← PR ありモードのみ
```

- `severity`: Critical / Warning / Minor のいずれか
- `reviewer`: coding-rules / architecture / security / silent-failure / requirements / test-adequacy / performance / migration-gate / external-signals
- `category`: tenant-isolation / empty-catch / n-plus-one 等、`fixes[].finding.category` の値をそのまま使う
- 1 イテレーションで 10 修正を超える場合、Critical/Warning のみ詳細化し、Minor は `change` を 1 行に圧縮する
