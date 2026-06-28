# DR4 작업 분해

| ID | 작업 | 영향 계층 | 의존성 | 책임 |
|----|------|----------|--------|------|
| DR4.T1 | 헌법 사전 가드 — 3개 후보 검증 + 회색영역 정리 | — | — | welding-architect |
| DR4.T1b | NEED_USER_DECISION 회신 (스트리밍 방식 등) | — | T1 | 리더→사용자 |
| DR4.T2 | (필요 시) schema — 응답 모드/되묻기 필드 | lib/schema.ts | T1b | schema-architect |
| DR4.T3 | 엔진 — 스트리밍 전송 + 제안/되묻기 프롬프트 | app/api/recipe, lib/prompt | T2 | engine-builder |
| DR4.T4 | UI — 스트리밍 렌더 + 제안/되묻기 + 근거 투명성 | components/BuildMode, globals.css | T2,T3 | ui-builder |
| DR4.T5 | 문서 — ADR(D-029~) + MAP/SESSION/CLAUDE | docs/* | T2~T4 | doc-taste-scribe |
| DR4.T6 | 용접 트레이스 검증 | — | T3,T4 | welding-inspector |

> 운영 노트: 이 하네스 인스턴스에는 커스텀 agent_type/TeamCreate가 비활성. 리더가 각 역할을 순차 수행하되 _workspace 산출물 컨벤션과 Phase 게이트(T1 PASS 전 구현 금지)는 그대로 강제한다.

## 현재 상태: 전체 완료 (DR4.T6 PASS 결함 0, D-029 등재)
- T1 PASS / T1b 결정: 방식 B + 범위 ① 스트리밍
- T2 schema / T3 engine / T4 ui / T5 docs / T6 inspect 모두 완료
- typecheck PASS · 6/6 test PASS
