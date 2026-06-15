---
name: viberecipe-orchestrator
description: "VIBE RECIPE(바이브 레시피) 프로젝트의 6명 에이전트 팀을 조율하는 오케스트레이터. ROADMAP 항목 구현, BUILD/COOK/POSTMORTEM 기능 추가, schema/엔진/UI 변경, 새 ADR 등재, 핫픽스·RuntimeLog·Fingerprint 관련 작업, 용접 정합성 검증 시 반드시 사용한다. 후속 작업: 이전 작업 수정/재구현/보완, 부분 재실행, 검증 결함 수정, 새 ADR 추가, ROADMAP 다음 항목 진행도 모두 이 스킬을 사용."
---

# VIBE RECIPE Orchestrator — 헌법 준수형 6인 에이전트 팀 조율

VIBE RECIPE 프로젝트의 모든 구현/수정 작업을 조율한다. 핵심 가치는 **헌법(CLAUDE.md) 사전 가드 → 정합성 사후 검증**의 양방향 보호다.

## 실행 모드: 에이전트 팀

6명의 전문가가 SendMessage·공유 작업 목록으로 자체 조율한다. 단, **항상 welding-architect가 PASS를 낸 뒤에만 구현 에이전트가 작업한다** (헌법 사전 가드 강제).

## 에이전트 구성

| 팀원 | agent_type | 역할 | 1차 산출물 |
|------|-----------|------|----------|
| welding-architect | welding-architect | 헌법·용접 사전 가드 | `_workspace/02_welding_review_*.md` |
| schema-architect | schema-architect | Zod + Supabase SSOT | `lib/schema.ts`, `supabase/migrations/*.sql`, `_workspace/03_schema_change_*.md` |
| engine-builder | engine-builder | LLM 엔진 + API 라우트 + lib/ | `app/api/*`, `lib/prompt.ts` `lib/diff.ts` `lib/runtime.ts` `lib/fingerprint.ts`, `_workspace/04_engine_change_*.md` |
| ui-builder | ui-builder | React 컴포넌트 + 모바일 UX | `components/*.tsx`, `_workspace/05_ui_change_*.md` |
| doc-taste-scribe | doc-taste-scribe | 문서 동기화 + TASTE 컨설팅 | `docs/*.md`, `CLAUDE.md` 변경 이력, `_workspace/06_doc_change_*.md` |
| welding-inspector | welding-inspector | 사후 용접 트레이스 + 경계면 비교 | `_workspace/07_inspection_*.md` |

## 워크플로우

### Phase 0: 컨텍스트 확인

`_workspace/` 디렉토리 확인으로 실행 모드 결정:

1. **`_workspace/` 미존재** → 초기 실행. Phase 1로 진행
2. **`_workspace/` 존재 + 부분 수정 요청** → 부분 재실행. 해당 작업 ID의 산출물만 재생성, 나머지는 보존
3. **`_workspace/` 존재 + 새 입력 제공** → 새 실행. 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동 후 Phase 1
4. **검증 결함 수정 요청** → `_workspace/07_inspection_*.md`를 읽고 결함 목록의 책임 에이전트에게만 작업을 재할당

### Phase 1: 작업 분해

1. 사용자 요청 분석:
   - ROADMAP 항목 1개인가, 여러 개인가, 즉흥 기능 추가인가
   - 영향 받는 계층 (schema/engine/ui/doc) 추정
   - 새 도메인 판단이 필요해 보이는가 (taste-consult 트리거)
2. `_workspace/00_input/request.md`에 요청 본문 저장
3. `_workspace/01_tasks.md`에 작업 분해표 저장:
   - 각 작업에 고유 ID, 영향 계층, 의존성 명시
4. 작업 분해는 보수적으로 — 한 모듈에 한 작업. "전체를 한 번에"는 피한다 (D-003 한 턴 한 단계의 정신).

### Phase 2: 팀 구성

```
TeamCreate(
  team_name: "viberecipe-team",
  members: [
    { name: "welding-architect", agent_type: "welding-architect", model: "opus",
      prompt: "당신은 헌법 가디언입니다. _workspace/01_tasks.md의 각 작업에 대해 CLAUDE.md §1·§4·§7 및 DECISIONS.md를 기준으로 사전 검증 보고서를 작성하세요. PASS 전까지 구현 에이전트는 대기합니다." },
    { name: "schema-architect", agent_type: "schema-architect", model: "opus",
      prompt: "당신은 데이터 모델 SSOT 책임자입니다. welding-architect의 PASS 보고서를 받은 후 lib/schema.ts와 supabase 마이그레이션을 작성하세요. DATA_MODEL.md를 기준으로 합니다." },
    { name: "engine-builder", agent_type: "engine-builder", model: "opus",
      prompt: "당신은 엔진 빌더입니다. PASS + 스키마 보고서를 받은 후 app/api/*와 lib/{prompt,diff,runtime,fingerprint}.ts를 구현합니다. D-001·D-004·D-008을 코드로 강제하세요." },
    { name: "ui-builder", agent_type: "ui-builder", model: "opus",
      prompt: "당신은 UI 빌더입니다. PASS + 스키마 + (필요 시) 엔진 보고서를 받은 후 components/*를 구현합니다. 모바일 우선, 핸즈프리, D-002 렌더 분리를 지키세요." },
    { name: "doc-taste-scribe", agent_type: "doc-taste-scribe", model: "opus",
      prompt: "당신은 문서·취향 운영자입니다. 다른 에이전트의 변경에 따라 docs/*를 갱신합니다. TASTE.md에 없는 도메인 판단 요청이 오면 임의 결정하지 말고 리더에게 사용자 질문 트리거를 요청하세요." },
    { name: "welding-inspector", agent_type: "welding-inspector", model: "opus",
      prompt: "당신은 사후 정합성 검증자입니다. 각 모듈 완성 직후 트레이스 + 경계면 비교를 수행합니다. 결함 발견 시 책임 에이전트에게 SendMessage로 수정 요청하세요." }
  ]
)
```

작업 등록:
```
TaskCreate(tasks: [
  { id: "T1.welding-review", title: "헌법 사전 검증", assignee: "welding-architect" },
  { id: "T2.schema",   title: "스키마 변경",        assignee: "schema-architect", depends_on: ["T1.welding-review"] },
  { id: "T3.engine",   title: "엔진/API 구현",      assignee: "engine-builder",   depends_on: ["T2.schema"] },
  { id: "T4.ui",       title: "UI 구현",            assignee: "ui-builder",       depends_on: ["T2.schema", "T3.engine (API 응답 합의)"] },
  { id: "T5.docs",     title: "문서 동기화",        assignee: "doc-taste-scribe", depends_on: ["T2.schema","T3.engine","T4.ui"] },
  { id: "T6.inspect",  title: "용접 트레이스 검증", assignee: "welding-inspector", depends_on: ["T3.engine","T4.ui"] }
])
```

> T4(UI)는 T3(엔진)에 약한 의존이다 — UI는 엔진 구현 전에도 API 응답 shape이 합의되면 시작 가능. 두 에이전트가 메시지로 사전 협의한다.

### Phase 3: 사전 가드 (welding-architect 단독 선행)

- **실행 모드**: 에이전트 팀
- welding-architect만 먼저 T1을 수행. 나머지 5명은 PASS 보고서를 대기.
- `_workspace/02_welding_review_*.md`의 결정 분기:
  - **PASS** → Phase 4로
  - **BLOCK** → 리더가 사용자에게 즉시 보고. 재설계 후 Phase 1부터 재진행
  - **NEED_USER_DECISION** → 리더가 후보를 사용자에게 질문. 답변 후 다시 사전 가드

### Phase 4: 병렬 구현 + 점진 검증

- **실행 모드**: 에이전트 팀
- 의존성 순서로 T2 → T3·T4(병렬) → T5 진행
- **TASTE 컨설팅 인터럽트**: engine/ui가 도메인 판단 필요를 감지하면 doc-taste-scribe에게 SendMessage. scribe가 리더에게 사용자 질문 트리거를 요청 → 리더가 사용자에게 질문 → 답변을 scribe에게 회신 → scribe가 TASTE.md에 등재 후 요청자에게 결정 통보. 그 동안 해당 작업만 대기, 나머지는 계속.
- **점진 검증**: 각 모듈(T2, T3, T4)이 완성될 때마다 welding-inspector가 T6의 부분 트레이스를 수행.
  - 결함 발견 시 즉시 SendMessage로 책임자에게 수정 요청 (전체 완성 대기 안 함)
  - 결함 수정 후 재트레이스 → PASS 확인 후 다음 모듈로

### Phase 5: 통합 검증 + 문서 동기화

- **실행 모드**: 에이전트 팀
- welding-inspector가 전체 용접 다이어그램을 트레이스 (시작점에서 종착점까지 cold-start 케이스 포함)
- doc-taste-scribe가 모든 산출물을 종합하여 docs/* 일괄 갱신
- ROADMAP 체크박스, MAP.md, SESSION.md 갱신
- CLAUDE.md 변경 이력에 이번 작업 등재

### Phase 6: 정리 및 보고

1. 팀 정리: `TeamDelete("viberecipe-team")`
2. `_workspace/`는 보존 (사후 감사용)
3. 사용자에게 결과 요약 보고:
   - 변경된 코드 파일 목록
   - 새 ADR (있을 시)
   - TASTE.md 신규 원칙 (있을 시)
   - 다음 ROADMAP 후보
   - **피드백 요청**: "결과에서 개선할 부분이 있나요?" (Phase 7-1)

## 데이터 흐름

```
[리더] → TeamCreate
            ↓
[welding-architect] —PASS→ [schema-architect] → lib/schema.ts
                                  ↓
                          (브로드캐스트: 새 타입)
                                  ↓
                   ┌──[engine-builder]→ app/api/*, lib/*
                   │      ↑↓ (API shape 합의)
                   └──[ui-builder]   → components/*
                                  ↓
            ←—사후 결함 SendMessage——[welding-inspector]
                                  ↓
                          [doc-taste-scribe]→ docs/*, CLAUDE.md
                                  ↓
                            최종 보고서
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| welding-architect가 BLOCK | 리더가 사용자에게 즉시 보고 → 재설계 사이클 |
| TASTE.md 누락 | doc-taste-scribe → 리더 → 사용자 질문 → 회신 후 등재 → 진행 |
| 사용자가 TASTE 질문에 즉답 못 함 | "추후 결정" 표시 + 가장 보수적 기본값으로 진행 + TASTE.md에 보류 등재 |
| schema-engine 또는 engine-ui 경계 불일치 | welding-inspector가 발견 → 양쪽에 동시에 SendMessage → 합의된 shape으로 재구현 |
| welding-inspector가 헌법 위반 발견 | welding-architect 재호출 → 사전 가드 보강 → 재설계 |
| 팀원 응답 없음 | 리더가 SendMessage로 상태 확인 → 재시작 → 재실패 시 사용자에게 보고 |
| 트랜잭션 실패 (api/run의 RuntimeLog 갱신) | engine-builder가 트랜잭션 롤백 로직 추가 → 재검증 |

## 실행 모드 변형 (특수 케이스)

대부분의 작업은 위 6인 풀팀이지만, 다음 케이스는 축소 팀으로 운영:

| 케이스 | 운영 |
|--------|------|
| 문서만 갱신 (오타·서술 개선) | doc-taste-scribe 단독 + welding-architect 사전 검토 |
| 검증 결함 수정 (welding-inspector 보고서 기반) | 책임 에이전트 + welding-inspector 재검증 (architect 재호출 없음) |
| TASTE.md만 보강 | doc-taste-scribe + 리더가 사용자에게 질문 |
| ROADMAP P0 보안 항목 (rate limit, env 점검) | welding-architect + engine-builder + welding-inspector |

축소 팀 운영 시에도 `_workspace/` 산출물 컨벤션은 유지한다.

## 테스트 시나리오

### 정상 흐름: ROADMAP P1 "lib/schema.ts에 timer_sec + CookRun/RuntimeLog/Fingerprint 추가"
1. 사용자 입력 → Phase 1에서 T1~T6 분해
2. T1: welding-architect → D-005·D-008 적용 확인 → PASS (RuntimeLog가 다음 BUILD에 들어가는 경로 명시)
3. T2: schema-architect → Zod 스키마 + 마이그레이션 작성 → 변경 보고서
4. T3: engine-builder → 새 타입을 lib/prompt.ts와 lib/runtime.ts에 반영, /api/run 트랜잭션 작성
5. T4: ui-builder → CookMode가 새 step.timer_sec 사용
6. T6 부분 검증: welding-inspector가 핫픽스 → RuntimeLog → 다음 BUILD 프롬프트 트레이스 → PASS
7. T5: doc-taste-scribe → DATA_MODEL.md/MAP.md/ROADMAP P1 체크박스 갱신, ADR 후보 없음 확인
8. 최종 보고: 변경 파일 목록 + 다음 P1 후보 + 피드백 요청

### 에러 흐름: TASTE.md 누락 인터럽트
1. T3 도중 engine-builder가 프롬프트 작성 중 "맛 게이지 항목 수"가 TASTE.md에 없음을 감지
2. doc-taste-scribe에게 SendMessage → 리더에게 사용자 질문 트리거 요청
3. 리더가 사용자에게 5개 / 6개 / 9개 후보 + 트레이드오프 제시
4. 사용자가 6개 선택 → scribe가 TASTE.md에 등재 (단, 원칙으로 일반화)
5. engine-builder가 결정 통보 받고 T3 재개
6. 나머지 작업은 인터럽트 동안 계속 진행됨
