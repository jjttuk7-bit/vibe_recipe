// splitDiff: 생성 vs 수정 분리 (D-001 / D-002).
//
// 헌법:
// - **D-001**: diff 는 LLM 이 아니라 코드가 계산한다. LLM 은 new_state 전체를
//   반환하고, 이 함수가 prevState 와 비교하여 "수정(diff)" 과 "생성(new card)"
//   을 갈라낸다.
// - **D-002**: 새 필드는 산출물 카드로, 기존 필드 변경만 diff 로. (git 이 새
//   파일에 +500 줄 diff 를 안 보여주는 이유.)
//
// 입력/출력 시그니처 (P1 구현 시):
//   splitDiff(prevState: RecipeState | null, newState: RecipeState): {
//     created: Array<{ field: keyof RecipeState; value: unknown }>;
//     modified: Array<{ field: keyof RecipeState; before: unknown; after: unknown }>;
//   }
//
// prevState 가 null 이면 모든 변경은 created. 의도된 동작 (콜드 빌드).

export {};
