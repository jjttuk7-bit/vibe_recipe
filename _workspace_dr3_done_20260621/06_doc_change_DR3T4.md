# DR3.T4 문서 보고서

## ADR 등재
**D-028 cold-start hero — 첫 진입 BUILD UX**
- `messages=0 && lastResponse=null` 분기 → `<ColdStartHero>` 단독 렌더
- hero 구성: 시간 라벨 동적 + 큰 제목 `오늘, 뭐가 있어요?` + 부제 + 입력 + quickstart 5종
- formatTimeLabel 시간대(아침/점심/오후/저녁/밤) + 요일(평일 종일/주말)
- 첫 입력 후 자동 2-pane 진입
- D-022/D-023/D-024/D-025/D-026/D-027 모두 무영향

## MAP / SESSION / CLAUDE
- DECISIONS ADR 범위: D-001~D-027 → D-001~D-028
- BuildMode 본문 갱신
- SESSION 세션 10 신설
- CLAUDE §9 한 줄 추가
- 현재 상태 요약에 "디자인 사이클 3 (DR3) 완료" 라인

## 검증
- typecheck PASS / 6/6 test PASS / welding-inspector DR3.T3 결함 0
- SSR: cold-hero / cold-hero-title / cold-hero-eyebrow / quickstart-chip + 텍스트 "오늘, 뭐가 있어요?" / "재료만 알려주면" / "냉장고 털기" / "10분 야식" / "두부 한 모..." 모두 매치
