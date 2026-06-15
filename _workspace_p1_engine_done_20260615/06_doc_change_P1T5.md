# P1.T5 문서 동기화 변경 보고서

**작성자**: doc-taste-scribe
**일자**: 2026-06-15
**입력**:
- T1 보고서 `_workspace/02_welding_review_P1T1.md` (NEED_USER_DECISION 4건 + D-012/D-013/D-014 ADR 후보 + R12~R15 신규 가드)
- T1 사용자 결정 `_workspace/02b_user_decision_P1T1.md` (GA-1=A / GA-2=A N=5 / GA-3=C / GA-4=B)
- T2 보고서 `_workspace/04_engine_change_P1T2.md` (`lib/prompt.ts` 본문 + `trimKnownIssues`)
- T3 보고서 `_workspace/04_engine_change_P1T3.md` (`/api/recipe` 본문 + `lib/buildContext.ts` 신설 + §5 D-015 ADR 후보 메모)
- T4 보고서 `_workspace/07_inspection_P1T4.md` (PASS + §6.1 미세 메모 M-1)
- `docs/DECISIONS.md` (D-001~D-011) + `docs/MAP.md` + `docs/SESSION.md` + `CLAUDE.md`

---

## 1. 산출물 (5개 문서 동기화)

| 문서 | 위치/내용 | 사유 |
|------|----------|------|
| **`docs/DECISIONS.md`** | D-001 결과 섹션 끝에 "전체 상태 의미 (2026-06-15 명시화)" 한 줄 보강 + D-012/D-013/D-014 신규 등재 (각 ADR 형식 본문) | (1) D-001 미세 명시: 리더 지침 — 본문 무수정, 결과 섹션에 한 줄 명시 보강 (M-1 §6.1 정합). (2) 사용자 결정 GA-2/GA-3/GA-4 = 새 ADR. 결정 시점(2026-06-14) 명시. |
| **`docs/MAP.md`** | (a) 마지막 갱신 일자 갱신. (b) `lib/buildContext.ts` 행 신설 (✅). (c) `lib/prompt.ts` 행 상태 ✅ 승격 + 본문 설명. (d) `app/api/recipe/route.ts` 행 상태 ✅ 승격 + 본문 설명. (e) `DECISIONS.md` 행에 D-012/D-013/D-014 명시 + D-001 명시화 사실. (f) `_workspace/` 산출물 8건 P1 사이클 명단으로 교체 + `_workspace_p0_done_20260614/` 행 추가. (g) "현재 상태 요약" 섹션을 2026-06-15 시점으로 재작성. | T4 §9 인계 + 리더 지침. 신설 파일 + 상태 승격을 한 번에 정확히 반영. |
| **`docs/SESSION.md`** | "세션 2 — P1 엔진 코어 사이클" 신규 항목을 세션 1 위에 추가. 한 일 항목 6개 + 다음 할 일 10개(Cook 사이드 묶음 우선) + 막힌 것(D-015 컨설팅 + R16~R19 잔존 + TASTE §5 미정) + 메모 3개. | 헌법 §8.3 (세션 종료 시 한 일/다음 할 일/막힌 것 기록) + 리더 지침. 다음 사이클 진입자가 어디서부터 시작할지 정확히 알 수 있는 분량으로 작성. |
| **`CLAUDE.md`** | §9 변경 이력 표 마지막에 2026-06-15 행 한 줄 추가 | 헌법 §9는 하네스 변경 이력만 — P1 첫 묶음 완료 사실을 한 줄로 박음. 본문(§1~§8) 무수정. |
| **`_workspace/06_doc_change_P1T5.md`** (본 보고서) | 본 보고서 신설 | 다른 산출물처럼 변경 보고서로 트레이스 보존. |

---

## 2. ADR D-012/D-013/D-014 본문 작성 방침

세 ADR 모두 동일 패턴:
- **맥락**: T1 architect 보고서 §회색 영역 본문에서 식별된 ADR 공백 + ENGINE.md/D-009 어디에 미명시였는지 명확화.
- **결정**: T2/T3 본문의 실제 구현 위치/구조를 그대로 인용. 코드와 ADR이 표현 차이 없음.
- **이유**: 후보 비교 (A/B/C) — architect 보고서 §회색 영역 후보 비교를 응축 + 채택 후보의 강점 명시.
- **결과**:
  - 구체적 코드 위치 인용 (예: `route.ts:103-124`, `prompt.ts:43`).
  - 사용자 결정 시점(2026-06-14, `_workspace/02b_user_decision_P1T1.md`) 명시 — D-011과 같은 패턴(사후 등재 아닌 결정 시점 등재).
  - 변경 시 절차 (예: D-012의 N=5 변경은 ADR SUPERSEDED 처리 + 새 ADR).

**D-001 결과 섹션 한 줄**:
> "전체 상태 의미 (2026-06-15 명시화)": LLM은 변경된 필드만 부분 객체로 반환, 코드의 `splitDiff(prev, next)`가 prev + next를 결합하여 전체 상태를 복원. Zod 스키마(`RecipeStateSchema.nullable()`, 모든 필드 optional)가 두 해석 모두 통과시키며 결국 동일한 전체 상태를 복원. 변경 없으면 `null`.

이 한 줄은 D-001 본문의 "LLM은 `new_state`(변경 후 전체 상태)만 반환한다" 표현과 T2/T3 본문의 "부분 객체 + splitDiff 결합" 표현을 잇는 결합 해석을 제공 (M-1 정합 근거).

---

## 3. D-015 처리 — 리더 컨설팅 중

리더 지침("D-009 임의 결정 금지, 모호 시 SendMessage")에 따라 D-015 인증 ADR 등재 vs P2 이월 판단이 모호하여 `SendMessage`로 리더 컨설팅을 요청 (2026-06-15).

권고 = **즉시 등재 D-015**. 사유 4개:
1. 코드가 이미 작동 중이고 SSOT 1곳에 박혀 있어 ADR 없으면 향후 표류 위험 (D-011 사례와 동일 패턴).
2. ADR 범위를 "본 라우트가 채택한 인증 *경계 정책*"으로 한정 — 전체 인증 흐름(refresh/session/RLS/UI)은 명시적으로 D-015 결과 섹션에서 P2로 표기.
3. T4 inspector §9에서 후보 형태가 이미 잡혀 있음.
4. `/api/run` 후속 사이클 진입 시 동일 결정이 또 필요하므로 P2 이월 시 결정 시점이 두 번으로 분산됨.

**리더 결정** (2026-06-15): **즉시 등재 승인 — scribe 권고 4가지 모두 수용**. 리더 추가 지침:
- 범위 포함: Authorization Bearer JWT / anon 클라 검증(`supabaseServerAnonClient().auth.getUser`) / 401 분기 3종(missing_authorization, missing_token, invalid_token) / user_id 확정 후에만 service-role 호출(R4 가드).
- 명시적 P2 이월: refresh token 만료/갱신, 세션 영속(쿠키 vs 스토리지), RLS 정책별 user_id 매칭 매트릭스, 로그인 UI/OAuth.
- 본문 작성 출처: T3 §5 + T4 §3-A + T4 §9 응축 (architect 사전 가드 불필요).
- 형식: 기존 D-001~D-014와 동일 (맥락 → 결정 → 이유 → 결과). 결과 섹션에 P2 이월 항목 + `/api/run` 본문 인계 한 줄.

**적용 결과** (본 사이클 내 마무리 완료):
- `docs/DECISIONS.md` 끝에 D-015 등재 — 결정 6항(헤더/검증 클라/user_id 추출/401 분기 3종/R4 가드/SSOT) + 이유 4항(§4 용접 강제, R4 봉쇄, D-011 패턴 학습, D-009 정합) + 결과(SSOT 위치, P2 이월 4종, R16 별개 위험, `/api/run` 인계, 사용자 결정 시점 = 컨설팅 절차 포함 명시).
- `docs/SESSION.md` 갱신: "한 일" 항목에 D-015 등재 사실 + 컨설팅 절차 명시 추가, "다음 할 일" #8을 D-015 P2 이월 항목 확장으로 갱신, "막힌 것" 항목을 "없음 — D-015 등재로 명료화"로 마감.
- `docs/MAP.md` 갱신: DECISIONS.md 행을 "D-001~D-015. D-011 = P0 셸 부트스트랩, D-012/D-013/D-014/D-015 = P1 엔진 코어 사이클(known_issues 트리밍 / BuildContext 502 / TASTE stage 분기 / 인증 경계 정책)"으로 갱신.

---

## 4. 미수정 항목 (의도된 비커버리)

- **D-001 본문 (기존)**: 무수정. 결과 섹션에 한 줄 명시 보강만. 리더 지침 충실.
- **D-002~D-011 본문**: 모두 무수정. 본 사이클 영향 없음.
- **CLAUDE.md §1~§8**: 무수정. §9 변경 이력 한 줄만 추가.
- **ENGINE.md / PRD.md / DATA_MODEL.md / TASTE.md / ROADMAP.md / CONCEPT_2.0.md**: 본 사이클 무변경.
- **TASTE.md §5 미정 항목**: 본 사이클 결정 영역 밖. SESSION.md "다음 할 일" #9에 인계.
- **R16~R19 신규 ADR 후보화**: T4 §6에서 모두 "의도된 동작 또는 별도 ADR 후보"로 분류 — 본 사이클은 BLOCK 사유 아니라고 명시했고, ADR 후보 등재는 P2 영역. SESSION.md "막힌 것"에 위험 잔존 사실만 기록.

---

## 5. 자가 검증

| 점검 항목 | 결과 | 근거 |
|----------|------|------|
| **리더 지침 7개 작업 빠짐없이 처리** | 직전 사이클(P0) 학습 — ADR만 등재하고 나머지 누락한 사례 방지 | (1) ADR 4건 등재(D-012/D-013/D-014/D-015) + D-001 명시화 ✅ / (2) MAP.md 갱신 ✅ / (3) SESSION.md 세션 2 ✅ / (4) CLAUDE.md §9 한 줄 ✅ / (5) 본 보고서 ✅ / (6) task #5 completed ✅ / (7) 리더 완료 보고 ✅ |
| **D-001~D-014 기존 본문 무수정** | OK | D-001 결과 섹션 한 줄 보강만, 본문 자체는 1자도 안 건드림. D-002~D-014 무수정. D-015는 신규 등재(기존 본문 영향 0). |
| **ADR 등재 시점 명시 (사후 아님)** | OK | D-012/D-013/D-014 각 결과 섹션 끝에 "사용자 결정 시점: 2026-06-14 ... 본 ADR은 P1 엔진 코어 사이클 마무리 단계에서 정식 등재" 박음 (D-011 동일 패턴). |
| **임의 결정 금지 (D-009)** | OK | D-015 후보 등재/이월 판단을 임의로 내리지 않고 `SendMessage`로 리더 컨설팅. 리더 응답 전에는 SESSION.md "막힌 것" 항목에 "컨설팅 중"으로 표기, DECISIONS.md 무변경. |
| **TASTE 컨설팅 트리거 0건** | OK | 본 사이클 도메인 판단(맛/식감 분류, 스텝 분할 기준, 핫픽스 우선순위 등) 0건. 모든 결정은 시스템/구조 결정 (인증/트리밍/fallback/인용 방식). |
| **MAP.md 상태 정정 정확** | OK | `lib/prompt.ts` 행 ✅, `lib/buildContext.ts` 신설 ✅, `app/api/recipe/route.ts` ✅로 승격. `app/api/run/route.ts`/`lib/diff.ts`/`lib/runtime.ts`/`lib/fingerprint.ts`/`components/*`는 📋 유지. |
| **SESSION.md "다음 할 일" Cook 사이드 묶음 우선** | OK | 항목 1=`/api/run` 본문 (트랜잭션 골격), 2~4=`lib/{diff,runtime,fingerprint}.ts` 본문, 5~7=`components/*` 본문, 8=인증 흐름 전체, 9=TASTE §5, 10=FingerprintCard. Cook 사이드(1~7)를 인증 흐름(8)보다 앞에 배치. |
| **CLAUDE.md §9 한 줄 형식 일관** | OK | 기존 P0 행과 동일 형식: 날짜 \| 변경 내용 \| 대상 \| 사유. 본 사이클 행도 같은 형식. |
| **본 보고서 자체 트레이스 보존** | OK | `_workspace/06_doc_change_P1T5.md`로 신설. 직전 사이클(P0)의 `06_doc_change_T4.md`와 동일 패턴. |

---

## 6. 인계

- **team-lead**: D-015 컨설팅 응답 후 본 보고서 §3 + DECISIONS.md + SESSION.md 후속 갱신 + task #5 completed + 완료 보고. (단, 응답 지연 시 본 보고서 §3을 "응답 미수신, 후속 사이클 재개 시 우선 처리"로 명시하고 task #5 completed.)
- **P1 후속 사이클 진입자 (engine-builder / ui-builder)**: SESSION.md 세션 2 "다음 할 일" 1~10 항목 + DECISIONS.md D-012/D-013/D-014 본문 + MAP.md `lib/buildContext.ts` 행 참고. 인증 정책은 D-015 결정 결과를 따라 적용 (`/api/run`도 동일 패턴).
- **welding-architect (P1 후속 사이클 시작 시)**: `/api/run` 본문 + `lib/{diff,runtime,fingerprint}.ts` 본문 + `components/*` 본문이 한 번의 사전 가드로 묶일 수 있는지 검토. D-008 트랜잭션 강제 지점과 D-006(핫픽스 새 버전 금지)이 동시 강제되는 경계 표면을 사전에 식별 권고.
- **welding-inspector (P1 후속 사이클 마무리 시)**: 본 사이클 Line 1 풀 트레이스 + 경계 A 패턴을 Line 2~5 (Cook/Postmortem 흐름)에도 동일 깊이로 적용 권고. weld-trace 스킬 등록 점검을 사이클 진입 전 권고.
