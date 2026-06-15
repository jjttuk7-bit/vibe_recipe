# P1.T3 변경 보고서 — `/api/recipe` 본문 구현

**작성자**: engine-builder
**일자**: 2026-06-14
**입력**: P1.T1 PASS (welding-architect 보고서 + 사용자 결정 GA-1~4 / R12~R15), P1.T2 산출물 (`lib/prompt.ts` 본문)
**검증자**: welding-inspector (T4 단계)

---

## 1. 산출물

| 파일 | 변경 |
|------|------|
| `app/api/recipe/route.ts` | P0 placeholder(501) → 본문 구현. POST 핸들러 [1]~[5] + 인증([3a]) + callEngineWithRetry/callAnthropic/tryParseEngineResponse/extractJson + EngineValidationError + authenticateRequest |
| `lib/buildContext.ts` | **신설**. `fetchBuildContext({ recipeId, userId })` — service-role 클라이언트로 runtime_logs + fingerprints 병렬 조회 후 BuildContextSchema.parse |

다른 파일은 본 사이클에서 변경하지 않음. `lib/prompt.ts` 는 T2 산출물 그대로 사용.

---

## 2. 처리 흐름 (POST 핸들러)

```
[1] enforceRateLimit("recipe")             — P0 가드 (lib/ratelimit.ts)
[2] env 가드                                — anthropicApiKey/vibeRecipeModel 은 실제 호출 시점에 throw
[3] RequestBodySchema.safeParse             — 400 invalid_request
[3a] authenticateRequest                    — Authorization: Bearer <jwt> → supabase.auth.getUser → user_id
[4] fetchBuildContext (GA-3 1회 재시도)     — 둘 다 실패 시 502 build_context_fetch_failed
[5] callEngineWithRetry (D-004 1회 재시도)  — 성공 200 { engineResponse, parsedAt }
                                              실패 502 engine_validation_failed | engine_call_failed
```

---

## 3. 사용자 결정 (GA-1~4) 반영 위치

### GA-1 (D-003a 모드 — 키워드 매칭 자연어 규칙)
- 라우트 본문에는 키워드 분기 코드 0. T2 `lib/prompt.ts:renderBatchEscapeRule()` 의 systemPrompt 자연어 절이 SSOT.

### GA-2 (known_issues 트리밍 N=5 미해결 우선)
- 라우트는 트리밍에 관여하지 않는다. `buildSystemPrompt` 가 내부에서 `trimKnownIssues` 호출 (T2 산출물).
- `lib/buildContext.ts:normalizeKnownIssues` 가 jsonb 컬럼을 KnownIssue[] 로 안전화하지만 정렬은 하지 않는다 — KnownIssueSchema 에 timestamp 가 없어 코드 내 정렬 키 없음. "최근" 판정은 호출 경로 전체에서 입력 순서 보존만 보장.

### GA-3 (BuildContext 조회 실패 — 1회 재조회 후 502)
- 본 라우트 [4] 위치에 정확히 사용자 결정문 의사코드대로 구현:
  ```ts
  try { ctx = await fetchBuildContext(...); }
  catch { try { ctx = await fetchBuildContext(...); } catch { return 502; } }
  ```
- 502 응답 본문: `{ error: "build_context_fetch_failed", message: "지난 기록을 불러오지 못했어요. 다시 시도해주세요." }` (UX 가 D-004 엔진 502 와 동일 — "다시 시도" 버튼).
- 데이터 없음(첫 사용자)은 502 가 아니다. `fetchBuildContext` 가 `cold_start: true` 로 정상 반환. `lib/buildContext.ts:fetchBuildContext` 의 `.maybeSingle()` 사용으로 row 0 = `null` 정상 경로.

### GA-4 (TASTE.md 인용 — stage 별 분기)
- 라우트 본문 적용 영역 아님. T2 `lib/prompt.ts:renderTasteDoctrine(stage)` 가 SSOT. 라우트는 `body.stage` 를 그대로 buildSystemPrompt 에 전달.

---

## 4. 회귀 위험 가드 적용 위치 (R12~R15)

| 위험 | 적용 위치 | 메커니즘 |
|------|----------|---------|
| **R12** JSON 추출 무한 루프 / 1회 초과 재시도 | `callEngineWithRetry` 본문 + `extractJson` 본문 | (a) callEngineWithRetry 는 1차 호출 → tryParseEngineResponse → 실패 시 정확히 1회 retryMessages 로 2차 호출 → 그래도 실패면 EngineValidationError throw. 3회째 호출 경로 없음. (b) `extractJson` 은 throw 가 없다 — null 반환만. (c) `tryParseEngineResponse` 가 (extractJson 실패 / JSON.parse 실패 / Zod 실패) 3가지 케이스를 모두 동일한 `{ ok: false, error }` 로 묶어 같은 재시도 루프에 보냄 — extractJson 실패도 검증 실패로 카운트(사용자 결정문 §R12). |
| **R13** messages 8턴 초과 | `RequestBodySchema.messages.max(8)` + `callEngineWithRetry` 첫 줄 `input.messages.slice(-8)` | 이중 가드. 또한 D-004 재시도 시 system 메시지 1개를 더하므로 9개 가능성을 raw messages 단계에서 잘라둠 — Anthropic API 에 보내지는 messages 는 1차 호출 8개, 2차 호출 9개(재시도 user 1개 추가). 2차는 "재시도" 라는 의도된 추가라 R13 위반 아님. |
| **R14** options 15자 초과 | systemPrompt 가 명시 (T2 산출물). 라우트는 응답을 `EngineResponseSchema.options: z.array(z.string().min(1).max(15)).min(0).max(3)` 로 검증 (lib/schema.ts L232). 15자 초과 시 safeParse 실패 → D-004 재시도. |
| **R15** new_state 부분 반환 정책 | systemPrompt 가 명시 (T2 산출물). 라우트는 `EngineResponseSchema.new_state: RecipeStateSchema.nullable()` 로 검증 — RecipeStateSchema 가 모든 필드 optional 이라 부분 객체 통과, null 도 통과. |

### R1~R11 (P0 인계) 가드 적용
- **R3 (rate limit catch)**: 본 라우트는 `enforceRateLimit` 결과를 catch 하지 않는다. `gate.ok=false` 면 즉시 return.
- **R4 (service-role 오용)**: `[3a] authenticateRequest` 가 anon 클라이언트로 토큰 검증해 `user_id` 를 얻은 뒤에만 [4] 가 `fetchBuildContext` (service-role) 를 호출. user_id 매칭은 lib/buildContext.ts 안 `.eq("user_id", userId)` 로 코드 레벨 강제.
- **R5/R9 (라우트 안 SSOT 표류)**: 라우트에 `z.object` / `z.enum` 호출은 `RequestBodySchema` 본문 내부 한 위치(messages 항목 정의)만. 데이터 모델 스키마는 모두 `@/lib/schema` import.
- **R10 (BuildContext 누락)**: `callEngineWithRetry` 가 `buildContext: BuildContext` 매개변수를 받음 — type 시그니처가 우회 가능성을 컴파일 시점에 봉쇄.
- **R11 (cold_start 무시)**: buildContext 전체가 `buildSystemPrompt` 에 그대로 전달되며, `renderModeHeader` 가 결정적 분기 (T2 산출물).
- R1/R2/R6/R7/R8 은 lib/* 모듈 영역. 본 라우트 신규 영향 없음.

---

## 5. 인증 — 새로운 항목

P1 사이클 시점에 클라이언트 인증 흐름이 셸 안에 없음. 본 라우트는 다음 정책으로 진행:

- **요청 헤더**: `Authorization: Bearer <jwt>`. 토큰은 Supabase anon JWT.
- **검증**: `supabaseServerAnonClient().auth.getUser(token)`. 성공 시 `data.user.id` 를 user_id 로 사용.
- **실패 분기**:
  - 헤더 부재 → 401 `missing_authorization` ("로그인이 필요합니다.")
  - bearer prefix 만 있고 토큰 빈 문자열 → 401 `missing_token`
  - 토큰 검증 실패 → 401 `invalid_token` ("세션이 만료됐어요. 다시 로그인 해주세요.")
- **R4 가드**: anon 클라이언트로 검증한다 — service-role 우회 금지. user_id 가 확정된 후에만 fetchBuildContext(service-role) 호출.

**잠재 회색 영역 (R16 후보)**: 본 라우트는 user_id 만 본인 매칭으로 사용하나, body.recipe_id 가 다른 사용자의 레시피라도 service-role 이 user_id 와 함께 매칭(`.eq("user_id", userId)`)하므로 데이터 누수는 없다. 다만 "다른 사용자의 레시피 ID 를 추측 입력해도 maybeSingle 이 null 반환 → cold_start 로 흘러감" 이 의도된 동작인지 확인 필요. 본 사이클에서는 의도된 동작으로 처리 (recipe ownership 검증은 별도 ADR).

---

## 6. SSOT 의존 매핑

| 사용처 (라우트) | 출처 (@/lib/schema) | 용도 |
|---------------|--------------------|------|
| `RecipeStateSchema` | export const | RequestBodySchema 의 current_state 필드 |
| `StageSchema` | export const | RequestBodySchema 의 stage 필드 |
| `EngineResponseSchema` | export const | tryParseEngineResponse 의 safeParse 대상 |
| `BuildContextSchema` | export const | void 참조로 SSOT 결합 표시 (실 사용은 lib/buildContext.ts) |
| `BuildContext` (type) | export type | callEngineWithRetry 매개변수, fetchBuildContext 반환 |
| `EngineResponse` (type) | export type | callEngineWithRetry / tryParseEngineResponse 반환 |

`lib/buildContext.ts` 의 SSOT 의존:
- `BuildContextSchema.parse` (반환 검증), `Fingerprint`/`KnownIssue`/`RuntimeLog`/`BuildContext` (type).

---

## 7. 검증 grep (welding-inspector T4 에게)

### 7-a. SSOT 위반 — 라우트 안 데이터 모델 스키마 정의
```
grep -nE "^(const|export const) (Engine[A-Z]\w*|Stage|RecipeState|CookRun|RuntimeLog|Fingerprint|BuildContext|Trait|KnownIssue)Schema = z\." app/api/**/route.ts
```
**기대**: 매치 0. (RequestBodySchema 는 위 enum 에 없으므로 의도된 제외.)

### 7-b. `@/lib/schema` import 존재
```
grep -n "from \"@/lib/schema\"" app/api/recipe/route.ts lib/buildContext.ts lib/prompt.ts
```
**기대**: 각 파일에서 최소 1줄 매치.

### 7-c. rate limit 첫 진입 가드
```
grep -nB1 "enforceRateLimit" app/api/recipe/route.ts
```
**기대**: POST 첫 줄(들 안) 에 enforceRateLimit("recipe") 호출. catch 패턴 없음.

### 7-d. 재시도 1회 한정
```
grep -cE "callAnthropic\(" app/api/recipe/route.ts
```
**기대**: 카운트 2 (1차 호출 + 1회 재시도). 3회째 호출 경로 없음.

### 7-e. R12 — extractJson throw 없음
```
grep -nE "(throw|Error)" lib/buildContext.ts | head
grep -n "throw" app/api/recipe/route.ts | head
```
**기대**: extractJson 함수 본문 안 throw 0 (null 반환만). callEngineWithRetry 의 EngineValidationError throw 만 정상.

### 7-f. cold_start 분기 → 맹탕 모드 문구
```
grep -n "맹탕 모드" lib/prompt.ts
```
**기대**: 최소 1줄 매치.

### 7-g. 클라 번들 누출
```
grep -rn "from \"@/lib/env\"\|from \"@/lib/supabase\"\|from \"@/lib/ratelimit\"\|from \"@/lib/buildContext\"" components/ app/
```
**기대**: `"use client"` 가 있는 파일에서 위 import 가 나오면 BLOCK. 현재 components/* 3개 모두 영향 없음. `lib/buildContext.ts` 도 server-only.

### 7-h. localStorage
```
grep -rn "localStorage" app/ lib/ components/
```
**기대**: 주석 외 매치 0.

---

## 8. 회귀 위험 (P1.T3 신규)

| 위험 | 시나리오 | 가드 |
|------|---------|------|
| **R16. recipe ownership 미검증** | body.recipe_id 가 다른 사용자의 레시피라도 fetchBuildContext 가 user_id 매칭으로 null 반환 → cold_start 로 흘러감. 데이터 누수는 없으나, 사용자가 "이 레시피 ID 가 내 것이 아니다" 신호를 받지 않음. | **위험 잔존**: 의도된 동작으로 처리. recipe ownership 검증은 P2 별도 ADR 후보. UX 영향만 있고 보안 영향 0. |
| **R17. Anthropic 클라이언트 캐싱 누수** | `cachedAnthropic` 이 모듈 스코프 — 환경변수 변경 후에도 첫 호출 시점의 키를 보유. | **위험 잔존**: 의도된 캐싱. 키 회전 시 Vercel 재배포로 처리 (관례). |
| **R18. messages 재시도 단계의 사용자 메시지 변조** | 2차 호출에 추가하는 "[시스템 검증 실패…]" user 메시지가 사용자 입력과 구분 안 되어 누수 가능성. | 본 메시지는 sytemPrompt 가 명시한 형식대로 응답이 안 왔을 때만 추가. role=user 로 들어가지만 사용자에게 노출되지 않는다 (라우트는 engineResponse 만 반환, 재시도 메시지는 응답 외부). UX 누수 0. |
| **R19. extractJson 의 첫/마지막 중괄호 슬라이스가 코드블록 내부 잡설을 포함** | LLM 이 ```` ```{json} ... {잡설} ``` ```` 를 보내면 끝의 잡설 `}` 까지 슬라이스. | JSON.parse 가 실패 → tryParseEngineResponse 가 동일 재시도 루프에 던짐. R12 가드와 결합되어 무한 루프 가능성 0. **위험 잔존**: 일부 입력 패턴에서 두 번째 시도도 실패 가능 — D-004 정책상 502 노출이 옳음. |

---

## 9. 의도된 비커버리 (P1 본 사이클 밖)

- **lib/diff.ts splitDiff 호출**: 라우트는 splitDiff 를 호출하지 않는다 (task description: "splitDiff 는 클라가 계산하므로 여기선 new_state 만"). 응답 본문은 `{ engineResponse, parsedAt }` 만.
- **CookRun INSERT / RuntimeLog UPSERT / Fingerprint UPSERT 트랜잭션**: `app/api/run/route.ts` 영역 (P1 의 다음 사이클).
- **recipe ownership 검증** (R16): 별도 ADR.
- **inferMode 함수 추가** (D-003a): GA-1 채택 결정에 따라 자연어 규칙만 — 본격은 P2.
- **Anthropic 응답 streaming**: 본 라우트는 단일 응답. streaming 은 P2 이상.

---

## 10. 인계

- **welding-inspector (T4)**: §7 grep 8종 + 인증 흐름(401 분기) + GA-3 502 분기 + D-004 1회 재시도 분기 + EngineResponseSchema safeParse 정합성 점검. 환경변수 부재 상태에서 빌드 자체는 통과해야 함 (env throw 는 런타임 호출 시점).
- **doc-taste-scribe (사이클 마무리)**: ADR D-012(GA-2 N=5)/D-013(GA-3 502)/D-014(GA-4 stage 분기) 등재 + 본 보고서 §5 의 인증 정책을 P2 ADR 후보(D-015 인증 경계)로 메모.
- **MAP.md**: `lib/buildContext.ts` 신설 반영 권고.
- **다음 사이클 (P1 후속)**: `/api/run` 본문, `lib/diff.ts`/`lib/runtime.ts`/`lib/fingerprint.ts` 본문, components/* UI 본문.
