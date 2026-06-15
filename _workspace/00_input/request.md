# 사용자 요청 — P1.B Cook 사이드 사이클

ROADMAP P1의 두 번째 묶음. 용접 구조(§4·D-008)의 핵심이 코드 레벨에서 작동하기 시작하는 지점.

## 작업 범위

### 엔진 사이드 (engine-builder)
1. `lib/runtime.ts` 본문 — StepEvent[] → RuntimeLog 집계
   - StepEventType 4종(`done`/`timer_done`/`hotfix`/`failed_here`) 모두 처리 (exhaustive switch, 경계 D)
   - known_issues 누적 + 미해결 우선 정렬 (D-012 정합)
   - cold-start 케이스 (CookRun 0건 → 빈 RuntimeLog) 명시 처리

2. `lib/fingerprint.ts` 본문 — 여러 RuntimeLog → Fingerprint 교차분석
   - 사람별 부엌 지문 (화력 강함, 면류 주의, 단맛 회피 등)
   - confidence 점수 (TASTE.md §5 미정 — TASTE 컨설팅 가능성 높음)
   - cold-start (RuntimeLog 0개) → 빈 Fingerprint 일관 처리

3. `app/api/run/route.ts` 본문 — **D-008 용접 강제 지점** (가장 중요)
   - rate limit + env 가드 (P0 유지)
   - 인증 흐름 (D-015 패턴 동일 적용)
   - RequestBody 검증 (CookRun 입력)
   - **트랜잭션**: CookRun INSERT → RuntimeLog UPSERT → Fingerprint UPSERT — 셋 다 성공 또는 전부 롤백
   - cook_runs.completed=true && outcome=null 케이스 refine (P0 R5 잔존 위험 가드)
   - 응답: 갱신된 RuntimeLog/Fingerprint 요약 (다음 BUILD에 즉시 주입 가능하도록)

### UI 사이드 (ui-builder)
4. `components/CookMode.tsx` 본문 — 스텝 진행 + 타이머 + 핸즈프리 + 핫픽스
   - 스텝 1개 크게 (PRD §6 모바일 우선)
   - `timer_sec` 기반 타이머 + 백그라운드 알림
   - Wake Lock API (화면 켜짐 유지) + 폴백
   - 인라인 핫픽스 (D-006: 정식 RecipeState 수정 0, CookRun.step_events에만 기록)
   - 핫픽스 UX: "이번 회차만"이라는 임시성 시각 표시 (점선 테두리, 임시 배지)
   - 큰 버튼 (양념 묻은 손 친화)

5. `components/Postmortem.tsx` 본문 — 3단 평가 + 실패 스텝 핀포인트
   - 좋음 / 그냥 / 망함 3단 (TASTE.md §1 회고 4분류 원칙 vs PRD §3 3단 — 사이클 도중 통합 가능)
   - 실패 시 스텝 핀포인트 ("몇 번에서?")
   - **POSTMORTEM 없이 COOK 종료 불가** (§4 강제 규칙) — UI에서 강제
   - 30초 회고 (TASTE.md "회고 입력은 30초 내 완료를 우선" 원칙 — 만약 등재되었다면 따름)

## 운영 모드
풀 팀 5인: welding-architect + engine-builder + ui-builder + welding-inspector + doc-taste-scribe
- scribe는 TASTE 컨설팅 트리거 확률 높음 (timer UX, hotfix 카테고리, Fingerprint confidence 임계) — 처음부터 스폰

## 회색 영역 예측 (architect가 식별할 가능성 높음)
- timer 알림 권한 누락 시 UX (안내 vs 강제)
- Wake Lock 미지원 브라우저 폴백 정도 (주기적 인터랙션 vs 명시 안내)
- 핫픽스 카테고리 5종 명세 (D-006 강제 + TASTE.md §3 핫픽스 우선순위와 매칭)
- Postmortem 3단 vs TASTE 4분류 — 어느 쪽이 SSOT인가
- Fingerprint confidence 점수 계산 (관찰 횟수 N → confidence 함수)
- cook_runs.completed/outcome refine 본 사이클 처리 vs 다음 사이클

## 잔존 위험 (P0/P1.A에서 인계)
- R3 (UPSTASH fallback): /api/run에도 동일 가드
- R4 (service-role 오용): D-015 패턴 그대로
- R5 (트랜잭션 분리): **본 사이클의 핵심 가드**. /api/run에서 셋 다 묶지 못하면 §4 용접 깨짐
- R9 (SSOT 표류 재발): 라우트 안 z.object/z.enum 0건
- R12~R15: 동일 적용

## 헌법 강제 핵심 검증 항목 (Phase 4 inspector용)
- §4 강제 규칙 3개 모두 코드로 박혔는지:
  - Cook 시작 시 RuntimeLog/Fingerprint 조회 (이미 P1.A에서 강제)
  - 핫픽스 → step_events 기록 → POSTMORTEM 흘러감
  - POSTMORTEM 없이 COOK 종료 불가
- §4 금지 사항 3개 모두 회피:
  - Cook Mode 독립 화면화 금지 (CookMode가 종료 시 자동 Postmortem 진입 강제)
  - Postmortem 결과 → Fingerprint 반영 (단순 별점 아님)
  - "일단 예쁘게" 부분 구현 금지
