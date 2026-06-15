# 헌법 검증 결과 — P1.B.T1 (Cook 사이드 사전 가드)

**작성자**: welding-architect
**일자**: 2026-06-15
**스킬**: `.claude/skills/constitution-check/SKILL.md` 5단계 절차 적용
**입력**: `_workspace/00_input/request.md` (P1.B Cook 사이드 5개 파일)
**참조**: CLAUDE.md, DECISIONS.md (D-001~D-015), ENGINE.md, PRD.md, TASTE.md, DATA_MODEL.md, `lib/schema.ts`, `app/api/run/route.ts`, `lib/runtime.ts`, `lib/fingerprint.ts`, `components/CookMode.tsx`, `components/Postmortem.tsx`, `_workspace_p1_engine_done_20260615/`, `_workspace_p0_done_20260614/`

---

## 결정

**NEED_USER_DECISION**

P1.B Cook 사이드 5개 파일 본문(`lib/runtime.ts`, `lib/fingerprint.ts`, `app/api/run/route.ts`, `components/CookMode.tsx`, `components/Postmortem.tsx`)은 ROADMAP P1의 명시된 작업이며, 핵심 의도(D-005 timer_sec 사용, D-006 핫픽스 = step_events만, D-008 트랜잭션 묶음, §4 강제 규칙 3개 코드 강제 면)는 모두 헌법과 정합한다. **핵심 노선은 PASS**.

다만 본문 구현 과정에서 임의 결정 시 ADR 없는 사실상 헌법이 생기는 **6개 회색 영역**이 식별됨. 본 사이클은 P1 엔진 코어 사이클(GA 4개)보다 회색 영역이 더 많다 — Cook UI/UX 도메인 판단(TASTE.md §5 미정 영역과 직결)이 다수 포함되기 때문이며, request.md §회색 영역 예측에 명시된 6개 항목과 정확히 대응한다.

회색 영역:
- **GB-1**: 핫픽스 카테고리 5종 명세 (D-006 강제 + TASTE.md §3 핫픽스 우선순위 매칭)
- **GB-2**: Postmortem 평가 분류 — 3단(PRD §3) vs 4분류(TASTE.md §1 회고) — SSOT 결정
- **GB-3**: Fingerprint confidence 점수 계산식 (TASTE.md §5 미정 — 관찰 횟수 N → confidence 함수)
- **GB-4**: timer 알림 권한 누락 시 UX (안내 vs 강제 게이트)
- **GB-5**: Wake Lock API 미지원 브라우저 폴백 정도 (주기적 인터랙션 강제 vs 명시 안내)
- **GB-6**: `cook_runs.completed=true && outcome=null` refine — 본 사이클 SQL CHECK + Zod refine 둘 다 적용 vs 다음 사이클 분리

---

## Step 1 — §1 제품 철학 검증

| 철학 | 본 사이클 적용 | 결과 |
|------|--------------|------|
| §1.1 요리는 컴파일이 아니라 런타임 | Cook Mode가 런타임 자체. Postmortem이 런타임 결과를 RuntimeLog로 응고. Cook 사이드가 누락되면 §1.1이 빈말이 된다 | PASS |
| §1.2 답변이 아니라 diff | Cook UI는 diff 직접 안 다루지만, 핫픽스는 "이번 회차만"이라는 임시성 시각 표시(점선 테두리, 임시 배지) 필요 — request.md §F-2 | PASS — CookMode 본문에서 임시성 시각 표시 누락 시 BLOCK |
| §1.3 한 번에 완성하지 않는다 | Cook은 스텝 1개 크게(PRD §F-2). 모든 스텝을 한 화면에 표시하는 패턴은 BLOCK | PASS — UI 결정. T4 가드 |
| §1.4 베끼려면 전부를 베껴야 | **본 사이클의 핵심**. 5개 파일 중 1개라도 떼어내면 §4 용접 깨짐. 5개가 모두 한 트랜잭션/한 UI 흐름에 묶여야 한다 | PASS — D-008 트랜잭션 강제로 보장 |

---

## Step 2 — §4 용접 구조 테스트 (핵심 게이트)

> "Cook 사이드 5개 파일 중 어느 하나라도 떼어내도 다른 단계가 여전히 완전한가?"

답: **N**. 본 사이클이 §4 용접 구조의 코드 강제 면을 박는 가장 중요한 사이클이다. P1.A는 BUILD 사이드(Fingerprint/RuntimeLog 주입)만 강제했고, Cook 사이드는 placeholder였다. Cook 사이드가 빠지면 BUILD가 영원히 cold_start 상태로만 작동 — 학습 루프가 끊긴다.

§4 강제 규칙 3개의 코드 강제 위치 다이어그램:

```
[강제 규칙 ①] BUILD 시작 시 RuntimeLog/Fingerprint 조회
   └─> 이미 P1.A에서 강제 (app/api/recipe/route.ts:103-124, lib/buildContext.ts)
       Cook 사이드와 무관 — 본 사이클 범위 밖.

[강제 규칙 ②] COOK 핫픽스 → CookRun.step_events 기록 → POSTMORTEM 흐름
   ├─> components/CookMode.tsx
   │   └─ 인라인 핫픽스 핸들러가 RecipeState 미수정 보장 (D-006)
   │   └─ StepEvent {type:"hotfix", note, timestamp} 객체 생성 후 로컬 상태에 append
   │   └─ "이번 회차만" 임시성 시각 표시 (점선/배지) — request.md §F-2
   └─> components/Postmortem.tsx
       └─ Cook 종료 → Postmortem 자동 진입 (modal 또는 blocking route)
       └─ POSTMORTEM 폼이 step_events 누적분과 outcome을 묶어 /api/run에 POST

[강제 규칙 ③] POSTMORTEM 없이 COOK 종료 불가 (UI 강제)
   ├─> components/CookMode.tsx
   │   └─ "종료" 버튼이 Postmortem으로 라우팅. 직접 페이지 떠남 시(브라우저 close/route change)
   │      beforeunload 핸들러로 1차 차단 — completed=true && outcome=null 진입 자체를 막음
   └─> components/Postmortem.tsx
       └─ "건너뛰기" 버튼 0건 (request.md §F-3 + Postmortem.tsx 헤더 주석 명시)
       └─ outcome ∈ {good, meh, failed} 중 1개 선택해야 제출 버튼 활성
       └─ failed 선택 시 step_index 입력 강제 (StepEvent {type:"failed_here"} 추가)

[강제 규칙 ② 결과 흘림] /api/run 트랜잭션 (D-008)
   └─> app/api/run/route.ts — 본 사이클의 R5 가드 핵심 지점
       ├─ ① cook_runs INSERT (step_events 포함)
       ├─ ② runtime_logs UPSERT (rebuildRuntimeLog(recipe_id, [...runs, run]))
       └─ ③ fingerprints UPSERT (recomputeFingerprint(user_id, [...logs]))
       세 개가 한 트랜잭션 안에서 셋 다 성공 또는 전부 롤백.
       → Supabase RPC(plpgsql function) 또는 Postgres function 권장.
       분리 호출 시 R5 잔존 위험 (request.md §R5).
```

§4 강제 규칙 점검표:

| 강제 규칙 | 본 사이클 적용 위치 | 상태 |
|----------|-------------------|------|
| ① BUILD 시작 시 RuntimeLog + Fingerprint 조회 | (P1.A 완료, 본 사이클 무관) | PASS |
| ② cold start 명시 | (P1.A 완료, 본 사이클 무관) | PASS |
| ③ 핫픽스 → CookRun.step_events 기록 | `components/CookMode.tsx` 핫픽스 핸들러 | T4 책임 — 본 사이클 강제 가드 4개 (아래) |
| ④ POSTMORTEM 없이 COOK 종료 불가 | `components/CookMode.tsx` 종료 흐름 + `components/Postmortem.tsx` "건너뛰기" 금지 | T4 책임 — UI 레벨 강제 |
| ⑤ /api/run 트랜잭션 | `app/api/run/route.ts` Postgres RPC 호출 | T3 책임 — R5 가드 핵심 |

**핵심 강제 가드** (본 사이클이 코드로 박아야 할 4개):

1. **CookMode 종료 = Postmortem 자동 진입**: Cook 화면의 모든 종료 출구(완료 버튼, 뒤로 가기, 브라우저 close)가 Postmortem으로 이어진다. 직접 다른 페이지로 라우팅하는 출구 0건.
2. **Postmortem "건너뛰기" 버튼 0건**: outcome 미선택 상태에서 제출 버튼 비활성. failed 선택 시 step_index 입력 게이트.
3. **/api/run 트랜잭션 원자성**: Supabase RPC(plpgsql function) 또는 동등한 단일 호출로 3개 테이블 갱신을 묶음. 분리된 .insert + .upsert + .upsert 호출은 BLOCK (R5).
4. **CookMode 핫픽스는 RecipeState 변경 0**: 핫픽스 핸들러가 받는 onState 콜백 없음 — 오직 StepEvent append만. 컴파일 단계에서 강제하기 위해 props 시그니처에 setRecipeState 같은 키 금지.

**판정**: 용접 PASS. 단 위 4개 가드 + GB-1~GB-6 결정 후 본문 진입.

---

## Step 3 — §7/§D ADR 매핑 (D-001~D-015)

| ADR | 본 사이클 적용 위치 | 검증 | 결과 |
|-----|-------------------|------|------|
| **D-001** LLM diff 금지 | Cook 사이드 LLM 호출 0건 (스텝 진행 + 핫픽스 기록만). 핫픽스 텍스트는 사용자가 직접 입력 또는 카테고리 선택 (GB-1 결정) | 무관 — Cook 사이드는 LLM 미사용 | 무관 |
| **D-002** 생성=카드, 수정=diff | Cook UI는 diff 직접 안 다루지만, 핫픽스의 "이번 회차만" 임시성 시각 표시는 splitDiff 정신과 같은 계열 (한 회차만 유효한 *수정*) | "임시 배지/점선 테두리" 등 시각 표시 누락 시 §1.2 회귀 | T4 가드 |
| **D-003** 한 턴 한 단계 | Cook UI: 스텝 1개 크게(PRD §F-2). 모든 스텝을 한 화면에 표시하는 패턴은 BLOCK | 본 사이클에서 자연스럽게 충족 | PASS |
| **D-003a** 모드 자동 판단 | Cook 사이드와 무관 (BUILD 영역) | — | 무관 |
| **D-004** Zod 1회 재시도 | `app/api/run/route.ts`에서 CookRunSchema 검증 실패는 *재시도하지 않음* — 사용자 입력 검증 실패는 400으로 즉시 (D-004는 LLM 응답 검증 한정) | T3 본문에서 CookRunSchema.safeParse 실패 시 400 반환 — 재시도 루프 금지 | PASS — T3 가드 |
| **D-005** timer 텍스트 파싱 금지 | CookMode가 RecipeState.steps[i].timer_sec를 그대로 setTimeout/setInterval 입력으로 사용. 텍스트에서 "3분" 정규식 파싱 0건 | timer_sec === 0이면 타이머 UI 자체 미표시 (schema.ts L80 주석) | PASS — T4 가드 |
| **D-006** 핫픽스 새 버전 금지 | **본 사이클 핵심**. CookMode 핫픽스 핸들러가 RecipeState 미수정 + CookRun.step_events {type:"hotfix"}로만 기록 | CookMode props에 setRecipeState 같은 키 0건 — 컴파일 강제 | PASS — T4 가드. GB-1 결정 후 카테고리 명세 |
| **D-007** localStorage 금지 / Supabase 영속 | /api/run이 cook_runs + runtime_logs + fingerprints 3개 테이블 모두 Supabase 영속. Cook 진행 중 step_events는 클라이언트 React state에 임시 보관 → Postmortem 제출 시 한 번에 POST | Cook 진행 중 비정상 종료(브라우저 crash)는 데이터 손실 — 본 사이클 허용 (P2에서 진행 중 sync 검토) | PASS — T3/T4 가드 |
| **D-008** 용접 의존성 | **본 사이클이 D-008 코드 강제 면의 핵심 사이클**. /api/run 트랜잭션이 R5 가드의 SSOT | Step 2 용접 다이어그램 + 4개 강제 가드 | PASS — T3 가드 |
| **D-009** TASTE.md 외 임의 결정 금지 | **본 사이클의 회색 영역 다수가 D-009 트리거**. GB-1, GB-2, GB-3 모두 TASTE.md 영역. doc-taste-scribe 컨설팅 필요 가능성 매우 높음 | TASTE.md §3 핫픽스 우선순위(GB-1), §1 회고 4분류(GB-2), §5 confidence 임계(GB-3) | **NEED_USER_DECISION** — 3개 |
| **D-010** 공급 측 독점 / 반직관 | 무관 | — | 무관 |
| **D-011** 셸 부트스트랩 풀셸 | 본 사이클은 D-011이 깐 placeholder를 채우는 작업. SSOT 단일화 유지 강제 | Cook 사이드 라우트/컴포넌트 옆 z.object/z.enum 0건 (R9 가드) | PASS — T3/T4 가드 |
| **D-012** known_issues 트리밍 N=5 | 본 사이클 무관 (BUILD 측 프롬프트 트리밍). 단 rebuildRuntimeLog가 known_issues 누적 시 N 상한 없음 — 5개 초과 누적도 가능 | Cook 사이드는 누적만 책임. 트리밍은 BUILD 프롬프트 진입 시점에 lib/prompt.ts가 책임 (이미 구현) | PASS |
| **D-013** BuildContext 조회 실패 = 1회 재시도 후 502 | 본 사이클 무관 (BUILD 측). 단 /api/run의 fetchBuildContext 호출은 없음 — Cook 측은 트랜잭션만 | 패턴 적용 위치 0건. T3 본문에서 fetchBuildContext 호출 시도 시 BLOCK | PASS |
| **D-014** systemPrompt TASTE.md 인용 = stage별 | 본 사이클 무관 (systemPrompt 영역). **단 UI 영역의 TASTE 인용 정책은 본 사이클 신규 결정 필요** — D-014가 systemPrompt 한정이므로 | request.md §D-009 영역에 명시: "UI 측 TASTE 인용 정책 신규 등재 필요할 수 있음" | **NEED_USER_DECISION (간접)** — GB-1, GB-2가 결정되면 자동 따라 결정됨 |
| **D-015** 인증 경계 — Authorization Bearer + anon 검증 + service-role 분리 | **본 사이클 핵심 재사용 지점**. /api/run에 동일 패턴 적용 강제 — request.md §R4 명시 | `app/api/recipe/route.ts:authenticateRequest`를 그대로 재사용. 라우트별 재구현 0건이 D-015 §결과 "SSOT" 항목의 명시 사항 | PASS — T3 가드 (필수) |

---

## Step 4 — 데이터 영속 / 보안 검증

| 항목 | 적용 | 결과 |
|------|------|------|
| localStorage 금지 | Cook 진행 중 step_events는 React state에 임시. 영속은 /api/run 트랜잭션 단일 출구. Postmortem 제출 전 브라우저 close = 손실 (의도된 트레이드오프) | PASS — T3/T4 가드 |
| API 키 클라이언트 노출 | Cook 사이드 LLM 호출 0건. /api/run은 Anthropic 미호출 → 키 누설 표면 없음 | PASS |
| `/api/run` rate limit | 이미 P0 골격에 enforceRateLimit("run") 분기 적용 | PASS — T3 본문도 유지 |
| 입력 검증 | T3 본문에서 CookRunSchema.safeParse(body) 활성화 + completed=true && outcome=null refine | **GB-6**: refine을 본 사이클에서 박을지 vs 다음 사이클로 분리 → **NEED_USER_DECISION** |
| 인증 (D-015 재사용) | /api/run도 Authorization Bearer JWT + anon 검증 + service-role 분리. SSOT는 authenticateRequest. 단 본 함수가 현재 `app/api/recipe/route.ts` 내부 함수이므로 재사용을 위해 어디로 추출할지 결정 필요 | **GB-7 신규**: authenticateRequest를 `lib/auth.ts` (신설)로 추출 vs route.ts에서 export → **NEED_USER_DECISION (소형)** |
| 트랜잭션 원자성 | Supabase RPC(plpgsql function) 또는 동등한 단일 호출 강제. .insert + .upsert + .upsert 분리 호출은 R5 위반 | PASS — T3 가드. **별도 마이그레이션 0002_run_transaction.sql 필요** (request.md 미명시) |
| Wake Lock 보안 권한 | navigator.wakeLock은 HTTPS 한정 + 사용자 인터랙션 후 요청. 보안 표면 작음 | PASS — T4 가드 |
| timer 알림 권한 | Notification.requestPermission()은 일회성. 거부 시 fallback 결정 필요 | **GB-4**: 안내 표시만 vs 게이트 → **NEED_USER_DECISION** |

---

## Step 5 — 결정 + 재설계 권고

### 결정: NEED_USER_DECISION

핵심 노선(D-008 트랜잭션 묶음, §4 강제 규칙 3개 코드 강제, D-006 핫픽스 = step_events만, D-005 timer_sec 사용, D-015 인증 재사용)은 모두 PASS. 본문 작업을 막을 사유 없음.

그러나 **7개 회색 영역(GB-1~GB-7)** 모두 임의 결정 시 D-009 저촉. 특히 GB-1/GB-2/GB-3은 TASTE.md 도메인 판단이라 doc-taste-scribe 컨설팅 + 사용자 결정 필수.

회색 영역 결정 후 T2/T3/T4 진입 권고.

---

## 회색 영역 — 사용자에게 물을 후보

### GB-1. 핫픽스 카테고리 5종 명세 (D-006 + TASTE.md §3 매칭)

**맥락**: D-006 "핫픽스는 CookRun.step_events에만 기록"은 *어떤 종류*의 핫픽스가 있는지 명시 안 함. CookMode UI에서 핫픽스 입력 방식이 (자유 텍스트 only) vs (카테고리 칩 + 자유 텍스트) vs (카테고리 only)인지 결정 필요. TASTE.md §3 핫픽스 우선순위 표에 4가지 증상(짜다/싱겁다/탄다/묽다)이 명시 — 5번째 카테고리는?

**후보**:
- **A. TASTE.md §3 4종 + "기타(자유 텍스트)" 1종 = 5종**: 칩 4개 + 기타. 기타는 자유 텍스트 입력. → TASTE.md §3 충실. UI 단순.
- **B. 자유 텍스트 only**: 카테고리 0개. 사용자가 직접 한 줄 적음. → 학습 시 자연어 처리 필요. RuntimeLog 집계 어려움.
- **C. 카테고리 only (5종 강제)**: 자유 텍스트 불허. → 양념 묻은 손 친화(PRD §3) 충족. 단 "이상한 상황"을 못 잡음.

**TASTE.md가 정하는가?**: §3에 4종 우선순위 표는 있으나 5번째 명시 0. 5종 vs 4종+기타 결정은 사용자 영역.

**doc-taste-scribe 컨설팅 필요**: Y. 5번째 카테고리(타지는 않지만 식감 문제, 양념이 안 배었음 등)가 TASTE.md §3에 추가 등재 후보. taste-consult 스킬 호출 권고.

**권고**: **A** (4종 칩 + 기타). 이유:
1. TASTE.md §3 충실 — 임의 카테고리 신설 0.
2. 모바일 큰 버튼(PRD §6) 양념 묻은 손 친화.
3. "기타"가 학습되면 다음 TASTE.md §3 갱신 트리거.
4. 자유 텍스트 폭주 막음.

본 사이클 결정 사항. **ADR D-016 등재 권고** (Cook 사이드 핫픽스 카테고리 명세).

---

### GB-2. Postmortem 평가 분류 — 3단 vs 4분류 SSOT

**맥락**: PRD §F-3은 "3단 결과 평가(좋음/그냥/망함)" 명시. TASTE.md §1 회고 4분류 원칙은 본 보고서 작성 시점에 TASTE.md 본문에 직접 등재되어 있지 않음 — request.md §회색 영역 예측에서 "TASTE.md §1 4분류"라고 언급했으나 TASTE.md §1 본문은 "맛 6축 / 식감 5축"이지 "회고 4분류"가 아님. **request.md의 인용이 오류일 수 있음 — 명시 확인 필요**. lib/schema.ts:OutcomeSchema는 이미 `z.enum(["good", "meh", "failed"]).nullable()`로 3단 + null 박혀 있음 (SSOT).

**현 상태**: 
- PRD §F-3 = 3단
- lib/schema.ts:OutcomeSchema = 3단 + null (이미 SSOT)
- supabase/migrations/0001_init.sql:cook_runs.outcome = text CHECK in ('good','meh','failed') = 3단
- TASTE.md §1 = 맛/식감 축 (회고 분류 아님)

**후보**:
- **A. 3단 유지 (현 SSOT 유지)**: PRD §F-3 + 스키마/DB 일치. TASTE.md §1과 무관. → 가장 간단. 이미 박힌 SSOT 존중.
- **B. 4분류로 확장**: schema.ts:OutcomeSchema + 0001_init.sql + PRD §F-3 모두 갱신. 4번째 분류 의미 결정 필요(예: "좋음/그저 그럼/실패/대성공"). → SSOT 표류 위험. schema-architect 호출 필요.
- **C. TASTE.md §1에 회고 4분류 신설**: 별도 영역으로 4분류 추가하되 outcome 자체는 3단 유지. UI에서 outcome+추가 라벨 1개로 4번째 차원 분리. → 정보 모델 복잡.

**TASTE.md 현황 확인**: TASTE.md §1은 맛 6축 + 식감 5축이지 회고 분류가 아님. request.md의 "TASTE.md §1 4분류"는 오류이거나 미래 TASTE.md 보강 가정. **현재 명세상 충돌은 없음**.

**권고**: **A** (3단 유지). 이유:
1. PRD §F-3 + 스키마 + DB 모두 이미 3단으로 SSOT 정합.
2. TASTE.md §1에 회고 4분류 등재 0 — 충돌 자체가 없음 (request.md 인용 오인).
3. 만약 미래에 4분류가 필요하면 별도 ADR + schema-architect 호출 + 마이그레이션 0003.

본 사이클 결정 사항. 결정 후 **ADR 등재 불필요** (기존 SSOT 유지 확인만). 단 결정 사실 자체는 사용자 결정문에 명시 — TASTE.md §1 미래 보강 시 본 결정과 충돌 가능성 알림.

---

### GB-3. Fingerprint confidence 점수 계산식

**맥락**: schema.ts:TraitSchema.confidence는 0~1. lib/prompt.ts:TRAIT_MIN_CONFIDENCE = 0.5 잠정값 (이미 박힘, P1.A). 그러나 *어떻게 0~1 사이 값을 계산할지*는 미정. TASTE.md §5 "Fingerprint trait의 임계 confidence (몇 회부터 '화력 강함'이라 단정?)"가 미정 TODO로 명시.

본 사이클의 lib/fingerprint.ts:recomputeFingerprint가 RuntimeLog[]를 받아 Trait[]을 만들 때 confidence 점수를 계산해야 함.

**후보**:
- **A. 단순 빈도 기반**: trait 후보 = 같은 step_index에 failed_here/hotfix가 N회 이상 반복된 패턴. confidence = min(1.0, N/threshold). threshold = 5 (5회 관찰 = 1.0). → 단순, 설명 가능.
- **B. 베이즈 / smoothing**: confidence = (관찰_횟수 + alpha) / (전체_시도 + alpha + beta). 신뢰구간 보정. → 통계적으로 정확하지만 설명 어려움.
- **C. 다단계 누적**: 1~2회 = 0.3, 3~4회 = 0.5, 5+회 = 0.7, 동일 사용자가 confirm = 1.0. → 단계별 명시.

**TASTE.md §5 TODO**: "몇 회부터 '화력 강함'이라 단정?" — 본 사이클이 답함.

**doc-taste-scribe 컨설팅 필요**: Y. TASTE.md §5 항목 해결이라 taste-consult 스킬 호출.

**권고**: **A** (단순 빈도, threshold=5). 이유:
1. TRAIT_MIN_CONFIDENCE = 0.5 (이미 박힘)을 기준으로 빈도 3회 = 0.6 (50% 임계 통과). 5회 = 1.0.
2. 설명 가능: 사용자 프로필 노출 시 "5번 관찰 = 확실, 3번 관찰 = 잠정"이 직관적.
3. P2에서 베이즈/smoothing 도입 시 ADR 갱신.

본 사이클 결정 사항. **ADR D-017 등재 권고** + **TASTE.md §5 항목 1개 해결 (별도 D-009 트리거)**.

---

### GB-4. timer 알림 권한 누락 시 UX

**맥락**: Cook Mode는 백그라운드 알림(브라우저 탭 비활성 상태에서도 알림) 필요. Notification API는 사용자 권한 필요. 거부 시 처리 정책 미정.

**후보**:
- **A. 안내만 표시**: 거부됐어도 Cook 진행 허용. 화면 비주얼 알림(점멸 / 진동 / 사운드)만 사용. "백그라운드 알림 미사용" 배지. → UX 우선. 일부 사용자가 모르고 다른 탭으로 가면 타이머 놓침.
- **B. 권한 게이트**: 거부 시 Cook 진행 자체 차단. "타이머 알림 권한 필요" 모달. → 강제력 강함. 사용자 이탈 위험.
- **C. 권한 요청 + fallback**: 권한 요청 → 거부 시 안내만 표시 + 화면 깨움(Wake Lock)을 강제. 사운드 알림 강제. → 중도적.

**PRD/TASTE/CLAUDE.md 명시**: 0. UX 결정 영역.

**권고**: **C** (요청 + Wake Lock 강제 fallback). 이유:
1. PRD §3 "양념 묻은 손 친화" — 사용자가 화면을 직접 보고 있을 가능성 낮음. 알림 부재는 치명.
2. Wake Lock은 권한 미요구 (HTTPS만 필요) → 항상 작동.
3. 사운드 알림은 무음 모드여도 페이지 음원이라 일부 작동.
4. 게이트는 UX 저하 (대다수 사용자가 알림 차단 환경).

본 사이클 결정 사항. **ADR D-018 등재 권고** (Cook Mode 알림 권한 정책).

---

### GB-5. Wake Lock 미지원 브라우저 폴백 정도

**맥락**: navigator.wakeLock은 비교적 신규 API. iOS Safari는 16.4+ 지원. 미지원 브라우저 처리 정책 미정.

**후보**:
- **A. 주기적 인터랙션 강제**: Wake Lock 미지원 시 30초마다 화면 터치 요구 ("계속 진행하려면 탭하세요"). → 양념 묻은 손 친화 위반. PRD §3 충돌.
- **B. 명시 안내 + 통과**: "화면이 꺼질 수 있어요 — 설정에서 화면 잠금 시간을 늘려주세요" 안내 후 그대로 진행. → UX 저하지만 PRD §3 정합.
- **C. NoSleep.js 폴백**: 무음 비디오 재생으로 화면 켜짐 유지. 라이브러리 의존 +. → 의존성 추가. 묻혀 있던 외부 코드 도입.

**PRD/TASTE/CLAUDE.md 명시**: 0.

**권고**: **B** (명시 안내 + 통과). 이유:
1. A는 PRD §3 직접 위반.
2. C는 외부 라이브러리 의존 — D-009 정신(임의 결정 자제) 저촉.
3. B는 사용자에게 책임 이양(설정 안내) — 정직.

본 사이클 결정 사항. **ADR 등재 불필요** (사소한 UX 결정). 단 결정 자체는 사용자 결정문에 명시.

---

### GB-6. cook_runs.completed=true && outcome=null refine — 본 사이클 vs 다음

**맥락**: §4 강제 규칙 "POSTMORTEM 없이 COOK 종료 불가"는 데이터 레벨에서 `cook_runs.completed=true && outcome=null` 차단으로 구현. 현재 0001_init.sql은 outcome에 CHECK 제약(`outcome in ('good','meh','failed')`)만 박혀 있고 completed와의 관계 제약 0. schema.ts:CookRunSchema도 refine 0.

**후보**:
- **A. 본 사이클에서 둘 다 박음**: (1) 0002_run_constraint.sql 마이그레이션으로 SQL CHECK 추가 — `check (completed = false or outcome is not null)`. (2) CookRunSchema에 `.refine(d => !d.completed || d.outcome !== null, ...)` 추가. → 데이터 + 타입 양쪽 강제.
- **B. SQL CHECK만**: 마이그레이션만 추가. 클라/라우트 검증은 schema-architect 영역으로 분리. → DB 안전.
- **C. 다음 사이클로 이월**: 본 사이클은 UI 강제만, 데이터 강제는 다음. → 데이터 무결성 구멍 잔존.

**§4 강제 강도**: A가 §4와 가장 정합. UI 강제는 우회 가능(직접 /api/run 호출)이라 데이터 레벨도 필요.

**권고**: **A** (둘 다 본 사이클에서). 이유:
1. §4 강제 규칙을 코드/데이터 양면에서 강제.
2. C는 R5 잔존 위험 직접 노출.
3. 본 사이클은 D-008 트랜잭션 사이클 = 데이터 무결성 핵심 사이클.

본 사이클 결정 사항. 단 schema-architect 호출 필요 (CookRunSchema.refine + 마이그레이션 0002). **ADR 등재 불필요** (§4 강제 규칙 직접 구현이라 새 ADR 아님). 단 마이그레이션 0002의 정당화는 사용자 결정문에 명시.

---

### GB-7. authenticateRequest 추출 위치 (소형 결정)

**맥락**: D-015 §결과 SSOT 항목은 "/api/run 본문도 동일 함수 재사용"을 명시. 현재 `app/api/recipe/route.ts:157-196`에 authenticateRequest가 *내부 함수*로 존재. /api/run에서 재사용하려면 export하거나 별도 모듈로 추출 필요.

**후보**:
- **A. `lib/auth.ts` 신설**: authenticateRequest를 lib/auth.ts로 추출. 두 라우트가 모두 import. → SSOT 가장 명확. 새 파일 +1.
- **B. `app/api/recipe/route.ts`에서 export**: 한 파일에서 export 후 /api/run이 import. → 새 파일 0. 단 의존 방향 어색 (라우트가 라우트를 import).
- **C. 인라인 복제**: /api/run에 동일 함수 복제 + 주석으로 "SSOT는 lib/auth.ts로 이동 예정". → R9 SSOT 표류 직접 위반. 권고하지 않음.

**D-015 §결과 명시**: "인증 흐름은 `route.ts:authenticateRequest`가 SSOT. `/api/run` 본문(P1 후속) 진입 시 동일 함수 재사용 — 라우트별 재구현 0건". 표현이 "라우트별 재구현 0건"이지 "어디로 추출"인지 명시 0.

**권고**: **A** (`lib/auth.ts` 신설). 이유:
1. 의존 방향 자연: 라우트가 lib를 import (반대 방향 어색).
2. R9 SSOT 표류 가장 안전.
3. P2 다른 라우트 추가 시 자연스러운 확장점.

본 사이클 결정 사항. **ADR 등재 불필요** (D-015 §결과 SSOT 항목의 구체화). 단 새 파일 lib/auth.ts 추가 사실은 docs/MAP.md 갱신 필요 (doc-taste-scribe).

---

## 위험 잔존 — T2/T3/T4 본문 작업 시 가드

P1.A 사이클에서 인계된 위험 + 본 사이클 신규 위험:

| 위험 | 본 사이클 적용 | 가드 |
|------|-------------|------|
| **R3. UPSTASH 부재 fallback** | T3 본문에서 try/catch로 rate limit 에러 삼킬 유혹 | enforceRateLimit 결과 무조건 분기. catch 금지 |
| **R4. service-role 오용** | T3 본문에서 트랜잭션 RPC 호출 시 user_id 검증 없이 service-role 호출 | D-015 authenticateRequest 재사용 (GB-7). authenticate 후에만 RPC 진입 |
| **R5. D-008 트랜잭션 분리** | **본 사이클의 핵심 가드**. T3 본문에서 .insert + .upsert + .upsert 분리 호출 유혹 | Postgres RPC(plpgsql function) 단일 호출 강제. 마이그레이션 0002에 함수 정의 |
| **R9. SSOT 표류 재발** | T3 본문에서 CookRunSchema 또는 outcome enum 재정의 유혹 | 무조건 `@/lib/schema` import. GB-6 refine은 schema-architect가 lib/schema.ts에 추가 |
| **R12~R15** (LLM/JSON 관련) | 본 사이클 무관 (Cook 사이드는 LLM 미사용) | 무관 |

신규 위험 (본 사이클 식별):

| 신규 위험 | 시나리오 | 가드 |
|---------|---------|------|
| **R17. CookMode가 RecipeState 수정** | 핫픽스 핸들러가 setRecipeState 호출 유혹 (즉시 반영 UX) | CookMode props에서 setRecipeState 등 RecipeState 변경 콜백 시그니처 자체 제거. TypeScript 컴파일 강제 |
| **R18. Postmortem 우회 종료** | 사용자가 브라우저 뒤로 가기/탭 닫기로 outcome 미입력 종료 | beforeunload 핸들러로 1차 차단 (작동 보장 안 됨) + 데이터 레벨 GB-6 SQL CHECK로 2차 차단 (cook_runs.completed=true && outcome=null 자체가 DB에 못 들어감) |
| **R19. step_events 진행 중 sync 부재** | Cook 진행 중 브라우저 crash → 모든 step_events 손실 | 본 사이클 허용 (P2 진행 중 sync 검토). 사용자 결정문에 명시 |
| **R20. Postgres RPC 함수 미생성** | 마이그레이션 0002 누락 시 T3 본문이 호출할 RPC가 DB에 없음 → 500 오류 | 마이그레이션 0002 본 사이클 필수 동봉. T3에서 supabase.rpc('cook_run_commit', {...}) 호출 시 함수 fqn 명시 |
| **R21. 인증 함수 위치 충돌** | GB-7 결정 전 T3가 임의로 인라인 복제 → R9 위반 | GB-7 결정 후 T3 진입. 결정 전엔 T3 BLOCK |

---

## 용접 다이어그램 (본 사이클)

- **입력 데이터**: 사용자 요청(`request.md`) + P1.A 산출물(`app/api/recipe/route.ts` 본문, `lib/prompt.ts` 본문, `lib/buildContext.ts`, `lib/schema.ts` SSOT) + P0 산출물(`app/api/run/route.ts` placeholder, `lib/runtime.ts`/`fingerprint.ts` placeholder, `components/CookMode.tsx`/`Postmortem.tsx` placeholder)
- **송신 → 수신**: welding-architect → (사용자 결정 GB-1~7) → engine-builder (T2 `lib/runtime.ts` + `lib/fingerprint.ts` 본문) → engine-builder (T3 `app/api/run/route.ts` 본문 + 마이그레이션 0002) ∥ ui-builder (T4 `CookMode.tsx` + `Postmortem.tsx` 본문) → welding-inspector (T5 정합성 검증)
- **다음 단계의 필수 입력으로 작동?**: Y. T2의 rebuildRuntimeLog/recomputeFingerprint 시그니처가 T3 트랜잭션의 필수 호출. T4 UI가 만드는 CookRun payload가 T3 라우트의 필수 입력. 어느 하나 빠지면 D-008 트랜잭션이 작동 안 함.
- **cold start 케이스**: Y, 명시함. 
  - lib/runtime.ts:rebuildRuntimeLog(recipeId, [])는 빈 RuntimeLog 반환 (total_runs=0, known_issues=[])
  - lib/fingerprint.ts:recomputeFingerprint(userId, [])는 빈 Fingerprint 반환 (total_runs_all_recipes=0, traits=[])
  - CookMode 첫 실행 = 핫픽스 0, Postmortem outcome 입력 후 정상 트랜잭션

---

## 다음 에이전트에게 인계

- **schema 변경 필요**: Y.
  - GB-6 채택 시: CookRunSchema에 .refine 추가 (lib/schema.ts) — schema-architect 호출
  - 마이그레이션 0002_run_constraint.sql 신설 — completed/outcome CHECK + Postgres RPC 함수 cook_run_commit
- **엔진 변경 필요**: Y.
  - T2: lib/runtime.ts:rebuildRuntimeLog + lib/fingerprint.ts:recomputeFingerprint 본문
  - T3: app/api/run/route.ts 본문 + 마이그레이션 0002 + (GB-7) lib/auth.ts 신설 + authenticateRequest 추출
- **UI 변경 필요**: Y.
  - T4: CookMode.tsx 본문 (스텝 진행 + 타이머 + 핸즈프리 + 핫픽스 + Postmortem 자동 진입 강제)
  - T4: Postmortem.tsx 본문 (3단 outcome + 실패 시 step_index 강제 + "건너뛰기" 0)
- **TASTE 컨설팅 필요**: Y (강).
  - GB-1: 핫픽스 5번째 카테고리 / 자유 텍스트 정책 → doc-taste-scribe taste-consult
  - GB-3: confidence 계산식 (TASTE.md §5 "임계 confidence" TODO 해결) → doc-taste-scribe
  - GB-2: 회고 분류 (request.md 인용 검증 필요) → doc-taste-scribe TASTE.md §1 현황 확인
- **새 ADR 후보**: Y.
  - GB-1 A 채택 시: **D-016** "Cook 핫픽스 카테고리 — TASTE §3 4종 + 기타 1종"
  - GB-3 A 채택 시: **D-017** "Fingerprint confidence — 단순 빈도 N/5"
  - GB-4 C 채택 시: **D-018** "Cook 알림 권한 + Wake Lock 강제 fallback"
  - GB-2: ADR 등재 불필요 (기존 SSOT 유지 확인만)
  - GB-5: ADR 등재 불필요 (사소 UX)
  - GB-6: ADR 등재 불필요 (§4 직접 구현)
  - GB-7: ADR 등재 불필요 (D-015 §결과 구체화)
- **마이그레이션 신설**: Y. 0002_run_constraint.sql:
  - cook_runs CHECK 제약 (completed=true → outcome NOT NULL)
  - Postgres RPC 함수 `cook_run_commit(p_cook_run jsonb, p_runtime_log jsonb, p_fingerprint jsonb)` plpgsql 트랜잭션
- **신규 파일**: 
  - `lib/auth.ts` (GB-7 채택 시)
  - `supabase/migrations/0002_run_constraint.sql`

---

## 사용자에게 물을 것 (요약)

> "P1.B Cook 사이드 본문 작업 진입 전, 헌법 공백 7개 영역 결정 필요합니다.
>
> **GB-1 핫픽스 카테고리** — (A) TASTE §3 4종 + 기타 1종 / (B) 자유 텍스트 only / (C) 카테고리 5종 only. **권고: A. ADR D-016 등재 + doc-taste-scribe 컨설팅**.
>
> **GB-2 Postmortem 평가 분류** — (A) 3단 유지(현 SSOT) / (B) 4분류 확장 / (C) TASTE §1에 회고 4분류 신설. **권고: A. request.md '4분류' 인용은 오류 가능성 — TASTE.md §1은 맛/식감 축이지 회고 분류 아님**. ADR 불필요.
>
> **GB-3 Fingerprint confidence 계산식** — (A) 단순 빈도 N/5 / (B) 베이즈 smoothing / (C) 다단계 누적. **권고: A. ADR D-017 등재 + TASTE §5 임계 confidence TODO 해결**.
>
> **GB-4 timer 알림 권한 거부 시** — (A) 안내만 / (B) 권한 게이트 / (C) 요청 + Wake Lock 강제 fallback. **권고: C. ADR D-018 등재**.
>
> **GB-5 Wake Lock 미지원 폴백** — (A) 주기적 인터랙션 강제 / (B) 명시 안내 + 통과 / (C) NoSleep.js. **권고: B**. ADR 불필요.
>
> **GB-6 cook_runs.completed=true && outcome=null refine** — (A) 본 사이클에 SQL CHECK + Zod refine 둘 다 / (B) SQL CHECK만 / (C) 다음 사이클로 이월. **권고: A. 마이그레이션 0002 신설**. ADR 불필요(§4 직접 구현).
>
> **GB-7 authenticateRequest 위치** — (A) lib/auth.ts 신설 / (B) recipe/route.ts에서 export / (C) 인라인 복제. **권고: A**. ADR 불필요 (D-015 §결과 구체화).
>
> 7개 결정 후 schema-architect(GB-6) → engine-builder T2/T3 + 마이그레이션 0002 → ui-builder T4 진입 가능. T3과 T4는 GB 결정 후 병렬 가능."
