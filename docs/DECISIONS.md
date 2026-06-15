# DECISIONS.md — 설계 결정 기록 (ADR)

> 모든 중요한 설계 결정을 ADR(Architecture Decision Record) 형식으로 남긴다.
> 형식: 맥락(왜 문제였나) → 결정 → 이유 → 결과/트레이드오프.
> 한 번 내린 결정을 뒤집을 때는 기존 항목을 삭제하지 말고 "SUPERSEDED"로 표시하고 새 항목을 추가한다.

---

## D-001. diff는 LLM이 아니라 코드가 계산한다

**맥락**: 레시피 변경을 보여주려면 이전 상태와 새 상태의 차이가 필요하다. LLM에게 diff를 직접 생성시킬 수도 있다.

**결정**: LLM은 `new_state`(변경 후 전체 상태)만 반환한다. 이전 상태와의 비교(diff)는 클라이언트/서버 코드(`lib/diff.ts`)가 계산한다.

**이유**: LLM이 diff를 만들면 "어느 필드가 바뀌었는지"를 환각한다. 실제로 안 바꾼 필드를 바꿨다고 하거나, 바꾼 걸 누락한다. 코드가 계산하면 항상 정확하다.

**결과**: 프롬프트가 단순해지고(전체 상태만 출력) 정확도가 올라간다. 토큰이 늘어나는 단점은 레시피가 짧아서 무시 가능. 길어지면 JSON Patch 도입 검토(보류).

**전체 상태 의미 (2026-06-15 명시화)**: `new_state`는 "변경 후 *전체* 상태"를 가리키되, P1 구현은 D-002 패치 규율(이미 확정된 필드는 다시 보내지 않음)과 결합되어 LLM이 *변경된 필드만 부분 객체*로 반환하고 코드의 `splitDiff(prev, next)`가 prev와 next를 결합하여 전체 상태를 복원하는 형태로 작동한다. Zod 스키마(`RecipeStateSchema.nullable()`, 모든 필드 optional)가 두 해석 모두 통과시키며, 결국 동일한 전체 상태를 복원한다. 변경이 없으면 `null`.

---

## D-002. 생성은 산출물 카드로, 수정만 diff로

**맥락**: 빌드 중 스텝이 처음 컴파일되면 "스텝 6개 추가 +"처럼 diff로 보여줬더니, 사용자가 21줄짜리 `+` 폭탄을 받아 압도당했다.

**결정**: 이전에 *없던* 필드가 채워지면 → 산출물 카드(예쁜 레시피 카드). 이미 *있던* 값이 바뀌면 → diff. `splitDiff`가 `created`와 `mods`로 분리한다.

**이유**: git도 새 파일에는 +500줄 diff를 안 보여주고 파일을 보여준다. 생성은 diff가 아니다. diff는 "덜 짜게" 같은 *수정* 이후에야 빛난다. 메타포(diff)를 그대로 가져오지 말고 메타포가 풀던 문제(변경 추적)를 가져와야 한다는 일반 원칙의 첫 사례.

**결과**: 빌드 리듬이 "대화 → 작은 산출물 카드 → ... → ✓ 완성 카드 → 이후 짧은 diff"로 자연스러워짐. 수정이 7줄 넘으면 접기(▸ N개 변경).

---

## D-003. 한 턴에 한 단계 (점진 빌드)

**맥락**: "김치 참치 계란 있어" 한마디에 완성 레시피를 통째로 던지는 건 기존 레시피 AI와 똑같다.

**결정**: 엔진은 파이프라인(concept→base→taste→steps→done)을 한 턴에 한 단계만 진행한다. 매 턴 선택지(options)를 제시한다.

**이유**: 바이브 코딩의 plan mode + 점진 커밋 감각. 사용자와 합의하며 만들어야 "내 레시피"가 된다.

**결과**: 첫 경험이 압도적으로 좋아짐. 단, 반복 사용자에겐 느릴 수 있어 "알아서 다 해줘" 탈출구를 둔다 (D-003a).

### D-003a. 모드 자동 판단 (입력 구체성 기반)
모호한 입력("김치 있어")은 대화 빌드, 명확한 입력("김치참치 팬라이스 10분컷 레시피")은 즉시 빌드 후 패치 모드. 모호하면 묻고 명확하면 실행 — 바이브 코딩과 같은 원리. (구현: ROADMAP P2)

---

## D-004. 검증 실패는 에러 피드백으로 자동 재시도

**맥락**: LLM이 가끔 스키마에 안 맞는 JSON을 뱉는다.

**결정**: `app/api/recipe/route.ts`에서 Zod 검증 실패 시, 에러 내용을 대화에 덧붙여 1회 자동 재호출한다.

**이유**: 바이브 코딩에서 컴파일 에러 메시지를 AI에게 되던지는 루프의 서버 버전. 사용자는 실패를 보지 않는다.

**결과**: 체감 안정성 상승. 2회 연속 실패 시에만 사용자에게 에러 노출(502).

---

## D-005. 타이머 시간은 텍스트 파싱 금지, 스텝에 내장

**맥락**: Cook Mode에서 "중불 3분" 스텝에 타이머를 띄우려면 시간을 알아야 한다.

**결정**: 스텝 텍스트에서 "3분"을 정규식으로 파싱하지 않는다. 빌드 단계에서 엔진이 각 스텝에 `timer_sec` 필드를 함께 출력한다.

**이유**: 텍스트 파싱은 환각·실패의 온상("약 3~4분", "한소끔" 등). 구조화된 필드가 안전.

**결과**: 스키마에 `steps: [{ text, timer_sec }]` 구조 필요. (기존 `steps: string[]`에서 변경 — DATA_MODEL.md 참조)

---

## D-006. 핫픽스는 새 버전을 만들지 않는다

**맥락**: Cook Mode 조리 중 "너무 짜요" 응급 조치를 레시피 수정으로 처리할지, 일시적 기록으로 처리할지.

**결정**: 핫픽스는 정식 레시피(RecipeState)를 바꾸지 않는다. `CookRun.step_events`에만 기록된다. 정식 수정은 Postmortem 이후 사용자가 "다음엔 이렇게" 할 때만 BUILD diff로 승격.

**이유**: 조리 중 응급 조치(물 추가)는 그 회차에만 유효한 상황 대응이지, 레시피의 영구 변경이 아니다. 둘을 섞으면 레시피가 오염된다.

**결과**: 핫픽스(휘발성)와 레시피 수정(영구)의 명확한 분리. 핫픽스는 RuntimeLog로 흘러가 다음 빌드에 *간접* 반영.

---

## D-007. Fingerprint는 MVP 필수, 집단 지성은 Phase 2

**맥락**: 복제 불가능 해자로 (1) 사람별 부엌 지문(Fingerprint) (2) 집단 실패 데이터(네트워크 효과) 두 가지가 있다.

**결정**: Fingerprint는 MVP에 넣는다. 집단 지성은 Phase 2로 미룬다.

**이유**: 집단 지성은 사용자 수가 임계점을 넘어야 작동한다(닭-알 문제). Fingerprint는 사용자 1명, 요리 1회부터 즉시 쌓이기 시작한다. 출시 첫날부터 작동하는 해자가 먼저다.

**결과**: MVP 데이터 모델에 Fingerprint 포함. 단, 즉시 작동하는 진짜 방어는 D-008/D-009(용접·취향)임을 잊지 말 것.

---

## D-008. 용접 구조 — 부분 복제를 무의미하게 만든다

**맥락**: 출시되면 기능은 2주면 복제된다. 시간 기반 해자(데이터)는 출시 후 1년간 무방비다. 즉시 작동하는 해자가 필요했다.

**결정**: Build→Cook→Postmortem→RuntimeLog→Build를 하나로 용접한다. 각 단계의 출력을 다음 단계의 *필수 입력*으로 만들어, 부분만 베끼면 가치가 0이 되게 한다. (상세: CLAUDE.md §4)

**이유**: 단일 기능은 베껴져도, 깊게 얽힌 시스템은 못 베낀다. 이것은 시간이 아니라 *설계*로 만드는 해자라 첫날부터 작동한다.

**결과**: 모든 신규 기능은 "떼어내도 다른 단계가 완전한가?" 테스트를 통과하면 안 된다(통과 = 용접 실패). 코드 레벨에서 데이터 의존성으로 강제.

---

## D-009. 취향 해자 — 판단을 명세서 밖에 둔다

**맥락**: 시스템 프롬프트는 추출되고 UI는 베껴진다. 베낄 수 없는 건 무엇인가.

**결정**: 맛 분해, 스텝 분할, 조리 원리 판단 등 수백 개의 미세 결정을 유케이의 도메인 감각(`docs/TASTE.md`)에 둔다. Claude Code는 TASTE.md에 없는 판단을 임의로 내리지 않고 묻는다.

**이유**: 경쟁자가 앱을 통째로 베껴도, 다음 기능에서 유케이라면 내렸을 판단을 못 내린다. 취향은 코드가 아니라 사람에 있다. 용접 구조(D-008)와 결합하면 "전부를 베끼려면 유케이의 감각을 가져야 한다"가 성립.

**결과**: TASTE.md를 살아있는 문서로 유지. 새 판단이 나올 때마다 추가.

---

## D-010. 공급 측 독점 / 반직관적 선택은 채택 보류

**맥락**: 즉시 작동 해자 후보 4종 중 공급 측 독점과 반직관적 선택도 검토했다.

**결정**: 둘 다 MVP 전략에서 제외. 공급 측 독점은 순수 SW라 묶을 공급원이 없고 철학과도 충돌. 반직관적 선택은 위협적 경쟁자가 생긴 *이후* 작동하는 방어라 초기엔 무효.

**이유**: 우리에게 맞는 즉시 해자는 통합의 깊이(D-008)와 취향(D-009) 두 개로 충분하고 강하다.

**결과**: 반직관적 선택은 대기업 진입 시 재검토 (예: 일부러 불완전한 레시피 → 페이지뷰 모델 경쟁자가 못 베낌).

---

## D-011. 셸 부트스트랩은 헌법을 코드로 강제하는 풀셸 형태로 한다

**맥락**: ROADMAP P0(`/api/*` rate limit + `ANTHROPIC_API_KEY` 서버 격리)를 시작하는 시점에 프로젝트 셸(`package.json`, `app/`, `lib/`, `components/`, `.env*`, `tsconfig.json`, `supabase/`)이 모두 부재함이 발견됨. 셸을 만드는 방식이 §1·§4·§7(D-005/D-006/D-007/D-008) 강제 강도와 직결되나 기존 ADR에 다루어지지 않음. 임의로 정하면 ADR 없는 사실상 헌법이 생기고 D-009(임의 결정 금지)와도 충돌한다.

**결정**: 셸 부트스트랩은 §6 디렉토리 트리 전체를 placeholder로 한 번에 만든다. 구체적으로:
1. `app/api/recipe/route.ts`와 `app/api/run/route.ts`를 **동시에** 생성한다(둘 다 rate limit 적용된 501 응답으로 시작). 한쪽만 만들지 않는다.
2. `lib/schema.ts`에 RecipeState/CookRun/RuntimeLog/Fingerprint 4종 Zod 스키마 최소 골격을 동시에 박는다. `steps: {text, timer_sec}[]` 구조를 첫날부터 강제(D-005).
3. `lib/supabase.ts` 골격을 두고, 모듈 상단 주석으로 "**localStorage 사용 금지 — D-007**"을 명시.
4. `app/api/run/route.ts`에 "CookRun 저장 → RuntimeLog 갱신 → Fingerprint 재계산" 호출 순서를 트랜잭션 골격 주석으로 박아둔다(D-008 용접 강제 지점 표식).
5. `.env.example`은 서버 전용 키만 둔다. `NEXT_PUBLIC_*` 접두사가 붙은 키는 Anthropic 또는 Supabase service-role 키에 대해 절대 사용 금지(코드 리뷰 강제 + `lib/env.ts`의 `import "server-only"` 가드).
6. `lib/prompt.ts`·`lib/diff.ts`·`lib/runtime.ts`·`lib/fingerprint.ts`·`components/{BuildMode,CookMode,Postmortem}.tsx`는 빈 export + 시그니처 가이드/용접 다이어그램 주석만 둔다. 본문은 P1에서 채운다.

**이유**: 셸을 BUILD 위주로 최소 생성하면 후속 작업자가 D-007(localStorage 금지)·D-008(용접 의존)을 *코드 강제*가 아닌 *문서 권고*로만 만난다. §4는 "코드 레벨에서 데이터 의존성으로 강제"를 명시한다. 셸 자체가 그 강제의 첫 면이다. P0 두 항목("rate limit + env 점검")의 본질("API 키 비용 보호 + 키 노출 방지")이 실제로 작동하려면 라우트가 존재해야 한다는 점도 결정적이다.

**결과**:
- P0 작업 범위가 표면 문구("rate limit + env 점검")보다 커진다. 신규 파일 23개(셸 21 + 스키마 2)가 동시에 들어오며 ADR D-011 사후 등재가 발생함. 단 P1 작업이 placeholder를 채우는 형태가 되어 전체 일정은 압축됨.
- `package.json`이 생기므로 `@upstash/ratelimit`·`@upstash/redis` 의존성이 P0 단계에선 사용, 일부(`@anthropic-ai/sdk`·`@supabase/supabase-js`)는 P1까지 import 그래프에서 미사용 상태로 들어옴. 의도된 비용.
- Supabase 프로젝트가 아직 없어도 셸이 빌드 가능해야 함(env가 빈 상태에서 import는 되지만 런타임 호출 시 명시적 throw). `lib/env.ts`의 `requireEnv`가 조용한 fallback 없이 즉시 throw하도록 박힘.
- **이 사이클이 곧 D-011의 적용 사례가 됐다.** schema-architect의 T1.5 rev2 보강(`EngineResponseSchema`·`StageSchema` 신설)과 engine-builder의 T2 rev1 라우트 로컬 정의 사이에 SSOT 충돌이 발생, 같은 사이클 안의 T2 rev2에서 라우트가 `@/lib/schema` import로 단일 출처를 회복하면서 해소되었다. **헌법 강제형 풀셸이 실제로 SSOT 표류를 한 사이클 안에서 조기 검출하게 했다** — 셸 단계에서 두 SSOT가 부딪치는 표면을 미리 깔지 않았다면 P1에 가서야 발견됐을 충돌이다. §1.4 "베끼려면 전부를 베껴야 한다"가 코드 레벨에서 작동한 첫 증거.
- 사용자 결정 시점(2026-06-13)이 코드 등재 시점(같은 일)에 선행했고, 본 ADR은 P0 사이클 마무리 단계에서 정식 등재됨. 향후 ROADMAP에 없는 셸/구조 결정이 발생할 때는 같은 절차(NEED_USER_DECISION → 후보 제시 → 사용자 채택 → ADR 등재)를 따른다.

---

## D-012. `known_issues` 트리밍 — 최근 N=5 + 미해결 우선

**맥락**: P1 엔진 코어 사이클(`lib/prompt.ts` 본문 구현)에서 BuildContext의 `runtime_log.known_issues`를 systemPrompt에 주입할 때 토큰 폭주 위험이 식별됨. `KnownIssueSchema`에 개수 상한 없음(`z.array(KnownIssueSchema)`) → 반복 사용자의 누적 known_issues가 시스템 프롬프트 토큰을 폭주시키면 비용/지연 + LLM 컨텍스트 능력 저하. ENGINE.md §3·§4 어디에도 N 기준 없음 → ADR 공백.

**결정**: `lib/prompt.ts`가 systemPrompt에 주입할 때 `known_issues`를 다음 정책으로 트리밍한다:
1. **미해결 우선**: `resolved=false` 항목을 먼저 정렬한 뒤, 해결됨(`resolved=true`) 항목을 그 다음에 배치.
2. **최근 N=5**: 정렬된 배열의 앞에서 5개만 systemPrompt에 표시. 같은 그룹(미해결/해결됨) 안에서는 호출자(라우트)가 `runtime_logs` 조회 시 최신순 정렬해 넘기는 책임 — `KnownIssueSchema`에 timestamp 필드가 없어 코드 내 정렬 키 부재.
3. **메타 명시**: systemPrompt에 "미해결 우선 정렬 후 최근 5개만 표시" 문구를 박아 LLM이 트리밍 사실을 인지하게 한다.
4. **SSOT**: 트리밍 로직은 `lib/prompt.ts`의 `trimKnownIssues(issues, budget=5)` 헬퍼로 export. 라우트/테스트가 동일 로직을 재구현 금지(R9 SSOT 표류 방지).

**이유**: 후보 비교:
- **A (채택)**: 미해결 우선 + 최근 N개 → 회귀 방지 원칙(미해결이 묻히면 같은 실수 반복)과 정합.
- B (단순 최근 N개): 오래된 미해결이 묻힐 위험.
- C (트리밍 안 함): 토큰 폭발.

**결과**:
- N=5 상수는 환경변수로 빼지 않음 — 변경 시 ADR 갱신 + 코드 수정의 두 단계가 필요한 의도된 마찰. 사용자가 7개 등 다른 값으로 바꾸려면 본 ADR을 SUPERSEDED 처리하고 새 ADR 등재.
- KnownIssue에 timestamp 필드가 없으므로 "최근" 판정은 호출 경로 전체에서 입력 순서 보존만 보장. timestamp 도입은 ENGINE.md 보강 + 별도 ADR.
- **사용자 결정 시점**: 2026-06-14 (welding-architect 보고서 GA-2 권고 → 사용자 채택 — `_workspace/02b_user_decision_P1T1.md`). 본 ADR은 P1 엔진 코어 사이클 마무리 단계에서 정식 등재.

---

## D-013. BuildContext 조회 실패 — 1회 재조회 후 502

**맥락**: CLAUDE.md §4 강제 규칙은 "BUILD 시작 시 RuntimeLog + Fingerprint를 *반드시* 조회. 없으면 cold start로 명시"이다. 그러나 "데이터 없음(첫 사용자, 첫 레시피)"과 "조회 자체 실패(Supabase 일시 장애, 네트워크 타임아웃, 권한 오류)"는 다르다. D-008 / D-011의 강제 규칙 해석이 갈리며 ADR 공백이 식별됨.

**결정**: `app/api/recipe/route.ts`에서 `fetchBuildContext` 호출은 다음 정책을 따른다:
1. **1차 호출** 실패 시(throw) → **1회 재조회**.
2. 재조회도 실패하면 → **502 즉시 반환** (`{ error: "build_context_fetch_failed", message: "지난 기록을 불러오지 못했어요. 다시 시도해주세요." }`).
3. 502 응답은 D-004 엔진 502와 동일 UX (재시도 버튼).
4. **데이터 없음(첫 사용자)** 케이스는 502가 아님 — `fetchBuildContext`가 `cold_start: true`로 정상 반환 (`.maybeSingle()` 사용으로 row 0 = `null` 정상 경로).
5. 재시도 횟수는 정확히 1회 — 무한 루프/회복 시도 폭주 방지.

**이유**: 후보 비교:
- A (cold_start=true로 fallback + warnings 노출): UX 우선이나 §4 "반드시 조회" 강제를 약화. "데이터가 없는 케이스"와 "조회 자체 실패"를 같은 상태로 묶음.
- B (즉시 502): 일시 장애에 너무 가혹.
- **C (채택)**: D-004(엔진 1회 재시도) 패턴을 BuildContext 조회에도 적용 — 일관성 + Supabase 일시 장애에 1회 여유 + §4 강제 약화 없음.

**결과**:
- `lib/buildContext.ts:fetchBuildContext`가 throw → 라우트의 try/catch가 1회 재시도 → 두 번째 throw 시 502. 코드 흐름은 `route.ts:103-124`.
- BuildContext에 `source: 'fresh' | 'fallback'` 같은 추가 필드는 도입하지 않음 — `cold_start` 의미가 흐려지지 않음.
- **사용자 결정 시점**: 2026-06-14 (welding-architect 보고서 GA-3 권고 → 사용자 채택 — `_workspace/02b_user_decision_P1T1.md`). 본 ADR은 P1 엔진 코어 사이클 마무리 단계에서 정식 등재.

---

## D-014. 시스템 프롬프트의 TASTE.md 인용은 stage별 원칙 인용

**맥락**: D-009 "TASTE.md를 살아있는 문서로 유지. 새 판단이 나올 때마다 추가"는 *판단 위치*(TASTE.md에 둔다)만 정하고, *전달 방식*(systemPrompt에 TASTE.md를 어떻게 노출할지)은 미명시다. TASTE.md 현재 분량은 §1 맛/식감 축, §2 스텝 분할, §3 핫픽스 우선순위, §4 언어 톤, §5 미정 TODO. 토큰 비용과 헌법 강제 강도의 트레이드오프.

**결정**: `lib/prompt.ts`가 systemPrompt를 빌드할 때 TASTE.md 원칙을 **stage별로 분기 인용**한다:
- `stage="concept"`: TASTE 인용 0 (콘셉트 합의는 도메인 판단 영역 밖).
- `stage="base"`: TASTE 인용 0 (단순 ingredient mapping).
- `stage="taste"`: TASTE.md §1 맛 6축 + 식감 5축 인용.
- `stage="steps"`: TASTE.md §2 스텝 분할 원칙(최대 6스텝, 한 동작+한 판단, 핵심 스텝 1개) 인용.
- `stage="done"`: TASTE.md §3 핫픽스 우선순위 표 인용.
- **모든 stage 공통**: TASTE.md §4 언어 톤 + "원칙에 없는 새 판단은 임의 결정 금지, options/warnings로 사용자에게 묻는다 — 이 판단들이 곧 해자다." 명시.
- TASTE.md §5 미정 항목 임베드 0 — 결정 안 난 영역을 LLM에 흘리지 않음.
- 분기 switch는 `_exhaustive: never` 가드로 Stage 확장 시 컴파일러가 누락 차단.

**이유**: 후보 비교:
- A (전체 임베드): 강제 강도 최대지만 토큰 비용 가장 큼 (~500~800 토큰). taste 단계에서 §2 스텝 분할 원칙은 LLM이 알 필요 없음 → 토큰 낭비.
- **B (채택)**: systemPrompt가 어차피 stage별로 분기되어 있어 추가 분기 비용 0. taste/steps/done 각 단계에 필요한 §만 박음. 토큰 절약 + 강제 강도 유지.
- C (URL 참조 + 핵심만): LLM이 TASTE.md를 못 읽으니 사실상 실효 없음.

**결과**:
- `lib/prompt.ts:renderTasteDoctrine(stage)` + `renderStageTasteClause(stage)`가 SSOT. TASTE.md 본문이 갱신되면 본 함수의 stage별 인용 본문도 함께 갱신(D-009 "살아있는 문서" 정신).
- TASTE.md 본문 갱신 절차: 유케이가 TASTE.md를 수정 → `lib/prompt.ts`의 stage별 인용 본문을 동기화 → welding-inspector가 경계 검증.
- **사용자 결정 시점**: 2026-06-14 (welding-architect 보고서 GA-4 권고 → 사용자 채택 — `_workspace/02b_user_decision_P1T1.md`). 본 ADR은 P1 엔진 코어 사이클 마무리 단계에서 정식 등재.

---

## D-015. 인증 경계 정책 — Authorization Bearer JWT + anon 클라 검증 + service-role 분리

**맥락**: P1 엔진 코어 사이클(`app/api/recipe/route.ts` 본문)에서 인증 흐름이 코드로 박혀 작동 중이나 ADR이 없음. 라우트가 `BuildContext`를 조회하려면 `user_id`가 확정되어야 하고(R4 가드 — service-role 오용 방지), 그 확정 방법(헤더 형식, 토큰 검증 방식, 클라이언트 종류, 실패 분기)이 SSOT 1곳(`route.ts:96-100, 157-196`)에만 존재. D-011이 같은 사이클 안 SSOT 충돌을 조기 검출한 사례처럼, ADR 없는 정책은 P1 후속 사이클(`/api/run` 본문)에서 동일 결정이 또 필요한 표류 위험을 만든다.

**결정**: 본 사이클의 인증 *경계 정책*을 다음 형태로 박는다:
1. **요청 헤더**: `Authorization: Bearer <jwt>`. 토큰은 Supabase anon JWT.
2. **검증 클라이언트**: `supabaseServerAnonClient().auth.getUser(token)`. **anon 클라이언트로만 검증한다** (R4 가드 — service-role 우회 금지).
3. **user_id 추출**: 검증 성공 시 `data.user.id`를 `user_id`로 사용.
4. **401 분기 3종**:
   - 헤더 부재 → 401 `missing_authorization` ("로그인이 필요합니다.")
   - bearer prefix만 있고 토큰 빈 문자열 → 401 `missing_token`
   - 토큰 검증 실패 → 401 `invalid_token` ("세션이 만료됐어요. 다시 로그인 해주세요.")
5. **R4 가드 강제**: `user_id` 확정 *후*에만 `fetchBuildContext`(service-role 사용) 호출. service-role 클라이언트는 사용자 신원 매칭 이전에 호출 금지. `lib/buildContext.ts` 내부의 `.eq("user_id", userId)`로 코드 레벨 강제.
6. **SSOT**: 인증 흐름은 `app/api/recipe/route.ts:authenticateRequest`가 단일 출처. P1 후속 사이클의 `/api/run` 본문도 동일 함수/패턴을 재사용한다(라우트별 재구현 금지).

**이유**:
- **§4 용접 강제 적용**: BuildContext 조회는 §4 "BUILD 시작 시 RuntimeLog + Fingerprint 반드시 조회"의 필수 입력. 사용자 신원 없으면 본인 데이터를 가져올 수 없음 → 인증 경계는 용접 의존성의 일부.
- **R4(service-role 오용) 봉쇄**: T1 architect 보고서에서 R4가 잠재 위험으로 식별됨. 본 ADR로 인증 통과 *전* service-role 호출 0건임을 코드 + ADR 양쪽에서 강제.
- **D-011 패턴 학습**: 코드에 박힌 정책이 ADR로 명료화되지 않으면 같은 사이클 내(또는 후속 사이클에) SSOT 충돌이 발생한다. P1 후속(`/api/run` 본문)에서 같은 결정을 또 NEED_USER_DECISION으로 올리는 분산을 본 ADR로 차단.
- **D-009(임의 결정 금지) 정합**: 인증 정책은 보안 표면이라 임의 결정 시 누적 위험. ADR로 정책 경계를 명시.

**결과**:
- 인증 흐름은 `route.ts:authenticateRequest`가 SSOT. `/api/run` 본문(P1 후속) 진입 시 동일 함수 재사용 — 라우트별 재구현 0건이 welding-inspector의 경계 검증 항목이 된다.
- **명시적 P2 이월** (본 ADR 범위 밖, 별도 ADR/사이클로 분리):
  - **refresh token 만료/갱신 흐름**: 본 사이클은 단발 토큰 검증만 다룸. 토큰 갱신/만료 처리는 별도.
  - **세션 영속** (쿠키 vs 스토리지 정책, SameSite/HttpOnly 등): 본 사이클은 Bearer 헤더만. 쿠키 기반 세션 도입 시 별도 ADR.
  - **RLS 정책과 user_id 매칭의 상세** (테이블별): `0001_init.sql`이 `auth.uid() = user_id` 정책을 전 테이블에 박았으나, anon 클라/service-role의 각 테이블 접근 매트릭스는 별도 ADR.
  - **로그인 UI 흐름**: 앱 라우트, OAuth provider, 콜백 처리, 로그아웃 등은 별도 ADR/사이클.
- **R16(recipe ownership 미검증) 별개 위험**: 본 ADR은 *user_id 확정*까지만 다룸. `body.recipe_id`가 다른 사용자의 레시피라도 `fetchBuildContext`가 `user_id` 매칭으로 null 반환 → cold_start 흐름. 데이터 누수는 없으나 ownership 검증은 별도 ADR(R16 잔존).
- **P1 후속 사이클 인계**: `/api/run` 본문에서 본 ADR의 `authenticateRequest`를 재사용. 인증 통과 후에만 cook_runs INSERT + runtime_logs UPSERT + fingerprints UPSERT 트랜잭션(D-008) 진입.
- **사용자 결정 시점**: 본 ADR은 architect 사전 가드 없이 T3 §5(인증 정책 메모) + T4 §3-A + §9(D-015 후보 표현) 응축으로 작성. doc-taste-scribe가 P1 사이클 마무리 단계(2026-06-15)에 ADR 등재 vs P2 이월을 리더에게 컨설팅 → 리더 판단으로 즉시 등재 결정. 본 결정은 D-009(임의 결정 금지) 정신에 따라 컨설팅 절차를 거쳐 확정됨.
