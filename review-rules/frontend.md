# フロントエンド レビュー観点（TypeScript / React）

## 言語非依存: PR description の受入条件（AC）と実装を一致させる

**出典**: PR #2976（APP-1386）

### 問題

PR description に「AC-1〜AC-9 全対応」と書きながら、実装では一部 AC が未達成だった（権限スコープ：「HR / DM / マネージャー いずれかを許可」と書いていたが実装は `isHumanResourcesOperator` 単独で、DM/Manager が画面に到達できず AC-6 未達成）。レビュアーが PR description と実装を突き合わせて不一致を検知した。

### ❌ NG: PR description が実装と乖離

```markdown
## 概要
5タブナビを新設。**AC-1〜AC-9 全対応**。

### 権限スコープ（AC-6）
- `HUMAN_RESOURCES_OPERATOR` / `DECISION_MAKER` / マネージャー いずれかを許可
```

↑ 実装は HR 単独で、DM/Manager は到達不可。PR説明を信じてマージするとAC未達成のまま本番に出る。

### ✅ OK: AC ごとに対応状況と実装箇所を明記

```markdown
## 概要
5タブナビを新設。

**AC 対応状況**:
- AC-1〜AC-5 / AC-7〜AC-10: 完全対応
- **AC-6 は部分対応**（5タブの権限ガード導入まで。DM/Manager 開放は後続PRで対応）

### 権限スコープ（AC-6: 部分対応）
- `reports-permission-guard.tsx`: 本PRでは HR 単独で絞る
- DM/Manager 開放は後続PR で対応（理由: ...）
```

### 書き方ルール

- PR description で AC に言及する場合は以下を守る:
  1. 「全対応」と書くなら実装と突き合わせて検証してから書く
  2. 部分対応の AC は「部分対応」「未対応部分は後続PR」と明記する
  3. ロール条件（HR/DM/Manager 等）の表記は、コード上の条件分岐と一語一語一致させる
- 実装側を修正できない場合は、**PR description を実装に合わせて修正する** のが正解（実装が真実）

### チェックポイント

- PR description に「AC-X 全対応」と書かれていないか → 書くなら実装と一致しているか検証
- 「HR/DM/Manager いずれか」等の条件表記が、コード上の条件分岐と一致しているか
- セルフレビュー時、PR description の各 AC を実装箇所（ファイル:行番号）と突き合わせる

---

## 言語非依存: APIレスポンス型変更時はFE型定義・zodスキーマを同時に更新する

**出典**: PR #3374（APP-1659）

### 問題

バックエンドのAPIレスポンス型を `List<String>` → `List<EPAlertReasonResponse>` に変更したが、フロントエンドの `types.ts` の型定義・zodスキーマが `reasons: AlertReason[]`（文字列配列）のまま取り残された。zodスキーマが `z.array(z.string())` を期待しているためパース失敗し、フロントエンドが実際のAPIレスポンスを受け取れなくなる。

### ❌ NG: BE型変更後、FE型定義を未更新のままPR作成

```typescript
// types.ts（古いまま）
export type EPAlertItem = {
  reasons: AlertReason[]  // ← BE は EPAlertReasonResponse[] を返すのに文字列配列のまま
}

// zod（古いまま）
reasons: z.array(z.string()).transform((arr) => arr.filter(isAlertReason)),
```

### ✅ OK: BE型変更と同PRでFE型定義・zodスキーマも更新する

```typescript
// types.ts
export type EPAlertReasonResponse = {
  type: AlertReason
  scope: 'QUESTION_ANSWER' | 'AGGREGATE'
  questionAnswerId: string | null
}

export type EPAlertItem = {
  reasons: EPAlertReasonResponse[]
}

// zod
reasons: z.array(z.object({
  type: z.string(),
  scope: z.enum(['QUESTION_ANSWER', 'AGGREGATE']),
  questionAnswerId: z.string().nullable(),
})).transform((arr): EPAlertReasonResponse[] =>
  arr.filter((r) => isAlertReason(r.type)).map((r) => ({ ...r, type: r.type as AlertReason }))
),
```

**チェックポイント**: Presentation 層のレスポンス型を変更したら `grep -r "reasons\|EPAlertItem" frontend/` で FE 型定義ファイルを確認し、zodスキーマの `z.string()` や `z.array(z.string())` が実態と乖離していないか検証する。PR 本文に「後方互換」と書く場合は実装と一致しているか必ず確認する。

---

## 言語非依存: スタックドPR・他人PRのレビューは「base ブランチ」のコードで裏取りする

**出典**: PR #3553（APP-1856）review-loop-duo

### 問題

PR #3553 のレビューで、Claude 4観点（architecture / semantic-consistency / performance）と Codex が**独立に**「`from infra.data_fetcher import GroupHierarchy` で ImportError」「`calculate(answers_df, hierarchy)` で TypeError」「`path` カラム欠落で KeyError」＝スクリプト実行不能、と **5源一致（CONFIRMED）** で検出した。しかし全レビュアーが作業ツリー（`main` 相当）の calculator を見ており、PR のマージ先 base ブランチ `feature/APP-1855-python-aggregation` では API が異なり（main は path 方式、base は `GroupHierarchy` 方式 + 後方互換 re-export）、スクリプトは正しく動いた。**複数モデル一致でも、全員が同じ誤った前提（base でなく main）を見れば偽陽性になる**。危うく他人PRに誤 Critical を投稿するところだった。

### ❌ NG: worktree（main）のコードでレビュー結論を断定

```bash
# main の worktree で grep して「関数が無い/シグネチャが違う」と判断
grep -rn "class GroupHierarchy" analysis/   # → main では別構成
# 「ImportError で動かない」と Critical 投稿  ← base では動くのに誤検出
```

### ✅ OK: PR の base ブランチ（マージ先）の実体を git show で確認してから結論

```bash
git fetch origin "$BASE"                 # 2>/dev/null で握りつぶさない（fetch失敗を検知）
git rev-parse "origin/$BASE"             # SHA が出れば fetch 成功
REF="origin/$BASE"; P="path/to/file.py"
git show "$REF:$P" | grep -n "def calculate"   # base のシグネチャを直接確認
# zsh では "$BASE:a" が絶対パス修飾子として誤展開される → 変数を2分割（"$REF:$P"）で回避
```

**チェックポイント**: 「import が通らない」「シグネチャ不一致」「メソッド／カラムが存在しない」系を **Critical で指摘する前に**、PR の **base ブランチ（マージ先）** の該当コードを `git show origin/<base>:<path>` で裏取りしたか。base が `main` でないスタックドPRで特に重要。`git fetch` を `2>/dev/null` でラップしてエラーを握りつぶさない。複数AIモデルが一致（CONFIRMED）していても、全員が同じ作業ツリー（main）を見ていれば共倒れの偽陽性になりうる。

---

## 更新履歴

| 日付 | 内容 | 出典 |
|------|------|------|
| 2026-04-08 | interface vs type | PR #2895 |
| 2026-04-13 | IN-001（interface vs type）を削除 — 実害なし、スタイル統一のみが理由のため |
| 2026-04-17 | PR description の AC と実装を一致させる（言語非依存） | PR #2976 |
| 2026-05-08 | APIレスポンス型変更時はFE型定義・zodスキーマを同時に更新する（言語非依存） | PR #3374 |
| 2026-05-25 | スタックドPR・他人PRは base ブランチのコードで裏取りしてから断定（言語非依存） | PR #3553 |
