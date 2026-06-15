# MAP.md — 코드베이스 지도

> 새 파일/모듈을 만들면 여기 갱신한다. Claude Code가 "어디에 뭐가 있나"를 빠르게 파악하기 위한 지도.
> 상태 표기: ✅ 구현됨 / 🚧 진행중 / 📋 placeholder (시그니처/주석만, 본문 P1+에서 채움)
> 마지막 갱신: 2026-06-15 (세션 2 — P1 엔진 코어 완료, lib/buildContext.ts 신설 + lib/prompt.ts/api/recipe 본문 승격)

---

## 앱 (Next.js App Router)

| 경로 | 역할 | 상태 |
|---|---|---|
| `app/layout.tsx` | RootLayout(`lang="ko"`). 전역 메타 + body 래퍼. children만 렌더. | ✅ (셸 적정) |
| `app/page.tsx` | 엔트리. 현 단계는 P0 셸 메시지만 표시. 모드 전환(Build/Cook/Postmortem) 컨테이너는 P1에서 부착. | 📋 (placeholder, P1에서 본문 채움) |
| `app/api/recipe/route.ts` | BUILD 엔진 라우트. `enforceRateLimit("recipe")` → env 가드 → `RequestBodySchema.safeParse` → `authenticateRequest` (Authorization Bearer JWT → anon 클라 검증 → user_id) → `fetchBuildContext` (D-013 1회 재시도 후 502) → `callEngineWithRetry` (D-004 1회 재시도 → 200 `{ engineResponse, parsedAt }` 또는 502). `splitDiff`는 클라 책임 (응답에 mods 미포함). | ✅ |
| `app/api/run/route.ts` | COOK→POSTMORTEM 결과 영속 라우트. rate limit 통과 강제 + env 가드 + D-008 트랜잭션 호출 순서(`cook_runs INSERT` → `runtime_logs UPSERT` → `fingerprints UPSERT`)를 골격 주석으로 박음. 현재 501. P1에서 본문 — Postgres RPC 권장. | ✅ (P0 게이트 작동) / 📋 (본문 P1) |

## 라이브러리 (lib/)

| 파일 | 역할 | 상태 |
|---|---|---|
| `lib/schema.ts` | **타입의 단일 진실(SSOT)**. RecipeState/CookRun/RuntimeLog/Fingerprint/BuildContext/EngineResponse/Stage + Step/StepEvent/Outcome/Taste/Texture/Ingredient/KnownIssue/Trait Zod 스키마. D-005 `timer_sec` 강제. 라우트·UI·DB 매핑이 모두 여기를 import. | ✅ |
| `lib/env.ts` | `import "server-only"` 첫 줄로 클라 번들 진입 차단. `anthropicApiKey`/`vibeRecipeModel`/`upstashRedisRest*`/`supabase*Key`/`rateLimitPerMinute` 등 `requireEnv`/`optionalEnv` 헬퍼. 부재 시 침묵 fallback 없이 즉시 throw. P0 §8.5 강제 첫 면. | ✅ |
| `lib/ratelimit.ts` | Upstash sliding window 60s rate limit 헬퍼. `enforceRateLimit(request, routeKey)` + `withRateLimitHeaders`. IP 식별은 XFF 첫 토큰 → `x-real-ip` → `"anonymous"` 폴백. 429 시 `Retry-After` + `X-RateLimit-*` 헤더 부착. 두 API 라우트에서 공유. | ✅ |
| `lib/supabase.ts` | 서버 anon 클라이언트(`supabaseServerAnonClient`, RLS 적용) + service-role 클라이언트(`supabaseServerServiceRoleClient`, RLS 우회). 모듈 헤더에 **"localStorage 사용 금지 — D-007"** 명시. `server-only` import로 클라이언트 진입 차단. | ✅ (클라이언트 골격) / 📋 (실 쿼리 헬퍼는 P1) |
| `lib/prompt.ts` | 페어 쿠킹 시스템 프롬프트 빌더. `buildSystemPrompt({ stage, buildContext, recipeState? })` 본문 — 10절 결합(맹탕 모드 헤더 / 역할 / 파이프라인 / 일괄 위임 키워드 / Fingerprint / known_issues / RecipeState / 불변 규칙 / TASTE 분기 / 출력 계약). `trimKnownIssues(issues, budget=5)` 헬퍼 export — D-012 미해결 우선 N=5. D-014 stage별 TASTE 인용 + `_exhaustive: never` 가드. 순수 함수(env/시각/랜덤/전역 0). | ✅ |
| `lib/buildContext.ts` | **신설**. `fetchBuildContext({ recipeId, userId })` — service-role 클라이언트로 `runtime_logs` + `fingerprints` 병렬 조회 후 `BuildContextSchema.parse`. recipe_id=null이면 runtime_logs 조회 스킵. 둘 다 null → `cold_start=true` 결정. `.maybeSingle()` 사용으로 row 0 정상 경로. throw는 라우트의 D-013 1회 재시도 catch가 잡음. `import "server-only"`. | ✅ |
| `lib/diff.ts` | `splitDiff(prev, next): { created, mods }` — 생성은 산출물 카드, 수정만 diff (D-001/D-002). 헤더 주석에 메타포 오용 금지(LLM이 diff 만들지 않음). | 📋 (placeholder, P1에서 본문 채움) |
| `lib/runtime.ts` | `rebuildRuntimeLog(recipeId, runs): RuntimeLog` — `step_events` 집계 → `known_issues`. 주석에 `"failed_here"`/`"hotfix"` 둘 다 처리 강제 + "호출 누락 = §4 용접 깨짐" 명시. | 📋 (placeholder, P1에서 본문 채움) |
| `lib/fingerprint.ts` | `recomputeFingerprint(userId, runtimeLogs): Fingerprint` — 여러 레시피의 RuntimeLog 교차분석 → 사람별 부엌 지문. D-007 해자. | 📋 (placeholder, P1에서 본문 채움) |

## 컴포넌트 (components/)

| 파일 | 역할 | 상태 |
|---|---|---|
| `components/BuildMode.tsx` | F-1 BUILD UI. 현재는 `"use client"` placeholder + 주석으로 "Fingerprint/RuntimeLog 조회 강제(§4 cold start 명시)" 명시. P1에서 v3 `VibeRecipe.tsx` 자산(파이프라인 스트림·산출물 카드·diff 카드) 포팅. | 📋 (placeholder, P1에서 본문 채움) |
| `components/CookMode.tsx` | F-2 COOK UI. placeholder + 주석으로 D-005(`timer_sec` 텍스트 파싱 금지) + D-006(hotfix는 RecipeState 변경 금지, `step_events`에만) + §4(Postmortem 자동 진입 강제) 명시. P1에서 타이머 + Wake Lock + 인라인 핫픽스. | 📋 (placeholder, P1에서 본문 채움) |
| `components/Postmortem.tsx` | F-3 POSTMORTEM UI. placeholder + 주석으로 §4 "건너뛰기 버튼 금지" 명시. P1에서 3단 평가(`outcome`) + 실패 스텝 핀포인트. | 📋 (placeholder, P1에서 본문 채움) |
| `components/FingerprintCard.tsx` | (미생성) 부엌 지문 프로필 노출. 전환 비용 가시화. ROADMAP P1 마지막 항목. | 📋 (P1) |

## 데이터베이스 (supabase/)

| 파일 | 역할 | 상태 |
|---|---|---|
| `supabase/migrations/0001_init.sql` | 5 테이블 초기 마이그레이션. `recipes`/`recipe_versions`/`cook_runs`/`runtime_logs`/`fingerprints` + `pgcrypto` extension + `touch_updated_at()` 트리거 3종 + RLS 전 테이블 활성화 + `auth.uid() = user_id` 정책. `cook_runs.outcome` CHECK 도메인 + jsonb 컬럼이 Zod 스키마와 1:1 매핑(경계 C). 실제 `supabase db push` 적용은 사용자 측 셋업 후. | ✅ |

## 루트 설정

| 파일 | 역할 | 상태 |
|---|---|---|
| `package.json` | Next.js 15 + React 19 + TypeScript + Zod + `@anthropic-ai/sdk` + `@supabase/supabase-js` + `@upstash/ratelimit` + `@upstash/redis` + `server-only` + dev deps. `npm run dev`/`typecheck`/`build` 스크립트. | ✅ |
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

## 현재 상태 요약 (2026-06-15)

- **P0 완료**: rate limit + env 격리 + 셸 부트스트랩 23 파일.
- **P1 첫 묶음 완료**: 엔진 코어 — `lib/prompt.ts` 본문 + `lib/buildContext.ts` 신설 + `app/api/recipe/route.ts` 본문. welding-inspector P1.T4 PASS (결함 0건). ADR D-012/D-013/D-014 등재.
- **빌드 가능성**: `npm install && npm run typecheck && npm run build`가 server-only 위반을 빌드 타임에 잡는 형태. 사용자가 더미 키 채워 검증 권고 (Anthropic SDK + 인증 흐름 추가됨 — `.env.local` 채워야 런타임 호출 통과).
- **다음 큰 작업 (P1 후속)**: `app/api/run/route.ts` 본문 → `lib/diff.ts`/`runtime.ts`/`fingerprint.ts` 본문 → `components/{BuildMode,CookMode,Postmortem}.tsx` 본문 → 사용자 인증 흐름(로그인 UI/세션 관리) → `FingerprintCard.tsx`.
- **용접 강제 상태(§4)**: Line 1(BUILD → known_issues/Fingerprint 주입)이 코드+타입+SSOT 3중 강제로 박힘. Line 2~5(Cook/Postmortem/RuntimeLog/회귀)는 placeholder 그대로 → P1 후속 사이클에서 본문 작성 시 weld-trace 검증.
- **잔존 위험**: T3 §8 R16~R19 + T4 §6.1 M-1. 모두 의도된 동작 또는 별도 ADR 후보로 분류. 현재 블로커 아님.
