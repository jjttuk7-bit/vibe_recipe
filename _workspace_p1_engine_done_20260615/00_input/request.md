# 사용자 요청 — P1 엔진 코어 사이클

ROADMAP P1의 첫 묶음 — 엔진 코어 두 항목:

1. `lib/prompt.ts` — 페어 쿠킹 시스템 프롬프트 본문 구현
   - ENGINE.md §3 입출력 계약을 따름
   - BuildContext(runtime_log + fingerprint + cold_start)를 systemPrompt에 주입
   - cold_start=true이면 "맹탕 모드" 명시 (CLAUDE.md §4 강제 규칙)
   - D-003 점진 빌드: 한 턴 한 단계 (concept→base→taste→steps→done)
   - D-005 강제: 스텝에 timer_sec 필드, 텍스트 파싱 금지

2. `app/api/recipe/route.ts` — 본문 채우기
   - 현재 placeholder(501) → Anthropic SDK 호출 + Zod 검증 + 자동 재시도(D-004)
   - rate limit 게이트(P0)와 env 가드(P0) 유지
   - BuildContextSchema로 입력 분기 (cold_start 처리)
   - EngineResponseSchema로 응답 검증 → 실패 시 1회 재호출, 2회 실패 시 502

## 컨텍스트 (반드시 읽기)
- CLAUDE.md (헌법)
- docs/DECISIONS.md (D-001~D-011)
- docs/ENGINE.md (입출력 계약)
- docs/PRD.md (도메인)
- docs/TASTE.md (도메인 판단 deferral 트리거)
- lib/schema.ts (현재 SSOT 상태)
- app/api/recipe/route.ts (P0 placeholder 골격 + BuildContext TODO 주석)
- _workspace_p0_done_20260614/ (P0 사이클 산출물 — 참조용)

## 운영 모드
축소 팀 3인: welding-architect + engine-builder + welding-inspector
(schema-architect는 schema 변경 신호 발생 시 추가 스폰)
(doc-taste-scribe는 TASTE 컨설팅 트리거 발생 시 추가 스폰)

## 잔존 위험 가드 대상 (P0 사이클에서 식별)
engine-builder의 04_engine_change_T2.md §5/§8-d 회귀 위험 R1~R11 — 이번 본문 작성 시 가드 적용 권고
