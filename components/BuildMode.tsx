"use client";

// BUILD 모드 컴포넌트 (PRD.md §F-1, 현재 v3 까지 구현됨 — 이 파일은 셸 placeholder).
//
// 용접 강제 (§4):
// - BUILD 시작 시 해당 사용자/레시피의 Fingerprint, RuntimeLog 를 반드시
//   서버에서 조회해야 한다. 빈 응답이면 "맹탕 모드" UI 로 명시.
// - 첫 turn 의 systemPrompt 는 lib/prompt.ts 의 buildSystemPrompt 가 만든다.
//
// P1 구현 진입점.

export default function BuildMode(): React.ReactElement {
  return (
    <section aria-label="build-mode">
      <p>BUILD MODE placeholder — P1 에서 구현.</p>
    </section>
  );
}
