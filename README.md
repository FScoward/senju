# 千手 (senju)

> 千の手で、千の仕事を。

`senju` は [agent skills](https://agentskills.io) の個人コレクション。
GitHub が **source of truth**、手元の `~/.claude/skills/` へは `gh skill` で取り込む。

## Quick start

### スキルを手元に install する

```bash
# 特定スキルだけ install
gh skill install FScoward/senju <skill-name>

# このリポジトリに入っているスキルを一覧
gh skill search FScoward/senju

# install 済みスキルに upstream の更新が来ていないか確認
gh skill update

# install 前に中身をプレビュー
gh skill preview FScoward/senju <skill-name>
```

### スキルを追加・編集する（author 向け）

```bash
git clone git@github.com:FScoward/senju.git
cd senju

# スキルを追加・編集
$EDITOR skills/<skill-name>/SKILL.md

# frontmatter を検証
./scripts/check-frontmatter.sh

# コミット & push
git add skills/<skill-name>
git commit -m "add <skill-name>"
git push

# 手元の ~/.claude/skills/ に反映
gh skill install FScoward/senju <skill-name>   # 新規
gh skill update                              # 既存を最新に
```

## ディレクトリ構造

```
senju/
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md               必須。エントリポイント + frontmatter
│       ├── references/            任意。補助ドキュメント
│       └── scripts/               任意。補助スクリプト
├── scripts/
│   └── check-frontmatter.sh       SKILL.md の必須フィールド検証（CI でも使う）
├── .github/workflows/
│   └── validate.yml               CI: frontmatter lint
├── CONTRIBUTING.md                スキル追加手順
├── .gitignore
└── README.md
```

スキルはフラットに `skills/` 直下に並べる。
**公開するかどうかは GitHub 側の可視性で制御**する:

- リポジトリ自体を Private に保ち、自分用 SSoT として使う
- 公開したいスキルが固まってきたら、Public リポジトリにそのサブセットを切り出す（`git subtree split` など）

## スキル一覧

> Phase 1 で `~/.claude/skills/` から取り込み予定。

- _(取り込み待ち)_

## ロードマップ

- [x] Phase 0: リポジトリ雛形
- [ ] Phase 1: 既存スキルを `~/.claude/skills/` から senju に移植
- [ ] Phase 2: frontmatter 未整備のスキル（investigate, observe, preflight, review-save）を整備
- [ ] Phase 3: 公開可能なサブセットを別リポジトリとして Public 化

## Skill 仕様

[agentskills.io](https://agentskills.io) 準拠。各スキルディレクトリに `SKILL.md` を置き、
先頭に YAML frontmatter を記述する。最小構成:

```markdown
---
name: example-skill
description: >-
  いつ呼び出されるべきかを具体的に。Use when ... 形式が発火精度を上げる。
---

# example-skill

（本文: 挙動、使い方、トリガーワード、etc.）
```

`gh skill install` した際は `repository` / `ref` / `tree SHA` が frontmatter に自動追記される。

## License

Private 期間中はライセンス未定。Public 化時に MIT を付与予定。
