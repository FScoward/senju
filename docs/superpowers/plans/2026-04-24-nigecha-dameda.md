# nigecha-dameda（逃げちゃダメだ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「後続チケットで対応します」と言って先送りにするサボタージュを防ぐ Stop Hook をローカルに導入し、senju スキルとして配布可能にする。

**Architecture:** senju リポジトリに `hooks/nigecha-dameda/` を作成しスクリプト本体と README.md を格納する。同スクリプトを `~/.claude/hooks/nigecha-dameda.sh` にコピーし、`~/.claude/settings.json` の既存 Stop フック配列に追記する（非破壊）。

**Tech Stack:** bash, JSON（Claude Code settings.json）

---

## ファイルマップ

| ファイル | 操作 | 役割 |
|----------|------|------|
| `hooks/nigecha-dameda/nigecha-dameda.sh` | 新規作成（senju） | Hook スクリプト本体（配布用） |
| `hooks/nigecha-dameda/README.md` | 新規作成（senju） | インストール手順・判断基準 |
| `~/.claude/hooks/nigecha-dameda.sh` | 新規作成（ローカル） | 実際に発動するスクリプト |
| `~/.claude/settings.json` | 修正（既存 Stop 配列に追記） | Hook 登録 |

---

### Task 1: Hook スクリプトを senju に作成

**Files:**
- Create: `hooks/nigecha-dameda/nigecha-dameda.sh`

- [ ] **Step 1: ディレクトリ作成**

```bash
mkdir -p /Users/fumiyasu/ghq/github.com/FScoward/senju/hooks/nigecha-dameda/hooks
```

- [ ] **Step 2: スクリプトを書く**

`hooks/nigecha-dameda/nigecha-dameda.sh` を以下の内容で作成する：

```bash
#!/bin/bash
# nigecha-dameda（逃げちゃダメだ）- 先送りサボタージュ防止 Stop Hook
cat << 'EOF'
【逃げちゃダメだチェック】
今の返答で「後続チケット」「後でやります」「次のPRで」「別途対応」と言った箇所があるか？

▶ 先送りがあった場合、以下を今すぐ確認すること：

  1. チケット番号（APP-XXXX）を明記したか？
     → 未明記なら今すぐ書くこと

  2. チケットがまだ存在しない場合：
     → 「新規チケットを作成しますか？」とユーザーに確認すること

  3. 先送りの理由を1行で書いたか？
     （スコープ外 / 設計変更が必要 / ユーザー合意あり のどれか）

▶ 先送りが一切なかった場合：
  → このチェックを無視してよい
EOF
```

- [ ] **Step 3: 実行権限を付与**

```bash
chmod +x /Users/fumiyasu/ghq/github.com/FScoward/senju/hooks/nigecha-dameda/nigecha-dameda.sh
```

- [ ] **Step 4: スクリプトの出力を確認**

```bash
bash /Users/fumiyasu/ghq/github.com/FScoward/senju/hooks/nigecha-dameda/nigecha-dameda.sh
```

期待する出力：
```
【逃げちゃダメだチェック】
今の返答で「後続チケット」「後でやります」「次のPRで」「別途対応」と言った箇所があるか？
...
```

exit code が 0 であることを確認：
```bash
echo "exit: $?"
```
期待: `exit: 0`

- [ ] **Step 5: コミット**

```bash
cd /Users/fumiyasu/ghq/github.com/FScoward/senju
git add hooks/nigecha-dameda/nigecha-dameda.sh
git commit -m "feat(nigecha-dameda): Hook スクリプト本体を追加"
```

---

### Task 2: README.md を作成

**Files:**
- Create: `hooks/nigecha-dameda/README.md`

- [ ] **Step 1: README.md を書く**

`hooks/nigecha-dameda/README.md` を以下の内容で作成する：

```markdown
---
name: nigecha-dameda
description: >
  「後続チケットで対応します」と言って先送りにするサボタージュを防ぐ Stop Hook。
  毎ターン自動発動し、先送りがあった場合にチケット番号の明記またはユーザーへの確認を強制する。
  導入は hooks/ のスクリプトを ~/.claude/hooks/ に配置し settings.json に登録するだけ。
aliases:
  - nigecha-dameda
  - 逃げちゃダメだ
---

# nigecha-dameda（逃げちゃダメだ）

> 逃げちゃダメだ、逃げちゃダメだ、逃げちゃダメだ... — 碇シンジ

Claude が「後続チケットで対応します」と言って今のPRで直せるものを先送りにする行動を防ぐ **Stop Hook**。

## 動作

毎ターン、Claude が返答を終えた瞬間に自動発動する。先送りがあった場合：

1. **チケット番号（APP-XXXX）の明記** を要求する
2. チケットがない場合は **ユーザーへの確認** を要求する
3. 先送りの **理由を1行** で書くことを要求する

先送りが一切なければ何もしない（無視してよい）。

## 先送り判断基準

| 状況 | 判定 |
|------|------|
| 変更量が50行以下 かつ 同じファイルを既に触っている | 今やれ |
| スコープ外のサービス・レイヤーに影響する | 先送り可（理由・チケット明記） |
| 設計判断が必要で決定権がユーザーにある | 先送り可（ユーザー確認必須） |
| チケットが存在しない | ユーザーに確認してから先送り |
| ユーザーが明示的に「後でいい」と言った | 先送り可 |

## 導入手順

### 1. Hook スクリプトを配置

```bash
mkdir -p ~/.claude/hooks
cp hooks/nigecha-dameda.sh ~/.claude/hooks/nigecha-dameda.sh
chmod +x ~/.claude/hooks/nigecha-dameda.sh
```

### 2. settings.json に Stop Hook を追記

`~/.claude/settings.json` の `hooks.Stop` 配列の最初のエントリの `hooks` 配列に以下を追加する：

```json
{
  "type": "command",
  "command": "bash ~/.claude/hooks/nigecha-dameda.sh"
}
```

追記後のイメージ：

```json
"Stop": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "bash ~/.claude/hooks/nigecha-dameda.sh"
      }
    ]
  }
]
```

### 3. 動作確認

Claude Code を再起動して、Claude に「この修正は後続チケットで対応します。」と言わせる。
Hook が発動してチケット番号の入力を求められれば導入成功。

## 注意

- このフックは **毎ターン発動** する。先送りがない場合は「無視してよい」と明記しているため、Claude は自動スルーする。
- async は **設定しない**。Claude がリアルタイムで読む必要があるため。
```

- [ ] **Step 2: frontmatter を検証**

```bash
cd /Users/fumiyasu/ghq/github.com/FScoward/senju
bash scripts/check-frontmatter.sh hooks/nigecha-dameda/README.md
```

期待: エラーなし（または README.md が対象外なら正常終了）

- [ ] **Step 3: コミット**

```bash
cd /Users/fumiyasu/ghq/github.com/FScoward/senju
git add hooks/nigecha-dameda/README.md
git commit -m "feat(nigecha-dameda): README.md を追加（導入手順・判断基準）"
```

---

### Task 3: Hook をローカルに導入

**Files:**
- Create: `~/.claude/hooks/nigecha-dameda.sh`
- Modify: `~/.claude/settings.json`（Stop 配列の最初のエントリに追記）

- [ ] **Step 1: hooks ディレクトリを確認して作成**

```bash
ls ~/.claude/hooks/ 2>/dev/null || mkdir -p ~/.claude/hooks
```

- [ ] **Step 2: スクリプトをローカルにコピー**

```bash
cp /Users/fumiyasu/ghq/github.com/FScoward/senju/hooks/nigecha-dameda/nigecha-dameda.sh \
   ~/.claude/hooks/nigecha-dameda.sh
chmod +x ~/.claude/hooks/nigecha-dameda.sh
```

- [ ] **Step 3: スクリプトの動作確認**

```bash
bash ~/.claude/hooks/nigecha-dameda.sh
echo "exit: $?"
```

期待: チェックメッセージが出力され、exit 0

- [ ] **Step 4: settings.json の Stop 配列に追記**

`~/.claude/settings.json` の `hooks.Stop[0].hooks` 配列の**先頭**に以下を追加する（既存の async hooks の前）：

```json
{
  "type": "command",
  "command": "bash ~/.claude/hooks/nigecha-dameda.sh"
}
```

追記後の Stop[0] の形（既存エントリは保持したまま追加）：

```json
{
  "matcher": "",
  "hooks": [
    {
      "type": "command",
      "command": "bash ~/.claude/hooks/nigecha-dameda.sh"
    },
    {
      "type": "command",
      "command": "bash -c 'WID=$(cat ~/.canvaswm/session-window-id 2>/dev/null) && [ -n \"$WID\" ] && echo \"windowId:$WID\" > ~/.canvaswm/notify'",
      "async": true
    },
    {
      "type": "command",
      "command": "bash /Users/fumiyasu/.claude/scripts/knowledge-auto-extract.sh",
      "timeout": 30,
      "async": true
    }
  ]
}
```

- [ ] **Step 5: JSON が壊れていないか確認**

```bash
python3 -m json.tool ~/.claude/settings.json > /dev/null && echo "JSON OK"
```

期待: `JSON OK`

---

### Task 4: 動作確認

- [ ] **Step 1: Hook の最終確認**

```bash
bash ~/.claude/hooks/nigecha-dameda.sh | head -5
```

期待:
```
【逃げちゃダメだチェック】
今の返答で「後続チケット」「後でやります」「次のPRで」「別途対応」と言った箇所があるか？
```

- [ ] **Step 2: 最終コミット（senju）**

```bash
cd /Users/fumiyasu/ghq/github.com/FScoward/senju
git log --oneline -5
```

Task 1・Task 2 のコミットが含まれていることを確認。問題なければ push。

```bash
git push
```
