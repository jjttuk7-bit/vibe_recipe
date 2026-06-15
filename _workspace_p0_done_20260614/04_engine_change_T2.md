# T2 변경 보고서 — 셸 부트스트랩 + P0 구현

**작성자**: engine-builder
**일자**: 2026-06-13 (rev1), 2026-06-14 (rev2 보강)
**입력**: T1 PASS(후보 A), ADR D-011 초안, T1.5 산출물(`lib/schema.ts`, `supabase/migrations/0001_init.sql`), schema-architect SSOT 충돌 보고, team-lead 옵션 A 결정
**검증자**: welding-inspector (T3)

> **rev2 (2026-06-14)**: §8 절 신설 — SSOT 충돌 해소(옵션 A) + BuildContext 임포트/cold-start 골격 추가. rev1 본문(§1~§7)은 그대로 둠. inspector 는 §8 부터 우선 읽고 §4-A grep 검증에 §8-c 항목을 추가하면 됨.

---

## 1. 산출물 (engine-builder 분)

| 영역 | 파일 | 역할 |
|------|------|------|
| 빌드 설정 | `package.json` | Next.js 15 + React 19 + TS + Zod + Anthropic SDK + Supabase JS + Upstash ratelimit/redis + server-only |
| 빌드 설정 | `tsconfig.json` | strict + noUncheckedIndexedAccess + `@/*` paths, `_workspace` exclude |
| 빌드 설정 | `next.config.ts` | reactStrictMode + typedRoutes |
| 보안 | `.env.example` | server-only 키 정책 명시. `NEXT_PUBLIC_*` 금지 주석. `VIBE_RECIPE_MODEL` 포함 |
| 보안 | `.gitignore` | `.env.local` 등 차단, `.env.example` 화이트리스트 |
| 보안 헬퍼 | `lib/env.ts` | `server-only` import + requireEnv/optionalEnv. 부재 시 명시적 throw |
| 보안 헬퍼 | `lib/ratelimit.ts` | Upstash sliding window 60s. IP 식별 가드. 429 + `Retry-After`/`X-RateLimit-*` 헤더 |
| 보안 헬퍼 | `lib/supabase.ts` | anon/service-role 두 서버 클라이언트. **D-007 주석** 명시 |
| 용접 placeholder | `lib/prompt.ts` | 빈 export + buildSystemPrompt 시그니처 가이드 (BuildContext 주입 강제) |
| 용접 placeholder | `lib/diff.ts` | 빈 export + splitDiff 시그니처 가이드 (D-001/D-002) |
| 용접 placeholder | `lib/runtime.ts` | 빈 export + rebuildRuntimeLog 시그니처 가이드 (D-008) |
| 용접 placeholder | `lib/fingerprint.ts` | 빈 export + recomputeFingerprint 시그니처 가이드 (D-007/D-008) |
| 라우트 | `app/api/recipe/route.ts` | rate limit 게이트 + env 가드 + `EngineResponseSchema` 정의 + D-004 재시도 골격 주석. 현재 501 |
| 라우트 | `app/api/run/route.ts` | rate limit 게이트 + env 가드 + D-008 트랜잭션 호출 순서 골격 주석. 현재 501 |
| UI placeholder | `app/layout.tsx` | RootLayout (lang=ko) |
| UI placeholder | `app/page.tsx` | 엔트리 메시지 |
| UI placeholder | `components/BuildMode.tsx` | F-1 placeholder + 용접 주석 (Fingerprint/RuntimeLog 조회 강제) |
| UI placeholder | `components/CookMode.tsx` | F-2 placeholder + D-005/D-006/§4 주석 (Postmortem 자동 진입) |
| UI placeholder | `components/Postmortem.tsx` | F-3 placeholder + §4 주석 ("건너뛰기 금지") |

T1.5(schema-architect 분: `lib/schema.ts`, `supabase/migrations/0001_init.sql`)는 본 보고서 범위 밖이지만, 본 T2 가 그 export 명을 import 한다.

---

## 2. 헌법 항목 ↔ 코드 강제 위치 매핑

| 헌법 항목 | 코드 강제 위치 | 메커니즘 |
|----------|---------------|----------|
| **§8.5 / ROADMAP P0a** API 키 서버 격리 | `lib/env.ts` 첫 줄 `import "server-only"` | server-only 패키지가 클라이언트 import 그래프 진입 시 빌드 타임 에러 |
| **§8.5 / ROADMAP P0a** API 키 서버 격리 | `.env.example` 주석 | `NEXT_PUBLIC_*` 사용 시 코드 리뷰에서 BLOCK |
| **§8.5 / ROADMAP P0b** `/api/*` rate limit | `app/api/recipe/route.ts:L34-37` + `app/api/run/route.ts:L29-32` | 두 라우트 모두 `enforceRateLimit` 첫 호출. 비통과 시 429 즉시 반환 |
| **D-001** diff 는 LLM 이 아니라 코드 | `lib/diff.ts` 헤더 주석 + `app/api/recipe/route.ts` 헤더 주석 | `EngineResponseSchema.new_state` 가 RecipeState 전체. 라우트 본문 P1 에서 `splitDiff(prev, next)` 호출. LLM 응답에 diff 필드 없음 |
| **D-004** Zod 검증 실패 1회 재시도 | `app/api/recipe/route.ts` 하단 `callEngineWithRetry` 의사코드 주석 | EngineResponseSchema 정의 + 재시도 흐름 명시. 2회 연속 실패 시 502 (3회 이상 금지 주석) |
| **D-005** timer 텍스트 파싱 금지 | `lib/schema.ts` (T1.5) + `components/CookMode.tsx` 주석 | StepSchema.timer_sec 가 nullable but not optional. CookMode 주석에 "텍스트 파싱 금지" 명시 |
| **D-006** 핫픽스는 새 버전 만들지 않음 | `lib/schema.ts` (T1.5) StepEventTypeSchema.hotfix + `components/CookMode.tsx` 주석 | 타입 시스템상 hotfix 가 step_events 의 한 type. RecipeState 에 hotfix 채널 없음 |
| **D-007** localStorage 금지 / Supabase 영속 | `lib/supabase.ts` 모듈 헤더 주석 + `import "server-only"` | localStorage 사용 시도가 코드 리뷰 + import 그래프 양쪽에서 차단 |
| **D-008** 용접 의존성 | `app/api/run/route.ts:L40-50` 트랜잭션 호출 골격 주석 | CookRun INSERT → RuntimeLog UPSERT → Fingerprint UPSERT 순서를 한 트랜잭션으로 묶을 것을 명시. 호출 누락 = welding-inspector BLOCK |
| **D-008** 용접 의존성 | `components/BuildMode.tsx` 주석 | BUILD 시작 시 Fingerprint + RuntimeLog 조회 강제. cold start 명시 |
| **§4** "이 기능을 떼어내도 다른 단계가 완전한가?" | 두 라우트 동시 생성 + 4개 lib placeholder 동시 생성 | 셸이 BUILD 단독으로 완전하지 않음. /api/run, lib/runtime, lib/fingerprint 가 없으면 컴파일 실패 |

---

## 3. 함수 시그니처 (외부 노출 API)

### `lib/env.ts`
```ts
function anthropicApiKey(): string         // throws if missing
function vibeRecipeModel(): string         // default "claude-haiku-4-5-20251001"
function upstashRedisRestUrl(): string     // throws if missing
function upstashRedisRestToken(): string   // throws if missing
function supabaseUrl(): string             // throws if missing
function supabaseAnonKey(): string         // throws if missing
function supabaseServiceRoleKey(): string  // throws if missing
function rateLimitPerMinute(): number      // default 60
```

### `lib/ratelimit.ts`
```ts
type RateLimitOk = { ok: true; limit: number; remaining: number; reset: number }
type RateLimitBlocked = { ok: false; response: Response }
type RateLimitResult = RateLimitOk | RateLimitBlocked

async function enforceRateLimit(request: Request, routeKey: string): Promise<RateLimitResult>
function withRateLimitHeaders(response: Response, gate: RateLimitOk): Response
```

### `lib/supabase.ts`
```ts
function supabaseServerAnonClient(): SupabaseClient          // RLS 적용. user 토큰 동반 필요
function supabaseServerServiceRoleClient(): SupabaseClient   // RLS 우회. user_id 검증 선행 필수
```

### `app/api/recipe/route.ts`
```ts
export const runtime = "nodejs"
export async function POST(request: Request): Promise<Response>
// 라우트 옆 정의:
const EngineResponseSchema: z.ZodObject<...>
type EngineResponse = z.infer<typeof EngineResponseSchema>
```

### `app/api/run/route.ts`
```ts
export const runtime = "nodejs"
export async function POST(request: Request): Promise<Response>
```

---

## 4. 검증 방법 (welding-inspector T3 에게)

### 4-A. 코드 강제 5점검 (자동 grep 가능)

1. **클라 번들 차단**:
   ```
   grep -rn 'from "@/lib/env"\|from "@/lib/supabase"\|from "@/lib/ratelimit"' components/ app/
   ```
   `"use client"` 가 첫 줄에 있는 파일에서 위 import 가 나오면 BLOCK.
   현재 components/* 3개 모두 `"use client"` + 위 모듈 import 없음 → PASS 예상.

2. **rate limit 누락**:
   ```
   grep -L "enforceRateLimit" app/api/**/route.ts
   ```
   누락 파일이 한 개라도 있으면 BLOCK. 현재 recipe/run 둘 다 첫 줄 호출 → PASS 예상.

3. **NEXT_PUBLIC_ 키 노출**:
   ```
   grep -n "NEXT_PUBLIC_" .env.example lib/*.ts
   ```
   `.env.example` 주석(금지 설명)만 매치되어야 함. 실제 변수 정의로 매치되면 BLOCK.

4. **localStorage 사용**:
   ```
   grep -rn "localStorage" app/ lib/ components/
   ```
   주석 외 매치 0 이어야 함. 현재 0 → PASS 예상.

5. **D-008 호출 순서 골격**:
   `app/api/run/route.ts` 의 트랜잭션 주석에 `cook_runs INSERT`, `runtime_logs UPSERT`, `fingerprints UPSERT` 세 문구가 순서대로 등장. 누락 시 BLOCK.

### 4-B. 빌드 검증

```
npm install
npm run typecheck   # tsc --noEmit
npm run build       # next build (env 가 비어 있어도 import 단계는 통과해야 함)
```

`npm run build` 가 server-only import 그래프 위반을 빌드 타임에 잡아낸다. 현재 의심 경로 없음.

### 4-C. 런타임 스모크 (P0 작동 확인)

`.env.local` 에 더미 Upstash + Anthropic + Supabase 키를 넣고:

```bash
curl -i -X POST http://localhost:3000/api/recipe -d '{}'
# 기대: 501 + X-RateLimit-* 헤더 동봉

# 같은 IP 로 RATE_LIMIT_PER_MINUTE+1 번 빠르게 호출:
for i in $(seq 1 61); do curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3000/api/recipe -d '{}'; done
# 기대: 마지막 한 번이 429 + Retry-After 헤더
```

UPSTASH_* 가 빈 상태로 호출 시 명시적 500 (env throw) → 조용한 fallback 없음 확인.

---

## 5. 회귀 위험 포인트

| 위험 | 시나리오 | 가드 |
|------|---------|------|
| **R1. 클라 번들 키 누출** | 누군가 `components/BuildMode.tsx` 에 `import { anthropicApiKey } from "@/lib/env"` 추가 | `server-only` 패키지가 Next.js 빌드 시점에 에러. 빌드가 깨져야만 머지 가능 |
| **R2. rate limit 우회** | 새 라우트 `app/api/foo/route.ts` 가 `enforceRateLimit` 호출 없이 외부 비용을 발생시킴 | T3 의 점검 4-A.2 가 grep 으로 잡음. **위험 잔존**: 라우트 단위 lint 룰 없음. 향후 lint 룰 추가 권고 |
| **R3. UPSTASH 부재 시 fallback** | 누군가 ratelimit 에서 `try/catch` 로 에러 삼키고 통과시킴 | 현재 코드는 throw 만 함. **위험 잔존**: 후속 작업자가 "개발 환경에서는 끄자"로 추가 가능. PR 리뷰 가드 |
| **R4. service-role 오용** | 사용자 신원 검증 전에 `supabaseServerServiceRoleClient()` 가 호출되어 cross-tenant 데이터 조작 | 현재 placeholder 단계라 사용자 검증 미구현. P1 라우트 작업 시 가드 추가 필수 — supabase.ts 주석에 명시 |
| **R5. D-008 트랜잭션 분리** | P1 작업자가 `/api/run` 에서 cook_runs INSERT 만 하고 RuntimeLog/Fingerprint 갱신 누락 | route.ts 주석에 호출 순서 명시. **위험 잔존**: 주석은 강제력 약함. Postgres RPC 함수로 한 호출에 묶기 권고 |
| **R6. IP 식별 위변조** | 악의적 클라이언트가 `x-forwarded-for` 를 위조하여 한 사용자가 여러 키로 분산 | 현재 첫 토큰만 사용. Vercel 환경에서 신뢰 가능. 자체 호스팅 시 reverse proxy 신뢰 가드 추가 필요 |
| **R7. 모델 키 변경 시 비용 폭발** | `VIBE_RECIPE_MODEL` 을 운영 중 sonnet 으로 바꿔두고 깜빡 | env.ts 의 optionalEnv 기본값은 haiku. 변경은 명시적 환경변수 설정 시에만 작동. **위험 잔존**: 모니터링 영역 |
| **R8. server-only 우회** | dynamic import 로 클라이언트에서 lib/env 를 불러옴 | Next.js 의 server-only 가드가 dynamic import 도 잡지만, eval 류 회피는 검출 불가. 코드 리뷰 영역 |

---

## 6. T2 범위 밖 (P1 이상 작업)

- **`lib/prompt.ts` 의 buildSystemPrompt 구현**: BuildContext 주입 + cold start 텍스트 분기.
- **`lib/diff.ts` 의 splitDiff 구현**: RecipeState 비교, 산출물 카드 vs diff 분리.
- **`lib/runtime.ts` 의 rebuildRuntimeLog 구현**: step_events 집계 → known_issues.
- **`lib/fingerprint.ts` 의 recomputeFingerprint 구현**: 여러 RuntimeLog 교차분석.
- **`app/api/recipe/route.ts` 의 본문**: Anthropic 호출 + D-004 1회 재시도 + splitDiff.
- **`app/api/run/route.ts` 의 본문**: CookRun INSERT + RuntimeLog UPSERT + Fingerprint UPSERT 트랜잭션 (Postgres RPC 권장).
- **사용자 인증/세션**: anon 토큰 검증, service-role 호출 전 user_id 매칭.
- **components/* 실제 UI**: BUILD/COOK/POSTMORTEM 인터랙션.

---

## 7. 인계

- **welding-inspector**: T3 정합성 검증 시작 가능. 본 보고서 §4 점검 5점 + §8-c rev2 grep + 빌드 검증 + 런타임 스모크 권고.
- **ADR D-011**: P0 사이클 마무리 시점에 `docs/DECISIONS.md` 에 등재 (T1 보고서 §"ADR D-011 초안" 그대로 옮기면 됨).
- **MAP.md**: 새 파일 21개를 `docs/MAP.md` 에 반영 권고 (CLAUDE.md §8.4).

---

## 8. rev2 — SSOT 충돌 해소 (옵션 A) + BuildContext 골격 추가

**배경**: rev1 의 `app/api/recipe/route.ts` 가 `StageSchema` / `EngineResponseSchema` / `EngineResponse` 를 라우트 옆에 로컬 정의했다. schema-architect 가 T1.5 rev2 보강에서 같은 세 스키마를 `lib/schema.ts` 에 export 로 박았다는 사실을 통보(타이밍 어긋남으로 사전 합의 누락). team-lead 가 옵션 A(라우트 로컬 정의 삭제 → schema.ts 임포트) 채택을 결정.

근거(team-lead 결정문 + schema-architect 보고):
1. **§1.4** "베끼려면 전부를 베껴야 한다" — SSOT 두 곳 존재는 부분 표류를 허용 → 코드 강제 약화.
2. **T1.5 인계 명시 지시**: "모든 타입은 z.infer 로 export — UI/엔진/DB 가 한 곳을 임포트."
3. **응집도 명분 약함**: `EngineResponse.new_state: RecipeState` 가 이미 `@/lib/schema` 의존을 끌어들이므로 "엔진 출력은 별도 관심사" 가 성립하지 않음.

### 8-a. 변경 파일

| 파일 | 변경 | 이유 |
|------|------|------|
| `app/api/recipe/route.ts` | (1) L22~34 로컬 `StageSchema` / `EngineResponseSchema` / `EngineResponse` 정의 삭제. (2) `import { BuildContextSchema, EngineResponseSchema, RecipeStateSchema, StageSchema, type BuildContext, type EngineResponse } from "@/lib/schema"` 로 교체. (3) POST 핸들러에 [4] BuildContext 조회 골격 주석 + cold_start 분기 의사코드 추가. (4) 하단 callEngineWithRetry 의사코드 시그니처에 `buildContext: BuildContext` 매개변수 추가. (5) 파일 끝에 `CallEngineWithRetry` type alias + 실 const placeholder 로 type-only import 의 실 사용처 확보 (Next.js 라우트는 비표준 export 금지이므로 const 내부에서 활용). | SSOT 단일화 + §4 cold-start 명시 강제 |
| `_workspace/04_engine_change_T2.md` | rev2 보강 메모(상단) + §8(본 섹션) 추가. | 변경 이력 추적 |

다른 파일은 rev2 에서 손대지 않음. `app/api/run/route.ts` 는 이미 `CookRunSchema` 만 import 해 SSOT 위반 없음.

### 8-b. 헌법 강제 매핑 (§2 표에 추가)

| 헌법 항목 | 코드 강제 위치 | 메커니즘 |
|----------|---------------|----------|
| **§1.4** "전부를 베껴야" — 단일 SSOT | `app/api/recipe/route.ts` 상단 `import { ... } from "@/lib/schema"` | 로컬 재정의 0. `EngineResponseSchema` / `StageSchema` / `RecipeStateSchema` / `BuildContextSchema` 모두 한 출처 |
| **§4 / D-008 cold-start** | `app/api/recipe/route.ts` [4] BuildContext 조회 골격 + callEngineWithRetry 의사코드의 `buildContext: BuildContext` 매개변수 | BuildContext 없이 엔진 호출 불가하도록 타입 강제 + 주석으로 "조회 생략 = welding-inspector BLOCK" 명시 |
| **§4 cold-start 명시** | 같은 위치 의사코드 `cold_start: !runtimeLogOrNull && !fingerprintOrNull` | 둘 다 비어 있을 때 "맹탕 모드" 라고 systemPrompt 가 인지해야 함을 코드 골격이 표현 |

### 8-c. inspector 추가 grep 5점검 (§4-A 보강)

기존 §4-A 의 5점검에 다음 2 항목 추가:

**6. SSOT 위반 — 라우트가 로컬 스키마 정의**
```
grep -nE "^(const|export const) (Engine[A-Z]\w*|Stage|RecipeState|CookRun|RuntimeLog|Fingerprint|BuildContext)Schema = z\." app/api/**/route.ts
```
매치 0 이어야 함. 한 줄이라도 매치되면 BLOCK — 라우트가 자체 SSOT 를 만든 것.

**7. `@/lib/schema` import 누락 — 스키마 사용 시 SSOT 의존 확인**
```
grep -L "from \"@/lib/schema\"" app/api/**/route.ts
```
라우트 파일이 한 줄이라도 Zod 스키마(`*Schema`, `safeParse`, `parse`)를 사용하는데 import 가 없으면 SSOT 우회. 정상 라우트 두 개는 모두 import 가 있어야 통과.

### 8-d. rev2 회귀 위험 (§5 표에 추가)

| 위험 | 시나리오 | 가드 |
|------|---------|------|
| **R9. SSOT 표류 재발** | P1 작업자가 "엔진이 새 필드를 더 보낸다" 라며 라우트 옆에 EngineResponseSchema 를 다시 정의 | §8-c 의 grep 6번이 잡음. **위험 잔존**: lint 룰 없음. eslint 커스텀 룰(`no-local-schema-in-route`) 추가 권고 — P1 작업 |
| **R10. BuildContext 조회 누락** | P1 라우트 작업자가 buildContext 매개변수를 받지 않고 직접 callAnthropic 호출 | TypeScript 가 `CallEngineWithRetry` 시그니처로 강제. 우회하려면 시그니처를 바꾸거나 `any` 캐스팅 필요 → 코드 리뷰 영역 |
| **R11. cold_start 무시** | P1 에서 cold_start=true 가 buildSystemPrompt 에 전달돼도 시스템 프롬프트가 "맹탕 모드" 라고 표시 안 함 | lib/prompt.ts 의 buildSystemPrompt 시그니처 가이드(rev1 §4-주석) + welding-inspector 의 Line 0 검증으로 잡음 |

### 8-e. rev2 미반영 (의도된 제한)

- **`lib/schema.ts` 의 rev2 export(EngineResponseSchema, StageSchema, BuildContextSchema) 자체의 검증**: schema-architect 영역. 본 보고서에서는 import 만 사용. 경계 A(시스템 프롬프트 ↔ Zod) 검증 시 schema.ts 의 export 와 lib/prompt.ts 의 의사코드가 정합해야 한다는 사실을 inspector 가 확인.
- **`StepSchema` / `StepEventSchema` / `OutcomeSchema` 명시 import**: P0 placeholder 본문에서 직접 사용처 없음. P1 본문 구현 시 추가.

### 8-f. 변경 검증 (engine-builder 자체 점검)

- `app/api/recipe/route.ts` 안에 `z.enum` 또는 `z.object` 로 시작하는 로컬 스키마 정의가 남아 있는지 확인: **0개** (RequestBodySchema 는 클라이언트 입력 검증용으로 라우트 고유 관심사라 유지 — 이는 데이터 모델 SSOT 가 아님).
- `BuildContextSchema` / `BuildContext` / `EngineResponse` import 가 실 사용처를 가짐: **확인** (callEngineWithRetry type alias + const placeholder).
- Next.js 라우트 허용 export 외 비표준 export 없음: **확인** (`CallEngineWithRetry` 는 `type` 키워드로 module-internal, `callEngineWithRetry` 는 `const` 로 module-internal).
