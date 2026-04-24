# nigecha-dameda（逃げちゃダメだ）

> 逃げちゃダメだ、逃げちゃダメだ、逃げちゃダメだ... — 碇シンジ

Claude が「後続チケットで対応します」と言って今のPRで直せるものを先送りにする行動を防ぐ **Stop Hook**。

## 動作

Claude が返答を終えた瞬間に自動発動する。

1. stdin から `transcript_path` を受け取り、最後のアシスタントメッセージを読む
2. 先送りキーワードを検知した場合、`exit 2` + JSON で Claude の stop をブロック
3. 先送りがなければ `exit 0` で静かに通過（毎ターン発動するがノイズなし）

先送りがあった場合、Claude は以下を確認してから再返答する：

1. **チケット番号（APP-XXXX）の明記**
2. チケットがない場合は **ユーザーへの確認**
3. 先送りの **理由を1行** （スコープ外 / 設計変更が必要 / ユーザー合意あり）

## 検知キーワード

| 日本語 | 英語 |
|--------|------|
| 後続チケット、後でやります、後ほど対応 | following ticket、follow-up ticket |
| 次のPRで、別途対応、別チケット | separate PR、future PR |
| 後続タスク、後回し | will address later |

## 仕組み（Hook contract）

```
exit 0          → 通過（stdout は transcript に出るが Claude には届かない）
exit 2 + stderr → Claude にフィードバックを届けつつ stop をブロック
stderr の JSON  → {"decision":"block","reason":"..."} 形式で Claude に伝える
```

stdout だけでは Claude のコンテキストに届かないため、キーワード検知時は必ず `exit 2 + stderr` を使っている。

## 先送り判断基準

以下は Claude が自己判断するためのガイドライン（スクリプトはキーワード検知のみ行う）:

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

`~/.claude/settings.json` の `hooks.Stop` 配列の `matcher: ""` のエントリの `hooks` 配列に以下を追加する。なければ新規エントリとして追加する。

```json
{
  "type": "command",
  "command": "bash $HOME/.claude/hooks/nigecha-dameda.sh"
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
        "command": "bash $HOME/.claude/hooks/nigecha-dameda.sh"
      }
    ]
  }
]
```

### 3. Claude Code を再起動

設定はセッション開始時にのみ読み込まれる。**必ず Claude Code を再起動**すること。

```bash
# Claude Code を終了して再起動
```

### 4. 動作確認

Claude Code を再起動後、「この修正は後続チケットで対応します」などの返答をさせる。Claude が止まって3点チェックを要求すれば導入成功。

先送りがない場合はフックが何も出力しないため、通常の動作に影響しない。

## 注意

- `async` は **設定しない**。Claude がリアルタイムで読む必要があるため（`"async": true` を付けないこと）
- jq が必要。インストールされていない場合は `brew install jq` で導入すること
- transcript_path が存在しない場合は静かに通過する（フェイルセーフ）
