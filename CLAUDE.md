# senju

Claude Code 向け個人スキルコレクション。`~/.claude/skills/` にインストールして使う。

## リポジトリ構造

```
skills/<skill-name>/SKILL.md   # 各スキルの本体（frontmatter + 本文）
hooks/                          # Claude Code フック
docs/                           # ドキュメント
scripts/check-frontmatter.sh   # frontmatter 検証スクリプト
```

## スキルの構成

各スキルは `skills/<name>/SKILL.md` 1ファイル。YAML frontmatter が必須：

```yaml
---
name: スキル名
description: トリガー条件と用途の説明（ここが重要）
---
本文...
```

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
- 1スキル = 1ファイル（`SKILL.md`）。サブディレクトリは作らない
