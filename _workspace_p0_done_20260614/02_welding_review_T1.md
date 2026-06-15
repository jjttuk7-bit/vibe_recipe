# 헌법 검증 결과 — T1 (P0 사전 가드)

**작성자**: welding-architect
**일자**: 2026-06-13
**입력**: `_workspace/00_input/request.md` (ROADMAP P0 두 항목), `_workspace/01_precondition_audit.md` (셸 부재 감사)

---

## 결정

**NEED_USER_DECISION**

P0 두 항목(`/api/*` rate limit, `ANTHROPIC_API_KEY` 서버 격리) 자체는 헌법(§8.5)에 명시된 정당한 작업이며 BLOCK 사유가 없다. 그러나 **적용 대상이 부재한다**: `app/api/*` 라우트, `package.json`, `.env*`, `next.config.*`, `tsconfig.json` 모두 미존재.

ROADMAP에 "프로젝트 셸 부트스트랩"이 명시되지 않았고, DECISIONS.md에 셸 구조에 대한 ADR이 없다. 셸을 만드는 행위 자체가 헌법의 강제 구조(D-005 timer_sec 내장, D-006 핫픽스 분리, D-007 Supabase 영속 / localStorage 금지, D-008 용접 의존성)를 **어떻게 처음부터 강제할 것인가**라는 결정을 동반한다. 임의로 정하면 ADR 없는 사실상 헌법 조항이 생긴다 → **§9 변경 이력 누락 + D-009 임의 결정 금지에 저촉**.

따라서 셸 구조에 대한 결정 후보 2~3개를 정리하여 사용자 결정 후 진행해야 한다.

---

## 검토 ADR

- **D-001 / D-002**: P0 자체와는 무관. 셸에서 `lib/diff.ts`를 어디에 둘지는 §6 디렉토리 트리에 이미 명시 → 자동 결정.
- **D-003 / D-003a**: P0와 무관. `lib/prompt.ts`의 파이프라인 단계 분리는 P1에서 다룸.
- **D-004**: `app/api/recipe/route.ts`의 Zod 1회 재시도. 셸 placeholder 단계에서 이 골격을 미리 마련할지 NEED_USER_DECISION 후보 B에 포함.
- **D-005**: 스키마(`lib/schema.ts`)의 `steps: {text, timer_sec}[]`. 셸 부트스트랩 시 이 스키마를 빈 껍데기라도 미리 박을지 결정 필요.
- **D-006**: `app/api/run/route.ts`(CookRun 저장)와 BUILD 분리. 셸에 placeholder 라우트로 강제할지 결정 필요.
- **D-007**: **핵심**. `localStorage 금지 / Supabase 필수`. 셸 부트스트랩 시 `lib/supabase.ts` 골격을 두지 않으면, 이후 누군가가 "MVP는 localStorage로 간단히"로 표류할 위험. 셸 자체에서 막아야 한다.
- **D-008**: **핵심**. 용접 의존성. 셸에 BUILD 단독 라우트만 두면 (rate limit·env만 점검하고 끝나면) "이 기능을 떼어내도 다른 단계가 완전한가?" 테스트에서 "예"가 되어 용접 실패.
- **D-009**: TASTE.md에 없는 판단 임의 결정 금지 → 셸 디렉토리 디테일 일부는 본 보고서 결정 대상 밖이므로 사용자에게 위임.
- **D-010**: 무관.

---

## 충돌 내역

### C-1. P0 적용 대상 부재 (사실상 미실행 가능)
- ROADMAP P0의 `@upstash/ratelimit` 설치 → `package.json` 부재로 `npm install` 불가.
- `ANTHROPIC_API_KEY` 서버 격리 검증 → `.env.local`·서버 라우트 양쪽 부재로 검증 대상 자체가 없음.
- **결론**: P0를 명목상 PASS로 처리해도 "공개 배포 전 필수"가 충족되지 않는다 — 배포할 코드 자체가 없다.

### C-2. 셸 부트스트랩에 대한 ADR 부재 (헌법 공백)
- §6에 디렉토리 트리가 *기술 스택 설명*으로 들어있으나, 이를 **언제·누가·어떤 placeholder로** 만드는지는 결정되지 않음.
- §9 하네스 변경 이력 표는 "초기 하네스 구성"·"Phase 6 검증 보강" 두 줄뿐 → 셸 부트스트랩 결정이 들어갈 자리 없음.
- DECISIONS.md D-001~D-010 어디에도 부트스트랩 시 강제 사항 없음.
- **결론**: 어떤 모양으로 만들든 ADR 없는 사실상 헌법이 된다 → 신규 ADR 필수.

### C-3. 용접 구조 위반 위험 (셸이 BUILD만 갖춘 경우)
- 만약 셸을 "P0 적용 가능한 최소 형태"로만 만들면 (`app/page.tsx` + `app/api/recipe/route.ts`만 placeholder) → COOK/POSTMORTEM/RuntimeLog/Fingerprint 라우트가 없는 셸이 된다.
- 이는 §4 "이 기능을 떼어내도 다른 단계가 완전한가?" 테스트에서 BUILD가 단독으로 완전한 셸이 되어 **용접 실패의 출발선**이 된다.
- **결론**: 셸 자체가 5개 데이터 경로(RecipeState/CookRun/RuntimeLog/Fingerprint/recipe_versions)의 골격을 처음부터 갖춰야 한다.

---

## 재설계 / NEED_USER_DECISION 후보

### 후보 A — **헌법 강제형 풀셸 부트스트랩 + P0 동시 적용** (권고)

P0 두 항목과 셸 부트스트랩을 한 묶음으로 처리. 셸은 §4·§6·D-007/D-008의 강제 구조를 *처음부터* 박아넣은 형태.

생성 대상:
- `package.json`: Next.js 15 + React 19 + TypeScript + Zod + `@upstash/ratelimit` + `@upstash/redis` + `@supabase/supabase-js` + `@anthropic-ai/sdk` + dev deps.
- `tsconfig.json`, `next.config.ts`, `.gitignore`.
- `.env.example` (실제 키 없음, 서버 전용 변수 + `VIBE_RECIPE_MODEL` 명시. `NEXT_PUBLIC_*` 접두사로 클라이언트 노출이 의도 명시 없는 한 금지).
- `app/page.tsx` (엔트리 placeholder, BUILD 진입점만 표시).
- `app/api/recipe/route.ts` (placeholder + rate limit 미들웨어 + Zod 검증 골격 + 1회 재시도 골격, D-004).
- `app/api/run/route.ts` (placeholder + rate limit + CookRun 저장 → RuntimeLog → Fingerprint 호출 골격, **D-008 용접 강제 지점**).
- `lib/schema.ts` (RecipeState/CookRun/RuntimeLog/Fingerprint Zod 스키마 최소 골격, D-005 `timer_sec` 필드 포함).
- `lib/supabase.ts` (서버 클라이언트 골격, **D-007 영속 강제 — localStorage 사용 차단 주석 포함**).
- `lib/ratelimit.ts` (Upstash 기반 IP rate limit 헬퍼, 두 API 라우트에서 공유).
- `lib/prompt.ts`, `lib/diff.ts`, `lib/runtime.ts`, `lib/fingerprint.ts` (빈 export 파일 + TODO 주석 — 용접 구조 강제 다이어그램을 주석으로 박음).
- `components/BuildMode.tsx`, `components/CookMode.tsx`, `components/Postmortem.tsx` (빈 placeholder 컴포넌트, "Cook 종료 시 Postmortem 자동 진입 강제" 주석).
- `supabase/migrations/0001_init.sql` (5개 테이블 + RLS 정의, DATA_MODEL.md §6).

**장점**:
- P0 두 항목이 실제로 작동하는 상태로 완료됨.
- 셸 자체가 §4 용접을 강제 (BUILD만 떼어내 동작 불가하게 배치).
- 향후 P1 작업이 placeholder를 채우기만 하면 되어 헌법 충돌 가능성 최소.

**단점/비용**:
- 작업량 큼 (P0 두 줄짜리 항목이 사실상 셸 부트스트랩 전체로 확장).
- 사용자(유케이)에게 "P0 한다고 했는데 이 정도 범위 맞나?" 확인 필요.

**필요한 신규 ADR**: **D-011** (아래 D-011 초안 참조).

---

### 후보 B — **최소 셸 + P0 적용** (P0 명목 달성 우선)

P0가 막을 두 라우트(`/api/recipe`, `/api/run`)와 env 격리만 가능한 *최소* 셸.

생성 대상:
- `package.json` (Next.js 코어 + `@upstash/ratelimit` + Zod + Anthropic SDK만).
- `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`.
- `app/api/recipe/route.ts` (rate limit + 환경변수 점검만, 본문은 501 Not Implemented).
- `app/api/run/route.ts` (rate limit만, 본문은 501).
- `lib/ratelimit.ts` (공유 헬퍼).
- `app/page.tsx` (placeholder).

**장점**:
- 범위 작음. P0 명목상 완료.
- ADR 부담 가벼움 (셸 구조 결정 최소화).

**단점/충돌**:
- **§4 용접 구조 위반 위험**: `lib/schema.ts`·`lib/supabase.ts`·POSTMORTEM 골격이 없어, 이후 P1 작업자가 "MVP는 localStorage로"·"CookRun 저장 생략"으로 표류해도 셸이 막지 못함. D-007/D-008이 코드 레벨에서 강제되지 않음.
- 사실상 D-011 같은 ADR이 여전히 필요 (어떤 placeholder를 두지 *않을지*도 결정이므로).

**필요한 신규 ADR**: D-011 (소극형) — 셸은 P0 적용을 위한 최소 표면만 가지고, 헌법 강제는 P1 단계의 각 코드에서 한다.

---

### 후보 C — **셸 부트스트랩 분리, P0를 사양으로 마무리**

지금 세션에서는 셸을 만들지 않는다. 대신 `docs/SECURITY.md` (또는 ROADMAP P0 항목에 인라인 주석)로 rate limit 정책·env 격리 정책을 *사양*으로 명문화. 실제 코드는 셸 부트스트랩 세션에서 적용.

**장점**:
- 이번 세션 범위가 가장 작음.
- 셸 부트스트랩 결정이 별도 세션의 충분한 사고를 거침.

**단점/충돌**:
- ROADMAP P0가 형식상 미완료로 남음 (체크 안 됨).
- 사양만 있고 코드가 없는 상태에서 외부 협업자가 들어오면 P0가 무시될 위험.
- "공개 URL 배포 전 필수"의 의도는 달성됨 (배포할 코드 자체가 아직 없으므로).

**필요한 신규 ADR**: D-011 (보류형) — 셸 부트스트랩은 별도 세션으로 분리, 이번에는 정책만 docs/SECURITY.md로 동결.

---

## 권고

**후보 A**를 권고한다. 이유:

1. §4 (가장 중요) "베끼려면 전부를 베껴야 한다" 원칙은 코드 레벨에서 데이터 의존성으로 강제하라고 §4가 직접 명시. 셸이 BUILD만 갖추면 그 강제가 처음부터 깨진다.
2. D-007 "localStorage 금지"는 셸에 Supabase 골격이 *있을 때*만 의미를 갖는다. 후보 B/C는 이를 미래의 누군가에게 위임.
3. P0의 본질("API 키 비용 보호 + 키 노출 방지")이 실제로 작동하려면 라우트가 존재해야 한다.

**단, 후보 A의 범위가 ROADMAP P0의 표면적 문구를 넘는다.** 따라서 사용자 결정 없이 진행할 수 없다.

---

## 용접 다이어그램 (후보 A 채택 시)

- **입력 데이터**: 사용자 요청(`request.md`) + 셸 부재 사실(`01_precondition_audit.md`)
- **송신 → 수신**: welding-architect → (사용자 결정) → engine-builder (셸 부트스트랩 + P0 적용) → welding-inspector (헌법 정합성 검증)
- **다음 단계의 필수 입력으로 작동?** Y. 셸 골격이 없으면 engine-builder가 `app/api/*`를 만들 곳이 없음 + welding-inspector가 검증할 코드 자체가 없음.
- **cold start 케이스**: Y, 명시함. 셸 부재 = 데이터 부재 = 모든 작업의 cold start. `lib/prompt.ts` 골격 주석에 "Fingerprint·RuntimeLog가 비어 있으면 맹탕 모드" 명시 필요(§4 강제 규칙).

---

## 다음 에이전트에게 인계

- **schema 변경 필요**: Y (후보 A 채택 시). `lib/schema.ts`에 RecipeState/CookRun/RuntimeLog/Fingerprint 최소 Zod 스키마. D-005 `timer_sec` 필드 포함. → **schema-architect** 호출 필요.
- **엔진 변경 필요**: Y. `app/api/recipe/route.ts`·`app/api/run/route.ts` placeholder + `lib/ratelimit.ts`·`lib/supabase.ts` 골격. → **engine-builder** 호출 필요.
- **UI 변경 필요**: 셸 단계에서는 placeholder만. → ui-builder는 P1까지 미루기 권고.
- **TASTE 컨설팅 필요**: N. 이번 결정은 디렉토리/보안 구조에 한정, TASTE.md의 도메인 판단과 무관.
- **새 ADR 후보**: **Y**. 후보 A/B/C 중 어느 쪽이든 D-011 등재 필요. 사용자 결정 후 doc-taste-scribe(또는 사용자 직접)가 DECISIONS.md에 추가.

---

## ADR D-011 초안 (후보 A 채택 시 등재용)

### D-011. 셸 부트스트랩은 헌법을 코드로 강제하는 풀셸 형태로 한다

**맥락**:
ROADMAP P0(`/api/*` rate limit + env 격리)를 시작하는 시점에 프로젝트 셸(`package.json`, `app/`, `lib/`, `components/`, `.env*`, `tsconfig.json`)이 모두 부재함이 발견됨. 셸을 만드는 방식에 대한 결정이 헌법 §1·§4·§7(D-007/D-008) 강제 강도와 직결되나 기존 ADR에 다루어지지 않음.

**결정**:
셸 부트스트랩은 §6 디렉토리 트리 전체를 placeholder로 한 번에 만든다. 구체적으로:
1. `app/api/recipe/route.ts`와 `app/api/run/route.ts`를 동시에 생성한다 (둘 다 rate limit 적용된 501 응답으로 시작). 한쪽만 만들지 않는다.
2. `lib/schema.ts`에 RecipeState/CookRun/RuntimeLog/Fingerprint 4종 Zod 스키마 최소 골격을 동시에 박는다. `steps: {text, timer_sec}[]` 구조를 첫날부터 강제(D-005).
3. `lib/supabase.ts` 골격을 두고, 모듈 상단 주석으로 "**localStorage 사용 금지 — D-007**"을 명시.
4. `app/api/run/route.ts`에 "CookRun 저장 → RuntimeLog 갱신 → Fingerprint 재계산" 호출 순서를 TODO 주석으로 박아둔다(D-008 용접 강제 지점 표식).
5. `.env.example`은 서버 전용 키만 둔다. `NEXT_PUBLIC_*` 접두사가 붙은 키는 ANTHROPIC 또는 Supabase service-role 키에 대해 절대 사용 금지(코드 리뷰 강제).

**이유**:
셸을 BUILD 위주로 최소 생성하면 후속 작업자가 D-007(localStorage 금지)·D-008(용접 의존)을 *코드 강제*가 아닌 *문서 권고*로만 만나게 됨. §4는 "코드 레벨에서 데이터 의존성으로 강제"를 명시한다. 셸 자체가 그 강제의 첫 면이다.

**결과**:
- P0 작업 범위가 표면적 문구("rate limit + env 점검")보다 커진다. 단, P1 작업이 placeholder를 채우는 형태가 되어 전체 일정은 압축됨.
- `package.json`이 생기므로 `@upstash/ratelimit`·`@upstash/redis` 의존성이 미사용 상태로 들어옴(P0에서는 사용, P1까지는 일부 골격만). 의도된 비용.
- Supabase 프로젝트가 아직 없어도 셸이 빌드 가능해야 함(env가 빈 상태에서 import는 되지만 런타임 호출 시 명시적 에러).

---

## 사용자에게 물을 것 (요약)

> "ROADMAP P0를 시작하려는데, 현재 디렉토리에 Next.js 셸 자체가 없습니다. 어떻게 진행할까요?
>
> **A (권고)**: 셸 부트스트랩 + P0 동시 적용. 헌법(D-005/D-006/D-007/D-008)을 코드 골격으로 처음부터 강제. ADR D-011(풀셸형) 등재.
> **B**: 최소 셸(루트 2개 + lib/ratelimit)만 만들고 P0 적용. 헌법 강제는 P1로 미룸. ADR D-011(최소형) 등재.
> **C**: 셸은 별도 세션, 이번엔 `docs/SECURITY.md`로 P0 정책만 동결. ADR D-011(보류형) 등재.
>
> 셸 디렉토리 디테일 중 헌법에 명시 없는 부분(예: `app/api/`의 핸들러 작성 스타일, Zod 에러 메시지 형식, Supabase 마이그레이션 도구 선택)은 사용자 답변 후 추가 질의 예정."
