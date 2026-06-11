# improvement-loop.md — review-loop-duo 継続的改善ループ

## 目的と設計思想

`review-loop-duo` を**継続的に改善する**ための仕組み。
レビュースキル自体（SKILL.md / references）を恒久的に改訂するシグナルを蓄積し、
同じ問題が繰り返し現れたとき「毎回 memory.md に手当てする」のではなく「SKILL.md を直す」に移行する。

### 置き場の非対称（重要）

| 種別 | 置き場 | commit |
|---|---|---|
| Improvement Signals ログ | `~/.claude/skills-memory/review-loop-duo/memory.md` | **しない**（per-machine） |
| SKILL.md / references 改訂案 | **画面表示のみ**（reflection 出力） | 人間が承認後に手動 commit |
| 確定した改訂 | `skills/review-loop-duo/SKILL.md` / `references/` | する（repo） |

reflection は「読むだけ + 提案表示 + last_reflected 更新（memory.md のみ）」。
repo ファイルを自動書き換えしない。

---

## 3 層 trigger

| 層 | タイミング | 内容 |
|---|---|---|
| **蓄積（自動）** | Phase 10・毎 run | 今回 run の示唆を `## Improvement Signals` へ signature 単位で upsert |
| **reflection（手動 + nudge）** | 別起動（reflect モード） | 集約カウンタを読み、閾値超を SKILL.md 編集候補に昇格して**画面表示**のみ |
| **適用（人間承認）** | 人間 | 提案を見て SKILL.md / references を編集 → `./scripts/check-frontmatter.sh` |

---

## 定数（ここで一元管理）

```
PROMOTE_THRESHOLD = 3   # この回数（別PR横断）再発 → promoted に昇格
NUDGE_THRESHOLD   = 3   # 未 reflect なシグナルがこの数を超えたら nudge を出す
```

**PROMOTE_THRESHOLD = 3 にした根拠（2026-06-11 実データ検証）**:
memory.md の Execution Log 17件を signature 単位で数えると、観測された最大再発は 3〜4 回
（worktree/PR-head 旧コード偽陽性=3、権限スコープ非対称=4、@ExposedTransactional tx 境界=3、Codex blocked=2）。
5 にすると昇格する signature がゼロになり Execution Log と同じ orphan を再発させる。
3 なら初回 reflection で複数 signature が昇格しループが実際に出力を出すことを確認できる。
**この定数を 5 以上に上げると feature が沈黙する**。変更する場合はこの根拠も一緒に更新すること。

---

## dedupe key vs diff-runs key（混同禁止）

| | diff-runs key（Phase 6.6） | Improvement Signals key |
|---|---|---|
| 用途 | **同じ PR** を複数 run したとき new/carryover/fixed を判定 | **別 PR 横断**で同根問題の再発をカウント |
| key 構成 | `(path, category, line_bucket)` | `<category-slug>:<症状署名>`（path/line 含まない） |
| path/line の安定性 | 同 PR 内で安定 | PR が変わると常に変わる → **含めると永遠に一致しない** |

**Improvement Signals の signature に path/line を含めると再発カウントが回らない**。
signature は Calibration Note の見出し相当の粒度（症状の種類）で設計する。

例：
- ✅ `mechanism:codex-blocked-or-oversized-output`
- ✅ `lens:permission-scope-asymmetry`
- ❌ `mechanism:codex-blocked:EPController.kt:45`（path を含む → 毎回別 signature になる）

---

## Improvement Signals スキーマ

memory.md の `## Execution Log` セクションの**下**に新設する。

```markdown
## Improvement Signals
<!-- dedupe key = category:signature（別PR横断で安定する識別子）diff-runs の (path,category,line_bucket) とは別物 -->
<!-- last_reflected: (未設定) -->

### <category>:<signature>
- **category**: mechanism | lens
- **count**: N
- **first_seen**: #<PR番号> (<YYYY-MM-DD>)
- **last_seen**: #<PR番号> (<YYYY-MM-DD>)
- **signal**: 何を恒久化すべきか 1〜3 行
- **relates_to**: 関連する既存 Calibration / Divergence 見出しへの参照
- **proposal_target**: mechanism は具体ファイル、lens はポインタのみ
- **status**: accumulating | promoted | applied
```

### category 別 proposal_target の書き方

- **mechanism**: 具体的な編集候補ファイルと箇所を書く
  - 例: `SKILL.md Phase 4-B エラーハンドリング表 / references/codex-invocation.md`
- **lens**: ポインタのみ。自動編集しない
  - 例: `→ ~/.claude/review-rules/backend.md（@ExposedTransactional セクション）`
  - 例: `→ knowledge-loop（権限スコープパターン）`

---

## Phase 10 upsert 手順（毎 run 自動）

### 1. 今回 run から示唆を抽出する

以下の観点で今回 run を振り返り、「次回以降にも同じ手当てが必要だった場合に SKILL.md を直すべき」シグナルを抽出する：

**mechanism カテゴリ（スキル機構の問題）**:
- Codex が blocked / タイムアウト / 出力過大になった
- Phase 4-B の手順が不明確で迷った
- diff-runs の比較で想定外の挙動があった
- memory.md の読み書き手順で問題が起きた

**lens カテゴリ（レビュー観点の穴）**:
- 同根の観点を今回も手動で memory.md に追加した
- Calibration Notes / Codex Divergence Patterns に「また同じパターンが出た」と気づいた
- Claude と Codex の重大度が割れた観点で、判定ルールが明文化されていなかった

示唆がなければ upsert をスキップする（Phase 10 の負担を最小にする）。

### 2. `## Improvement Signals` セクションを upsert する

`~/.claude/skills-memory/review-loop-duo/memory.md` を Read し、`## Improvement Signals` が存在しなければセクションを `## Execution Log` の下に新設する。

各示唆について:
```
signature が既存エントリに一致する？
  YES → count += 1、last_seen を更新（見出し名は変更しない）
  NO  → 新規エントリとして追記（status: accumulating）
```

**signature の一致判定**: 完全一致（大文字小文字区別なし）。
ドリフトを防ぐため、新規シグナルの signature は既存の Calibration Note 見出し（`## ` 下の `### ` 見出し）に対応する名前を優先する。

### 3. nudge 判定

Phase 10 の完了レポート末尾に以下の条件 **いずれか** が真なら1行 nudge を出す。
reflection 本体は起動しない（レビューフローを中断させない）。

```
条件A: last_reflected マーカー以降に新規 signature（### 見出し）が NUDGE_THRESHOLD 件以上存在する
条件B: last_reflected マーカーの前後を問わず、今回 run の upsert で count が
       PROMOTE_THRESHOLD に到達した signature が存在する
```

nudge 文面（1行）:
```
💡 Improvement Signals に未 reflect のシグナルが溜まっています。`review-loop-duo reflect` で改善候補を確認できます。
```

---

## reflection 手順（reflect モードで別起動）

`review-loop-duo reflect`（または「改善ログを見直して」「SKILL改善候補を出して」等）で起動する。
通常のレビューループは実行しない。

### Step 0: 初回 backfill（未初期化時のみ）

`## Improvement Signals` セクションが存在しない、または `last_reflected` マーカーが未設定の場合、
**一度だけ**以下の backfill を実行して count を実履歴から起こす。

既存 `## Execution Log` の全エントリ（`### YYYY-MM-DD — PR#N` 見出し単位）を読み、
以下の再発パターンを名寄せして `## Improvement Signals` に seed する:

| signature | 対象エントリ（参考） | 初期 count |
|---|---|---|
| `mechanism:codex-blocked-or-oversized-output` | #3805, #302, #3828 | 3 |
| `lens:permission-scope-asymmetry-idor` | #3802, #3821, #3840, #3842 | 4 |
| `lens:exposed-transactional-enqueue-tx-boundary` | #3817, #3823, #3830 | 3 |
| `mechanism:worktree-pr-head-stale-false-positive` | #3806, #3824, #3842 | 3 |

上記は 2026-06-11 時点の Execution Log 17件から手動名寄せした初期値。
backfill 後は `last_reflected` マーカーを最古エントリの日付に設定する（例: `2026-06-08`）。

### Step 1: 読み込み

1. `~/.claude/skills-memory/review-loop-duo/memory.md` を Read
2. `## Improvement Signals` セクションの全エントリを一覧化
3. `last_reflected` マーカーの位置を記録
4. マーカー以降の新規エントリ数 と count が PROMOTE_THRESHOLD に到達しているエントリ数を集計

### Step 2: 昇格判定と提案生成

`count >= PROMOTE_THRESHOLD` かつ `status: accumulating` のエントリを promotion 候補とする。

**mechanism カテゴリの場合（具体的編集候補）**:
```
### 🔧 [PROMOTE 候補] <signature>
- count: N（別 PR N 件で再発）
- signal: <signal の内容>
- 編集候補: <proposal_target>
- 提案方針:
    BEFORE: （現在の SKILL.md / references の記述）
    AFTER:  （追加・変更すべき内容の概要）
```

**lens カテゴリの場合（ポインタのみ）**:
```
### 👁 [PROMOTE 候補] <signature>
- count: N（別 PR N 件で再発）
- signal: <signal の内容>
- ポインタ: <proposal_target>
  → 上記ファイルへの追記・改訂を検討してください（自動編集しません）
- refine-ticket 注入候補（任意）:
  チケット精査フェーズで事前に防げるパターンと判断した場合、以下を提案する。
  承認後に ~/.claude/skills-memory/refine-ticket/memory.md の
  ## Recurring Review Findings セクションに追記してください:
    ### <domain>:<pattern-slug>
    - domain: <認証|権限|通知|課金|etc.>
    - ac_hint: <前向きチェック観点。例: 「参照/更新エンドポイントの権限が対称か AC に明記する」>
    - source_signal: <この signature>
    - count: <count値>
```

### Step 3: 画面出力

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Improvement Signals — reflection レポート
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PROMOTE 候補（count >= PROMOTE_THRESHOLD）

<Step 2 の出力>

## 蓄積中（count < PROMOTE_THRESHOLD）

- <signature>: count=N / last_seen=<PR番号>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
適用する場合は SKILL.md / references を手動で編集し、
./scripts/check-frontmatter.sh を実行してください。
mechanism 候補を適用したら status を applied に更新してください。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 4: last_reflected マーカー更新

提案表示後、memory.md の `last_reflected` マーカーを現在の最新 PR 番号と日付に更新する。
**これが reflection が memory.md に書く唯一の変更**。repo ファイルは一切書き換えない。

---

## 適用ステップ（人間が実施）

1. reflection レポートの PROMOTE 候補を確認
2. mechanism 候補: `skills/review-loop-duo/SKILL.md` または `references/` を編集
3. lens 候補: ポインタ先（`~/.claude/review-rules/`、knowledge-loop 等）を検討
4. `./scripts/check-frontmatter.sh` を実行 → `0 error(s)` を確認
5. memory.md の該当エントリの `status` を `applied` に更新
6. `git add` して commit

---

## signature 命名規約

```
<category>:<kebab-case-症状名>
```

- category: `mechanism`（スキル機構）または `lens`（レビュー観点）
- kebab-case-症状名: Calibration Note 見出しと対応する名前を優先
- path / line / PR 番号 を含めない（別 PR 横断で一致しなくなる）
- 同根の事象は同じ signature に集約する（Codex blocked / タイムアウト / 出力過大 = 1 signature）
