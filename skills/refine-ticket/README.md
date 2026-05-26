# refine-ticket

既に起票済みのチケットの **description と受け入れ条件（AC）を品質基準まで磨き上げる**スキル。

`kouunryuusui` の上位フロー E1（AC 生成・品質チェック・補完）と下位フロー T0（AC 品質チェック）から
切り出した、チケット文書の「refine（磨き込み）」専用スキル。

## できること

- 抽象的・曖昧な AC（「正しく表示される」等）を、GWT+Examples 形式の具体的な AC に書き直す
- AC が無い / 1 行しかないチケットを、仕様書やコードベースから補完して実装可能にする
- 7 項目品質基準（具体性・テスト可能性・正常系網羅性・異常系・境界値・副作用・非機能要件）で
  過不足をチェックし、不足を `[補完]` マーク付きで補う
- チケットの description 本文を再構成する

## 似たスキルとの違い

| スキル | 守備範囲 |
|--------|---------|
| **refine-ticket** | **既起票チケット**の description / AC を品質基準まで磨く |
| `software-requirements` | 未起票段階の要求を対話で引き出す |
| `init-prompt` | 初回プロンプトを即席で Goal / Constraints / AC に整える |
| `kouunryuusui` | 設計→分割→実装→PR までの統合ワークフロー（本スキルを E1/T0 で呼ぶ） |

## 構成

```
refine-ticket/
├── SKILL.md                       # エントリポイント（入出力・Tier 判定・フロー）
└── references/
    ├── ac-guidelines.md           # AC 品質基準 7 項目・GWT+Examples・過不足分析（中核）
    ├── peripheral-context.md      # 存在チェック・周辺チケット参照
    └── ac-completion.md           # フォーマット修正・仕様書→US+AC 生成・出力テンプレート
```

## インストール

```bash
gh skill install FScoward/senju refine-ticket
```
