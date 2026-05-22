# Finding 出力フォーマット規約 (review-loop-duo v2)

Claude 側 7 Agent と Codex 側 1 プロセスは、両方とも `references/schemas/finding.schema.json` に準拠した JSON で出力する。後方互換のため `FINDINGS: XC YW ZM VI` 行も併存出力する。

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
      "body": "...日本語の本体...",
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
- `body` フィールドに本文を全部入れる。Before/After は `before` / `after` フィールドに分けて入れる
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
- サイレント障害系: `empty-catch`, `ignored-return`, `implicit-fallback`, `enum-exhaustion-miss`
- 規約系: `naming`, `magic-number`, `dry-violation`, `complexity`
- テスト系: `ac-uncovered`, `vague-assertion`, `edge-case-miss`, `flaky-time`
- 意味論系: `comment-impl-drift`, `snapshot-time-drift`, `cross-impl-inconsistency`

Codex 側にもプロンプトでこの語彙を例示し、独自 slug を生成しすぎないよう抑える。
