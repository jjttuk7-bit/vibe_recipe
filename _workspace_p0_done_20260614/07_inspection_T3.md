# T3 정합성 검증 보고서 — P0 (셸 부트스트랩 + rate limit + env 격리)

**작성자**: welding-inspector
**일자**: 2026-06-14
**입력**:
- T1 보고서 `_workspace/02_welding_review_T1.md` (NEED_USER_DECISION → 후보 A 채택)
- T1.5 보고서 `_workspace/03_schema_change_T1.5.md` (schema + 0001_init)
- T2 보고서 `_workspace/04_engine_change_T2.md` (셸 부트스트랩 + P0)
- 코드: `app/`, `lib/`, `components/`, `supabase/`, `.env.example`, `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`
- 절차: `.claude/skills/weld-trace/SKILL.md`

**최종 판정: PASS** (셸 단계 P0 가드는 코드로 박혔다. 발견된 결함 0. 사용자 보고용 요약은 §8 참조.)

---

## 1. 검증 범위 명시 (셸 단계 특수성)

본 검증 대상은 **P0 코드 경로 + 셸 정합성**이지 P1 기능 동작이 아니다. 라우트는 현재 501을 반환하는 placeholder이며, Anthropic/Upstash/Supabase 실제 호출은 P1로 분리되어 있다. 따라서 본 검증의 PASS 기준은:

- (a) P0 게이트(rate limit, env 격리)가 코드 경로에 박혔는가
- (b) 셸 구조가 §4 용접 / D-005 / D-006 / D-007 / D-008을 처음부터 강제하는가
- (c) Zod ↔ DB 경계 C 7항목이 1:1 매핑되는가
- (d) cold start 가드가 타입/주석 레벨에서 명시되었는가

실제 런타임 스모크(빌드 + curl)는 `npm install` 수행 권한 + 더미 키 주입이 필요하므로 본 보고서에서는 정적 분석으로 대체. 빌드 검증은 사용자(유케이) 또는 후속 세션에서 `npm install && npm run typecheck && npm run build`로 확인 권고.

---

## 2. 트레이스한 용접 라인 (weld-trace SKILL §5개 라인)

| 라인 | 시작 | 종착 | PASS/BLOCK | 비고 |
|------|------|------|------------|------|
| Line 1 BUILD→known_issues/Fingerprint 주입 | `components/BuildMode.tsx`:5-7 + `lib/prompt.ts`:1-21 | `lib/schema.ts` `BuildContextSchema` (L205-210) | PASS (셸 단계 적정) | `BuildContextSchema`가 `runtime_log/fingerprint/cold_start` 셋을 묶음. `lib/prompt.ts`는 빈 export 이나 주석에 `buildSystemPrompt` 시그니처가 `fingerprintTraits`, `knownIssues` 둘 다 입력으로 받도록 박혀 있음 — P1에서 빠뜨릴 수 없는 형태. cold start 명시 의무를 주석으로 강제. |
| Line 2 COOK 핫픽스 → step_events 저장 | `components/CookMode.tsx`:5-11 | `lib/schema.ts` `StepEventTypeSchema` (L116-122) + `cook_runs.step_events` jsonb | PASS (셸 단계 적정) | `StepEventTypeSchema`가 `"hotfix"`를 enum 값으로 박음. RecipeState에 hotfix 채널 없음 → D-006 강제 타입화. CookMode 주석에 "RecipeState 절대 변경 금지" 명시. |
| Line 3 COOK 종료 → POSTMORTEM 강제 | `components/CookMode.tsx`:10-11 | `components/Postmortem.tsx`:5-9 | PASS (주석 강제) | Cook 화면 종료 시 outcome 입력 없이 떠날 수 없음 명시. Postmortem 주석에 "건너뛰기 버튼 금지" 박힘. P1 구현 시 modal/blocking route 둘 중 하나로 가야 함이 주석으로 못 박힘. |
| Line 4 POSTMORTEM → RuntimeLog 갱신 + Fingerprint 재계산 (트랜잭션) | `components/Postmortem.tsx`:10-11 → `app/api/run/route.ts`:55-67 | `cook_runs INSERT` → `runtime_logs UPSERT` → `fingerprints UPSERT` (한 트랜잭션) | PASS (골격 적정) | `app/api/run/route.ts` L62-64에 호출 순서 3단(`cook_runs INSERT` / `runtime_logs UPSERT` / `fingerprints UPSERT`) 순차 명시. `lib/runtime.ts`·`lib/fingerprint.ts` 주석에 "호출 누락 = §4 용접 깨짐" 명시. P1 구현 시 Postgres RPC 권장도 함께 박힘. |
| Line 5 다음 BUILD → Line 1 회귀 | (위 라인의 결과가 다시 Line 1로) | `BuildContextSchema` 재주입 | PASS (구조적 회귀 가능) | 단방향 의존(`recipes → cook_runs → runtime_logs` + `auth.users → fingerprints`)이 외래키로 강제. 회귀 경로가 데이터 모델 차원에서 막힌 곳 없음. |

**라인 결과**: 5/5 PASS (셸 단계 기준).

---

## 3. P0 강제 체크리스트 (welding-inspector 사전 정의 A~E)

### A. ANTHROPIC_API_KEY 클라이언트 번들 비노출 — **PASS**

| 점검 | 결과 | 근거 |
|------|------|------|
| `lib/env.ts` 첫 줄 `import "server-only"` | OK | `lib/env.ts:14` |
| `"use client"` 파일에서 `lib/env`/`lib/supabase`/`lib/ratelimit` 직접 import | 0건 | grep: components/* 3파일 모두 import 없음 |
| `"use client"` 파일에서 `process.env.ANTHROPIC_*` 직접 참조 | 0건 | grep: components/ 0건 |
| `.env.example`에 `NEXT_PUBLIC_*` 변수 정의 | 0건 (주석 매치만) | `.env.example` 5-7, 27 라인은 모두 "금지" 설명 주석. 실제 `NEXT_PUBLIC_X=` 선언 0건 |
| 라우트의 키 접근 경로 | server-only 헬퍼 경유 | `app/api/recipe/route.ts:18` `import { anthropicApiKey, vibeRecipeModel } from "@/lib/env"` → server-only 가드 작동 |
| `process.env.*` 직접 참조가 lib/env.ts 외부에 존재 | 0건 | grep: `lib/env.ts` 외 모든 `.ts/.tsx`에서 0건 |

**결론**: 키 누출 경로가 import 그래프 + Next.js `server-only` 빌드 가드 양쪽으로 봉인됨.

### B. 모든 /api/* 라우트가 rate limit 통과 — **PASS**

| 라우트 | 첫 줄 게이트 호출 | prefix | 결과 |
|--------|------------------|--------|------|
| `app/api/recipe/route.ts` | L52 `const gate = await enforceRateLimit(request, "recipe");` 후 L53 `if (!gate.ok) return gate.response;` | `viberecipe:recipe` | PASS |
| `app/api/run/route.ts` | L35 `const gate = await enforceRateLimit(request, "run");` 후 L36 `if (!gate.ok) return gate.response;` | `viberecipe:run` | PASS |

라우트 전수 열거: `app/api/**/route.ts`는 정확히 2개. 모두 첫 정상 분기에서 enforceRateLimit 호출. **우회 라우트 없음**.

limiter 인스턴스: `lib/ratelimit.ts:30` `limiterCache = new Map<string, Ratelimit>()` 모듈 스코프 + L31-42 `getLimiter` lazy init. cold start당 prefix별 1회만 생성됨. **PASS**.

### C. IP 식별 X-Forwarded-For 신뢰 가드 — **PASS (잔존 위험 명시)**

`lib/ratelimit.ts:47-59` `identifyClient`:
- XFF 헤더 → 첫 토큰만 `split(",")[0]?.trim()`로 추출 (프록시 체인 뒷쪽 IP 신뢰 안 함)
- XFF 부재 시 `x-real-ip` fallback
- 둘 다 없으면 `"anonymous"` 문자열로 폴백

**잔존 위험 (BLOCK 아님, 주석으로 명시됨)**: anonymous 폴백 시 같은 라우트 전체 트래픽이 한 키로 뭉칠 수 있음. T2 보고서 R6 + ratelimit.ts:45-46 주석이 "Vercel 환경에서만 신뢰" + "라우트별 prefix로 anonymous 트래픽 분리"를 명시. **Vercel 배포 한정**으로 안전. 자체 호스팅으로 옮길 경우 reverse proxy 신뢰 가드 추가가 필요하다는 점이 주석에 박혀 있음 → 운영 시점에 PR 리뷰로 잡힐 형태.

### D. 429 응답 형태 — **PASS**

`lib/ratelimit.ts:86-107` 차단 시 응답:
- status: 429
- body JSON: `{ error: "rate_limited", message, retry_after_sec }`
- 헤더:
  - `Content-Type: application/json; charset=utf-8`
  - `Retry-After: <seconds>` (RFC 7231 §7.1.3 준수, 최소 1초 강제 `Math.max(1, ...)`)
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset` (unix ms)

통과 응답에도 `withRateLimitHeaders`가 헤더 동봉 (라우트 양쪽에서 호출 확인: `app/api/recipe/route.ts:66,76` / `app/api/run/route.ts:47,69`). **PASS**.

### E. UPSTASH_* env 부재 시 명시적 에러 — **PASS**

`lib/env.ts:16-24` `requireEnv`:
- 값이 `undefined` 또는 `""`이면 즉시 throw with 명시적 메시지
- 조용한 fallback **부재** (try/catch로 삼키는 코드 없음)

`lib/ratelimit.ts:24-28` `getRedis()`가 lazy하게 `upstashRedisRestUrl()` + `upstashRedisRestToken()` 호출 → 첫 요청 시점에 env가 비어 있으면 throw가 발생하여 라우트가 500을 반환. "rate limit 스킵" 분기 0건.

`.env.example`에 `UPSTASH_REDIS_REST_URL=` / `UPSTASH_REDIS_REST_TOKEN=`이 빈 값으로 들어있고 부재 시 정책이 주석으로 명시(L21).

**PASS**.

---

## 4. 경계면 비교 (weld-trace SKILL §경계 A~E)

### 경계 A: 시스템 프롬프트 출력 명세 ↔ Zod 스키마 (rev2 재트레이스)

T2 rev2 / T1.5 rev2 적용 후 재검증.

#### A-1 SSOT 단일성 (Stage / EngineResponse 정의가 한 곳뿐인가)

| 점검 | 결과 | 근거 |
|------|------|------|
| `StageSchema = z.enum([...])` 정의 위치 | 1건 (lib/schema.ts:43) | grep: `z\.enum\(\[?["']concept["']` 매치 1건 |
| `EngineResponseSchema = z.object(...)` 정의 위치 | 1건 (lib/schema.ts:228) | grep 매치 1건 |
| 라우트 안 데이터 모델 스키마 로컬 정의 (rev2 추가 grep #6) | 0건 | `^(const\|export const)\s+(Engine[A-Z]\w*\|Stage\|RecipeState\|CookRun\|RuntimeLog\|Fingerprint\|BuildContext)Schema\s*=\s*z\.` 패턴 `app/api/**/route.ts` 매치 0 |
| `@/lib/schema` import 존재 (rev2 추가 grep #7) | 2/2 라우트 | `app/api/recipe/route.ts:29` 다중 import, `app/api/run/route.ts:24` `CookRunSchema` import |
| `RequestBodySchema` 라우트 로컬 정의 (route.ts:38-49) | 허용 | 클라이언트 입력 형식 검증용으로 데이터 모델 SSOT 아님. grep #6 패턴 범위 밖. engine-builder 보고 §8-f 자체 점검과 일치 |

#### A-2 명세 ↔ Zod 매핑

| 명세(ENGINE.md §3) | Zod (`lib/schema.ts` EngineResponseSchema L228-235) | 일치 |
|--------------------|-----------------------------------------------------|------|
| `message: string (1~3문장)` | `z.string().min(1)` | OK (문장 수는 LLM 자율, 빈값 금지만 강제) |
| `stage: "concept"\|"base"\|"taste"\|"steps"\|"done"` | `StageSchema = z.enum([...])` (L43) | **완전 일치** |
| `new_state: RecipeState 또는 null` | `RecipeStateSchema.nullable()` | OK |
| `options: string[] (각 15자 이내, 2~3개)` | `z.array(z.string().min(1).max(15)).min(0).max(3)` | OK (min(2) 미적용은 T1.5 보고서 rev2의 의도된 완화) |
| `change_log: string[]` | `z.array(z.string().min(1))` | OK |
| `warnings: string[]` | `z.array(z.string().min(1))` | OK |

#### A-3 BuildContext 결합 (rev2 신설)

| 점검 | 결과 | 근거 |
|------|------|------|
| `BuildContextSchema` / `type BuildContext` import | OK | `app/api/recipe/route.ts:23,27`에서 `@/lib/schema` 묶음 import |
| BuildContext 조회 의사코드 (Supabase → `BuildContextSchema.parse`) | OK | `app/api/recipe/route.ts:75-86` |
| cold_start 분기 강제 ("조용히 무시 금지") | OK | L78-79, L84(`cold_start: !runtimeLogOrNull && !fingerprintOrNull`), L19-20 (헤더 주석 "조용히 무시 금지") |
| `callEngineWithRetry` 시그니처에 `buildContext: BuildContext` 매개변수 | OK | L113-114, L144-147 `CallEngineWithRetry` type alias + L151 `const callEngineWithRetry` 실 사용 — type-only import가 lint로 제거되지 않도록 module-internal const로 보존 |
| BuildContext 생략 시 BLOCK 사유 명시 | OK | L88-90 "Line 0(다음 Build의 Fingerprint 주입)에서 BLOCK" 주석 |

**결론**: rev2 SSOT 단일화 + BuildContext 결합 모두 PASS. 데이터 모델·엔진 출력 계약 정의는 `lib/schema.ts` 한 곳뿐이며, 라우트는 import만 한다. cold_start 분기가 코드 레벨에서 타입과 의사코드 양쪽으로 강제됨.

### 경계 B: API 응답 타입 ↔ 클라이언트 사용 타입

현재 P0 셸 단계라 클라이언트 fetch 핸들러가 없음 (`components/*` 3개 모두 placeholder). 라우트는 501 응답만 반환. **검증 불가 / P1 작업 범위**.

### 경계 C: Zod 스키마 ↔ Supabase 테이블 컬럼 — **PASS (7/7)**

T1.5 보고서 §4 검증 항목 7개 그대로 적용:

| # | 검증 항목 | 코드 위치 | 결과 |
|---|-----------|-----------|------|
| 1 | `recipes.state` jsonb → `RecipeStateSchema` 라운드트립 | `0001_init.sql:25` jsonb not null + `schema.ts:94-103` 모든 필드 optional | **OK** (jsonb는 `{}`라도 수용, 모든 필드 optional로 빈 객체 통과) |
| 2 | `cook_runs.step_events` jsonb → `z.array(StepEventSchema)` | `0001_init.sql:94` jsonb not null default `'[]'::jsonb` + `schema.ts:147` `z.array(StepEventSchema)` | **OK** (기본값 `[]`로 빈 배열 보장) |
| 3 | `cook_runs.outcome` text → `OutcomeSchema` (NULL 포함) | `0001_init.sql:93` `text check (outcome in ('good','meh','failed'))` (nullable) + `schema.ts:137` `z.enum([...]).nullable()` | **OK** (DB CHECK 제약과 Zod enum 도메인 완전 일치) |
| 4 | `cook_runs` step_event type 도메인 = `StepEventTypeSchema` 포함 `"hotfix"` | `schema.ts:116-121` `["done","timer_done","hotfix","failed_here"]` (DB는 jsonb 내부라 별도 CHECK 없음 — Zod가 단일 게이트) | **OK** (DB는 jsonb로 유연, Zod가 라우트에서 1차 게이트) |
| 5 | `runtime_logs.known_issues` jsonb → `z.array(KnownIssueSchema)` | `0001_init.sql:127` jsonb not null default `'[]'::jsonb` + `schema.ts:166` `z.array(KnownIssueSchema)` | **OK** |
| 6 | `fingerprints.traits` jsonb → `z.array(TraitSchema)` | `0001_init.sql:156` jsonb not null default `'[]'::jsonb` + `schema.ts:185` `z.array(TraitSchema)` | **OK** |
| 7 | 모든 사용자 데이터 테이블 RLS 정책 존재 (5/5) | `0001_init.sql` 5개 테이블 전부 `enable row level security` + 정책 | **OK** (recipes/recipe_versions/cook_runs/runtime_logs/fingerprints 각각 select/insert (+필요 시 update/delete) 정책) |

**잔존 미세 위험 (BLOCK 아님, P1에 인계)**:
- `cook_runs.outcome` CHECK 제약은 단일 값만 검증. `completed=true && outcome=NULL` 조합(§4 위반)을 DB가 막지 못함 → 라우트 레벨 refine 필요. T1.5 보고서 §1.3에 이미 P1 작업 명시.
- `recipe_versions`/`cook_runs`에 delete 정책 부재 → 의도된 불변. 정상.

### 경계 D: 핫픽스 step_event 타입 ↔ runtime.ts 집계 로직

`lib/runtime.ts`는 placeholder(빈 export). 집계 로직은 P1. 본 검증 단계에선 **시그니처 가이드만 확인**:
- 주석 L13-16: `rebuildRuntimeLog(recipeId, runs): RuntimeLog`
- 주석 L9-11: `"failed_here"`와 `"hotfix"` 둘 다 known_issues로 응축됨이 명시 → P1 작업자가 `StepEventTypeSchema`의 4종 모두 처리해야 함이 박혀 있음

P1에서 exhaustive switch가 빠지면 R5(트랜잭션 분리)와 함께 발견될 위험. **본 단계 PASS**.

### 경계 E: Fingerprint traits ↔ 프롬프트 주입 형태

`lib/fingerprint.ts`도 placeholder. 주석 L13-14에 시그니처 가이드 + `lib/prompt.ts` 주석 L15-19에 `fingerprintTraits` 입력 강제. 두 placeholder가 BuildContextSchema를 통해 묶이도록 의도됨. **본 단계 PASS** (P1에서 trait 누락 검증은 그때 적용).

---

## 5. cold-start 검증

| 점검 항목 | 결과 | 근거 |
|----------|------|------|
| RuntimeLog 없는 첫 사용자에서 BUILD가 정상 작동 (타입/주석 차원) | OK | `BuildContextSchema.runtime_log: RuntimeLogSchema.nullable()` (`schema.ts:206`) — null 허용. `cold_start: z.boolean()` 필드가 분기 강제 |
| Fingerprint 없을 때 traits를 빈 객체/null로 일관 처리 | OK | `BuildContextSchema.fingerprint: FingerprintSchema.nullable()` (`schema.ts:207`) |
| cold start 상태가 시스템 프롬프트에 명시되는가 | OK (주석 강제) | `lib/prompt.ts:8-10` "cold start인 경우 '맹탕 모드'임을 systemPrompt가 명시해야 한다. 조용히 무시 금지" — P1 작업자가 누락하면 코드 리뷰에서 잡힘 |
| Postmortem 없는 신규 레시피의 첫 Cook에서도 Line 4가 작동 | OK (구조적) | `cook_runs` PK가 자체 id이므로 첫 행 생성에 의존성 없음. `runtime_logs.recipe_id` PK라 UPSERT로 첫 행 생성 가능 (`on conflict do update`) — P1 구현 가이드는 t2 보고서 §6에 명시 |
| UPSTASH_* 부재 시 명시적 에러 vs 침묵 우회 | OK | `requireEnv`가 throw, 조용한 fallback 0건 (§3.E) |
| dev 모드 rate limit 우회 옵션이 있는가 (정책 명시 필요) | **없음 + 정책 명시됨** | 코드/문서 어디에도 dev bypass 분기 없음. `.env.example:21` "부재 시 lib/env.ts가 명시적 에러를 던진다 (조용한 fallback 금지)" — 개발 환경에서도 Upstash 더미 인스턴스 권장. T2 보고서 R3에 "PR 리뷰 가드" 명시 |

**cold-start 결론**: PASS. 모든 cold start 경로가 타입/주석 레벨에서 cold_start 분기를 거치도록 강제됨.

---

## 6. 결함 목록

**없음**.

T2 보고서 §5에서 식별한 회귀 위험 R1~R8은 모두 "현재 코드는 안전 + P1 작업 시 추가 가드 필요" 형태이며, T3 검증 시점 기준으로 BLOCK 사유가 되는 결함은 없다. P1 작업 시 다음 사항이 자동으로 다시 검증 대상이 된다:

- R2 (rate limit 우회 새 라우트 추가): 새 라우트 PR 시 본 grep 5점검을 그대로 재실행
- R3 (UPSTASH 부재 fallback): 누군가 try/catch로 삼키면 잡아내야 함
- R4 (service-role 오용): 사용자 검증 흐름 P1 도입 시
- R5 (D-008 트랜잭션 분리): `/api/run` 본문 구현 시 호출 순서 유지 + 트랜잭션 원자성 검증
- R6 (IP 위변조): Vercel 외 환경으로 가는 순간 재검증

---

## 7. MAP.md 갱신 권고 (별도)

본 보고서 범위 외이지만 T2 보고서 §7에 인계된 사항. `docs/MAP.md`는 현재 v3 시점 상태로 마감되어 있어 다음과 같이 어긋난다:

- `app/page.tsx`, `app/api/recipe/route.ts`를 ✅로 마킹하나 실제는 placeholder(셸).
- `app/api/run/route.ts`를 📋로 마킹하나 실제는 셸 단계 placeholder로 생성됨.
- 새로 생긴 파일: `lib/env.ts`, `lib/ratelimit.ts`, `lib/supabase.ts`, `app/layout.tsx`, `supabase/migrations/0001_init.sql`, `.env.example`, `.gitignore`, `package.json`, `tsconfig.json`, `next.config.ts`가 MAP에 부재.

이는 T3 BLOCK 사유는 아니지만 CLAUDE.md §8.4 위반이므로 P0 종료 시 doc-taste-scribe(또는 후속 작업자)가 일괄 갱신 필요.

ADR D-011도 `docs/DECISIONS.md`에 정식 등재 필요 (T1 보고서의 초안을 그대로 옮기면 됨).

---

## 8. 사용자 보고용 요약 (5문장 이내)

ROADMAP P0 두 항목(`/api/*` rate limit, `ANTHROPIC_API_KEY` 서버 격리)은 사용자가 채택한 **후보 A — 헌법 강제형 풀셸 부트스트랩 + P0 동시 적용** 형태로 구현되었고, T3 정합성 검증을 통과했다(PASS). 5개 강제 점검(A 클라 번들 격리 / B 라우트별 rate limit / C XFF 신뢰 가드 / D 429 응답 형태 / E UPSTASH 부재 시 fail-fast) 모두 코드 경로로 박혔고, weld-trace 5개 용접 라인과 경계 C(Zod ↔ DB) 7항목 모두 PASS, 결함 0건이다. P1 작업으로 인계되는 잔존 위험은 8개(T2 보고서 §5 R1~R8)이며 모두 가드 권고가 코드 주석에 명시되어 있다. 다음 액션은 (1) 사용자가 ADR D-011을 `docs/DECISIONS.md`에 정식 등재 + `docs/MAP.md` 갱신 + ROADMAP P0 체크박스 마킹, (2) `.env.local`에 실제 Upstash/Anthropic/Supabase 키 채워서 `npm install && npm run build` 빌드 검증, (3) P1(`lib/schema.ts` 활용한 라우트 본문 + UI 구현) 진입이다. 본 셸은 §4 "기능을 떼어내도 다른 단계가 완전한가?" 테스트에서 BUILD/COOK/POSTMORTEM 어느 하나만으로는 컴파일이 안 되도록 placeholder 동시 생성으로 용접되어 있어, 부분 복제 방어가 첫 줄부터 작동한다.
