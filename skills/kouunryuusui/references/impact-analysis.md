# E2a: 影響範囲調査チェックリスト（コード波及）

E2a（影響範囲調査）で `Explore` 並列エージェントに渡す **明示的なチェックリスト**。
「3 並列で見ろ」だけでは観点が抜けるため、各エージェントが必ず潰すべき観点をここに定義する。

> **位置づけ**: kouunryuusui E2a は **設計フェーズ**。徹底的に網羅する。
> 軽量な AC 補完用の影響範囲確認は `refine-ticket` 側の `impact-analysis.md` を使う。
> 両者は同じ 7 観点フレームを共有するが、深度が異なる。

---

## 観点フレーム（7観点）

| # | 観点 | 中核質問 |
|---|------|---------|
| 1 | 呼び出し元（Upstream） | 修正対象を **誰** が呼んでいるか |
| 2 | 呼び出し先（Downstream） | 修正対象は **何** に依存しているか |
| 3 | データフロー（Read/Write） | 修正対象のデータが他機能でどう使われているか |
| 4 | 契約・型・スキーマ | 修正対象の I/O 契約が **どこ** に波及するか |
| 5 | 既存テスト | 既存テストの **どれ** が壊れるか / 補強が必要か |
| 6 | 横断的関心事 | アクセス制御・監査・キャッシュ・トランザクション境界はどうか |
| 7 | リリース順序・互換性 | 段階リリース・E&C・feature flag は必要か |

---

## 並列エージェント割当

### Agent A: バックエンド（Domain / UseCase / Infrastructure / Presentation）

**主担当: 観点 1, 2, 6**

```
1. Upstream（呼び出し元）
   - 修正対象のクラス / 関数 / interface の参照箇所を全件列挙
     rg -n "ClassName|methodName|InterfaceName" src/main/kotlin/
     ast-grep -p 'ClassName($$$)' --lang kotlin
   - 修正対象の API エンドポイントを呼んでいる箇所
     rg -n "@RequestMapping|@GetMapping|@PostMapping.*'/path'" src/
   - DI で注入されている箇所（Controller / 他 UseCase / Job）

2. Downstream（呼び出し先）
   - 修正対象が呼ぶ Repository / 別 UseCase / 外部 API クライアント
   - トランザクション境界（@Transactional / transaction { } の入れ子）
   - 例外契約（throws / Result 型 / nullable 戻り値）

6. 横断的関心事
   - アクセス制御: AccessScopeResolver / @PreAuthorize / テナント分離ガード
   - 監査ログ: AuditLog 呼び出しの有無
   - キャッシュ: @Cacheable / 手動キャッシュ invalidate
   - イベント発行: ApplicationEventPublisher / Outbox パターン
```

### Agent B: フロントエンド（コンポーネント / hooks / 型 / API 呼び出し）

**主担当: 観点 1, 4**

```
1. Upstream（呼び出し元）
   - 修正対象のコンポーネント / hook / 型定義 / Server Action の参照
     rg -n "ComponentName|useHookName|TypeName" src/ app/
   - 修正対象の Server Action 呼び出し箇所
   - ルーティング / リンク経由のエントリポイント

4. 契約・型・スキーマ
   - zod スキーマと BE レスポンス型の整合
   - enum / リテラル union の網羅性（switch / 三項演算子の全分岐）
   - React Query キー / SWR キー（tenantId / userId プレフィックスの有無）
   - optimistic update / cache invalidate 範囲
```

### Agent C: DB / 設定 / マイグレーション / バッチ / インフラ

**主担当: 観点 3, 7**

```
3. データフロー（Read/Write）
   - 修正対象テーブル / カラムを書く別 UseCase / 別バッチ
     rg -n "table_name|column_name" src/main/ infrastructure/
   - 修正対象テーブル / カラムを読む集計 / レポート / エクスポート
   - マスキング・暗号化対象カラムが含まれているか
   - 同時更新リスク（楽観ロック・FOR UPDATE）

7. リリース順序・互換性
   - BE / FE / DB マイグレーション / Terraform / Cloud Scheduler の順序
   - 旧クライアント・in-flight データとの互換性
   - feature flag の必要性（既存ユーザーへの露出制御）
   - E&C 戦略の必要性（破壊的 DB 変更 / 破壊的 API 変更）
```

---

## 共通観点（全 Agent が見る）

### 5. 既存テスト（Test fallout）

各 Agent が自分の領域で **壊れる/補強すべき既存テスト** を列挙する:

```bash
rg -n -l "ClassName|methodName|ComponentName" src/test/ test/ __tests__/
```

- 期待値が変わるテスト
- モック設定の更新が必要なテスト
- 削除すべきテスト（旧仕様検証）
- 追加が必要なテスト（回帰防止 / 新規ガード）

---

## 出力フォーマット

`design.md` の冒頭に **影響範囲レポート** セクションを挿入する。
各観点ごとに「該当なし」も明記する（沈黙は「見落とし」と区別が付かない）。

```markdown
# 影響範囲レポート

## 1. 呼び出し元（Upstream）

### BE
- `EPAlertManagementController:97` — `?: fallback` を `requireNotNull` に変更で例外契約が変わる
- `EPAggregationBatch:142` — 同じ UseCase を呼んでいる。並行更新の検討必要

### FE
- `use-fetch-ep-alert-list.ts:42` — レスポンス型変更で zod 更新が必要
- `alert-state-dropdown.tsx:17` — `ALERT_STATE_META` の網羅性更新

## 2. 呼び出し先（Downstream）

### BE
- `EPAlertRepository.listBy` — projectId バリデーション追加で例外契約が変わる
- `AuditLogService.record` — 操作ログ追加で呼び出し増

## 3. データフロー（Read/Write）

- `ep_alert_flags` テーブル: 書き手 = `CreateEPAlertActionUseCase`, `UpdateEPAlertStateUseCase`
  読み手 = `EPAlertManagementController`, `EPAggregationBatch`
  → 並行更新リスクあり → AC4 でテナント別ロック検証

- マスキング対象: `ep_employee_alerts.alert_reasons` (HARASSMENT) → アクセス制御層で除外

## 4. 契約・型・スキーマ

- `EPAlertState` enum に `CLOSED` 追加 → FE `ALERT_STATE_META` / BE `when` 網羅性
- `EPAlertItemResponse.alertFlagId` 追加 → FE zod schema 更新必須
- DB スキーマ変更なし

## 5. 既存テスト

### BE
- `EPAlertManagementControllerTest.kt`: 5 ケースの期待値更新
- `EPAggregationBatchTest.kt`: 並行更新ケース追加が必要

### FE
- `use-fetch-ep-alert-list.test.ts`: モック更新 (2 ケース)
- `alert-state-dropdown.test.tsx`: 新 enum 値テスト追加

## 6. 横断的関心事

- **アクセス制御**: テナント分離既存。projectId 検証追加で IDOR ガード強化（AC5）
- **監査ログ**: 状態変更時の AuditLog 追記必須（AC6）
- **トランザクション**: 既存 transaction 内で動く。新規 transaction 不要
- **キャッシュ**: React Query の `['alerts', projectId]` を invalidate
- **イベント発行**: なし

## 7. リリース順序・互換性

- BE → FE の順
- 旧 FE クライアントとの互換性: 新フィールドは nullable で後方互換
- E&C: 該当なし
- feature flag: 該当なし
- DB マイグレーション: なし
```

---

## E2b への申し送り

影響範囲レポートで以下が判明したら、E2b（設計ドキュメント作成）の入力として明示する:

- **複雑度判定材料**: 変更ファイル数・レイヤー数の実測値
- **E&C 必要性**: 観点 4 / 7 で破壊的変更が見つかった場合
- **分割候補**: 観点 1 / 3 で独立可能な領域が見つかった場合 → E3 分割戦略の根拠
- **AC 追加候補**: 観点 5 / 6 で既存 AC に無い回帰・副作用が見つかった場合 → spec.md 更新

---

## アンチパターン

| アンチパターン | 問題 | 改善 |
|---------------|------|-----|
| Agent A/B/C が独立に動いて統合されない | レイヤー横断の波及が見落とされる | 統合フェーズで 7 観点を必ず突き合わせる |
| 「該当なし」を書かない | 見落としか確認済か区別不能 | 該当なしも明示 |
| grep 結果の生コピペだけ | 影響の有無の判断が抜ける | 各ヒットに「影響あり/なし/要調査」を付ける |
| FE 側だけ見て BE 側を見ない | 全体波及を見落とす | Agent A/B/C を必ず並列起動 |
| 既存テスト fallout を後回しにする | T3 でテスト破壊に気づき手戻り | 観点 5 を E2a で必ず潰す |

---

## refine-ticket 連携

`refine-ticket` も同じ 7 観点フレームを使う。E1 で `refine-ticket` が生成した
**軽量影響範囲レポート**（spec-draft.md）を、E2a の出発点として読み込んでよい。

E2a 完了時点でこの軽量レポートを **設計レベルで深堀した完全版** に差し替え、
`design.md` に格納する。SSOT は設計フェーズ以降 `design.md` に移る。
