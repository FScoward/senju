# Stacked PR 計画書テンプレート

SKILL.md の Step 4c で使用するテンプレート。
`docs/06_wbs/stacked-pr-plan.md` として保存する。

---

## テンプレート

```markdown
# Stacked PR 計画

**プロジェクト名**: {プロジェクト名}
**EPIC-ID**: {EPIC-ID}
**作成日**: {YYYY-MM-DD}
**Tier**: {2 / 3}

> このファイルはブランチ構成と PR 作成順序の計画のみを示す。
> rebase・force-with-lease・マージ手順は `/stacked-pr` スキルに従う。

---

## 全体俯瞰図

```
main
├── Stack A: {スタック名}（チケット: TICKET-001 → TICKET-002 → TICKET-003）
│   feature/{EPIC-ID}-1-{short}  ← base: main
│   feature/{EPIC-ID}-2-{short}  ← base: feature/{EPIC-ID}-1-...
│   feature/{EPIC-ID}-3-{short}  ← base: feature/{EPIC-ID}-2-...
│
├── Stack B: {スタック名}（チケット: TICKET-004 → TICKET-005）  ← 独立した別チェーン
│   feature/{EPIC-ID}-4-{short}  ← base: main
│   feature/{EPIC-ID}-5-{short}  ← base: feature/{EPIC-ID}-4-...
│
└── Standalone PRs（依存なし・スタック不要）
    TICKET-006 → feature/{EPIC-ID}-6-{short}  ← base: main
    TICKET-007 → feature/{EPIC-ID}-7-{short}  ← base: main
```

---

## スタンドアローン PR

> 依存関係がなく、スタックに含めない独立したチケット。

| チケット | ブランチ名 | base | 概要 |
|---------|-----------|------|------|
| TICKET-006 | `feature/{EPIC-ID}-6-{short}` | `main` | {概要} |
| TICKET-007 | `feature/{EPIC-ID}-7-{short}` | `main` | {概要} |

---

## Stack A: {スタック名}

**目的**: {このスタックが達成するまとまった機能}
**深さ**: {N 本}（最大 5 本）

| 順序 | チケット | ブランチ名 | base | 概要 |
|------|---------|-----------|------|------|
| PR-1 | TICKET-001 | `feature/{EPIC-ID}-1-{short}` | `main` | {概要} |
| PR-2 | TICKET-002 | `feature/{EPIC-ID}-2-{short}` | `feature/{EPIC-ID}-1-{short}` | {概要} |
| PR-3 | TICKET-003 | `feature/{EPIC-ID}-3-{short}` | `feature/{EPIC-ID}-2-{short}` | {概要} |

### PR 説明文テンプレート（各PR の先頭に貼る）

```markdown
## 📚 Stacked PRs

このPRは以下のチェーンの一部です。**レビュー順は番号通り**:

1. #{PR-1番号}: [{EPIC-ID}-1] {タイトル} ← 先にマージ
2. #{PR-2番号}: [{EPIC-ID}-2] {タイトル} ← **このPR**（例）
3. #{PR-3番号}: [{EPIC-ID}-3] {タイトル} ← 次

**base**: `feature/{EPIC-ID}-1-{short}`（#{PR-1番号} のブランチ）
**マージ戦略**: squash merge。PR-1 がマージされたら本PRを rebase → main に切り替え
```

---

## Stack B: {スタック名}

**目的**: {このスタックが達成するまとまった機能}
**深さ**: {N 本}

| 順序 | チケット | ブランチ名 | base | 概要 |
|------|---------|-----------|------|------|
| PR-1 | TICKET-004 | `feature/{EPIC-ID}-4-{short}` | `main` | {概要} |
| PR-2 | TICKET-005 | `feature/{EPIC-ID}-5-{short}` | `feature/{EPIC-ID}-4-{short}` | {概要} |

### PR 説明文テンプレート

```markdown
## 📚 Stacked PRs

1. #{PR-4番号}: [{EPIC-ID}-4] {タイトル} ← 先にマージ
2. #{PR-5番号}: [{EPIC-ID}-5] {タイトル} ← **このPR**

**base**: `feature/{EPIC-ID}-4-{short}`
```

---

## DAG（依存グラフ）

> Step 4b で生成したチケットドラフトから読み取った依存関係。

```
TICKET-001 ──► TICKET-002 ──► TICKET-003   (Stack A)
TICKET-004 ──► TICKET-005                  (Stack B)
TICKET-006                                  (Standalone)
TICKET-007                                  (Standalone)
```

---

## チェックリスト

- [ ] 全チケットの「依存チケット」フィールドを読み取り、DAG を構築した
- [ ] スタックの深さが全て 5 以内
- [ ] 独立チケットはスタックに含めず Standalone とした
- [ ] 各スタックのブランチ名が `feature/{EPIC-ID}-{N}-{short}` 形式
- [ ] PR 説明文テンプレートを全スタック分作成した
```

---

## Step 4c でのスタック設計の注意点

### DAG が線形でない場合

チケット依存が分岐・合流する場合は、**マージポイントで一度スタックを切る**。

```
TICKET-001 ──► TICKET-003 ──► TICKET-005（ここで合流）
TICKET-002 ──────────────────┘
```

この場合、TICKET-001 と TICKET-002 はそれぞれ Standalone PR にして、
TICKET-003 以降を1本のスタックにするか、TICKET-005 をそれらの後続として扱う。

### Tier 別の運用

| Tier | 推奨 |
|------|------|
| Tier 1（≤3チケット） | スタック不要。原則1PR。依存ありなら最大2本 |
| Tier 2（4〜10チケット） | 依存チェーン単位でスタックを設計。深さ≤5 |
| Tier 3（11チケット+） | 複数スタック + Standalone の組み合わせ。チェーンが長い場合は `vertical-slice` で分割 |

### スタックが 5 を超えそうな場合

`vertical-slice` スキルで「並列実装可能な縦スライス」に分割してから、
各スライスを別スタックとして扱う。
