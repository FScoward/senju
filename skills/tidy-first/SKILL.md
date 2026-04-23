---
name: tidy-first
license: MIT
description: >-
  Kent Beck の "Tidy First?" の考え方に基づき、「振る舞いを変えない整理（Tidying）」と「振る舞いを変える変更（Behavior Change）」を別PRに分けるスキル。
  機能追加やバグ修正の前に、コードを読みやすくする小さな整理を先行PRとして切り出すことで、本体PRを小さく・レビューしやすくする。
  「リファクタしながら機能追加したい」「コードが読みにくいから先に整理したい」「tidy first」「preparatory refactoring」「Kent Beck」「振る舞いを変えずに整理」などの発言で必ず使うこと。
  feature-flag-strategy が「機能を段階リリースする」スキルであるのに対し、このスキルは「変更の前準備としての整理を分離する」スキル。
aliases:
  - tidy
  - preparatory-refactoring
---

# tidy-first

Kent Beck の *Tidy First?*（2023）に基づき、**整理（Tidying）と振る舞い変更（Behavior Change）を別PRに分ける**ことで、PRを小さく・レビューしやすく・安全にするスキル。

## このスキルが解く問題

- 機能追加のPRに「ついでの rename」「変数抽出」「関数分割」が混ざり、差分が膨らむ
- レビュアーが「振る舞いが変わる箇所」と「見た目だけの変更」を区別できない
- リファクタと機能追加が同PRに混在し、リバートが困難になる
- 「まず整理してから実装」と思っても、整理だけのPRを出す習慣がなく、最後まで混ぜてしまう

---

## 核心原則

1. **Tidying は Behavior Change の前に、別PRで出す**: 整理を先に入れることで、本体PRの差分が「意味のある変更」だけになる
2. **Tidying PR は振る舞いを一切変えない**: テストが全て通る状態で、挙動が1バイトも変わらない保証が必要
3. **小さく・たくさん・頻繁に**: 1つの Tidying PR は数十行程度。大きな整理は複数PRに分ける
4. **Tidying か Behavior Change か、PRタイトルで明示する**: `tidy:` / `refactor:` / `feat:` / `fix:` でレビュアーの認知を切り替える

---

## Tidying（整理）の種類

Kent Beck が *Tidy First?* で挙げる代表的な Tidying パターン:

| パターン | 内容 | 目安サイズ |
|---------|------|-----------|
| **Guard Clauses** | ネストしたifを早期returnに変換 | 〜20行 |
| **Dead Code** | 使われていないコード・インポートの削除 | 〜50行 |
| **Normalize Symmetries** | 似た処理の書き方を揃える | 〜50行 |
| **New Interface, Old Implementation** | 新しい呼び出し口を追加（中身は既存のまま） | 〜30行 |
| **Reading Order** | 関数の定義順をトップダウンに並べ替え | 〜100行 |
| **Cohesion Order** | 関連する要素を近くに配置 | 〜100行 |
| **Move Declaration and Initialization Together** | 変数宣言と初期化を近づける | 〜20行 |
| **Explaining Variables** | 複雑な式を名前付き変数に抽出 | 〜10行 |
| **Explaining Constants** | マジックナンバー / マジック文字列に名前を付ける | 〜10行 |
| **Explicit Parameters** | 暗黙のコンテキストを明示的な引数に | 〜30行 |
| **Chunk Statements** | 関連する文をグループ化（空行を入れる） | 〜30行 |
| **Extract Helper** | 関数抽出（振る舞いは変えない） | 〜50行 |
| **One Pile** | 散らばった似たロジックを一箇所に集める | 〜100行 |
| **Explaining Comments** | 「なぜ」を説明するコメント追加 | 〜20行 |
| **Delete Redundant Comments** | コードと重複するコメントの削除 | 〜30行 |

**全て共通の条件**: 振る舞いが変わらない。テストが全て通る。

---

## Tidy First / Tidy After / No Tidy の判定

変更前に、以下を自問する:

```
Q1: この Tidying は、これからやる Behavior Change を楽にするか？
    ├─ Yes → Tidy First（先に整理PRを出す）
    └─ No  → Q2 へ

Q2: この Tidying は、Behavior Change の後でないと方向性が見えないか？
    ├─ Yes → Tidy After（本体PR後に整理PRを出す）
    └─ No  → Q3 へ

Q3: この Tidying はそもそも必要か？
    ├─ Yes → 独立した Tidying PR として出す（本体PRとは無関係）
    └─ No  → No Tidy（やらない）
```

**鉄則**: 迷ったら **Tidy First**。先に整理してから本体を書く方が、本体が小さくなる。

---

## PR分割テンプレート

### パターンA: Tidy First（推奨）

```
PR-1: tidy: {整理の内容}
  - 振る舞いを変えない
  - テストは変更なし or テスト自体の整理のみ
  - タイトル prefix: tidy: または refactor:
  - レビュー観点: 「本当に振る舞いが変わっていないか」のみ

PR-2: feat/fix: {本体}
  - PR-1 がマージ済みの前提
  - Behavior Change のみ
  - タイトル prefix: feat: / fix: / perf: など
  - レビュー観点: 「意図通りの振る舞いになっているか」
```

### パターンB: Tidy After

```
PR-1: feat/fix: {本体}
  - 先に動くものを入れる
  - 多少コードが汚くてもOK

PR-2: tidy: {整理の内容}
  - 本体マージ後に整理
  - タイトル prefix: tidy: または refactor:
```

**Tidy First を優先する理由**: 本体実装時に整理済みコードの上で書けるため、本体PRが小さくなる。Tidy After は本体の設計を見てから整理したい時のみ。

### パターンC: 独立Tidy

機能追加と無関係な整理（「前から気になっていた」系）は、機能追加とは全く別のチケット・別PRで出す。混ぜない。

---

## チケット分割テンプレート

機能追加チケット X を分解する際のテンプレ:

```markdown
Epic / US: {X の要求}

## チケット

1. **[TIDY] {X} 前準備: {整理の内容}**
   - タイプ: Tidying（振る舞い変更なし）
   - 依存: なし
   - AC: 既存テストが全てPASS / 新規テスト不要
   - 例: 「UserService の guard clauses 化」「Controller の関数並び替え」

2. **[FEAT] {X} 本体: {機能の内容}**
   - タイプ: Behavior Change
   - 依存: 1
   - AC: {機能のAC}

（必要に応じて）

3. **[TIDY] {X} 後片付け: {整理の内容}**
   - タイプ: Tidying
   - 依存: 2
```

---

## ワークフロー

### Step 1: 作業開始前の観察

機能追加 / バグ修正を始める前に、**対象コードを読んで15分観察**する:

- [ ] 関数が長すぎる（50行超）
- [ ] ネストが深い（3段以上）
- [ ] 似た処理が複数箇所に散在
- [ ] 変数名 / 関数名が意図を表していない
- [ ] マジックナンバー / マジック文字列がある
- [ ] デッドコードが残っている
- [ ] コメントが嘘をついている（実装と不一致）

**1つでも該当** → Tidy First 候補。Q1 の判定で「楽になる」ものを先行PRに切り出す。

### Step 2: Tidying PRを先に出す

- コミットは**1パターン = 1コミット**に分ける（`tidy: guard clauses in UserService`）
- テストを実行し、**全PASSを確認**してから push
- PR説明文に以下を明記:
  - 「振る舞いを変えていません」
  - 「既存テストが全てPASSすることで証明」
  - 使った Tidying パターン名

### Step 3: 本体PRを出す

- Tidying PR のマージを待つ
- base ブランチを更新してから本体の実装を開始
- 本体PRには Tidying を含めない（発見したら別PR に切り出す）

### Step 4: Tidy After（必要なら）

本体マージ後に「整理しておきたい」箇所が残ったら、さらに別PRで出す。

---

## アンチパターン

### ❌ NG: Tidying と Behavior Change を同PRに混ぜる

```
PR: feat: add user registration

変更内容:
- UserService を guard clauses に書き換え（+80行 / -60行）
- 関数の並び替え（+30行 / -30行）
- ↑ ここまで整理
- 新規登録機能の実装（+200行）
```

**問題**: レビュアーは「振る舞いが変わる箇所」と「変わらない箇所」を差分から判別できない。差分が1000行を超え、レビュー品質が落ちる。

**対策**: Tidying を先行PRに分離。本体PRの差分を実機能だけにする。

### ❌ NG: Tidying PRで振る舞いを変えてしまう

```
PR: tidy: refactor UserService

変更内容:
- guard clauses 化
- 「ついでに」nullチェックを追加（← 振る舞い変更！）
```

**問題**: 「整理」の名目で振る舞いが変わると、レビュアーが気づかない。バグの温床。

**対策**: Tidying PRでは**テストを一切変更しない**（既存テストが全てPASSする範囲に制限する）。新しいテストが必要になったら、それは振る舞い変更。

### ❌ NG: 大きすぎる Tidying

```
PR: tidy: massive refactor of auth module（+2000行 / -1500行）
```

**問題**: 振る舞い不変を保証できるか、レビュアーが検証できない。

**対策**: 1パターン = 1PR。大きな整理は複数PRに分解（「guard clauses化」→「関数抽出」→「並び替え」）。

### ❌ NG: 整理の目的が不明

PR説明が「リファクタリングしました」だけ。
**対策**: 使った Tidying パターン名 + 「これにより次の機能追加が楽になる」理由を明記。

### ❌ NG: 無限 Tidy（本体が始まらない）

「もう少し整理してから」を繰り返して機能追加に進まない。
**対策**: Q1 の判定（「これからやる変更を楽にするか？」）を厳格に適用。楽にならない整理は先送り。

---

## 既存コードベースへの段階導入

「いきなり Tidy First を全員でやる」は困難。以下のステップで導入する:

1. **まず自分の変更で試す**: 機能追加の前に1つだけ Tidying PRを出してみる
2. **PRテンプレートに項目追加**:
   ```markdown
   - [ ] このPRは Tidying か Behavior Change のどちらか一方のみ含む
   - [ ] Tidying の場合: 既存テストが全てPASSする
   ```
3. **レビュー観点の共有**: 混在PRを見つけたら「分けてもらえますか」とコメントする文化を作る
4. **コミット粒度を先に変える**: PR分割が重くても、コミットは `tidy:` / `feat:` で分けておけば後で分割しやすい

---

## チェックリスト

### Tidying PR作成時
- [ ] PRタイトルが `tidy:` または `refactor:` で始まる
- [ ] 振る舞いが変わっていない（既存テストが全てPASS）
- [ ] 新規テストを追加していない（追加が必要なら Behavior Change）
- [ ] 1つの Tidying パターンに絞っている（複数混ざっていない）
- [ ] PR説明文に使ったパターン名と「本体PRでこれが楽になる」理由を書いた
- [ ] 差分が +100行以下 / 10ファイル以下

### Behavior Change PR作成時
- [ ] Tidying を含んでいない（発見したら別PRに切り出す）
- [ ] PRタイトルが `feat:` / `fix:` / `perf:` などで始まる
- [ ] 新規テストで新しい振る舞いを証明している
- [ ] Tidy First 先行PRがマージ済み（あれば）

---

## kouunryuusui との関係

`kouunryuusui` スキルの E3（チケット分割）で、以下のシグナルを検出したら本スキルを呼び出して Tidy First を検討する:

| E3で検出するシグナル | 本スキルの使用判定 |
|-------------------|-----------------|
| 既存修正モード & 対象コードが複雑（関数長50行超 / ネスト3段以上） | Tidy First 推奨 |
| 新機能追加 & 既存コードの構造を利用する | Tidy First 推奨 |
| マジックナンバー / デッドコードが目立つ | 独立 Tidying PR |
| 新規ファイル作成のみ | Tidy First 不要 |

`feature-flag-strategy` と組み合わせる場合:

```
1. [TIDY] 本体前の整理
2. [FF-ADD] フラグ定義追加
3. [FF-BE] BE実装（flag behind）  ← 整理済みコードの上で実装するため小さく済む
4. [FF-FE] FE実装（flag behind）
5. [FF-ENABLE] フラグ有効化
6. [FF-REMOVE] フラグ削除
```

---

## 参考

- Kent Beck *Tidy First? A Personal Exercise in Empirical Software Design* (O'Reilly, 2023)
- Martin Fowler "Preparatory Refactoring" — <https://martinfowler.com/articles/preparatory-refactoring-example.html>
