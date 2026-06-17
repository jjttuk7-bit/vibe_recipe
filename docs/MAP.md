# MAP.md — 코드베이스 지도

> 새 파일/모듈을 만들면 여기 갱신한다. Claude Code가 "어디에 뭐가 있나"를 빠르게 파악하기 위한 지도.
> 상태 표기: ✅ 구현됨 / 🚧 진행중 / 📋 placeholder (시그니처/주석만, 본문 P1+에서 채움)
> 마지막 갱신: 2026-06-18 (세션 3 — P1 Cook 사이드 루프 구현)

---

## 앱 (Next.js App Router)

| 경로 | 역할 | 상태 |
|---|---|---|
| `app/layout.tsx` | RootLayout(`lang="ko"`). 전역 메타 + body 래퍼. children만 렌더. | ✅ (셸 적정) |
| `app/page.tsx` | 엔트리. BUILD/COOK/POSTMORTEM 모드 전환 + Supabase bearer JWT/기존 recipe_id 입력 + RecipeState/CookRun 상태 연결. 로그인/recipe row 생성 전까지의 작업용 MVP 컨테이너. | ✅ |
| `app/api/recipe/route.ts` | BUILD 엔진 라우트. `enforceRateLimit("recipe")` → env 가드 → `RequestBodySchema.safeParse` → `authenticateRequest` (Authorization Bearer JWT → anon 클라 검증 → user_id) → `fetchBuildContext` (D-013 1회 재시도 후 502) → `callEngineWithRetry` (D-004 1회 재시도 → 200 `{ engineResponse, parsedAt }` 또는 502). `splitDiff`는 클라 책임 (응답에 mods 미포함). | ✅ |
| `app/api/run/route.ts` | COOK→POSTMORTEM 결과 영속 라우트. rate limit → `authenticateRequest` → `CookRunSchema.safeParse` → 기존 cook_runs/runtime_logs 조회 → `rebuildRuntimeLog` → `recomputeFingerprint` → 사용자 JWT 클라로 `save_cook_run` RPC 단일 호출. | ✅ |

## 라이브러리 (lib/)

| 파일 | 역할 | 상태 |
|---|---|---|
| `lib/schema.ts` | **타입의 단일 진실(SSOT)**. RecipeState/CookRun/RuntimeLog/Fingerprint/BuildContext/EngineResponse/Stage + Step/StepEvent/Outcome/Taste/Texture/Ingredient/KnownIssue/Trait Zod 스키마. D-005 `timer_sec` 강제. 라우트·UI·DB 매핑이 모두 여기를 import. | ✅ |
| `lib/env.ts` | `import "server-only"` 첫 줄로 클라 번들 진입 차단. `anthropicApiKey`/`vibeRecipeModel`/`upstashRedisRest*`/`supabase*Key`/`rateLimitPerMinute` 등 `requireEnv`/`optionalEnv` 헬퍼. 부재 시 침묵 fallback 없이 즉시 throw. P0 §8.5 강제 첫 면. | ✅ |
| `lib/ratelimit.ts` | Upstash sliding window 60s rate limit 헬퍼. `enforceRateLimit(request, routeKey)` + `withRateLimitHeaders`. IP 식별은 XFF 첫 토큰 → `x-real-ip` → `"anonymous"` 폴백. 429 시 `Retry-After` + `X-RateLimit-*` 헤더 부착. 두 API 라우트에서 공유. | ✅ |
| `lib/supabase.ts` | 서버 anon 클라이언트(`supabaseServerAnonClient`, RLS 적용) + service-role 클라이언트(`supabaseServerServiceRoleClient`, RLS 우회). 모듈 헤더에 **"localStorage 사용 금지 — D-007"** 명시. `server-only` import로 클라이언트 진입 차단. | ✅ (클라이언트 골격) / 📋 (실 쿼리 헬퍼는 P1) |
| `lib/prompt.ts` | 페어 쿠킹 시스템 프롬프트 빌더. `buildSystemPrompt({ stage, buildContext, recipeState? })` 본문 — 10절 결합(맹탕 모드 헤더 / 역할 / 파이프라인 / 일괄 위임 키워드 / Fingerprint / known_issues / RecipeState / 불변 규칙 / TASTE 분기 / 출력 계약). `trimKnownIssues(issues, budget=5)` 헬퍼 export — D-012 미해결 우선 N=5. D-014 stage별 TASTE 인용 + `_exhaustive: never` 가드. 순수 함수(env/시각/랜덤/전역 0). | ✅ |
| `lib/buildContext.ts` | **신설**. `fetchBuildContext({ recipeId, userId })` — service-role 클라이언트로 `runtime_logs` + `fingerprints` 병렬 조회 후 `BuildContextSchema.parse`. recipe_id=null이면 runtime_logs 조회 스킵. 둘 다 null → `cold_start=true` 결정. `.maybeSingle()` 사용으로 row 0 정상 경로. throw는 라우트의 D-013 1회 재시도 catch가 잡음. `import "server-only"`. | ✅ |
| `lib/auth.ts` | **신설**. `authenticateRequest(request)` — Authorization Bearer JWT 검증, anon 클라 `auth.getUser`, `{ userId, token }` 반환. `/api/recipe`와 `/api/run`의 D-015 인증 SSOT. | ✅ |
| `lib/diff.ts` | `splitDiff(prev, next): { created, modified }` — 새 필드는 created, 기존 필드 변경은 modified로 분리(D-001/D-002). | ✅ |
| `lib/runtime.ts` | `rebuildRuntimeLog(recipeId, runs): RuntimeLog` — `failed_here`/`hotfix` step_events를 step별 known_issues로 응축. hotfix 5종(D-016) 처리 + 이후 good run이면 resolved 처리. | ✅ |
| `lib/fingerprint.ts` | `recomputeFingerprint(userId, runtimeLogs): Fingerprint` — RuntimeLog 교차분석으로 trait 생성. D-017 기준(N≥3 + 비율≥0.6)을 적용. | ✅ |

## 컴포넌트 (components/)

| 파일 | 역할 | 상태 |
|---|---|---|
| `components/BuildMode.tsx` | F-1 BUILD UI. `/api/recipe` 호출, EngineResponse 병합, `splitDiff` 표시, 샘플 레시피 로드. 현재는 JWT/recipe_id 직접 입력 기반 작업용 MVP. | ✅ |
| `components/CookMode.tsx` | F-2 COOK UI. 스텝 진행, `timer_sec` 타이머, Notification 요청, Wake Lock fallback, 핫픽스 5종 기록. RecipeState 수정 콜백 없음(D-006). | ✅ |
| `components/Postmortem.tsx` | F-3 POSTMORTEM UI. 3단 outcome, failed 시 실패 스텝 핀포인트, `/api/run` 제출. 건너뛰기 없음. | ✅ |
| `components/FingerprintCard.tsx` | (미생성) 부엌 지문 프로필 노출. 전환 비용 가시화. ROADMAP P1 마지막 항목. | 📋 (P1) |

## 데이터베이스 (supabase/)

| 파일 | 역할 | 상태 |
|---|---|---|
| `supabase/migrations/0001_init.sql` | 5 테이블 초기 마이그레이션. `recipes`/`recipe_versions`/`cook_runs`/`runtime_logs`/`fingerprints` + `pgcrypto` extension + `touch_updated_at()` 트리거 3종 + RLS 전 테이블 활성화 + `auth.uid() = user_id` 정책. `cook_runs.outcome` CHECK 도메인 + jsonb 컬럼이 Zod 스키마와 1:1 매핑(경계 C). 실제 `supabase db push` 적용은 사용자 측 셋업 후. | ✅ |
| `supabase/migrations/0002_run_constraint.sql` | P1.B 마이그레이션. `completed=true ⇒ outcome is not null` CHECK + `save_cook_run(p_cook_run, p_runtime_log, p_fingerprint)` RPC. cook_runs INSERT, runtime_logs UPSERT, fingerprints UPSERT를 단일 함수로 묶음. | ✅ |

## 루트 설정

| 파일 | 역할 | 상태 |
|---|---|---|
| `package.json` | Next.js 15 + React 19 + TypeScript + Zod + `@anthropic-ai/sdk` + `@supabase/supabase-js` + `@upstash/ratelimit` + `@upstash/redis` + `server-only` + dev deps. `npm run dev`/`test`/`typecheck`/`build` 스크립트. | ✅ |
| `scripts/test.mjs` | TypeScript 테스트 파일을 즉석 transpile해 실행하는 작은 테스트 하네스. `@/` alias를 Node require에 매핑. | ✅ |
| `tsconfig.json` | `strict: true` + `noUncheckedIndexedAccess` + `@/*` paths. `_workspace` 디렉토리 exclude(임시 산출물이 빌드 그래프 오염 방지). | ✅ |
| `next.config.ts` | `reactStrictMode: true` + `typedRoutes: true`. P0 단계엔 추가 설정 없음. | ✅ |
| `.env.example` | 서버 전용 키 정책 명시 — `ANTHROPIC_API_KEY`/`VIBE_RECIPE_MODEL`/`UPSTASH_REDIS_REST_{URL,TOKEN}`/`SUPABASE_*`. 주석으로 **`NEXT_PUBLIC_*` 접두사 사용 금지**(키 노출 차단) + UPSTASH 부재 시 명시적 throw 정책 명시. | ✅ |
| `.gitignore` | `.env.local` 등 비밀 파일 차단 + `.env.example` 화이트리스트. `node_modules`/`.next`/빌드 산출물. | ✅ |

## 문서 (docs/)

| 파일 | 역할 |
|---|---|
| `../CLAUDE.md` | 최상위 헌법 (매 세션 first read). §9 변경 이력에 P0 사이클 등록. |
| `DECISIONS.md` | ADR — 모든 설계 결정. D-001~D-015. D-011 = P0 셸 부트스트랩, D-012/D-013/D-014/D-015 = P1 엔진 코어 사이클(known_issues 트리밍 / BuildContext 502 / TASTE stage 분기 / 인증 경계 정책). D-001은 P1에서 결과 섹션에 부분 객체 + splitDiff 결합 한 줄 명시화. |
| `PRD.md` | 제품 요구사항. |
| `CONCEPT_2.0.md` | VIBE 2.0 기획서 (Cook=Run 서사 원본). |
| `DATA_MODEL.md` | 데이터 모델 + 용접 의존성. `lib/schema.ts`·`0001_init.sql`의 의도 문서. |
| `ENGINE.md` | LLM 엔진 사양. `lib/prompt.ts`·`app/api/recipe/route.ts`의 의도 문서. |
| `TASTE.md` | 취향 해자 — 도메인 판단. §5 미정 항목은 P1 진입 직전 유케이 결정 대기. |
| `MAP.md` | 이 문서. |
| `SESSION.md` | 세션 로그. 세션 1 = P0 사이클. |
| `ROADMAP.md` | 우선순위 로드맵. P0 두 항목 완료(2026-06-14), P1 8 항목 대기. |

## 작업 산출물 (_workspace/)

> 임시 트레이스. `tsconfig.json`에서 exclude. ADR/MAP/SESSION으로 응축되면 폐기 가능.

| 파일 | 역할 |
|---|---|
| `_workspace/00_input/request.md` | P1 엔진 코어 사이클 사용자 요청 원문. |
| `_workspace/02_welding_review_P1T1.md` | welding-architect P1.T1 NEED_USER_DECISION + GA-1~4 회색 영역 + R12~R15 신규 가드 + D-012/D-013/D-014 ADR 후보 초안. |
| `_workspace/02b_user_decision_P1T1.md` | 사용자 결정 — GA-1=A / GA-2=A N=5 / GA-3=C / GA-4=B. |
| `_workspace/04_engine_change_P1T2.md` | engine-builder P1.T2 — `lib/prompt.ts` 본문 + `trimKnownIssues` export. |
| `_workspace/04_engine_change_P1T3.md` | engine-builder P1.T3 — `/api/recipe` 본문 + `lib/buildContext.ts` 신설 + 인증(§5 D-015 ADR 후보 메모). |
| `_workspace/07_inspection_P1T4.md` | welding-inspector P1.T4 — PASS 보고 (결함 0건 + 미세 메모 M-1). |
| `_workspace/06_doc_change_P1T5.md` | doc-taste-scribe P1.T5 — 본 문서 동기화 변경 보고서. |
| `_workspace_p0_done_20260614/` | P0 사이클 산출물 (참조용 — 셸 부트스트랩 + D-011). |

---

## 현재 상태 요약 (2026-06-18)

- **P0 완료**: rate limit + env 격리 + 셸 부트스트랩 23 파일.
- **P1 첫 묶음 완료**: 엔진 코어 — `lib/prompt.ts` 본문 + `lib/buildContext.ts` 신설 + `app/api/recipe/route.ts` 본문. welding-inspector P1.T4 PASS (결함 0건). ADR D-012/D-013/D-014 등재.
- **P1 Cook 사이드 구현**: `lib/auth.ts`, `lib/diff.ts`, `lib/runtime.ts`, `lib/fingerprint.ts`, `/api/run`, `BuildMode`, `CookMode`, `Postmortem`, `app/page.tsx` 본문. ADR D-016/D-017/D-018 등재.
- **빌드 가능성**: `npm install && npm run typecheck && npm run build`가 server-only 위반을 빌드 타임에 잡는 형태. 사용자가 더미 키 채워 검증 권고 (Anthropic SDK + 인증 흐름 추가됨 — `.env.local` 채워야 런타임 호출 통과).
- **다음 큰 작업**: 로그인 UI/세션 영속 + recipe row 생성/저장 API + `FingerprintCard.tsx` + 실제 Supabase end-to-end 저장 검증.
- **용접 강제 상태(§4)**: BUILD→Context 주입과 Cook→Postmortem→RuntimeLog/Fingerprint RPC 루프가 코드로 연결됨. 단, 실제 저장은 기존 recipe row와 JWT가 필요하다.
- **잔존 위험**: recipe 생성 API 부재, 로그인/세션 UX 부재, 실제 Supabase 마이그레이션 적용 전 end-to-end 저장 미검증.
