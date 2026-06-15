# 헌법 검증 결과 — P1.T1 (엔진 코어 사전 가드)

**작성자**: welding-architect
**일자**: 2026-06-14
**스킬**: `.claude/skills/constitution-check/SKILL.md` 5단계 절차 적용
**입력**: `_workspace/00_input/request.md` (P1 엔진 코어 두 항목)
**참조**: CLAUDE.md, DECISIONS.md(D-001~D-011), ENGINE.md, PRD.md, TASTE.md, DATA_MODEL.md, `lib/schema.ts`, `app/api/recipe/route.ts`, `lib/prompt.ts`, `_workspace_p0_done_20260614/`

---

## 결정

**NEED_USER_DECISION**

P1 엔진 코어 두 항목(`lib/prompt.ts` 본문 + `app/api/recipe/route.ts` 본문)은 ROADMAP P1에 명시된 정당한 작업이며, 핵심 의도(D-003 점진 빌드, D-004 1회 재시도, D-005 timer_sec 강제, D-008 BuildContext 주입, §4 cold-start 명시) 모두 헌법과 정합한다. **핵심 노선 자체는 PASS**.

다만 본문 구현 과정에서 임의 결정 시 ADR 없는 사실상 헌법이 생기는 **4개 회색 영역**이 식별됨. 임의 결정 시 D-009(임의 결정 금지) 저촉 + 향후 표류 위험 → 사용자 결정 후 진행 권고.

회색 영역:
- **GA-1**: D-003a 모드 자동 판단(즉시 빌드 분기 임계값) 본 사이클 구현 여부
- **GA-2**: `known_issues` 토큰 트리밍 기준 N (ENGINE.md 미명시)
- **GA-3**: BuildContext 조회 실패 시 fallback 정책 (cold_start=true vs 502)
- **GA-4**: 시스템 프롬프트의 TASTE.md 인용 방식 (전체 임베드 vs 원칙별 인용 vs URL 참조)

---

## Step 1 — §1 제품 철학 검증

| 철학 | 적용 | 결과 |
|------|------|------|
| §1.1 요리는 컴파일이 아니라 런타임 | `lib/prompt.ts`가 BuildContext(RuntimeLog + Fingerprint)를 systemPrompt에 주입 → 런타임 결과가 다음 빌드로 되먹임 | PASS |
| §1.2 답변이 아니라 diff | EngineResponse.new_state = 전체 상태(D-001). diff는 `lib/diff.ts`가 계산. 라우트 본문에서 splitDiff 호출 골격이 이미 `app/api/recipe/route.ts` 헤더 주석에 명시 | PASS — 단, P1.T3 본문에서 splitDiff 실제 호출이 빠지면 회귀. T4 검증 항목으로 인계 |
| §1.3 한 번에 완성하지 않는다 | `lib/prompt.ts`가 stage별로 systemPrompt를 분기. concept→base→taste→steps→done 한 턴 한 단계 (ENGINE.md §2) | PASS — D-003a 즉시 빌드 탈출구는 GA-1로 분리 |
| §1.4 베끼려면 전부를 베껴야 | `app/api/recipe/route.ts`가 `@/lib/schema` 단일 SSOT 임포트 유지. 라우트 옆 로컬 스키마 재정의 금지 (D-011 rev2 / R9) | PASS — T2/T3 본문에서 EngineResponseSchema 재정의 유혹 발생 시 BLOCK |

---

## Step 2 — §4 용접 구조 테스트 (핵심 게이트)

> "엔진 코어를 떼어내도 다른 단계가 여전히 완전한가?"

답: **N**. 엔진은 BuildContext(다른 단계의 출력)를 *필수 입력*으로 받고, 결과는 RecipeState로 흘러 Cook → Postmortem → RuntimeLog → 다음 BUILD로 순환한다. 떼어내면 BUILD가 죽고 그 결과 Cook의 timer_sec 입력 자체가 없어진다 → 전체 루프 정지.

§4 강제 규칙 점검:

| 강제 규칙 | 본 사이클 적용 위치 | 상태 |
|----------|-------------------|------|
| BUILD 시작 시 RuntimeLog + Fingerprint 조회 강제 | `app/api/recipe/route.ts` [4] BuildContext 조회 골격 → P1.T3 본문에서 실제 Supabase 조회 구현 | 골격 PASS, 본문 구현은 T3 책임 |
| cold start(둘 다 비어 있음) 명시 | `BuildContextSchema.cold_start: boolean` + `lib/prompt.ts`가 cold_start=true이면 "맹탕 모드" 텍스트 박는 책임 | 시그니처 PASS, 텍스트 구현은 T2 책임 |
| 핫픽스 → CookRun.step_events 기록 | 본 사이클 범위 밖 (Cook 라우트는 P1.T3 이후) | 무관 |
| POSTMORTEM 없이 COOK 종료 불가 | 본 사이클 범위 밖 | 무관 |

**용접 다이어그램**:
```
[Supabase: RuntimeLog + Fingerprint]
        │ (T3 본문에서 조회 강제)
        ▼
[BuildContextSchema.parse — cold_start 결정]
        │ (T2 buildSystemPrompt가 필수 매개변수로 받음)
        ▼
[systemPrompt — 맹탕 모드 텍스트 분기 포함]
        │
        ▼
[Anthropic 호출 → EngineResponseSchema.parse]
        │ (실패 시 D-004 1회 재시도)
        ▼
[RecipeState new_state → splitDiff(prev, next)]
        │
        ▼
[클라이언트: 생성=산출물 카드 / 수정=diff]
```

**판정**: 용접 PASS. 단, 다음 항목이 코드로 강제되어야 함:
- buildSystemPrompt 시그니처에 `buildContext: BuildContext`가 *필수*(옵셔널 금지) — TypeScript가 누락 차단
- 라우트가 buildSystemPrompt 호출 전 반드시 BuildContextSchema.parse 통과
- callEngineWithRetry 시그니처가 `buildContext: BuildContext` *필수*

---

## Step 3 — §7/§D ADR 매핑

| ADR | 본 사이클 적용 위치 | 검증 | 결과 |
|-----|-------------------|------|------|
| **D-001** LLM diff 금지 | EngineResponseSchema.new_state는 RecipeState 전체. 라우트가 splitDiff(prev, next) 호출 | LLM에게 diff 필드 요구 금지. 시스템 프롬프트에 "전체 new_state 반환" 명시 필요 | PASS (구조 ok). T2 시스템 프롬프트 작성 시 "new_state는 변경 후 전체 상태" 명시 필수 |
| **D-002** 생성=카드, 수정=diff | splitDiff는 `lib/diff.ts` 책임. 라우트는 호출만 | 본 사이클 범위 밖 (diff 본문은 별도 작업 — T3 본문에서 호출만) | T3 작업 시 splitDiff 호출 위치 확보 인계 |
| **D-003** 한 턴 한 단계 | `lib/prompt.ts`가 stage별로 systemPrompt 분기. 시스템 프롬프트가 "한 턴 한 단계" 불변 규칙 명시 | ENGINE.md §4.1 "한 턴에 한 단계만. 절대 한 번에 전체 레시피 생성 금지." → 프롬프트에 박아야 함 | PASS — T2 작업자에게 인계 |
| **D-003a** 모드 자동 판단 | "알아서 다 해줘" 탈출구 — ROADMAP P2 (DECISIONS.md L44 명시) | **GA-1**: 본 사이클에서 단순 키워드 매칭(예: "알아서/한번에" 포함)만 만들지, P2로 미룰지 결정 필요 | **NEED_USER_DECISION** |
| **D-004** Zod 1회 재시도 | `callEngineWithRetry` 시그니처 이미 `app/api/recipe/route.ts` 하단 의사코드 박힘 | 2회 연속 실패 시 502. **3회 이상 재시도 금지** 주석 박혀 있음 | PASS — T3 본문 구현 시 그대로 적용 |
| **D-005** timer 텍스트 파싱 금지 | StepSchema.timer_sec 필수. systemPrompt가 "스텝마다 timer_sec 박아라, 없으면 0" 명시 | ENGINE.md §6 컨벤션 (timer_sec=0). 프롬프트에 박을 것 | PASS — T2 인계 |
| **D-006** 핫픽스 새 버전 금지 | 본 사이클 범위 밖 (Cook 라우트는 별도). 단 systemPrompt에서 "done 단계에서도 핫픽스성 요청은 다음 회차 메모로만" 안내 권고 | 본 사이클 직접 강제 위치 없음 | 무관 |
| **D-007** localStorage 금지 / Supabase 영속 | BuildContext 조회는 Supabase에서. 라우트가 anon/service-role 클라이언트 분기 결정 필요 | `lib/supabase.ts` 골격 존재. T3에서 어느 클라이언트로 조회할지 결정 (사용자 인증 흐름과 연계) | PASS — T3에서 결정. R4(service-role 오용) 가드 인계 |
| **D-008** 용접 의존성 | BuildContext 필수 매개변수 강제 + cold_start 분기 명시 | Step 2 용접 테스트에서 검증 완료 | PASS |
| **D-009** TASTE.md 외 임의 결정 금지 | systemPrompt가 TASTE.md 원칙(맛 6축, 식감 5축, 스텝 분할, 핫픽스 우선순위, 언어 톤)을 LLM에 전달하는 방식 결정 필요 | **GA-4**: 전체 임베드 vs 원칙별 인용 vs URL 참조 | **NEED_USER_DECISION** |
| **D-010** 공급 측 독점 / 반직관 | 무관 | — | 무관 |
| **D-011** 셸 부트스트랩 풀셸 | 본 사이클은 D-011이 깐 placeholder를 채우는 작업. SSOT 단일화(rev2 §8) 유지 강제 | 라우트 옆 EngineResponseSchema 재정의 금지 (R9). T3 작업자는 무조건 `@/lib/schema` import | PASS — T3 작업 가드로 인계 |

---

## Step 4 — 데이터 영속 / 보안 검증

| 항목 | 적용 | 결과 |
|------|------|------|
| localStorage 금지 | BuildContext 조회는 Supabase. lib/prompt.ts는 *순수 함수*(입력만 받음, 자체 영속 0) | PASS |
| API 키 클라이언트 노출 | `app/api/recipe/route.ts`만 `lib/env.ts` 임포트. `lib/prompt.ts`는 env 의존 0이어야 함 (순수 함수 유지) | PASS — T2 작업자가 lib/prompt.ts에 env import 추가 시 BLOCK |
| `/api/recipe` rate limit | enforceRateLimit 첫 호출 이미 존재 (P0 골격) | PASS |
| 입력 검증 | `RequestBodySchema.safeParse(body)` 본 사이클에서 분기 활성화 (D-011 P0 골격에서 `void` 처리되어 있던 것) | PASS — T3 본문 구현 시 실제 분기 |
| Anthropic 응답 JSON 추출 안전성 | extractJson 헬퍼 — 마크다운 코드펜스(\`\`\`json) 처리 + 첫 `{`/마지막 `}` 발견 fallback. 실패 시 D-004 재시도로 흘림 | PASS — T3에서 구현. 무한 루프 방지를 위해 extractJson 자체는 throw 가능 |
| 토큰 폭주 가드 | known_issues 누적 시 토큰 비용 폭발 위험 | **GA-2**: 트리밍 기준 N — ENGINE.md 미명시 → **NEED_USER_DECISION** |
| BuildContext 조회 실패 처리 | Supabase 일시 장애 시 fallback 정책 미정 | **GA-3**: cold_start=true로 진행 vs 502 즉시 반환 → **NEED_USER_DECISION** |

---

## Step 5 — 결정 + 재설계 권고

### 결정: NEED_USER_DECISION

핵심 노선(systemPrompt 함수 시그니처, BuildContext 필수 주입, D-004 1회 재시도, D-005 timer_sec 강제, SSOT 단일화)은 모두 PASS. 본문 작업을 막을 사유는 없다. 그러나 **4개 회색 영역은 임의 결정 시 ADR 없는 사실상 헌법이 된다** — D-009 임의 결정 금지에 저촉 + GA-2/GA-3는 R3·R5 회귀 위험과 직결.

회색 영역만 사용자 결정 후 T2/T3 진입 권고.

---

## 회색 영역 — 사용자에게 물을 후보

### GA-1. D-003a 모드 자동 판단 — 본 사이클 구현 vs P2

**맥락**: DECISIONS.md D-003a는 "ROADMAP P2"로 명시되어 있다. 그러나 ENGINE.md §4.4 "알아서/한번에 요청 시 일괄 완성 → done"이 불변 규칙으로 박혀 있고, 시스템 프롬프트 본문에 이 규칙을 어떻게 작성하느냐가 본 사이클 결정 대상이다.

**후보**:
- **A. 본 사이클은 키워드 매칭만**: 시스템 프롬프트에 "사용자가 '알아서/한번에/대충/다 해줘' 류 명시 시 done까지 일괄"이라고 자연어 규칙만 박음. 입력 구체성 자동 분석은 없음. → ENGINE.md §4.4 충실, 구현 비용 최소.
- **B. 본 사이클에서 입력 구체성 휴리스틱 추가**: lib/prompt.ts에 별도 함수(예: `inferMode(messages): "incremental"|"oneshot"`)로 "재료 3개 이하 + 명확한 요리명 = oneshot" 등 휴리스틱 구현. → D-003a 본격 구현이라 ADR 격상 필요.
- **C. P2로 완전 미룸**: 시스템 프롬프트에 §4.4 규칙 자체를 박지 않음. → ENGINE.md §4.4와 명시 충돌. 권고하지 않음.

**권고**: **A**. ENGINE.md §4.4는 본 사이클에서 자연어 규칙으로 충족 가능. D-003a 본격 구현은 P2로 미루는 게 ADR과 정합.

---

### GA-2. known_issues 토큰 트리밍 — N의 기준

**맥락**: §4 강제 규칙 + ENGINE.md §4.9 "RuntimeLog 주입 시 알려진 실패를 먼저 언급". KnownIssueSchema에 개수 상한 없음(`z.array(KnownIssueSchema)`). 반복 사용자의 누적 known_issues가 시스템 프롬프트 토큰을 폭주시키면 비용/지연 문제 + LLM 컨텍스트 능력 저하.

**후보**:
- **A. 최근 N개(시간순) + 미해결 우선**: `resolved=false`를 모두 포함하되, 그 외에는 최근 N개 (예: N=5). → 미해결 우선 원칙(회귀 방지)과 정합.
- **B. 최근 N개(단순)**: `resolved` 무시하고 timestamp(혹은 step_events 시각)으로 최근 N개만. → 단순. 단 오래된 미해결이 묻힐 위험.
- **C. 트리밍 안 함**: 본 사이클에선 무제한, P2에서 도입. → 비용 위험. 권고하지 않음.

**ENGINE.md가 정하는가?**: 아니오. ENGINE.md §3·§4 어디에도 N 기준 없음 → ADR 또는 ENGINE.md 보강 필요.

**권고**: **A**. N은 사용자가 정하되 5~7 권고 (한 화면에 보일 정도). 그리고 이 결정을 ENGINE.md §3에 한 줄 추가(혹은 신규 ADR D-012). 본 사이클에서 임의 N 결정 시 D-009 저촉.

---

### GA-3. BuildContext 조회 실패 — fallback 정책

**맥락**: §4 강제 규칙 "BUILD 시작 시 RuntimeLog + Fingerprint를 *반드시* 조회. 없으면 cold start로 명시". 그러나 "없음"과 "조회 실패(Supabase 일시 장애, 네트워크 타임아웃, 권한 오류)"는 다르다. D-008 / D-011의 강제 규칙 해석이 갈린다.

**후보**:
- **A. cold_start=true로 fallback**: 조회 실패 시에도 진행. 단, EngineResponse.warnings에 "지난 기록을 못 불러왔어요, 맹탕 모드로 진행할게" 명시. → UX 우선. 단 §4 "반드시 조회" 강제 약화.
- **B. 502 즉시 반환**: 조회 실패 시 엔진 호출 자체를 막음. → §4 강제 엄격 해석. UX 저하 (Supabase 일시 장애로 사용자 진행 불가).
- **C. 1회 재조회 후 502**: 조회 1회 재시도 → 그래도 실패 시 502. → D-004(엔진 재시도) 패턴을 BuildContext 조회에도 적용. 중도적.

**§4 / D-008 해석**: "없으면 cold start" 문구는 "데이터가 없는 케이스"를 가리킴(첫 사용자, 첫 레시피). "조회 자체 실패"는 명시되지 않음 → ADR 공백.

**권고**: **C** (1회 재조회 후 502). 이유:
1. §4 "반드시 조회" 강제는 데이터 부재가 아니라 조회 시도 자체를 가리킴 → A는 강제 약화.
2. B는 일시 장애에 너무 가혹.
3. C는 D-004 패턴과 일관 + Supabase 일시 장애에 1회 여유.
4. 사용자에게 502 노출은 "다시 시도" 버튼 표시 (D-004와 동일 UX).

본 사이클 결정 사항이며, ADR D-013 등재 권고.

---

### GA-4. 시스템 프롬프트의 TASTE.md 인용 방식

**맥락**: D-009 "TASTE.md를 살아있는 문서로 유지. 새 판단이 나올 때마다 추가". TASTE.md 내용을 시스템 프롬프트에 어떻게 노출할지가 본 사이클 결정 대상. 토큰 비용과 헌법 강제 강도의 트레이드오프.

TASTE.md 현재 분량: §1 맛 6축 + 식감 5축, §2 스텝 분할(최대 6스텝, 한 동작+한 판단 기준, 핵심 스텝 1개 명시), §3 핫픽스 우선순위 표, §4 언어 톤, §5 미정 TODO.

**후보**:
- **A. 전체 임베드**: TASTE.md §1~§4 전체를 systemPrompt에 통째로 박음. §5는 제외(미정 항목). → 강제 강도 최대. 토큰 비용 가장 큼 (~500~800 토큰). LLM이 모든 원칙을 알게 됨.
- **B. 원칙별 인용 (stage별 분기)**: stage=taste이면 §1만, stage=steps이면 §2만, done에서 핫픽스 안내는 §3만 박음. §4 언어 톤은 모든 stage 공통. → 토큰 절약. 단 stage 분기 누락 시 헌법 강제 구멍.
- **C. URL 참조 + 핵심만**: "TASTE.md 원칙을 따른다. 의심되면 결정 보류"만 박고 실제 텍스트는 안 박음. → 토큰 최소. LLM이 TASTE.md를 못 읽으니 사실상 실효 없음. 권고하지 않음.

**권고**: **B (원칙별 인용, stage 분기)**. 이유:
1. systemPrompt가 stage별로 어차피 분기되어 있어 분기 비용 0.
2. taste 단계에서 §2 스텝 분할 원칙은 LLM이 알 필요 없음 → 토큰 낭비.
3. §4 언어 톤만 모든 stage 공통으로 박음.
4. C는 실효 없으니 제외.

본 사이클 결정 사항이며, ADR D-014 등재 권고 (시스템 프롬프트의 TASTE.md 인용 정책).

---

## 위험 잔존 — T2/T3 본문 작업 시 가드 적용 권고

D-011 rev2 §5/§8-d 회귀 위험 R1~R11 중 본 사이클에 적용되는 것:

| 위험 | 본 사이클 적용 | 가드 |
|------|--------------|------|
| **R3. UPSTASH 부재 fallback** | T3 본문에서 try/catch로 rate limit 에러 삼킬 유혹 | T3 작업자는 enforceRateLimit 결과 무조건 분기. catch 금지 |
| **R4. service-role 오용** | T3 본문에서 BuildContext 조회 시 user_id 검증 없이 service-role 호출 | T3 작업자는 supabaseServerAnonClient (RLS 적용) 사용. service-role은 명확한 사용자 신원 매칭 후에만 |
| **R5. D-008 트랜잭션 분리** | 본 사이클 범위 밖 (`/api/run`) | 무관 |
| **R9. SSOT 표류 재발** | T3 본문에서 EngineResponseSchema 재정의 유혹 (예: 새 필드 추가 시) | T3 작업자는 무조건 `@/lib/schema` import. 새 필드는 schema-architect 호출 후 lib/schema.ts에 추가 |
| **R10. BuildContext 조회 누락** | T3 본문에서 buildContext 매개변수 누락 시도 | TypeScript `CallEngineWithRetry` 시그니처 강제 + 라우트가 callEngineWithRetry 호출 전 BuildContextSchema.parse 통과 |
| **R11. cold_start 무시** | T2 buildSystemPrompt가 cold_start=true임에도 "맹탕 모드" 텍스트 누락 | T2 작업자는 cold_start=true 분기에서 명시적 "맹탕 모드" 문구 박음. T4 검증에서 grep으로 확인 |

추가 위험 신규 식별:

| 신규 위험 | 시나리오 | 가드 |
|---------|---------|------|
| **R12. JSON 추출 무한 루프** | T3에서 extractJson이 실패 시 재호출 → 또 실패 → 무한 재시도 | callEngineWithRetry는 *정확히 1회* 재시도. extractJson 실패도 검증 실패로 카운트 |
| **R13. messages 8턴 초과** | RequestBodySchema에 max(8) 박혀 있으나 T3에서 slice(-8) 보정 없이 그대로 LLM에 전달 시 토큰 폭주 | T3에서 RequestBodySchema 통과 후 한 번 더 messages.slice(-8) 가드 |
| **R14. EngineResponse.options 토큰 누수** | LLM이 15자 초과 옵션 반환 → safeParse 실패 → D-004 재시도 1회 후 502 | 이미 schema가 max(15) 강제. T2 systemPrompt에 "options 각 15자 이내" 명시 필수 |
| **R15. new_state 부분 반환 오인** | LLM이 *변경된 필드만* new_state에 박고 기존 필드 누락 → 다음 빌드에서 데이터 소실 | T2 systemPrompt에 "new_state는 변경 후 *전체* 상태. 변경 없으면 null" 명시 필수 (D-001 강제) |

---

## 용접 다이어그램 (본 사이클)

- **입력 데이터**: 사용자 요청(`request.md`) + P0 산출물(`app/api/recipe/route.ts` placeholder, `lib/prompt.ts` 빈 export, `lib/schema.ts` SSOT)
- **송신 → 수신**: welding-architect → (사용자 결정 GA-1~4) → engine-builder (T2 `lib/prompt.ts` 본문) → engine-builder (T3 `app/api/recipe/route.ts` 본문) → welding-inspector (T4 정합성 검증)
- **다음 단계의 필수 입력으로 작동?**: Y. `lib/prompt.ts`의 buildSystemPrompt 시그니처가 T3 라우트의 필수 매개변수. T3 본문이 없으면 T4 검증 대상이 없음. T4 결과가 P1 다음 묶음(Cook 라우트)의 진입 조건.
- **cold start 케이스**: Y, 명시함. BuildContextSchema.cold_start=true 분기를 buildSystemPrompt가 반드시 처리. 본 사이클의 R11 가드 + GA-3 결정으로 강제.

---

## 다음 에이전트에게 인계

- **schema 변경 필요**: N (본 사이클). 단 GA-2 결정이 "schema에 KnownIssueSchema 상한 박기"로 가면 schema-architect 호출 필요. GA-3 결정이 "BuildContext에 source: 'fresh'|'fallback' 추가"로 가면 마찬가지.
- **엔진 변경 필요**: Y. T2(`lib/prompt.ts` 본문) → T3(`app/api/recipe/route.ts` 본문) 순. engine-builder 호출.
- **UI 변경 필요**: N (본 사이클).
- **TASTE 컨설팅 필요**: GA-4가 후보 B(원칙별 인용)로 결정될 경우, stage별로 어느 TASTE.md 절을 인용할지 doc-taste-scribe 컨설팅 권고 — 단순 매핑이므로 본 welding-architect가 직접 권고안 제시 가능.
- **새 ADR 후보**: Y.
  - GA-1 A 채택 시: ADR 불필요 (ENGINE.md §4.4 충족).
  - GA-2 A 채택 시: **D-012** "known_issues 트리밍 — 최근 N개 + 미해결 우선" 등재.
  - GA-3 C 채택 시: **D-013** "BuildContext 조회 1회 재시도 후 502" 등재.
  - GA-4 B 채택 시: **D-014** "시스템 프롬프트의 TASTE.md 인용은 stage별 원칙 인용" 등재.

---

## 사용자에게 물을 것 (요약)

> "P1 엔진 코어 본문 작업 진입 전, 헌법 공백 4개 영역 결정 필요합니다.
>
> **GA-1**: D-003a 모드 자동 판단을 본 사이클에서 (A) 키워드 매칭만 / (B) 입력 구체성 휴리스틱 추가 / (C) P2로 미룸. **권고: A**.
>
> **GA-2**: known_issues 토큰 트리밍 기준 N. (A) 최근 N개 + 미해결 우선 (N=5~7 권고) / (B) 최근 N개 단순 / (C) 트리밍 안 함. **권고: A, N은 결정 필요. ADR D-012 등재**.
>
> **GA-3**: BuildContext Supabase 조회 실패 시 (A) cold_start=true로 fallback + warnings 노출 / (B) 즉시 502 / (C) 1회 재조회 후 502. **권고: C. ADR D-013 등재**.
>
> **GA-4**: systemPrompt의 TASTE.md 인용 방식 (A) 전체 임베드 / (B) stage별 원칙 인용 / (C) URL 참조. **권고: B. ADR D-014 등재**.
>
> 4개 결정 후 engine-builder T2 진입 가능."
