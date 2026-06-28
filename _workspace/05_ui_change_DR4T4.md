# DR4.T4 UI 보고서 — 스트리밍 렌더

## 변경
- `components/BuildMode.tsx`:
  - `streamingText` state 추가 (null=비스트리밍).
  - `submit()`: `response.json()` 단발 → **SSE 스트림 소비**. 스트림 시작 전 실패(rate limit/auth/buildContext)는 일반 JSON 에러로 처리, 그 외 `consumeRecipeStream(response.body, setStreamingText)`.
  - `consumeRecipeStream()` 신규 헬퍼: `data:{json}\n\n` 프레임 파싱 → delta(누적 평문)/reset(폐기)/done(검증된 페이로드)/error(throw). `StreamClientEvent` 타입(서버 StreamEvent 와 1:1).
  - busy 버블: streamingText 있으면 실시간 평문 + `.stream-caret`, 없으면 "생각 중…".
  - 스크롤 effect 의존성에 streamingText 추가(타이핑 중 자동 스크롤).
  - finally 에서 setStreamingText(null).
- `app/globals.css`: `.stream-caret` + `@keyframes stream-caret-blink` (주황 깜빡임).

## 헌법 정합
- done 수신 전까지 recipeState/diff 미변경 → D-001/D-002 유지. 평문만 흐름.
- 옵션 칩/warnings/RecipeCanvas 는 done 후 기존과 동일 렌더.

## 잔존 위험
- R-DR4-1: cold-hero(messages=0) 첫 submit 은 hero 화면이라 채팅 영역 미노출 → 첫 응답 스트리밍은 안 보이고 send-btn busy 만. 첫 응답 done 후 2-pane 진입. 차기 사이클 후보(hero→2-pane 즉시 전환).
- M-DR4-1: 흘린 평문 끝 개행이 done 의 trim 된 message 로 교체되며 미세 정렬 변화 — 화장.
