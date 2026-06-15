"use client";

// POSTMORTEM 컴포넌트 (PRD.md §F-3, 신규).
//
// 용접 강제 (§4):
// - Cook 종료의 유일한 출구다. outcome ∈ {"good","meh","failed"} 중 하나가
//   입력돼야 화면을 떠날 수 있다. "건너뛰기" 버튼 금지.
// - "failed" 인 경우 step 핀포인트(어느 스텝에서 망했는지)를 추가 입력받아
//   CookRun.step_events 에 type:"failed_here" 로 합친다.
// - 결과는 POST /api/run 으로 보내져 RuntimeLog → Fingerprint 갱신 사슬을
//   트리거한다 (D-008 용접 강제 지점).
//
// P1 구현 진입점.

export default function Postmortem(): React.ReactElement {
  return (
    <section aria-label="postmortem">
      <p>POSTMORTEM placeholder — P1 에서 구현.</p>
    </section>
  );
}
