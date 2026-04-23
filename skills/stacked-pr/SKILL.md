---
name: stacked-pr
license: MIT
description: >-
  大きな変更を依存チェーン状の複数PR（Stacked PR）として積み、各PRを小さく保つ運用を支援するスキル。
  ブランチ構成・base指定・親PRマージ時の rebase 手順・親PR変更時の伝播手順・PRレビュー順の提示まで含む。
  「Stacked PR」「stacked」「PRを積む」「依存するPR」「PRチェーン」「親PR」「PR train」などの発言で必ず使うこと。
  feature-flag-strategy や kouunryuusui の E&C 分割で複数PRが発生した際の、実運用フローを提供する。
aliases:
  - stack
  - pr-train
---

# stacked-pr

**各PRを小さく保つために、依存チェーン状の複数PRとして積む** Stacked PR 運用スキル。

## このスキルが解く問題

- `feature-flag-strategy` や `kouunryuusui` の E&C で5〜6PRに分割したが、**順に作って順にマージする運用**が明文化されていない
- 親PRがレビュー中に、子PRを先に作りたい → ブランチ構成と base 指定が混乱する
- 親PRがマージされた → 子PRの base を main に切り替える手順が属人化する
- 親PRにレビュー指摘で修正 → 子PRへの反映が漏れる
- GitHub のPRレビュー順がレビュアーに伝わらず、関係ないPRが先にレビューされる

---

## 核心原則

1. **各PRは「独立して意味がある」単位**: チェーンの途中PRだけマージされても既存コードは壊れない
2. **base は直前PRのブランチ、最終PRの base だけ main**: 「ベースが main 以外」の意味をチーム共通理解にする
3. **親PRがマージされたら、子PR全てを rebase する**: 自動化推奨。手動でも必ず実施
4. **親PRを force-push で更新したら、全ての子PRも rebase-push する**: 伝播の鉄則
5. **レビュー順はPR説明文で明示する**: 「このPRは #123 → #124 の次です」と書く

---

## ブランチ構成

### 命名規則

```
feature/{EPIC-ID}-1-add-flag         ← base: main
feature/{EPIC-ID}-2-be-impl           ← base: feature/{EPIC-ID}-1-add-flag
feature/{EPIC-ID}-3-fe-impl           ← base: feature/{EPIC-ID}-2-be-impl
feature/{EPIC-ID}-4-enable            ← base: feature/{EPIC-ID}-3-fe-impl
feature/{EPIC-ID}-5-remove-flag       ← base: feature/{EPIC-ID}-4-enable
```

`{EPIC-ID}-{N}-{short-name}` で**順序と内容**が一目で分かるようにする。

### base の指定

各PRの `base` は **1つ前のブランチ**。最終PRだけ `main`。

```
PR-1: base=main                                  ← 最初
PR-2: base=feature/{EPIC-ID}-1-add-flag          ← PR-1のブランチ
PR-3: base=feature/{EPIC-ID}-2-be-impl           ← PR-2のブランチ
...
```

GitHub は base 違いを認識するので、`gh pr create --base <branch>` で明示指定する。

---

## 基本ワークフロー（vanilla git）

### Step 1: 最初のPR（PR-1）を作る

```bash
git checkout main
git pull
git checkout -b feature/{EPIC-ID}-1-add-flag
# ... 実装 ...
git push -u origin feature/{EPIC-ID}-1-add-flag
gh pr create --base main --title "[{EPIC-ID}-1] Add feature flag" --body "..."
```

### Step 2: 次のPR（PR-2）を親ブランチから切る

**PR-1 のマージを待たない**。PR-1 がレビュー中でも PR-2 を作れる。

```bash
# PR-1 のブランチから分岐
git checkout feature/{EPIC-ID}-1-add-flag
git checkout -b feature/{EPIC-ID}-2-be-impl
# ... 実装 ...
git push -u origin feature/{EPIC-ID}-2-be-impl
gh pr create \
  --base feature/{EPIC-ID}-1-add-flag \
  --title "[{EPIC-ID}-2] BE impl behind flag" \
  --body "Stacked on #{PR-1番号}"
```

### Step 3: PR説明文にチェーン構造を明記

全PRの説明文の先頭に以下を貼る:

```markdown
## 📚 Stacked PRs

このPRは以下のチェーンの一部です。**レビュー順は番号通り**:

1. #{PR-1番号}: [EPIC-1] Add feature flag ← 先にマージ
2. #{PR-2番号}: [EPIC-2] BE impl behind flag ← **このPR**
3. #{PR-3番号}: [EPIC-3] FE impl behind flag ← 次
4. #{PR-4番号}: [EPIC-4] Enable flag
5. #{PR-5番号}: [EPIC-5] Remove flag

**base**: `feature/{EPIC-ID}-1-add-flag`（#{PR-1番号} のブランチ）
**マージ戦略**: squash merge。PR-1 がマージされたら本PR を rebase → main に切り替え
```

### Step 4: PR-1 がマージされた時

PR-1 が squash-merge されると、PR-2 の base ブランチが消える or 古くなる。PR-2 を main に付け替える必要がある。

```bash
# 最新の main を取得
git checkout main
git pull

# PR-2 のブランチに戻って rebase
git checkout feature/{EPIC-ID}-2-be-impl
git rebase --onto main feature/{EPIC-ID}-1-add-flag

# コンフリクトがあれば解消
git push --force-with-lease

# GitHub側で base を main に変更
gh pr edit {PR-2番号} --base main
```

その後、PR-3 も同じように **PR-2 のブランチ基準で rebase** する（まだ base が PR-2 のため）:

```bash
git checkout feature/{EPIC-ID}-3-fe-impl
git fetch origin
git rebase --onto origin/feature/{EPIC-ID}-2-be-impl feature/{EPIC-ID}-2-be-impl
git push --force-with-lease
```

### Step 5: 親PRにレビュー指摘で修正が入った時

PR-1 を force-push で更新したら、**PR-2 以降を全て rebase する**。

```bash
# PR-1 を更新した前提
git checkout feature/{EPIC-ID}-2-be-impl
git rebase feature/{EPIC-ID}-1-add-flag
git push --force-with-lease

git checkout feature/{EPIC-ID}-3-fe-impl
git rebase feature/{EPIC-ID}-2-be-impl
git push --force-with-lease

# 以下、全ての子PRで繰り返し
```

順番を間違えると、下位ブランチに古いコミットが混入する。**上から順**に rebase する。

---

## ツール活用

### Option A: vanilla git（最小依存）

上記のフロー。手動だが追加ツール不要。小規模チーム向け。

### Option B: Graphite（`gt`）

Stacked PR 専用CLI。自動化が強力。

```bash
# インストール後
gt init  # リポジトリ初期化

# スタック作成
gt create -m "Add feature flag"         # 現ブランチから新ブランチ作成
gt create -m "BE impl behind flag"      # さらに上に積む
gt create -m "FE impl behind flag"

# スタックの状態確認
gt log

# スタック全体をpush
gt submit

# 親PRがマージされた後、スタック全体を自動 restack
gt sync
```

**利点**: rebase の伝播が自動。スタック構造を可視化してくれる。
**欠点**: 有料プラン（個人無料枠あり）。学習コスト。

### Option C: Spr（Stacked PR、Google由来OSS）

```bash
spr diff      # 各コミットを個別PRにする
spr update    # スタック全体を更新
```

**利点**: 1コミット=1PR の考え方。無料OSS。
**欠点**: GitHubの通常フローと若干異なる（コミットがPRの単位）。

### Option D: `gh` CLI の拡張

```bash
# 子PRの base を更新（親がマージされたら）
gh pr edit {子PR番号} --base main

# スタック全体のPR番号を取得
gh pr list --author @me --search "head:feature/{EPIC-ID}-" --json number,headRefName
```

---

## kouunryuusui との統合

`kouunryuusui` の E4（チケット実行ループ）は Native Team で並列実行する設計。
**依存関係がある E&C チェーンは Stacked PR で実装する**:

```
E4（Team Lead） — チケット実行オーケストレーション
├─ Worker-1: feature/{EPIC-ID}-1 (base: main)           ← DB Expand
│   └─ DONE awaiting_approval → Team Lead が一括push承認
├─ Worker-2: feature/{EPIC-ID}-2 (base: {EPIC-ID}-1)    ← App Expand
│   └─ Worker-1 完了後に起動、Stacked PR を作成
├─ Worker-3: feature/{EPIC-ID}-3 (base: {EPIC-ID}-2)    ← Migrate
└─ Worker-4以降...
```

### ワーカーエージェントへの指示追加

Team Lead がワーカーを起動する際、本スキルのルールを含める:

```
あなたは Stacked PR の {N} 本目を担当します。

- ベースブランチ: feature/{EPIC-ID}-{N-1}-{short}
- あなたのブランチ: feature/{EPIC-ID}-{N}-{short}
- PR作成時の --base: feature/{EPIC-ID}-{N-1}-{short}
- PR説明文の先頭にチェーン構造（全PR番号とレビュー順）を貼る
- 親PR {前のPR番号} が更新されたら、rebase して force-with-lease push する
```

---

## アンチパターン

### ❌ NG: 全PRの base を main にする

```
PR-1: base=main, head=feature/xxx-1
PR-2: base=main, head=feature/xxx-2  ← NG
```
**問題**: PR-2 の diff に PR-1 の変更が含まれて、差分が2倍に膨らむ。レビュー困難。

**対策**: 必ず1つ前のブランチを base にする。

### ❌ NG: 親PRを rebase せずに子PRを作る

親PRが古い main から分岐したまま、子PRをその上に積む。**main に最新の変更があっても取り込めない**。

**対策**: 親PR作成時点で `git pull --rebase origin main` で最新化してから子PRを分岐する。

### ❌ NG: 親PRが force-push されても子PRを放置

親PR-1 を force-push → 子PR-2 は古い親を指したまま。マージ時にコンフリクト地獄。

**対策**: 親PR force-push → **即座に全ての子PRを rebase & force-with-lease push**。手動で忘れるなら Graphite を導入。

### ❌ NG: レビュー順の明示なし

レビュアーが「どれから見ればいい？」と迷う → レビュー遅延。

**対策**: 全PRの説明文に📚 Stacked PRs セクションを貼る。Slack通知時にもレビュー順を明記。

### ❌ NG: 中間PRをマージし忘れる / スキップする

PR-1 → PR-2 → PR-3 で PR-2 が承認されないまま PR-3 だけマージしようとする → PR-2 の変更が PR-3 に混入している。

**対策**: **必ず上から順にマージ**。PR-2 がブロックされたら PR-3 の base を PR-1 に付け替えるか、PR-3 から PR-2 相当の変更を抜いて独立化する。

### ❌ NG: スタックの深さが6以上

5本くらいが実用上限。深すぎると管理コストが爆発する。

**対策**: 6本以上になりそうなら `vertical-slice` スキルで**並列可能な縦スライスに分割**する。

---

## チェックリスト

### PR作成時
- [ ] ブランチ名が `feature/{EPIC-ID}-{N}-{short}` 形式
- [ ] `--base` を1つ前のブランチに指定した
- [ ] PR説明文の先頭に Stacked PRs セクションを貼った
- [ ] レビュー順を番号で明示した

### 親PRマージ時
- [ ] 子PR全てを新しい base に rebase した
- [ ] GitHub側で `--base` を main に変更した（該当するPR）
- [ ] force-with-lease で push した（force は使わない）

### 親PR force-push時
- [ ] 子PR全てを上から順に rebase した
- [ ] 子PR全てで force-with-lease push した

### レビュー完了時
- [ ] 上から順にマージした
- [ ] マージ後、次のPRの base 変更を確認した

---

## 参考

- Graphite の Stacked PR ガイド — <https://graphite.dev/blog/stacked-prs>
- Git の `--onto` rebase — <https://git-scm.com/docs/git-rebase#Documentation/git-rebase.txt---ontoltnewbasegt>
- spr（Stacked PR tool） — <https://github.com/getcord/spr>
