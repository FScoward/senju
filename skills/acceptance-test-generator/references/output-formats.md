# 出力形式サンプル集

acceptance-test-generator が生成できる各出力形式の例。

---

## markdown（デフォルト）

テーブル形式。スプレッドシートへの貼り付け・Jira/Notion への貼り付けに向く。

```markdown
## 受け入れテストケース: {機能名}

**対象**: {API / UI / CLI / etc}
**提供価値**: {誰の何が変わるか}
**生成日**: {date}

| TC-ID | 観点 | シナリオ | 前提条件 | 操作/入力 | 期待結果 | 優先度 |
|---|---|---|---|---|---|---|
| AT-XXX-001 | 正常系 | ... | ... | ... | ... | P1 |
```

---

## gherkin

Cucumber / Behave / RSpec (with Turnip) など BDD フレームワーク向け。

```gherkin
Feature: {機能名}
  # 提供価値: {誰の何が変わるか}

  Background:
    Given {全シナリオ共通の前提条件}

  Scenario: {TC-ID} {シナリオ名}
    Given {前提条件}
    When {操作/入力}
    Then {期待結果}
    And {追加の期待結果}

  Scenario Outline: {TC-ID} {シナリオ名（パラメータ化）}
    Given {前提条件}
    When <パラメータ> を入力する
    Then <期待結果> が返る

    Examples:
      | パラメータ | 期待結果 |
      | 値1       | 結果1   |
      | 値2       | 結果2   |
```

---

## code:pytest

Python + pytest のスケルトン。実装は `# TODO:` で残す。

```python
"""
受け入れテスト: {機能名}
提供価値: {誰の何が変わるか}
"""
import pytest

class TestUserRegistration:
    """AT-USR: ユーザー登録"""

    def test_AT_USR_001_valid_registration(self, api_client, db):
        """正常系: 有効な情報で登録成功"""
        # Arrange
        payload = {"name": "田中", "email": "valid@example.com", "password": "Secure123!"}
        # Act
        response = api_client.post("/api/users", json=payload)
        # Assert
        assert response.status_code == 201
        assert "user_id" in response.json()

    def test_AT_USR_002_duplicate_email(self, api_client, db):
        """入力エラー: メールアドレス重複"""
        # Arrange: 事前にユーザーを作成
        db.insert_user(email="dup@example.com")
        payload = {"name": "田中", "email": "dup@example.com", "password": "Secure123!"}
        # Act
        response = api_client.post("/api/users", json=payload)
        # Assert
        assert response.status_code == 409
        assert response.json()["error"] == "email_already_exists"

    @pytest.mark.parametrize("password,expected_status", [
        ("Abcd123!", 201),  # 8文字ちょうど（最小長）
        ("Abcd12!", 400),   # 7文字（最小長未満）
    ])
    def test_AT_USR_004_005_password_boundary(self, api_client, password, expected_status):
        """境界値: パスワード長の境界"""
        payload = {"name": "田中", "email": f"test_{len(password)}@example.com", "password": password}
        response = api_client.post("/api/users", json=payload)
        assert response.status_code == expected_status
```

---

## code:jest

TypeScript + Jest のスケルトン。

```typescript
/**
 * 受け入れテスト: {機能名}
 * 提供価値: {誰の何が変わるか}
 */
describe('AT-USR: ユーザー登録', () => {
  describe('AT-USR-001: 正常系 - 有効な情報で登録成功', () => {
    it('201 と user_id を返す', async () => {
      // Arrange
      const payload = { name: '田中', email: 'valid@example.com', password: 'Secure123!' };
      // Act
      const res = await request(app).post('/api/users').send(payload);
      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('user_id');
    });
  });

  describe('AT-USR-002: 入力エラー - メールアドレス重複', () => {
    beforeEach(async () => {
      await db.insertUser({ email: 'dup@example.com' });
    });

    it('409 Conflict と error コードを返す', async () => {
      const res = await request(app).post('/api/users').send({
        name: '田中', email: 'dup@example.com', password: 'Secure123!'
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('email_already_exists');
    });
  });

  describe('AT-USR-004/005: 境界値 - パスワード長', () => {
    test.each([
      ['Abcd123!', 201, '8文字（最小長ちょうど）'],
      ['Abcd12!',  400, '7文字（最小長未満）'],
    ])('password="%s" → %i (%s)', async (password, expectedStatus) => {
      const res = await request(app).post('/api/users').send({
        name: '田中', email: `test_${password.length}@example.com`, password
      });
      expect(res.status).toBe(expectedStatus);
    });
  });
});
```

---

## code:rspec

Ruby + RSpec のスケルトン。

```ruby
# 受け入れテスト: {機能名}
# 提供価値: {誰の何が変わるか}

RSpec.describe 'AT-USR: ユーザー登録', type: :request do
  describe 'AT-USR-001: 正常系 - 有効な情報で登録成功' do
    it '201 と user_id を返す' do
      post '/api/users', params: { name: '田中', email: 'valid@example.com', password: 'Secure123!' }
      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body)).to include('user_id')
    end
  end

  describe 'AT-USR-002: 入力エラー - メールアドレス重複' do
    before { create(:user, email: 'dup@example.com') }

    it '409 Conflict と error コードを返す' do
      post '/api/users', params: { name: '田中', email: 'dup@example.com', password: 'Secure123!' }
      expect(response).to have_http_status(:conflict)
      expect(JSON.parse(response.body)['error']).to eq('email_already_exists')
    end
  end
end
```

---

## json

CI 連携・チケット自動起票向けの構造化データ。

```json
{
  "feature": "{機能名}",
  "value": "{提供価値}",
  "generated_at": "{ISO8601}",
  "test_cases": [
    {
      "id": "AT-USR-001",
      "perspective": "正常系",
      "scenario": "有効な情報で登録成功",
      "preconditions": ["DB に 'valid@example.com' が存在しない"],
      "input": {"name": "田中", "email": "valid@example.com", "password": "Secure123!"},
      "expected": {"status": 201, "body_contains": ["user_id"]},
      "priority": "P1"
    },
    {
      "id": "AT-USR-002",
      "perspective": "入力エラー",
      "scenario": "メールアドレス重複",
      "preconditions": ["DB に 'dup@example.com' が存在する"],
      "input": {"email": "dup@example.com"},
      "expected": {"status": 409, "body": {"error": "email_already_exists"}},
      "priority": "P1"
    }
  ],
  "coverage": {
    "perspectives_covered": ["正常系", "入力エラー", "境界値", "権限", "副作用"],
    "p1_count": 5,
    "p2_count": 3,
    "p3_count": 1
  }
}
```
