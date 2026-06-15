# T1 NEED_USER_DECISION 답변

**일자**: 2026-06-13
**결정자**: 사용자 (유케이)

## 채택안: **후보 A — 헌법 강제형 풀셸 부트스트랩 + P0 동시 적용**

`_workspace/02_welding_review_T1.md` §"재설계 / NEED_USER_DECISION 후보 — 후보 A" 그대로 진행한다.

## 등재 ADR

`docs/DECISIONS.md`에 **D-011 (풀셸형)** 등재. 초안은 `_workspace/02_welding_review_T1.md` §"ADR D-011 초안" 참조. doc-taste-scribe 부재 상태이므로, engine-builder 또는 사용자가 직접 DECISIONS.md에 등재. (P0 사이클 마무리 시점 처리 권고.)

## 후속 작업 분배

후보 A의 산출물 중 헌법 SSOT 영역인 `lib/schema.ts`는 **schema-architect**가 작성. 나머지(라우트·env·rate limit·placeholder·마이그레이션·UI placeholder)는 **engine-builder**가 작성.

| 영역 | 담당 |
|------|------|
| `lib/schema.ts` (RecipeState/CookRun/RuntimeLog/Fingerprint Zod 최소 골격, D-005 timer_sec 포함) | schema-architect |
| `supabase/migrations/0001_init.sql` (5개 테이블 + RLS, DATA_MODEL.md §6 기준) | schema-architect |
| `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example` | engine-builder |
| `app/page.tsx`, `app/api/recipe/route.ts`, `app/api/run/route.ts` (placeholder + rate limit + env 검사) | engine-builder |
| `lib/ratelimit.ts`, `lib/env.ts`, `lib/supabase.ts`(클라이언트 골격, D-007 주석) | engine-builder |
| `lib/prompt.ts`, `lib/diff.ts`, `lib/runtime.ts`, `lib/fingerprint.ts` (빈 export + 용접 다이어그램 주석) | engine-builder |
| `components/BuildMode.tsx`, `components/CookMode.tsx`, `components/Postmortem.tsx` (빈 placeholder) | engine-builder |

`lib/schema.ts`가 먼저 완성되어야 `app/api/*`가 임포트 가능하므로 schema-architect 작업이 engine-builder의 라우트 작업에 선행. 단, engine-builder는 schema 의존이 없는 영역(package.json, tsconfig, .env.example, lib/ratelimit.ts, lib/env.ts, lib/supabase.ts, components/* placeholder)부터 병렬 시작 가능.

## 정합성 검증

`welding-inspector`는 T2 완료 후 weld-trace 스킬로 검증. 후보 A 채택으로 검증 범위가 확장됨:
- 기존 5개 라인 + 5개 경계 중 셸 단계에서 의미 있는 항목:
  - **경계 A (시스템 프롬프트 ↔ Zod 스키마)**: prompt.ts가 빈 골격이므로 검증 보류
  - **경계 C (Zod ↔ Supabase 컬럼)**: schema.ts vs 0001_init.sql 매핑 검증 **필수**
  - **Line 4 (CookRun → RuntimeLog 트랜잭션)**: route.ts에 TODO 주석으로 호출 순서가 명시되었는지 검증
  - 환경변수 격리 + rate limit 5개 점검점 (이미 정리됨)
