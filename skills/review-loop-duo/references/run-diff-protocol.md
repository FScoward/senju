# diff-runs プロトコル (Phase 6.6)

duo を **同じ PR / ブランチで複数回 run** したとき、前回 run の最終結果と今回 run の結果を比較して `new` / `carryover` / `fixed` を判定する。`parallel-review-codex` の Phase 3.7 を duo に移植したもの。

## 用途

- ループ自動修正で「直したはずなのに再発した」を即座に検知する
- 何度 review-loop-duo を回しても消えない指摘 (手動対応が必要) を可視化する
- 観点プロンプトの弱点 (carryover が多い観点) を計測する

## 実行条件

- iteration が完了した直後 (Phase 6-4 集計後、Phase 7 投稿前)
- 同じ PR 番号 OR 同じブランチで過去の run state が `.omc/review-loop-duo/runs/` に存在する

## state 配置

```
.omc/review-loop-duo/
├── current-state.json                          # 現在 run の状態 (既存)
├── runs/
│   ├── 2026-05-22-1430-pr3122-iter1.json       # run 1 iter 1 終了時
│   ├── 2026-05-22-1430-pr3122-iter2.json       # run 1 iter 2 終了時
│   ├── 2026-05-22-1620-pr3122-iter1.json       # run 2 iter 1 終了時
│   └── ...
└── latest-by-pr/
    └── pr3122.json -> ../runs/2026-05-22-1620-pr3122-iter2.json
```

各 run state には `consolidatedFindings` 配列を含める。古い state は 30 日で `tar.gz` 化 (本 PR 対象外、後続で実装)。

## diff 判定アルゴリズム

前回 run の `consolidatedFindings` を `prev`、今回を `curr` とする。マッチング key:

```
key = (path, category, line_bucket)
line_bucket = floor(line / 10)  # ±10 行のゆらぎを許容
```

各 finding を以下に分類:

| 分類 | 条件 | 意味 |
|---|---|---|
| `new` | `curr` に存在、`prev` に key 一致なし | 新規発生 (今回の修正で副作用が出た or 前回見落とし) |
| `carryover` | `curr` にも `prev` にも key 一致あり | 継続中。**手動対応必要 OR 修正失敗** |
| `fixed` | `prev` には存在、`curr` に key 一致なし | 修正で解消 (or LLM 確率的取りこぼし) |

`all_locations` が複数ある consolidated finding は、locations のいずれかが一致すれば match 扱い。

## 出力

`state.iterations[N].diffRuns`:

```json
{
  "previous_run_state": "runs/2026-05-22-1620-pr3122-iter2.json",
  "summary": {
    "new": 2,
    "carryover": 3,
    "fixed": 5
  },
  "findings_diff": [
    {
      "id": "SE-1+CDX-3",
      "diff_status": "carryover",
      "first_seen_at_run": "runs/2026-05-22-1430-pr3122-iter1.json",
      "carryover_count": 3
    },
    {
      "id": "PF-2",
      "diff_status": "new",
      "first_seen_at_run": "current"
    },
    {
      "id": "CR-4",
      "diff_status": "fixed",
      "last_seen_at_run": "runs/2026-05-22-1620-pr3122-iter2.json"
    }
  ]
}
```

`carryover_count` は同一 finding が連続して観測された回数 (前回 run の値 +1)。3 回以上は「定着した carryover = ほぼ確実に自動修正不可」とみなしてループ判定で除外する。

## Phase 6 のループ判定への影響

既存の duo ループ判定 (Phase 6-5) に以下を追加する:

| 条件 | アクション |
|---|---|
| Critical/Warning 全件が `carryover_count >= 3` | 🔚 **収束** → Phase 10 (手動対応サマリー) |
| `new` カテゴリに Critical/Warning が含まれる | ⚠️ **副作用警告** → 修正を続行するが Phase 10 で前回 fix との関係を必ず報告 |
| `fixed` 件数 > 0 | ✅ 進捗あり → 通常通り次 iteration へ |

## Phase 10 レポートへの追加

```
## 🔁 連続 run の差分 (diff-runs)

前回 run: runs/2026-05-22-1620-pr3122-iter2.json

| 分類 | 件数 |
|---|---|
| 🆕 new (今回新規) | 2 |
| ♻️ carryover (継続) | 3 |
| ✅ fixed (解消) | 5 |

### 🆕 今回新規発生した Critical/Warning
- [Critical] src/foo/Cache.kt:88 (PF-2) - キャッシュ初期化漏れ
  → 前回 fix した SE-1 の副作用の可能性あり

### ♻️ 3 run 連続で carryover している指摘
- [Warning] src/foo/Util.kt:17 (SF-1) - 空 catch
  → 自動修正で解消できず。手動対応推奨
```

## state 保存タイミング

各 iteration 終了時 (Phase 8 後) に `current-state.json` のスナップショットを `runs/` 配下に書き出す。ファイル名形式:

```
YYYY-MM-DD-HHMM-pr{PR_NUMBER}-iter{N}.json
```

PR なしモードでは `pr{PR_NUMBER}` を `branch-{slug}` に置換 (例: `branch-feature_review_loop_duo_v2`)。

## 失敗時の挙動

- 前回 run state が存在しない (初回 run) → Phase 6.6 全体をスキップ。`state.iterations[N].diffRuns = null` を記録
- 前回 run state の JSON parse 失敗 → ログに warning を出して Phase 6.6 スキップ (今回 run は通常通り続行)
- 書き出し先 ディスクフル → warning ログのみ。ループは止めない

## 将来拡張 (本 PR 対象外)

- 30 日経過した run state を `tar.gz` 化
- `events.jsonl` に diff-runs サマリも append
- 観点別 carryover 率の集計 (= 観点プロンプト改善の入力)
