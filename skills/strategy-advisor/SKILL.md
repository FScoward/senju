---
name: strategy-advisor
description: >-
  タスクの規模・複雑度・依存関係を分析し、advisorと協議した上で
  「どの実行戦略（team / 並列sub-agent / 逐次sub-agent / 直接実装）が最適か」を提案するスキル。
  undineが「どのスキルを使うか」を案内するのに対し、このスキルは「どう実行するか」の戦略設計に特化する。
  「どう進めればいい？」「teamとsub-agentどっちがいい？」「作業方針を教えて」
  「strategy-advisor」「戦略を相談したい」「どのエージェント構成がいい？」
  「並列でやるべき？」「一人でやるべき？」などの発言で必ず使うこと。
model: opus
license: MIT
---

# strategy-advisor — 作業戦略アドバイザー

タスクの内容をリポジトリと照らし合わせ、**advisor と協議**して
最適な実行戦略を提案する。

---

## 発火条件（明示トリガー専用）

このスキルは **ユーザーが明示的に呼び出した場合のみ** 発火する。
「〜したい」「〜を実装して」などの作業依頼だけでは自動発火しない（それは undine の役割）。

| トリガー | 例 |
|---------|---|
| スキル名 | `strategy-advisor`、`/strategy-advisor` |
| 戦略相談 | 「どう進めればいい？」「作業方針を教えて」 |
| 構成相談 | 「teamとsub-agentどっちがいい？」「どのエージェント構成がいい？」 |
| 並列検討 | 「並列でやるべき？」「一人でやるべき？」 |

---

## 4つの実行戦略

| 戦略 | 向いている場面 | 目安 |
|------|------------|------|
| **直接実装** | 変更ファイル数が少ない・依存シンプル | <5 ファイル、<100 行 |
| **逐次 sub-agent** | タスク間に順序依存がある | A が終わらないと B を始められない |
| **並列 sub-agent** | 独立したタスクが複数ある | 各タスクが共有状態を持たない |
| **team モード** | 複数フェーズ×複数エージェントが必要 | 設計→実装→レビュー→修正 の統合フロー |

---

## フロー

### Step 1: タスクの把握

ユーザーの発言から以下を抽出する：

| 項目 | 確認すること |
|------|-----------|
| **目的** | 何を達成したいか |
| **規模感** | 変更ファイル数・行数の見当 |
| **依存関係** | タスク間に順序制約があるか |
| **独立性** | 並行して進められるサブタスクがあるか |
| **フェーズ数** | 計画→実装→レビュー など何段階か |

情報が不足している場合は **2択か3択** で確認する（自由記述で聞かない）。

---

### Step 2: リポジトリ探索

タスクに関係するコードを調査して、実際の複雑度を把握する。

```bash
# 変更予定のファイル/ディレクトリを特定
find . -type f -name "*.md" | head -5   # スキル/ドキュメントの規模感
git log --oneline -5                    # 最近のコミット粒度
git diff --stat origin/main..HEAD 2>/dev/null || echo "mainと同じ"
```

調査のポイント：
- **ファイル数**: 何ファイル触るか
- **依存グラフ**: A を変えると B/C も変わるか
- **既存パターン**: 過去の類似タスクはどう実装されたか

---

### Step 3: advisor() を呼ぶ

リポジトリ探索の結果を踏まえて、必ず `advisor()` を呼び出す。

```
advisor()
```

**advisor に期待すること**：
- 見落としている依存・リスクの指摘
- 推奨する実行戦略の根拠
- チームサイズ・モデル選択の提言

advisor の回答を受けて、矛盾がある場合は再度 `advisor()` で確認する。

> **注意**: advisor は会話履歴全体を見ている。
> Step 1〜2 の情報がコンテキストに入っていれば追加プロンプトは不要。

---

### Step 4: 戦略を決定・出力

以下のフォーマットで提案を出力する：

```
## 実行戦略の提案

**タスクの要約**: [1行でタスク内容を要約]

---

### 推奨戦略: [直接実装 / 逐次 sub-agent / 並列 sub-agent / team モード]

**なぜ？**
- [advisor の意見を踏まえた根拠 1]
- [根拠 2]

**実行イメージ**
[擬似コードまたは自然言語でエージェント構成を示す]

---

### 代替案（あれば）
**[代替戦略名]**: [どんな場合にこちらを選ぶか]

---

### リスクと留意点
- [依存関係・順序制約・競合リスクなど]

---

### 次のアクション
> [ユーザーが「OK」と言えばすぐ実行できる次の一手]
```

---

### Step 5: 実行（ユーザーが承認した場合）

ユーザーが「OK」「そのまま進めて」「実行して」と言ったら、
提案した戦略で即座に実行を開始する。

#### 直接実装の場合

そのまま実装する。sub-agent への委譲は不要。

#### 逐次 sub-agent の場合

```
# Step A が完了してから Step B を実行
Agent({ prompt: "Step A: ...", subagent_type: "oh-my-claudecode:executor" })
# ↑完了後↓
Agent({ prompt: "Step B: ...", subagent_type: "oh-my-claudecode:executor" })
```

#### 並列 sub-agent の場合

```
# 1つのメッセージで複数の Agent ツールを呼ぶ（並列実行）
Agent({ prompt: "Task A: ...", subagent_type: "oh-my-claudecode:executor" })
Agent({ prompt: "Task B: ...", subagent_type: "oh-my-claudecode:executor" })
Agent({ prompt: "Task C: ...", subagent_type: "oh-my-claudecode:executor" })
```

#### team モードの場合

```
# team スキルを起動
Skill({ skill: "oh-my-claudecode:team", args: "[タスク内容]" })
```

---

## エージェント選択ガイド

| タスクの性質 | 推奨エージェント | モデル |
|------------|--------------|-------|
| コード探索・調査のみ | `explore` | haiku |
| 実装・リファクタ（標準） | `executor` | sonnet |
| 複雑な自律実装 | `deep-executor` | opus |
| バグ調査・根本原因特定 | `debugger` | sonnet |
| アーキテクチャ設計 | `architect` | opus |
| テスト戦略 | `test-engineer` | sonnet |
| コードレビュー（総合） | `code-reviewer` | opus |
| セキュリティ確認 | `security-reviewer` | sonnet |

---

## undine との使い分け

| スキル | 問いに答える |
|-------|-----------|
| `undine` | **何をするか**（どのスキルを使うか） |
| `strategy-advisor` | **どうやって進めるか**（team か sub-agent か） |

両者は連携できる：
`undine` でスキルを決定 → `strategy-advisor` で実行戦略を決定 → 実行

---

## 実行例（Worked Example）

**ユーザーの依頼**: 「セキュリティレビューで指摘された IDOR バグを修正したい。
`ListEPEmployeesUseCase` の `matchesTagFilter` がマスキング前に評価されている問題と、
React Query キーに `tenantId` が入っていない問題の2件。どう進めればいい？」

---

**Step 1 — タスクの把握**

| 項目 | 内容 |
|------|------|
| 目的 | IDOR バグ 2 件を修正 |
| 規模感 | バックエンド 1 ファイル + フロントエンド 1 ファイル |
| 依存関係 | 2 件は独立（BE と FE で共有状態なし） |
| 独立性 | ✅ 並行可 |
| フェーズ数 | 実装 + テスト確認（2段階） |

---

**Step 2 — リポジトリ探索結果**

```
$ git diff --stat origin/main..HEAD
（変更なし — 実装前）

$ grep -r "matchesTagFilter" src/ --include="*.kt" -l
src/main/kotlin/.../ListEPEmployeesUseCase.kt

$ grep -r "use-fetch-ep-alert-target" src/ --include="*.ts" -l
src/features/ep-alert/.../use-fetch-ep-alert-target-employees.ts
```

→ 2 ファイル、互いに独立。

---

**Step 3 — advisor の回答（要約）**

> 2 タスクは独立しており、並列 sub-agent が最適。
> ただし BE 修正にはテストが必須（IDOR は壊れたテストで検証できる）。
> FE 修正は React Query キーの変更のみなので軽量 executor で十分。

---

**Step 4 — 提案出力**

```
## 実行戦略の提案

**タスクの要約**: IDOR バグ 2 件（BE: matchesTagFilter 順序, FE: RQ キー）を並列修正

---

### 推奨戦略: 並列 sub-agent

**なぜ？**
- 2 タスクは共有状態を持たず、同時に進めてもコンフリクトしない
- BE タスクは TDD が必要（失敗テスト → 実装）でやや重い → executor/sonnet
- FE タスクは 1 箇所のキー追加のみで軽量 → executor/haiku でも可

**実行イメージ**
Agent({ prompt: "ListEPEmployeesUseCase の matchesTagFilter をマスキング後に移動。TDD で修正",
        subagent_type: "oh-my-claudecode:executor", model: "sonnet" })
Agent({ prompt: "use-fetch-ep-alert-target-employees の React Query キーに tenantId/userId を追加",
        subagent_type: "oh-my-claudecode:executor", model: "sonnet" })

---

### 代替案
**逐次 sub-agent**: BE → FE の順で慎重に進めたい場合（速度より安全性を優先）

---

### リスクと留意点
- BE 修正後に既存テストが全て通ることを確認してからマージすること

---

### 次のアクション
> 「OK」で上記 2 エージェントを同時起動します
```
