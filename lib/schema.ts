/**
 * lib/schema.ts — 타입의 단일 진실 (Single Source of Truth)
 *
 * 이 파일이 RecipeState / CookRun / RuntimeLog / Fingerprint / EngineResponse의 유일한 정의다.
 * UI / 엔진 / DB / 마이그레이션 / 검증 모두 여기에서만 타입을 가져온다.
 *
 * 헌법 강제:
 *   - D-005: steps는 string[]이 아니라 { text, timer_sec }[]. 타이머 텍스트 파싱 금지.
 *            (ENGINE.md §6 컨벤션: 시간 없는 스텝은 timer_sec=0)
 *   - D-006: 핫픽스는 RecipeState를 바꾸지 않는다. CookRun.step_events의 한 종류로만 기록.
 *   - D-007: 모든 사용자 데이터는 Supabase에 영속. localStorage 금지.
 *   - D-008: RecipeState → CookRun → RuntimeLog → Fingerprint 단방향 의존. 다음 BUILD에 주입.
 *   - ENGINE.md §5 방어: 게이지 0~10 clamp(LLM이 벗어나도 깨지지 않게), steps 최대 8개.
 *
 * 용접 다이어그램:
 *   RecipeState ──(빌드)──> CookRun ──(집계)──> RuntimeLog ──(교차분석)──> Fingerprint
 *        ▲                                                                       │
 *        └─────────────(다음 빌드 프롬프트에 주입)────────────────────────────────┘
 */

import { z } from "zod";

// ───────────────────────────────────────────────────────────────────────────
// 공용 스칼라
// ───────────────────────────────────────────────────────────────────────────

/**
 * Gauge — 0~10 정수. ENGINE.md §5 "게이지 clamp(0~10)는 Zod transform에서 방어".
 * LLM이 12나 -1을 뱉어도 0~10으로 끌어들인 뒤 정수화한다. parse 실패 대신 정상화.
 */
const GaugeSchema = z.coerce
  .number()
  .transform((n) => Math.max(0, Math.min(10, Math.round(n))));

const TimestampSchema = z.string().datetime({ offset: true });

const UuidSchema = z.string().uuid();

/**
 * Stage — ENGINE.md §2 빌드 파이프라인 (한 턴 한 단계, D-003).
 * concept → base → taste → steps → done.
 */
export const StageSchema = z.enum(["concept", "base", "taste", "steps", "done"]);
export type Stage = z.infer<typeof StageSchema>;

// ───────────────────────────────────────────────────────────────────────────
// 1. RecipeState — 레시피 = 코드베이스 (DATA_MODEL.md §1)
// ───────────────────────────────────────────────────────────────────────────

export const IngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.string().min(1),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const TasteSchema = z.object({
  spicy: GaugeSchema,
  salty: GaugeSchema,
  sweet: GaugeSchema,
  sour: GaugeSchema,
  umami: GaugeSchema,
  fatty: GaugeSchema,
});
export type Taste = z.infer<typeof TasteSchema>;

export const TextureSchema = z.object({
  crispy: GaugeSchema,
  soft: GaugeSchema,
  chewy: GaugeSchema,
  soupy: GaugeSchema,
  thick: GaugeSchema,
});
export type Texture = z.infer<typeof TextureSchema>;

/**
 * Step — D-005 강제 지점.
 *
 * timer_sec은 옵셔널(undefined) 절대 금지. 타이머가 필요 없는 스텝("한소끔 끓이고 내림")도
 * 명시적으로 0을 박는다 (ENGINE.md §6 컨벤션). 이 차이가 "timer_sec 누락이면 텍스트 파싱"으로의
 * 표류를 막는다. Cook Mode 클라이언트는 timer_sec === 0이면 타이머 UI를 띄우지 않는다.
 *
 * 값 도메인: 0(타이머 없음) 또는 양의 정수(초). 음수 금지.
 */
export const StepSchema = z.object({
  text: z.string().min(1),
  timer_sec: z.number().int().min(0),
});
export type Step = z.infer<typeof StepSchema>;

/**
 * RecipeStateSchema — ENGINE.md §5 "steps 최대 8개" 방어 적용.
 * 모든 필드 optional (D-003 점진 빌드).
 */
export const RecipeStateSchema = z.object({
  name: z.string().min(1).optional(),
  concept: z.string().min(1).optional(),
  ingredients: z.array(IngredientSchema).optional(),
  taste: TasteSchema.optional(),
  texture: TextureSchema.optional(),
  tools: z.array(z.string().min(1)).optional(),
  time_min: z.number().int().positive().optional(),
  steps: z.array(StepSchema).max(8).optional(),
});
export type RecipeState = z.infer<typeof RecipeStateSchema>;

// ───────────────────────────────────────────────────────────────────────────
// 2. CookRun — 조리 1회 = 한 번의 실행 (DATA_MODEL.md §2)
// ───────────────────────────────────────────────────────────────────────────

/**
 * StepEvent type — D-006 강제 지점.
 * "hotfix"가 별도 테이블/엔티티가 아니라 step_events의 한 type임을 타입 시스템으로
 * 강제한다. 이렇게 두면 누군가 "핫픽스를 새 버전으로 승격"을 시도해도 RecipeState에
 * hotfix 채널이 없어 컴파일 단계에서 막힌다.
 */
export const StepEventTypeSchema = z.enum([
  "done",
  "timer_done",
  "hotfix",
  "failed_here",
]);
export type StepEventType = z.infer<typeof StepEventTypeSchema>;

/**
 * HotfixCategory — D-016 (P1.B 사이클, GB-1 채택 A안).
 *
 * TASTE.md §3 핫픽스 우선순위 4종(짜다/싱겁다/탄다/묽다) + 5번째 "기타"(자유 텍스트 보조).
 * Cook Mode 핫픽스 UI는 5종 칩으로 분류 입력을 강제하되, "other"는 note 필드에 자유 텍스트를
 * 동반한다. 학습 측(lib/runtime.ts:rebuildRuntimeLog)이 카테고리별 known_issues 집계를
 * 가능하게 함 — 자유 텍스트 only로 가면 자연어 처리 부담이 학습 측에 떠넘겨진다.
 *
 * 본 enum은 StepEventSchema의 hotfix 변종에서만 category 필드로 사용된다.
 * 다른 StepEvent type(done/timer_done/failed_here)에는 category가 없다.
 */
export const HotfixCategorySchema = z.enum([
  "salty",
  "bland",
  "burnt",
  "watery",
  "other",
]);
export type HotfixCategory = z.infer<typeof HotfixCategorySchema>;

/**
 * StepEventSchema — discriminated union by `type`.
 *
 * hotfix 변종만 `category: HotfixCategory` 필수 필드를 가진다 (D-016).
 * 다른 변종(done/timer_done/failed_here)은 category 없음 — 타입 시스템이 차단.
 *
 * note 정책:
 *   - hotfix: optional (category=other이면 UI 측에서 자유 텍스트 요구; 본 스키마는 강제 안 함)
 *   - failed_here: optional ("3번에서 탔음" 같은 메모)
 *   - done/timer_done: optional (보통 비어 있음)
 */
const StepEventDoneSchema = z.object({
  step_index: z.number().int().min(0),
  type: z.literal("done"),
  note: z.string().optional(),
  timestamp: TimestampSchema,
});
const StepEventTimerDoneSchema = z.object({
  step_index: z.number().int().min(0),
  type: z.literal("timer_done"),
  note: z.string().optional(),
  timestamp: TimestampSchema,
});
const StepEventHotfixSchema = z.object({
  step_index: z.number().int().min(0),
  type: z.literal("hotfix"),
  category: HotfixCategorySchema,
  note: z.string().optional(),
  timestamp: TimestampSchema,
});
const StepEventFailedHereSchema = z.object({
  step_index: z.number().int().min(0),
  type: z.literal("failed_here"),
  note: z.string().optional(),
  timestamp: TimestampSchema,
});

export const StepEventSchema = z.discriminatedUnion("type", [
  StepEventDoneSchema,
  StepEventTimerDoneSchema,
  StepEventHotfixSchema,
  StepEventFailedHereSchema,
]);
export type StepEvent = z.infer<typeof StepEventSchema>;

/**
 * Outcome — null은 "Postmortem 미진입" 상태. DB에서는 NULL로 저장.
 * 헌법 §4 "POSTMORTEM 없이 COOK 종료 불가" 강제: completed=true인데 outcome=null이면
 * 검증 실패. (라우트 레벨 refine은 P1에서 추가 — 본 골격은 타입 자체만 정의.)
 */
export const OutcomeSchema = z.enum(["good", "meh", "failed"]).nullable();
export type Outcome = z.infer<typeof OutcomeSchema>;

/**
 * CookRunSchema — refine으로 §4 강제 규칙 "POSTMORTEM 없이 COOK 종료 불가"를
 * 데이터 레벨에서 1차 차단 (GB-6 A안, P1.B 사이클).
 *
 * 규칙: completed=true && outcome===null → 검증 실패 "postmortem_required".
 * 이 refine은 클라/라우트 양쪽에서 동일하게 작동한다. DB 레벨 2차 차단은
 * supabase/migrations/0002_run_constraint.sql의 CHECK 제약이 담당 (방어 in depth).
 */
export const CookRunSchema = z
  .object({
    id: UuidSchema,
    recipe_id: UuidSchema,
    user_id: UuidSchema,
    started_at: TimestampSchema,
    completed: z.boolean(),
    outcome: OutcomeSchema,
    step_events: z.array(StepEventSchema),
  })
  .refine(
    (run) => !(run.completed === true && run.outcome === null),
    { message: "postmortem_required" },
  );
export type CookRun = z.infer<typeof CookRunSchema>;

// ───────────────────────────────────────────────────────────────────────────
// 3. RuntimeLog — 레시피에 누적되는 런타임 지식 (DATA_MODEL.md §3)
// ───────────────────────────────────────────────────────────────────────────

export const KnownIssueSchema = z.object({
  step_index: z.number().int().min(0),
  issue: z.string().min(1),
  fix_applied: z.string().optional(),
  resolved: z.boolean(),
});
export type KnownIssue = z.infer<typeof KnownIssueSchema>;

export const RuntimeLogSchema = z.object({
  recipe_id: UuidSchema,
  total_runs: z.number().int().min(0),
  known_issues: z.array(KnownIssueSchema),
});
export type RuntimeLog = z.infer<typeof RuntimeLogSchema>;

// ───────────────────────────────────────────────────────────────────────────
// 4. Fingerprint — 사람별 부엌 지문 / 해자 (DATA_MODEL.md §4, D-007)
// ───────────────────────────────────────────────────────────────────────────

export const TraitSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence_run_ids: z.array(UuidSchema),
});
export type Trait = z.infer<typeof TraitSchema>;

export const FingerprintSchema = z.object({
  user_id: UuidSchema,
  total_runs_all_recipes: z.number().int().min(0),
  traits: z.array(TraitSchema),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;

// ───────────────────────────────────────────────────────────────────────────
// 5. BuildContext — 다음 BUILD에 주입되는 묶음 (D-008 강제 지점)
// ───────────────────────────────────────────────────────────────────────────

/**
 * BUILD가 시작될 때 엔진 프롬프트에 주입할 패키지.
 *
 * - runtime_log: 해당 레시피의 known_issues (회귀 방지)
 * - fingerprint: 해당 유저의 traits (개인화)
 * - cold_start: 둘 다 비어 있으면 true → 시스템 프롬프트가 "맹탕 모드"임을 명시
 *
 * 헌법 §4 강제 규칙: "BUILD가 시작될 때 RuntimeLog와 Fingerprint를 반드시 조회한다.
 * 없으면 맹탕(cold start)으로 명시한다." → 이 타입을 통해 코드 레벨에서 강제.
 *
 * (실제 조회/주입은 lib/prompt.ts에서 구현 — 본 골격은 타입만 정의.)
 */
export const BuildContextSchema = z.object({
  runtime_log: RuntimeLogSchema.nullable(),
  fingerprint: FingerprintSchema.nullable(),
  cold_start: z.boolean(),
});
export type BuildContext = z.infer<typeof BuildContextSchema>;

// ───────────────────────────────────────────────────────────────────────────
// 6. EngineResponse — 엔진 → 서버 출력 계약 (ENGINE.md §3)
// ───────────────────────────────────────────────────────────────────────────

/**
 * 엔진(Anthropic API)이 반환해야 하는 JSON 계약.
 * `app/api/recipe/route.ts`가 LLM 응답 텍스트에서 JSON을 추출한 후 이 스키마로 safeParse.
 * 실패하면 ENGINE.md §5 / D-004에 따라 에러를 대화에 덧붙여 1회 재호출.
 * 2회 연속 실패 시 502.
 *
 * 불변 규칙 (ENGINE.md §4):
 *   - message는 1~3문장 (검증 안 함 — LLM 자율, 단 빈 문자열 금지)
 *   - options 2~3개, 각 15자 이내
 *   - new_state는 확정 필드만 또는 null (D-001: 전체 상태 반환, diff는 코드가 계산)
 *   - change_log/warnings는 요리 관점 문장만 (LLM 자율, 길이만 가벼운 가드)
 */
export const EngineResponseSchema = z.object({
  message: z.string().min(1),
  stage: StageSchema,
  new_state: RecipeStateSchema.nullable(),
  options: z.array(z.string().min(1).max(15)).min(0).max(3),
  change_log: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
});
export type EngineResponse = z.infer<typeof EngineResponseSchema>;

/**
 * EngineStructured — D-029 (DR4 2단계 스트리밍).
 *
 * 스트리밍 모드에서 LLM 출력은 두 부분이다:
 *   1. 평문 대화 메시지 (= EngineResponse.message). 토큰 단위로 흘러나간다.
 *   2. `===STATE_JSON===` 구분자 뒤의 **구조 JSON** = 본 스키마.
 *
 * 즉 message 를 제외한 나머지 5개 키. 라우트는 구분자 뒤 JSON 을 본 스키마로
 * 검증(D-004 1회 재시도)한 뒤, 흘려보낸 평문을 message 로 합쳐 EngineResponse
 * 로 최종 재검증한다. new_state 는 여전히 **완결 수신 후 1건으로 검증**되므로
 * D-001(검증 후 diff)·D-002 가 보존된다.
 */
export const EngineStructuredSchema = EngineResponseSchema.omit({ message: true });
export type EngineStructured = z.infer<typeof EngineStructuredSchema>;
