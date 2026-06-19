# 千手 (senju)

> 千の手で、千の仕事を。

`senju` は [agent skills](https://agentskills.io) の個人コレクション。

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

## よく使うスキルとワークフロー

チケット起票から PR マージまでの典型的な開発フローで使うスキル群。

```
refine-ticket → kouunryuusui → review-loop-duo → review-decision-aid-html → review-response-loop
```

### 1. refine-ticket — チケットを実装可能な状態に磨く

```
/refine-ticket
```

既存チケット（JIRA / GitHub Issue / Linear / Notion 等）の description と受け入れ条件（AC）を
GWT+Examples 形式・7項目品質基準まで磨き上げる。
曖昧・抽象的・AC 不在のチケットを、第三者が PASS/FAIL を機械判定できる状態にする。

**使うとき**: 「チケットをrefineして」「ACを整えて」「受け入れ条件を磨いて」

### 2. kouunryuusui — 設計→実装→PR を自律的に走り切る

```
/kouunryuusui
```

Epic/US チケットから設計→チケット分割→実装→PR 作成まで自律的に走り続ける統合開発ワークフロー。
上位フロー（設計・分割）と下位フロー（実装・PR）を 2 層で分離して実行する。

**使うとき**: 「kouunryuusui」と明示的に指示する

### 3. review-loop-duo — Claude と Codex の並列クロスレビュー

```
/review-loop-duo
```

Claude の 9 観点並列レビューと Codex CLI の独立レビューを同時起動し、
両モデルの指摘を統合して Critical/Warning がゼロになるまでループする。

**使うとき**: 「duo review」「並列レビュー」「Claude と Codex 両方でレビュー」「セカンドオピニオン込みでレビュー」

### 4. review-decision-aid-html — レビュー指摘の対応方針を HTML で選択

```
/review-decision-aid-html
```

PR レビュー指摘の対応方針（SHOULD / NICE / DISCUSS / DEFER）を、
ユーザーが選択・コピーできるインタラクティブな HTML decision aid として出力する。

**使うとき**: 「レビュー対応方針をHTMLで」「どれを対応するか選べるように」「指摘の対応方針をdecision aidにして」

### 5. review-response-loop — 修正後の commit・push・Resolve を一気通貫

```
/review-response-loop
```

レビュー指摘の修正完了後、QG（品質ゲート）→ commit → push → 全スレッドへの返信＆Resolve を自動実行する。

**使うとき**: 「修正終わった」「全部直した」「スレッド返信して」「返信してResolve」「レビュー対応完了まで」

---

## スキル一覧（全スキル）

| スキル | 用途 |
|--------|------|
| `refine-ticket` | チケットの AC を GWT 形式で磨く |
| `kouunryuusui` | 設計→実装→PR を自律的に走り切る統合ワークフロー |
| `review-loop` | Critical/Warning がゼロになるまでAIレビューをループ |
| `review-loop-duo` | Claude + Codex CLI の並列クロスレビューループ |
| `receive-review` | PRレビュー指摘をトリアージ・対応方針プランを作成 |
| `review-decision-aid-html` | レビュー指摘の対応方針を HTML decision aid で選択 |
| `review-response-loop` | 修正後の QG → commit → push → 返信＆Resolve を自動実行 |
| `software-requirements` | 対話形式で要求を引き出し仕様書を作成 |
| `init-prompt` | 初回プロンプトを Goal/Constraints/AC に即席整理 |
| `planner` | タスクを分解して作業計画を立てる |
| `vertical-slice` | 機能を垂直スライスで分割する |
| `split-on-the-fly` | タスクをその場でサブタスクに分割 |
| `stacked-pr` | スタック PR を管理・運用する |
| `pr-size-guard` | PR サイズが大きすぎる場合に警告 |
| `tidy-first` | 整理先行（リファクタ→機能追加）の順序を守る |
| `test-matrix` | 同値分割・境界値等の技法でテスト設計 |
| `mihari` | テスト充足性を多観点で反復レビュー |
| `code-structure` | アーキテクチャを PlantUML で図示 |
| `code-why` | 「なぜそう書いたか」を説明しながら実装 |
| `html-output` | 成果物（計画・仕様・レポート）を HTML で出力 |
| `ui-change-report` | UI 変更のビフォーアフターレポートを生成 |
| `data-model-designer` | データモデルを設計・図示 |
| `feature-flag-strategy` | フィーチャーフラグの戦略を設計 |
| `strategy-advisor` | 技術的意思決定のアドバイス |
| `doc-review-meeting` | ドキュメントレビュー MTG を会話形式でシミュレート |
| `engineering-team-meeting` | スプリントプランニング等をエージェントチームでシミュレート |
| `sier-dev` | ウォーターフォール型開発ワークフロー |
| `jira-cli` | jira-cli 経由で Jira を操作 |
| `codex-cli` | OpenAI Codex CLI を Claude Code から呼び出す |
| `codex-advisor` | `advisor` ツールの活用ガイド |
| `undine` | — |

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
