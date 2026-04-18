---
name: jira-cli
license: MIT
description: ankitpokhrel/jira-cli を使ってJiraを操作するスキル。「Jiraのイシューを見たい」「バグを起票して」「JIRAにコメントを追加して」「〇〇-123を確認して」「イシューを作成して」「Jiraを操作して」など、Jiraに関する操作が含まれたら積極的に使うこと。イシューの閲覧・作成・コメント追加をCLIで実行する。
---

# Jira CLI スキル

`jira`（ankitpokhrel/jira-cli）を使ってJiraをCLIで操作する。

## 前提確認

作業前に以下を確認する：

```bash
# jira CLIがインストール済みか確認
jira version

# ログイン状態の確認
jira me
```

インストールされていない場合はユーザーに案内する：
```
brew install ankitpokhrel/jira-cli/jira-cli
jira init  # 初期設定（Jira URL・認証トークンの設定）
```

---

## 操作パターン

### 1. イシューを見る

**一覧表示**

```bash
# 自分にアサインされたイシュー
jira issue list --assignee $(jira me --plain)

# プロジェクト指定で一覧
jira issue list -p PROJECT_KEY

# ステータスで絞り込み
jira issue list -p PROJECT_KEY -s "In Progress"

# テキスト検索
jira issue list -q 'summary ~ "キーワード"'

# 件数を絞る
jira issue list -p PROJECT_KEY --paginate 20
```

**詳細表示**

```bash
# イシュー詳細（コメントも含む）
jira issue view ISSUE-KEY

# ブラウザで開く
jira open ISSUE-KEY
```

ユーザーがイシューキー（例：`ABC-123`）を指定した場合は `jira issue view` で詳細を表示する。

---

### 2. イシューを作る

**インタラクティブ作成（推奨）**

```bash
jira issue create -p PROJECT_KEY
```

**コマンドラインで直接作成**

```bash
jira issue create \
  -p PROJECT_KEY \
  -t "Bug" \
  -s "バグのタイトル" \
  -b "詳細な説明文" \
  --priority Medium \
  --no-input
```

`--no-input` を付けると対話プロンプトをスキップして即時実行できる。

**作成時の情報収集フロー**

ユーザーがイシュー作成を依頼したら、以下を確認・推定する：

| 項目 | オプション | デフォルト |
|------|----------|----------|
| プロジェクトキー | `-p` | 未指定時はユーザーに確認 |
| イシュータイプ | `-t` | `Bug` / `Task` / `Story` から推定 |
| サマリー（タイトル） | `-s` | ユーザーの依頼文から生成 |
| 説明 | `-b` | 会話コンテキストから生成 |
| 優先度 | `--priority` | `Medium`（デフォルト） |

情報が揃っていれば確認なしで実行してよい。不明な場合のみ選択肢を提示する。

---

### 3. コメントを追加する

```bash
# コメントを追加
jira issue comment add ISSUE-KEY --body "コメント内容"

# コメント一覧を見る
jira issue comment list ISSUE-KEY
```

コメント内容はユーザーの依頼をそのまま使うか、会話から適切に生成する。マークダウン記法が使える。

---

## 本文（body）の書き方 — ADF対応

Jira Cloud は内部で **ADF（Atlassian Document Format）** を使う。jira-cli はマークダウンをADFに変換して送信するが、シェルのクォートや改行の扱いで失敗しやすい。

### 鉄則: 複数行の本文は必ずファイル経由で渡す

```bash
# ❌ これはよく壊れる（改行が消える・クォートエラー）
jira issue create -p PROJ -s "タイトル" -b "行1\n行2\n- リスト"

# ✅ これが安全
cat > /tmp/jira-body.md << 'EOF'
本文をここに書く
EOF
jira issue create -p PROJ -s "タイトル" --body-from-file /tmp/jira-body.md --no-input
```

コメントも同様：
```bash
cat > /tmp/jira-comment.md << 'EOF'
コメント内容
EOF
jira issue comment add PROJ-123 --body-from-file /tmp/jira-comment.md
```

---

### 正しく表示されるマークダウン記法

```markdown
## 見出し（h2まで推奨）

通常のテキスト。**太字**、*斜体*。

箇条書き（前後に空行が必要）：

- 項目1
- 項目2
  - ネスト項目

番号付きリスト：

1. 手順1
2. 手順2

コードブロック（言語指定あり）：

```bash
echo "hello"
```

区切り線：

---

リンク：[テキスト](https://example.com)
```

### よくある失敗パターンと対処

| 失敗パターン | 原因 | 対処 |
|-------------|------|------|
| 改行が消えて1行になる | `-b "..."` に直接改行を入れた | `--body-from-file` を使う |
| リストが箇条書きにならない | `- ` の前後に空行がない | リストの前後に空行を入れる |
| コードブロックが表示されない | バッククォートがシェルに解釈された | heredocの開始を `<< 'EOF'`（シングルクォート）にする |
| JSON構造エラーになる | 特殊文字（`"`や`\`）がエスケープされていない | ファイル経由で渡すと回避できる |
| h1見出しが崩れる | Jiraではタイトルと競合する | `## ` (h2) から始める |

### テンプレート: イシュー作成

```bash
cat > /tmp/jira-body.md << 'EOF'
## 概要
バグの説明を書く。

## 再現手順

1. 〜を開く
2. 〜をクリックする
3. エラーが発生する

## 期待する動作
正常に動作すること。

## 実際の動作
エラーが出る。

## 環境
- OS: macOS 14
- ブラウザ: Chrome 120
EOF

jira issue create \
  -p PROJECT_KEY \
  -t "Bug" \
  -s "イシューのタイトル" \
  --body-from-file /tmp/jira-body.md \
  --priority High \
  --no-input
```

### テンプレート: コメント追加

```bash
cat > /tmp/jira-comment.md << 'EOF'
調査しました。

**原因**: 〜が〜になっていた。

**対応**: 〜で修正済み。レビューお願いします。

```bash
# 関連するログやコード
エラー内容
```
EOF

jira issue comment add ISSUE-KEY --body-from-file /tmp/jira-comment.md
```

> **ルール**: 本文が2行以上、またはコードブロック・リストを含む場合は**必ず** `--body-from-file` を使う。

---

## 実行時の共通ルール

- **実行前にコマンドを表示する** — 何を実行するかをユーザーに見せてから実行する
- **エラーが出たら原因を調べる** — `jira --help` や `jira issue --help` で確認し、修正して再実行する
- **イシューキーは大文字で扱う** — `abc-123` → `ABC-123` に正規化する
- **プロジェクトキーが不明な場合**は `jira project list` で一覧を取得してユーザーに選ばせる

---

## よくあるエラーと対処

| エラー | 対処 |
|--------|------|
| `jira: command not found` | `brew install ankitpokhrel/jira-cli/jira-cli` を案内 |
| `authentication failed` | `jira init` で再設定を案内 |
| `project not found` | `jira project list` でプロジェクトキーを確認 |
| `issue not found` | イシューキーのスペルと大文字・小文字を確認 |
