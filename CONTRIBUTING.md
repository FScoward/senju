# Contributing to senju

## 新しいスキルを追加する

### 1. ディレクトリ構造

```
skills/<skill-name>/
├── SKILL.md             # 必須。エントリポイント
├── references/          # 任意。詳細ドキュメント、チェックリスト等
├── scripts/             # 任意。スキルから呼び出す補助スクリプト
└── templates/           # 任意。出力フォーマットの雛形
```

スキル名は **kebab-case**、英語小文字。先頭に `@` やスコーププレフィックスは付けない。

### 2. SKILL.md 必須 frontmatter

```yaml
---
name: <skill-name>            # ディレクトリ名と一致させる
description: >-               # 1〜3 文。発火条件を具体的に
  <いつこのスキルを使うべきか。>
  Use when ... 形式 または「〇〇と言われたら」形式が推奨。
---
```

オプションフィールド:
- `model: sonnet | opus | haiku` — 実行モデルの明示指定
- `aliases: [short-name, another]` — 短縮名
- `license: MIT` — スキル単位のライセンス（リポジトリと異なる場合）
- `author: <github-handle>` — 作者

`gh skill install` で入るメタデータ（`repository`, `ref`, `tree_sha`）は自動追記されるので
author は書かない。

### 3. description の書き方（重要）

Claude がスキルを呼び出すかどうかは **description だけを見て判断する**。
発火してほしいフレーズを具体的に列挙する:

```yaml
description: |
  〇〇するスキル。以下のリクエストで必ずこのスキルを使うこと:
  - 「〇〇して」「××を作って」
  - 「◯◯」と言われた場合
  - △△ が含まれる場面
```

### 4. ローカル検証

```bash
./scripts/check-frontmatter.sh         # 必須フィールド検証
./scripts/check-frontmatter.sh --strict # 推奨フィールドの欠如も警告

gh skill preview ./skills/<skill-name>  # gh skill 側の検証
```

### 5. コミット & PR

- 1 スキル = 1 PR を推奨（レビューしやすい）
- コミットメッセージ: `add <skill-name>` / `fix(<skill-name>): ...` / `refactor(<skill-name>): ...`
- `*-workspace/` のような派生ディレクトリは commit しない（`.gitignore` 済み）

### 6. 手元に反映

push 後、自分の `~/.claude/skills/` にも取り込む:

```bash
gh skill install FScoward/senju <skill-name>   # 新規
gh skill update                              # 既存の更新
```

## 既存スキルの取り込みチェックリスト

`~/.claude/skills/` のスキルを senju に移植するとき:

- [ ] 中身に個人情報・機密情報・ハードコードされた社内パスが無いか確認
- [ ] `senju/skills/<name>/` に `cp -r` する
- [ ] frontmatter が無い場合は付与する
- [ ] ハードコードパスを環境変数化するか、`personal` 相当として公開しない判断をする
- [ ] `.DS_Store` など macOS メタデータを削除
- [ ] `./scripts/check-frontmatter.sh --strict` が通ることを確認
- [ ] コミット → push → 元マシンでは `gh skill install FScoward/senju <name>` で取り込み直す

## 公開範囲の扱い

senju リポジトリ自体の可視性（Private / Public）で制御する。個別スキル単位の公開制御は
持たない。Public 化したいスキルがまとまってきたら、別リポジトリに `git subtree split` で
切り出すのが推奨フロー。

## Phase 2 の TODO（frontmatter 未整備）

以下は SKILL.md は存在するが frontmatter が無い。取り込み時に付与する:

- `investigate` — バグ調査スキル
- `observe` — セッション終了時メモリ更新スキル
- `preflight` — 環境プリフライトチェック
- `review-save` — PRレビュー結果を Obsidian に保存
