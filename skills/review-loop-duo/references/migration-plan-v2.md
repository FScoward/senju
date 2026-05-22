# review-loop-duo v2 — 取り込み計画

`parallel-review-codex` から精度向上に効く要素を、ループ・自動修正という duo の強みを壊さずに段階的に取り込むための設計メモ。

## 取り込みの背景

`parallel-review-codex` と `review-loop-duo` は同じ「Claude + Codex の ensemble」を志向するが、以下の構造差で検出精度に差が出る:

1. **Codex の使い方**: duo は 1 本に 8 観点詰め込み / parallel-review-codex は観点ごとに独立起動
2. **出力構造**: duo は `FINDINGS:` 行パース / parallel-review-codex は JSON schema 強制
3. **dedup**: duo はヒューリスティック / parallel-review-codex は機械 dedup + LLM consolidate
4. **連続 run**: duo は iteration 内のみ / parallel-review-codex は run 間 diff (`new`/`carryover`/`fixed`)

v2 では duo のループ・自動修正・特例 (semantic-consistency 片側保護) を保持しつつ、上記 1〜4 を段階的に解消する。

## 段階定義

### 段階 1A: Codex 呼び出しの刷新 + JSON schema 強制

精度に最も直結する基盤改修。

- `codex review` / `codex exec` の使い分けをやめ、`codex exec` に統一
- `--output-schema` で JSON schema 出力を強制 (`references/schemas/finding.schema.json`)
- `-C "$PWD"` / `--skip-git-repo-check` で worktree 安全性を確保
- `CODEX_MODEL` は未設定推奨 (ChatGPT account の `-m gpt-5` 罠を回避)
- Claude 側 reviewer も同じ JSON schema で出力させる (FINDINGS 行は後方互換で残す)

詳細: [`codex-invocation.md`](codex-invocation.md) / [`finding-output-format.md`](finding-output-format.md)

### 段階 1B: LLM consolidate + diff-runs

ノイズ削減と連続 run の改善追跡。

- Phase 6-3.5 として観点内 LLM consolidate を追加 (同 file 別 line / 別 file 同パターンを統合)
- Phase 6.6 として diff-runs を追加 (前回 run と比較して `new`/`carryover`/`fixed` を出す)
- Phase 10 レポートに consolidate 統計 + diff-runs サマリを追加

詳細: [`consolidate-protocol.md`](consolidate-protocol.md) / [`run-diff-protocol.md`](run-diff-protocol.md)

### 段階 2 (本 PR 対象外): 観点 × backend マトリクス化

Codex を 7 本並列起動して観点内で公平比較できる構造へ。段階 1A で `codex exec` 統一済みなら envsubst で観点プロンプトを差し替えるだけで済む。

### 段階 3 (本 PR 対象外): 周辺基盤

- `events.jsonl` への append-only 履歴蓄積 (token / agreement_rate 推移)
- `mark-postable` snap (hunk 端 N 行以内なら snap して投稿)
- `--working` モード (未コミット差分対象)

## 後方互換性

- 既存の `FINDINGS: XC YW ZM VI` 行も併存出力する (Phase 4 集約は JSON 優先 / FINDINGS フォールバック)
- `state.iterations[].fixes[]` の `confidence` フィールドは既存値を維持
- 既存の Phase 7 inline 投稿フォーマットは破壊しない

## 取り込まないと判断したもの

| 項目 | 理由 |
|---|---|
| **triage の責務分離** | duo の本質はループ自動修正。triage を切り出すと別スキルになる |
| **mark-postable snap** | inline 投稿の精度改善だが、duo は各 reviewer が hunk 判定済み。優先度低 |
| **大規模 PR 分割** | duo の対象は通常自分の作業 PR。100+ files PR は別途検討 |

## 用語

| 用語 | 意味 |
|---|---|
| `iteration` | duo の修正ループ 1 周 (Phase 4 → Phase 8) |
| `run` | duo の起動 1 回 (1 つ以上の iteration を含む) |
| `consolidate` | 観点内で同根論点を 1 件に統合する操作 |
| `diff-runs` | 前回 run の結果と比較して `new`/`carryover`/`fixed` を出す操作 |
