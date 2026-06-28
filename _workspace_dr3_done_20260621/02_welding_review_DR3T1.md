# DR3.T1 — cold-start hero 정의

## 헌법 검증
- D-021 / D-027 4-요소·2-pane 패턴: cold-start hero는 *첫 입력 전 단계*. messages 비었을 때만 노출. 첫 메시지 전송 = 분기 빠지고 평소 2-pane으로 전환.
- D-003 한 턴 한 단계: hero는 *0번째 턴* (시작점). 첫 user 입력 = 1번째 턴 = 평소 흐름 진입.
- TASTE §4 친구 톤: "냉장고에 뭐 있어?" 톤 그대로. 부제는 "재료만 알려주면 같이 한 접시 완성해요." (0002 그대로).
- D-026 디자인 토큰: Newsreader 큰 제목 + JetBrains Mono eyebrow + 기존 send-btn / aux-chip 재사용.
- D-008 용접: 데이터 흐름 영향 0 — hero는 *진입 UX*만.

## 회색 영역 (architect 권고 자동 채택)

### GDR3-1 — 시간 라벨 동작
- 권고: 클라 사이드 `useEffect`로 현재 시각 + 요일 계산.
- 시간대 분류:
  - 06~10시: "아침"
  - 11~13시: "점심"
  - 14~17시: "오후"
  - 18~21시: "저녁"
  - 22~05시: "밤"
- 요일 분류:
  - 0(일)/6(토): "주말"
  - 1~5: "평일 종일"
- 표시 형식: `{시간대} {Hour}시 · {요일}` 예: `저녁 7시 · 평일 종일`

### GDR3-2 — 시작 옵션 칩 5종
- 권고: 0002 그대로 — `냉장고 털기` / `10분 야식` / `다이어트 한 끼` / `손님 초대상` / `아이 반찬`
- 클릭 = `submit(label)`로 첫 user 메시지 전송 → 평소 BUILD 흐름.
- 입력 placeholder도 0002 그대로 — `두부 한 모, 신김치, 대파... 냉장고를 적어보세요!`

### GDR3-3 — hero ↔ 2-pane 전환 시점
- 권고: `messages.length === 0 && lastResponse === null` 조건. true면 hero, false면 평소 2-pane.
- *첫 submit 호출* 직후 messages가 채워지면 자동 전환.
- *직전 취소 (D-023)*로 messages를 0으로 복원하면 다시 hero 노출 — 자연스러움.

### GDR3-4 — busy 상태 hero 처리
- 권고: hero 안에서 첫 submit 진행 중일 때는 입력 박스 disabled + send-btn 로딩 표시. hero는 그대로 보임 (응답 도착하면 messages 채워져 자동 분기 빠짐).

### GDR3-5 — 시작 옵션 칩 작동 시 cold-start greeting 처리
- 현재 BuildMode는 messages.length === 0일 때 *항상 cold-start greeting* 표시 (클라 상수). hero 분기에서는 greeting을 *대화 영역*에서 안 보임. 첫 submit 후 평소 2-pane으로 가면 greeting + 사용자 메시지 + LLM 응답 순서로 자연 노출.

## 신규 ADR D-028
**cold-start hero — 첫 진입 BUILD UX**. messages=0 && lastResponse=null 조건 → 별도 hero 화면 (시간 라벨 + 큰 제목 + 부제 + 입력 + 시작 옵션 칩 5종). 첫 입력/칩 클릭 = 평소 2-pane으로 전환.

## 인계
- UI 변경 Y — `<ColdStartHero>` 신규 + BuildMode 분기 + globals.css
- schema/엔진 변경 N
- 시간 라벨 헬퍼 — BuildMode 안 또는 별도 utils
- 시작 옵션 칩 문구 클라 상수
