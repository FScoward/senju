---
name: feature-flag-strategy
license: MIT
description: >-
  Feature Flag（機能フラグ）を使って新機能を段階的にリリースし、PRを小さく保つためのスキル。
  新機能追加時に一発の大きなPRを避け、フラグで隠しながら複数の小さなPRで段階的にリリース・検証・削除する設計とチケット分割を支援する。
  「機能フラグ」「feature flag」「段階リリース」「小さくリリースしたい」「フラグで隠す」「dark launch」「カナリアリリース」「A/Bテスト」などの発言で必ず使うこと。
  data-model-designer の Expand & Contract が「DB変更」向けであるのに対し、このスキルは「機能追加・変更」向けの段階リリース戦略を提供する。
aliases:
  - ff
  - flag
---

# feature-flag-strategy

新機能を**フラグで隠しながら段階的にリリースする**ことで、一発の大きなPRを避け、小さく何度も安全に出す設計スキル。

## このスキルが解く問題

- 新機能を作るとBE・FE・テスト・設定が一気に膨らみ、**1PRが500行超・20ファイル超**になる
- レビュアーが全体像を追えず、マージが滞る
- デプロイ後に問題が出てもロールバックの粒度が荒い（機能単位で戻せない）
- A/Bテスト・段階公開の仕組みが実装と密結合する

---

## 核心原則

1. **「マージ可能」と「ユーザーに見える」を分離する**: マージしてもフラグが OFF なら本番に影響しない → 小さなPRで頻繁にマージできる
2. **骨組み → 肉付け → 有効化 → 掃除 の順で4〜6本のPRに分ける**: 各PRはそれ単独でリバート可能
3. **フラグは必ず寿命を持つ**: 追加した瞬間に**削除チケット**を作る。永続フラグは技術的負債
4. **OFF時の振る舞いは「既存と完全同一」**: 新機能追加は既存の挙動を**1バイトも変えない**。これが小さく出せる条件

---

## フラグの4タイプ（目的別）

| タイプ | 寿命 | 代表例 | 削除義務 |
|--------|------|--------|---------|
| **Release（リリース）** | 短（1日〜数週間） | 新機能の段階公開。準備完了後ONしたら削除 | **必須** |
| **Experiment（実験）** | 中（数週間〜数ヶ月） | A/Bテスト。結果が出たら採用側を残して削除 | **必須** |
| **Ops（運用）** | 長（永続もあり） | 重い機能のkill switch、サーキットブレーカー | 任意（運用ルール明文化） |
| **Permission（権限）** | 永続 | テナント別・ロール別の機能開放 | 不要（権限機構そのもの） |

> **このスキルが主に扱うのは Release と Experiment**。Ops と Permission は設計手法が異なる（前者は運用、後者は権限モデル）。

---

## PR分割テンプレート（Release型の標準5分割）

新機能 X を feature flag 化する場合、**最小5PR**に分ける。

```
┌──────────────────────────────────────────────────────────┐
│ Feature Flag PR分割（Release型）                           │
│                                                             │
│ PR-1: Add Flag（フラグ定義追加）                              │
│   - 設定ファイル / 環境変数 / フラグ管理サービスに X を登録   │
│   - デフォルト OFF                                           │
│   - 読み取りヘルパー（isFeatureXEnabled()）を実装             │
│   - 既存コードから一切参照されない                            │
│   ✅ マージしても本番は無変化                                 │
│                                                             │
│ PR-2: Backend behind flag（BE実装、フラグ内）                 │
│   - 新API・新UseCase・新Repositoryをフラグで gate             │
│   - OFF時: 404 or 既存動作。ON時: 新動作                     │
│   - 単体テストはON/OFF両方を書く                             │
│   ✅ マージしても本番は無変化（flag OFF のため）              │
│                                                             │
│ PR-3: Frontend behind flag（FE実装、フラグ内）                │
│   - 新コンポーネント・新ルートをフラグで gate                 │
│   - OFF時: 非表示。ON時: 表示                                │
│   ✅ マージしても本番は無変化（flag OFF のため）              │
│                                                             │
│ PR-4: Enable Flag（段階有効化）                              │
│   - 開発環境でON → ステージングでON → 本番カナリアでON        │
│   - 環境ごとに別PR / 別設定変更                              │
│   ✅ 問題があればフラグをOFFに戻すだけで即時ロールバック       │
│                                                             │
│ PR-5: Remove Flag（フラグ掃除）                              │
│   - 100% ON の状態で安定稼働を確認してから                   │
│   - フラグ分岐とOFF側コードを削除                            │
│   - テストのOFF側を削除                                      │
│   - フラグ定義を削除                                         │
│   ✅ 技術的負債の回収                                         │
│                                                             │
└──────────────────────────────────────────────────────────┘
```

### 大きな機能の追加分割

PR-2 / PR-3 がそれ単体で400行を超えるなら、さらに分ける:

- PR-2a: 新UseCase骨組み + 単体テスト（APIから呼ばれない）
- PR-2b: 新Controllerから新UseCaseを繋ぐ（flag gate）
- PR-3a: 新コンポーネント単体（Storybook のみ）
- PR-3b: 画面組み込み（flag gate）

**目安**: 1PR = +400行以下 / 20ファイル以下 / 30分で読める量。

---

## チケット分割テンプレート

Epic「機能 X を追加」に対して、以下のチケット構成を推奨:

```markdown
Epic: 機能 X の追加

## チケット

1. **[FF-ADD] {X}: フラグ定義追加**
   - タイプ: 設定のみ
   - 依存: なし
   - 寿命: 削除チケット（5）とリンク必須
   - リリース順: 1st

2. **[FF-BE] {X}: BE実装（flag behind）**
   - タイプ: BE
   - 依存: 1
   - AC: OFF時は既存動作と完全一致、ON時は新動作
   - リリース順: 2nd

3. **[FF-FE] {X}: FE実装（flag behind）**
   - タイプ: FE
   - 依存: 2（API安定後）
   - AC: OFF時は非表示、ON時は表示
   - リリース順: 3rd

4. **[FF-ENABLE] {X}: フラグ段階有効化**
   - タイプ: 設定 + 運用
   - 依存: 3
   - 手順: dev → staging → prod canary → prod 100%
   - リリース順: 4th（環境ごとに個別）

5. **[FF-REMOVE] {X}: フラグ削除**
   - タイプ: BE + FE + 設定（クリーンアップ）
   - 依存: 4（100% ON + 安定稼働 N日）
   - 期限: Addから{期限}まで
   - リリース順: 5th（最終）
```

**期限ルール（推奨）**:
- Release型フラグ: **追加から90日以内**に削除チケット完了
- Experiment型: **結果判定後14日以内**に削除

---

## ワークフロー

### Step 1: フラグ化すべきか判定

以下のいずれかに該当したらフラグ化を検討:

- [ ] 実装期間が2週間以上になる見込み
- [ ] BE/FE の両方に跨る
- [ ] 既存コードパスを置き換える（移行リスクあり）
- [ ] 段階公開したい / A/Bテストしたい
- [ ] 問題発生時に**ユーザーに見えない形で**切り戻したい

**全て該当しない** → フラグ化せず通常のPR分割（BE/FE分離など）で十分。

### Step 2: フラグタイプ決定

上記の表から Release / Experiment / Ops / Permission を選ぶ。
Release 以外は寿命・削除条件を設計ドキュメントに明記する。

### Step 3: チケット分割とリリース戦略

テンプレートに従い5〜N個のチケットを作る。各チケットに以下を含める:

- **フラグキー**: `feature.{domain}.{name}`（例: `feature.survey.new_dashboard`）
- **デフォルト値**: 常に `false`（OFF）
- **ON/OFF時の挙動**: AC形式で具体化
- **削除条件**: 「100% ON で N日間ログエラー0件」等
- **削除チケットへのリンク**: Addチケット作成時に必ずRemoveチケットも作る

### Step 4: 実装時の原則

**BE実装**:
```kotlin
// ✅ OK: フラグ判定を境界層で行う
class FooController(private val featureFlags: FeatureFlags) {
    fun get(): Response {
        if (!featureFlags.isEnabled("feature.x.new_flow")) {
            return legacyHandler.handle()
        }
        return newHandler.handle()
    }
}

// ❌ NG: ドメイン層にフラグを漏らす
class FooUseCase(private val featureFlags: FeatureFlags) {
    fun execute() {
        val result = calculate()
        if (featureFlags.isEnabled("feature.x.new_flow")) {
            // ドメインロジックにフラグが混入 → 削除時に地獄
        }
    }
}
```

**FE実装**:
```tsx
// ✅ OK: ルーティング or コンポーネント境界でgate
function Routes() {
  const { isEnabled } = useFeatureFlag("feature.x.new_dashboard");
  return isEnabled ? <NewDashboard /> : <LegacyDashboard />;
}

// ❌ NG: 細かい分岐が散らばる（削除時に辿れない）
function Dashboard() {
  return (
    <>
      {isEnabled("feature.x.header") && <NewHeader />}
      {isEnabled("feature.x.footer") && <NewFooter />}
      {/* ...20箇所に散在 */}
    </>
  );
}
```

**テスト**:
- ON/OFF 両方のパスをユニットテストで網羅
- E2Eは ON側のみでOK（OFFは既存テストで担保）

### Step 5: 段階有効化

以下の順で有効化する。**各段階を別PRまたは別設定変更にする**:

| 環境 | 対象 | 確認項目 |
|------|------|---------|
| dev | 全員 ON | 基本動作 |
| staging | 全員 ON | QA観点の網羅テスト |
| prod | 内部ユーザー（社員）のみ | 本番データでの動作 |
| prod | canary（例: 5%） | エラー率・レイテンシ |
| prod | 段階拡大（25% → 50% → 100%） | 各段階で1日以上監視 |

**問題検知時**: フラグを OFF に戻す。コードのリバートは不要。

### Step 6: フラグ削除（掃除）

100% ON で安定稼働を確認したら、**Addチケットとリンクされた削除チケット**を実行:

1. フラグ分岐を削除（`if` の else 側を削除）
2. OFF側コードを削除（旧実装を丸ごと消す）
3. フラグ定義を削除（設定ファイル / 管理サービス）
4. テストの OFF ケースを削除
5. ドキュメントからフラグへの言及を削除

---

## アンチパターン

### ❌ NG: フラグ地獄（Flag Hell）

```kotlin
if (flagA) {
    if (flagB) {
        if (!flagC) { ... } else { ... }
    }
}
```
**対策**: フラグは **1機能 = 1フラグ**。粒度を揃える。ネストが3以上になったら設計見直し。

### ❌ NG: 永続化したRelease型フラグ

「いつか消す」と言って1年以上残っているフラグ。
**対策**: Addチケット作成時に**必ず期限付きの削除チケットを作る**。期限超過で自動アラート。

### ❌ NG: ドメイン層へのフラグ漏出

UseCase / Entity / ValueObject の中に `isEnabled()` が出てくる。
**対策**: フラグ判定は Presentation / Controller / Routing など**境界層のみ**。ドメイン層は OFF/ON を知らない。

### ❌ NG: テストの OFF 側未実装

ONのテストだけ書いて、OFFは「既存だから」とスキップ。
**対策**: フラグ導入PRのテストは**必ずOFF側も検証**。OFF時は既存コードと完全同一の振る舞いであることを証明する。

### ❌ NG: フラグ追加と機能実装を同一PRに混ぜる

PR-1 が「フラグ定義 + 新機能実装 + 有効化」を全部含む。
**対策**: テンプレートの5分割を守る。フラグ定義PRは**既存コードから参照されない**状態で出す。

---

## チェックリスト

### 設計時
- [ ] フラグタイプ（Release / Experiment / Ops / Permission）を決定した
- [ ] フラグキーの命名規則（`feature.{domain}.{name}`）に従っている
- [ ] Addチケットと Removeチケットをセットで作成した
- [ ] 削除期限を設定した（Release: 90日、Experiment: 結果判定後14日）
- [ ] OFF時の振る舞いが「既存と完全同一」であることをACに明記した

### 実装時
- [ ] フラグ判定を境界層（Controller / Routing）に限定している
- [ ] ドメイン層（UseCase / Entity）にフラグが漏れていない
- [ ] ON/OFF 両方のユニットテストがある
- [ ] 1PR が +400行以下 / 20ファイル以下に収まっている

### 有効化時
- [ ] dev → staging → prod canary → prod 100% の順で段階有効化した
- [ ] 各段階で1日以上監視した
- [ ] ロールバック手順（フラグOFF）を事前に確認した

### 削除時
- [ ] 100% ON で N日間エラー0件を確認した
- [ ] フラグ分岐・OFF側コード・定義・テストを全て削除した
- [ ] ドキュメントからフラグへの言及を削除した

---

## kouunryuusui との関係

`kouunryuusui` スキルの E3（チケット分割）で、**機能追加チケット**を検出したら本スキルを呼び出してフラグ化を検討する:

| E3で検出する条件 | 本スキルの使用判定 |
|----------------|-----------------|
| 新機能追加 & 実装期間2週間以上 | フラグ化推奨 |
| 既存機能の置き換え | フラグ化必須（段階移行用） |
| 小さなバグ修正 / 単純なリファクタリング | フラグ化不要 |
| DBスキーマ変更のみ | Expand & Contract を使う（本スキルは不要） |

DB変更を伴う機能追加は、**Expand & Contract（DB側） + Feature Flag（アプリ側）**の組み合わせで設計する。

---

## 参考

- Martin Fowler "Feature Toggles (aka Feature Flags)" — <https://martinfowler.com/articles/feature-toggles.html>
- Pete Hodgson の4タイプ分類（Release / Experiment / Ops / Permission）
