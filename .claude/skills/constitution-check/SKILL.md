---
name: constitution-check
description: "VIBE RECIPE 헌법(CLAUDE.md §1 철학, §4 용접 구조, §7 불변 결정 D-001~D-010) 충돌 여부를 표준 절차로 검증한다. welding-architect가 새 기능 제안·아키텍처 변경·새 ROADMAP 항목 시작 시 반드시 호출한다."
---

# Constitution Check — 헌법 충돌 표준 검증 절차

이 스킬은 `welding-architect` 에이전트가 사용하는 절차다. 입력으로 받은 작업 제안에 대해 CLAUDE.md와 DECISIONS.md를 순서대로 적용하여 PASS/BLOCK/NEED_USER_DECISION을 결정한다.

## 입력 / 출력

- 입력: 작업 제안 (텍스트 또는 `_workspace/01_tasks.md`의 작업 항목)
- 출력: `_workspace/02_welding_review_{task-id}.md`

## 검증 순서

### Step 1: §1 제품 철학 검증

각 작업에 대해 4가지 철학을 적용한다:

1. **요리는 컴파일이 아니라 런타임이다** — 이 작업이 "레시피 생성"에서 끝나고 실제 요리 결과로 수렴하지 않는다면? → BLOCK
2. **답변이 아니라 diff를 준다** — 결과를 채팅 버블·줄글로만 보여주려 한다면? → BLOCK (D-002 함께 검토)
3. **한 번에 완성하지 않는다** — 한 턴에 모든 단계를 통째로 처리하려 한다면? → BLOCK (단, D-003a 즉시 빌드 케이스는 예외)
4. **베끼려면 전부를 베껴야 한다** — 이 기능이 떼어내도 다른 단계가 완전하다면? → BLOCK (용접 실패)

### Step 2: §4 용접 구조 테스트 — 핵심 게이트

> "이 기능을 떼어내도 다른 단계가 여전히 완전한가?" → 답이 "예"면 BLOCK

다음 강제 규칙 위반 여부 점검:
- BUILD 시작 시 RuntimeLog/Fingerprint 조회 누락 → BLOCK
- COOK의 핫픽스가 CookRun.step_events에 기록되지 않음 → BLOCK
- POSTMORTEM 없이 COOK 종료 가능 → BLOCK

### Step 3: §7 불변 결정 (D-001~D-010) 매핑

작업 영역에 따라 해당 ADR을 적용:

| ADR | 작업 영역 시그널 | 검증 |
|-----|---------------|------|
| D-001 | LLM 응답 처리, diff | LLM이 diff를 만들고 있나? → BLOCK. 코드가 계산해야 함 |
| D-002 | UI 렌더링, splitDiff | 생성을 diff로 보여주려 하나? → BLOCK |
| D-003 | 프롬프트, 파이프라인 | 한 턴에 모든 단계 처리? → BLOCK (D-003a 예외 확인) |
| D-004 | API 에러, Zod | 자동 재시도 없이 사용자에게 에러 노출? → BLOCK |
| D-005 | 타이머, 스텝 | 텍스트에서 "3분" 파싱? → BLOCK. `timer_sec` 필드 사용 |
| D-006 | 핫픽스, 버전 | 핫픽스가 정식 레시피를 수정? → BLOCK. CookRun에만 기록 |
| D-007 | Fingerprint 우선순위 | 집단 지성 기능을 MVP에 넣으려 함? → DEFER to Phase 2 |
| D-008 | 모든 새 기능 | 용접 테스트 통과? → 통과(=떼어내도 완전)면 BLOCK |
| D-009 | 도메인 판단 | TASTE.md에 없는 판단 임의 결정? → BLOCK. doc-taste-scribe에 위임 |
| D-010 | 해자, 공급 측 | 공급 측 독점 / 반직관적 선택 MVP 채택? → DEFER |

### Step 4: 데이터 영속 검증

- localStorage 사용? → BLOCK (Supabase 필수, D-007 해자 자산)
- API 키 클라이언트 노출 위험? → BLOCK
- `/api/*` rate limit 없음? → 배포 전 P0 BLOCK (개발 중에는 WARN)

### Step 5: 결정 + 보고서 작성

```markdown
## 헌법 검증 결과 — {task-id}

**결정**: PASS / BLOCK / NEED_USER_DECISION
**검토 ADR**: D-00X, D-00Y, ...
**충돌 내역**: (BLOCK/NEED_USER 시) 어떤 §/ADR과 어떻게 충돌
**재설계 권고**: (BLOCK 시) 어떻게 고치면 통과되는지 / NEED_USER 시 사용자에게 묻을 후보 2~3개

## 용접 다이어그램
- 입력 데이터: {무엇}
- 송신 → 수신: {어디 → 어디}
- 다음 단계의 필수 입력으로 작동? (Y/N + 근거)
- cold start 케이스: 비어있을 때 처리 명시? (Y/N)

## 다음 에이전트에게 인계
- schema 변경 필요: Y/N (어떤 스키마)
- 엔진 변경 필요: Y/N (어떤 라우트/모듈)
- UI 변경 필요: Y/N (어떤 컴포넌트)
- TASTE 컨설팅 필요: Y/N (어떤 판단)
- 새 ADR 후보: Y/N (제안 ADR 번호 + 결정 요지)
```

## 사용 예시 (잘못된 제안과 결정)

**제안**: "Cook Mode를 별도 화면으로 만들고, 사용자가 명시적으로 저장 버튼을 눌러야 CookRun을 저장한다."

**검증**:
- Step 2 용접 테스트: Cook이 저장 없이 끝날 수 있다 → §4 강제 규칙 위반 (Postmortem/RuntimeLog로 흘러가지 않을 수 있음)
- Step 3 D-008: 떼어내도 BUILD가 작동(RuntimeLog 없이도) → 용접 실패 시그널

**결정**: BLOCK
**재설계 권고**: Cook 종료 시 자동으로 Postmortem 진입 강제, Postmortem 최소 1탭 회고 없이는 Cook 결과 폐기. 저장 버튼 자체를 없애고 진입/이탈을 자동 트랜잭션으로.
