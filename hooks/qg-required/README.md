# qg-required（QG 証跡なしで push 禁止）

> 「書いてあること」と「守られること」は違う。守らせる仕組みを作る。

kouunryuusui スキルの下位フロー T5（Push 確認）で、QG（Quality Gate）の完了証跡を **物理的に必須化** する PreToolUse フック。

## 動作

`git push` を実行する直前に発動し、以下を全て満たすときだけ通過する。

1. ブランチ名が `feature/APP-xxxx` 形式（kouunryuusui 対象ブランチ）
2. worktree ルートに `.claude/tmp/qg-result.md` が存在する
3. ファイル内に `## Final: PASS` の行がある
4. ファイル内に `mihari` の PASS 記録がある
5. ファイル内に `review-loop` の PASS 記録がある

満たさない場合は `exit 2` + stderr JSON で Claude に block を返し、push を中断する。

## なぜ必要か

kouunryuusui の SKILL.md / `lower-flow.md` には「QG-3 Stage 1 で mihari を呼ぶ」「Stage 2 で review-loop を呼ぶ」と明記されている。
ところが実運用の 7 worktree を調査すると、**6/7 で mihari も review-loop も一度も走らずに push されていた**。SKILL.md のルールが事実上スキップされていた。

このフックは「スキルが呼ばれた証拠」をファイルとして要求することで、メインセッションが Bash で gradle test を走らせて "PASS" と宣言するだけの抜け道を塞ぐ。

## qg-result.md フォーマット

QG サブエージェントが品質ゲート完了時に worktree ルートの `.claude/tmp/qg-result.md` に書き出す。

```markdown
# QG Result: APP-1380

- **Date**: 2026-05-16T01:40:00Z
- **Branch**: feature/APP-1380
- **Base**: origin/main

## Stages

| Stage | Status | Evidence |
|-------|--------|----------|
| QG-1 build/lint/test | PASS | `./gradlew build` exit 0, all tests green |
| QG-2 simplify | PASS | `Skill(simplify)` no further changes |
| QG-3 Stage 1 mihari | PASS | Round 3, Critical=0, Warning=0 |
| QG-3 Stage 2 review-loop | PASS | Iterations 2, Critical=0 |
| QG-4 advisor | SKIPPED (Tier 1) | n/a |

## Final: PASS
```

最低限のチェック対象は「`Final: PASS`」「`mihari` の PASS 記録」「`review-loop` の PASS 記録」の 3 点。
QG-1〜QG-4 全 Stage の記録があることが理想だが、フックはそこまでは見ない。

## スキップ条件

- `git push` 以外のコマンド
- ブランチが `APP-xxxx` を含まない場合（hotfix、main 直 push、docs リポジトリなど）
- 環境変数 `QG_REQUIRED_SKIP=1` をセットしている場合（緊急エスケープハッチ）

エスケープハッチは事故対応専用。常用すれば kouunryuusui の品質保証を放棄することになる。

## インストール手順

### 1. Hook スクリプトを配置

```bash
mkdir -p ~/.claude/hooks
cp ~/ghq/github.com/FScoward/senju/hooks/qg-required/qg-required.sh ~/.claude/hooks/qg-required.sh
chmod +x ~/.claude/hooks/qg-required.sh
```

### 2. `~/.claude/settings.json` の PreToolUse に追記

既存の Bash matcher エントリの `hooks` 配列に以下を追加する:

```json
{
  "type": "command",
  "command": "bash $HOME/.claude/hooks/qg-required.sh",
  "if": "Bash(git push*)",
  "timeout": 30,
  "statusMessage": "QG 証跡をチェック中..."
}
```

`if: Bash(git push*)` で `git push` の時だけ発動する。

### 3. Claude Code を再起動

settings.json はセッション開始時にのみ読み込まれる。**必ず再起動**すること。

### 4. 動作確認

`feature/APP-xxxx` ブランチで `.claude/tmp/qg-result.md` を作らずに `git push` させると、フックが block する。

```bash
# テスト用に手動実行も可能
echo '{"tool_name":"Bash","tool_input":{"command":"git push"},"cwd":"'$(pwd)'"}' \
  | CLAUDE_PROJECT_DIR=$(pwd) bash ~/.claude/hooks/qg-required.sh
echo "exit=$?"
```

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| 通すべき push がブロックされる | qg-result.md が無い | QG-3 を実行して書き出す |
| `Final: PASS` があるのに block | `mihari` か `review-loop` の PASS 記録が無い | QG-3 Stage 1/2 を実行して行追加 |
| 一時的に迂回したい | `.envrc` などで `export QG_REQUIRED_SKIP=1` | 終わったら必ず戻す |

## 仕組み（Hook contract）

```
exit 0          → push を許可
exit 2 + stderr → Claude にフィードバックを届けつつ push をブロック
stderr の JSON  → {"decision":"block","reason":"..."} 形式
```

`stdout` は Claude に届かないため、ブロック時は必ず `stderr` に JSON を出す。

## 設計判断

- **Bash 1ファイル**: `nigecha-dameda` / `check-ticket-before-push.sh` と同じパターン。Python は JSON パース用にのみ使う
- **`origin/main` をハードコードしない**: 検出ロジックは持たない。ファイル存在チェックに徹する
- **ファイル内容の厳密検証はしない**: PASS 行があるかどうかの粒度。具体的なテスト件数までは見ない（false negative を避ける）
- **scratch.md ではなく専用ファイル**: scratch.md は雑多なメモが混じる。QG 専用の機械可読ファイルにすることで誤検知を減らす
