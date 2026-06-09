# 観点内 LLM consolidate プロトコル (Phase 6-3.5)

機械 dedup (Phase 6-2: `path + line ±3 + category`) の後に、観点内で **同根論点** を LLM で 1 件に統合する。`parallel-review-codex` の Phase 3.5 を duo に移植したもの。

## 実行条件

以下の条件で実行する:

- **タイミング: 最終 iteration（ループ終了判定直前）または Phase 7 投稿直前のみ**  
  中間 iteration ではスキップ（中間で統合した findings はどうせ次 iteration で消える可能性が高く、agent 起動のコスト対効果が低い）
- ENV `DUO_DISABLE_CONSOLIDATE` が未設定

起動する agent は **観点ごとに個別判定**する:

- その観点の機械 dedup 後 findings が **2 件以上** → agent を起動
- findings が 0〜1 件の観点 → スキップ（統合する対象がない）

> **旧条件「総数 ≥ 5 かつ Critical/Warning ≥ 1」は廃止。** 総数 10 件でも各観点に 1 件ずつ散らばっていれば 9 agents 全員が空振りしていた。観点ごとのゲートにより、典型的な PR では 9 → 2〜3 agents に削減できる。

満たさない場合はスキップして Phase 6-4 (集計) に進む。

## 入力

```
state.iterations[N].mergedFindings (Phase 6-2 完了直後の配列)
```

各 finding は以下を持つ:

```json
{
  "source": "claude" | "codex",
  "perspective": "...",
  "severity": "...",
  "path": "...",
  "line": 42,
  "category": "...",
  "summary": "...",
  "why_problem": "なぜ問題か（機序）...",
  "impact": "なぜ修正が必要か（帰結）...",
  "fix": "どう直すか（方針）...",
  "confidence_dedup": "CONFIRMED" | "CLAUDE_ONLY" | "CODEX_VALID"
}
```

## 出力

```
state.iterations[N].consolidatedFindings
```

各 entry に以下を追加:

```json
{
  ... (元 finding のフィールド) ...,
  "consolidated_from": ["CR-1", "CDX-2", "CR-3"],
  "all_locations": [
    { "path": "src/foo/Bar.kt", "line": 42 },
    { "path": "src/foo/Bar.kt", "line": 88 },
    { "path": "src/foo/Baz.kt", "line": 12 }
  ],
  "severity_promoted": true | false
}
```

## 観点内 consolidate を行う Task agent への指示

観点ごとに 1 つの Task agent を `run_in_background: true` で起動する（実行条件を満たした観点のみ、最大 9 並列）。`model: haiku` 推奨（consolidate は同根パターンの識別タスクであり、深い推論は不要。semantic-consistency 観点で CONFIRMED が多数ある場合のみ sonnet を検討）。

### プロンプトテンプレ

````
あなたは review-loop-duo の Phase 6-3.5 consolidator です。

観点: {{PERSPECTIVE}}
iteration: {{N}}

以下は機械 dedup を通過した {{PERSPECTIVE}} 観点の findings リストです。同根論点を 1 件に統合してください。

入力 findings (JSON):
{{MERGED_FINDINGS_FOR_PERSPECTIVE}}

統合ルール:

1. 同 file 別 line で「同じ問題パターン」が複数ある → 1 件に統合し、`all_locations` に全 (path, line) を保持
2. 別 file 同パターン違反 (例: 複数 Controller で同じテナント検証漏れ) → 1 件に統合し、issue を一般化、`all_locations` に全箇所を保持
3. 機械 dedup を通過したが「別問題」と判断したものは絶対に統合しないこと
4. 統合後 severity は元 findings の最高値に昇格 (`severity_promoted: true` を立てる)
5. 件数の上限による絞り込みは禁止 (独立論点はすべて保持)
6. 観点跨ぎ統合は禁止 (本タスクは観点内のみ)
7. CONFIRMED finding (両 backend 検出) は単独でも統合せず残す。confidence 情報は保持

出力フォーマット (JSON):

```json
{
  "perspective": "{{PERSPECTIVE}}",
  "consolidated": [
    {
      "id": "CR-1+CDX-2",
      "severity": "Critical",
      "path": "src/foo/Bar.kt",
      "line": 42,
      "category": "tenant-isolation",
      "summary": "...",
      "why_problem": "...一般化された機序...",
      "impact": "...一般化された帰結...",
      "fix": "...方針...",
      "consolidated_from": ["CR-1", "CDX-2"],
      "all_locations": [
        { "path": "src/foo/Bar.kt", "line": 42 },
        { "path": "src/foo/Baz.kt", "line": 88 }
      ],
      "severity_promoted": true,
      "confidence_dedup": "CONFIRMED",
      "source_breakdown": { "claude": 1, "codex": 1 }
    }
  ]
}
```

備考:
- 統合せずそのまま残った finding も `consolidated_from: ["<元id>"]`、`all_locations: [元 path/line]` で出力すること
- `why_problem` / `impact` / `fix` は統合された場合のみ一般化、単独残しなら元のまま。統合時も 3 フィールドの分離（機序 / 帰結 / 方針）は維持し、1 つに混ぜないこと
````

## merge 後の処理

9 観点分の結果を結合して `state.iterations[N].consolidatedFindings` に書き出す。集計 (Phase 6-4) はこの結果を使う。

## consolidate の効果 (期待値)

- ノイズ削減: 同 file 別 line / 別 file 同パターンが 1 件化されることで、レビュアー (人間) が見るべき真の論点数が 30〜50% 程度減る
- 重大度の正確化: severity 不一致を最高値に統一することで「Minor だと思って見落とす」リスクを抑える
- inline 投稿時の重複削減: Phase 7 で post する件数が直接減る

## 失敗時の挙動

- Task agent 1 つが JSON 出力に失敗 → そのまま機械 dedup 後の findings を consolidated として扱う (= consolidate スキップ)
- 4 観点以上で失敗 → ユーザに「consolidate 全体失敗、Phase 6-2 結果で続行」を提示

`state.iterations[N].consolidate.status` に `success` / `partial` / `skipped` / `failed` を記録する。
