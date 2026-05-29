export const meta = {
  name: 'ikkikasei',
  description:
    '一気呵成: Epic/USチケットから設計→チケット分割→実装→QG（品質ゲート）まで自律実行する2層ワークフロー（kouunryuusui スキルのworkflow版）。push承認とadvisorはhandoffとしてメインに返す。',
  whenToUse:
    'Epic/US/実装チケットを起点に、設計・分割・TDD実装・品質ゲートを多エージェントで自律実行したいとき。push直前で停止し、承認サマリーを返す。',
  phases: [
    { title: '入力判定', detail: 'チケットタイプ(epic/ticket)・Tier・作業モードを判定' },
    { title: 'E1: 仕様/AC', detail: 'refine-ticket で AC を GWT+Examples に磨き spec-draft.md 生成' },
    { title: 'E2: 設計', detail: '影響範囲調査(3並列Explore) → 設計ドキュメント(design.md)' },
    { title: 'E3: 分割', detail: '設計に基づきチケット分割・依存グラフ(ticket-plan.md)' },
    { title: 'E4 / 下位: 実装', detail: '各チケットを worktree 隔離ワーカーで T0〜QG 実行(並列)' },
    { title: 'QG: 品質ゲート', detail: 'simplify → mihari → review-loop → qg-result.md' },
    { title: 'handoff: Push承認', detail: 'push手前で停止し承認サマリー・advisor推奨を返す' },
  ],
}

// =====================================================================
// 移植方針（忠実移植 / handoff の境界）
// ---------------------------------------------------------------------
// SKILL.md「実行環境互換」に従い、Claude Code の Skill/Agent/Team を
// workflow の agent()/parallel()/pipeline() に写像する。ただし以下は
// workflow が構造的に実行できないため return 値で handoff する:
//   - T5 push 承認 / E4 一括Push承認（唯一の停止点 = 人間判断）
//   - advisor()（メインループ専用ツール。workflow 内では呼べない）
// QG の核（simplify / mihari / review-loop / refine-ticket）はサブ
// エージェントが Skill ツールで「実際に起動」する（プローブ検証済み）。
// =====================================================================

// ---- スキーマ定義（strict） ----------------------------------------

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    flow_mode: { type: 'string', enum: ['epic', 'ticket'] },
    tier: { type: 'integer', enum: [1, 2, 3] },
    work_mode: { type: 'string', enum: ['new', 'modify'] },
    reason: { type: 'string' },
  },
  required: ['flow_mode', 'tier', 'work_mode', 'reason'],
}

const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    spec_path: { type: 'string' },
    ac_count: { type: 'integer' },
    supplemented_acs: { type: 'array', items: { type: 'string' } },
    decision_records: { type: 'array', items: { type: 'string' } },
    advisor_recommended: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['spec_path', 'ac_count', 'supplemented_acs', 'decision_records', 'advisor_recommended', 'summary'],
}

const IMPACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    affected_files: { type: 'array', items: { type: 'string' } },
    test_fallout: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'findings', 'affected_files', 'test_fallout'],
}

const DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    design_path: { type: 'string' },
    complexity: { type: 'string', enum: ['low', 'mid', 'high'] },
    db_change: { type: 'string', enum: ['none', 'additive', 'destructive'] },
    ec_required: { type: 'boolean' },
    diagrams: { type: 'array', items: { type: 'string' } },
    advisor_recommended: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['design_path', 'complexity', 'db_change', 'ec_required', 'diagrams', 'advisor_recommended', 'summary'],
}

const SPLIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    plan_path: { type: 'string' },
    strategy: { type: 'string' },
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          type: { type: 'string' },
          depends_on: { type: 'array', items: { type: 'string' } },
          ec_step: { type: 'string' },
          base: { type: 'string' },
        },
        required: ['id', 'title', 'type', 'depends_on', 'ec_step', 'base'],
      },
    },
    advisor_recommended: { type: 'boolean' },
  },
  required: ['plan_path', 'strategy', 'tickets', 'advisor_recommended'],
}

const LOWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ticket_id: { type: 'string' },
    branch: { type: 'string' },
    status: { type: 'string', enum: ['awaiting_approval', 'failed', 'escalate'] },
    change_summary: { type: 'string' },
    qg_final: { type: 'string', enum: ['PASS', 'FAIL', 'WIP'] },
    qg_result_path: { type: 'string' },
    skills_invoked: { type: 'array', items: { type: 'string' } },
    decision_records: { type: 'array', items: { type: 'string' } },
    advisor_recommended: { type: 'boolean' },
    blockers: { type: 'array', items: { type: 'string' } },
    handoff_path: { type: 'string' },
  },
  required: [
    'ticket_id', 'branch', 'status', 'change_summary', 'qg_final', 'qg_result_path',
    'skills_invoked', 'decision_records', 'advisor_recommended', 'blockers', 'handoff_path',
  ],
}

// ---- 共通プロンプト断片 ---------------------------------------------

const SKILL_BASE = '/Users/fumiyasu/.claude/skills/kouunryuusui'

const COMPAT_NOTE = `
## 実行環境メモ
あなたは workflow サブエージェントです。Skill ツールが使えます（検証済み）。
kouunryuusui の SKILL.md / references が指示する Skill 呼び出し（refine-ticket /
simplify / mihari / review-loop / managing-database-migrations 等）は「実際に Skill
ツールで起動」すること。「呼んだことにする」のは禁止（qg-result.md の信頼性が崩れる）。
artifact は worktree ルートの .claude/tmp/ に統一して書き出す。
参照ファイルの正典は ${SKILL_BASE}/SKILL.md と ${SKILL_BASE}/references/ にある。`

// ---- 引数の解釈 -----------------------------------------------------

const ticketArg =
  args && (args.ticket || args.id)
    ? args.ticket || args.id
    : typeof args === 'string' && args.trim()
      ? args.trim()
      : null

if (!ticketArg) {
  log('⚠️ args.ticket が未指定。次の形で呼んでください（scriptPath は実証済みの確実な呼び方）:')
  log('Workflow({ scriptPath: "/Users/fumiyasu/.claude/workflows/ikkikasei.js", args: { ticket: "APP-123", mode: "epic|ticket"(任意), tier: 1|2|3(任意), base: "origin/main"(任意) } })')
  log('（プロジェクトの .claude/workflows/ にこのファイルを置けば name: "ikkikasei" でも呼べる）')
  return {
    error: 'missing args.ticket',
    usage: 'Workflow({ scriptPath: "/Users/fumiyasu/.claude/workflows/ikkikasei.js", args: { ticket: "APP-123" } })',
  }
}

const forcedMode = args && args.mode ? args.mode : null
const forcedTier = args && args.tier ? args.tier : null
const defaultBase = (args && args.base) || 'origin/main'
// Tier2/3 の advisor ゲートを「フェーズ間の停止点」として機能させるための再開制御。
// 初回 = null（E1後に停止）→ メインが advisor → resume_after:'E1' で再開（E3後に停止）
// → メインが advisor → resume_after:'E3' で再開（E4まで完走）。resumeFromRunId で E1〜E3 はキャッシュ即返り。
const resumeAfter = (args && args.resume_after) || null

log(`一気呵成 起動: ticket=${ticketArg}${resumeAfter ? ` (resume_after=${resumeAfter})` : ''}`)
log('【移植方針】E1〜E3 / E4並列 / T0〜QG を忠実移植。push停止点(T5・E4一括承認)は return で handoff。advisor(Tier2/3) は E1後/E3後のチェックポイント停止で実現。')

// =====================================================================
// 下位フロー（1チケット = 1ワーカー、worktree 隔離）
//   lower-flow.md の「T1〜T5をワーカー単位で実行」に忠実。
//   T0(AC品質)→T1(worktree)→T2(mock)→T3(TDD)→QG(品質ゲート)→T5手前で停止。
// =====================================================================

function lowerFlowPrompt(ticket, ctx) {
  const id = typeof ticket === 'string' ? ticket : ticket.id
  const title = typeof ticket === 'string' ? '' : ` (${ticket.title})`
  const depends = typeof ticket === 'string' ? [] : ticket.depends_on || []
  const base = (typeof ticket === 'object' && ticket.base) || ctx.base
  return `チケット ${id}${title} の下位フロー（T0〜QG、T5手前まで）を自律実行せよ。
${COMPAT_NOTE}

## コンテキスト
- Tier: ${ctx.tier}（QG修正ループ上限 = Tier1:3 / Tier2,3:5）
- 作業モード: ${ctx.workMode}（modify の場合「既に実装済み」を理由にステップをスキップしない）
- base ブランチ: ${base}
- 依存チケット: ${depends.length ? depends.join(', ') : 'なし'}
${ctx.specPath ? `- 仕様(AC): ${ctx.specPath} の ${id} 該当分` : ''}
${ctx.designPath ? `- 設計: ${ctx.designPath} の ${id} 該当セクション` : ''}
${ctx.planPath ? `- 依存グラフ: ${ctx.planPath}` : ''}

## 実行手順（${SKILL_BASE}/references/lower-flow.md を必ず読んでから着手）
1. **T0 AC品質**: refine-ticket スキルを起動し AC を GWT+Examples・7項目網羅まで磨く。
   補完(\`[補完]\`)は .claude/tmp/decisions/ に DR 化。（上位フロー経由で spec.md に磨き込み済みなら再実行不要）
2. **T1 Worktree隔離**: あなたは実リポジトリ上で動いている（workflow 側の一時隔離は無効）。
   base=${base} から feature/${id} ブランチを作り、\`git worktree add\` で隔離 worktree を作って cd する。
   このブランチとコミットは実リポジトリに永続し、push 承認・stacked/E&C 後続チケットの base 解決に使われる。
   .claude/tmp/base-branch.txt に base を記録。scratch.md と .claude/tmp/decisions/ を用意。
   （並列ワーカーは各自 feature ブランチ・worktree が異なるため衝突しない。マイグレーションファイルは PR 直前に作成して名前衝突を避ける）
3. **T2 モック/スケルトン**: UI変更がある場合のみ。なければスキップ。
4. **T3 実装(TDD)**: sprint-contract.md に検証基準を定義 → Red→Green→Refactor。
   異常系・境界値・エッジケースまでテストを書く。リファクタを省略しない。
   BE+FE両方あるなら可能な範囲で並行実装。${SKILL_BASE}/references/tdd-quality.md に従う。
5. **QG 品質ゲート（T3完了後、判断・確認なしで即起動）**:
   - QG-1: BE \`./gradlew ktlintFormat && ./gradlew build\` / FE \`npm run check:fix && (cd frontend && npm run typecheck) && npm test\`
   - QG-2: simplify スキルを起動（対象は base...HEAD の PR 全差分。\`git diff ${base}...HEAD\`）
   - QG-3 Stage1: mihari スキルを起動（AC適合 + テスト充足性ループ、max 5）
   - QG-3 Stage2: review-loop スキルを起動（PRなしモード、Critical/Warning ゼロまで max 5、commitのみ・push禁止）
   - QG-4: review-loop が収束せず手動対応が必要な場合のみエスカレーション
   - **qg-result.md を .claude/tmp/qg-result.md に生成**（\`## Final: PASS\` 行 + mihari/review-loop の PASS 行 + skill 実行ログを含める）
6. **T5手前で停止**: push は実行しない。ハンドオフを .claude/tmp/handoffs/${id}.md に書き出す。

## DR ポリシー
spec/AC 外の判断・妥協・先送り・スコープ追加は .claude/tmp/decisions/ に DR-NNN として記録。
trivial(rename/typo/単純踏襲) は不要。各フェーズ末尾の DR セルフチェックを実行する。

## advisor について（重要）
workflow 内では advisor() を呼べない。Tier ${ctx.tier} が 2 or 3 の場合、QG-4 根本原因分析や
T5 Go/No-Go で advisor 推奨ポイントに達したら、advisor を呼ばずに advisor_recommended=true で返し、
判断材料（懸念点）を blockers に列挙せよ（メインが advisor を呼ぶ）。

## 返却
スキーマに従い、qg_final / skills_invoked（実際に起動した Skill 名）/ decision_records /
advisor_recommended / blockers / handoff_path を必ず埋めて返すこと。
push せず awaiting_approval で停止したことを status に示す。`
}

async function runLowerFlow(ticket, ctx) {
  const id = typeof ticket === 'string' ? ticket : ticket.id
  // isolation: 'worktree' は使わない。kouunryuusui の T1 が実リポジトリ上で
  // `git worktree add` によりネイティブに隔離を所有するため（u0-worktrees/ 兄弟
  // レイアウト）。workflow 側で二重に隔離すると、作成ブランチ/コミットが一時
  // worktree に閉じて実リポジトリに永続せず、push handoff と stacked base 解決が
  // 壊れる。並列ワーカーは各自 base/feature ブランチが異なり、git が ref/index
  // 書き込みを直列化するため衝突しない（マイグレーションファイル名衝突のみ
  // lower-flow.md の指針どおり PR 直前生成で回避）。
  return agent(lowerFlowPrompt(ticket, ctx), {
    label: `下位 ${id}`,
    phase: 'E4 / 下位: 実装',
    schema: LOWER_SCHEMA,
    agentType: 'general-purpose',
  })
}

// =====================================================================
// 入力判定
// =====================================================================

phase('入力判定')
let mode = forcedMode
let tier = forcedTier
let workMode = 'new'

if (!mode || !tier) {
  const judged = await agent(
    `チケット ${ticketArg} の入力判定をせよ。
${COMPAT_NOTE}

判定軸:
- flow_mode: Epic / User Story（issue_type が Epic/Story、または子チケットや複数の独立機能AC を持つ）→ "epic"。
  実装チケット（Task/Sub-task、単一機能スコープ）→ "ticket"。判定不能 → 安全側 "epic"。
- tier: 1=CRUD/設定変更/既知パターン(変更3未満) / 2=複数コンポーネント・UI・分岐多(3-15) / 3=統合深い・性能・新ドメイン・不明(15+)。
- work_mode: 対象機能がまだ無い → "new" / 既存コードの修正・バグ修正・仕様変更・リファクタ → "modify"。

可能なら jira-cli スキルでチケット内容（PRD/AC/関連チケット）を取得して判定する。`,
    { label: '入力判定', phase: '入力判定', schema: JUDGE_SCHEMA, agentType: 'general-purpose' },
  )
  mode = mode || judged.flow_mode
  tier = tier || judged.tier
  workMode = judged.work_mode
  log(`判定: flow=${mode}, tier=${tier}, work=${workMode} — ${judged.reason}`)
} else {
  log(`判定(指定): flow=${mode}, tier=${tier}`)
}

const baseCtx = { tier, workMode, base: defaultBase, specPath: null, designPath: null, planPath: null }

// =====================================================================
// 下位フロー単独（実装チケット）
// =====================================================================

if (mode === 'ticket') {
  log('実装チケット → 下位フロー単独実行（T0〜QG、T5手前で停止）')
  const result = await runLowerFlow(ticketArg, baseCtx)
  return {
    flow: 'ticket',
    tier,
    ticket: ticketArg,
    result,
    handoff: {
      kind: 'push_approval',
      note: 'workflow は push しない。push 承認・PR作成・(Tier2/3なら)advisor をメインで実行すること。',
      awaiting_approval: result && result.status === 'awaiting_approval',
      advisor_recommended: !!(result && result.advisor_recommended) && tier >= 2,
    },
  }
}

// =====================================================================
// 上位フロー（Epic / User Story）: E1 → E2 → E3 → E4
// =====================================================================

log('Epic/US → 上位フロー（設計→分割→実装ループ）')

// ---- E1: 仕様/AC ----------------------------------------------------
phase('E1: 仕様/AC')
const e1 = await agent(
  `Epic/US ${ticketArg} の E1（仕様/AC生成）を実行せよ。
${COMPAT_NOTE}

手順（${SKILL_BASE}/references/upper-flow.md の E1 を読んでから着手）:
1. チケット内容を確認（PRD/要件/AC/Figma/関連チケット）。不十分なら jira-cli で親/Epic を1回だけ参照。
2. refine-ticket スキルを起動し、AC を GWT+Examples・7項目網羅まで磨いて spec-draft.md に出力。
3. \`[補完]\` した AC は .claude/tmp/decisions/ に DR 化（種別: 明示外）。
4. E1 末尾 DR セルフチェックを実行し「spec 外決定 N 件」を必ず数値で記録。
Tier ${tier} が 2/3 の場合、E2 開始前に advisor 推奨（AC妥当性）。workflow では呼べないので advisor_recommended=true で返す。`,
  { label: 'E1 仕様/AC', phase: 'E1: 仕様/AC', schema: SPEC_SCHEMA, agentType: 'general-purpose' },
)
baseCtx.specPath = e1.spec_path
log(`E1完了: AC ${e1.ac_count}件, 補完 ${e1.supplemented_acs.length}件, DR ${e1.decision_records.length}件 → SSOT=${e1.spec_path}`)

// チェックポイント(post-E1): Tier2/3 は E2(設計)が走る前に AC を advisor で検証する。
// 後追いフラグでは設計・分割・実装が終わってから鳴る＝ゲートにならない。ここで実際に停止する。
if (tier >= 2 && resumeAfter == null) {
  log('🛑 checkpoint(post-E1): Tier2/3 は E2設計の前に AC妥当性を advisor 確認すべき。停止して return。')
  return {
    flow: 'epic',
    checkpoint: 'post-E1',
    tier,
    epic: ticketArg,
    advisor_target: e1.spec_path,
    spec: e1,
    next_action:
      'メインで spec(AC) を advisor 確認 → 問題なければ Workflow({ scriptPath, resumeFromRunId, args: { ...同じargs, resume_after: "E1" } }) で再開（E1キャッシュ即返り→E2/E3実行→E3後で再停止）',
  }
}

// ---- E2a: 影響範囲調査（3並列 Explore） + E2b: 設計 ------------------
phase('E2: 設計')
const AREAS = [
  { key: 'backend', desc: 'バックエンド（Domain/UseCase/Infrastructure/Presentation層）。観点1呼び出し元/2呼び出し先/6横断的関心事' },
  { key: 'frontend', desc: 'フロントエンド（コンポーネント/hooks/型定義/API呼び出し）。観点1呼び出し元/4契約・型・スキーマ' },
  { key: 'infra', desc: 'DB・設定・バッチ・インフラ（マイグレーション/設定/テスト/Terraform/Cloud Scheduler）。観点3データフロー/7リリース順序・互換性' },
]
const impacts = await parallel(
  AREAS.map((a) => () =>
    agent(
      `${ticketArg} の影響範囲調査（${a.key}）。
${COMPAT_NOTE}
担当領域: ${a.desc}
${SKILL_BASE}/references/impact-analysis.md の 7観点チェックリストを必ず読み、担当観点を明示的に潰す（「該当なし」も書く）。
共通: 観点5（既存テストの fallout）は自領域で必ず列挙する。
仕様の根拠は ${e1.spec_path}。`,
      { label: `E2a ${a.key}`, phase: 'E2: 設計', schema: IMPACT_SCHEMA, agentType: 'Explore' },
    ),
  ),
)
const impactSummary = impacts
  .filter(Boolean)
  .map((i) => `[${i.area}] findings:${i.findings.length} files:${i.affected_files.length} testFallout:${i.test_fallout.length}`)
  .join(' / ')
log(`E2a 影響範囲調査(3並列)完了: ${impactSummary}`)

const e2 = await agent(
  `${ticketArg} の E2b/E2c/E2d（設計）を実行せよ。
${COMPAT_NOTE}

入力:
- 仕様(AC): ${e1.spec_path}
- 影響範囲調査(3並列の統合): 以下を design.md 冒頭の影響範囲レポートに統合せよ
${impacts.filter(Boolean).map((i) => `  - [${i.area}] ${i.findings.slice(0, 5).join('; ')}`).join('\n')}

手順（${SKILL_BASE}/references/upper-flow.md の E2 を読んでから着手）:
1. 複雑度判定（低/中/高）。中→Plan(sonnet)相当、高→Plan(opus)相当で詳細設計。修正モードでは低複雑度でもスキップしない。
2. DB変更を分析。破壊的変更（NOT NULL追加/カラム名変更/型変更/削除/テーブル削除）なら Expand & Contract 計画を design.md に組み込む。
3. 設計図を Mermaid.js で作成（状態遷移図/シーケンス図/ER図/フローチャート、該当するもの）。
4. design.md を生成（全体アーキ/API/DB(E&C計画)/UI/設計図/テスト戦略）。
Tier ${tier} が 3 の場合、E3 開始前に advisor 推奨（設計妥当性）→ advisor_recommended=true で返す。`,
  { label: 'E2b 設計', phase: 'E2: 設計', schema: DESIGN_SCHEMA, agentType: 'general-purpose' },
)
baseCtx.designPath = e2.design_path
log(`E2完了: 複雑度=${e2.complexity}, DB=${e2.db_change}, E&C=${e2.ec_required} → SSOT=${e2.design_path}`)
if (e2.advisor_recommended && tier >= 3) log('🔶 advisor推奨ポイント: E2b完了/E3開始前（設計妥当性）。メインで advisor 検討を。')

// ---- E3: チケット分割 -----------------------------------------------
phase('E3: 分割')
const e3 = await agent(
  `${ticketArg} の E3（チケット分割・依存グラフ生成）を実行せよ。
${COMPAT_NOTE}

入力: 設計=${e2.design_path}, 仕様=${e1.spec_path}, DB変更=${e2.db_change}, E&C必要=${e2.ec_required}

手順（${SKILL_BASE}/references/upper-flow.md の E3 を読んでから着手）:
1. 分割戦略を選択: 新機能=feature-flag-strategy / 段階設計=vertical-slice / 既存修正=tidy-first / 破壊的DB変更=E&Cテンプレート（DB Expand→App Expand→Migrate→App切替→Contract、各別PR・DBマイグレ先行）。複数該当は組み合わせる。
2. 各チケットの AC を refine-ticket で SBE 形式に生成し spec.md に肉付け。
3. ticket-plan.md に依存グラフとチケット一覧を出力。各チケット: id/title/type/depends_on/ec_step/base。
   - 独立チケット → base="origin/main"
   - stacked/E&C 後続 → 親 feature ブランチを base に
分割不要（単一チケット）なら tickets を1件で返す。
Tier ${tier} が 2/3 の場合、E4 開始前に advisor 推奨（分割戦略）→ advisor_recommended=true で返す。`,
  { label: 'E3 分割', phase: 'E3: 分割', schema: SPLIT_SCHEMA, agentType: 'general-purpose' },
)
baseCtx.planPath = e3.plan_path
const tickets = (e3.tickets || []).filter(Boolean)
log(`E3完了: 戦略=${e3.strategy}, チケット ${tickets.length}件 → SSOT=${e3.plan_path}`)
if (e3.advisor_recommended && tier >= 2) log('🔶 advisor推奨ポイント: E3完了/E4開始前（分割戦略）。メインで advisor 検討を。')

if (!tickets.length) {
  log('⚠️ E3 が0件のチケットを返した。元チケットを単一チケットとして下位フロー実行する。')
  tickets.push({ id: ticketArg, title: '(E3で分割なし)', type: 'app', depends_on: [], ec_step: '', base: defaultBase })
}

// チェックポイント(post-E3): Tier2/3 は E4(実装)が走る前に分割戦略を advisor で検証する。
// 分割粒度が悪いと並列実行でコンフリクトが多発するため、実装着手前が最後の安全な停止点。
if (tier >= 2 && resumeAfter !== 'E3') {
  log('🛑 checkpoint(post-E3): Tier2/3 は E4実装の前に分割戦略を advisor 確認すべき。停止して return。')
  return {
    flow: 'epic',
    checkpoint: 'post-E3',
    tier,
    epic: ticketArg,
    ssot: { spec: e1.spec_path, design: e2.design_path, plan: e3.plan_path },
    advisor_target: e3.plan_path,
    tickets: tickets.map((t) => ({ id: t.id, title: t.title, depends_on: t.depends_on, ec_step: t.ec_step, base: t.base })),
    split: e3,
    next_action:
      'メインで ticket-plan(分割戦略) を advisor 確認 → 問題なければ Workflow({ scriptPath, resumeFromRunId, args: { ...同じargs, resume_after: "E3" } }) で再開（E1〜E3キャッシュ→E4実装まで完走）',
  }
}

// ---- E4: チケット実行ループ（依存順に波状並列） ----------------------
phase('E4 / 下位: 実装')
log(`E4: ${tickets.length}件のチケットを依存グラフに従い波状並列で下位フロー実行`)

// 依存関係を尊重した波状実行: 依存先が完了したチケットだけを各ラウンドで並列起動する。
const byId = new Map(tickets.map((t) => [t.id, t]))
const done = new Set()
const e4Results = []
// ワーカーが結果を返さなかった（parallel が null = schema 不成立 / 例外）チケットID。
// これを追跡しないと、null は e4Results から漏れ awaiting/failed どちらにも入らず
// 「黙って消える」（No silent caps 違反）。handoff の needs_attention に必ず出す。
const crashed = []
let wave = 0
let remaining = tickets.slice()

while (remaining.length) {
  wave++
  const ready = remaining.filter((t) => (t.depends_on || []).every((d) => done.has(d) || !byId.has(d)))
  if (!ready.length) {
    // 依存が外部 or 循環。残り全部を起動して打ち切り（デッドロック回避）。
    log(`⚠️ wave ${wave}: 解決可能な依存先がない。残り ${remaining.length}件を強制起動（依存は外部/循環の可能性）。`)
    const forced = await parallel(remaining.map((t) => () => runLowerFlow(t, baseCtx)))
    forced.forEach((r, i) => {
      if (r) { e4Results.push(r); done.add(r.ticket_id) }
      else { crashed.push(remaining[i].id) }
    })
    remaining.forEach((t) => done.add(t.id))
    break
  }
  log(`wave ${wave}: ${ready.map((t) => t.id).join(', ')} を並列起動`)
  const waveResults = await parallel(ready.map((t) => () => runLowerFlow(t, baseCtx)))
  waveResults.forEach((r, i) => {
    if (r) { e4Results.push(r); done.add(r.ticket_id) }
    else { crashed.push(ready[i].id) } // null = ワーカー失敗。消さずに記録する
  })
  // 失敗チケットも次ラウンドのデッドロック回避のため done 扱いにする（結果は crashed で別途追跡）
  ready.forEach((t) => done.add(t.id))
  remaining = remaining.filter((t) => !ready.includes(t))
}
if (crashed.length) log(`⚠️ E4: ${crashed.length}件がワーカー失敗(schema不成立/例外)で結果未取得: ${crashed.join(', ')}`)

// ---- handoff: 一括Push承認サマリー -----------------------------------
phase('handoff: Push承認')
const awaiting = e4Results.filter((r) => r.status === 'awaiting_approval')
const failed = e4Results.filter((r) => r.status !== 'awaiting_approval')
const needsAdvisor = tier >= 2 && e4Results.some((r) => r.advisor_recommended)
log(`E4完了: 承認待ち ${awaiting.length}件 / 要対応 ${failed.length}件`)
if (needsAdvisor) log('🔶 advisor推奨ポイント: E4各チケットの T5 Go/No-Go。メインで advisor 検討を。')

return {
  flow: 'epic',
  tier,
  epic: ticketArg,
  ssot: { spec: e1.spec_path, design: e2.design_path, plan: e3.plan_path },
  ec_required: e2.ec_required,
  tickets: tickets.map((t) => ({ id: t.id, title: t.title, ec_step: t.ec_step, base: t.base })),
  results: e4Results,
  handoff: {
    kind: 'batch_push_approval',
    note: 'workflow は push しない。承認待ちチケットを依存/リリース順に確認し、push & PR作成をメインで実行。Tier2/3 は T5前に advisor を。',
    awaiting_approval: awaiting.map((r) => ({
      ticket_id: r.ticket_id,
      branch: r.branch,
      change_summary: r.change_summary,
      qg_final: r.qg_final,
      decision_records: r.decision_records,
    })),
    needs_attention: failed.map((r) => ({ ticket_id: r.ticket_id, status: r.status, blockers: r.blockers })),
    crashed: crashed.map((id) => ({ ticket_id: id, reason: 'ワーカーが結果を返さず(schema不成立/例外)。メインで手動確認・再実行が必要' })),
    advisor_recommended: needsAdvisor,
  },
}
