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

**RecipeState 출처 2개 (2026-06-21 명시화, D-022 등재 동반)**: RecipeState의 *값 출처*는 (a) LLM의 `engineResponse.new_state` 또는 (b) 사용자 직접 수정(클라 mutate). 본 ADR은 "*diff*는 LLM이 아니라 코드"라는 원칙을 정한다 — *상태의 출처*는 두 가지지만 *diff 계산은 여전히 코드*(`splitDiff`)에서 일어난다. 본문 원칙 위반 0.

---

## D-002. 생성은 산출물 카드로, 수정만 diff로

**맥락**: 빌드 중 스텝이 처음 컴파일되면 "스텝 6개 추가 +"처럼 diff로 보여줬더니, 사용자가 21줄짜리 `+` 폭탄을 받아 압도당했다.

**결정**: 이전에 *없던* 필드가 채워지면 → 산출물 카드(예쁜 레시피 카드). 이미 *있던* 값이 바뀌면 → diff. `splitDiff`가 `created`와 `mods`로 분리한다.

**이유**: git도 새 파일에는 +500줄 diff를 안 보여주고 파일을 보여준다. 생성은 diff가 아니다. diff는 "덜 짜게" 같은 *수정* 이후에야 빛난다. 메타포(diff)를 그대로 가져오지 말고 메타포가 풀던 문제(변경 추적)를 가져와야 한다는 일반 원칙의 첫 사례.

**결과**: 빌드 리듬이 "대화 → 작은 산출물 카드 → ... → ✓ 완성 카드 → 이후 짧은 diff"로 자연스러워짐. 수정이 7줄 넘으면 접기(▸ N개 변경).

**사용자 본인 수정 표시 정책 (2026-06-21 명시화, D-022 등재 동반)**: 사용자가 임베드 카드를 *직접 수정*한 경우(D-022)는 modified diff를 *표시하지 않는다*. 자기 행위를 시스템이 다시 알려주는 reminder는 노이즈. LLM 응답(`engineResponse.new_state`)으로 인한 modified만 D-002의 modified diff 분기를 탄다. `splitDiff` 호출은 *prev → LLM new_state* 비교만으로 충분 — 사용자 mutation은 그 사이에 `prev`를 갱신할 뿐.

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

---

## D-016. Cook 핫픽스 카테고리 — TASTE §3 4종 + 기타 1종

**맥락**: D-006은 핫픽스가 RecipeState를 수정하지 않고 `CookRun.step_events`에만 기록된다고 정한다. 그러나 Cook UI가 어떤 입력 단위로 핫픽스를 받는지는 미정이었다. 자유 텍스트만 받으면 RuntimeLog 집계가 자연어 처리에 기대게 되고, 카테고리만 강제하면 조리 중의 예외 상황을 놓친다.

**결정**: `StepEvent.type="hotfix"`는 `category` 필드를 필수로 가진다. 카테고리는 `salty | bland | burnt | watery | other` 5종이다.

- `salty`: 너무 짜다
- `bland`: 싱겁다
- `burnt`: 탄다
- `watery`: 묽다
- `other`: 기타, 자유 텍스트 보조

**이유**: 앞의 4종은 TASTE.md §3 핫픽스 우선순위 표와 1:1로 맞는다. `other`는 새 취향 판단 후보를 수집하는 안전판이다. 카테고리 칩 + optional note 조합은 조리 중 손이 바쁜 상황과 이후 학습 집계를 동시에 만족한다.

**결과**:
- `lib/schema.ts`의 `StepEventSchema`는 discriminated union이 되었고, `hotfix` 변종만 `category`를 가진다.
- `components/CookMode.tsx`는 5종 칩으로 핫픽스를 기록한다.
- `lib/runtime.ts`는 카테고리별 문장으로 `known_issues`를 만든다.

---

## D-017. Fingerprint confidence — 관찰 N≥3 + 비율 ≥0.6

**맥락**: `TraitSchema.confidence`는 0~1 값을 요구하지만, RuntimeLog에서 사람별 trait을 어느 시점에 생성할지 기준이 없었다. TASTE.md §5의 "Fingerprint trait의 임계 confidence" 미정 항목이다.

**결정**: MVP의 Fingerprint trait 생성 기준은 다음과 같다.

1. 같은 trait 후보에 해당하는 관찰이 3회 이상이어야 한다.
2. `관찰 수 / 전체 조리 횟수`가 0.6 이상이어야 한다.
3. `confidence`는 위 비율값을 소수 둘째 자리로 반올림한 값이다.

**이유**: 1~2회 관찰만으로 "이 사람의 부엌은 이렇다"고 단정하지 않기 위함이다. 동시에 MVP에서는 베이즈 보정이나 사용자 확인 플로우를 넣지 않고, UI에서 설명 가능한 단순 규칙을 우선한다.

**결과**:
- `lib/fingerprint.ts`의 `recomputeFingerprint`가 이 기준을 적용한다.
- 현재 구현 trait 후보는 `burnt_prone`, `salty_prone`, `bland_prone`, `watery_prone`이다.
- 향후 더 정교한 confidence 공식은 본 ADR을 SUPERSEDED 처리하고 교체한다.

---

## D-018. Cook 타이머 권한 UX — 알림 요청 + Wake Lock fallback

**맥락**: Cook Mode 타이머는 조리 중 손이 바쁜 상황을 전제로 한다. 브라우저 Notification 권한은 거부될 수 있고, Wake Lock API도 브라우저별 지원 차이가 있다.

**결정**:
1. 타이머 시작 시 Notification 권한을 요청한다.
2. 권한이 허용되면 타이머 완료 시 브라우저 알림을 보낸다.
3. Cook 화면 진입 시 Screen Wake Lock을 요청한다.
4. Wake Lock 미지원 또는 거부 시 조리를 막지 않고 인페이지 안내를 표시한다.

**이유**: 권한 게이트로 Cook 자체를 막으면 UX가 무겁다. 반대로 조용히 실패하면 사용자가 타이머를 놓친다. 요청 + 명시 안내 조합이 가장 정직하고, MVP 범위에서 외부 NoSleep류 의존성을 추가하지 않는다.

**결과**:
- `components/CookMode.tsx`가 Notification과 Wake Lock을 처리한다.
- Wake Lock 미지원 브라우저에서는 화면 잠금 시간을 늘리라는 안내를 표시한다.

---

## D-019. Fingerprint 클라 노출 SSOT — GET /api/fingerprint

**맥락**: P1 마무리 사이클(FingerprintCard 신설)에서 사용자에게 자신의 부엌 지문(Fingerprint)을 보여주기 위해 데이터 페치 경로가 필요했다. 후보 3종 — (A) 신규 GET 라우트, (B) `/api/recipe` 또는 `/api/run` 응답 확장, (C) 클라가 `@supabase/supabase-js` anon 으로 직접 조회 — 중 결정 공백.

**결정**: Fingerprint 의 클라 노출은 **신규 `GET /api/fingerprint`** 단일 경로를 SSOT 로 한다.
1. 라우트: `app/api/fingerprint/route.ts` — `enforceRateLimit("fingerprint")` → `authenticateRequest` (D-015 SSOT 재사용) → `fetchFingerprintForUser` (D-013 패턴 1회 재시도 후 502) → `200 { fingerprint: Fingerprint | null }`.
2. 페치 헬퍼: `lib/fingerprintStore.ts:fetchFingerprintForUser(userId)` — service-role 단건 조회 + `FingerprintSchema.parse` jsonb 안전화.
3. **금지**: 클라(`components/*`, `app/page.tsx`)가 `@supabase/supabase-js` 로 `fingerprints` 테이블을 직접 조회하는 것.
4. **분리 SSOT**: `lib/buildContext.ts` 의 `fingerprints` 조회와 본 헬퍼는 *목적 분리* 2개 SSOT. 전자는 BUILD 입력 결합 조회(runtime_logs + fingerprints, 실패는 502, 데이터 없음은 cold_start=true), 후자는 단건 표시 조회(실패는 502, 데이터 없음은 null). 컨텍스트가 달라 중복이 아니다.

**이유**: 후보 비교:
- **A (채택)**: D-015 인증 SSOT / D-011 rate limit / D-013 1회 재시도 패턴을 그대로 재사용. ADR 표류 0건. 라우트별 정책 명료. 향후 응답 shape 진화도 한 곳만 갱신.
- B (응답 확장): SSOT 어긋남 — BUILD/COOK 액션과 표시 의도가 같은 응답에 섞임. 카드만 보고 싶을 때 호출 경로 없음.
- C (클라 직접): D-015 anon 검증을 클라에 분산 + RLS 단독 의존. 클라 번들에 anon URL/key 노출 필요. **헌법 약화**.

**결과**:
- `lib/fingerprintStore.ts` 신설. `app/api/fingerprint/route.ts` 신설.
- welding-inspector(FP.T4)가 `Grep("supabase|@supabase", components/**/*.tsx + app/**/*.tsx)` 로 클라 직접 조회 0건 검증. 매치 3건 모두 서버 라우트(`api/recipe`, `api/run`, `api/fingerprint`). SSOT 강제 통과.
- `components/FingerprintCard.tsx` 가 `/api/fingerprint` 만 호출. Postmortem 저장 직후 `refreshNonce++` 회로로 카드 재페치 → Line 4 → Line 6(신설 가시화 가지) 자동 갱신.
- **사용자 결정 시점**: 2026-06-20 (welding-architect 보고서 GFP-1 권고 A → 사용자 채택 — `_workspace/02b_user_decision_FPT1.md`).

---

## D-020. Fingerprint trait confidence 노출 형식 — 백분율

**맥락**: `TraitSchema.confidence` 는 0~1 실수다(D-017 단순 비율 공식, 0.6~1.0 범위에서 의미). FingerprintCard 가 사용자에게 이 값을 어떻게 표시할지의 결정 공백. 후보 4종 — (A) 정확한 수치 "0.75", (B) 백분율 "75%", (C) 명목 등급 3단("강함/중간/약함"), (D) 백분율 + 게이지 바.

**결정**: Fingerprint trait 의 confidence 는 **백분율**(`Math.round(confidence * 100) + "%"`)로 표시한다.

**이유**: 후보 비교:
- A (수치 0.75): 사용자가 *과학적 정확성* 기대 → "왜 50% 미만은 안 보이지?" 식 표현 함정. D-017 단순 규칙과 어긋나는 인상.
- **B (채택)**: D-017 단순 비율 공식과 자연 일치. 백분율은 일반 사용자에게 가장 직관적. 추가 컷오프 결정 없음 → 결정 비용 최소.
- C (3단 명목): 함정 최소. 단 3단 컷오프(0.6~0.75 / 0.75~0.9 / 0.9~1.0?) 자체가 또 TASTE 판단 필요 → 결정 비용 증가.
- D (백분율 + 게이지 바): B에 시각적 강도 추가. 단 confidence 0.6 이 게이지 60% 로 시작하는 게 어색(60% 미만은 trait 미생성이라 *빈 영역*이 의미 없음).

**결과**:
- `components/FingerprintCard.tsx:renderReady` 에서 `Math.round(trait.confidence * 100) + "%"` 형식.
- TASTE.md §5 항목 등재 — "Fingerprint trait confidence 노출은 백분율" 신규 원칙 (D-009 살아있는 문서 정신).
- D-017 (계산 공식) 변경 시 본 ADR 자동 갱신 의무 없음 — 본 ADR 은 *표시 형식* 만 다룬다. 단 D-017 SUPERSEDED 처리 시 표시 형식 적합성 재검토 권고.
- **사용자 결정 시점**: 2026-06-20 (welding-architect 보고서 GFP-3 권고 B → 사용자 채택 — `_workspace/02b_user_decision_FPT1.md`).

---

## D-021. BUILD UX 표면 — 채팅 + 옵션 칩 + 임베드 카드/게이지

**맥락**: 2026-06-18 "키친 IDE 리디자인" 사이클이 `terminal-bar` / `compile-grid` / `prompt-surface` / `compiler-output` / `state-inspector` / `output-line` / `artifact-list` / `diff-kind` 같은 *코딩 메타포의 문법 자체*를 화면에 박았다. 사용자(유케이)가 2026-06-21에 v3 prototype 스크린샷을 다시 제시하며 "다른 앱들은 통째로 던지지만 우리는 *대화하며* 만들어 나간다"는 핵심 차별점을 재확인. 직전 리디자인이 §1.3·D-002·D-003의 정신을 *문법으로만* 적용했다는 평가가 architect 사전 가드에서 확정됨 (D-002 함정의 거꾸로 사례 — *메타포의 문법*은 가져왔지만 *그 문법이 풀던 문제*("페어처럼 한 줄씩 합의하며 짓는다")는 UX에서 사라짐).

**결정**: BUILD 화면(`components/BuildMode.tsx`)의 UX 표면은 다음 4-요소 패턴을 SSOT로 한다:
1. **채팅 인터페이스**: pair-chef ↔ 사용자 *대화 버블*. cold-start 인사는 클라 상수(`COLD_START_GREETING`)로 박힘 — 백엔드 messages 배열에는 들어가지 않아 `cold_start=true` 판정에 영향 없음(D-008 정합).
2. **5-stage progress 시각화**: `concept → base → taste → steps → done` 가로 진행 표시기. 현재 stage 기준 done/active/pending 3 status. 외층 `pipeline-rail`(BUILD/COOK/POSTMORTEM/LEARN)과 *층위 분리* — 외층=모드, 내층=BUILD 스테이지(GBR-2=A 결정).
3. **임베드 산출물/게이지/스텝/수정 칩**: pair-chef 최신 메시지에 *임베드*. D-002 분리 유지 — 생성(없던 필드 채워짐)=`<ArtifactCard>`/`<GaugesCard>`/`<StepsCard>`, 수정(있던 값 변경)=`<ModifiedChips>`. `splitDiff(prev, next)` 분기 그대로.
4. **옵션 칩**: `engineResponse.options` 1~3개를 칩으로 노출. 클릭=user 메시지로 즉시 전송. 자유 텍스트 입력과 *동일 경로*(`submit(text?)`로 인자 합쳐서 처리).

추가 결정:
- **입력 placeholder**: "답하거나, 칩을 탭하거나, '알아서 다 해줘'" — D-003a 시그널만 박음. *실제* 즉시 빌드 분기는 ROADMAP P2.
- **디자인 톤**: 라이트 페이퍼 톤 안에 대화 패턴 복원(GBR-1=B 결정). 헤더/Inspector/Cook/Postmortem과 시각 통일. v3 다크/황색 톤 전체 통일은 별도 사이클로 분리.
- **`Recipe compiler` → `레시피를 같이 만들어 봐`**: 헤더 카피 일반 사용자 친화로 교체. 코딩 메타포(compiler/stdin/stdout) 표면 제거. badge `stage::{stage}`는 헌법 §2 매핑(plan mode 점진 커밋의 *상태 표시*)에 기능적이라 보존.
- **임베드는 최신 assistant 메시지 1개에만**: `lastAssistantIdx` 분기로 과거 메시지의 카드/게이지 누적 차단 (R-BR-1).

**SUPERSEDED**: 2026-06-18 키친 IDE 리디자인 패턴(compile-bench/compile-grid/prompt-surface/compiler-output/state-inspector/prompt-editor/output-line/artifact-list/diff-kind/diff-list). 본 ADR 채택과 함께 BuildMode가 더 이상 사용하지 않음. CSS dead 정리는 별도 사이클로 위임 (M-BR-1).

**이유**:
- **§1.3 한 턴 한 단계의 *체감 복원***: stage progress + 대화 흐름이 사용자가 *어디까지 왔는지*를 항상 보이게 한다. 직전 IDE 풍은 "단계"가 badge 한 줄로만 표현돼 §1.3 정신이 약화됐다.
- **§1.2 답변이 아니라 diff의 *정신 회복***: 채팅 안 임베드 카드/게이지가 *변경의 시각화*. *문법*(diff 기호)을 안 가져왔지만 *문제*(변경 추적)는 더 강하게 해결.
- **D-002 메타포 함정의 *거꾸로 사례 학습***: 직전 사이클이 "코딩 문법을 화면에 박으면 *코딩 같은 UX*가 된다"는 *문법 동일시 오류*. 본 ADR은 "메타포가 풀던 *문제*를 가져온다"는 D-002 일반 원칙을 BUILD UI 전체에 적용.
- **§2 메타포 매핑의 *제대로 된 적용***: 코드베이스↔RecipeState, plan mode↔점진 빌드 파이프라인, git diff↔수정만 diff(생성은 산출물 카드) — 모두 *문제 해결 패턴*을 가져온 것이지 *문법 표면*을 가져온 게 아니다.

**결과**:
- `components/BuildMode.tsx`가 8 하위 컴포넌트(`ChatBubble`/`LatestEmbeds`/`ArtifactCard`/`GaugesCard`/`GaugeGroup`/`StepsCard`/`ModifiedChips`/`Warnings`)로 분해. 단일 파일이나 SSOT 1곳.
- `app/globals.css`에 신규 40+ 클래스 추가 (build-bench, stage-progress, chat-scroll, chat-bubble, bubble-*, artifact-card, gauges-card, steps-card, modified-chips, option-chips, warning-card, build-input 외). 직전 IDE 풍 CSS 12종은 dead — 별도 정리 사이클로 위임.
- `/api/recipe` 요청/응답 계약 변경 0. `splitDiff` 호출 인터페이스 변경 0. `lib/schema.ts` 변경 0. CookMode/Postmortem/FingerprintCard 변경 0.
- welding-inspector(BR.T3) PASS 결함 0건. Line 1(BUILD→Context 주입) + 경계 B(API↔클라) 회귀 0. typecheck/test 그린.
- **사용자 결정 시점**: 2026-06-21 (welding-architect 보고서 GBR-1=B(라이트 톤) / GBR-2=A(stage progress 패널 내부) → 사용자 채택 — `_workspace/02b_user_decision_BRT1.md`).
- **명시적 P2 이월**:
  - D-003a 즉시 빌드 실제 분기 로직(현재 UI 시그널만)
  - 버전 타임라인 UI (v3 스크린샷의 `state (3/4)` 드롭다운)
  - v3 다크 톤 전체 통일 검토 (Cook/Postmortem/Inspector 동시 작업 필요)
  - dead CSS 12종 정리

**임베드의 의미 확장 (2026-06-21 명시화, D-022 등재 동반)**: 4-요소 패턴 중 *임베드*는 본 ADR 채택 시 *읽기 전용*으로 정의됐다. D-022 채택 후 임베드는 *인터랙티브*로 확장 — ingredients 칩 ✕ / tools 칩 ✕ / gauge +/- 버튼. 단 *어떤 임베드*가 인터랙티브한지는 GAD-2 결정(본 사이클은 ingredients/tools/taste/texture 4개)에 따른다. 비편집 필드(name/concept/steps/time_min)는 *그대로 읽기 전용*. 사용자 mutate 흐름은 D-022가 SSOT.

**임베드의 층위 확장 (2026-06-21 추가 명시화, D-024/D-025 등재 동반)**: 임베드 영역에 *상태 메타* 층위가 신설된다. 최상단에 `<StagePlanCard>`(D-024, 합의 항목 plan) + `<ContextMetaCard>`(D-025, 응답이 본 컨텍스트), 그 아래가 *산출물 메타* — `<ArtifactCard>` / `<GaugesCard>` / `<StepsCard>` / `<ModifiedChips>` / `<Warnings>`. 옵션 칩은 그 다음. 즉 4-요소 패턴의 *임베드*는 두 층위로 분리: (1) 상태 메타 — plan/context (2) 산출물 메타 — recipe + 변경 + 경고. 옵션 칩은 응답 직접 작용.

**임베드의 공간 분리 (2026-06-21 추가 명시화, D-027 등재 동반)**: 임베드의 *층위*는 유지하되 *공간 위치*가 두 패널로 분리된다. 옵션 칩 + Warnings는 좌측 *최신 chef 버블 안* 인라인. 산출물 + 메타(plan/context) + ModifiedChips는 우측 sticky `<RecipeCanvas>`. 즉 *대화는 흐름*, *캔버스는 결과*. 이 분리가 페어 코딩 IDE 메타포(우측 코드 패널)와 정합한다. 메타는 RecipeCanvas 하단 *메타 블록* mini 변종 카드로 압축 노출. 자세한 SSOT는 D-027.

---

## D-022. 사용자 직접 수정 — RecipeState의 두 번째 출처 (페어 프로그래밍 정신)

**맥락**: D-001은 "LLM이 new_state만 반환, 코드가 diff 계산"을 명시했고, D-021은 BUILD UX = 채팅+stage+임베드+옵션 4-요소 패턴을 정했다. 두 ADR 모두 *사용자가 임베드를 직접 수정*하는 경우를 미명시. 페어 프로그래밍의 본질은 *개발자가 한 줄 손대면 AI가 그 결과를 인지하고 다음 단계 합의*하는 양방향 흐름. 현재 BuildMode는 LLM 단방향(읽기 전용 임베드)이라 *페어 감각*이 약함. 사용자(유케이)가 2026-06-21에 "진짜 바이브 코딩처럼 작동하는 *수준 높은 설계*로의 고도화"를 요청.

**결정**: RecipeState의 *값 출처*는 두 가지로 한다.
1. **(a) LLM 출처**: `engineResponse.new_state` → `splitDiff(prev, new_state)` → 클라 mutate. *기존 흐름 그대로*.
2. **(b) 사용자 직접 수정 출처**: 임베드 카드의 인터랙티브 컨트롤 클릭으로 직접 mutate.

사용자 수정의 *흐름* (GAD-1=B+ 채택):
1. **클라 즉시 시각 mutate** — UI 즉각 반응 (busy 중에는 잠금, R-AD-3 race 가드)
2. **자동 user 메시지 생성** — `describeMutation(m)`이 TASTE §4 톤 메시지 본문 생성, `messages` 배열에 user 메시지 push. *fetch는 안 함*.
3. **사용자가 다음 turn 전송 시 LLM이 공식 처리** — `submit()`이 `messages.slice(-8)` wire에 mutation 메시지 자동 포함. LLM이 변경을 인지하고 *재조정된* new_state 반환 가능 (예: 재료 줄면 시간도 줄임).

본 사이클 *편집 가능 필드 범위* (GAD-2=A):
- `ingredients` 칩 ✕ (삭제), `tools` 칩 ✕ (삭제), `taste` +/- (0~10 정수 step), `texture` +/- (0~10 정수 step)
- *비편집*: name / concept / steps / time_min — 다음 고도화 사이클로 위임

추가 규약:
- **사용자 본인 수정은 modified diff 미표시** (GAD-6, D-002 결과 섹션 보강 한 줄). LLM 응답으로 인한 modified만 표시.
- **stage 진행 미트리거** (GAD-7). LLM 응답만이 `engineResponse.stage`를 통해 stage 변경.
- **모든 사용자 수정은 user 메시지 흔적** — `messages` 히스토리만 보면 *누가 무엇을 바꿨는지* 재구성 가능. D-008 용접 정신 정합.

자동 user 메시지 표현 (TASTE.md §6 등재):
- 재료 삭제: `"재료에서 '계란' 뺐어"`
- 도구 삭제: `"'팬' 도구는 빼고 가자"`
- 게이지 변경: `"매운맛 5 → 7"` (간결 형식)

**이유**:
- **§1.3 합의 정신 *복원***: 사용자 수정도 *한 turn*으로 본다 — 페어 프로그래밍의 자연 흐름. 직전 D-021 시점까지는 *대화*만 한 turn이었으나, 본 ADR로 *사용자 행위*도 한 turn에 합류.
- **D-001 위반 0**: LLM은 여전히 new_state만 반환. *diff 계산*은 여전히 코드 (`splitDiff`). RecipeState 출처만 (a)/(b) 두 가지.
- **D-002 정합**: 생성=카드, 수정=diff 원칙 그대로 — 단 *수정*의 *출처*가 (a) LLM이면 diff 표시, (b) 사용자면 미표시 (자기 행위 reminder 노이즈).
- **TASTE §4 톤 정합**: 자동 메시지 표현이 평어 + 단호 없음 + 칭찬 0. "재료에서 X 뺐어" 같은 자연 표현.
- **B+ 채택의 트레이드오프 이해**: A(직접 패치, 메시지 없음)는 LLM이 *왜 변경됐는지* 모름 → 합의 정신 약함. C(메시지만, 즉시 mutate 없음)는 UI 반응 느림. B+가 *즉각 반응* + *합의 정신* 동시 만족.

**결과**:
- `components/BuildMode.tsx`에 `Mutation` 타입 + `mutateRecipe`/`describeMutation`/`applyMutation` 추가. `ArtifactCard`에 `chip-remove` 버튼, `GaugesCard`에 `gauge-buttons` +/- 컨트롤.
- `app/globals.css`에 신규 클래스: `.chip-text`, `.chip-remove`, `.tool-chip`, `.tools-line`, `.gauge-buttons`, `.gauge-btn`. `.artifact-chip` / `.gauge-row`의 grid 조정.
- `/api/recipe` 요청/응답 계약 변경 0. `RequestBodySchema` 변경 0 — mutation 메시지는 일반 user 메시지로 통과.
- D-001 / D-002 / D-021 *결과 섹션*에 사용자 mutate 케이스 한 줄씩 보강. 본문 무수정.
- TASTE.md §6 mutation 표현 형식 등재 (D-009 살아있는 문서 정신).
- **명시적 P2 이월**:
  - 비편집 필드(name/concept/steps/time_min) 편집 도입
  - 양 변경(`ingredients[i].amount` 수정) — 본 사이클은 *삭제만*
  - 도구 추가 (자유 입력은 가능하나 직접 추가 UI 없음)
  - mutation 메시지 시그널 강화 (예: `[user-edit]` prefix로 LLM이 구분 처리)
  - 다중 undo (현재 1단계만 — D-023)
- **사용자 결정 시점**: 2026-06-21 (welding-architect 보고서 GAD-1=B+ / GAD-2=A → 사용자 채택 — `_workspace/02b_user_decision_ADT1.md`).

---

## D-023. 에디트 히스토리 — 클라 messages 무한 누적 + 1단계 undo

**맥락**: ENGINE.md §3과 RequestBodySchema는 *최근 8턴*만 백엔드로 보낸다 (토큰 폭주 방지). 클라 UI도 이를 따라 8턴만 보이면 *이전 합의*를 사용자가 확인 못 한다. 페어 프로그래밍의 git 메타포(점진 커밋 + 체크아웃)가 약해진다. 또 사용자가 *방금 한 변경*을 *되돌릴 수 없으면* 자신감 있는 실험이 막힌다. ROADMAP P2 `recipe_versions` 영속 저장은 인증 사이클 동반이라 *클라 메모리 내* 1단계 undo가 본 사이클의 최소 강제 지점.

**결정**:
1. **클라 messages 무한 누적** — `useState<Message[]>`가 모든 메시지 보존. slice 안 함.
2. **백엔드 호출은 여전히 `messages.slice(-8)`** — ENGINE.md §3 / RequestBodySchema.max(8) 정합. 클라가 wire 직전에 slice.
3. **UI 표시**:
   - 초기 진입: 최근 `VISIBLE_ASSISTANT_LIMIT = 4` assistant turns + 사이 user 메시지만 표시 (R-AD-1 화면 과다 누적 방지)
   - "더 이전 보기 (N개 숨김)" 펼침 버튼 상단 — 누른 후 전체 messages 표시
   - "최근만 보기" 토글로 다시 접기
4. **직전 되돌리기 (1단계)**:
   - `prevSnapshot: Snapshot | null` — `{ recipeState, lastDiff, lastResponse, messages, stage }` 일괄 캡처
   - 스냅샷 저장 트리거: ① 사용자 mutation 직전 ② LLM 호출 직전
   - "↶ 직전 취소" 버튼 입력 행 좌측 — `prevSnapshot` 있을 때만 활성
   - 1단계만 — `prevSnapshot`이 set되면 그 이전은 잃음 (다중 undo는 P2)
5. **영속 X** — 세션 새로고침 시 초기화. 영속은 ROADMAP P2 `recipe_versions` 사이클.

**이유**:
- **체크아웃 메타포의 *최소 작동* 강제**: git의 *완전한* 점진 커밋·체크아웃은 영속이 필요. 본 사이클은 *세션 내* 1단계 undo만으로도 페어 감각의 *자신감 있는 실험* 가능 — 페어 프로그래밍 핵심.
- **D-007 정합**: 영속(localStorage 등)은 본 사이클 사용 0. RuntimeLog/Fingerprint 같은 *해자 자산*은 Supabase 영속 유지. 클라 메모리 내 임시 history는 *세션 단위*라 해자 정의에 영향 0.
- **백엔드 무손상**: messages.slice(-8) 정책 유지 — ENGINE.md §3 / RequestBodySchema 변경 0.

**결과**:
- `BuildMode`에 `historyExpanded` / `prevSnapshot` state 추가. `visibleMessages` useMemo로 4-turn 윈도우 계산.
- `applyMutation` / `submit` / `loadFixture` 모두 `setPrevSnapshot(takeSnapshot())` 호출.
- `undoLast()` 함수로 일괄 복원.
- 신규 CSS 클래스 `.history-toggle`.
- **명시적 P2 이월**:
  - 다중 undo (현재 1단계만)
  - 영속 (`recipe_versions` 인증 사이클 동반)
  - 버전 타임라인 UI (`state (3/4)` 드롭다운, v3 스크린샷 패턴) — D-021 이미 P2 이월
- **사용자 결정 시점**: 2026-06-21 (architect 권고 그대로 채택 — `_workspace/02b_user_decision_ADT1.md`).

---

## D-024. Plan 가시화 — stage별 필수/선택 필드 SSOT

**맥락**: D-003은 *한 턴 한 단계* 점진 빌드를 정한다. STAGES 5단계(concept→base→taste→steps→done)는 코드에 있으나, *각 stage에서 어떤 필드를 합의해야 하는지* 명세가 없었다. lib/prompt.ts는 stage별 TASTE 분기(D-014)만 다루고, 필드 매핑은 *암묵*. 사용자가 *어디까지 합의했는지*를 UI에서 못 본다 → 페어 프로그래밍의 plan 패널 메타포 부재.

**결정**: stage별 *필수/선택 필드 명세*를 **`lib/stagePlan.ts`** 단일 모듈에 SSOT로 둔다.

1. **타입 정의**: `StagePlan = { stage, required: RecipeField[], optional: RecipeField[] }`. `RecipeField = keyof RecipeState` — 컴파일러가 schema 변경 시 본 모듈 강제 갱신.
2. **STAGE_PLANS 5 stage**:
   - `concept`: required `[name, concept]`
   - `base`: required `[ingredients]`, optional `[tools, time_min]`
   - `taste`: required `[taste]`, optional `[texture]`
   - `steps`: required `[steps]`
   - `done`: required *full 8필드*
3. **isFieldFilled**: `recipeState[field] !== undefined`로 확정 판정. 배열은 `length > 0`. 부분 채움(taste 6축 일부)은 *전체 객체 존재*로 확정 — 부분 시각화는 다음 사이클.
4. **FIELD_LABELS**: 사용자 친화 한글 라벨 (`Record<RecipeField, string>` 누락 시 컴파일 에러).
5. **UI 적용**: `<StagePlanCard>`가 임베드 *최상단*에 위치. required → ✓/○, optional → 동일 + "선택" 배지.
6. **금지**: lib/prompt.ts나 라우트가 *필드 매핑 재정의* 금지. 본 모듈이 단일 출처.

**이유**:
- **§1.3의 *시각화***: 사용자가 *어디까지 합의했고 어디가 남았는지* 항상 본다 — Claude Code TaskList 패턴.
- **D-014와 *목적 분리 SSOT***: lib/prompt.ts는 *시스템 프롬프트의 TASTE 인용*, lib/stagePlan.ts는 *UI plan 정의*. 같은 stage 개념을 서로 다른 목적으로 활용 — 중복이 아닌 분리.
- **schema 결합 강제**: `keyof RecipeState`로 lib/schema 변경 시 컴파일러가 본 모듈 강제 갱신. SSOT 표류 차단.

**결과**:
- `lib/stagePlan.ts` 신설 (47 라인, server-only 아님 — 클라 자유 import).
- `components/BuildMode.tsx`에 `<StagePlanCard>` + `<PlanRow>` 추가. 임베드 최상단에 배치.
- `app/globals.css`에 신규 클래스 11종(`.plan-card`, `.plan-list`, `.plan-row`, `.plan-marker`, `.plan-label`, `.plan-optional`, `.plan-filled`, `.plan-empty`, `.plan-head`, `.plan-title`, `.plan-stage`).
- **명시적 비범위**:
  - 부분 채움(taste 6축 일부) `partial` status — 다음 사이클
  - stage 자체를 사용자가 *건너뛰는* UI — D-003 정신과 충돌 가능, 본 사이클 배제
- **사용자 결정 시점**: 2026-06-21 (architect 권고 자동 채택 — `_workspace/02_welding_review_PCT1.md`).

---

## D-025. Context 투명성 — /api/recipe 응답 wrapper에 context_used 메타

**맥락**: D-007(Fingerprint MVP 필수) + D-008(용접) + D-013(BuildContext 조회)로 *해자 자산*(known_issues, fingerprint traits)이 백엔드에 쌓이고 LLM 시스템 프롬프트에 주입된다. 그러나 *사용자는* 왜 LLM이 이 응답을 만들었는지 모른다 — 해자 가치의 *환원* 부재. FingerprintCard(D-019)가 사이드바에 trait 노출이지만, *이번 응답에 어떤 trait이 영향*인지는 보이지 않음.

**결정**: `/api/recipe` 200 응답 wrapper에 **`context_used`** 메타 필드 추가. *서버가 채움*. LLM 응답 contract (`EngineResponseSchema`) 변경 0.

응답 형식:
```ts
// 200 응답
{
  engineResponse: EngineResponse,                  // 기존 (D-001 무변)
  parsedAt: string,                                 // 기존
  context_used: {                                   // 신규
    cold_start: boolean,
    known_issues_count: number,
    traits_applied: Array<{ key: string; label: string; confidence: number }>,
  }
}
```

UI 적용 (D-021 임베드 확장):
- `<ContextMetaCard>`가 임베드 *최상단*에 위치(StagePlanCard 다음). 헤더 "이 응답이 참고한 것".
- cold_start 또는 모두 빈 경우 → empty 안내 (TASTE §4 친구 톤 — "이번이 첫 시작 — 학습된 컨텍스트 없음 (맹탕 모드)" / "아직 뚜렷한 컨텍스트 없음 — 기록이 쌓이는 중").
- 그 외: known_issues_count + traits_applied 칩 (label + confidence 백분율, D-020 정합).

**이유**:
- **D-001 무손상**: LLM이 자기가 본 컨텍스트를 *생성하지 않는다*. 서버가 *이미 들고 있는* `buildContext` 정보 변환 노출만. EngineResponseSchema 변경 0.
- **D-007 가치 *환원***: 해자 자산이 *어떻게 사용됐는지* 사용자에 보임. FingerprintCard와 보완 — 사이드바 = *내 부엌 지문 전체*, ContextMetaCard = *이번 응답에 적용된 것*.
- **D-013 패턴 정합**: BuildContext 조회는 [4]에서 이미 완료. [5]에서 *부수 효과 0*으로 노출만. 1회 재시도 흐름 무영향.
- **backward-compatible**: optional 필드 추가. 과거 클라(미사용)는 무시. 신규 클라는 *없을 가능성* 대비 (`context_used?: ContextUsed`).

**결과**:
- `app/api/recipe/route.ts`의 200 응답 객체 5줄 추가. 부수 효과 0.
- `components/BuildMode.tsx`에 `ContextUsed` 타입 + `lastContext` state + `<ContextMetaCard>` 추가. Snapshot/undo도 `lastContext` 포함.
- `app/globals.css`에 신규 클래스 9종(`.context-meta-card`, `.meta-head`, `.meta-title`, `.meta-empty`, `.meta-rows`, `.meta-row`, `.meta-label`, `.meta-val`, `.meta-trait-chips`, `.meta-trait-chip`).
- **명시적 비범위**:
  - trait label *완곡 표현* — 본 사이클 그대로 노출, TASTE §6 후속에서 검토
  - LLM 응답 안 *자연어 hint* — 시스템 프롬프트 변경 필요, 본 사이클은 데이터 메타만
  - context_used를 *cook/postmortem 응답*에도 노출 — 본 사이클은 BUILD만
- **사용자 결정 시점**: 2026-06-21 (architect 권고 자동 채택 — `_workspace/02_welding_review_PCT1.md`).

---

## D-026. 디자인 시스템 SSOT — 색 5종 + 폰트 3종 + 마이크로 요소

**맥락**: 2026-06-21 사용자가 디자인 참조 스크린샷 3종(`20260621_135215_0001` / `135331_0002` / `135426_0003`)을 제시. 0002에 *색 5종 + 폰트 3종*이 명시적 디자인 시스템으로 정리돼 있음. TASTE §6은 *잠정* 상태로 "라이트 페이퍼 + 황색 강조"만 정의했고, 폰트는 시스템 폰트("Segoe UI", "Aptos")만 사용. 디자인 시스템이 *명문화*되지 않으면 컴포넌트마다 임의 hex가 박힐 위험 — D-009(임의 결정 금지) 약화.

**결정**: `app/globals.css :root` 변수가 디자인 시스템 SSOT. 모든 컴포넌트는 *변수만* 참고, 하드코드 hex 금지.

### 색 토큰 (5 core + 보조)
- `--paper` `#f4ead7` — 메인 배경 (스크린샷 베이지)
- `--paper-soft` `#fcf3e4` — 카드 / 패널 배경
- `--ink` `#1a1a1a` — 강조 텍스트, 사용자 칩 배경 (스크린샷 검정)
- `--heat` `#d36b2c` — 주황 액센트, 원형 전송 버튼
- `--gold` `#b9872c` — 황색 보조 (인터랙티브 강조)
- **신규** `--accent-green` `#2a6d57` — `live` / `자동 저장됨` 인디케이터
- **신규** `--user-chip-bg` = `var(--ink)`, `--user-chip-fg` = `#ffffff`

기존 토큰(`--line` / `--line-strong` / `--muted` / `--run` 등)은 유지 — 보조 색.

### 폰트 토큰 (3종 chain)
- `--font-body`: Pretendard chain — 본문/UI
- `--font-display`: Newsreader chain — 레시피 제목, h1/h2
- `--font-mono`: JetBrains Mono chain — 메타/eyebrow/스테이지 라벨

등록 방식:
- **Newsreader / JetBrains Mono**: `next/font/google` (`app/layout.tsx`에서 CSS 변수 `--font-newsreader` / `--font-jetbrains-mono` 자동 노출).
- **Pretendard**: Google Fonts 미등록. 본 사이클은 *시스템 fallback chain* — Pretendard 설치된 환경은 자동 적용, 미설치는 `-apple-system` / `Apple SD Gothic Neo` / `Noto Sans KR` 자연 fallback. 정식 next/font/local 등록은 후속 사이클.

호환 별칭: 기존 코드의 `var(--mono)`/`var(--serif)`는 새 변수로 매핑 — 회귀 0.

### 마이크로 요소 규칙
- **사용자 칩** (`.bubble-user .bubble-body`): `var(--user-chip-bg)` 배경 + `var(--user-chip-fg)` 글자 + 오른쪽 정렬
- **pair-chef 아바타** (`.chef-avatar`): 28px 원, `var(--paper-soft)` 배경 + `var(--line)` 테두리 + "셰" 한 글자 (`var(--font-display)`)
- **원형 전송 버튼** (`.send-btn`): 36px round, `var(--heat)` 배경 + 흰 ↑ 아이콘
- **보조 액션 시그널** (`.aux-chip`): 좌하단 row, `var(--paper-soft)` 배경 + `var(--mono)` 폰트. 미작동(사진/음성) + 작동(직전 취소/샘플) 모두 같은 클래스, cursor로 구분.
- **헤더 brand line** (`.brand-line`): 작은 `--heat` 점 + `vibe recipe` + `· {recipeState.name} · {초안|완성}` (이름 없으면 생략)
- **자동 저장됨 pill** (`.autosave-pill`): `--accent-green` 점 + 텍스트, `var(--mono)`
- **쿡 모드 버튼** (`.cook-mode-btn`): 검정(`var(--ink)`) 배경 + 흰 글자, `canCook` 조건부 활성

**이유**:
- **D-009 임의 결정 금지 정합** — 색/폰트/마이크로 요소를 SSOT 1곳(`:root` + 정의된 클래스)에 박아 컴포넌트마다 임의 디자인 결정 차단.
- **TASTE §6 *잠정 → 확정***: 사용자가 제시한 스크린샷이 *디자인 결정의 원본*. 본 ADR은 그 결정을 코드로 옮김.
- **헌법 정신 강화**: D-021(BUILD UX 표면)의 *디자인 시스템 부재*가 채워짐. 메타포 함정(D-002 함정의 시각판) 재발 방지 — *문법*(코딩 IDE 다크 톤 등)을 *함정처럼 가져오는* 위험을 SSOT가 가둠.

**결과**:
- `app/layout.tsx`에 next/font/google 2종 등록.
- `app/globals.css :root` 변수 통합 갱신 + 신규 토큰 추가 + 호환 별칭.
- `components/BuildMode.tsx` — ChatBubble role="chef" 분기(아바타 추가) + build-input 재구조화(좌측 aux + 우측 원형 전송).
- `app/page.tsx` — 헤더 brand-line + autosave-pill + cook-mode-btn (기존 PAIR-COOKING IDE eyebrow / status-pill 3종 제거).
- 신규 클래스 15+종 (`.brand-line`, `.brand-dot`, `.brand-name`, `.brand-sep`, `.brand-recipe`, `.autosave-pill`, `.autosave-dot`, `.cook-mode-btn`, `.build-input-aux`, `.aux-chip`, `.build-input-trailing`, `.send-btn`, `.send-count`, `.chef-avatar`, `.chat-bubble-body-wrap`).
- `EngineResponseSchema`/`RequestBodySchema`/`lib/schema`/`/api/recipe` 모두 변경 0.
- welding-inspector(DR1.T3) PASS 결함 0.
- **명시적 후속 (DR2 / DR3 / cleanup)**:
  - **DR2** 2-pane 레이아웃 — 좌측 채팅 / 우측 sticky 산출물. D-021 4-요소 패턴 *구조* 재해석 ADR.
  - **DR3** cold-start 첫 진입 화면 `오늘, 뭐가 있어요?` 변형 — UX 패턴 변경
  - dead CSS 정리 (`.status-pill`, IDE 풍 12종 등)
  - Pretendard 정식 등록 (next/font/local)
  - 모바일 별도 처리 (`.cook-mode-btn` + autosave 헤더 wrap 등)
- **사용자 결정 시점**: 2026-06-21 (사용자 디자인 스크린샷 제시 + architect 권고 자동 채택 — `_workspace/02_welding_review_DR1T1.md`).

---

## D-027. 2-pane 레이아웃 — 임베드 분리 정책 (D-021 구조 재해석)

**맥락**: 2026-06-21 사용자 디자인 스크린샷(0001)이 명시한 BUILD 메인은 *2-pane* — 좌측 채팅 + 우측 sticky 작성 중 레시피 카드. 직전 D-021은 *임베드*를 "최신 chef 메시지 안에 카드들이 누적된 묶음"으로 정의했으나 *공간 위치*는 미명시. DR1 시각 시스템 후에도 사용자가 "아직 이대로"라며 *전체 인상이 달라지지 않음*을 지적 — *임베드의 공간 분리*가 핵심 변경임이 확정됨.

**결정**: D-021 4-요소 패턴의 *공간 위치*를 다음과 같이 분리한다.

### 4-요소 공간 매핑 (D-027)
| 요소 | 위치 |
|------|------|
| **채팅 흐름** (pair-chef ↔ user 버블) | `<chat-side>` (좌측) |
| **stage-progress** (5단계) | `<build-bench>` 상단 — 양 패널 *위* stretch |
| **임베드** | 두 곳으로 분리: |
|   ㄴ 옵션 칩 (`engineResponse.options`) | 좌측 *최신 chef 버블 안* 인라인 |
|   ㄴ Warnings (`engineResponse.warnings`) | 좌측 *최신 chef 버블 안* 인라인 |
|   ㄴ 산출물 (Name/Concept/Ingredients/Tools/Time/Taste/Texture/Steps) | `<recipe-side>` (우측 sticky) — `<RecipeCanvas>` |
|   ㄴ 메타 (StagePlan/Context) | `<RecipeCanvas>` 하단 *meta-block* — mini 변종 카드 |
|   ㄴ ModifiedChips | `<RecipeCanvas>` 헤더 옆 *작은 칩* (`.canvas-modified`) |
| **모드 전환** | 헤더 `쿡 모드 →` 버튼 + Cook 종료 자동 진입 |

### 부수 결정
- **`pipeline-rail` 제거**: 4-모드 전환은 헤더 버튼 + 자동 진입으로 충분. LEARN은 disabled placeholder였음.
- **`runtime-inspector` 제거**: FingerprintCard는 `<aside class="page-footer-aside">`로 이동 (페이지 하단). session 메트릭(authToken 파싱 / recipe_id 표시)은 dev-shelf로 흡수.
- **state 끌어올림 회피**: BuildMode가 *두 영역 모두 렌더*. 새 컴포넌트 `<RecipeCanvas>`는 props로만 통신 (mutation/state는 BuildMode 안).
- **빈 상태**: 우측 RecipeCanvas는 응답 받기 전 *idle* 안내 ("RECIPE · 대기" + "왼쪽에서 대화로 시작해주세요. 합의가 시작되면 여기 레시피가 자라납니다.") — TASTE §4 친구 톤.

**이유**:
- **0001 디자인 정합**: 사용자가 *page-level 합의*한 디자인. 임베드가 *대화 안에 누적*이 아니라 *우측에 항상 최신 노출*이 페어 코딩의 IDE 메타포(우측 코드 패널 sticky)와 더 잘 맞음.
- **§1.3 한 턴 한 단계 *시각 강화***: 사용자가 *항상 RecipeState의 현재 상태*를 본다. 대화는 *합의 흐름*, 캔버스는 *그 결과*. 두 역할이 분리되어 인지 부담 감소.
- **D-002 정합**: "생성=카드 / 수정=diff" 원칙의 *공간 위치*가 우측으로 옮겨졌을 뿐, 원칙 자체는 그대로. modified diff는 `.canvas-modified` 칩으로 헤더 옆 작게.
- **D-022/D-023 무영향**: mutation/undo 모두 BuildMode state 안. 위치만 이동. 흐름 0 변경.
- **D-007 정신**: FingerprintCard 위치만 *페이지 하단*으로 이동. 가치 환원 강도는 동일.

**결과**:
- `app/page.tsx`: pipeline 배열 + `<nav.pipeline-rail>` + `<aside.runtime-inspector>` 제거. `<section.mode-stage>` + `<aside.page-footer-aside>`로 단순화.
- `components/BuildMode.tsx`: 풀 재작성. `<RecipeCanvas>` / `<StagePlanCardMini>` / `<ContextMetaCardMini>` 신규 하위 컴포넌트. `<LatestEmbeds>` 제거 (역할 분산). 옵션 칩 / Warnings는 최신 chef 버블 안 인라인.
- `app/globals.css`: 신규 클래스 30+종 (build-canvas / chat-side / recipe-side / recipe-canvas / canvas-head / canvas-title / canvas-section / canvas-steps / canvas-step-index 검정 원 + Newsreader 큰 제목 등). 모바일: 1-col stack + recipe-side static.
- `EngineResponseSchema` / `RequestBodySchema` / `lib/schema` / `/api/recipe` 변경 0.
- welding-inspector(DR2.T3) PASS 결함 0.
- **명시적 비범위 / 후속**:
  - DR3: cold-start 첫 진입 `오늘, 뭐가 있어요?` 화면 변형
  - dead CSS 정리 (pipeline-rail / pipeline-node / runtime-inspector / workbench / ide-grid / IDE 풍 12종 등)
  - 모바일 헤더 wrap 최적화
  - Pretendard 정식 등록
- **사용자 결정 시점**: 2026-06-21 (architect 권고 자동 채택 + 사용자 "바로 DR2 이어서 진행" 선택 — `_workspace/02_welding_review_DR2T1.md`).

---

## D-028. cold-start hero — 첫 진입 BUILD UX

**맥락**: 2026-06-21 사용자 디자인 스크린샷 0002의 cold-start 화면 — `오늘, 뭐가 있어요?` 큰 제목 + 시작 옵션 칩 5종. 현재 BUILD는 첫 진입에서도 *2-pane 채팅*이라 *처음 만나는 사용자*에게 진입 부담. 디자인은 *별도 hero 화면*으로 시작점을 명확히 제시.

**결정**: `messages.length === 0 && lastResponse === null` 조건에서 BuildMode가 *별도 hero 화면* 렌더. 첫 입력(자유 텍스트 / 칩 / 샘플) 후 자동으로 평소 2-pane으로 전환.

### hero 구성 (0002 정합)
- 시간 라벨 — `{시간대} {Hour}시 · {요일}` (예: "저녁 7시 · 평일 종일"). 60초 주기 갱신.
- 큰 제목 `오늘, 뭐가 있어요?` (Newsreader, clamp 36~56px)
- 부제 `재료만 알려주면 같이 한 접시 완성해요.`
- 큰 입력 박스 — placeholder `두부 한 모, 신김치, 대파... 냉장고를 적어보세요!`
- 좌하단 aux-chip (`+ 사진` / `⏵ 음성` disabled 시그널 + `샘플`)
- 우하단 원형 주황 ↑ send-btn
- 시작 옵션 칩 5종 (퀵스타트): `냉장고 털기` / `10분 야식` / `다이어트 한 끼` / `손님 초대상` / `아이 반찬` — 클릭 = `submit(label)` 첫 user 메시지
- auth 미준비 시 hint + quickstart 칩 disabled

### 분류 규칙 (formatTimeLabel)
- 시간대: 06~10시 "아침", 11~13시 "점심", 14~17시 "오후", 18~21시 "저녁", 22~05시 "밤"
- 요일: 토/일 "주말", 평일 "평일 종일"

### hero ↔ 2-pane 전환
- 첫 submit 호출 → messages 채워짐 → `showHero=false` → 자동 2-pane 노출.
- undoLast로 messages 0 복원 → 다시 hero 노출 (자연 — 처음으로 되돌아가는 느낌).

**이유**:
- **§1.3 "한 턴 한 단계"의 *시작점 명시***: 처음 만나는 사용자에게 *어디서 시작할지* 명확히 제시. 칩 5종이 *합의의 첫 칸*.
- **TASTE §4 친구 톤 정합**: "오늘, 뭐가 있어요?"는 페어 셰프가 *먼저* 묻는 첫 인사. cold-start greeting(채팅 안 클라 상수)과 *역할 분리* — hero는 첫 인사 큰 화면, greeting은 첫 응답 후 채팅 상단 작은 버블.
- **D-021/D-027 정합**: 4-요소·2-pane 패턴의 *진입 단계*만 hero로 분리. 일반 흐름은 그대로.
- **D-022/D-023/D-024/D-025 무영향**: hero는 *0번째 턴* — 데이터 mutation/undo/Plan/Context 모두 RecipeState 부재 시점이라 자연 무관.
- **D-026 디자인 토큰 자연 적용**: Newsreader 큰 제목 + JetBrains Mono eyebrow + send-btn / aux-chip 재사용 — 새 토큰 0.

**결과**:
- `components/BuildMode.tsx`: HERO_TITLE / HERO_SUBTITLE / HERO_INPUT_PLACEHOLDER / HERO_QUICK_STARTS 상수 + `<ColdStartHero>` 신규 + `formatTimeLabel` 헬퍼. `showHero` 분기로 평소 2-pane과 자연 공존.
- `app/globals.css`: 신규 클래스 10종 (cold-hero, cold-hero-inner, cold-hero-eyebrow, cold-hero-title, cold-hero-subtitle, cold-hero-input, cold-hero-hint, cold-hero-quickstarts, quickstart-chip, cold-hero-alert).
- /api/recipe·schema·EngineResponseSchema 변경 0.
- welding-inspector(DR3.T3) PASS 결함 0.
- **명시적 비범위 / 후속**:
  - 헤더 우측 `탐색` / `내 레시피` 메뉴 — 영속(`recipe_versions`) + 로그인 의존
  - 동그란 아바타 — placeholder 또는 다음 사이클
  - quickstart 칩 카테고리 확장 — 사용자 fingerprint 기반 *맞춤 시작점* (P3)
  - dead CSS 정리 (별도 cleanup 사이클)
- **사용자 결정 시점**: 2026-06-21 (architect 권고 자동 채택 + "DR3 cold-start 화면 진행" — `_workspace/02_welding_review_DR3T1.md`).

---

## D-029. BUILD 응답 2단계 스트리밍 (DR4 — 에이전트형 고도화)

**맥락**: 사용자(유케이)가 "고도화된 바이브 코딩처럼 대화로 레시피를 완성하는 경험"을 위해 BUILD 대화의 *에이전트화*를 선택. AskUserQuestion 결과 범위는 **응답 스트리밍 1건**으로 한정(제안/되묻기·근거투명성은 차기). 기존 엔진은 단일 POST → LLM `{message,new_state,...}` 단일 JSON → Zod 검증 → 클라 splitDiff. "셰프가 타이핑하듯" 흘리려면 이 원자성을 어디서 깨느냐가 곧 헌법 문제(D-001 검증 후 diff).

**결정**: **2단계 스트리밍(welding-architect GDR4-1 후보 B, 사용자 채택)**.
- LLM 출력 = (1)평문 대화 메시지 → (2)`===STATE_JSON===` 단독 줄 → (3)message 제외 5개 키 구조 JSON.
- 서버는 평문을 SSE `delta` 로 **토큰 실시간** 방출, 구조 JSON 은 **완결 수신 후 1건으로 검증**(D-004 1회 재시도) → `done` 이벤트로 원자 전송.
- 최종 조립물 `{message, ...structured}` = 기존 EngineResponse 와 동일 shape → 클라 매핑/검증/splitDiff 무손상.
- SSE 이벤트 4종: `delta`(평문) / `reset`(재시도 — 흘린 평문 폐기) / `done`(검증된 new_state 동봉) / `error`(2회 실패·네트워크).
- 스트림 시작 *전* 실패(rate limit/auth/buildContext)는 기존 JSON 4xx/5xx 유지.

**이유**:
- **D-001 보존**: new_state 는 구분자 뒤 구조 JSON 에 통째 → 완결 수신 후 `EngineStructuredSchema`→`EngineResponseSchema` 검증 후에야 splitDiff. 반쪽 상태 렌더 0.
- **D-002 보존**: diff 는 여전히 클라 코드(splitDiff). 스트리밍은 *대화 텍스트에만* 적용 — "생성을 diff로 보여주는 오용"(D-002) 재발 없음.
- **D-004 보존**: 검증 실패 시 reset 후 정확히 1회 재시도. 3회째 금지.
- **§4 무영향**: BuildContext 조회/cold_start 주입/context_used(D-025) 모두 유지 — BUILD 용접 무손상.
- 후보 A(클라 의사-타이핑)는 *진짜* 스트리밍이 아니고, C(완전 구조 스트리밍)는 D-001 과 최대 충돌이라 비채택.

**결과**:
- `lib/schema.ts`: `EngineStructuredSchema = EngineResponseSchema.omit({message:true})` (additive, EngineResponse 무변).
- `lib/prompt.ts` `renderOutputContract()`: 2단계 형식 + 형식 규율 절. 불변 규칙 #2 "JSON 앞 평문" 반영.
- `app/api/recipe/route.ts`: `[5]` 비스트리밍 → SSE ReadableStream. `streamAnthropicText`(stream:true) / `runStreamingAttempt`(구분자 길이 꼬리 보류) / `assembleEngineResponse` / `retryUserMessage`. 제거: callAnthropic·tryParseEngineResponse·callEngineWithRetry·EngineValidationError.
- `components/BuildMode.tsx`: `streamingText` state + `consumeRecipeStream`(SSE 파서) + busy 버블 실시간 평문/`.stream-caret`. `StreamClientEvent` 서버 1:1.
- `app/globals.css`: `.stream-caret` + keyframes.
- typecheck PASS / 6/6 test PASS / welding-inspector(DR4.T6) PASS 결함 0.
- **명시적 비범위 / 후속**:
  - 셰프 제안/되묻기(act/ask 모드) — D-030 후보, 차기 사이클.
  - 근거 투명성 강화(Plan/Context 메타 확장) — 차기.
  - cold-hero 첫 응답 스트리밍 미노출(R-DR4-1) — hero→2-pane 즉시 전환 검토.
- **사용자 결정 시점**: 2026-06-28 (AskUserQuestion: 방식 B + 범위 ① 응답 스트리밍).

---

## D-030. 에이전트 드래프트 우선 (D-003 "한 턴 한 단계" 개정)

**맥락**: 사용자 피드백 — "이건 챗봇 느낌이지 레시피 *에이전트* 느낌이 아니다." 필드를 하나씩 물어 조립하는 D-003 점진 흐름이 챗봇 느낌의 주범.

**결정**: D-003 을 개정. 셰프는 **에이전트로서 드래프트 우선·주도**한다 — 요리/충분한 재료가 정해지면 재료·양념(비율)·맛·스텝까지 *한 판 짜서 new_state 에 채워 제시*하고, 사용자는 steer(수정)한다. **묻는 건 진짜 취향 갈림길에서만**(매콤 vs 담백 등). 정보 부족·갈림길이면 그 하나만 묻고 멈춘다.

**1초 덤프와의 차이**(헌법 §1.3 정신 유지): ⑴ 에이전트가 *일하는 게 보이고*(드래프트가 캔버스에 차오름) ⑵ 빌드→쿡→피드백→학습 **루프가 계속**됨. 검색 1초 레시피가 아니라 *주도하는 페어*.

**결과**:
- `lib/prompt.ts` renderRole(에이전트 행동: 드래프트 우선·주도·갈림길만 질문) + renderPipeline("정보 충분하면 여러 단계 한 번에 초안, stage 는 도달 최전방으로 보고; 한 단계씩 캐묻는 챗봇식 금지").
- D-003a(일괄 위임 키워드) 와 정합 — 이제 드래프트가 기본 성향.
- **eval: 종합 94%(최고), role 0/3→2/3 동반 상승** (드래프트가 필드를 더 채움).
- 결정 시점: 2026-06-29.
