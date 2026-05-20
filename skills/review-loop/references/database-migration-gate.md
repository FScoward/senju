# database-migration-gate.md

`review-loop` Phase 3 の詳細手順。`backend/src/main/resources/db/migration/*.sql` が差分に含まれる場合のみ実行する。

このPhaseは通常 reviewer とは別に必ず実行する。結果は `MIGRATION_GATE_FINDINGS` として Phase 6 の集計対象に含め、同時に `MUST_RECHECK_TOPICS` へ追加して Phase 4 の全レビュアーへ渡す。

---

## 3-1. 必須コマンド

```bash
git fetch origin main
git diff --name-status origin/main...HEAD
git diff origin/main...HEAD -- backend/src/main/resources/db/migration
ls backend/src/main/resources/db/migration | sort | tail -30
rg -n "V[0-9]+\\.[0-9]+__" backend/src/main/resources/db/migration
```

`docs/coding-rules/database.md` が存在する場合は、migration / index 規約の真実ソースとして必ず読む。

---

## 3-2. 必須確認

- 新規 migration の version が main 最新より新しいか
- 同一 Flyway version が main に存在しないか
- migration filename と PR マージ時点の timestamp が妥当か
- index 名が `docs/coding-rules/database.md` の規約に合うか
- `CREATE INDEX` の lock 影響と `CONCURRENTLY` 要否が説明・判断されているか
- partial index の predicate が Kotlin enum / query constant / CHECK 制約と二重管理になっていないか
- 対象 query の `WHERE` / `ORDER BY` / `LIMIT` と index column order が整合するか
- `tenant_id` を含める / 含めない判断が query shape と一致しているか
- migration-only PR に scope 外の Kotlin / frontend / docs 変更が混入していないか

---

## 3-3. 重大度基準

| 条件 | 重大度 |
|---|---|
| 同一 Flyway version collision | Critical |
| failed Migration Version Check | Critical |
| main 最新 migration より古い timestamp | Critical または Major相当（review-loop上は Critical / Warning のどちらかに正規化） |
| index naming 規約違反 | Warning以上 |
| `CREATE INDEX` の lock 影響説明なし | Warning |
| partial index の enum 文字列ハードコード | Warning以上 |
| query shape と index column order の不整合 | Warning以上 |
| migration-only PR の scope 外変更混入 | Warning または Minor（ユーザーが scope を厳密に求める文脈では Warning） |

---

## 3-4. 出力フォーマット

```
MIGRATION_GATE_FINDINGS:
- [Critical] backend/src/main/resources/db/migration/V202605...__foo.sql:1 - 同一Flyway versionがorigin/mainに存在する
- [Warning] backend/src/main/resources/db/migration/V202605...__foo.sql:12 - CREATE INDEXのlock影響とCONCURRENTLY要否が説明されていない
MIGRATION_GATE_FINDINGS_END

MUST_RECHECK_TOPICS_APPEND:
- category: migration-version
  summary: Flyway collision / timestamp / ordering / CI gateを横断確認する
- category: partial-index-predicate
  summary: Kotlin enum / query constant / CHECK制約 / 将来enum追加時の性能退行を横断確認する
MUST_RECHECK_TOPICS_APPEND_END

FINDINGS: {critical}C {warning}W {minor}M {info}I
```
