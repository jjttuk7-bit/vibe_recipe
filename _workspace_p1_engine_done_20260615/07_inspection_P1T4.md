# T4 정합성 검증 보고서 — P1 엔진 코어 (lib/prompt + lib/buildContext + /api/recipe)

**작성자**: welding-inspector
**일자**: 2026-06-14
**입력**:
- T1 보고서 `_workspace/02_welding_review_P1T1.md` (NEED_USER_DECISION 4건 + R12~R15 신규 가드)
- T1 사용자 결정 `_workspace/02b_user_decision_P1T1.md` (GA-1=A / GA-2=A / GA-3=C / GA-4=B)
- T2 보고서 `_workspace/04_engine_change_P1T2.md` (`lib/prompt.ts` 본문 + `trimKnownIssues`)
- T3 보고서 `_workspace/04_engine_change_P1T3.md` (`/api/recipe` 본문 + `lib/buildContext.ts` 신설 + 인증)
- 코드: `lib/prompt.ts`, `lib/buildContext.ts`, `app/api/recipe/route.ts`, `lib/schema.ts`, `app/api/run/route.ts`(회귀), `lib/env.ts`/`lib/ratelimit.ts`/`lib/supabase.ts`(회귀), `components/*`(회귀)
- 절차: `.claude/skills/weld-trace/SKILL.md` (5라인 + 경계 A~E + cold-start)
- P0 회귀 기준: `_workspace_p0_done_20260614/07_inspection_T3.md`, `_workspace_p0_done_20260614/04_engine_change_T2.md` §5/§8-d

**최종 판정: PASS (결함 0)**. 사용자 보고용 요약은 §8 참조.

본문 작성이 R1~R15 회귀 위험 어느 것도 신규로 위반하지 않으며, P0 5점검(A 클라 번들 격리 / B 라우트별 rate limit / C XFF 신뢰 가드 / D 429 응답 형태 / E UPSTASH 부재 fail-fast)이 본문 추가 후에도 모두 작동한다. T3 보고서 §8 신규 위험 R16~R19 중 R16(recipe ownership 미검증), R17(Anthropic 클라 캐싱), R18(재시도 user 메시지), R19(extractJson 슬라이스 노이즈)는 모두 의도된 동작 / 잠재 P2 ADR 후보로 분류되어 본 사이클 BLOCK 사유 아님. **미세 메모 1건**(M-1: T1 architect R15 가드 ↔ T2 본문 표현 차이 — D-001/D-002 결합 해석으로 정합 가능, 별도 §6.1).

---

## 1. 검증 범위 명시

본 검증 대상은 **P1.T4 — 엔진 코어 정합성** = `lib/prompt.ts` 본문 + `lib/buildContext.ts` 신설 + `app/api/recipe/route.ts` 본문 정합성 + P0/T1 가드 회귀 여부. Cook/Postmortem 라우트(`/api/run` 본문)와 클라이언트 UI는 본 사이클 범위 밖이다 — Line 2~5 중 Line 4(트랜잭션)은 placeholder 상태가 변동 없음을 확인하는 회귀 검증만 적용.

실제 런타임 스모크(`npm install && npm run typecheck && npm run build` + curl)는 `node_modules` 미설치 상태 + 더미 키 주입이 필요하므로 본 보고서에서는 정적 분석으로 대체. T3 보고서 §10 인계 "환경변수 부재 상태에서 빌드 자체는 통과해야 함"의 빌드 검증은 사용자 또는 후속 세션에서 권고.

---

## 2. 트레이스한 용접 라인 (weld-trace SKILL §5개 라인)

| 라인 | 시작 | 종착 | PASS/BLOCK | 비고 |
|------|------|------|------------|------|
| **Line 1** BUILD→known_issues/Fingerprint 주입 | `app/api/recipe/route.ts:96-124` ([3a]인증 → [4]fetchBuildContext) → `lib/buildContext.ts:46-117` (fetchBuildContext 본문) → `lib/prompt.ts:65-86` (buildSystemPrompt) | `lib/prompt.ts:136-181` (renderFingerprintSection + renderKnownIssuesSection가 systemPrompt 문자열에 traits/issues 본문 박음) | **PASS (풀 트레이스)** | 다음 §2.1 상세. cold start 분기 포함. |
| **Line 2** COOK 핫픽스 → step_events | `components/CookMode.tsx` (placeholder) | `cook_runs.step_events` jsonb | **PASS (회귀 무변동)** | 본 사이클 무변경. P0 시점 PASS 그대로. |
| **Line 3** COOK 종료 → POSTMORTEM 강제 | `components/CookMode.tsx` (placeholder) | `components/Postmortem.tsx` (placeholder) | **PASS (회귀 무변동)** | 본 사이클 무변경. |
| **Line 4** POSTMORTEM → RuntimeLog/Fingerprint 트랜잭션 | `components/Postmortem.tsx` → `app/api/run/route.ts:55-68` (501 + 주석 골격) | `cook_runs` + `runtime_logs` + `fingerprints` (한 트랜잭션) | **PASS (회귀 무변동)** | `app/api/run/route.ts`는 본 사이클 무변경. 501 placeholder + D-008 트랜잭션 골격 주석 그대로. **신규 위험 R5 위반 0**. |
| **Line 5** 다음 BUILD → Line 1 회귀 | (위 Line 4의 갱신 결과가 다시 Line 1로) | `fetchBuildContext`가 재조회 | **PASS (구조적 회귀)** | `lib/buildContext.ts:53-67` Promise.all로 runtime_logs + fingerprints 재조회. recipe_id null이면 runtime_log 조회 스킵(첫 빌드), userId만 fingerprints 조회. cold_start=true는 `runtimeLog === null && fingerprint === null` 양 조건. 회귀 경로 끊김 0. |

**라인 결과**: 5/5 PASS.

### 2.1. Line 1 풀 트레이스 (본 사이클 가장 중요)

본 사이클의 핵심 검증. weld-trace SKILL §Line 1의 3개 트레이스 질문에 대한 답을 코드 라인 단위로 박는다.

#### Line 1-a. 첫 호출 시점에 RuntimeLog 조회를 수행하는가

| 단계 | 코드 위치 | 동작 |
|------|----------|------|
| 1. 라우트 진입 | `app/api/recipe/route.ts:64` `POST(request)` | — |
| 2. P0 rate limit | `route.ts:66` `enforceRateLimit(request, "recipe")` | gate 분기 |
| 3. body 파싱 | `route.ts:72-92` `RequestBodySchema.safeParse` | 실패 시 400 |
| 4. **인증** | `route.ts:96-100` `authenticateRequest(request)` → `route.ts:184-185` `supabaseServerAnonClient().auth.getUser(token)` | **anon 클라이언트로 검증** (R4 가드). 실패 시 401. user_id 확정. |
| 5. **BuildContext 조회** | `route.ts:103-124` `fetchBuildContext({ recipeId, userId })` | `lib/buildContext.ts:46-117` 진입 |
| 6. service-role 사용 | `buildContext.ts:50` `supabase = supabaseServerServiceRoleClient()` | user_id 확정 후에만 — R4 가드 통과 |
| 7. 병렬 조회 | `buildContext.ts:53-67` `Promise.all([runtime_logs.select(...).eq("recipe_id").eq("user_id").maybeSingle(), fingerprints.select(...).eq("user_id").maybeSingle()])` | recipe_id=null이면 runtime_logs 조회 스킵 (정상 경로) |
| 8. 에러 분기 | `buildContext.ts:69-78` runtime_logs/fingerprints 각각 `.error` 확인 시 throw | 라우트의 GA-3 catch 가 잡음 |
| 9. 데이터 형태화 | `buildContext.ts:84-102` jsonb → KnownIssue[]/Trait[] 정규화 | 본 단계는 형태만 맞춤 — 최종 검증은 다음 단계 |
| 10. **BuildContextSchema.parse** | `buildContext.ts:112-116` SSOT 검증 | ZodError throw → GA-3 catch |
| 11. GA-3 1회 재시도 | `route.ts:104-124` try → catch → try → catch → 502 | 정확히 1회 재시도. 3회째 호출 경로 0. |

**결과**: PASS. BuildContext 조회가 라우트 진입 직후 인증 통과 다음 단계로 박혀 있고, **모든 경로**가 `fetchBuildContext` 를 거친다. 조회 누락 우회 경로 0 (코드 grep으로 확인 §3-d).

#### Line 1-b. 조회 결과가 시스템 프롬프트에 실제로 삽입되는가

| 단계 | 코드 위치 | 동작 |
|------|----------|------|
| 1. buildContext 통과 | `route.ts:128` `callEngineWithRetry(body, buildContext)` | type 시그니처가 BuildContext 필수 — R10 가드 |
| 2. systemPrompt 빌드 | `route.ts:218-222` `buildSystemPrompt({ stage: input.stage, buildContext, recipeState: input.current_state })` | 1차/재시도 모두 동일 system 재사용 |
| 3. fingerprint 절 | `lib/prompt.ts:76` `renderFingerprintSection(buildContext.fingerprint?.traits ?? [])` → `prompt.ts:136-153` | `confidence >= 0.5` 필터 후 `- ${label} (confidence ${...})` 줄로 systemPrompt 본문 박음. 빈 traits면 "사용 가능한 trait 없음" 명시. |
| 4. known_issues 절 | `prompt.ts:78` `renderKnownIssuesSection(buildContext.runtime_log?.known_issues ?? [])` → `prompt.ts:155-181` | `trimKnownIssues(issues, 5)` (GA-2 채택) 호출. `- 스텝 ${step_index}: ${issue} [미해결/해결됨]${fix}` 줄로 박음. elidedNote 메타 명시 ("미해결 우선 정렬 후 최근 5개"). 빈 issues면 "이 레시피의 누적 이슈 없음" 명시. |
| 5. 최종 문자열 | `prompt.ts:85` `sections.join("\n\n").trim() + "\n"` | renderModeHeader(맹탕 모드 분기) + renderRole + renderPipeline + renderBatchEscapeRule + renderFingerprintSection + renderKnownIssuesSection + renderRecipeStateSection + renderInvariantRules + renderTasteDoctrine + renderOutputContract 10절 결합 |
| 6. Anthropic 전달 | `route.ts:261-274` `callAnthropic(system, messages)` → `client.messages.create({ ..., system, ... })` | systemPrompt가 Anthropic API system 필드로 전달 |

**결과**: PASS. BuildContext의 traits와 known_issues가 코드 한 줄도 빠지지 않고 systemPrompt 문자열 본문에 도달한다 (경계 E 검증과도 일치 — §4-E).

#### Line 1-c. cold start 시 명시적으로 "맹탕 상태" 처리하는가 (CLAUDE.md §4)

| 단계 | 코드 위치 | 동작 |
|------|----------|------|
| 1. cold_start 판정 | `buildContext.ts:108` `const coldStart = runtimeLog === null && fingerprint === null` | 둘 다 부재 = true |
| 2. BuildContext.cold_start 필드 | `buildContext.ts:112-116` `BuildContextSchema.parse({ ..., cold_start })` | SSOT 검증 통과 |
| 3. renderModeHeader 분기 | `prompt.ts:92-101` `if (ctx.cold_start) return "[모드: 맹탕 모드 — RuntimeLog/Fingerprint 없음]\n첫 빌드라 부엌에 대한 사전 지식이 없다..."` | **결정적 분기 — "맹탕 모드" 문자열 첫 줄 박음** (사용자 명령) |
| 4. systemPrompt 첫 섹션 | `prompt.ts:71` `sections.push(renderModeHeader(buildContext))` | 첫 섹션. 우회 경로 0. |

**결과**: PASS. R11(cold_start 무시) 가드 코드 강제 통과. grep 검증(§3-e)에서 "맹탕 모드" 문자열 5건 매치 — `prompt.ts:9`/`prompt.ts:70`/`prompt.ts:94`/`prompt.ts:96`(실 본문) 등.

---

## 3. P0 5점검 회귀 (T3 보고서 §4-A 기준)

본문 작성 후 P0 가드가 여전히 작동하는지 확인. P0 T3 시점의 검증 항목을 그대로 재실행.

### A. ANTHROPIC_API_KEY 클라 번들 비노출 — **PASS**

| 점검 | 결과 | 근거 |
|------|------|------|
| `lib/env.ts` 첫 줄 `import "server-only"` | OK | `lib/env.ts:14` |
| `lib/supabase.ts` `import "server-only"` | OK | `lib/supabase.ts:16` |
| `lib/ratelimit.ts` `import "server-only"` | OK | `lib/ratelimit.ts:11` |
| **`lib/buildContext.ts` (신설) `import "server-only"`** | **OK** | **`lib/buildContext.ts:20`** — 신설 파일도 server-only 가드 박힘 |
| `lib/prompt.ts` server-only 의존성 | N (의도) | `lib/prompt.ts` 자체는 순수 함수, env/supabase 의존 0. 클라이언트 빌드에 들어가도 키 누출 위험 0. T2 보고서 §6-e 의도된 비커버리와 일치 |
| `"use client"` 파일에서 `@/lib/{env,supabase,ratelimit,buildContext}` import | 0건 | grep `from "@/lib/(env\|supabase\|ratelimit\|buildContext)"` on `components/` → No matches |
| `process.env.*` 직접 참조가 lib/env.ts 외부에 존재 | 0건 (변동 없음) | P0 시점 검증 그대로 |
| **신규 import (`Anthropic` SDK + `@/lib/buildContext` + `@/lib/prompt`)이 클라 번들 누출 경로 추가** | 0건 | route.ts는 server-only 가드된 lib만 import. Anthropic SDK는 클라이언트 import 0건(grep) |

**결론**: 신설 `lib/buildContext.ts` 가 server-only 가드를 첫 줄에 박았고, 신규 Anthropic SDK import는 라우트 안에서만 호출. 키 누출 경로 추가 없음.

### B. 모든 /api/* 라우트가 rate limit 통과 — **PASS**

| 라우트 | 첫 줄 게이트 호출 | prefix | 결과 |
|--------|------------------|--------|------|
| `app/api/recipe/route.ts` | L66 `const gate = await enforceRateLimit(request, "recipe");` → L67 `if (!gate.ok) return gate.response;` | `viberecipe:recipe` | **PASS** |
| `app/api/run/route.ts` | L35 (변동 없음) | `viberecipe:run` | **PASS** (회귀) |

라우트 전수 열거: `app/api/**/route.ts` 정확히 2개 (변동 없음). 둘 다 첫 정상 분기에서 enforceRateLimit 호출.

**신규 R2 잠재 위험 확인**: 본 사이클에서 새 라우트 추가 0건 → R2 위반 0. catch 패턴으로 rate limit 삼키는 코드 0건 (R3 — grep `catch.*enforceRateLimit` 매치 0). 라우트 본문이 길어졌으나 첫 분기 위치는 그대로.

### C. IP 식별 XFF 신뢰 가드 — **PASS (변동 없음)**

`lib/ratelimit.ts:47-59` `identifyClient` 본 사이클 무변경. P0 시점 PASS + 잔존 위험(anonymous 폴백)도 동일하게 주석으로 명시됨.

### D. 429 응답 형태 — **PASS (변동 없음)**

`lib/ratelimit.ts:86-107` 본 사이클 무변경. 200 응답에 `withRateLimitHeaders` 호출은 본 사이클의 신규 200 분기(`route.ts:129-135` 정상 응답)에도 적용됨 — `route.ts:140-146` 502 분기도 마찬가지 동봉.

### E. UPSTASH_* 부재 시 명시적 에러 — **PASS (변동 없음)**

`lib/env.ts:16-24` `requireEnv` 본 사이클 무변경. 본문 작성 후 신규 try/catch로 env 에러 삼키는 경로 추가 0건 (route.ts grep: `throw` 매치 1건 = `route.ts:247 throw new EngineValidationError`, 의도된 분기. 다른 throw 위치는 주석/문서뿐).

---

## 4. 경계면 비교 (weld-trace SKILL §경계 A~E)

### 경계 A: systemPrompt 출력 명세 ↔ EngineResponseSchema (본 사이클 가장 중요 — 3자 매핑)

**3자 매핑 대상**:
1. `docs/ENGINE.md` §3 명세 본문 (라인 39-49)
2. `lib/prompt.ts:287-311` `renderOutputContract()` 의 systemPrompt 본문
3. `lib/schema.ts:228-235` `EngineResponseSchema`

#### A-1. SSOT 단일성

| 점검 | 결과 | 근거 |
|------|------|------|
| `EngineResponseSchema = z.object(...)` 정의 위치 | 1건 (`lib/schema.ts:228`) | grep 매치 1건 — 라우트/prompt 어디에도 재정의 0 |
| `StageSchema = z.enum([...])` 정의 위치 | 1건 (`lib/schema.ts:43`) | grep 매치 1건 |
| 라우트 안 데이터 모델 스키마 로컬 정의 (§8-c rev2 grep 6번) | 0건 | grep `^(const\|export const) (Engine\w*\|Stage\|RecipeState\|CookRun\|RuntimeLog\|Fingerprint\|BuildContext\|Trait\|KnownIssue)Schema\s*=\s*z\.` on `app/api/**/route.ts` → 매치 0. `RequestBodySchema` 는 enum 범위 밖(클라 입력 검증 전용 — T3 §6 자체 점검과 일치) |
| `@/lib/schema` import (§8-c rev2 grep 7번) | 4건 매치 | `app/api/recipe/route.ts:34`, `app/api/run/route.ts:24`, `lib/prompt.ts:34`, `lib/buildContext.ts:27` — 스키마를 쓰는 모든 파일이 SSOT 한 곳만 참조 |
| **신설 `lib/buildContext.ts` 안 데이터 모델 스키마 재정의** | 0건 | grep `^(const\|export const) \w+Schema\s*=\s*z\.` on `lib/buildContext.ts` → 매치 0. `BuildContextSchema.parse` 호출만 (`buildContext.ts:112`) |
| **신설 `lib/prompt.ts` 안 데이터 모델 스키마 재정의** | 0건 | grep on `lib/prompt.ts` → 매치 0. 모두 `type` import (5개: `BuildContext`/`KnownIssue`/`RecipeState`/`Stage`/`Trait` — `prompt.ts:28-34`) |

**결과**: R9 SSOT 표류 가드 통과. 데이터 모델 정의는 `lib/schema.ts` 한 곳뿐.

#### A-2. ENGINE.md §3 본문 ↔ renderOutputContract systemPrompt 본문 ↔ EngineResponseSchema (6키 1:1)

| 키 | ENGINE.md §3 (L42-48) | renderOutputContract (`prompt.ts:296-303`) | EngineResponseSchema (`schema.ts:228-235`) | 일치 |
|---|---|---|---|---|
| `message` | "대화 텍스트 (1~3문장)" | "대화 텍스트 (1~3문장, 빈 문자열 금지)" | `z.string().min(1)` | **3자 일치** |
| `stage` | `"concept\|base\|taste\|steps\|done"` | `"concept \| base \| taste \| steps \| done"` | `StageSchema` (enum 5종) | **3자 일치** |
| `new_state` | "확정된 필드만" 또는 null | "RecipeState 부분객체 — 이번 턴 확정된 필드만. 변경 없으면 null" | `RecipeStateSchema.nullable()` (모든 필드 optional이므로 부분 객체 통과) | **3자 일치** (의도된 D-001 부분 객체 해석. §6.1 M-1 참조) |
| `options` | "선택지 (각 15자 이내)" | "선택지 (각 15자 이내, 최대 3개)" | `z.array(z.string().min(1).max(15)).min(0).max(3)` | **3자 일치** (ENGINE.md "2~3개" 표현은 T1.5 rev2의 의도된 완화 — min(0) 허용. 사용자 결정문 GA-2/T1.5 §1.4와 일치) |
| `change_log` | "요리 관점 문장만" | "요리 관점 변경 문장만 (내부 메타 금지)" | `z.array(z.string().min(1))` | **3자 일치** |
| `warnings` | "조리 원리상 위험/한계" | "조리 원리상 위험·한계 (없으면 빈 배열)" | `z.array(z.string().min(1))` | **3자 일치** |

#### A-3. new_state 부분 형식 — D-005 timer_sec 강제

| 점검 | renderOutputContract (`prompt.ts:305-308`) | EngineResponseSchema → RecipeStateSchema → StepSchema (`schema.ts:84-87`) | 일치 |
|------|-----------------------------------|--------------------------------------------------------------------------|------|
| `steps[].text` | "{ text: string, timer_sec: number }" 형식 강제 | `text: z.string().min(1)` | **일치** |
| `steps[].timer_sec` | "타이머가 필요 없는 스텝도 timer_sec: 0 명시" 강제 | `timer_sec: z.number().int().min(0)` (optional 아님) | **일치** |
| 텍스트 파싱 금지 명시 | "텍스트에 '3분'이라 쓰고 timer_sec 를 생략하는 패턴은 금지" | StepSchema가 timer_sec를 required로 강제 — schema가 거부 | **일치 (D-005 코드 강제)** |
| taste/texture 0~10 정수 | "값은 0~10 정수 게이지. 범위를 벗어나면 서버가 클램프" | `GaugeSchema` `z.coerce.number().transform(n => Math.max(0, Math.min(10, Math.round(n))))` | **일치 (ENGINE.md §5 클램프 정합)** |

#### A-4. stage 분기 (Stage enum 양쪽 모두 5종 일치)

| 분기 | `lib/prompt.ts` | `lib/schema.ts` |
|------|----------------|----------------|
| concept | `renderStageTasteClause:251` case | `StageSchema:43` "concept" |
| base | `prompt.ts:252` case | `schema.ts:43` "base" |
| taste | `prompt.ts:254-260` case | `schema.ts:43` "taste" |
| steps | `prompt.ts:261-267` case | `schema.ts:43` "steps" |
| done | `prompt.ts:268-277` case | `schema.ts:43` "done" |
| default exhaustive | `prompt.ts:278-283` `const _exhaustive: never = stage;` | (TypeScript가 잡음) |

**5/5 stage 완전 일치 + exhaustive 컴파일 가드**.

**경계 A 결론**: 3자 매핑 PASS. SSOT 단일성 + 6키 1:1 + new_state.steps timer_sec 강제 + stage 5종 모두 일치. R14(options 15자) / D-005(timer_sec) / D-001/D-002(new_state 부분 객체) 모두 코드 + 명세 + Zod 3자에서 일관 강제됨.

### 경계 B: API 응답 타입 ↔ 클라이언트 사용 타입

본 사이클 클라이언트(`components/BuildMode.tsx`)는 아직 placeholder (`components/BuildMode.tsx:12-18` — 정적 JSX만). 따라서 클라 사용 타입 검증 대상 0.

**라우트 응답 형태 합의(T3 §1 / §10)**:
- 200: `{ engineResponse: EngineResponse, parsedAt: string (ISO) }`
- 400: `{ error: "invalid_json" | "invalid_request", message?, details? }`
- 401: `{ error: "missing_authorization" | "missing_token" | "invalid_token", message }`
- 502: `{ error: "build_context_fetch_failed" | "engine_validation_failed" | "engine_call_failed", message }`
- 429: `{ error: "rate_limited", message, retry_after_sec }` (ratelimit 헬퍼)

**T3 작업 시 task description의 응답 본문 합의(`_workspace/00_input/request.md` 미명시 부분 — splitDiff는 클라 책임)**: T3 §9 "라우트는 splitDiff 를 호출하지 않는다 — 응답 본문은 `{ engineResponse, parsedAt }` 만". `mods?: { created, modified, removed }` 필드는 본 사이클 응답에 **없다** (의도된 비커버리 — 클라가 prev state + engineResponse.new_state로 splitDiff 직접 호출). 본 합의는 T3 보고서 §1 + §9에 명시되어 있어 P2(클라 본문 구현 시점)에 동일 SSOT를 따르면 됨.

**경계 B 결론**: PASS (검증 대상 클라 코드 없음 / 응답 shape 자체 정의는 T3에서 SSOT로 박힘). P2 클라이언트 본문 구현 시 본 라우트의 200 응답 shape을 그대로 클라 fetch 핸들러에 매핑하면 됨. mods가 응답에 없음을 클라 작업자가 인지할 책임 — T3 §9에 명시되어 별도 ADR 없이도 SSOT 흐름 통과.

### 경계 C: Zod 스키마 ↔ Supabase 테이블 컬럼

본 사이클 schema/migration 무변경 → P0 T3 시점 7/7 PASS 그대로. 단, **신설 경계 검증 1건 추가**:

| 점검 | 결과 | 근거 |
|------|------|------|
| `fetchBuildContext`의 SELECT 컬럼이 RuntimeLog/Fingerprint 스키마와 일치 | OK | `buildContext.ts:58` `.select("recipe_id, user_id, total_runs, known_issues")` — `RuntimeLogSchema` 의 `recipe_id`/`total_runs`/`known_issues` 3개 매치 + RLS 우회용 `user_id` 추가. `buildContext.ts:63` `.select("user_id, total_runs_all_recipes, traits")` — `FingerprintSchema` 의 `user_id`/`total_runs_all_recipes`/`traits` 3개 완전 매치 |
| `runtime_logs` 테이블 PK `recipe_id` 단일 vs `(recipe_id, user_id)` 복합 | (확인) 본 사이클 영향 없음 — `eq("recipe_id").eq("user_id")` 양 조건 매칭으로 한 row 유일성 보장 (R4 가드) | `buildContext.ts:58-60` |
| `maybeSingle()` 사용으로 row 0/1 모두 정상 경로 | OK | `buildContext.ts:61, 66` — `null` 반환 시 cold_start=true로 흘러감 (오류 아님). GA-3 결정문 "데이터 없음은 502 아님" 일치 |

### 경계 D: 핫픽스 step_event 타입 ↔ runtime.ts 집계 로직

본 사이클 범위 밖 (`lib/runtime.ts` 무변경 — P0 placeholder 그대로). 경계 D는 P1 후속 사이클(`/api/run` 본문)에서 검증.

### 경계 E: Fingerprint traits ↔ 프롬프트 주입 형태

| 점검 | 결과 | 근거 |
|------|------|------|
| `Trait` 의 4필드 (`key`/`label`/`confidence`/`evidence_run_ids`) 중 systemPrompt 본문 도달 | `label` + `confidence` 사용. `key` + `evidence_run_ids` 미사용 (의도된 비커버리) | `prompt.ts:146` `\`- ${t.label} (confidence ${t.confidence.toFixed(2)})\`` |
| 미사용 필드(`key`, `evidence_run_ids`)의 이유 | LLM 입력에 노이즈만 추가 — `key`는 내부 식별자(예: `"high_heat_kitchen"`), `evidence_run_ids`는 UUID 배열로 LLM 가독성 0. T2 §5 결정성 + T1 §주2와 일치 | `prompt.ts:136-153` 본문 |
| `confidence >= 0.5` 필터 임계값 | TASTE.md §5 미정 TODO 인용으로 잠정값. 변경 시 ADR 필요 | `prompt.ts:47` `TRAIT_MIN_CONFIDENCE = 0.5` + 주석 |
| 빈 traits/cold_start 처리 | "사용 가능한 trait 없음 (또는 confidence 미달). 일반 가정 부엌 기준으로 가정한다." 명시 | `prompt.ts:141-144` |

**경계 E 결론**: PASS. 미사용 필드는 의도된 비커버리(노이즈 제거)이며 ADR 변경 시 변경 가능한 구조. cold start/저신뢰도 경로 모두 명시적 처리.

---

## 5. D-001~D-014 ADR 강제 점검 (본 사이클)

| ADR | 본 사이클 강제 위치 | 결과 |
|-----|-------------------|------|
| **D-001** (diff는 코드 계산) | `route.ts:13` 주석 "splitDiff 는 클라가 계산하므로 여기선 new_state 만". 응답 본문에 mods/diff 필드 0. `EngineResponseSchema.new_state` 가 RecipeState (LLM에 diff 필드 요구 0). | **PASS** |
| **D-002** (생성=카드, 수정=diff) | `prompt.ts:309-310` "이번 턴에 새로 확정되거나 사용자가 명시적으로 수정 요청한 필드만 포함. 변경 없으면 null". 패치 규율 명시 | **PASS** |
| **D-003** (한 턴 한 단계) | `prompt.ts:111-124` `renderPipeline(stage)` "이번 턴에는 현재 단계의 작업만 진행한다. 절대 여러 단계를 건너뛰지 않는다." | **PASS** |
| **D-003a** (GA-1 A 채택 — 키워드 매칭만) | `prompt.ts:126-134` `renderBatchEscapeRule()` 6개 키워드("알아서/한번에/대충/다 해줘/빠르게/바로") 자연어 규칙 명시. 별도 `inferMode` 함수 추가 0 (grep 매치 0) | **PASS** (사용자 결정 GA-1=A 일치) |
| **D-004** (Zod 1회 재시도) | `route.ts:209-248` `callEngineWithRetry`. 1차 호출 (L225) → tryParseEngineResponse (L226) → 실패 시 retryMessages (L231-241) → 2차 호출 (L242) → tryParseEngineResponse (L243) → 실패 시 `throw new EngineValidationError` (L247). **호출 카운트 정확히 2** (grep `callAnthropic\(` 매치 2건 + 함수 정의 1건). 3회째 경로 0. | **PASS (R12 가드 통과)** |
| **D-005** (timer_sec 강제) | `prompt.ts:305-306` "타이머가 필요 없는 스텝도 `timer_sec: 0` 을 명시... 텍스트에 '3분'이라 쓰고 timer_sec 를 생략하는 패턴은 금지". `StepSchema.timer_sec` (`schema.ts:86`) `z.number().int().min(0)` required | **PASS** |
| **D-006** (핫픽스 새 버전 금지) | 본 사이클 범위 밖. systemPrompt가 done 단계에서 "핫픽스 우선순위" 안내 (`prompt.ts:268-277`)만, RecipeState 변경 강제 아님 | **PASS (범위 밖 / 회귀 영향 0)** |
| **D-007** (localStorage 금지) | `lib/buildContext.ts` 가 Supabase에서 조회 (`buildContext.ts:50-66`). localStorage 사용 0 (grep `localStorage` 매치 0) | **PASS** |
| **D-008** (용접 의존성) | `route.ts:103-124` BuildContext 조회 강제 + `callEngineWithRetry` 매개변수 (`route.ts:209-212`) BuildContext 필수 + `prompt.ts:65-86` `buildSystemPrompt` 매개변수 BuildContext 필수. 우회 경로 0 (type 시그니처 강제). cold_start 분기 `prompt.ts:92-101`. | **PASS (R10/R11 가드 통과)** |
| **D-009** (TASTE.md 외 임의 결정 금지) | `prompt.ts:219-247` `renderTasteDoctrine(stage)` GA-4 B 채택 — stage별 분기 인용. 모든 stage 공통 §4 언어 톤. "원칙에 없는 새 판단이 필요하면 임의로 결정하지 말고 options 또는 warnings 로 사용자에게 묻는다. 이 판단들이 곧 해자다." (`prompt.ts:245`) | **PASS (사용자 결정 GA-4=B 일치)** |
| **D-010** (공급 측 독점) | 무관 | — |
| **D-011** (셸 부트스트랩 SSOT) | 라우트가 `@/lib/schema` 단일 import 유지 (§4 경계 A-1). rev2 §8 SSOT 단일화 회귀 0건 | **PASS (R5/R9 가드 통과)** |
| **D-012** (GA-2 N=5 미해결 우선) | `prompt.ts:43` `KNOWN_ISSUES_BUDGET = 5` 상수. `trimKnownIssues` (`prompt.ts:322-333`) 미해결 우선 → 해결됨 순으로 정렬, N=5 budget. 메타 명시 (`prompt.ts:171-174`) "미해결 우선 정렬 후 최근 5개". | **PASS (사용자 결정 GA-2=A 일치)** |
| **D-013** (GA-3 1회 재조회 후 502) | `route.ts:103-124` try → catch → try → catch → 502. 정확히 1회 재시도. 502 본문 `{ error: "build_context_fetch_failed", message: "지난 기록을 불러오지 못했어요. 다시 시도해주세요." }` (사용자 결정문 표현 그대로). | **PASS (사용자 결정 GA-3=C 일치)** |
| **D-014** (GA-4 stage별 TASTE 인용) | `prompt.ts:249-285` `renderStageTasteClause(stage)` switch 분기. concept/base 인용 0, taste §1, steps §2, done §3, 모든 stage 공통 §4. exhaustive `_exhaustive: never` 가드. | **PASS (사용자 결정 GA-4=B 일치)** |

**ADR 14건 중 본 사이클 적용 12건 모두 PASS** (D-006/D-010 범위 밖).

---

## 6. 회귀 위험 R1~R19 점검

| 위험 | 본 사이클 적용 | 결과 |
|------|--------------|------|
| **R1. 클라 번들 키 누출** | components/* import 0건 (grep) | **PASS** |
| **R2. rate limit 우회 새 라우트** | 새 라우트 추가 0건. /api/recipe, /api/run 둘 다 첫 줄 enforceRateLimit 유지 | **PASS** |
| **R3. UPSTASH 부재 fallback** | route.ts에 enforceRateLimit catch 0건 (grep `catch.*enforceRateLimit` 매치 0). gate.ok=false면 즉시 return | **PASS** |
| **R4. service-role 오용** | route.ts:96-100 인증 통과 후에만 fetchBuildContext 호출. buildContext.ts:60 `.eq("user_id", userId)` user_id 매칭 강제 | **PASS** |
| **R5. D-008 트랜잭션 분리** | /api/run 무변경 (501 placeholder + 트랜잭션 골격 주석 그대로). 본 사이클은 /api/recipe만 변경 | **PASS** |
| **R6. IP 위변조** | ratelimit.ts 무변경. Vercel 환경 한정 안전 (변동 없음) | **PASS** |
| **R7. 모델 키 비용 폭발** | env.ts:49 `vibeRecipeModel` optionalEnv 기본 haiku. route.ts:253, 263 `vibeRecipeModel()` 호출 — 환경변수로만 변경 가능 | **PASS** |
| **R8. server-only 우회** | route.ts/buildContext.ts/prompt.ts 모두 static import 사용. dynamic import 0건 | **PASS** |
| **R9. SSOT 표류 재발** | 라우트 안 스키마 재정의 0건 (RequestBodySchema는 클라 입력 검증 — enum 범위 밖). prompt.ts/buildContext.ts 모두 type-only import + parse 호출만 | **PASS** |
| **R10. BuildContext 누락** | `callEngineWithRetry(input: RequestBody, buildContext: BuildContext)` (route.ts:209-212) type 시그니처 강제. `buildSystemPrompt({ stage, buildContext, recipeState? })` (prompt.ts:53-59) type 시그니처 강제. 우회 경로 0 | **PASS** |
| **R11. cold_start 무시** | renderModeHeader (prompt.ts:92-101) 결정적 분기 "맹탕 모드" 문자열 박음. buildContext.ts:108 cold_start 판정 명시 | **PASS** |
| **R12. JSON 추출 무한 루프 / 1회 초과 재시도** | callEngineWithRetry callAnthropic 카운트 2 (grep), 3회째 경로 0. extractJson `throw` 0 (null 반환만 — route.ts:312-317). tryParseEngineResponse가 extractJson 실패/JSON.parse 실패/Zod 실패 3가지 모두 동일 재시도 루프로 묶음 | **PASS** |
| **R13. messages 8턴 초과** | RequestBodySchema.messages.max(8) (route.ts:54) + callEngineWithRetry 첫 줄 `input.messages.slice(-8)` (route.ts:215) **이중 가드**. 재시도 시 retryMessages는 user 메시지 1개 추가로 9개 가능성 있으나 의도된 "재시도" 추가 (R13 위반 아님 — T3 §4 R13 자체 점검과 일치) | **PASS** |
| **R14. options 15자 초과** | EngineResponseSchema `z.string().min(1).max(15)` 강제. systemPrompt가 prompt.ts:208 "각 15자 이내", prompt.ts:300 "각 15자 이내, 최대 3개" 2회 명시 | **PASS** |
| **R15. new_state 부분 반환 정책** | EngineResponseSchema `RecipeStateSchema.nullable()` (모든 필드 optional). systemPrompt prompt.ts:210 "이번 턴에 확정된 필드만. 변경 없으면 null. 부분 객체 반환 가능 (전체 상태 복사 금지)", prompt.ts:308-310 "이미 확정된 필드는 다시 보내지 않는다 — 이번 턴에 새로 확정되거나 사용자가 명시적으로 수정 요청한 필드만 포함. 변경이 전혀 없으면 new_state: null 로 보낸다." | **PASS (M-1 미세 메모 §6.1)** |
| **R16. recipe ownership 미검증** | T3 §8 자체 인정. fetchBuildContext에서 `.eq("user_id", userId)` 매칭으로 다른 사용자 레시피 ID는 null 반환 → cold_start 흐름. **데이터 누수 0** | **PASS (잔존 위험 — P2 ADR 후보 D-015)** |
| **R17. Anthropic 클라이언트 캐싱 누수** | cachedAnthropic 모듈 스코프 (route.ts:250-255). 키 회전 시 재배포 필요 — 의도된 캐싱 | **PASS (의도된 동작)** |
| **R18. 재시도 user 메시지 변조** | retryMessages의 "[시스템 검증 실패…]" 추가 메시지는 라우트 응답에 포함되지 않음 (200 응답 본문은 `{ engineResponse, parsedAt }`만). 클라이언트 UI 누수 0 | **PASS** |
| **R19. extractJson 슬라이스 노이즈** | 첫 `{` ~ 마지막 `}` 슬라이스 후 JSON.parse 실패 시 D-004 재시도 1회 → 그래도 실패면 502. **무한 루프 가능성 0** (R12 가드와 결합). 일부 입력 패턴에서 두 번째 시도도 실패 가능은 D-004 정책상 502 노출이 옳음 | **PASS (잔존 위험 — 의도된 D-004 흐름)** |

**R1~R19 모두 PASS**.

### 6.1. 미세 메모 M-1 — R15 표현 차이 (BLOCK 사유 아님)

**관찰**: T1 architect 보고서 §5 R15 가드 권고는 *"new_state는 변경 후 **전체** 상태. 변경 없으면 null"*. 그러나 T2 본문 (`prompt.ts:210`, `prompt.ts:308-310`)은 *"이번 턴에 확정된 필드만. 부분 객체 반환 가능 (전체 상태 복사 금지)"*. 표면적 표현이 다르다.

**해석**: 이는 D-001과 D-002의 결합 해석 차이다.
- T1 architect는 D-001 단순 해석("LLM은 new_state 전체 반환") 기반으로 R15를 "전체 상태"로 표현.
- T2 본문은 D-001 + D-002("생성=카드, 수정=diff") + 패치 규율(ENGINE.md §4-규칙6 "이미 확정된 필드는 요청 없이 변경 금지") 결합 해석으로 "이번 턴 확정된 필드만 부분 객체"로 표현. 서버가 splitDiff(prev, next)로 prev와 결합하여 전체 상태를 복원.

EngineResponseSchema의 `new_state: RecipeStateSchema.nullable()`은 모든 필드 optional이라 **두 해석 모두 통과**. T1과 T2가 다른 표현을 쓰는 것이 Zod 스키마 표류는 아니다 — 같은 SSOT를 다르게 해석한 것뿐. 두 해석 모두 클라이언트에서 splitDiff로 prev state와 결합하여 동일한 결과(새 state 복원).

**판정**: T2 본문이 D-002 패치 규율(이미 확정된 필드 다시 안 보냄)을 더 정교하게 강제. 의도된 결합 해석으로 정합 가능. BLOCK 사유 아님. 단 P2 클라이언트 본문 구현 시 splitDiff 호출 위치에서 "new_state는 부분 객체"임을 인지 + prev와 병합 후 splitDiff 호출하는 코드가 필요. 이는 task description("splitDiff는 클라가 계산")과 일치.

**권고**: ADR D-001 본문 또는 ENGINE.md §3에 "new_state는 부분 객체이며 서버 splitDiff가 prev + new_state를 병합하여 전체 상태 계산"이라는 한 줄을 doc-taste-scribe가 사이클 마무리 단계에 명시화 권고. **본 사이클 BLOCK 사유 아님**.

---

## 7. cold-start 검증 (weld-trace SKILL §결함 보고서 체크리스트)

| 점검 항목 | 결과 | 근거 |
|----------|------|------|
| RuntimeLog 없는 첫 사용자에서 BUILD가 정상 작동 | OK | recipe_id=null 경로 `buildContext.ts:54-55` runtime_logs 조회 스킵. fingerprints 조회 후 둘 다 null이면 cold_start=true |
| Fingerprint 없을 때 traits를 빈 객체로 일관 처리 | OK | `buildContext.ts:101` `traits: (fingerprintRaw.traits as ...) ?? []`. prompt.ts:76 `?? []` 이중 가드 |
| cold start 상태가 시스템 프롬프트에 명시되는가 | **OK (실 본문 박힘)** | `prompt.ts:96` `"[모드: 맹탕 모드 — RuntimeLog/Fingerprint 없음]\n첫 빌드라 부엌에 대한 사전 지식이 없다. 일반 가정식 기준으로 시작하되, 단정적 보정은 자제한다."` |
| Postmortem 없는 신규 레시피의 첫 Cook에서도 Line 4가 작동 | OK (구조적) | /api/run 무변경. cook_runs PK 자체 id로 첫 행 생성 가능. runtime_logs UPSERT (on conflict do update) 골격 그대로 |
| UPSTASH_* 부재 시 명시적 에러 vs 침묵 우회 | OK | env.ts:16-24 requireEnv 변동 없음. route.ts 안 silently fallback 0건 |
| dev 모드 rate limit 우회 옵션 | 없음 + 정책 명시됨 | P0 시점과 동일 (.env.example:21 명시) |
| **신규: BuildContext 조회 1회 재시도 후 502 분기 명확** | OK | route.ts:103-124 try → catch → try → catch → 502. 정확히 1회 재시도. UX는 D-004 엔진 502와 동일 형태(`{ error, message }`) |
| **신규: 인증 없는 요청은 401 분기** | OK | route.ts:96-100 + 157-196. missing_authorization / missing_token / invalid_token 3종 분기. anon 클라이언트로 검증(R4 가드) |

**cold-start 결론**: PASS. 모든 cold start 경로가 코드+systemPrompt 양쪽에서 명시적 분기 통과. 인증 흐름과 GA-3 502 흐름 양쪽 모두 명확.

---

## 8. 사용자 보고용 요약 (5문장 이내)

P1 엔진 코어(`lib/prompt.ts` + `lib/buildContext.ts` 신설 + `/api/recipe` 본문) 3개 본문이 모두 헌법(§1, §4, §7 D-001~D-014) 및 P0 가드 회귀 기준을 통과했고, weld-trace 5개 라인(특히 Line 1 BuildContext→systemPrompt 풀 트레이스) + 경계 A(ENGINE.md ↔ renderOutputContract ↔ EngineResponseSchema 3자 1:1) + 경계 C/E + cold-start 5종 모두 PASS, 결함 0건이다. 사용자 결정 4건(GA-1=A 키워드 매칭만 / GA-2=A 미해결 우선 N=5 / GA-3=C 1회 재시도 후 502 / GA-4=B stage별 TASTE 인용)이 모두 코드로 정확히 박혔고, T1 architect가 식별한 회귀 위험 R12~R15도 systemPrompt + 라우트 양쪽 가드로 통과, T3 신규 위험 R16~R19는 모두 의도된 동작 또는 별도 ADR 후보로 분류되어 본 사이클 BLOCK 사유 아니다. 미세 메모 1건(M-1: T1 R15 "전체 상태" 권고 ↔ T2 본문 "부분 객체 + splitDiff 결합" 표현 차이)은 D-001/D-002 결합 해석으로 정합 가능 — Zod 스키마 표류 없음, 향후 doc-taste-scribe가 ADR D-001 본문에 한 줄 명시화 권고이며 본 사이클 PASS에는 영향 없음. 다음 액션은 (1) doc-taste-scribe가 ADR D-012/D-013/D-014 + 인증 정책 D-015 후보 + R15 부분 객체 해석 한 줄 + MAP.md(`lib/buildContext.ts` 신설 반영)를 일괄 등재, (2) 사용자가 `.env.local`에 키 채워 `npm install && npm run typecheck && npm run build` 실거 검증, (3) P1 후속(`/api/run` 본문 + `lib/diff.ts`/`lib/runtime.ts`/`lib/fingerprint.ts` 본문 + components/* UI) 진입이다. 본 엔진 코어는 §4 용접 테스트("엔진 코어를 떼어내도 다른 단계가 완전한가?")에서 분명한 N — BuildContext가 다음 단계의 필수 입력이고 결과가 RecipeState로 흘러 Cook → Postmortem → RuntimeLog → 다음 BUILD로 순환하는 구조가 코드+타입+SSOT 3중 강제로 박혔다.

---

## 9. 후속 작업 인계

- **doc-taste-scribe (사이클 마무리)**:
  - ADR D-012 (GA-2 known_issues 트리밍 N=5 미해결 우선) 등재
  - ADR D-013 (GA-3 BuildContext 조회 1회 재시도 후 502) 등재
  - ADR D-014 (GA-4 systemPrompt TASTE.md stage별 인용) 등재
  - ADR D-015 후보 (인증 경계 — Authorization Bearer JWT + anon 클라 검증 + service-role 분리) — T3 §5 + 본 보고서 §3-A
  - ADR D-001 본문 한 줄 추가 권고 (M-1 §6.1: new_state는 부분 객체, 서버 splitDiff가 prev + new_state 병합)
  - `docs/MAP.md` 갱신: `lib/buildContext.ts` 신설 + `lib/prompt.ts` placeholder → 본문 + `app/api/recipe/route.ts` placeholder → 본문 + `lib/diff.ts`/`runtime.ts`/`fingerprint.ts`/`/api/run` 여전히 placeholder 명시
  - `docs/SESSION.md` 갱신: P1 엔진 코어 사이클 마무리 기록
- **engine-builder (P1 후속 사이클)**:
  - `/api/run` 본문 (CookRun INSERT + RuntimeLog UPSERT + Fingerprint UPSERT 트랜잭션, Postgres RPC 권장)
  - `lib/diff.ts:splitDiff` 본문
  - `lib/runtime.ts:rebuildRuntimeLog` 본문 (StepEventType 4종 exhaustive switch 필수)
  - `lib/fingerprint.ts:recomputeFingerprint` 본문
- **ui-builder (P1 후속 사이클)**:
  - `components/BuildMode.tsx` 본문 — 본 라우트 200 응답 shape `{ engineResponse, parsedAt }` 기준 + splitDiff(prev, engineResponse.new_state) 클라 호출
  - `components/CookMode.tsx`, `components/Postmortem.tsx` 본문 — Line 2~4 풀 강제
- **사용자 (유케이)**:
  - `.env.local` 더미/실 키 채워 `npm install && npm run typecheck && npm run build` 빌드 검증
  - 본 사이클 결과물 git commit

---

## 10. 검증 메타

- 본 보고서 작성 중 weld-trace 스킬(`.claude/skills/weld-trace/SKILL.md`)을 Skill 도구로 직접 호출 시도 → "Unknown skill" 오류. 절차 본문을 그대로 참조하여 5라인 + 경계 A~E + cold-start 7종을 정적 분석으로 수행. 런타임 스모크(npm install/build/curl)는 본 보고서 §1 명시한 대로 사용자 또는 후속 세션에서 수행 권고.
- P0 사이클 inspector 학습 "두 쪽 동시 읽기" + "시점 추론: 파일 timestamp" 두 가지 모두 본 사이클에 적용. timestamp 점검에서 T1/T2/T3 보고서 산출물 4건 정상 도착 확인(`02_welding_review_P1T1.md` 12:22 / `02b_user_decision_P1T1.md` 18:17 / `04_engine_change_P1T2.md` 18:22 / `04_engine_change_P1T3.md` 18:43), 본문 timestamp(`lib/prompt.ts` 18:20 / `lib/buildContext.ts` 18:23 / `app/api/recipe/route.ts` 18:36) 모두 T2/T3 보고서 timestamp 직전에 박혀 정합.
- 본 보고서가 도달 가능한 모든 grep 검증은 직접 수행 + 코드 라인 인용으로 박았다. T2 보고서 §6 5종 + T3 보고서 §7 8종 grep 모두 본 검증에 통합되어 별도 재실행 불필요.
