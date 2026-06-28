# DR3 — cold-start hero 화면 (0002 디자인)

## 동기
0002 스크린샷의 *첫 진입* 화면 패턴 적용. 현재는 첫 진입에서도 *2-pane 채팅*이 보임 — 디자인은 *별도 hero 화면* (가운데 정렬 큰 제목 + 입력 + 시작 옵션 칩).

## 디자인 (0002 분석)
- 시간 기반 라벨 `오후 7시 · 평일 종일` (작은 mono)
- 큰 제목 `오늘, 뭐가 있어요?` (Newsreader)
- 부제 `재료만 알려주면 같이 한 접시 완성해요.`
- 큰 입력 박스 placeholder `두부 한 모, 신김치, 대파... 냉장고를 적어보세요!`
  - 좌하단 `+ 사진` `i 음성`
  - 우하단 원형 주황 ↑
- 시작 옵션 칩 (5종): `냉장고 털기` / `10분 야식` / `다이어트 한 끼` / `손님 초대상` / `아이 반찬`
  - 클릭 = 칩 문구를 첫 user 메시지로 submit

## 본 사이클 범위
1. `<ColdStartHero>` 신규 컴포넌트 — BuildMode 안 / messages.length=0 && lastResponse=null 분기
2. 시간 라벨 (`오후 7시 · 평일 종일`) — 클라 사이드 useEffect로 동적
3. 입력 박스 — 기존 `.build-input` 재사용
4. 시작 옵션 칩 5종 — `quickSend` 콜백
5. 첫 사용자 입력 → 자동으로 2-pane으로 전환 (분기 빠짐)

## 비범위
- 헤더 우측 `탐색` / `내 레시피` 메뉴 — 영속 사이클 후 (recipe_versions / 로그인 의존)
- 동그란 아바타 — 본 사이클 placeholder 또는 생략

## 신규 ADR 후보
**D-028** cold-start hero — 첫 진입 BUILD UX. 사용자 첫 입력 전 *별도 hero 화면*. 첫 입력 후 *2-pane*으로 전환.

## 불변
- /api/recipe·schema·EngineResponseSchema 변경 0
- D-022 mutation / D-023 undo / D-024/D-025 메타 / D-026 디자인 토큰 / D-027 2-pane 모두 무손상
- typecheck + 6/6 test 회귀 0

## 정책
권고 자동 채택.
