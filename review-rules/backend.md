# バックエンド レビュー観点（Kotlin / Spring Boot）

## UseCase テスト: context/beforeTest/it 分離パターン

**出典**: PR #2895 CR-001

### ❌ NG: `it` ブロック内にドメインモデル作成が集中

```kotlin
context("jobTitlesフィルタ") {
    it("一致する役職の従業員のみ返る") {
        val tenant = TestTenantFactory.createAndPersist(...)
        val employee = Employee(id = EmployeeId.new(), ...)
        EmployeeHelper.persistEmployeeWithHistory(employee, hrMasterVersion)
        // ... 永続化、プロジェクト作成、実行作成 ...（60行以上）

        val result = useCase(...)
        result.isOk shouldBe true
    }
}
```

### ✅ OK: ドメインモデルを context に、When/Then を it に

```kotlin
context("jobTitlesフィルタ") {
    context("シニアエンジニアが存在する場合") {
        lateinit var tenant: Tenant
        lateinit var employee: Employee

        beforeTest {
            tenant = TestTenantFactory.createAndPersist(...)
            employee = Employee(id = EmployeeId.new(), ...)
            EmployeeHelper.persistEmployeeWithHistory(employee, hrMasterVersion)
        }

        it("一致する役職の従業員のみ返る") {
            val result = useCase(...)
            result.isOk shouldBe true
        }
    }
}
```

**チェックポイント**: `it { }` ブロックが30行を超えていたら分離を検討する。

---

## テスト: `transaction {}` 直接テーブル insert の禁止

**出典**: PR #2895 CR-002

### ❌ NG: `it` ブロック内で直接テーブルに insert

```kotlin
it("...") {
    transaction {
        SomeTable.insert {
            it[column] = value
        }
    }
}
```

### ✅ OK: ヘルパー関数または persistAsEntity を使う

```kotlin
fun insertRecord(tenantId: TenantId, ...) {
    transaction { SomeTable.insert { ... } }
}

it("...") {
    insertRecord(tenantId, ...)
    // または
    entity.persistAsEntity()
}
```

**チェックポイント**: `it { }` 内に `Table.insert {` が出てきたら必ずヘルパー化する。

---

## テスト: 同一 executionId / 集約IDを複数の it で共有しない

**出典**: PR #2895 WR-002 修正時のバグ

同一 `context` ブロック内で複数の `it` が同じ集約ID（executionId 等）を共有すると、一方のテストで追加したデータが他方に影響する。

### ❌ NG: 集約IDを context レベルで1つだけ作成

```kotlin
context("フィルタテスト") {
    val executionId = createExecution(...)  // 1つだけ

    it("データありのケース") {
        createTargetEmployee(executionId, ...)
    }
    it("データなしのケース") {
        // executionId に前の it のデータが残っている！
    }
}
```

### ✅ OK: 各 it で独立した集約IDを作成

```kotlin
context("フィルタテスト") {
    // project/settings 等は共有してよい

    it("データありのケース") {
        val executionId = createExecution(...)  // 個別に作成
        createTargetEmployee(executionId, ...)
    }
    it("データなしのケース") {
        val executionId = createExecution(...)  // 個別に作成
    }
}
```

---

## Presentation 層: 変換ロジックは Request クラスに委譲する

**出典**: PR #2895 WR-001

Controller 内でのカンマ区切り文字列パース・型変換等のロジックは Controller の責務外。

### ❌ NG: Controller 内で変換を実装

```kotlin
// Controller メソッド内
jobTitles = jobTitles?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }
```

### ✅ OK: Request クラスにパースメソッドを持たせて委譲

```kotlin
data class SomeRequest(val jobTitles: String? = null) {
    fun parseJobTitles(): List<String>? =
        jobTitles?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }
}

// Controller
jobTitles = SomeRequest(jobTitles = jobTitles).parseJobTitles()
```

---

## テスト: `OffsetDateTime.now()` / `Instant.now()` / `LocalDate.now()` の禁止

**出典**: PR #3052 レビュー（APP-1479 [2/5]）

UseCase に `Clock` を DI して決定論的に「今日」を扱う設計にしている場合、テストヘルパー側で `OffsetDateTime.now()` 等の現在時刻系 API を使うと PR 本文「決定論化済み」と実装が乖離する。テストヘルパー関数のデフォルト引数まで含めて `TestClockConfig.FIXED_TEST_TIME` ベースに統一すること。

### ❌ NG: テストヘルパーのデフォルト引数で `OffsetDateTime.now()`

```kotlin
fun persistAlert(
    tenantId: TenantId,
    executionId: EPExecutionId,
    employeeId: EmployeeId,
    state: EPAlertState,
    triggeredAt: OffsetDateTime = OffsetDateTime.now(),  // ❌ FIXED_TEST_TIME と乖離
): EPAlert { ... }

it("...") {
    val alert = EPAlert.create(
        ...,
        triggeredAt = OffsetDateTime.now(),  // ❌ UseCase の Clock と乖離
    )
}
```

**問題点**:
- UseCase が `Clock` で固定された「今日」と、テストデータの `triggeredAt` の絶対時刻にドリフトが生じる
- 期限超過判定（`isOverdue`）など日付境界に依存するロジックで、CI 実行日次第で結果が変わる
- PR 本文「決定論化」と実装の乖離をレビュアーが検知する

### ✅ OK: `TestClockConfig.FIXED_TEST_TIME` に統一

```kotlin
fun persistAlert(
    ...,
    triggeredAt: OffsetDateTime = TestClockConfig.FIXED_TEST_TIME,  // ✅ DI Clock と一致
): EPAlert { ... }

it("...") {
    val alert = EPAlert.create(
        ...,
        triggeredAt = TestClockConfig.FIXED_TEST_TIME,
    )
}
```

### チェックポイント

- 実装後・PR 作成前に下記 grep を実行し、test ディレクトリで `*.now()` が残っていないか確認する:
  ```bash
  grep -rn "OffsetDateTime\.now()\|Instant\.now()\|LocalDate\.now()" backend/src/test/kotlin
  ```
- PR 本文に「`OffsetDateTime.now()` を統一」「決定論化」と書く場合、上記 grep で 0 件であることを確認してから書く（あるいは「ヘルパー除く」等のスコープを明記）
- テストヘルパーのデフォルト引数も対象に含める（呼び出し側で省略されると見落としやすい）

---

## 更新履歴

| 日付 | 内容 | 出典 |
|------|------|------|
| 2026-04-08 | UseCase テスト分離、transaction{}禁止、集約ID共有禁止、Controller委譲 | PR #2895 |
| 2026-04-23 | テストファイルでの `*.now()` 禁止（Clock DI と一致させる） | PR #3052 |
