# P1.T2 변경 보고서 — `lib/prompt.ts` 본문 구현

**작성자**: engine-builder
**일자**: 2026-06-14
**입력**: P1.T1 PASS (welding-architect 보고서 + 사용자 결정 GA-1~4 / R12~R15)
**검증자**: welding-inspector (T4 단계)

---

## 1. 산출물

| 파일 | 변경 |
|------|------|
| `lib/prompt.ts` | placeholder(빈 export) → `buildSystemPrompt(args: BuildPromptArgs): string` 본문 구현 + 부수 `trimKnownIssues` export |

다른 파일은 본 사이클에서 변경하지 않음.

---

## 2. 시그니처

```ts
export type BuildPromptArgs = {
  stage: Stage;
  buildContext: BuildContext;
  recipeState?: RecipeState | null;
};

export function buildSystemPrompt(args: BuildPromptArgs): string;
export function trimKnownIssues(issues: readonly KnownIssue[], budget?: number): readonly KnownIssue[];
```

`Stage` / `BuildContext` / `RecipeState` / `KnownIssue` / `Trait` 모두 `@/lib/schema` 에서만 import — 라우트와 동일한 SSOT 면.

---

## 3. 결정 채택 위치 (GA-1~4)

### GA-1 (D-003a 모드 자동 판단 — 키워드 매칭만)
- **위치**: `renderBatchEscapeRule()` (라인: "## 일괄 위임 예외 (D-003a — 키워드 매칭)" 절)
- **방식**: 시스템 프롬프트에 자연어 규칙으로 키워드 6개("알아서"/"한번에"/"대충"/"다 해줘"/"빠르게"/"바로") 명시. 별도 `inferMode` 함수 추가 0.
- **검증**: 라우트는 키워드 분기 코드를 갖지 않으므로 자연어 규칙 한 곳이 SSOT. P2에서 본격 자동 판단 도입 시 본 절을 들어내고 함수로 옮긴다.

### GA-2 (known_issues 트리밍 — 미해결 우선, 최근 N=5)
- **위치**: `renderKnownIssuesSection()` + `trimKnownIssues()` 헬퍼
- **방식**: 상수 `KNOWN_ISSUES_BUDGET = 5`. 미해결(resolved=false) 우선 → 그 다음 해결됨. 같은 그룹 안 순서는 입력 보존 — "최근" 판정은 호출자(라우트)가 runtime_logs 조회 시 최신순 정렬해 넘기는 책임이다. (KnownIssueSchema 에 timestamp 필드가 없어 코드 내 정렬 키 부재.)
- **메타 명시**: 프롬프트에 "미해결 우선 정렬 후 최근 5개만 표시" 문구 박음 (사용자 결정문 §GA-2 요구).
- **추가 export**: `trimKnownIssues` 를 export 한 이유 — 라우트/테스트가 동일 로직을 호출하고 싶을 때 재구현 금지 (R9 SSOT 표류 재발 방지).

### GA-3 (BuildContext 조회 실패 — 1회 재조회 후 502)
- 본 파일 적용 영역 아님. T3 (`app/api/recipe/route.ts`) 에서 처리. 단 본 파일은 BuildContext 가 정상 로드된 상태(`cold_start` 플래그가 의미 있는 상태) 를 전제로 한다.

### GA-4 (TASTE.md 인용 — stage 별 분기)
- **위치**: `renderTasteDoctrine(stage)` + `renderStageTasteClause(stage)`
- **방식**: `switch(stage)` 로 분기:
  - `concept`/`base`: stage-specific 인용 0 (사용자 결정 §GA-4).
  - `taste`: TASTE.md §1 맛 6축 + 식감 5축.
  - `steps`: TASTE.md §2 스텝 분할 원칙.
  - `done`: TASTE.md §3 핫픽스 우선순위.
- **공통**: 모든 stage 에 §4 언어 톤 + "원칙에 없는 새 판단은 임의 결정 금지, options/warnings 로 묻기" 명시.
- **§5 미정 항목 임베드 0** — 결정 안 난 영역을 LLM 에 흘리지 않음.
- **타입 안전**: switch default 에 `const _exhaustive: never = stage` 가드 — Stage 가 확장되면 컴파일러가 잡는다.

---

## 4. 회귀 위험 가드 적용 위치 (R12~R15)

| 위험 | 적용 위치 | 메커니즘 |
|------|----------|---------|
| **R12** JSON 추출 무한 루프 | 본 파일 적용 영역 아님 (T3 의 callEngineWithRetry 가드). 본 파일은 systemPrompt 자체가 "JSON 외 텍스트 금지(설명/마크다운/코드블록 펜스 포함)" 명시 → LLM 측 노이즈 감소로 추출 실패율 자체를 낮춤. |
| **R13** messages 8턴 초과 | 본 파일 적용 영역 아님 (T3 slice 가드). 본 파일은 영향 없음. |
| **R14** options 15자 초과 | `renderInvariantRules()` 규칙3 — "**options 는 2~3개, 각 15자 이내** — 길어지면 줄여 다시 쓴다." 강조형 표기. 추가로 `renderOutputContract()` 의 JSON 스키마 주석에 재명시. |
| **R15** new_state 부분 반환 정책(D-001) | `renderInvariantRules()` 규칙5 + `renderOutputContract()` "패치 규율" 절 — "new_state 는 이번 턴 확정된 필드만, 변경 없으면 null" 2회 명시. 사용자 결정문 R15 가 요구한 "변경 후 전체 상태 또는 null" 표현을 그대로 박았다. |

### R1~R11 (P0 인계) 가드 적용
- **R5/R9/R10 (SSOT 표류)**: 본 파일에 `z.object` / `z.enum` 호출 0 (grep 검증 권고 — 아래 §6).
- **R11 (cold_start 무시)**: `renderModeHeader()` 가 `ctx.cold_start === true` 면 첫 줄에 "[모드: 맹탕 모드 — RuntimeLog/Fingerprint 없음]" 결정적 분기. 우회 경로 없음.
- 그 외 R1~R4/R6~R8 은 lib/env.ts·lib/ratelimit.ts·라우트 영역으로 본 파일 무관.

---

## 5. 결정성 / 순수성

- `buildSystemPrompt` 는 **순수 함수**:
  - 외부 시각(Date.now)·env·랜덤·전역 상태 의존 0.
  - 같은 args → 같은 문자열.
- `JSON.stringify(state, null, 2)` 의 키 순서는 V8 객체 삽입 순을 따른다. 라우트가 RecipeState 를 `RecipeStateSchema.parse` 후 그대로 넘기는 경로에서 안정적 (스키마 정의 순서 = 객체 키 순서).
- 트리밍 정책은 호출자 입력 순서를 보존 — 결정성 보장.

---

## 6. 검증 grep (welding-inspector T4 에게)

### 6-a. SSOT 위반 (라우트 패턴을 prompt 에도 적용)
```bash
grep -nE "^(const|export const) (\w+)Schema = z\." lib/prompt.ts
```
매치 0 이어야 함. 한 줄이라도 매치되면 BLOCK (lib/schema.ts 만 스키마를 정의).

### 6-b. `@/lib/schema` import 단일성
```bash
grep -n "from \"@/lib/schema\"" lib/prompt.ts
```
정확히 1 줄 매치, 그 줄에서 `BuildContext`/`KnownIssue`/`RecipeState`/`Stage`/`Trait` 5개 type import.

### 6-c. cold_start 분기 존재
```bash
grep -n "맹탕 모드" lib/prompt.ts
```
1 줄 이상 매치 — `renderModeHeader` 의 cold_start=true 분기.

### 6-d. R14/R15 가드 문구 존재
```bash
grep -nE "15자 이내|변경 없으면 null|new_state" lib/prompt.ts
```
복수 매치 정상. R14 / R15 가드가 프롬프트에 박혀 있음을 확인.

### 6-e. server-only 의존성 누출 없음 (본 파일은 server-only 가 아님)
`lib/prompt.ts` 는 `import "server-only"` 를 하지 않는다 — 순수 문자열 변환이라 클라이언트 빌드에 들어가도 키 누출 위험 0. 단 의도된 사용처는 서버 라우트뿐 (라우트가 buildSystemPrompt 를 호출).

---

## 7. 의도된 비커버리 (P1 본 사이클 밖)

- **fetchBuildContext 함수**: T3 (`app/api/recipe/route.ts` 또는 `lib/buildContext.ts` 신설)에서 작성. 본 파일은 BuildContext 가 어떻게 만들어지는지 모름 — 결정성 유지.
- **stage 진행 로직**: 본 파일은 "현재 stage" 만 입력으로 받음. "다음 stage 가 무엇인가" 는 LLM 의 stage 출력 + 라우트의 응답 검증으로 결정.
- **트리밍 budget 환경변수화**: `KNOWN_ISSUES_BUDGET` 상수. 환경변수로 빼지 않음 — 사용자 결정문 GA-2 가 N=5 를 채택한 결정이므로, 변경하려면 ADR 갱신 + 본 상수 수정의 두 단계가 필요하다는 점이 의도된 마찰.
- **다국어**: 한국어 고정 (ENGINE.md §4-규칙10). 다국어 분기는 P3.

---

## 8. 인계

- **T3 (engine-builder)**: 본 보고서 §3 GA-3 위임 사항을 라우트에서 처리. `buildSystemPrompt` 호출 시 stage 와 buildContext 와 (optional) recipeState 를 전달. `trimKnownIssues` 는 라우트에서 직접 호출할 일 없음 — buildSystemPrompt 내부에서 호출된다.
- **welding-inspector (T4)**: §6 grep 5종 + Stage 5개 × cold_start 2상태 = 10가지 입력 조합에 대한 출력 안정성 점검 권고. 동일 args 면 동일 문자열 (스냅샷 테스트 권고는 P2).
- **doc-taste-scribe (사이클 마무리)**: ADR D-012(GA-2 N=5), D-013(GA-3 502), D-014(GA-4 stage 분기) 등재 시 본 보고서 §3 위치 인용.
- **MAP.md**: `lib/prompt.ts` 가 빈 export → 본문 구현 으로 전환된 사실 반영 권고.
