# Finding 出力フォーマット規約 (review-loop-duo v2)

Claude 側 7 Agent と Codex 側 1 プロセスは、両方とも `references/schemas/finding.schema.json` に準拠した JSON で出力する。後方互換のため `FINDINGS: XC YW ZM VI` 行も併存出力する。

## 指摘の 3 分解（why_problem / impact / fix）

**このスキルの指摘は「わかりにくい」を防ぐため、説明を 3 つの必須フィールドに分解する。** 旧 `body`（自由記述の塊）は廃止した。レビュアーが「何が問題か」だけ書いて「なぜ」を飛ばせてしまうのが、指摘がわかりにくい根本原因だったため。

| フィールド | 問い | 中身 | 混同しやすい相手 |
|---|---|---|---|
| `why_problem` | **なぜ問題なのか（機序）** | コードが実際に何をしていて、どの不変条件・前提・契約・意図に反するか。欠陥の**仕組み**を説明する。**最重要。** | `summary` の言い換えで終わらせない |
| `impact` | **なぜ修正が必要なのか（帰結）** | 放置した場合の具体的な悪影響。誰が・どんな状況で・何を失うか（データ破損／漏洩／障害／誤動作／保守コスト）。重大度の根拠。 | `why_problem` を言い直さない |
| `fix` | **どう修正すると良いか（方針）** | 修正の方向性を文章で。具体コードは `before` / `after` に置く。 | — |

### why_problem と impact の違い（ここが肝）

- `why_problem` = **機序**：「コードが X をしていて、不変条件 Y を破っている」
- `impact` = **帰結**：「その結果、Z という損害が、誰々に、いつ起きる」

機序を書かずに帰結だけ書くと「危ないらしいが、コードのどこがどう悪いのか分からない」指摘になる。逆に帰結を書かないと「規約違反ではあるが、直す優先度が分からない」指摘になる。両方を分けて書いて初めて、読み手が PASS/FIX を自分で判断できる。

### ❌ 悪い例（why と impact が混ざり、機序が無い）

```json
{
  "summary": "tenantId フィルタ漏れ",
  "why_problem": "セキュリティ的に危険でテナント分離ができていないので修正が必要。",
  "impact": "危険。",
  "fix": "直す。"
}
```

問題点: `why_problem` が「危険」「修正が必要」という帰結と当為の混在で、**コードのどの挙動がどの不変条件を破るのか（機序）が一切ない**。`impact` は一語で誰が何を失うか不明。`fix` も具体性ゼロ。これでは読み手はコードを自分で追い直す羽目になる。

### ✅ 良い例（機序・帰結・方針が分離している）

```json
{
  "summary": "tenantId フィルタ漏れ",
  "why_problem": "findById は主キー id だけで行を引くため、テナント境界の不変条件（自テナントのデータしか参照できない）を満たさない。リクエストの tenantId が WHERE 句に含まれず、id を推測・列挙すれば他テナントの行に到達できる。",
  "impact": "他テナントの利用者が URL の id を差し替えるだけで別企業の注文データを閲覧できる（IDOR）。個人情報・取引情報の越境漏洩につながり、規約違反・インシデント対応が発生する。",
  "fix": "リポジトリ呼び出しを tenantId 必須のメソッドに置換し、認可境界を SQL レベルで強制する。見つからない場合は 404 を返してリソースの存在有無も漏らさない。"
}
```

`why_problem` で「findById が id だけで引く＝境界不変条件を破る」という機序を、`impact` で「URL 差し替えで越境閲覧＝IDOR・漏洩」という帰結を、`fix` で方針を、それぞれ独立に読める。

## 出力チャネル

| 経路 | 出力先 | 形式 |
|---|---|---|
| Claude Task agent | message body 末尾の ```json``` フェンス内 | JSON (schema 準拠) |
| Claude Task agent | message body 最終行 | `FINDINGS: XC YW ZM VI` (後方互換) |
| Claude Task agent (PR ありのみ) | message body 内 `INLINE_COMMENTS_JSON:` ブロック | 既存 review-loop と同じ (後方互換) |
| Codex CLI | `--output-last-message` 指定 JSON ファイル | JSON (schema 準拠) |

## Claude 側 Agent への追加指示

各 reviewer プロンプトの末尾に以下を追加する (`references/reviewer-prompts.md` 参照):

````
## 出力フォーマット (v2: 構造化必須)

最後に必ず以下の 2 ブロックを順に出力すること:

1. 構造化 finding (JSON schema 準拠)

```json
{
  "perspective": "<観点 id>",
  "model": "<モデル id>",
  "iteration": <N>,
  "findings": [
    {
      "id": "CR-1",
      "severity": "Critical",
      "path": "src/foo/Bar.kt",
      "line": 42,
      "side": "RIGHT",
      "category": "tenant-isolation",
      "summary": "tenantId フィルタ漏れ",
      "why_problem": "findById は主キー id だけで行を引くため、テナント境界の不変条件（自テナントのデータしか参照できない）を満たさない。リクエストの tenantId が WHERE 句に含まれず、id を推測・列挙すれば他テナントの行に到達できる。",
      "impact": "他テナントの利用者が、URL の id を差し替えるだけで別企業の注文データを閲覧できる（IDOR）。個人情報・取引情報の越境漏洩につながり、規約違反・インシデント対応が発生する。",
      "fix": "リポジトリ呼び出しを tenantId 必須のメソッドに置換し、認可境界を SQL レベルで強制する。見つからない場合は 404 を返してリソースの存在有無も漏らさない。",
      "before": "val x = repo.findById(id)",
      "after": "val x = repo.findByIdAndTenantId(id, tenantId)",
      "rule_ref": "docs/coding-rules/backend/security.md#tenant-isolation"
    }
  ],
  "summary": { "critical": 1, "warning": 0, "minor": 0, "info": 0 }
}
```

2. 後方互換サマリ行 (1 行)

```
FINDINGS: 1C 0W 0M 0I
```

備考:
- **`why_problem` / `impact` / `fix` の 3 フィールドは必須**。1 つの自由記述 `body` に混ぜず、必ず分けて埋める（詳細は後述の「指摘の 3 分解」）
- **`why_problem`（なぜ問題か）が最重要**。ここが空・薄い・`summary` の言い換えだけ、の指摘は不採用扱いになりうる
- Before/After のコード片は `before` / `after` フィールドに分けて入れる
- `line` が特定できない file 全体への指摘は `line: null` でよい
- `rule_ref` は対応する coding rule doc がない場合 `null`
- `id` はこの出力内で一意ならよい (`CR-1`, `CR-2`, ...)
- 指摘 0 件の場合は `findings: []` と `summary: {...全 0...}` を出力すること (省略不可)
````

## Codex 側プロンプト

`codex exec` 起動時、プロンプト末尾に同じ要求を入れる。`--output-schema` が schema を強制するため、Codex 側は `findings` 配列の出力で自然に schema validation を通る。

Codex プロンプトテンプレ要点:

````
出力フォーマット (厳守):
- レビュー本文と最終行 `FINDINGS: XC YW ZM VI` は出さなくてよい (Codex の output は --output-schema で構造化される)
- JSON Schema (perspective / model / iteration / findings[] / summary) に従って response を組み立てること
- summary の数値は findings 配列を集計した結果と一致させること
- 各 finding の id は CDX-1, CDX-2 のように "CDX" prefix を付ける (Claude 側 CR-, SE- 等と被らないため)
- silent-failure では、依存データの欠落や解決失敗をデフォルト値に潰して、そのまま DB 書き込み・履歴作成・通知・外部 API 呼び出しなどの副作用へ進む `lossy-fallback-before-side-effect` を Critical / Warning 候補として確認すること
- 保存後の値から「本当の値」と「解決失敗」が区別できない場合は、既存の `implicit-fallback` より `lossy-fallback-before-side-effect` を優先して使うこと

各 finding の `model` は "codex-cli-default" 固定でよい (CODEX_MODEL が設定されていればその値)
```

## 集約処理 (Phase 6) の優先順

Phase 6 の `state.iterations[N]` への取り込みは以下の優先順で行う:

1. JSON ブロック (schema 準拠) が parse 成功 → JSON を正とする
2. JSON ブロック parse 失敗 OR 欠落 → `FINDINGS: XC YW ZM VI` 行から件数のみ取得し、本文は message body から regex で抽出 (旧 review-loop 互換)
3. どちらも欠落 → リトライ 1 回 → 再失敗で当該 reviewer は当 iteration スキップ (空配列扱い)

→ 既存の duo を壊さずに schema 強制を段階導入できる。

## category slug の語彙統一

dedup の精度を上げるため、`category` は以下の slug を優先して使う (新規追加可だが、既存があれば再利用):

- セキュリティ系: `tenant-isolation`, `idor`, `xss`, `sql-injection`, `auth-bypass`, `secret-leak`
- パフォーマンス系: `n-plus-one`, `unused-select`, `missing-index`, `cache-miss`, `full-scan`
- アーキ系: `layer-violation`, `responsibility-leak`, `side-effect-leak`, `circular-dep`
- サイレント障害系: `empty-catch`, `ignored-return`, `implicit-fallback`, `lossy-fallback-before-side-effect`, `implicit-default-before-write`, `unobservable-fallback`, `failure-collapsed-into-value`, `enum-exhaustion-miss`
- 規約系: `naming`, `magic-number`, `dry-violation`, `complexity`
- テスト系: `ac-uncovered`, `vague-assertion`, `edge-case-miss`, `flaky-time`
- 意味論系: `comment-impl-drift`, `snapshot-time-drift`, `cross-impl-inconsistency`

副作用前の lossy fallback を指摘する場合は、汎用的な `implicit-fallback` よりも `lossy-fallback-before-side-effect` を優先する。補助的に、DB write 直前の暗黙 default は `implicit-default-before-write`、呼び出し側が失敗を観測できない fallback は `unobservable-fallback`、複数の失敗理由が同じ値へ潰れる場合は `failure-collapsed-into-value` を使ってよい。

Codex 側にもプロンプトでこの語彙を例示し、独自 slug を生成しすぎないよう抑える。

## lossy-fallback-before-side-effect 検出フィクスチャ

以下のようなコードは Warning 以上で検出する。個別語彙 `operator snapshot` には依存せず、任意の依存データ解決で同じ構造を拾う。単独で参照できる fixture は [`lossy-fallback-before-side-effect-fixture.md`](lossy-fallback-before-side-effect-fixture.md) に置く。

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

期待 finding:

```json
{
  "severity": "Warning",
  "category": "lossy-fallback-before-side-effect",
  "summary": "snapshot 解決失敗が空文字に潰され、履歴 INSERT 後に原因を復元できない",
  "why_problem": "snapshotQuery.findBy(...) が null を返したとき、`?: \"\"` で空文字に潰したまま historyRepository.create へ進む。これにより「解決に成功して値が空だった」と「解決そのものに失敗した」が同じ空文字に畳み込まれ、保存される行から区別する手段が失われる。",
  "impact": "履歴テーブルに原因不明の空文字レコードが残り、後から解決失敗を検知・追跡・再実行できない。監査・障害調査の際に「本当に空だったのか、取得に失敗したのか」を判別できず、データ品質と運用調査の信頼性が損なわれる。",
  "fix": "fail-closed にして Err / exception で副作用を止めるか、unresolved 状態を明示的な型・カラム・sentinel として保存し、呼び出し側が失敗を観測できる形にする。"
}
```
