# 行雲流水（kouunryuusui）

> 雲のように流れ、水のように進む — 自律的な開発ワークフロー

Epic/USチケットから **設計→チケット分割→実装→PR作成** まで自律的に走り続ける 2層構造の統合開発スキルです。

## インストール

```bash
gh skill install FScoward/senju kouunryuusui
```

## 使い方

```
# Epic/USチケット → 上位フロー（設計→分割→実装ループ）
/kouunryuusui EPIC-123
/kurs "ユーザー認証機能を追加したい"

# 実装チケット → 下位フロー（直接実装）
/kouunryuusui TASK-789
/kurs https://github.com/your-org/your-repo/issues/42
```

`$ARGUMENTS` にはチケットID・URL・または作業内容テキストを渡します。

## フロー概要

```
kouunryuusui
│
├─ 入力判定: Epic/US チケット or 実装チケット?
│   ├─ Epic/US → 上位フロー（設計→分割→下位フローをループ）
│   └─ 実装チケット → 下位フロー（実装→PR）
│
├─ 上位フロー (Epic Level): E1〜E4
│   ├─ E1: AC品質チェック & 仕様把握
│   ├─ E2: アーキテクチャ設計（DB/API/UI/設計図）
│   ├─ E3: チケット分割 & 依存グラフ生成
│   └─ E4: チケット実行ループ（Native Team 並列実行）
│
└─ 下位フロー (Ticket Level): T0〜T5
    ├─ T0: AC品質チェック（必須）
    ├─ T1: Worktree 作成 & 隔離
    ├─ T2: モック/スケルトン（UI変更時のみ）
    ├─ T3: 実装（TDD）
    ├─ QG: 品質ゲート（ビルド→レビュー→修正ループ）
    └─ T5: Push確認 & PR作成（唯一の停止点）
```

## 核心原則

- **品質は速度に優先する**: テストは境界値・異常系まで書く
- **T5のみ停止**: T3→QG→T5 は一気通貫。途中確認なし
- **自律判断**: 判断に迷ったら Decision Record を書いて進む

## 動作要件

- [Claude Code](https://claude.ai/code) CLI
- Claude Code Native Teams（E4 並列実行に使用）

## ライセンス

MIT
