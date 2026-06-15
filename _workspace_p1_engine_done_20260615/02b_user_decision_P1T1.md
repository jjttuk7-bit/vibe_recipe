# P1.T1 NEED_USER_DECISION 답변

**일자**: 2026-06-14
**결정자**: 사용자 (유케이)

## 채택 결과 (모두 architect 권고대로)

| 회색 영역 | 채택 | 등재 ADR |
|----------|------|---------|
| GA-1 D-003a 모드 자동 판단 | **A** — 키워드 매칭만 | 불필요 (ENGINE.md §4.4 충족) |
| GA-2 known_issues 토큰 트리밍 | **A** — 최근 N=5 + 미해결 우선 | **D-012** |
| GA-3 BuildContext 조회 실패 fallback | **C** — 1회 재조회 후 502 | **D-013** |
| GA-4 systemPrompt TASTE.md 인용 | **B** — stage별 원칙 인용 | **D-014** |

## 구현 지침 (T2/T3에게)

### GA-1 (T2)
- 시스템 프롬프트에 자연어 규칙: "사용자가 '알아서', '한번에', '대충', '다 해줘', '빠르게', '바로' 등 일괄 위임 키워드를 명시하면 done 단계까지 일괄 진행. 기본은 한 턴 한 단계."
- 별도 inferMode 함수 추가 금지 (D-003a 본격 P2 이월)

### GA-2 (T2)
- `lib/prompt.ts`의 known_issues 주입 로직:
  ```ts
  // 미해결 우선 정렬 후 최근 5개
  const sorted = [...known_issues].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1; // unresolved first
    return /* timestamp desc */;
  });
  const trimmed = sorted.slice(0, 5);
  ```
- 트리밍 사실을 시스템 프롬프트에 메타 명시 ("최근 5개 회피 사항만 표시")

### GA-3 (T3)
- `app/api/recipe/route.ts` 본문의 BuildContext 조회:
  ```ts
  let buildContext: BuildContext;
  try {
    buildContext = await fetchBuildContext({ recipeId, userId });
  } catch (e1) {
    try {
      buildContext = await fetchBuildContext({ recipeId, userId }); // 1회 재시도
    } catch (e2) {
      return jsonResponse(502, { error: "build_context_fetch_failed", message: "지난 기록을 불러오지 못했어요. 다시 시도해주세요." });
    }
  }
  ```
- 502 응답은 D-004 엔진 502와 동일 UX (재시도 버튼)
- "데이터 없음(첫 사용자)"은 fetchBuildContext가 cold_start=true로 반환 (502 아님)

### GA-4 (T2)
- `lib/prompt.ts`의 stage별 분기 안에 TASTE.md 인용:
  - stage="concept": (TASTE 인용 0)
  - stage="base": (TASTE 인용 0, 단순 ingredient mapping)
  - stage="taste": TASTE.md §1 맛 6축 + 식감 5축 인용
  - stage="steps": TASTE.md §2 스텝 분할 원칙 인용 (최대 6스텝, 한 동작+한 판단, 핵심 스텝 1개)
  - stage="done": TASTE.md §3 핫픽스 우선순위 표 인용
  - 모든 stage 공통: TASTE.md §4 언어 톤 인용
- §5 미정 항목은 임베드 0

## 등재할 ADR 초안

ADR D-012, D-013, D-014는 P1 엔진 코어 사이클 완료 시 doc-taste-scribe가 일괄 등재.
초안은 본 결정 기록 + welding-architect 보고서 §회색 영역 본문을 기준으로 작성.

## 회귀 위험 R12~R15 가드 적용 의무

architect 보고서 §위험 잔존의 R12 (JSON 추출 무한 루프), R13 (messages 8턴 초과), R14 (options 15자 초과), R15 (new_state 부분 반환)는 T2/T3 본문 작성 시 반드시 가드 적용.
