---
name: weld-trace
description: "VIBE RECIPE의 D-008 용접 구조가 코드 레벨에서 실제로 작동하는지 추적하는 표준 절차. welding-inspector가 각 모듈 완성 직후 또는 통합 검증 시 반드시 호출한다. 데이터의 시작점에서 종착점까지 코드를 따라 흐름을 확인하고, 경계면(API↔UI, Zod↔DB)을 교차 비교한다."
---

# Weld Trace — 용접 데이터 흐름 + 경계면 정합성 추적

이 스킬은 `welding-inspector` 에이전트가 사용하는 절차다. "이 데이터가 정말 흘러가는가"를 코드로 확인한다. 단순 존재 확인이 아니다.

## 입력 / 출력

- 입력: 검증 대상 모듈 + 관련 코드 파일들
- 출력: `_workspace/07_inspection_{task-id}.md`

## 핵심 원리

1. **흐름이 곧 검증**: "RuntimeLog 테이블이 있다"는 검증이 아니다. "핫픽스 → step_events → 집계 → 다음 BUILD 프롬프트"가 실제로 흐르는지가 검증이다.
2. **두 쪽 동시 읽기**: 한 파일만 읽고 통과시키지 않는다. 송수신 양쪽을 동시에 보고 shape이 일치하는지 비교.
3. **cold start 의무**: 빈 데이터(첫 사용자, RuntimeLog 없음) 케이스를 항상 함께 검증.

## 5개 용접 라인 (필수 트레이스 대상)

VIBE RECIPE의 용접 구조는 다음 5개 라인으로 구성된다. 각 라인을 순서대로 트레이스한다.

### Line 1: BUILD 시작 → known_issues/Fingerprint 주입

- 시작점: `app/api/recipe/route.ts`의 첫 호출 (또는 BuildMode가 새 세션을 시작할 때)
- 종착점: `lib/prompt.ts`가 생성하는 시스템 프롬프트의 known_issues / Fingerprint.traits 섹션
- 트레이스 질문:
  - [ ] 첫 호출 시점에 해당 recipe_id/user_id로 RuntimeLog 조회를 수행하는가
  - [ ] 조회 결과가 시스템 프롬프트에 실제로 삽입되는가
  - [ ] cold start (RuntimeLog 없음) 시 명시적으로 "맹탕 상태" 처리하는가 (CLAUDE.md §4)

### Line 2: COOK 핫픽스 → step_events 저장

- 시작점: `components/CookMode.tsx`의 핫픽스 핸들러
- 종착점: Supabase `cook_runs.step_events` 컬럼의 새 row
- 트레이스 질문:
  - [ ] 핫픽스 발동 시 즉시 step_events에 append되는가 (사용자가 Cook 종료 전에)
  - [ ] step_events 스키마가 핫픽스 종류 + 컨텍스트(어느 스텝)을 보존하는가
  - [ ] D-006: 핫픽스가 정식 RecipeState를 절대 수정하지 않는가

### Line 3: COOK 종료 → POSTMORTEM 강제

- 시작점: `components/CookMode.tsx`의 종료 트리거
- 종착점: `components/Postmortem.tsx` 진입
- 트레이스 질문:
  - [ ] Postmortem 없이 Cook 종료가 가능한가 (가능하면 BLOCK — §4 위반)
  - [ ] 최소 1탭 회고가 강제되는가
  - [ ] Postmortem 결과가 다음 라인으로 흘러가는가

### Line 4: POSTMORTEM → RuntimeLog 갱신 + Fingerprint 재계산 (트랜잭션)

- 시작점: `components/Postmortem.tsx`의 제출
- 종착점: `app/api/run/route.ts`가 Supabase에 트랜잭션 commit
- 트레이스 질문:
  - [ ] CookRun 저장 + RuntimeLog 갱신 + Fingerprint 재계산이 트랜잭션으로 묶이는가 (D-008 강제 지점)
  - [ ] 셋 중 하나라도 실패하면 전부 롤백하는가
  - [ ] `lib/runtime.ts`가 step_events의 모든 종류(핫픽스 포함)를 집계하는가 (누락이 가장 흔함)

### Line 5: 다음 BUILD → Line 1 회귀

- Line 4의 결과가 다음 BUILD 시작 시 Line 1로 다시 들어가는지 확인. 회귀 검증.

## 경계면 비교 체크리스트

5개 경계면을 항상 양쪽 코드를 동시에 펴 놓고 비교한다.

### 경계 A: 시스템 프롬프트 출력 명세 ↔ Zod 스키마

- 비교 대상: `lib/prompt.ts`의 출력 JSON 명세 vs `lib/schema.ts`의 RecipeState
- 흔한 버그: 필드명 미세 차이(`timer_sec` vs `timerSec`), 옵셔널 누락
- 검증 방법: 명세 본문을 발췌하여 Zod 필드 한 줄씩 매핑

### 경계 B: API 응답 타입 ↔ 클라이언트 사용 타입

- 비교 대상: `app/api/*/route.ts`의 Response shape vs `components/*.tsx`의 fetch 핸들러
- 흔한 버그: 서버는 `{ recipe, diff }` 보내는데 클라이언트는 `{ data, mods }` 기대
- 검증 방법: 서버의 Response 객체 리터럴과 클라이언트의 응답 destructuring을 같이 보기

### 경계 C: Zod 스키마 ↔ Supabase 테이블 컬럼

- 비교 대상: `lib/schema.ts` vs `supabase/migrations/*.sql`
- 흔한 버그: jsonb 컬럼 안의 nested 필드 누락, NOT NULL 제약 불일치
- 검증 방법: 테이블별로 컬럼 ↔ Zod 필드 매핑표 작성

### 경계 D: 핫픽스 step_event 타입 ↔ runtime.ts 집계 로직

- 비교 대상: `lib/schema.ts`의 StepEvent 유니온 vs `lib/runtime.ts`의 switch/match
- 흔한 버그: 새 핫픽스 종류 추가했는데 집계 로직이 default case에서 무시
- 검증 방법: 유니온의 모든 변종을 집계에서 처리하는지 exhaustive check

### 경계 E: Fingerprint traits ↔ 프롬프트 주입 형태

- 비교 대상: `lib/fingerprint.ts`의 traits 출력 vs `lib/prompt.ts`의 주입 문자열
- 흔한 버그: traits에 있는 정보를 프롬프트가 부분만 사용
- 검증 방법: 모든 trait 필드가 프롬프트에 도달하는지 추적

## 결함 보고서 작성

```markdown
## 검증 결과 — {task-id}

### 트레이스한 용접 라인
| 라인 | 시작 | 종착 | PASS/BLOCK | 비고 |
|------|------|------|------------|------|
| Line 1 | app/api/recipe | lib/prompt | BLOCK | known_issues 주입 누락 |
| ... |

### 경계면 비교
| 경계 | 송신 | 수신 | 일치 | 발견 |
|------|------|------|------|------|
| A | lib/prompt §출력명세 | lib/schema.RecipeState | NO | `timer_sec` vs `timerSec` |
| ... |

### 결함 목록
1. **{결함명}** — `{file}:{line}`
   - 영향: {용접 라인 끊김 / 경계 불일치 / 헌법 위반}
   - 권장 수정: {구체적 지시}
   - 재할당: {responsible agent}

### cold-start 검증
- [ ] RuntimeLog 없는 첫 사용자에서 BUILD가 정상 작동
- [ ] Fingerprint 없을 때 traits를 빈 객체로 일관 처리
- [ ] Postmortem 없는 신규 레시피의 첫 Cook에서도 Line 4가 작동
```

## 사용 예시

**검증 대상**: ROADMAP P1 "P1 lib/schema.ts 변경 + /api/run 작성" 완료 직후

**트레이스 결과**:
- Line 4: `/api/run`이 RuntimeLog 갱신 후 Fingerprint 재계산을 await하지 않는다 → BLOCK
- 경계 D: 새로 추가된 `step_event.type = "hotfix_water"` 변종을 `lib/runtime.ts`가 처리하지 않음 → BLOCK

**결정**: engine-builder에 재작업 요청. 트랜잭션 boundary 명시 + StepEvent exhaustive switch 강제.
