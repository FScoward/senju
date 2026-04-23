---
name: pr-size-guard
license: MIT
description: >-
  PRを push / 作成する直前に差分サイズを測定し、閾値を超えていたら分割を促すセルフチェックスキル。
  変更行数・ファイル数・レイヤー跨ぎなど複数指標で診断し、超過している場合は分割提案または明示的な理由付けを強制する。
  「PR作る前にチェック」「差分が大きすぎないか確認」「push前に確認」「pr size」「PRサイズ」「レビューしやすいか」などの発言で必ず使うこと。
  kouunryuusui の T5（Push確認）と組み合わせて使う。feature-flag-strategy / tidy-first / vertical-slice で事前分割、本スキルで事後検証という位置づけ。
aliases:
  - prsize
  - size-check
---

# pr-size-guard

Push / PR 作成の直前に**差分サイズを測定し、大きすぎる場合は分割を促す**ガードスキル。

## このスキルが解く問題

- 実装に集中していると、気づいたら差分が +1000 行超になっている
- レビュアーが「読み切れない」PRを出してしまう
- 分割すべきだったと気づくのがマージ後 → 手遅れ
- 「今回は特別」と大きいPRを出し続けて、レビュー文化が劣化する
- kouunryuusui の T5（Push確認）に**定量的なサイズ基準がない**

---

## 核心原則

1. **push する前に必ず測る**: 「実装完了 → push」の間に必ず実測値を確認する関門を入れる
2. **閾値は3段階（Green / Yellow / Red）**: 数字で白黒判断せず、段階的に判断する
3. **Red を出すなら理由を明記する**: 大きなPRを出す自由は奪わない。ただし**なぜ分割しないか**をPR説明文に書く
4. **分岐可能性を常にチェックする**: 差分内で「独立してマージ可能な塊」があれば、それは分割候補

---

## 測定指標と閾値

| 指標 | Green | Yellow | Red |
|------|-------|--------|-----|
| **追加+削除行数**（テスト除く） | 〜200 | 201〜400 | 401以上 |
| **変更ファイル数**（テスト・自動生成含む） | 〜10 | 11〜20 | 21以上 |
| **変更ファイル数**（テスト・自動生成除く） | 〜7 | 8〜15 | 16以上 |
| **影響レイヤー数**（DB/BE/FE/設定/インフラ） | 1〜2 | 3 | 4以上 |
| **コミット数**（squash前） | 1〜5 | 6〜15 | 16以上 |
| **関与ドメイン数**（例: survey + feedback + user） | 1 | 2 | 3以上 |

### 判定ルール

- **全てGreen** → そのまま push OK
- **1つでもYellow** → 分割検討。分割しない場合は PR 説明文に理由を1行書く
- **1つでもRed** → **分割必須 or 明示的な justification**。後者の場合 PR 説明文に「なぜ分割しないか」を段落で書く

### 補助指標（警告のみ）

以下は閾値超過で**警告のみ**（サイズ判定には含めない）:

- **1ファイルで +300 行超**: そのファイル自体の責務が膨らんでいる可能性
- **バイナリファイル追加**: 意図的か確認
- **`package.json` / `go.mod` / `Cargo.toml` 変更 + アプリコード変更**: 依存追加は別PRが望ましい
- **テスト追加なし & +100行超の実装変更**: テスト不足の可能性

---

## 測定コマンド

### 基本測定

```bash
# 追加+削除の行数（テスト除く）
git diff --shortstat origin/main...HEAD -- ':!*_test.*' ':!*test*' ':!**/__tests__/**'

# 変更ファイル数（全て）
git diff --name-only origin/main...HEAD | wc -l

# 変更ファイル数（テスト除く）
git diff --name-only origin/main...HEAD | grep -vE '_test\.|test/|__tests__' | wc -l

# コミット数
git log --oneline origin/main..HEAD | wc -l

# 1ファイルあたりの最大行数
git diff --numstat origin/main...HEAD | awk '{print $1+$2, $3}' | sort -rn | head -5
```

### レイヤー判定

変更パスから影響レイヤーを自動判定する例（プロジェクトに応じて調整）:

```bash
git diff --name-only origin/main...HEAD | awk '
  /migration|flyway|sql/     { l["DB"]=1 }
  /backend|server|api|.kt$/  { l["BE"]=1 }
  /frontend|web|.tsx?$/      { l["FE"]=1 }
  /config|settings|env/      { l["Config"]=1 }
  /k8s|docker|terraform|ci/  { l["Infra"]=1 }
  END { for (k in l) print k; print "Total: " length(l) }
'
```

### 一括診断スクリプト

`scripts/measure-pr-size.sh` に以下を用意し、いつでも実行可能にする:

```bash
#!/usr/bin/env bash
# measure-pr-size.sh — 現ブランチと origin/main の差分サイズを診断
set -euo pipefail

BASE="${1:-origin/main}"

echo "=== PR Size Diagnostic (base: $BASE) ==="
echo ""

# 行数
stats=$(git diff --shortstat "$BASE...HEAD" | tr -d ',')
lines=$(git diff --numstat "$BASE...HEAD" | awk '{sum += $1 + $2} END {print sum+0}')
lines_no_test=$(git diff --numstat "$BASE...HEAD" | grep -vE '_test\.|test/|__tests__' | awk '{sum += $1 + $2} END {print sum+0}')

# ファイル数
files=$(git diff --name-only "$BASE...HEAD" | wc -l | tr -d ' ')
files_no_test=$(git diff --name-only "$BASE...HEAD" | grep -vcE '_test\.|test/|__tests__' || true)

# コミット数
commits=$(git log --oneline "$BASE..HEAD" | wc -l | tr -d ' ')

# 判定関数
judge() {
  local val=$1 green=$2 yellow=$3
  if [ "$val" -le "$green" ]; then echo "🟢"
  elif [ "$val" -le "$yellow" ]; then echo "🟡"
  else echo "🔴"
  fi
}

echo "行数（テスト除く）:     $lines_no_test行  $(judge "$lines_no_test" 200 400)"
echo "ファイル数（全て）:     ${files}件       $(judge "$files" 10 20)"
echo "ファイル数（テスト除く）: ${files_no_test}件       $(judge "$files_no_test" 7 15)"
echo "コミット数:            ${commits}件       $(judge "$commits" 5 15)"
echo ""
echo "--- 変更ファイル上位5 ---"
git diff --numstat "$BASE...HEAD" | awk '{print $1+$2, $3}' | sort -rn | head -5
echo ""
echo "--- レイヤー影響 ---"
git diff --name-only "$BASE...HEAD" | awk '
  /migration|flyway|sql/     { l["DB"]=1 }
  /backend|server|api|\.kt$/ { l["BE"]=1 }
  /frontend|web|\.tsx?$/     { l["FE"]=1 }
  /config|settings|env/      { l["Config"]=1 }
  /k8s|docker|terraform|ci/  { l["Infra"]=1 }
  END {
    for (k in l) print "  - " k
    print "  Total layers: " length(l)
  }
'
```

---

## ワークフロー

### Step 1: push 前に実行

```bash
./scripts/measure-pr-size.sh
```

または手動で基本測定コマンドを実行。

### Step 2: 判定

| 結果 | アクション |
|------|-----------|
| **全てGreen** | そのまま `git push` → PR作成へ |
| **1つでもYellow** | Step 3（分割検討）へ |
| **1つでもRed** | Step 3（分割検討）へ。分割不可なら Step 4（理由明記）へ |

### Step 3: 分割検討（Yellow/Red時）

以下の観点でコミット履歴を見直し、**独立してマージ可能な塊**がないか探す:

#### 3a: コミット境界での分割

```bash
git log --oneline origin/main..HEAD
```

各コミットが独立してマージ可能か確認:

| コミット例 | 独立性 | 分割可否 |
|-----------|--------|---------|
| `add: UserRepository` | ✅ 単独で意味がある | 分割可 |
| `tidy: rename validateUser → ensureUserValid` | ✅ 振る舞い変更なし | **別PR推奨** |
| `fix: null handling in UserService` | ⚠️ 本体と密結合 | 分割困難 |
| `wip: WIP` | ❌ 意味がない | squash必須 |

分割できるコミット塊があれば:

1. Tidying / リファクタ系のコミットを**先行PR**として切り出す（`tidy-first` スキル参照）
2. 残りを本体PRとして push

#### 3b: 機能単位での分割

差分を眺めて、以下に該当する塊があれば分割:

- 追加機能が複数ある（例: 「一覧表示」+「検索」+「ソート」→ 3PRに分割可能）
- 既存リファクタと新機能が混在（→ リファクタを先行PRに）
- BE + FE が両方大きい（→ BE先行 → FE後追いに分割）
- DB変更とアプリ変更が同居（→ マイグレーションPRを分離、`kouunryuusui` の E&C 参照）

#### 3c: レイヤー単位での分割

影響レイヤーが4以上の場合:

```
PR-1: DB マイグレーション
PR-2: BE（API追加）
PR-3: FE（画面追加）
PR-4: Config / Infra
```

### Step 4: 分割できない場合の理由明記

分割を検討しても「これ以上分けられない」と判断したら、PR説明文の先頭に以下を追加:

```markdown
## なぜこのサイズか

**サイズ指標**:
- 行数: {X}行（テスト除く）🔴
- ファイル数: {Y}件 🟡
- レイヤー: {Z}個

**分割を検討したが、できない理由**:
- {具体的な理由1：例えば「BE/FEのインターフェース変更が原子的である必要があり分離不可」}
- {具体的な理由2：例えば「自動生成コードが多く、実質的な変更は少ない」}

**レビュアーへの案内**:
- コア変更は `{ファイルパス}` の N行目〜M行目
- 残りは {生成コード / 定型変更 / テスト} であり、流し読みで可
- 推奨レビュー順: {ファイル順}
```

**鉄則**: 「時間がなかった」「急いでいた」は理由にならない。技術的制約のみが正当な理由。

---

## kouunryuusui / 他スキルとの統合

### kouunryuusui T5 への組み込み

`kouunryuusui` の下位フロー T5（Push確認）の直前に本スキルを組み込む:

```
T5: Push確認とPR作成
  ├─ デモ確認（自律判断）
  ├─ チケット↔コード整合性確認
  ├─ 【NEW】pr-size-guard 実行 ← ココ
  │   ├─ Green: そのまま進む
  │   ├─ Yellow: 分割検討を scratch.md に記録、ユーザーに提示
  │   └─ Red: 分割必須 or justification を PR 説明文に自動追加
  ├─ 最終報告書
  └─ Push確認
```

### 他スキルとの関係

| スキル | 役割 |
|--------|------|
| `feature-flag-strategy` | **事前**分割：機能追加を5PRに分ける設計 |
| `tidy-first` | **事前**分割：Tidyingを先行PRに切り出す |
| `vertical-slice` | **事前**分割：機能を薄い縦スライスで段階的に作る |
| **pr-size-guard** | **事後**検証：実装後、push前にサイズを測って分割を促す |
| `split-on-the-fly` | **事後**分割：実装中・完了後に「大きすぎる」と気づいた時の分割手順 |

事前分割スキルで設計しても、実装中に想定より膨らむことがある。本スキルはその**最後の砦**。

---

## アンチパターン

### ❌ NG: 閾値だけを見て「OK」と判断

行数がGreenでもレビュー困難なPRはある（例: 複雑なアルゴリズム変更、セキュリティ境界変更）。
**対策**: 閾値は**最低ライン**。数字OKでも「レビュアーが30分で理解できるか」を自問する。

### ❌ NG: テストを削って行数を減らす

「Yellow超過したからテスト減らそう」は本末転倒。
**対策**: 本スキルの閾値は**テスト除外**で計測する。テストは増やす方向に働かせる。

### ❌ NG: PRを複数に分けたふりをして、全部を1つのブランチで積む

見かけのPRは3本でも、実体は1本（先行PRが後続に依存し、結局まとめてレビューされる）。
**対策**: 各PRが **base=main でマージ可能**であることを確認。依存PRは `stacked-pr` スキルを使って正しく積む。

### ❌ NG: justification を毎回書くことで形骸化

「分割困難」を毎回書いていたら、ルールが機能していない。
**対策**: 月に1度、Red PRの justification を振り返る。**再発パターン**があれば事前設計（feature-flag / tidy-first / vertical-slice）で防ぐ。

### ❌ NG: 差分の大きさを「自動生成ファイル」で言い訳する

`*.generated.ts` が1000行あるから Red、は正しい判定。
**対策**: 自動生成ファイルは `.gitattributes` に `linguist-generated` を設定し、GitHub の差分ビューから除外する。ただし**本スキルの測定からは除外しない**（リポジトリに入る以上、影響がある）。

---

## チェックリスト

### push 前
- [ ] `scripts/measure-pr-size.sh` を実行した
- [ ] Green / Yellow / Red の判定を確認した
- [ ] Yellow以上なら分割を検討した
- [ ] 分割しない場合は PR 説明文に理由を書いた

### PR作成時
- [ ] PR タイトルが変更の性質を表している（`feat:` / `fix:` / `tidy:` / `refactor:` など）
- [ ] サイズ指標を PR 説明文の先頭に記載した（Red の場合）
- [ ] レビュー順の案内を記載した（複数ファイルが大きい場合）

### レビュー文化
- [ ] 月1で Red PR を振り返っている
- [ ] 再発パターンは事前分割スキルで防ぐ仕組みにしている

---

## 参考

- Google の研究: PRサイズとレビュー品質の相関 — "Modern Code Review" Rigby & Bird (2013)
- Microsoft: 200行前後のPRが最もレビュー効率が高い — "Code Reviews Do Not Find Bugs" McIntosh et al. (2016)
- 一般的な経験則: 1PR = 30分で読める量 = 400行以下
