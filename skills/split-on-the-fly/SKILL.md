---
name: split-on-the-fly
license: MIT
description: >-
  実装中または実装完了後に「このブランチ、大きすぎる」と気づいた時に、作業を止めずに安全にPRを分割する実地手順スキル。
  git log / cherry-pick / interactive rebase / worktree を使って、途中のブランチを複数の小さなPRに再編成する。
  「このPR大きすぎる」「途中で分けたい」「push前に分割したい」「実装したけど一度に出したくない」「split」「分割したい」「ブランチを分けたい」などの発言で必ず使うこと。
  pr-size-guard が「分割すべきか判定」するのに対し、本スキルは「判定後、実際にどう分割するか」の手順を提供する。事前分割（feature-flag-strategy / vertical-slice）が使えなかった時の最終手段。
aliases:
  - split
  - resplit
  - pr-split
---

# split-on-the-fly

**実装が進んだ or 終わったブランチが「大きすぎる」と気づいた時に、作業を壊さず複数の小さなPRに再編成する実地手順** スキル。

## このスキルが解く問題

- 実装に集中していたら気づけば +1000 行。push 直前に `pr-size-guard` で Red 判定
- 事前に `vertical-slice` で分けたつもりが、1スライスが膨らんだ
- レビュアーから「これ2つに分けてもらえる？」と言われた
- 「途中だけど先にマージしたい部分がある」
- 分割手順が分からず、結局大きなPRを出してしまう

---

## 核心原則

1. **作業を捨てない**: ブランチは残す。新しいブランチに切り出すだけで、元の作業は退避される
2. **コミット粒度が大きく影響する**: 細かくコミットしてあれば分割は簡単、1コミットに全部詰めていると大変
3. **テストが通る状態で分割する**: 分割後の各PRが**単独で動く**ことを確認する
4. **分割前に main からの rebase を済ませる**: 分割作業中に main との差が広がると混乱する
5. **破壊的操作の前にバックアップブランチを切る**: `git branch backup/{元ブランチ名}` を必ず作る

---

## 分割が必要か判定（入口）

以下のいずれかに該当したら本スキルを発動:

- [ ] `pr-size-guard` で Yellow / Red 判定
- [ ] `git log --oneline origin/main..HEAD` のコミット履歴を見て、**明らかに独立した塊**が2つ以上ある
- [ ] レビュアーから分割依頼があった
- [ ] 「この部分だけ先にマージしたい」と自分で感じた

**全て No** → 分割不要。そのままpush。

---

## 分割パターン選択

ブランチの状態に応じて、最適な分割方法を選ぶ:

| 現状 | 推奨パターン |
|------|------------|
| コミットが5個以上あり、境界が明確 | **パターンA: コミット境界で分ける** |
| コミットが2〜4個で、1コミット内に複数変更が混在 | **パターンB: ファイル単位で分ける** |
| 1コミットに全部入っている | **パターンC: 一度戻して作り直す** |
| 既に push 済み（PR作成済み）| **パターンD: stacked化してPRを作り直す** |

---

## パターンA: コミット境界で分ける（最多）

### 前提
- 複数コミットがある
- 各コミットが独立した意味を持つ
- 例:
  ```
  a1b2c3 tidy: rename getUser → fetchUser
  d4e5f6 add: UserRepository interface
  g7h8i9 add: UserRepositoryImpl with tests
  j0k1l2 feat: new user registration endpoint
  m3n4o5 fix: handle duplicate email
  ```

### 手順

```bash
# 1. バックアップ
git branch backup/feature-x-original

# 2. コミット履歴を確認
git log --oneline origin/main..HEAD

# 3. 分割方針を決める（例）
# PR-1: tidy と repository 関連 → tidy + infrastructure
# PR-2: endpoint 関連 → feature

# 4. PR-1 のブランチを作る
git checkout main
git checkout -b feature-x-part1
git cherry-pick a1b2c3 d4e5f6 g7h8i9

# テストが通ることを確認
npm test  # or equivalent

# push
git push -u origin feature-x-part1
gh pr create --base main --title "..." --body "..."

# 5. PR-2 のブランチを作る（stacked）
git checkout -b feature-x-part2
git cherry-pick j0k1l2 m3n4o5

# テスト
npm test

# push
git push -u origin feature-x-part2
gh pr create --base feature-x-part1 --title "..." --body "Stacked on #PR-1"

# 6. 元のブランチは消さずに残す（確認用）
# backup/feature-x-original も残す
```

### 注意
- PR-1 が単独で動くことを必ず確認（テストがPASSする）
- PR-2 は `stacked-pr` スキル参照で base を PR-1 に指定
- 元のブランチを消すのは PR-1, PR-2 が両方マージされた後

---

## パターンB: ファイル単位で分ける

### 前提
- 1コミット内に複数の独立変更が混在
- コミット境界では分けられない
- 例: 「feat: user registration」というコミットに rename, new module, API endpoint が全部入っている

### 手順

```bash
# 1. バックアップ
git branch backup/feature-x-original

# 2. 分割方針を決める（ファイル別）
git diff --name-only origin/main...HEAD
# → user_repository.kt, user_service.kt, user_controller.kt, user_test.kt, (rename系ファイル)...

# 3. PR-1 のブランチで、最初は空状態
git checkout main
git checkout -b feature-x-part1

# 4. 分割対象のファイルだけを checkout
git checkout backup/feature-x-original -- path/to/rename_file1.kt path/to/rename_file2.kt

# ファイルを staging から working tree に戻してパッチ化することも可能
git diff backup/feature-x-original -- path/to/file.kt > /tmp/part1.patch
git apply /tmp/part1.patch

# 5. コミット
git add .
git commit -m "tidy: rename related refactoring"

# テスト
npm test

# push
git push -u origin feature-x-part1

# 6. PR-2 でも同様に残りのファイルを切り出す
git checkout -b feature-x-part2
git checkout backup/feature-x-original -- path/to/new_file.kt path/to/other.kt
git add .
git commit -m "feat: user registration endpoint"
npm test
git push -u origin feature-x-part2
```

### ファイル単位で分けづらい場合

1ファイル内で「リファクタと機能追加」が混在している場合は、**ファイル内の一部の行だけ**を取り出す:

```bash
# git add -p で対話的に選択
git checkout main
git checkout -b feature-x-part1
git checkout backup/feature-x-original -- path/to/mixed_file.kt
# 全差分がワーキングツリーに入る

# 必要な部分だけ staging に入れる
git reset HEAD path/to/mixed_file.kt  # まず staging 解除
git add -p path/to/mixed_file.kt      # hunk 単位で選択

# staging に入れた分だけコミット
git commit -m "tidy: extract helper function"

# 残りを破棄
git checkout path/to/mixed_file.kt
```

---

## パターンC: 一度戻して作り直す（1コミット問題）

### 前提
- コミットが1つしかなく、変更が大きい
- コミット粒度を整え直したい

### 手順

```bash
# 1. バックアップ
git branch backup/feature-x-original

# 2. コミットをバラす（soft reset）
git reset --soft origin/main
# → 全変更がワーキングツリー + staging にある状態

# 3. staging を一旦クリア
git reset HEAD

# 4. ファイル単位 or hunk 単位で再コミット
git add -p path/to/tidying_file.kt
git commit -m "tidy: rename and extract"

git add path/to/new_feature.kt path/to/test.kt
git commit -m "feat: new feature"

git add path/to/docs.md
git commit -m "docs: update README"

# 5. この時点で3つのコミットができた
# 6. パターンAに戻って、コミット境界で分ける
```

### ⚠️ 注意
- `git reset --soft` は履歴を書き換える。既にpush済みなら使わない（パターンD参照）
- バックアップブランチは**絶対に**先に切ること

---

## パターンD: 既に push 済み（PR作成済み）

### 前提
- 既に `git push` 済み、PR が開いている
- 「これ分けて」とレビュアーから言われた

### 選択肢

**選択1: PRを閉じて再作成**（推奨、履歴がきれい）
```bash
# 既存PRを Draft に戻す or close
gh pr close {PR番号}

# バックアップ
git branch backup/feature-x-original

# パターンA/B/C で再分割
# 新しいPRを作成
```

**選択2: 既存ブランチはそのまま、先行PRだけ切り出す**（stacked化）
```bash
# 既存ブランチ: feature-x
# 先行PRとして切り出したい塊: tidy 系のコミット

# 新しいブランチを作って cherry-pick
git checkout main
git checkout -b feature-x-tidy
git cherry-pick {tidy commit 1} {tidy commit 2}
git push -u origin feature-x-tidy
gh pr create --base main --title "tidy: ..." --body "..."

# 元のブランチは feature-x-tidy が マージされた後に rebase
# feature-x の base を feature-x-tidy に変更
gh pr edit {元PR番号} --base feature-x-tidy
```

**選択3: force-push で既存ブランチを分割後の片側に置き換える**（最終手段）

元のPRが長期レビュー中でコメント履歴を残したい場合、元PRのブランチを**分割後の一方**で上書きし、もう一方は新PRにする。

```bash
# バックアップ
git branch backup/feature-x-original

# 元ブランチを、分割後の PR-1 相当に reset
git checkout feature-x
git reset --hard {PR-1相当の最新コミット}
git push --force-with-lease

# PR-2 相当は新ブランチで
git checkout main
git checkout -b feature-x-part2
git cherry-pick {PR-2相当のコミット}
git push -u origin feature-x-part2
gh pr create --base feature-x --title "part2" --body "..."
```

### ⚠️ 注意（force-push）
- **元PR のコミットハッシュが変わる** → レビュアーに事前連絡必須
- `--force-with-lease` を使う（単純 `--force` は他人の変更を消す危険）
- GitHub のコメントは残るが、コードへのリンクは切れる可能性がある

---

## ワーカースペースでの分割（worktree活用）

分割作業中に元のブランチを触りたくない時は、worktree で並行作業:

```bash
# 元のブランチから離れずに、分割用のディレクトリを作る
git worktree add ../split-workspace feature-x-part1-wip -b feature-x-part1-wip origin/main

# 別ディレクトリで作業
cd ../split-workspace
git cherry-pick {一部のコミット}
npm test
git push -u origin feature-x-part1-wip
gh pr create ...

# 元に戻る
cd -
# 元のブランチは無傷
```

作業が終わったら `git worktree remove ../split-workspace` で片付け。

---

## 分割後の検証

各PRで以下を確認:

### 各PRの独立性
- [ ] 単独で main に merge した時、ビルドが通る
- [ ] 単独で main に merge した時、テストが全PASS
- [ ] 単独で main に merge した時、既存機能を壊さない

### PR間の依存関係
- [ ] base の指定が正しい（stacked なら親PRを base に）
- [ ] 依存があるPRには、PR説明文に `Stacked on #{親PR}` と明記

### サイズ
- [ ] 各PRで `pr-size-guard` を実行し、Green / Yellow に収まる
- [ ] Red が残るなら、さらに分割

### コミット履歴
- [ ] 各PR内のコミットメッセージが意味を持つ
- [ ] `fixup!` / `WIP` / `wip` 系のコミットが残っていない

---

## コミュニケーション

分割したら、以下に連絡する:

### レビュアーへ
```markdown
@reviewer PRを分割しました:
- 元PR #{N}: Closed
- 新PR #{N1}: {タイトル}（base: main）
- 新PR #{N2}: {タイトル}（base: #{N1}）← stacked

上から順にレビューしていただけると助かります。
```

### チケット管理（Linear/Jira）
```
元チケット: ACのうち Slice-1 を切り出し、新チケット {NEW-ID} で対応
```

### Slack / チャット
force-push した場合は必ず通知（コメント履歴が切れる可能性があるため）。

---

## アンチパターン

### ❌ NG: バックアップなしで reset / force-push

失敗した時に戻れない。
**対策**: `git branch backup/{name}` を**必ず**先に切る。

### ❌ NG: 分割後のPRがビルドできない

「後で直す」と言って未完成のPRを出す。
**対策**: 各PRで **ビルド + テスト** を必ず通す。通らないなら分割方針を見直す。

### ❌ NG: 分割のために2時間以上かける

元のPRをそのまま出したほうが早かったケース。
**対策**: 30分で分割できなさそうなら、元のPRに justification を書いて出す（`pr-size-guard` 参照）。次から `vertical-slice` / `feature-flag-strategy` で事前分割を徹底する。

### ❌ NG: 分割したが各PRが互いに結合している

PR-1 の単独マージで機能が壊れる。
**対策**: PR-1 は「単独で意味がある」単位で切る。フラグで隠すか、関数の追加だけで既存を変えないようにする。

### ❌ NG: 分割後にコミットを squash し忘れて汚い履歴になる

`wip`, `fix typo`, `review comments` が残った状態でマージ。
**対策**: マージ戦略を squash merge に統一する。interactive rebase でクリーンアップしてから push。

---

## 他スキルとの関係

| スキル | 役割 |
|--------|------|
| `pr-size-guard` | 「分割すべきか」判定 |
| **split-on-the-fly** | 「判定後、実際にどう分割するか」手順 |
| `tidy-first` | 分割の切り口（Tidying を先行PRに） |
| `feature-flag-strategy` | 事前設計で分割（本スキル発動を予防） |
| `vertical-slice` | 事前設計で分割（本スキル発動を予防） |
| `stacked-pr` | 分割後のPRチェーン運用 |

**理想は本スキルを発動しないこと**（事前分割で済ませる）。本スキルは**最終手段**。

---

## チェックリスト

### 分割開始前
- [ ] `pr-size-guard` で判定した
- [ ] バックアップブランチを切った（`git branch backup/{name}`）
- [ ] 現在のブランチが main の最新に rebase 済み
- [ ] 分割パターン（A/B/C/D）を決めた

### 分割中
- [ ] 各新ブランチでビルド + テストが通る
- [ ] 各新ブランチが単独で意味を持つ（独立性）
- [ ] コミットメッセージが意味を持つ（wip/fixup は残っていない）

### 分割後
- [ ] 各PRのサイズを `pr-size-guard` で再確認
- [ ] Stacked の場合は `stacked-pr` スキルに従って運用
- [ ] レビュアー / チケット管理 / Slack に変更を伝えた
- [ ] バックアップブランチは全PRマージまで残す

---

## 参考

- Git interactive rebase — <https://git-scm.com/docs/git-rebase#_interactive_mode>
- `git add -p` の使い方 — <https://git-scm.com/docs/git-add#_interactive_mode>
- `git worktree` — <https://git-scm.com/docs/git-worktree>
