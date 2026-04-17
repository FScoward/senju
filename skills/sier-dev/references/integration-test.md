# 結合テスト仕様書テンプレート

このファイルは結合テスト仕様書を生成する際の構造ガイドライン。外部設計書のAPI仕様と内部設計書の処理フローを参照してテストケースを設計する。

---

## 出力構成

```markdown
# 結合テスト仕様書

## 改訂履歴

| バージョン | 日付 | 変更内容 | 担当者 |
|-----------|------|---------|-------|
| 1.0 | YYYY-MM-DD | 初版作成 | TBD |

---

## 1. テスト対象

| テストシナリオ | 対象API/機能 | テストケース数 |
|------------|-----------|------------|
| 〇〇一覧取得 | GET /api/v1/items | 4 |
| 〇〇登録 | POST /api/v1/items | 5 |
| 〇〇更新 | PUT /api/v1/items/{id} | 4 |
| 〇〇削除 | DELETE /api/v1/items/{id} | 3 |
| 認証 | POST /api/v1/auth/login | 3 |

---

## 2. テストシナリオ

### シナリオ1: 〇〇一覧取得

#### IT-001: 正常系 - 全件取得

**前提条件:**
- テストデータが3件登録されている

**リクエスト:**
```http
GET /api/v1/items
Authorization: Bearer {valid_token}
```

**期待するレスポンス:**
```json
{
  "total": 3,
  "page": 1,
  "limit": 10,
  "items": [
    { "id": "...", "name": "テストアイテム1", "category": "カテゴリA" },
    { "id": "...", "name": "テストアイテム2", "category": "カテゴリA" },
    { "id": "...", "name": "テストアイテム3", "category": "カテゴリB" }
  ]
}
```

**合否判定:** HTTPステータス200、total=3、items配列に3件が含まれること

---

#### IT-002: 正常系 - キーワード検索

**リクエスト:**
```http
GET /api/v1/items?keyword=アイテム1
Authorization: Bearer {valid_token}
```

**期待するレスポンス:** total=1、"テストアイテム1"のみ返却

**合否判定:** HTTPステータス200、total=1

---

#### IT-003: 異常系 - 未認証

**リクエスト:**
```http
GET /api/v1/items
（Authorizationヘッダなし）
```

**期待するレスポンス:**
```json
{ "code": "UNAUTHORIZED", "message": "認証が必要です" }
```

**合否判定:** HTTPステータス401

---

#### IT-004: 異常系 - パラメータ不正

**リクエスト:**
```http
GET /api/v1/items?page=-1
Authorization: Bearer {valid_token}
```

**期待するレスポンス:**
```json
{ "code": "VALIDATION_ERROR", "message": "入力値に誤りがあります" }
```

**合否判定:** HTTPステータス400

---

### シナリオ2: 〇〇登録

| IT-ID | テスト内容 | リクエスト概要 | 期待ステータス | 合否判定 |
|-------|---------|------------|------------|---------|
| IT-005 | 正常系：登録成功 | 必須項目をすべて入力 | 201 | レスポンスにIDが含まれる |
| IT-006 | 異常系：名前が空 | name="" | 400 | VALIDATION_ERROR |
| IT-007 | 異常系：名前が重複 | 既存と同じname | 409 | CONFLICT |
| IT-008 | 異常系：不正カテゴリ | 存在しないcategory_id | 404 | NOT_FOUND |
| IT-009 | 異常系：未認証 | Authorizationヘッダなし | 401 | UNAUTHORIZED |

---

## 3. 業務フローシナリオ

### フロー1: 〇〇の登録から削除までの一連操作

1. **ログイン** (POST /api/v1/auth/login)
   - 有効なID/パスワードでログイン → トークン取得
2. **登録** (POST /api/v1/items)
   - 取得したトークンで新規登録 → IDを記録
3. **一覧確認** (GET /api/v1/items)
   - 登録したアイテムが一覧に含まれることを確認
4. **更新** (PUT /api/v1/items/{id})
   - 名前を変更して更新
5. **詳細確認** (GET /api/v1/items/{id})
   - 更新内容が反映されていることを確認
6. **削除** (DELETE /api/v1/items/{id})
   - 論理削除が実行されること
7. **削除確認** (GET /api/v1/items/{id})
   - 404が返ること（削除済みのため）

---

## 4. テスト環境

| 項目 | 内容 |
|-----|-----|
| テスト対象URL | http://test-server:8080 |
| DBの状態 | テスト前に初期化スクリプトを実行 |
| テストツール | Postman / REST Assured / Supertest など |
| 実行方式 | 手動 / 自動 |

---

## 5. テスト前準備

```sql
-- テストデータ投入
INSERT INTO categories (id, name, code) VALUES
  ('aaaa0001', 'カテゴリA', 'CAT_A'),
  ('aaaa0002', 'カテゴリB', 'CAT_B');

INSERT INTO items (id, name, category_id, created_by, updated_by) VALUES
  ('item0001', 'テストアイテム1', 'aaaa0001', 'test_user', 'test_user'),
  ('item0002', 'テストアイテム2', 'aaaa0001', 'test_user', 'test_user'),
  ('item0003', 'テストアイテム3', 'aaaa0002', 'test_user', 'test_user');
```

---

## 6. テスト結果記録

| IT-ID | テスト内容 | 結果 | バグID | 備考 |
|-------|---------|-----|-------|-----|
| IT-001 | 全件取得 | ✅ PASS | - | |
| IT-002 | キーワード検索 | ❌ FAIL | BUG-001 | |
```

---

## ヒアリング項目

結合テスト仕様書を作成する際に確認する項目：

**必須確認事項：**
1. テスト対象のAPIエンドポイントは何か？（外部設計書のAPI仕様を参照）
2. テスト環境のURLは決まっているか？
3. 認証機構はあるか？
4. テストデータの管理方法は？（毎回初期化？固定データ？）
