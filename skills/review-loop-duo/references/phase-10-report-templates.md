# Phase 10 レポートテンプレート集

SKILL.md Phase 10 から切り出した出力テンプレート例。毎回参照するのではなく、初回または構造を確認したい時に Read する。

---

## duo 統計テーブル

```
## ✅ Review Loop Duo 完了

| Iter | Critical | Warning | Minor | Info | CONFIRMED | Claude-only | Codex-valid | Codex-doubtful | Agreement |
|------|----------|---------|-------|------|-----------|-------------|-------------|----------------|-----------|
| #1   |        3 |       5 |     1 |    2 |         4 |           3 |           1 |              1 |       50% |
| #2   |        1 |       2 |     1 |    1 |         2 |           1 |           0 |              0 |       67% |
| #3   |        0 |       0 |     1 |    1 |         0 |           0 |           0 |              0 |        —  |

Codex hallucination 検出: ${HALLUCINATION_COUNT} 件（破棄済み）
Codex タイムアウト: ${CODEX_TIMEOUT_COUNT} 回
```

---

## 入力検証セクション

```
## 🔍 入力検証

- Phase 1 取得方式: gh api repos/{owner}/{repo}/pulls/{N}/files (推奨A案)
- PR_CHANGED_FILES 件数: ${len(pr_changed_files)} 件
- Phase 6-0 で out-of-scope として破棄した finding: ${OUT_OF_SCOPE_DISCARDED} 件
  - うち Critical/Warning: ${OUT_OF_SCOPE_CW} 件
- PR-SCOPE-VIOLATION 系の指摘を投稿した場合の再確認:
  - ${each violation path} が gh api .../files の結果に含まれる: ✅ / ❌
```

---

## consolidate 統計テーブル

`state.iterations[N].consolidate.status` が `success` / `partial` だった iteration の出力:

```
## 📦 観点内 consolidate 統計

| 観点 | Pre-consolidate | Post-consolidate | 圧縮率 | severity 昇格 |
|---|---:|---:|---:|---:|
| coding-rules | 12 | 7 | 42% | 2 件 |
| security | 5 | 3 | 40% | 1 件 |
| ...

合計: 71 → 48 件 (32% 圧縮)
```

`partial` の場合は失敗観点を脚注で示し、`skipped` の iteration は表から除外する。

---

## diff-runs サマリ

`state.iterations[N].diffRuns` が記録された iteration の出力:

```
## 🔁 連続 run の差分 (diff-runs)

前回 run: runs/2026-05-22-1620-pr3122-iter2.json

| 分類 | 件数 |
|---|---:|
| 🆕 new (今回新規) | 2 |
| ♻️ carryover (継続) | 3 |
| ✅ fixed (解消) | 5 |

### 🆕 今回新規発生した Critical/Warning
- [Critical] src/foo/Cache.kt:88 (PF-2) - キャッシュ初期化漏れ
  → 前回 fix した SE-1 の副作用の可能性あり

### ♻️ 3 run 連続で carryover している指摘 (手動対応推奨)
- [Warning] src/foo/Util.kt:17 (SF-1) - 空 catch  (carryover_count=3)
```

初回 run やスキップ iteration では本セクションを出さない。

---

## 修正ジャーナル（自分PR・duo 版）

`IS_OWN_PR=true` のときのみ出力。各エントリは finding の 3 分解（なぜ問題か / 放置リスク / どう直したか）を引き継いで書く。見出しに `confidence` ラベルを付けることで、両モデル合意の指摘と片方のみの指摘を後から識別できる。

```
## 修正ジャーナル（自分PR）

### Iteration 1
#### [Critical] [CONFIRMED] src/foo/Bar.kt:42  (security / tenant-isolation)
- なぜ問題か: findById が主キーだけで引き、テナント境界の不変条件を満たさない。tenantId が WHERE に無く id 列挙で越境できる（Claude + Codex 一致）
- 放置リスク: 他テナント利用者が id 差し替えで別企業の注文を閲覧（IDOR）。個人情報の越境漏洩
- どう直したか: OrderRepository.findById → findByIdAndTenantId に置換し SQL レベルで認可を強制
- commit: abc1234

#### [Warning] [Codex-valid] src/foo/Cache.kt:88  (performance / cache-miss)
- なぜ問題か: 同一クエリを毎回 DB に投げており、結果が不変なのにキャッシュしていない（Codex のみ、Claude 精査済み）
- 放置リスク: N+1 ではないが高頻度アクセスで latency が累積。ピーク時に DB 負荷が線形に増える
- どう直したか: Caffeine.builder().maximumSize(256).build() を導入
- commit: def5678

### Iteration 2
#### [Warning] [Claude-only] src/foo/Util.kt:17  (silent-failure / empty-catch)
- なぜ問題か: catch (Exception) で握りつぶし、ログも再throwも無く処理を継続している（Claude のみ）
- 放置リスク: 失敗が呼び出し側に伝播せず、障害が無言で進行する。原因調査の手がかりも残らない
- どう直したか: logger.error 追加 + DomainException に変換して呼び出し側へ伝播
- commit: ghi9012

### Iteration 3
✅ 完了（Critical/Warning ゼロ）
```

`CODEX_DOUBTFUL` / `CODEX_HALLUCINATION` は修正していないのでジャーナルに出ない（duo 統計テーブルで件数のみ示す）。
