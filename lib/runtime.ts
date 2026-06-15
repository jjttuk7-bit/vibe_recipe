// CookRun → RuntimeLog 집계 (DATA_MODEL.md §3).
//
// 용접 의존성 (D-008):
//
//   CookRun.step_events  ──aggregate──>  RuntimeLog.known_issues
//        (한 번의 조리)                       (레시피 누적 학습)
//
// - `type: "failed_here"` / `type: "hotfix"` 이벤트가 같은 step_index 에
//   반복 등장하면 known_issues 한 줄로 응축된다.
// - `fix_applied` 가 검증된(다음 run 에서 같은 step 이 안 터진) 경우
//   resolved=true.
//
// 본 파일은 placeholder. 시그니처 가이드 (P1):
//
//   rebuildRuntimeLog(recipeId: string, runs: CookRun[]): RuntimeLog
//
// 호출자 (app/api/run/route.ts) 가 CookRun 저장 직후 같은 트랜잭션 안에서
// 호출해야 한다. 떨어뜨리면 §4 용접 깨짐.

export {};
