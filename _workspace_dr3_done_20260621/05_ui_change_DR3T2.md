# DR3.T2 UI 보고서 — cold-start hero

## 변경
- `components/BuildMode.tsx`:
  - HERO_TITLE / HERO_SUBTITLE / HERO_INPUT_PLACEHOLDER / HERO_QUICK_STARTS 5종 클라 상수
  - `showHero = messages.length === 0 && lastResponse === null` 분기 — true면 `<ColdStartHero>` 단독 렌더, false면 평소 2-pane
  - 신규 `<ColdStartHero>` 컴포넌트 — 시간 라벨(useEffect 60s 주기) + 큰 제목 + 부제 + 입력(samples + 우 원형 ↑) + 5개 quickstart 칩 + auth 미준비 hint + error
  - `formatTimeLabel(date)` 헬퍼 — 시간대(아침/점심/오후/저녁/밤) + 요일(평일 종일/주말)
- `app/globals.css` 신규 클래스:
  - `.cold-hero`, `.cold-hero-inner`, `.cold-hero-eyebrow`, `.cold-hero-title`, `.cold-hero-subtitle`, `.cold-hero-input`, `.cold-hero-hint`, `.cold-hero-quickstarts`, `.quickstart-chip`, `.cold-hero-alert`

## 헌법 정합
- D-021/D-027 4-요소·2-pane 패턴: hero는 *0번째 턴* (첫 입력 전), 첫 입력 후 자동으로 2-pane 진입
- D-022/D-023: mutation/undo 흐름은 hero에서 미노출 — 첫 입력 전이라 RecipeState 없음. 단 undoLast로 messages를 0으로 복원하면 다시 hero 노출 (자연)
- D-024/D-025: Plan/Context 메타도 hero에선 미노출 — 첫 응답 후 노출
- D-026 디자인 토큰 자연 적용 — Newsreader 큰 제목, JetBrains Mono eyebrow
- TASTE §4 친구 톤 — 0002 디자인의 부제 그대로

## 잔존 위험
- R-DR3-1: 시간 라벨 60초 주기 갱신 — Hydration 불일치 위험. 단 `useEffect` 안 클라 사이드만이라 SSR 영향 0 (초기값은 서버에서 계산, 클라 마운트 후 갱신 — 다를 가능성 있으나 React가 자동 처리).
- R-DR3-2: quickstart 칩이 *서버 호출 직행* — auth 미준비 시 disabled. authReady prop으로 차단.
- R-DR3-3: undo로 messages 0 복원 시 hero 다시 노출 — 의도된 동작 (자연스러움).

## 자동 검증
- typecheck PASS
- 6/6 test PASS
- SSR 마커 PASS: cold-hero / cold-hero-title / cold-hero-eyebrow / quickstart-chip / "오늘, 뭐가 있어요?" / "재료만 알려주면" / "냉장고 털기" / "10분 야식" / "두부 한 모..."
