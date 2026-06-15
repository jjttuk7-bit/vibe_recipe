"use client";

// COOK 모드 컴포넌트 (PRD.md §F-2, 신규).
//
// 용접 강제 (§4 + D-008):
// - 스텝 진행은 RecipeState.steps[i].timer_sec 를 그대로 쓴다. 텍스트 파싱
//   금지 (D-005). 시간 없는 스텝은 timer_sec=0.
// - 인라인 핫픽스는 CookRun.step_events 에 type:"hotfix" 로 기록만 한다.
//   RecipeState 는 절대 변경 금지 (D-006).
// - **Cook 종료 시 Postmortem 자동 진입 강제** (§4): outcome 입력 없이 cook
//   화면을 떠날 수 없다. modal/blocking route 둘 중 하나로 강제.
//
// P1 구현 진입점.

export default function CookMode(): React.ReactElement {
  return (
    <section aria-label="cook-mode">
      <p>COOK MODE placeholder — P1 에서 구현.</p>
    </section>
  );
}
