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

## 作業ルール

- スキルを追加・編集したら `./scripts/check-frontmatter.sh` を実行して検証する
- `description` は「どんな言葉でトリガーするか」を具体的に書く（曖昧だと発火しない）
- スキルのエントリポイントは `SKILL.md` のみ。補足資料は `references/` に置いて SKILL.md からリンクする
- SKILL.md が 30KB / 700 行を超える場合は `references/` への分割を検討する
