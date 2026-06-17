# SESSION.md — 세션 로그

> 세션 종료 시 갱신: 한 일 / 다음 할 일 / 막힌 것. 최신이 위로.

---

## 세션 3 — P1 Cook 사이드 루프 구현

**일자**: 2026-06-18
**최종 판정**: 구현 완료, 로컬 검증 대기/진행 기록은 본 세션 하단 참조.

### 한 일
- `scripts/test.mjs` + `npm test` 추가. `lib/runtime.ts`, `lib/fingerprint.ts`, `lib/diff.ts`에 대한 RED 테스트 작성 후 구현.
- `lib/auth.ts` 신설. `/api/recipe` 내부 인증 함수를 공통 모듈로 추출.
- `lib/supabase.ts`에 사용자 JWT 기반 서버 클라이언트 추가. `/api/run`의 RPC 호출이 DB 함수 내부 `auth.uid()`를 통과하도록 함.
- `app/api/run/route.ts` 본문 구현: CookRun 검증 → 기존 runs/logs 조회 → RuntimeLog 재빌드 → Fingerprint 재계산 → `save_cook_run` RPC 단일 호출.
- `components/BuildMode.tsx`, `components/CookMode.tsx`, `components/Postmortem.tsx`, `app/page.tsx`를 작업용 MVP UI로 연결.
- `docs/DECISIONS.md`에 D-016/D-017/D-018 등재. `docs/TASTE.md`, `docs/ROADMAP.md`, `CLAUDE.md` 갱신.

### 남은 제약 / 다음 할 일
1. 로그인 UI와 세션 영속은 아직 없음. 현재 화면은 Supabase bearer JWT를 직접 입력하는 작업용 형태.
2. recipe row 생성/저장 API가 아직 없음. `/api/run` 저장은 기존 `recipe_id`가 있어야 성공한다.
3. `components/FingerprintCard.tsx`는 아직 미생성.
4. 실제 Supabase 프로젝트에 `0001_init.sql` + `0002_run_constraint.sql` 적용 후 end-to-end 저장 검증 필요.

---

## 세션 2 — P1 엔진 코어 사이클 (lib/prompt.ts + lib/buildContext.ts 신설 + /api/recipe 본문)

**일자**: 2026-06-14 ~ 2026-06-15
**운영 모드**: viberecipe-orchestrator 축소 팀 3인 — welding-architect, engine-builder, welding-inspector + 마무리 단계 doc-taste-scribe.
**최종 판정**: P1.T4 PASS (결함 0건, 미세 메모 M-1 1건은 ADR 결합 해석으로 정합).

### 한 일
- **사전 가드 (P1.T1, welding-architect)**: 5단계 헌법 검증 — 핵심 노선 PASS, 회색 영역 4개(GA-1~4) 식별. 본문 구현 과정에서 임의 결정 시 D-009 저촉 → NEED_USER_DECISION. R12~R15(JSON 추출 무한 루프 / messages 8턴 / options 15자 / new_state 부분 반환) 신규 가드 식별.
- **사용자 결정 (P1.T1b)**: GA-1=A (키워드 매칭만, D-003a 본격은 P2 이월) / GA-2=A (미해결 우선 N=5) / GA-3=C (1회 재조회 후 502) / GA-4=B (stage별 TASTE 인용). architect 권고대로 4건 모두 채택.
- **`lib/prompt.ts` 본문 (P1.T2, engine-builder)**: `buildSystemPrompt({ stage, buildContext, recipeState? })` 10절 결합 + `trimKnownIssues(issues, budget=5)` 헬퍼 export. 맹탕 모드 결정적 분기, stage별 TASTE 인용 switch + `_exhaustive: never` 가드. SSOT 단일성 유지 (라우트 스키마 재정의 0건).
- **`/api/recipe` 본문 + `lib/buildContext.ts` 신설 (P1.T3, engine-builder)**: POST 핸들러 [1]~[5] + 인증([3a]) + `callEngineWithRetry`/`callAnthropic`/`tryParseEngineResponse`/`extractJson` + `EngineValidationError` + `authenticateRequest`. `lib/buildContext.ts`는 service-role로 runtime_logs + fingerprints 병렬 조회 후 BuildContextSchema.parse. 인증 정책은 §5에 D-015 ADR 후보로 메모.
- **정합성 검증 (P1.T4, welding-inspector)**: weld-trace 5라인 PASS (특히 Line 1 BuildContext→systemPrompt 풀 트레이스), 경계 A(ENGINE.md ↔ renderOutputContract ↔ EngineResponseSchema 3자 1:1) + C + E PASS, P0 5점검(A~E) 회귀 PASS, D-001~D-014 ADR 강제 점검 12건 PASS, R1~R19 모두 PASS, cold-start 8점검 PASS. 결함 0건 + 미세 메모 M-1(T1 R15 "전체 상태" 권고 ↔ T2 본문 "부분 객체 + splitDiff 결합" 표현 차이 → D-001/D-002 결합 해석으로 정합).
- **문서 동기화 (P1.T5, doc-taste-scribe)**: ADR D-012 (known_issues 트리밍 N=5 미해결 우선) / D-013 (BuildContext 1회 재시도 후 502) / D-014 (TASTE.md stage별 인용) / **D-015 (인증 경계 정책 — Authorization Bearer JWT + anon 클라 검증 + service-role 분리, R4 가드. 전체 인증 흐름은 P2 명시 이월)** 등재. D-001 결과 섹션에 "전체 상태 의미 — 부분 객체 + splitDiff 결합" 한 줄 추가 명시화 (본문 무수정). D-015는 doc-taste-scribe가 리더에게 등재 vs P2 이월 컨설팅 → 리더가 즉시 등재 결정(D-009 정신 충실). MAP.md 갱신 — `lib/buildContext.ts` 신설 + `lib/prompt.ts`/`app/api/recipe/route.ts` 상태 ✅ 승격. CLAUDE.md §9 변경 이력 한 줄 추가.

### 다음 할 일 (P1 후속 사이클 — Cook 사이드 묶음 우선)
1. **`app/api/run/route.ts` 본문**: `cook_runs INSERT` → `runtime_logs UPSERT` → `fingerprints UPSERT` 트랜잭션 (Postgres RPC 권장, D-008 용접 강제 지점). D-013과 동일 인증 정책 적용(`/api/recipe`와 SSOT 일치).
2. **`lib/diff.ts:splitDiff` 본문**: 생성=산출물 카드 / 수정=diff (D-001/D-002). 클라이언트가 `prev + engineResponse.new_state` 병합 후 호출.
3. **`lib/runtime.ts:rebuildRuntimeLog` 본문**: `step_events` 집계 → `known_issues` 생성. `failed_here`/`hotfix` 둘 다 처리 + StepEventType 4종 exhaustive switch.
4. **`lib/fingerprint.ts:recomputeFingerprint` 본문**: 여러 레시피의 RuntimeLog 교차분석 → 사람별 부엌 지문.
5. **`components/BuildMode.tsx` 본문**: `/api/recipe` 200 응답 shape `{ engineResponse, parsedAt }` 매핑 + `splitDiff(prev, engineResponse.new_state)` 클라 호출. 생성=카드 / 수정=diff 분리 렌더링.
6. **`components/CookMode.tsx` 본문**: 스텝 진행 + `timer_sec` 타이머 + Wake Lock + 인라인 핫픽스(D-006, `step_events`에만 기록).
7. **`components/Postmortem.tsx` 본문**: 3단 평가(`outcome`) + 실패 스텝 핀포인트(`failed_here`). Cook 종료 시 자동 진입 강제(§4).
8. **사용자 인증 흐름 전체 (D-015 P2 이월 항목)**: 로그인 UI + 세션 영속(쿠키 vs 스토리지) + refresh token 만료/갱신 + RLS 정책별 user_id 매칭 매트릭스 + OAuth provider/콜백. 본 사이클의 D-015(인증 *경계 정책*)를 확장.
9. **TASTE.md §5 미정 항목 결정**: 분량 스케일링, 게이지 초기값, Fingerprint confidence 임계(현재 0.5는 잠정), 대체 재료 허용 — 본격 BUILD 사이클 진입 전 유케이 결정 필요.
10. **`components/FingerprintCard.tsx` 신설**: 부엌 지문 프로필 노출 (전환 비용 가시화).

### 막힌 것 / 결정 대기
- **없음** — D-015 인증 ADR은 doc-taste-scribe 리더 컨설팅 → 리더 즉시 등재 결정으로 명료화 (본 사이클 ADR 본문에 P2 이월 항목 명시 분리).
- T3 §8 잔존 위험 R16(recipe ownership 미검증)/R17(Anthropic 클라 캐싱)/R18(재시도 user 메시지)/R19(extractJson 슬라이스 노이즈) 모두 의도된 동작 또는 별도 ADR 후보. 현재 블로커 아님.
- TASTE.md §5 미정 항목은 본격 BUILD 사이클 진입 전 유케이 결정 필요 (위 다음 할 일 #9).

### 메모
- 본 사이클은 `lib/prompt.ts`의 `KNOWN_ISSUES_BUDGET = 5`/`TRAIT_MIN_CONFIDENCE = 0.5` 두 상수가 ADR 또는 TASTE.md 결정에 종속 — 변경 시 ADR 갱신 + 코드 수정 두 단계가 필요한 의도된 마찰.
- 빌드 검증(`npm install && npm run typecheck && npm run build`)은 사용자(유케이)가 더미 키 채워 직접 실행 권고. 환경변수 부재 상태에서 빌드 자체는 통과해야 하나 런타임 호출 시점에 throw.
- weld-trace 스킬은 본 사이클에서 직접 호출 실패(`.claude/skills/weld-trace/SKILL.md` 본문 참조로 정적 분석 대체). 스킬 등록 점검은 다음 사이클 전 권고.

---

## 세션 1 — P0 사이클 (셸 부트스트랩 + rate limit + env 격리)

**일자**: 2026-06-13 ~ 2026-06-14
**운영 모드**: viberecipe-orchestrator (6인 + team-lead). 본 사이클 활성: welding-architect, schema-architect, engine-builder, welding-inspector, doc-taste-scribe.
**최종 판정**: T3 PASS (결함 0). P0 두 항목 완료.

### 한 일
- **사전 감사 (Phase 1.5)**: 프로젝트 셸 부재 발견 (`package.json`/`app/`/`lib/`/`.env*`/`tsconfig.json` 모두 없음). 후보 A/B/C 정리 후 사용자에게 NEED_USER_DECISION.
- **사용자 결정 (T1)**: 후보 A — 헌법 강제형 풀셸 부트스트랩 + P0 동시 적용 채택.
- **ADR D-011 등재**: 셸 부트스트랩은 §6 디렉토리 트리 전체를 placeholder로 한 번에 만든다는 결정을 `docs/DECISIONS.md`에 정식 등재. 본 사이클의 SSOT 충돌 조기 검출 사례를 결과 섹션에 기록.
- **스키마/마이그레이션 (T1.5, schema-architect)**: `lib/schema.ts` (RecipeState/CookRun/RuntimeLog/Fingerprint/BuildContext/EngineResponse/Stage Zod 스키마, D-005 `timer_sec` 강제), `supabase/migrations/0001_init.sql` (5 테이블 + RLS 정책, DATA_MODEL.md §6 기준). rev2에서 ENGINE.md §3 계약 보강.
- **셸 부트스트랩 (T2, engine-builder)**: 21개 파일 작성 — `package.json`/`tsconfig.json`/`next.config.ts`/`.env.example`/`.gitignore` (루트), `lib/env.ts`(server-only)/`lib/ratelimit.ts`(Upstash sliding window)/`lib/supabase.ts`(D-007 주석), `lib/{prompt,diff,runtime,fingerprint}.ts` (시그니처 가이드 주석 placeholder), `app/api/{recipe,run}/route.ts` (rate limit 게이트 + env 가드 + 501 본문), `app/{layout,page}.tsx`, `components/{BuildMode,CookMode,Postmortem}.tsx` (placeholder + 용접 주석).
- **SSOT 충돌 해소 (T2 rev2)**: 라우트 로컬 스키마 정의 → `@/lib/schema` 단일 출처 import로 회복. 풀셸 부트스트랩이 한 사이클 안에서 표류를 조기 검출.
- **정합성 검증 (T3, welding-inspector)**: weld-trace 5라인 PASS, 경계 C(Zod ↔ DB) 7/7 PASS, P0 강제 5점검(A~E) PASS, cold-start 검증 PASS, 결함 0건.
- **문서 동기화 (T4, doc-taste-scribe)**: D-011 등재, MAP 23 파일 + 역할 설명 반영, ROADMAP P0 [x] 마킹, SESSION/CLAUDE.md §9 갱신.

### 다음 할 일 (ROADMAP P1 순서)
1. `lib/prompt.ts` 본문: 페어 쿠킹 시스템 프롬프트 (ENGINE.md §3·§5). BuildContext(`runtime_log.known_issues` + `fingerprint.traits` + `cold_start`) 주입 강제. cold start 시 "맹탕 모드" 명시.
2. `app/api/recipe/route.ts` 본문: Anthropic 호출 + `EngineResponseSchema` safeParse + D-004 1회 자동 재시도 + `splitDiff(prev, next)` 호출.
3. `lib/diff.ts` 본문: `splitDiff` 구현 (생성=산출물 카드, 수정=diff, D-001/D-002).
4. `components/CookMode.tsx`: 스텝 진행 + `timer_sec` 타이머 + Wake Lock + 인라인 핫픽스(D-006, `step_events`에만 기록).
5. `components/Postmortem.tsx`: 3단 평가(`outcome`) + 실패 스텝 핀포인트(`failed_here`).
6. `app/api/run/route.ts` 본문: cook_runs INSERT → runtime_logs UPSERT → fingerprints UPSERT 트랜잭션 (Postgres RPC 권장, D-008 용접 강제 지점).
7. `lib/runtime.ts` + `lib/fingerprint.ts` 본문: 집계 / 교차분석.
8. 사용자 인증/세션 + service-role 호출 전 user_id 매칭 (T2 §5 R4 가드).
9. `components/FingerprintCard.tsx`: 부엌 지문 프로필 노출 (전환 비용).

### 막힌 것 / 결정 대기
- **없음** — 본 사이클에서 발생한 NEED_USER_DECISION(D-011)은 후보 A 채택으로 해소됨.
- T2 §5의 잔존 회귀 위험 R1~R8 + rev2의 R9~R11은 모두 P1 작업 시점의 가드 대상이지 현재 블로커 아님.
- TASTE.md §5 미정 항목(분량 스케일링, 게이지 초기값, Fingerprint confidence 임계, 대체 재료 허용)은 P1 진입 직전 유케이 결정 필요.

### 메모
- 빌드 검증(`npm install && npm run typecheck && npm run build`)은 사용자(유케이)가 더미 Upstash/Anthropic/Supabase 키를 `.env.local`에 채운 후 직접 실행 권고. server-only 위반은 빌드 타임에 잡힘.
- Supabase 프로젝트가 아직 없으므로 `supabase db push`는 P1 진입 시 사용자 측 셋업.
- Cook→Postmortem 자동 진입(§4 강제 규칙)은 P1에서 modal 또는 blocking route 둘 중 하나 선택 필요.

---

## 세션 0 — 설계 합의 & 문서화 (기획 단계)

### 한 일
- 바이브 코딩의 루프를 레시피로 이식하는 컨셉 확립 (v1 즉시빌드 → v2 대화빌드 → v3 생성/수정 분리)
- v3 BUILD MODE 프로토타입 완성, Next.js 프로젝트로 포팅 + 빌드 검증 통과
- VIBE 2.0 기획: Cook=Run (Build→Cook→Postmortem 순환, RuntimeLog 피드백 루프)
- 복제 불가능성 전략 확정:
  - 시간 해자: Fingerprint (MVP), 집단 지성 (Phase 2)
  - 즉시 해자: 용접 구조(D-008) + 취향(D-009) ← 진짜 방어
- 전체 문서 세트 작성 (CLAUDE.md + docs/*)

### 다음 할 일 (우선순위 순 — ROADMAP 참조)
1. `lib/schema.ts`에 steps `{text, timer_sec}` 구조 반영 (D-005) + CookRun/RuntimeLog/Fingerprint 추가
2. `components/CookMode.tsx` 구현 (타이머 + Wake Lock + 핫픽스)
3. `components/Postmortem.tsx` + `/api/run` (용접 강제: Cook→Postmortem→Fingerprint)
4. Supabase 연결 (`lib/supabase.ts`, 테이블 + RLS)
5. 배포 전: `/api/*` rate limit (P0 보안)

### 막힌 것 / 결정 대기 (유케이에게)
- TASTE.md §5의 미정 항목들 (분량 스케일링, 게이지 초기값, Fingerprint 임계 confidence, 대체 재료 허용 범위)

### 메모
- v3 단일 파일(`VibeRecipe.tsx`)을 BuildMode.tsx로 분리하면서 schema 변경(steps 구조)을 같이 반영할 것. 한 번에.
