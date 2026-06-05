# senju

Claude Code 向け個人スキルコレクション。`~/.claude/skills/` にインストールして使う。

## リポジトリ構造

```
skills/<skill-name>/SKILL.md         # 各スキルの本体（frontmatter + 本文）
skills/<skill-name>/references/      # 任意。SKILL.md 本体から参照する補足資料
skills/<skill-name>/README.md        # 任意。スキルの開発者向け説明
hooks/                                # Claude Code フック
docs/                                 # ドキュメント
scripts/check-frontmatter.sh         # frontmatter 検証スクリプト
```

## スキルの構成

各スキルは `skills/<name>/SKILL.md` がエントリポイント。YAML frontmatter が必須：

```yaml
---
name: スキル名
description: トリガー条件と用途の説明（ここが重要）
---
本文...
```

### references/ サブディレクトリ（任意）

`gh skill install` は `skills/<name>/` ディレクトリ全体を同梱配布する（agentskills.io 仕様準拠）。SKILL.md が大きくなりすぎる場合は、補足資料を `references/` に切り出して SKILL.md から相対パスでリンクしてよい:

```
skills/<name>/
├── SKILL.md                   # エントリポイント。frontmatter + 本文（できれば 20KB 以下）
├── references/                # 任意
│   ├── reviewer-prompts.md
│   └── report-formats.md
└── README.md                  # 任意
```

切り出す基準（推奨）:
- SKILL.md が 30KB を超える、または 700 行を超える
- 同じ内容のテンプレート・出力例・プロンプトが繰り返し出ている
- 本文の手順を読むために必須ではない「参照資料」と判断できる

SKILL.md には「詳細は `references/foo.md` を参照」と明示してリンクする。発火時にエージェントが必要に応じて Read できるようにする。

## よく使うコマンド

```bash
# frontmatter を検証（PR 前に必ず実行）
./scripts/check-frontmatter.sh

# スキルを手元にインストール
gh skill install FScoward/senju <skill-name>

# 既存スキルを更新
gh skill update
```

## スキル設計の原則

> 出典: [Lessons from Building Claude Code: How We Use Skills](https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills)

### 1. コンテキスト注入が本質

スキルは「Claude がすでに知っていること」を説明するのではなく、**「Claude が知るはずのない、このプロジェクト固有の情報」を注入する**ものとして設計する。

- ❌ 「コードレビューは品質向上のために大切です」（Claude はすでに知っている）
- ✅ 「このプロジェクトでは UseCase 層にトランザクションを書く。Controller に書くと CI で落ちる」（固有の制約）

### 2. Gotchas セクションが最も価値が高い

スキルの中で最も再利用価値が高いのは **過去の失敗パターン・罠・エッジケース** を列挙した Gotchas セクション。
「なぜそうするか」の背景と一緒に書く。書くべき内容の優先順位：

1. **Gotchas** — ハマった罠、繰り返す false positive、見落としやすい制約
2. **手順** — 何をどの順で行うか
3. **出力フォーマット** — 何を返すか

### 3. `description` はモデルへのトリガー文

`description:` フィールドはモデルがスキルを発火させるかどうかを判断するためのもの。人間向けのドキュメントではない。

- ユーザーが実際に打ちそうな言葉・フレーズを具体的に列挙する
- 「このスキルは〜です」という説明文ではなく、「〜と言われたら発火する」という発動条件を書く

### 4. 一般的な指示より具体的なコンテキスト

抽象的な指示はスキルに書かない。具体的な制約・理由・例を書く。

- ❌ 「デプロイ時は注意して」
- ✅ 「デプロイ前に必ず `#deploys` に通知する。パイプラインが自動通知しないため」

---

## 作業ルール

- スキルを追加・編集したら `./scripts/check-frontmatter.sh` を実行して検証する
- `description` は「どんな言葉でトリガーするか」を具体的に書く（曖昧だと発火しない）
- スキルのエントリポイントは `SKILL.md` のみ。補足資料は `references/` に置いて SKILL.md からリンクする
- SKILL.md が 30KB / 700 行を超える場合は `references/` への分割を検討する
