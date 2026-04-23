---
name: code-structure
license: MIT
description: コード・処理フロー・アーキテクチャを図で把握したいとき、PlantUMLで図を生成するスキル。「図にして」「クラス図出して」「シーケンス図が欲しい」「構造を把握したい」「フローを可視化して」「アーキテクチャを確認したい」「レビュー前に全体像を掴みたい」などの発言があれば積極的に使うこと。
---

# Code Structure — PlantUMLで図を生成

## 概要

コードや説明からPlantUML形式の図を生成する。
PRレビュー・設計議論・仕様確認など、全体像を掴みたいあらゆる場面で使う。

## Step 1: 図の種類を判定

ユーザーの意図から自動判定する。曖昧な場合は確認せず最適なものを選ぶ。

| 状況 | 図の種類 |
|------|---------|
| クラス・型・継承関係を見たい | クラス図 |
| APIコール・処理の流れを見たい | シーケンス図 |
| モジュール・レイヤー構成を見たい | コンポーネント図 |
| 状態遷移を見たい | ステート図 |
| 処理フロー・分岐を見たい | アクティビティ図 |
| ER図・データ構造を見たい | ER図（クラス図で代用） |

## Step 2: ソース情報の取得

**コードから生成する場合**
```bash
gh pr diff <PR番号> --name-only   # PR変更ファイル一覧
git diff origin/main --name-only  # ブランチ差分
```
対象ファイルをReadで読み込む（`.kt`, `.ts`, `.tsx`, `.java`）。

**説明から生成する場合**
ユーザーの説明をそのままインプットとして図を生成する。

## Step 3: PlantUMLを生成・出力

````
```plantuml
@startuml
...
@enduml
```
````

---

## 図の種類別テンプレート

### クラス図

```plantuml
@startuml
package "Application" {
  class GetEmployeeListUseCase {
    +invoke(query: Query): Result
  }
}

package "Domain" {
  interface EmployeeRepository {
    +findAll(tenantId: TenantId): List<Employee>
  }
  class Employee {
    +id: EmployeeId
    +name: Name
  }
}

package "Infrastructure" {
  class EmployeeRepositoryImpl implements EmployeeRepository {
    +findAll(tenantId: TenantId): List<Employee>
  }
}

GetEmployeeListUseCase --> EmployeeRepository : uses
EmployeeRepository ..> Employee : returns
@enduml
```

**よく使う記法**
| 記法 | 意味 |
|------|------|
| `<\|--` | 継承 |
| `<\|..` | 実装 |
| `-->` | 依存 |
| `*--` | コンポジション |
| `<<interface>>` | ステレオタイプ |

---

### シーケンス図

```plantuml
@startuml
actor User
participant Controller
participant UseCase
participant Repository
database DB

User -> Controller : GET /employees
Controller -> UseCase : invoke(query)
UseCase -> Repository : findAll(tenantId)
Repository -> DB : SELECT
DB --> Repository : rows
Repository --> UseCase : List<Employee>
UseCase --> Controller : Result
Controller --> User : 200 OK
@enduml
```

---

### コンポーネント図

```plantuml
@startuml
package "Presentation" {
  [EmployeeController]
}
package "Application" {
  [GetEmployeeListUseCase]
}
package "Domain" {
  [EmployeeRepository]
}
package "Infrastructure" {
  [EmployeeRepositoryImpl]
  [DB]
}

[EmployeeController] --> [GetEmployeeListUseCase]
[GetEmployeeListUseCase] --> [EmployeeRepository]
[EmployeeRepositoryImpl] ..|> [EmployeeRepository]
[EmployeeRepositoryImpl] --> [DB]
@enduml
```

---

### ステート図

```plantuml
@startuml
[*] --> Draft
Draft --> UnderReview : submit()
UnderReview --> Approved : approve()
UnderReview --> Draft : reject()
Approved --> [*]
@enduml
```

---

### アクティビティ図

```plantuml
@startuml
start
:リクエスト受信;
if (認証OK?) then (yes)
  :フィルタ適用;
  :データ取得;
  :レスポンス生成;
else (no)
  :401 Unauthorized;
  stop
endif
:200 OK;
stop
@enduml
```

---

## 注意事項

- 要素が多い場合（クラス20超など）は変更ファイルに絞るか図を分割する
- テストクラスは原則除外
- 図の後にレイヤー構成などの補足コメントを添えると親切
