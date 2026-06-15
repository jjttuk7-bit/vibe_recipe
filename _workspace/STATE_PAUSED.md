# P1.B Cook 사이드 사이클 — 일시 정지 (Resume 안내)

**정지 시점**: 2026-06-15 사용자 한도 제한 도달
**팀 정리**: viberecipe-p1-cook 셧다운 + TeamDelete (다음 세션에서 재구성)

## 진행 상태 스냅샷 (정정 — 정지 직전 architect 보고 도착)

| 작업 | 상태 | 비고 |
|------|----------------|------|
| P1B.T1 헌법 가드 | **completed** (셧다운 직전 보고 도착) | **`02_welding_review_P1BT1.md` 디스크에 존재**. 회색 영역 7개(GB-1~7) 정리 완료, 권고 모두 포함. NEED_USER_DECISION 상태 |
| P1B.T2 lib/runtime + lib/fingerprint | pending (blocked) | engine-builder가 4개 결정 후보 사전 정리: 트랜잭션 방식, confidence 공식, authenticateRequest 위치, refine 위치 |
| P1B.T3 /api/run 트랜잭션 | pending | T2 완료 후 |
| P1B.T4 CookMode + Postmortem | pending (정지 시 in_progress였음, 정지 시 골격만 진행 시작했었음) | ui-builder가 5개 회색 영역 식별 |
| P1B.T5 검증 | pending | T3+T4 후 |
| P1B.T6 문서 동기화 | pending (정지 시 in_progress였음) | scribe가 잘못 claim, 본 작업은 T1~T5 완료 후 진입 |

## 다음 세션 재개 절차

1. 새 세션에서 `_workspace/00_input/request.md` 읽기 (작업 범위 보존됨)
2. 본 STATE_PAUSED.md 읽기
3. 사용자 요청: "P1.B Cook 사이드 사이클 재개"
4. 새 팀 viberecipe-p1-cook 생성 (이전 팀은 TeamDelete됨)
5. 5인 풀팀 재스폰
6. T1부터 다시 진행 — architect에게 engine-builder/ui-builder가 식별한 9개 결정 후보를 사전 인계 (아래 부록)

## 부록: architect 보고서의 GB-1~7 (이미 정리되어 있음, 다음 세션에서 그대로 사용자 결정 받으면 됨)

| ID | 항목 | architect 권고 | 신규 ADR |
|----|------|---------------|---------|
| GB-1 | 핫픽스 카테고리 5종 | A: TASTE §3 4종 + 기타 1종 | D-016 |
| GB-2 | Postmortem 평가 (3단 vs 4분류) | A: PRD §3 3단 유지 (TASTE §1은 회고 분류 아니라 맛/식감 축이라는 정정) | 불필요 |
| GB-3 | Fingerprint confidence 계산식 | A: 단순 빈도 N/5 | D-017 |
| GB-4 | timer 알림 권한 거부 UX | C: 요청 + Wake Lock 강제 fallback | D-018 |
| GB-5 | Wake Lock 미지원 폴백 | B: 명시 안내 + 통과 | 불필요 |
| GB-6 | completed=true && outcome=null refine 위치 | A: SQL CHECK + Zod refine 둘 다 | 불필요 |
| GB-7 | authenticateRequest 추출 위치 | A: lib/auth.ts 신설 | 불필요 |

신규 ADR 3건(D-016/D-017/D-018) + 신규 파일 2건(supabase/migrations/0002_run_constraint.sql, lib/auth.ts)이 사용자 결정 후 작업 범위.

트랜잭션 방식: architect가 RPC(A)를 권고 본문에 박음 — 별도 GB 항목 아님. 보상 패턴은 R5 직접 위반이라 후보에서 제외.

## (이전) 정지 시점 팀원 식별 결정 후보 — 위 GB로 통합됨

### engine-builder의 4건 (T2/T3 직접 영향)
1. **트랜잭션 방식**: A. RPC 함수(supabase/migrations/0002_save_cook_run.sql, plpgsql) vs B. 클라 보상. **권고 A**.
2. **Fingerprint confidence 공식**: TASTE.md §5 #3 미정. 후보: 관찰 N≥3 + 비율≥0.6 / 1-exp(-N/k) / 단순 비율 + 게이트.
3. **authenticateRequest shared util**: lib/auth.ts 신설 vs /api/recipe export 재사용. D-015 SSOT 정합.
4. **completed/outcome refine 위치**: Zod CookRunSchema.refine vs 라우트 분기 vs DB CHECK.

### ui-builder의 5건 (T4 직접 영향)
5. **핫픽스 카테고리 5종**: TASTE §3 4행에 5번째 추가? "기타(자유)" / "느끼함" / 다른?
6. **Postmortem 분류**: PRD §3 3단(좋음/그냥/망함) vs TASTE 회고 분류 원칙 (등재되어 있지 않음). 신규 등재 필요.
7. **Wake Lock 미지원 폴백**: 안내 / 주기적 인터랙션 / 차단 / 토스트 only.
8. **Notifications 권한 누락 UX**: 인페이지 비주얼 + 사운드 폴백 / 권한 재요청 강제 / 토스트만.
9. **cook_runs.completed/outcome refine 위치**: 위 #4와 동일.

### doc-taste-scribe의 4건 TASTE 트리거 후보 (사전 정리)
- Postmortem 3단 vs 4분류 (위 #6과 연동) — 신규 TASTE 원칙 등재 케이스
- 핫픽스 카테고리 5종 명세 (위 #5와 연동) — 응급 카테고리 일반화 원칙
- Fingerprint confidence 계산 (위 #2와 연동) — TASTE §5 #3 해소
- Wake Lock 폴백 (위 #7과 연동) — TASTE 영역 여부 판단 필요

## 권고 (다음 세션 시작 시)

T1이 이미 완료되어 있으므로 다음 세션은 다음 흐름으로:

1. STATE_PAUSED.md + 02_welding_review_P1BT1.md 둘 다 읽기
2. **GB-1~7 중 신규 ADR 후보(GB-1/GB-3/GB-4) 3건을 사용자에게 한 번에 묻기** (AskUserQuestion 4문항 한도라 ADR 후보 3건 + 일부 선택). 나머지(GB-2/5/6/7)는 architect 권고 그대로 채택 권한 부여 받으면 묶어 처리.
3. 사용자 결정 후:
   - schema-architect 호출 (마이그레이션 0002 + Zod refine, GB-6)
   - engine-builder 호출 (lib/auth.ts 신설 + lib/runtime/fingerprint 본문 + /api/run RPC 호출 본문)
   - ui-builder 호출 (CookMode + Postmortem, GB-1/GB-4/GB-5 적용)
   - welding-inspector 호출 (5라인 + 경계 D)
   - doc-taste-scribe 호출 (D-016/D-017/D-018 등재 + TASTE §3 5번째 카테고리 + TASTE §5 #3 해소)
4. 5인 풀팀 + schema-architect = 6인 (전팀)

T1 사전 가드가 끝났으므로 다음 세션은 결정 → 구현 → 검증 → 문서 일직선. TASTE 인터럽트가 architect 단계에서 미리 가지치기되었음.

## 코드 상태 (정지 시점)

- 모든 파일은 P1.A(엔진 코어) 종료 시점 그대로 (P1.B 변경 0건)
- lib/* 9개, components/* 3개(placeholder), app/api/{recipe,run}/* (recipe는 본문, run은 placeholder)
- DECISIONS.md D-001~D-015, MAP.md/SESSION.md/CLAUDE.md 직전 사이클 종결 상태

다음 세션에서 재개하시면 됩니다.
