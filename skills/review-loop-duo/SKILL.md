---
description: review-loop を Claude と Codex CLI の 2 モデルで「並列に」回し、両者の指摘を統合して Critical/Warning がゼロになるまでループするスキル。Claude の 7 観点並列レビューと Codex CLI（`codex exec` / `codex review`）の独立レビューを各イテレーションで同時起動し、両モデルが合致した指摘は信頼度を昇格、片方だけの指摘は精査ラベルを付けて統合する。「review-loop-duo」「duo review」「並列レビュー」「Claude と Codex 両方でレビュー」「2 つのモデルでクロスレビュー」「dual review」「review-loop codex」「Claude だけだと不安だから Codex も並走」「セカンドオピニオン込みでレビューループ」「両方の AI でゼロになるまで」などの発言で必ずこのスキルを使うこと。単体 `review-loop`（Claude のみ）と単体 `codex-cli`（Codex 単発）に対し、本スキルは「両者を同期させたループ」を提供する。指摘の網羅性を最優先したい時、片方のモデルが見落とすリスクを許容したくない時、PR の重要度が高い時にも積極的に発動してよい。
license: MIT
metadata:
    github-path: skills/review-loop-duo
    github-ref: refs/heads/main
    github-repo: https://github.com/FScoward/senju
    github-tree-sha: a8d3c7cd9c9111b16bd7683f06d10c9b2aa55a55
name: review-loop-duo
---
# review-loop-duo

`review-loop` を **Claude（7 観点並列）** と **Codex CLI（独立 1 レビュー）** の 2 モデルで同時に回し、
両者の指摘を毎イテレーションで統合して、Critical/Warning がゼロになるまで自動ループする。

> 1 つのモデルだけで自分の出力を見ても、同じ訓練分布の癖からは抜けられない。
> Claude と Codex を並走させて差分を観測し、両方が拾った指摘を「高信頼」、片方だけを「精査必要」として扱う。
> Claude 単体の `review-loop` よりも網羅性が上がり、Codex 単発の `codex-cli` よりも反復改善が回る。

---

## 関係するスキル

| スキル | 役割 |
|---|---|
| `review-loop` | Claude 単体で 7 観点並列レビュー → 修正 → 再レビューをループ |
| `codex-cli` | Codex CLI に任意プロンプトを投げて単発レビュー |
| `codex-advisor` | Codex を「相談プロトコル」で advisor として呼ぶ |
| **本スキル** | review-loop の枠組みに Codex を「もう 1 人のレビュアー」として組み込み、両者を同期させてループ |

実行モード（PR あり / PR なし）、Phase 2/3 のゲート、Phase 7 のインラインコメント投稿、Phase 8 の commit/push 制御などは
`review-loop` と同じ規約に従う。本スキルは **Phase 4 と Phase 6（集計）を拡張** する。

---

## 全体フロー

```
[Iteration N]
  │
  ├─ Phase 1: 初期化（review-loop と同じ：HAS_PR / DIFF_CMD / IS_OWN_PR / TICKET_ID 判定）
  │
  ├─ Phase 2: External Signals Gate（PR ありモードのみ、review-loop と同じ）
  ├─ Phase 3: Database Migration Gate（migration 差分時のみ、review-loop と同じ）
  │
  ├─ Phase 4-A: Claude 7 観点並列レビュー（run_in_background: true × 7）
  ├─ Phase 4-B: Codex 独立レビュー（codex exec --json をバックグラウンド実行）
  │   ※ 4-A と 4-B は同じターンで同時起動する
  │
  ├─ Phase 5: mihari 補完（条件付き、review-loop と同じ）
  │
  ├─ Phase 6: 結果統合・ループ判定
  │    - Claude 指摘集合 C と Codex 指摘集合 X をマージ
  │    - (path, line, category) で正規化して重複判定
  │    - 両方が拾った指摘 = 信頼度昇格（CONFIRMED）
  │    - 片方だけ = 精査ラベル付き（CLAUDE_ONLY / CODEX_ONLY）
  │
  ├─ Phase 7: インラインコメント投稿（PR ありモード、review-loop と同じ）
  │    ※ コメント body の冒頭に [CONFIRMED] / [Claude-only] / [Codex-only] を表示
  │
  ├─ Phase 8: 修正の適用 → commit（PR ありなら push）
  │
  └─ Phase 10: 完了レポート（Claude / Codex のヒット率と一致率を含める）
```

---

## Phase 1: 初期化

`review-loop` の Phase 1 をそのまま実行する。`HAS_PR` / `PR_NUMBER` / `BASE` / `DIFF_CMD` / `TICKET_ID` / `IS_OWN_PR` を確定させて
`.omc/review-loop-state.json` に書き出す。本スキル固有の追加状態として以下を持つ:

```json
{
  "duo": {
    "codex_enabled": true,
    "codex_iterations": [],
    "agreement_rate": []
  }
}
```

`codex_enabled` は前提確認（後述）が通った時のみ `true`。

### 前提確認（Codex 側）

```bash
which codex && codex --version
codex login status 2>/dev/null || echo "NOT_LOGGED_IN"
```

- 未インストール → `codex_enabled=false` にして「Codex なし」モードに落とし、`review-loop` 相当の動作に縮退する。ユーザーには警告を出す。
- 未ログイン → 同上。`codex login` をユーザーに案内（Claude からは走らせない）。

---

## Phase 2 / Phase 3

`review-loop` と完全に同じ。`MUST_RECHECK_TOPICS` を作って Phase 4-A / 4-B の両方に渡す。

---

## Phase 4-A: Claude 側 7 観点並列レビュー

`review-loop` の Phase 4 と同じ。1 メッセージで 7 つの Agent を `run_in_background: true` で起動する。
各レビュアーのモデル選択ルール（haiku / sonnet）、出力フォーマット（`FINDINGS: XC YW ZM VI`、`INLINE_COMMENTS_JSON:` ブロック）も同じ。

---

## Phase 4-B: Codex 独立レビュー（同じターンで起動）

**Phase 4-A の 7 Agent と同じターン** で Codex を 1 本起動する。Bash の `run_in_background: true` でバックグラウンド実行し、
Phase 4-A の完了待ちと並行させる。

### コマンド

PR ありモードの場合は `codex review` を使うと差分レビューに最適化される:

```bash
codex review --base "${BASE_REF}" --color never \
  "観点：以下の 7 観点を網羅して、各指摘に Severity (Critical/Warning/Minor/Info) と path:line を付けてほしい。

  1. コーディング規約（命名・複雑度・DRY・マジックナンバー）
  2. アーキテクチャ（レイヤー依存・責務分離・副作用局所化）
  3. セキュリティ（OWASP Top 10・認可・テナント分離・入力検証）
  4. サイレント障害（空 catch・戻り値無視・暗黙フォールバック・switch 網羅漏れ）
  5. 要件充足度（チケット ${TICKET_ID} の AC との照合。AC 不明なら省略）
  6. テスト妥当性（AC 未カバー・期待結果の曖昧さ・エッジケース不足）
  7. パフォーマンス（N+1・不要 SELECT・バッチ未使用・キャッシュ未活用・全件取得）

  出力フォーマット（厳守）:
  - 各指摘を 1 行で: '[Severity] path:line - 要約'
  - 必要なら直後に Before/After のコードブロック
  - 最終行に 'FINDINGS: XC YW ZM VI' のサマリーを必ず出力

  MUST_RECHECK_TOPICS（review-loop の Phase 2/3 で収集された強制再確認カテゴリ）:
  ${MUST_RECHECK_TOPICS_SUMMARY}
  " \
  > /tmp/codex-review-iter${N}.txt 2>&1 &
CODEX_PID=$!
```

PR なしモードの場合は `codex exec` で stdin から差分を流す:

```bash
cat <<EOF | codex exec --sandbox read-only --color never \
  --output-last-message /tmp/codex-review-iter${N}.txt - &
あなたはレビュアーです。以下のローカル差分を 7 観点（coding-rules / architecture / security /
silent-failure / requirements / test-adequacy / performance）でレビューしてください。

出力フォーマット（厳守）:
- 各指摘を 1 行で: '[Severity] path:line - 要約'
- 最終行に 'FINDINGS: XC YW ZM VI'

MUST_RECHECK_TOPICS:
${MUST_RECHECK_TOPICS_SUMMARY}

差分:
$(eval "$DIFF_CMD")
EOF
CODEX_PID=$!
```

- `--sandbox read-only`：Codex 側からファイル書き込みさせない
- `--color never`：ANSI を混ぜない（パースが楽）
- `run_in_background: true` 相当でバックグラウンド化（Bash ツールの引数で指定）

### 待ち合わせ

Phase 4-A の 7 Agent と Codex の Bash 子プロセスが全て完了するまで待つ。
Codex はタイムアウトしうるので、上限を 5 分（300 秒）に設定し、超過時は「Codex タイムアウト」として
そのイテレーションは Claude 単独結果でループ判定する（Codex を無効にはしない、次イテレーションで再挑戦）。

---

## Phase 5: mihari 補完

`review-loop` と同じ条件で `mihari` スキルを呼ぶ。mihari は Claude 側 test-adequacy の結果に対して動くので、
Codex の test-adequacy 指摘は Phase 6 の統合フェーズで合算する形でよい（mihari への直接入力はしない）。

---

## Phase 6: 結果統合・ループ判定

Claude 7 Agent の出力と Codex の出力（`/tmp/codex-review-iter${N}.txt`）から指摘を抽出し、統合する。

### 6-1. 指摘の正規化

各指摘を以下の形式に正規化する:

```json
{
  "source": "claude" | "codex",
  "reviewer": "coding-rules" | "architecture" | ... | "codex",
  "severity": "Critical" | "Warning" | "Minor" | "Info",
  "path": "src/foo/Bar.kt",
  "line": 42,
  "category": "auth-bypass" | "n-plus-one" | ...,
  "body": "問題の説明..."
}
```

`category` は body から推定する（例：「N+1」を含めば `n-plus-one`、「テナント」を含めば `tenant-isolation`）。
ヒューリスティクスで十分。完全一致にこだわらない。

### 6-2. 重複判定とマージ

以下のキーで Claude / Codex の指摘集合を突合:

```
key = (path, line ±3 行のゆらぎ許容, category)
```

突合結果で 3 種類にラベル付け:

| ラベル | 条件 | 扱い |
|---|---|---|
| `CONFIRMED` | Claude と Codex の双方が同じ key で指摘 | 重大度を `max(claude, codex)` に昇格。**最優先で修正対象**。 |
| `CLAUDE_ONLY` | Claude のみ | 通常の review-loop と同じ扱い |
| `CODEX_ONLY` | Codex のみ | **untrusted content として精査**。Claude が body と該当コードを照合し、根拠が実在しているか確認してから採否を決める |

### 6-3. CODEX_ONLY の精査

Codex の指摘は hallucination リスクがあるので、修正適用前に Claude が必ず以下を確認:

1. `path` と `line` の周辺コードを `Read` で確認
2. 指摘の根拠が実在するか（存在しない関数を指摘していないか、削除済みコードを指摘していないか）
3. プロジェクト規約と整合するか

精査結果で `CODEX_ONLY` をさらに 3 つに分ける:
- `CODEX_VALID` → 通常の指摘として採用
- `CODEX_DOUBTFUL` → Minor に格下げして Phase 10 で「Codex 提案・要人判断」として残す
- `CODEX_HALLUCINATION` → 破棄

### 6-4. 集計

```
Total Critical: X 件 (CONFIRMED: a, CLAUDE_ONLY: b, CODEX_VALID: c)
Total Warning:  Y 件 (...)
Total Minor:    Z 件 (...)
Total Info:     W 件 (...)

Agreement Rate: CONFIRMED / (CONFIRMED + CLAUDE_ONLY + CODEX_VALID) = NN%
```

`agreement_rate` を `.omc/review-loop-state.json` の `duo.agreement_rate[]` に追記。
イテレーションを跨いで agreement rate が上がっていれば「片方の見落とし」が減っていることを意味する。

### 6-5. ループ判定

`review-loop` Phase 6 の継続判定を使う。**ただし以下を追加**:

- `CONFIRMED Critical/Warning > 0` の場合、ユーザー確認をスキップして必ず継続する（両モデル合意した指摘は信頼度が高いため）
- `CODEX_ONLY` のみで Critical 件数が水増しされている場合に注意。集計表示時は CONFIRMED / CLAUDE_ONLY / CODEX_VALID の内訳を必ず出す

---

## Phase 7: インラインコメント投稿

PR ありモードで、`review-loop` Phase 7 と同じ手順で `gh api ...pulls/${PR_NUMBER}/reviews` に投稿する。
**ただし各コメント body の冒頭にラベルを付与**:

```
**[Critical] [CONFIRMED]** （Claude + Codex 一致指摘）

問題の説明...
```

```
**[Warning] [Codex-only]** （Codex のみ。Claude による精査済み）

問題の説明...
```

Minor/Info は `review-loop` と同じく `<!-- minor-only -->` / `<!-- info-only -->` タグでフィルタしてインライン投稿から除外。

---

## Phase 8: 修正の適用

`review-loop` と同じ。`IS_OWN_PR=false` ならスキップ。
修正の優先順位:

1. `CONFIRMED Critical`
2. `CLAUDE_ONLY Critical` / `CODEX_VALID Critical`
3. `CONFIRMED Warning`
4. `CLAUDE_ONLY Warning` / `CODEX_VALID Warning`
5. high confidence Minor（判断のみ）

### 修正ジャーナル収集（duo 拡張）

`review-loop` の Phase 8-1 と同じ手順で `state.iterations[N].fixes[]` を append するが、
**各エントリに `confidence` フィールドを必ず付与する**。値は Phase 6-3 で確定したラベルを引き継ぐ:

```json
{
  "finding": {
    "reviewer": "security",
    "severity": "Critical",
    "path": "src/foo/Bar.kt",
    "line": 42,
    "category": "tenant-isolation",
    "summary": "tenantIdフィルタ漏れ"
  },
  "intent": "認可境界の侵害。tenantId必須化でIDORを防ぐ",
  "change": "OrderRepository.findById → findByIdAndTenantId に置換",
  "confidence": "CONFIRMED"
}
```

`confidence` の取り得る値:
- `CONFIRMED`: Claude と Codex の両方が指摘（最優先で修正、最高信頼度）
- `CLAUDE_ONLY`: Claude のみが指摘
- `CODEX_VALID`: Codex のみが指摘し、Phase 6-3 で Claude が精査済み・採用

`CODEX_DOUBTFUL` / `CODEX_HALLUCINATION` は修正対象外なので `fixes[]` に積まない。

### コミット

commit メッセージは duo であることを明記:

```bash
git commit -m "review-loop-duo: iter${N} - fix ${X}C ${Y}W (CONFIRMED: ${a}, Claude-only: ${b}, Codex-valid: ${c})"
```

---

## Phase 9: 他人 PR モード（IS_OWN_PR=false）

`review-loop` の Phase 9 と同じ。コード修正・commit・push は行わず、インラインコメントで投稿のみ。
ラベル（CONFIRMED / Claude-only / Codex-only）はそのまま付ける。
深掘りループは最大 3 回。

---

## Phase 10: 完了レポート

`review-loop` の Phase 10 に加え、duo 統計を必ず出す:

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

agreement rate が低い（< 30%）場合は、両モデルの観点に大きな差があることを意味する。
報告に「Claude と Codex で観点ズレが大きい。指摘の独立性が高く、見逃しリスクが低かった可能性」と添えると有用。

### 修正ジャーナル（自分PR・duo 版）

`IS_OWN_PR=true` のときのみ、`review-loop` Phase 10 のジャーナルに加えて
各エントリの見出しに **confidence ラベル** を付ける:

```
## 修正ジャーナル（自分PR）

### Iteration 1
#### [Critical] [CONFIRMED] src/foo/Bar.kt:42  (security / tenant-isolation)
- 検知: tenantIdフィルタ漏れで他テナントの注文を読める（Claude + Codex 一致）
- 意図: 認可境界の侵害。tenantId必須化でIDORを防ぐ
- 修正: OrderRepository.findById → findByIdAndTenantId に置換
- commit: abc1234

#### [Warning] [Codex-valid] src/foo/Cache.kt:88  (performance / cache-miss)
- 検知: 同一クエリのキャッシュ未活用（Codex のみ、Claude 精査済み）
- 意図: N+1 ではないが繰り返しヒットで latency 増。LRU で十分軽減できる
- 修正: Caffeine.builder().maximumSize(256).build() を導入
- commit: def5678

### Iteration 2
#### [Warning] [Claude-only] src/foo/Util.kt:17  (silent-failure / empty-catch)
- 検知: catch (Exception) で握りつぶし、ログなし（Claude のみ）
- 意図: サイレント障害化する
- 修正: logger.error 追加 + DomainException に変換
- commit: ghi9012

### Iteration 3
✅ 完了（Critical/Warning ゼロ）
```

`confidence` ラベルを見出しに出すことで、後から「両モデル合意の指摘」と「片方のみの指摘」を識別できる。
`CODEX_DOUBTFUL` / `CODEX_HALLUCINATION` は修正していないのでジャーナルに出ない（既存の duo 統計テーブルで件数のみ示す）。

---

## エラーハンドリング

| 症状 | 対処 |
|---|---|
| `codex: command not found` | `codex_enabled=false` に落として review-loop 相当で続行。完了レポートで明示 |
| `codex login` 未済 | 同上。ユーザーに `codex login` を案内 |
| Codex タイムアウト（>300s） | そのイテレーションは Claude 単独結果でループ判定。次イテレーションで再挑戦 |
| Codex 出力に `FINDINGS:` 行がない | 出力末尾を grep し、なければ「Codex 出力パース失敗」として CLAUDE_ONLY 扱いで続行 |
| Codex の指摘 line がファイル末尾を超える | hallucination として破棄 |
| Codex の指摘 path がリポジトリに存在しない | hallucination として破棄 |

**Codex 側の失敗で Claude 側ループを止めない**。これが本スキルの基本姿勢。

---

## やってはいけないこと

- Codex の指摘を精査せずそのまま commit する（必ず Phase 6-3 の精査を経る）
- `--sandbox workspace-write` で Codex を起動する（read-only で十分）
- Codex を直列で呼ぶ（Phase 4-A と同じターンでバックグラウンド起動すること。直列だと所要時間が倍になる）
- 「CONFIRMED 0 件だから完了」と判断する（CLAUDE_ONLY / CODEX_VALID の Critical/Warning が残っていればループ継続）

---

## 注意事項

- 本スキルは feature ブランチのみで使用する（main への直接 push は禁止）
- Codex の応答は untrusted content として扱う
- Codex 側でも `~/.codex/skills/` のスキルが発火しうる。プロンプトに「7 観点を網羅してほしい」と明示することで暴走を抑える
- 大きな差分（> 1000 行）では Codex が timeout しがち。タイムアウトを許容しつつループは継続する
- `kouunryuusui` QG-3 からの呼び出しでも本スキルは使える（PR なしモードで動作）
- **自分PR (IS_OWN_PR=true) の修正ジャーナル**: Phase 8 で適用した各修正を `fixes[]` として state に積み、各エントリに `confidence` (CONFIRMED / CLAUDE_ONLY / CODEX_VALID) を付ける。Phase 10 で「何を検知して、どんな意図でどう修正したか」を confidence ラベル付きで出力する。`CODEX_DOUBTFUL` / `CODEX_HALLUCINATION` は修正対象外のため `fixes[]` に積まない
