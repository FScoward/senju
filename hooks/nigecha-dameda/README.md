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

## インストール手順

### 1. Hook スクリプトを配置

```bash
mkdir -p ~/.claude/hooks
cp nigecha-dameda.sh ~/.claude/hooks/nigecha-dameda.sh
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

Stop エントリがない場合は以下を追加する：

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

Claude Code を再起動して、任意の返答をさせる。Hook が発動してセルフチェックプロンプトが出力されれば導入成功。

## 注意

- このフックは **毎ターン発動** する。先送りがない場合は「無視してよい」と明記しているため、Claude は自動スルーする。
- `async` は **設定しない**。Claude がリアルタイムで読む必要があるため。
