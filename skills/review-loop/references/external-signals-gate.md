# external-signals-gate.md

`review-loop` Phase 2 の詳細手順。PR ありモード（`HAS_PR=true`）のときのみ実行する。

AI レビューを始める前に GitHub 上の既存シグナルを必ず取得し、以降のレビュアーへ渡す `MUST_RECHECK_TOPICS` を作る。failed check や既存 review thread は「参考情報」ではなく、review-loop の入力として扱う。

---

## 2-1. PR metadata / CI / review signals の取得

```bash
gh pr view {PR_NUMBER} --json statusCheckRollup,latestReviews,files,commits,body
```

GraphQL で review threads を取得する:

```bash
OWNER=$(gh repo view --json owner -q '.owner.login')
REPO=$(gh repo view --json name -q '.name')

gh api graphql -f owner="$OWNER" -f repo="$REPO" -F number="{PR_NUMBER}" -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 20) {
            nodes {
              path
              line
              body
              author { login }
              createdAt
            }
          }
        }
      }
    }
  }
}'
```

---

## 2-2. failed check の root cause を先に確定

`statusCheckRollup` に failed / error / cancelled check がある場合は、通常レビューより先に以下を要約する:

- failing job / failing Gradle task / failing step
- root error（最初の meaningful な exception / assertion / linter message）
- 既知 reviewer 指摘との対応関係
- review-loop で必ず再確認するカテゴリ

特に以下は deterministic gate として扱い、見つかった時点で `MUST_RECHECK_TOPICS` に入れる:

- Migration Version Check
- Backend PR Check
- ktlint / formatter
- unit / integration / migration test failure

failed Migration Version Check は **Critical** として扱う。CI failure の原因が未確定のまま Phase 4 へ進まない。

---

## 2-3. review threads から MUST_RECHECK_TOPICS を作る

既存 review thread をカテゴリ化し、重複投稿ではなく横展開レビューの起点にする:

- migration version / timestamp / ordering
- index naming / index operation risk / query shape
- enum / constant / partial index predicate
- scope creep / unrelated files
- tenant isolation / authorization
- tests / fixtures / seed / setup script

`MUST_RECHECK_TOPICS` の各項目は、少なくとも以下を持つ:

```json
{
  "source": "failed-check|review-thread|latest-review|pr-body",
  "severity_hint": "Critical|Warning|Minor|Info",
  "category": "migration-version",
  "summary": "Migration Version Check failed because V202605... already exists on main",
  "paths": ["backend/src/main/resources/db/migration/V202605...__example.sql"],
  "required_followups": [
    "同一Flyway versionがmainに存在しないか",
    "main最新migrationより新しいtimestampか",
    "CI gateで同じ失敗が解消されたか"
  ]
}
```

---

## 2-4. 出力フォーマット

```
EXTERNAL_SIGNALS_FINDINGS:
- [Critical] Migration Version Check - failed check の root cause が Flyway version collision の可能性を示している
- [Warning] review-thread:backend/src/main/resources/db/migration/V202605...__foo.sql:12 - index operation risk の既存指摘あり
EXTERNAL_SIGNALS_FINDINGS_END

MUST_RECHECK_TOPICS:
- category: migration-version
  summary: failed Migration Version Check のroot cause、同一version、timestamp最新性、migration orderingを確認する
- category: scope-creep
  summary: PR body / ticket ID / changed filesを照合し、別チケット変更が混入していないか確認する
MUST_RECHECK_TOPICS_END

FINDINGS: {critical}C {warning}W {minor}M {info}I
```
