# SESSION.md — 세션 로그

> 세션 종료 시 갱신: 한 일 / 다음 할 일 / 막힌 것. 최신이 위로.

---

## 세션 11 — 에이전트형 BUILD 고도화 (DR4): 응답 2단계 스트리밍 (D-029)

**일자**: 2026-06-28
**운영 모드**: viberecipe-orchestrator (리더가 6역할 순차 수행 — 이 하네스 인스턴스에 커스텀 agent_type/TeamCreate 비활성, Phase 게이트는 유지).
**최종 판정**: DR4.T6 PASS 결함 0. D-029 등재.

### 한 일
- **Phase 3 사전 가드**: welding-architect 검증 — 후보 3개 중 ①스트리밍만 D-001/D-004 충돌(NEED_USER_DECISION), ②되묻기/③근거투명성은 조건부 PASS. `_workspace/02_welding_review_DR4T1.md`.
- **사용자 결정**: AskUserQuestion — 스트리밍 방식 **B(2단계)** + 범위 **① 응답 스트리밍만**. ②③은 차기 이월.
- **schema**: `EngineStructuredSchema = EngineResponseSchema.omit({message:true})` 신설(additive).
- **prompt**: 출력 명세를 2단계 형식(평문 → `===STATE_JSON===` → 5키 구조 JSON)으로.
- **engine**: `/api/recipe` 를 SSE ReadableStream 으로. 평문 토큰 실시간(delta) + 구조 JSON 완결 검증 후 done. D-004 1회 재시도(reset 후 재스트림). 비스트리밍 헬퍼 4종 제거.
- **ui**: `BuildMode` `consumeRecipeStream`(SSE 파서) + `streamingText` + busy 버블 실시간 평문/`.stream-caret`.
- D-029 ADR 등재. MAP / CLAUDE §9 / SESSION 갱신.

### 검증
- typecheck PASS / 6/6 test PASS / welding-inspector DR4.T6 결함 0.
- 용접: D-001(new_state 완결 검증 후 splitDiff)·D-002·D-004 보존, §4 BUILD 무손상.

### 다음 할 일 / 비범위
1. **D-030 후보 — 셰프 제안/되묻기**: 응답 모드 `act`/`ask`. 모호 입력에 되묻기(상태 없는 턴), 능동 제안=잠정 칩(D-002 정합). 차기 사이클.
2. **근거 투명성 강화**: Plan(D-024)/Context(D-025) 메타 확장.
3. **R-DR4-1**: cold-hero 첫 응답 스트리밍 미노출 → hero→2-pane 즉시 전환 검토.
4. **빌드 검증**: `npm run build` 는 더미 키로 사용자 직접 실행 권고(런타임 env 부재 시 throw, 빌드 자체는 통과).
5. 미해결 큰 토대: 레시피 저장 API + 로그인 UI(완성 레시피 영속) — 별도 사이클.

### 막힌 것
- **없음.**

---

## 세션 10 — 디자인 사이클 3 (DR3): cold-start hero (D-028)

**일자**: 2026-06-21 (세션 9 직후, push 후)
**최종 판정**: DR3.T3 PASS 결함 0. D-028 등재.

### 한 일
- BuildMode에 `showHero` 분기 추가. messages=0 && lastResponse=null → `<ColdStartHero>` 단독 렌더.
- `<ColdStartHero>` 신규 — 시간 라벨(formatTimeLabel + useEffect 60s) + 큰 제목 "오늘, 뭐가 있어요?" + 부제 + 입력 + quickstart 칩 5종("냉장고 털기" / "10분 야식" / "다이어트 한 끼" / "손님 초대상" / "아이 반찬"). auth 미준비 시 hint + 칩 disabled.
- `app/globals.css`: cold-hero 클래스 10종. Newsreader 큰 제목 + JetBrains Mono eyebrow.
- D-028 ADR 등재. MAP / CLAUDE §9 갱신.

### 검증
- typecheck PASS / 6/6 test PASS
- SSR 마커 9종 + 디자인 텍스트 ("오늘, 뭐가 있어요?" / "재료만 알려주면" / "냉장고 털기" / "10분 야식" / "두부 한 모...") 모두 매치

### 메모
- undoLast로 messages 0 복원 시 hero 자동 재진입 — 자연.
- 헤더 우측 "탐색" / "내 레시피" 메뉴는 비범위 (영속+로그인 의존).

---

## 세션 9 — 디자인 사이클 2 (DR2): 2-pane 레이아웃 (D-027)

**일자**: 2026-06-21 (세션 8 직후)
**운영 모드**: 권고 자동 채택. 4단 절차.
**최종 판정**: DR2.T3 PASS 결함 0. D-027 신규 등재.

### 동기
DR1 시각 시스템 적용 후 사용자가 스크린샷과 함께 "아직 이대로인데" 피드백 — 핵심은 *2-pane 레이아웃*이었음을 확인. 즉시 진입.

### 한 일
- **헤더 정리 (선행)**: app/page.tsx의 `<h1>바이브 레시피</h1>` + `<p>recipe.build()...</p>` 제거. command-header grid `auto 1fr auto` + 큰 테두리/그라데이션/::before 점선 제거. dev-shelf hint "로그인 흐름 도입 전 임시" → 짧게 "dev".
- **DR2.T1 architect**: D-021 4-요소 패턴 *구조* 재해석. 임베드 공간 매핑 결정 — 산출물/메타 → 우측 recipe-side / 옵션 칩 + Warnings → 좌측 채팅 / ModifiedChips → RecipeCanvas 헤더 옆.
- **DR2.T2 UI 재구성**:
  - `app/page.tsx` — pipeline 배열 + `<nav.pipeline-rail>` 제거, `<aside.runtime-inspector>` 제거. `<section.mode-stage>` + `<aside.page-footer-aside>` (FingerprintCard).
  - `components/BuildMode.tsx` 풀 재작성 — `<section.build-bench> > <stage-progress> + <build-canvas grid> > <chat-side> + <recipe-side>`. 좌 채팅 + 옵션 칩 인라인 + Warnings 인라인 + 입력. 우 sticky `<RecipeCanvas>` (산출물 + 메타 mini + 변경 칩 + 빈 상태). 신규 `<StagePlanCardMini>` / `<ContextMetaCardMini>`. LatestEmbeds 제거.
  - `app/globals.css` 신규 30+종 (mode-stage, page-footer-aside, build-canvas, chat-side, recipe-side, recipe-canvas, canvas-head, canvas-eyebrow, canvas-live, canvas-title Newsreader, canvas-concept, canvas-section, canvas-steps with 검정 원 번호, canvas-meta-block, plan/context-mini 변종, warning-inline). 모바일 1-col stack.
- **DR2.T3 weld-trace**: 5+1 라인 + 7 경계 + 신규 경계 H(우측 RecipeCanvas ↔ mutation 콜백) 모두 회귀 0. mutation/undo/옵션 칩 흐름 무손상. D-027 결정 7항목 모두 코드 적용. typecheck + 6/6 test + SSR 마커 8종 PASS.
- **DR2.T4 docs**: D-027 등재 + D-021 결과 섹션 *공간 분리* 추가 보강. MAP/SESSION/CLAUDE §9 갱신.

### 남은 제약 / 다음 할 일
- **DR3**: cold-start 첫 진입 `오늘, 뭐가 있어요?` 화면 변형 (0002 스크린샷). 사용자 첫 입력 전 *중앙 정렬 큰 제목*.
- **dead CSS 정리**: pipeline-rail / pipeline-node / runtime-inspector / workbench / ide-grid / command-grid / IDE 풍 12종.
- 모바일 헤더 wrap 최적화 / Pretendard 정식 등록 / 다른 고도화 축 (⑤ Slash command / D-022 비편집 필드 확장 등) / OpenAI + 로그인(마지막).

### 막힌 것
- **없음**.

### 메모
- state 끌어올림 회피 — BuildMode가 두 영역 모두 렌더. RecipeCanvas는 props 단방향. 깔끔.
- 빈 상태(idle) UX: "RECIPE · 대기" + "왼쪽에서 대화로 시작해주세요. 합의가 시작되면 여기 레시피가 자라납니다." TASTE §4 친구 톤.
- canvas-step-index 검정 원 번호 + Newsreader 큰 제목 + JetBrains Mono eyebrow — D-026 폰트 토큰이 자연 적용.

---

## 세션 8 — 디자인 사이클 1 (DR1): 시각 시스템 적용 (D-026)

**일자**: 2026-06-21
**운영 모드**: viberecipe-orchestrator + *권고 자동 채택*. 4단 절차.
**최종 판정**: DR1.T3 PASS 결함 0. D-026 신규 등재 + TASTE §6 *잠정→확정*.

### 동기
사용자가 디자인 참조 스크린샷 3종 제시(0001 BUILD 2-pane / 0002 색·폰트 시스템 + cold-start / 0003 화면 모음). 본 사이클은 **시각 시스템 + 마이크로 요소**만(DR1). 2-pane 레이아웃은 DR2, cold-start 화면은 DR3로 분리.

### 한 일
- **사전 가드 (DR1.T1)**: 회색 영역 4건 — GDR-1 색 토큰 SSOT / GDR-2 폰트 등록 방식 / GDR-3 아바타 표현 / GDR-4 헤더 자동저장됨+쿡모드. 모두 architect 권고 자동 채택.
- **시각 적용 (DR1.T2)**:
  - `app/layout.tsx` — `next/font/google` Newsreader + JetBrains Mono 등록 → CSS 변수 노출. `<html>` className에 variable 적용.
  - `app/globals.css :root` 통합 갱신 — `--paper #f4ead7`(베이지 따뜻하게), `--ink #1a1a1a`(검정 강화), `--paper-soft` 신규, `--accent-green #2a6d57` 신규(live/자동 저장됨), `--user-chip-bg/fg` 신규. 폰트 chain 3종(`--font-body`/`--font-display`/`--font-mono`). 호환 별칭(`--mono`/`--serif`).
  - body `font-family: var(--font-body)` 적용 (Pretendard 시스템 fallback chain).
  - `components/BuildMode.tsx` — ChatBubble role="chef" 분기에 `<chef-avatar>셰</chef-avatar>` + chat-bubble-body-wrap. build-input 재구조화 — 좌하단 aux-chip 4종(`+ 사진` / `⏵ 음성` / `↶ 직전 취소` / `샘플`) + 우하단 원형 `.send-btn`(↑) + pendingUserCount 표시.
  - `app/page.tsx` — 헤더 brand-line(`• vibe recipe · {name} · {초안|완성}`) + autosave-pill(녹 점 + "자동 저장됨") + cook-mode-btn(`canCook` 조건부). 기존 status-pill 3종 제거.
  - 신규 클래스 15+종 (`.brand-line`, `.autosave-pill`, `.cook-mode-btn`, `.aux-chip`, `.send-btn`, `.chef-avatar` 외).
- **정합성 검증 (DR1.T3, weld-trace)**: 5+1 라인 + 7 경계 + 사용자 mutation/undo + 임베드 층위 모두 회귀 0. 시각 표면만 변경. typecheck + 6/6 test + SSR 마커 9종 PASS.
- **문서 동기화 (DR1.T4)**: D-026 신규 등재 — 색 5종 + 폰트 3종 + 마이크로 요소 SSOT. TASTE §6 *확정* 보강(스크린샷 기반 명문화 + 다크 톤은 별도 사이클). MAP.md / CLAUDE.md §9 갱신.

### 남은 제약 / 다음 할 일
1. **DR2 — 2-pane 레이아웃** (좌 채팅 / 우 sticky 산출물). D-021 4-요소 패턴 *구조* 재해석 ADR 필요. *큰 사이클*.
2. **DR3 — cold-start 첫 진입 `오늘, 뭐가 있어요?` 화면**. UX 패턴 변경.
3. **Pretendard 정식 등록** — `next/font/local` 또는 패키지. 본 사이클은 시스템 fallback chain만.
4. **dead CSS 정리** — `.status-pill` (제거됨), IDE 풍 12종 잔존.
5. **모바일 헤더 wrap** — `.cook-mode-btn` + autosave가 1-col에서 어떻게 들어갈지 검토.
6. **다른 고도화 축**: ⑤ Slash command / D-022 비편집 필드 / D-023 다중 undo / traits_applied 완곡 표현.
7. **OpenAI + 로그인** — 사용자 명시 "마지막".

### 막힌 것 / 결정 대기
- **없음**.

### 메모
- Pretendard는 시스템 fallback chain — 미설치 환경에서도 자연 fallback. 정식 적용은 다음.
- `aux-chip` 클래스 통합 — 미작동(사진/음성) vs 작동(직전 취소/샘플) 시그널이 cursor로만 구분. 더 명확한 시그널은 다음.
- 헤더 brand-line의 `· {name} · 초안`은 recipeState.name 있을 때만 표시. 디자인 의도 정합.

---

## 세션 7 — 고도화 사이클 2: Plan 가시화 + Context 투명성 (D-024 + D-025)

**일자**: 2026-06-21 (세션 6 직후, 사용자 "진행" 빠른 진입)
**운영 모드**: viberecipe-orchestrator 축소 사이클 + *권고 자동 채택* 정책 (NEED_USER_DECISION 회피, 위험 큰 결정만 묻기).
**최종 판정**: PC.T4 PASS (결함 0). D-024/D-025 신규 등재 + D-021 결과 섹션 *임베드 층위* 명시화.

### 동기
5축 중 ②(Plan 가시화) + ④(Context 투명성)를 묶음 사이클로. 사용자가 *어디까지 합의했고* / *응답이 왜 이 방향으로 왔는지*를 동시에 보여 *수준 높은 페어 감각*을 만든다. 사용자 명시 "API/로그인은 마지막" 정책 유지.

### 한 일
- **사전 가드 (PC.T1, constitution-check)**: 회색 영역 5건(GPC-1~5) 정리. *권고 자동 채택* 정책 적용 — NEED_USER_DECISION 없음. 핵심 결정:
  - GPC-1 stage별 필수 필드 SSOT → 신규 `lib/stagePlan.ts`
  - GPC-2 Context 노출 방식 → 응답 wrapper에 `context_used`, 서버가 채움, LLM contract 무변
  - GPC-3 UI 위치 → 임베드 최상단 (산출물 카드 직전)
  - GPC-4 신규 ADR 2개(D-024 + D-025)
  - GPC-5 cold_start UI 톤 → TASTE §4 친구 톤
- **백엔드 (PC.T2)**: `app/api/recipe/route.ts` 200 응답 wrapper에 `context_used` 5줄 추가. `buildContext`는 [4]에서 *이미 조회*된 객체 변환 — 추가 DB 조회 0. EngineResponseSchema/RequestBodySchema/lib/schema 변경 0.
- **UI (PC.T3)**:
  - `lib/stagePlan.ts` 신설 — `STAGE_PLANS: Record<Stage, StagePlan>` 5개, `RecipeField = keyof RecipeState`, `FIELD_LABELS`, `isFieldFilled`.
  - `components/BuildMode.tsx` 보강 — `ContextUsed` 타입, `lastContext` state, `Snapshot`에 lastContext 포함, `<StagePlanCard>`/`<PlanRow>`/`<ContextMetaCard>` 3 하위 컴포넌트 추가, `<LatestEmbeds>` 최상단에 두 메타 카드 배치 (산출물 카드 직전).
  - `app/globals.css` 신규 클래스 20+종 (`.plan-card`/`.plan-list`/`.plan-row`/`.plan-marker`/`.plan-label`/`.plan-optional`/`.plan-filled`/`.plan-empty`/`.plan-head`/`.plan-title`/`.plan-stage`/`.context-meta-card`/`.meta-head`/`.meta-title`/`.meta-empty`/`.meta-rows`/`.meta-row`/`.meta-label`/`.meta-val`/`.meta-trait-chips`/`.meta-trait-chip`) + 모바일 반응.
- **정합성 검증 (PC.T4, weld-trace)**: 5+1 라인 회귀 0. 신규 경계 F(StagePlan ↔ RecipeState `keyof` 컴파일 결합) + G(context_used wrapper ↔ ContextMetaCard 필드 매핑) 모두 PASS. D-024/D-025 결정 항목 모두 코드 적용. typecheck + 6/6 test 그린.
- **문서 동기화 (PC.T5)**: D-024(Plan SSOT) + D-025(Context wrapper) ADR 등재. D-021 결과 섹션에 *임베드 2층위* 명시화 — (1) 상태 메타 plan/context, (2) 산출물 메타 artifact/gauges/steps/modified/warnings. MAP.md에 `lib/stagePlan.ts` 신설 라인 + BuildMode/route 본문 갱신 + ADR 범위 D-001~D-025. SESSION.md 세션 7 신설. CLAUDE.md §9 한 줄.

### 남은 제약 / 다음 할 일
1. **사용자 hand-test 권고**: 샘플 로드 또는 첫 LLM 응답 → 임베드 최상단에 *이번 단계 합의 항목* + *이 응답이 참고한 것* 두 카드 확인.
2. **R-PC-3**: `traits_applied` 칩이 *부정 표현*("타는 문제가 반복되는 편") 그대로 노출. 다음 사이클에서 *완곡 표현* TASTE §6 보강.
3. **부분 채움 시각화**: taste 6축 중 일부만 채움 등 `partial` status 도입 — 다음 사이클.
4. **컨텍스트 노출 확장**: context_used를 `/api/run` 응답에도? — 본 사이클은 BUILD만.
5. **남은 고도화 축**:
   - ⑤ Slash command (`/처음부터`, `/지금까지`, `/덜맵게`, `/알아서다해줘`)
   - D-022 비편집 필드 확장 (name/concept/steps/time_min)
   - D-023 다중 undo / 영속
   - dead CSS 정리 / v3 다크 톤 통일
6. **OpenAI 전환 + 로그인 베이스 인증** — 사용자 명시 "마지막".

### 막힌 것 / 결정 대기
- **없음**.

### 메모
- 권고 자동 채택 정책으로 사이클 속도 우선. 결과가 잘못되면 사용자가 알려줌 → 조정 사이클.
- `lib/stagePlan.ts`는 lib/prompt.ts의 D-014 stage 분기와 *목적 분리 SSOT 2개*: 전자는 UI plan, 후자는 시스템 프롬프트 TASTE 인용. 같은 stage 개념 다른 목적.
- BuildContext 정보를 *응답 wrapper에* 노출하는 패턴은 다른 라우트(`/api/run`)에도 자연 적용 가능 — 다음 사이클 확장 후보.

---

## 세션 6 — 고도화 사이클 1: 사용자 직접 수정 + 에디트 히스토리 (D-022 + D-023)

**일자**: 2026-06-21 (세션 5 직후)
**운영 모드**: viberecipe-orchestrator 축소 사이클 (오케스트레이터 단독 + 인라인 스킬). 4단 절차(constitution-check → ui → weld-trace → docs).
**최종 판정**: AD.T3 PASS (결함 0건). D-022/D-023 신규 등재 + D-001/D-002/D-021 결과 섹션 보강.

### 동기
사용자가 *진짜 바이브 코딩처럼 작동하는 수준 높은 설계로의 고도화*를 요청. 5개 고도화 축(① 사용자 직접 수정 / ② Plan 가시화 / ③ 에디트 히스토리 / ④ Context 투명성 / ⑤ Slash command) 중 **①·③**을 첫 사이클로 선택. 사용자 명시: "API나 로그인은 마지막".

### 한 일
- **사전 가드 (AD.T1, constitution-check)**: 헌법 PASS, 회색 영역 7건(GAD-1~7). 가장 큰 GAD-1(수정 흐름 의미) / GAD-2(편집 가능 필드 범위)는 NEED_USER_DECISION. GAD-3~7은 architect 권고 자동 채택. D-001/D-002/D-021 결과 섹션 보강 필요 식별. R-AD-1~6 위험 카탈로그.
- **사용자 결정 (AD.T1b)**: GAD-1=**B+** (즉시 시각 mutate + user 메시지 자동 생성) / GAD-2=**A** (ingredients + tools + taste + texture 4개). architect 권고 그대로.
- **UI 변경 (AD.T2)**: `components/BuildMode.tsx` 보강 — `Mutation` 모델 + `mutateRecipe`/`describeMutation`/`applyMutation`/`undoLast`/`takeSnapshot`. `ArtifactCard` 안 ingredients/tools 칩에 ✕ 버튼. `GaugesCard` 각 row에 +/- 버튼. `prevSnapshot` 1단계 undo. `historyExpanded` "더 이전 보기" 토글. `submit`이 클라 messages는 무한 누적, wire는 slice(-8). props 시그니처 확장 (`onRecipeStateChange: (state: RecipeState | null)`). `app/globals.css` 신규 클래스 8종(`.chip-text`/`.chip-remove`/`.tools-line`/`.tool-chip`/`.gauge-buttons`/`.gauge-btn`/`.history-toggle`) + `.artifact-chip`·`.gauge-row` 그리드 조정 + 모바일 반응.
- **정합성 검증 (AD.T3, weld-trace)**: 5+1 라인 회귀 0 + 신설 *서브 라인*(사용자 mutation → user 메시지 누적 → 다음 Line 1 입력) PASS. 경계 B' 신설(클라 body messages 안 mutation 메시지가 RequestBodySchema 통과) PASS. D-022 결정 6항목 + D-023 결정 5항목 모두 코드 매핑 확인. P0 5점검 회귀 0. TASTE §1·§4·§6 정합. typecheck/test 그린.
- **문서 동기화 (AD.T4)**: 신규 ADR **D-022** (사용자 직접 수정 — RecipeState 출처 2개, B+ 흐름, 편집 4필드, GAD-6/7 정책 명시) + **D-023** (에디트 히스토리 — 클라 messages 무한 누적, slice(-8) wire only, 1단계 undo, 영속 P2 이월) 등재. 기존 ADR 결과 섹션 보강: D-001 (RecipeState 출처 2개) / D-002 (사용자 본인 수정 미표시) / D-021 (임베드 의미 인터랙티브 확장). TASTE.md §6 "사용자 직접 수정 자동 user 메시지 표현" 표 등재. MAP.md / SESSION.md 세션 6 / CLAUDE.md §9 갱신.

### 남은 제약 / 다음 할 일
1. **사용자 hand-test 권고**: 샘플 로드 → 재료 ✕ → 게이지 +/- → "전송 (N개 수정)" → 응답 → 직전 취소 흐름. SSR 마커로는 잡히지 않는 인터랙티브 영역.
2. **다른 고도화 축**:
   - ② Plan 가시화 (stage 안 "확정 vs 미정" 카드)
   - ④ Context 투명성 (`/api/recipe` 응답에 `context_used` 필드 추가, 응답 안 hint)
   - ⑤ Slash command (`/처음부터`, `/지금까지`, `/덜 맵게`, `/알아서다해줘`)
3. **D-022 후속**: 비편집 필드(name/concept/steps/time_min) 편집 / 양 변경 / 도구 추가 / mutation 메시지 시그널 강화.
4. **D-023 후속**: 다중 undo / 영속 (`recipe_versions` 인증 사이클 동반).
5. **OpenAI 전환 + 로그인 베이스 인증** — 사용자 명시 "마지막에".

### 막힌 것 / 결정 대기
- **없음**.

### 메모
- B+ 흐름의 *클라 즉시 mutate*가 LLM 응답 도착 시 *덮어쓰기* 위험은 `editable = !busy` 잠금으로 race 가드.
- mutation 자동 메시지가 *일반 user 메시지로 처리*돼 LLM이 "재확인 톤"으로 응답하면 자연스럽게 페어 합의 흐름이 됨. 시그널 강화는 다음 사이클.
- D-022/D-023이 *데이터 용접 강제 규칙 3종*(BUILD 시 조회 / 핫픽스 / Postmortem)을 건드리지 않음. UX 표면 + 클라 메모리만의 변경.

---

## 세션 5 — BUILD 리디자인: 대화형 UX 복원 (D-021)

**일자**: 2026-06-21
**운영 모드**: viberecipe-orchestrator 축소 사이클 (오케스트레이터 단독 + 인라인 스킬 호출). 4단 절차(constitution-check → ui → weld-trace → docs).
**최종 판정**: BR.T3 PASS (결함 0건). D-021 등재. 2026-06-18 IDE 풍 SUPERSEDED.

### 동기
사용자(유케이)가 v3 prototype 스크린샷(`D:/projects/programs/draft/local_capture/dist/data/captures/20260621_060311_capture.png`)을 다시 제시하며 "다른 앱들은 통째로 던지지만 우리는 *대화하며* 만들어 나간다"는 핵심 차별점 재확인. 2026-06-18 키친 IDE 리디자인이 `terminal-bar`/`compile-grid`/`prompt-surface` 같은 *코딩 메타포의 문법*을 화면에 박은 게 D-002 함정의 거꾸로 적용임을 architect 사전 가드에서 확정.

### 한 일
- **사전 가드 (BR.T1, constitution-check 5단계)**: 헌법 PASS, 회색 영역 4건 식별. GBR-3/GBR-4는 architect 권고 그대로(즉시 빌드 시그널만 placeholder / 헤더 JWT 입력 보존), GBR-1·GBR-2는 NEED_USER_DECISION. R-BR-1~R-BR-5 위험 카탈로그.
- **사용자 결정 (BR.T1b)**: GBR-1=B(라이트 페이퍼 톤 안 대화 패턴 복원) / GBR-2=A(BuildMode 패널 내부 5-stage progress, 외층 pipeline-rail과 층위 분리). architect 권고 그대로 채택.
- **UI 리디자인 (BR.T2)**: `components/BuildMode.tsx` 풀 재작성 — 9 하위 컴포넌트(ChatBubble/LatestEmbeds/ArtifactCard/GaugesCard/GaugeGroup/StepsCard/ModifiedChips/Warnings + 옵션 칩). cold-start 인사 클라 상수(`COLD_START_GREETING`), 입력 placeholder `"답하거나, 칩을 탭하거나, '알아서 다 해줘'"` (D-003a 시그널만). `submit(text?)`로 칩 클릭 = 자유 텍스트와 동일 경로. `lastAssistantIdx` 분기로 최신 메시지에만 임베드(R-BR-1 해소). `app/globals.css`에 신규 40+ 클래스 추가(build-bench/stage-progress/chat-scroll/chat-bubble/bubble-*/artifact-card/gauges-card/steps-card/modified-chips/option-chips/warning-card 외) + 모바일 반응. 직전 IDE 풍 CSS 12종 dead(별도 정리 사이클 메모, M-BR-1).
- **정합성 검증 (BR.T3, weld-trace)**: 5+1 라인 회귀 0 (Line 1~6 모두 변경 없음 — 본 사이클은 BuildMode UI 표면만), 경계 B(API 응답 ↔ 클라 사용) PASS — `/api/recipe` 요청 body 4 필드 + 응답 `{ engineResponse, parsedAt }` 변경 0. D-002/D-003 정신 적용 확인. TASTE §1·§4 정합. P0 5점검 회귀 0. typecheck/test 그린. dev 서버 hot-reload 후 SSR된 HTML에 신규 마커 9종(stage-progress/stage-pill/chat-scroll/chat-bubble/bubble-chef/bubble-text/build-bench/build-input + cold-start 인사 본문) 모두 확인.
- **문서 동기화 (BR.T4)**: ADR D-021 등재 — BUILD UX 표면 = 채팅+옵션 칩+임베드 카드/게이지. 직전 2026-06-18 IDE 풍 패턴 SUPERSEDED 처리(메타포 함정 사례로 보존). TASTE.md §6 신규 등재 — BUILD UX 톤 + 디자인 톤 잠정. MAP.md 갱신 — BuildMode 본문 + ADR 범위(D-001~D-021) + 현재 상태 요약. CLAUDE.md §9 변경 이력 한 줄 추가.

### 남은 제약 / 다음 할 일
1. **D-003a 즉시 빌드 실제 분기 로직** (현재 UI 시그널만, placeholder 문구만). `lib/prompt.ts` 또는 라우트에서 키워드 감지 한 곳만 손대면 됨.
2. **버전 타임라인 UI**: v3 스크린샷 `state (3/4)` 드롭다운. ROADMAP P2 `recipe_versions`.
3. **dead CSS 정리**: compile-bench/compile-grid/prompt-surface/prompt-editor/compiler-output/state-inspector/output-line/artifact-list/diff-kind/diff-list/state-inspector .recipe-list 등 12종. CSS 빌드 size 영향 미미.
4. **v3 다크 톤 전체 통일 검토**: Cook/Postmortem/Inspector 동시 작업 필요 — 별도 사이클.
5. **CookMode/Postmortem 톤 재정렬**: 직전 IDE 풍 (`terminal-bar`/`commit run report`/`stack.trace.pin` 등)이 그대로. BR 사이클과 동일 원칙으로 일관성 작업.
6. P2 합의 항목들 (로그인 UI/recipe row 생성·저장 API/Supabase end-to-end 검증) 그대로 잔존.

### 막힌 것 / 결정 대기
- **없음**.

### 메모
- `npm run typecheck` + `npm test`(6/6) 그린.
- dev 서버(`npm run dev -p 3100`)에서 hot-reload로 SSR 마커 확인. 다른 dev 인스턴스가 3000~3002를 점유 중이라 3100 사용.
- D-021은 *코드 + UX 양쪽의 §1.3/D-002/D-003 정신 복원* 사례. ADR 본문에 직전 사이클의 "코딩 문법 동일시 오류"를 명시 보존 — 향후 동일 함정 재발 방지.

---

## 세션 4 — P1 마무리: FingerprintCard 신설

**일자**: 2026-06-20
**운영 모드**: viberecipe-orchestrator 축소 사이클 (오케스트레이터 단독 + 인라인 스킬 호출 — 환경에서 커스텀 에이전트 미로드 발견). 5단 절차(constitution-check → engine → ui → weld-trace → docs)는 그대로 유지.
**최종 판정**: FP.T4 PASS (결함 0건). ROADMAP P1 8/8 완료.

### 한 일
- **사전 가드 (FP.T1, constitution-check 5단계)**: 헌법 PASS, 회색 영역 3건(GFP-1 데이터 페치 경로 / GFP-2 cold-start UX / GFP-3 confidence 노출 정밀도). GFP-2는 architect 권고 그대로(TASTE §4 톤), GFP-1·GFP-3은 NEED_USER_DECISION.
- **사용자 결정 (FP.T1b)**: GFP-1=A(신규 GET /api/fingerprint) / GFP-3=B(백분율). architect 권고대로 2건 모두 채택.
- **engine 변경 (FP.T2)**: `lib/fingerprintStore.ts` 신설 — `fetchFingerprintForUser(userId)` service-role 단건 조회 + FingerprintSchema.parse jsonb 안전화. `app/api/fingerprint/route.ts` 신설 — `enforceRateLimit("fingerprint")` + `authenticateRequest` + D-013 패턴 1회 재시도 후 502 + 200 `{ fingerprint }`.
- **UI 구현 (FP.T3)**: `components/FingerprintCard.tsx` 신설 — 4 상태(idle/loading/ready/error). `useEffect` + AbortController. cold-start 분기(`totalRuns=0 & traits=[]` 안내, traits=[] but totalRuns>0 별도 안내, traits 있음 목록). confidence 백분율(`Math.round(c * 100) + "%"`). `app/page.tsx` runtime-inspector 슬롯 최상단 통합 + Postmortem `onSaved` 콜백에 `setFingerprintNonce((n) => n + 1)` 추가(용접 가시성 회로). `app/globals.css` 신규 클래스 7종(기존 토큰 재사용).
- **정합성 검증 (FP.T4, weld-trace)**: 5 라인 회귀 0건 + 신설 Line 6(가시화 가지) PASS, 경계 B/C/E PASS(A/D 미변경 회귀 0), D-019 SSOT 강제 `Grep("supabase|@supabase", components/**/*.tsx + app/page.tsx)` 0건 매치 확인. D-015 R4 가드 + D-011 rate limit + D-013 502 패턴 모두 회귀 0. P0 5점검(A~E) 회귀 0. cold-start 4 분기 모두 명시 UX 텍스트. typecheck/test 그린.
- **문서 동기화 (FP.T5)**: ADR D-019(Fingerprint 클라 노출 SSOT — GET /api/fingerprint) / D-020(confidence 노출 형식 — 백분율) 등재. TASTE.md §5 confidence 노출 형식 항목 등재(D-009 살아있는 문서). ROADMAP P1 마지막 2 항목 [x] 체크(lib/prompt.ts 누락 체크 + FingerprintCard). MAP.md 갱신 — `lib/fingerprintStore.ts` / `app/api/fingerprint/route.ts` / `components/FingerprintCard.tsx` 등재 + 상태 요약 P1 8/8 완료로 갱신. CLAUDE.md §9 변경 이력 한 줄 추가.

### 남은 제약 / 다음 할 일 (P2 후보)
1. 로그인 UI와 세션 영속 (D-015 P2 이월 항목).
2. recipe row 생성/저장 API.
3. 실제 Supabase 프로젝트에 `0001_init.sql` + `0002_run_constraint.sql` 적용 후 end-to-end 저장 검증.
4. TASTE.md §5 미정 항목 결정 — 분량 스케일링 / 게이지 초기값 / 대체 재료 허용.
5. ROADMAP P2 모드 자동 판단(D-003a) / 버전 타임라인 UI 복원 / Cook→Postmortem 완료율 측정.

### 막힌 것 / 결정 대기
- **없음**.
- 환경 메모: 글로벌 에이전트 타입에 `welding-architect` 등 프로젝트 커스텀 에이전트가 노출되지 않아 본 사이클은 오케스트레이터 단독(인라인 스킬 호출)으로 진행. 산출물 컨벤션(`_workspace/02_*`, `_workspace/04_*`, `_workspace/05_*`, `_workspace/07_*`, `_workspace/06_*`)은 유지. 다음 사이클에서 에이전트 로드 확인 권고.

### 메모
- `npm run typecheck` + `npm test`(6/6) 그린.
- `lib/buildContext.ts`의 `fingerprints` 조회와 `lib/fingerprintStore.ts`의 단건 조회는 *목적 분리 SSOT* 2개. 결합 조회는 BUILD 입력 묶음(실패 → 502 / 데이터 없음 → cold_start=true), 단건 조회는 표시 전용(실패 → 502 / 데이터 없음 → null). D-019가 본 분리를 명문화.

---

## 세션 3 — P1 Cook 사이드 루프 구현

**일자**: 2026-06-18
**최종 판정**: 구현 완료, 로컬 검증 대기/진행 기록은 본 세션 하단 참조.

### 한 일
- `scripts/test.mjs` + `npm test` 추가. `lib/runtime.ts`, `lib/fingerprint.ts`, `lib/diff.ts`에 대한 RED 테스트 작성 후 구현.
- `lib/auth.ts` 신설. `/api/recipe` 내부 인증 함수를 공통 모듈로 추출.
- `lib/supabase.ts`에 사용자 JWT 기반 서버 클라이언트 추가. `/api/run`의 RPC 호출이 DB 함수 내부 `auth.uid()`를 통과하도록 함.
- `app/api/run/route.ts` 본문 구현: CookRun 검증 → 기존 runs/logs 조회 → RuntimeLog 재빌드 → Fingerprint 재계산 → `save_cook_run` RPC 단일 호출.
- `components/BuildMode.tsx`, `components/CookMode.tsx`, `components/Postmortem.tsx`, `app/page.tsx`를 작업용 MVP UI로 연결.
- `docs/DECISIONS.md`에 D-016/D-017/D-018 등재. `docs/TASTE.md`, `docs/ROADMAP.md`, `CLAUDE.md` 갱신.

### 남은 제약 / 다음 할 일
1. 로그인 UI와 세션 영속은 아직 없음. 현재 화면은 Supabase bearer JWT를 직접 입력하는 작업용 형태.
2. recipe row 생성/저장 API가 아직 없음. `/api/run` 저장은 기존 `recipe_id`가 있어야 성공한다.
3. `components/FingerprintCard.tsx`는 아직 미생성.
4. 실제 Supabase 프로젝트에 `0001_init.sql` + `0002_run_constraint.sql` 적용 후 end-to-end 저장 검증 필요.

---

## 세션 2 — P1 엔진 코어 사이클 (lib/prompt.ts + lib/buildContext.ts 신설 + /api/recipe 본문)

**일자**: 2026-06-14 ~ 2026-06-15
**운영 모드**: viberecipe-orchestrator 축소 팀 3인 — welding-architect, engine-builder, welding-inspector + 마무리 단계 doc-taste-scribe.
**최종 판정**: P1.T4 PASS (결함 0건, 미세 메모 M-1 1건은 ADR 결합 해석으로 정합).

### 한 일
- **사전 가드 (P1.T1, welding-architect)**: 5단계 헌법 검증 — 핵심 노선 PASS, 회색 영역 4개(GA-1~4) 식별. 본문 구현 과정에서 임의 결정 시 D-009 저촉 → NEED_USER_DECISION. R12~R15(JSON 추출 무한 루프 / messages 8턴 / options 15자 / new_state 부분 반환) 신규 가드 식별.
- **사용자 결정 (P1.T1b)**: GA-1=A (키워드 매칭만, D-003a 본격은 P2 이월) / GA-2=A (미해결 우선 N=5) / GA-3=C (1회 재조회 후 502) / GA-4=B (stage별 TASTE 인용). architect 권고대로 4건 모두 채택.
- **`lib/prompt.ts` 본문 (P1.T2, engine-builder)**: `buildSystemPrompt({ stage, buildContext, recipeState? })` 10절 결합 + `trimKnownIssues(issues, budget=5)` 헬퍼 export. 맹탕 모드 결정적 분기, stage별 TASTE 인용 switch + `_exhaustive: never` 가드. SSOT 단일성 유지 (라우트 스키마 재정의 0건).
- **`/api/recipe` 본문 + `lib/buildContext.ts` 신설 (P1.T3, engine-builder)**: POST 핸들러 [1]~[5] + 인증([3a]) + `callEngineWithRetry`/`callAnthropic`/`tryParseEngineResponse`/`extractJson` + `EngineValidationError` + `authenticateRequest`. `lib/buildContext.ts`는 service-role로 runtime_logs + fingerprints 병렬 조회 후 BuildContextSchema.parse. 인증 정책은 §5에 D-015 ADR 후보로 메모.
- **정합성 검증 (P1.T4, welding-inspector)**: weld-trace 5라인 PASS (특히 Line 1 BuildContext→systemPrompt 풀 트레이스), 경계 A(ENGINE.md ↔ renderOutputContract ↔ EngineResponseSchema 3자 1:1) + C + E PASS, P0 5점검(A~E) 회귀 PASS, D-001~D-014 ADR 강제 점검 12건 PASS, R1~R19 모두 PASS, cold-start 8점검 PASS. 결함 0건 + 미세 메모 M-1(T1 R15 "전체 상태" 권고 ↔ T2 본문 "부분 객체 + splitDiff 결합" 표현 차이 → D-001/D-002 결합 해석으로 정합).
- **문서 동기화 (P1.T5, doc-taste-scribe)**: ADR D-012 (known_issues 트리밍 N=5 미해결 우선) / D-013 (BuildContext 1회 재시도 후 502) / D-014 (TASTE.md stage별 인용) / **D-015 (인증 경계 정책 — Authorization Bearer JWT + anon 클라 검증 + service-role 분리, R4 가드. 전체 인증 흐름은 P2 명시 이월)** 등재. D-001 결과 섹션에 "전체 상태 의미 — 부분 객체 + splitDiff 결합" 한 줄 추가 명시화 (본문 무수정). D-015는 doc-taste-scribe가 리더에게 등재 vs P2 이월 컨설팅 → 리더가 즉시 등재 결정(D-009 정신 충실). MAP.md 갱신 — `lib/buildContext.ts` 신설 + `lib/prompt.ts`/`app/api/recipe/route.ts` 상태 ✅ 승격. CLAUDE.md §9 변경 이력 한 줄 추가.

### 다음 할 일 (P1 후속 사이클 — Cook 사이드 묶음 우선)
1. **`app/api/run/route.ts` 본문**: `cook_runs INSERT` → `runtime_logs UPSERT` → `fingerprints UPSERT` 트랜잭션 (Postgres RPC 권장, D-008 용접 강제 지점). D-013과 동일 인증 정책 적용(`/api/recipe`와 SSOT 일치).
2. **`lib/diff.ts:splitDiff` 본문**: 생성=산출물 카드 / 수정=diff (D-001/D-002). 클라이언트가 `prev + engineResponse.new_state` 병합 후 호출.
3. **`lib/runtime.ts:rebuildRuntimeLog` 본문**: `step_events` 집계 → `known_issues` 생성. `failed_here`/`hotfix` 둘 다 처리 + StepEventType 4종 exhaustive switch.
4. **`lib/fingerprint.ts:recomputeFingerprint` 본문**: 여러 레시피의 RuntimeLog 교차분석 → 사람별 부엌 지문.
5. **`components/BuildMode.tsx` 본문**: `/api/recipe` 200 응답 shape `{ engineResponse, parsedAt }` 매핑 + `splitDiff(prev, engineResponse.new_state)` 클라 호출. 생성=카드 / 수정=diff 분리 렌더링.
6. **`components/CookMode.tsx` 본문**: 스텝 진행 + `timer_sec` 타이머 + Wake Lock + 인라인 핫픽스(D-006, `step_events`에만 기록).
7. **`components/Postmortem.tsx` 본문**: 3단 평가(`outcome`) + 실패 스텝 핀포인트(`failed_here`). Cook 종료 시 자동 진입 강제(§4).
8. **사용자 인증 흐름 전체 (D-015 P2 이월 항목)**: 로그인 UI + 세션 영속(쿠키 vs 스토리지) + refresh token 만료/갱신 + RLS 정책별 user_id 매칭 매트릭스 + OAuth provider/콜백. 본 사이클의 D-015(인증 *경계 정책*)를 확장.
9. **TASTE.md §5 미정 항목 결정**: 분량 스케일링, 게이지 초기값, Fingerprint confidence 임계(현재 0.5는 잠정), 대체 재료 허용 — 본격 BUILD 사이클 진입 전 유케이 결정 필요.
10. **`components/FingerprintCard.tsx` 신설**: 부엌 지문 프로필 노출 (전환 비용 가시화).

### 막힌 것 / 결정 대기
- **없음** — D-015 인증 ADR은 doc-taste-scribe 리더 컨설팅 → 리더 즉시 등재 결정으로 명료화 (본 사이클 ADR 본문에 P2 이월 항목 명시 분리).
- T3 §8 잔존 위험 R16(recipe ownership 미검증)/R17(Anthropic 클라 캐싱)/R18(재시도 user 메시지)/R19(extractJson 슬라이스 노이즈) 모두 의도된 동작 또는 별도 ADR 후보. 현재 블로커 아님.
- TASTE.md §5 미정 항목은 본격 BUILD 사이클 진입 전 유케이 결정 필요 (위 다음 할 일 #9).

### 메모
- 본 사이클은 `lib/prompt.ts`의 `KNOWN_ISSUES_BUDGET = 5`/`TRAIT_MIN_CONFIDENCE = 0.5` 두 상수가 ADR 또는 TASTE.md 결정에 종속 — 변경 시 ADR 갱신 + 코드 수정 두 단계가 필요한 의도된 마찰.
- 빌드 검증(`npm install && npm run typecheck && npm run build`)은 사용자(유케이)가 더미 키 채워 직접 실행 권고. 환경변수 부재 상태에서 빌드 자체는 통과해야 하나 런타임 호출 시점에 throw.
- weld-trace 스킬은 본 사이클에서 직접 호출 실패(`.claude/skills/weld-trace/SKILL.md` 본문 참조로 정적 분석 대체). 스킬 등록 점검은 다음 사이클 전 권고.

---

## 세션 1 — P0 사이클 (셸 부트스트랩 + rate limit + env 격리)

**일자**: 2026-06-13 ~ 2026-06-14
**운영 모드**: viberecipe-orchestrator (6인 + team-lead). 본 사이클 활성: welding-architect, schema-architect, engine-builder, welding-inspector, doc-taste-scribe.
**최종 판정**: T3 PASS (결함 0). P0 두 항목 완료.

### 한 일
- **사전 감사 (Phase 1.5)**: 프로젝트 셸 부재 발견 (`package.json`/`app/`/`lib/`/`.env*`/`tsconfig.json` 모두 없음). 후보 A/B/C 정리 후 사용자에게 NEED_USER_DECISION.
- **사용자 결정 (T1)**: 후보 A — 헌법 강제형 풀셸 부트스트랩 + P0 동시 적용 채택.
- **ADR D-011 등재**: 셸 부트스트랩은 §6 디렉토리 트리 전체를 placeholder로 한 번에 만든다는 결정을 `docs/DECISIONS.md`에 정식 등재. 본 사이클의 SSOT 충돌 조기 검출 사례를 결과 섹션에 기록.
- **스키마/마이그레이션 (T1.5, schema-architect)**: `lib/schema.ts` (RecipeState/CookRun/RuntimeLog/Fingerprint/BuildContext/EngineResponse/Stage Zod 스키마, D-005 `timer_sec` 강제), `supabase/migrations/0001_init.sql` (5 테이블 + RLS 정책, DATA_MODEL.md §6 기준). rev2에서 ENGINE.md §3 계약 보강.
- **셸 부트스트랩 (T2, engine-builder)**: 21개 파일 작성 — `package.json`/`tsconfig.json`/`next.config.ts`/`.env.example`/`.gitignore` (루트), `lib/env.ts`(server-only)/`lib/ratelimit.ts`(Upstash sliding window)/`lib/supabase.ts`(D-007 주석), `lib/{prompt,diff,runtime,fingerprint}.ts` (시그니처 가이드 주석 placeholder), `app/api/{recipe,run}/route.ts` (rate limit 게이트 + env 가드 + 501 본문), `app/{layout,page}.tsx`, `components/{BuildMode,CookMode,Postmortem}.tsx` (placeholder + 용접 주석).
- **SSOT 충돌 해소 (T2 rev2)**: 라우트 로컬 스키마 정의 → `@/lib/schema` 단일 출처 import로 회복. 풀셸 부트스트랩이 한 사이클 안에서 표류를 조기 검출.
- **정합성 검증 (T3, welding-inspector)**: weld-trace 5라인 PASS, 경계 C(Zod ↔ DB) 7/7 PASS, P0 강제 5점검(A~E) PASS, cold-start 검증 PASS, 결함 0건.
- **문서 동기화 (T4, doc-taste-scribe)**: D-011 등재, MAP 23 파일 + 역할 설명 반영, ROADMAP P0 [x] 마킹, SESSION/CLAUDE.md §9 갱신.

### 다음 할 일 (ROADMAP P1 순서)
1. `lib/prompt.ts` 본문: 페어 쿠킹 시스템 프롬프트 (ENGINE.md §3·§5). BuildContext(`runtime_log.known_issues` + `fingerprint.traits` + `cold_start`) 주입 강제. cold start 시 "맹탕 모드" 명시.
2. `app/api/recipe/route.ts` 본문: Anthropic 호출 + `EngineResponseSchema` safeParse + D-004 1회 자동 재시도 + `splitDiff(prev, next)` 호출.
3. `lib/diff.ts` 본문: `splitDiff` 구현 (생성=산출물 카드, 수정=diff, D-001/D-002).
4. `components/CookMode.tsx`: 스텝 진행 + `timer_sec` 타이머 + Wake Lock + 인라인 핫픽스(D-006, `step_events`에만 기록).
5. `components/Postmortem.tsx`: 3단 평가(`outcome`) + 실패 스텝 핀포인트(`failed_here`).
6. `app/api/run/route.ts` 본문: cook_runs INSERT → runtime_logs UPSERT → fingerprints UPSERT 트랜잭션 (Postgres RPC 권장, D-008 용접 강제 지점).
7. `lib/runtime.ts` + `lib/fingerprint.ts` 본문: 집계 / 교차분석.
8. 사용자 인증/세션 + service-role 호출 전 user_id 매칭 (T2 §5 R4 가드).
9. `components/FingerprintCard.tsx`: 부엌 지문 프로필 노출 (전환 비용).

### 막힌 것 / 결정 대기
- **없음** — 본 사이클에서 발생한 NEED_USER_DECISION(D-011)은 후보 A 채택으로 해소됨.
- T2 §5의 잔존 회귀 위험 R1~R8 + rev2의 R9~R11은 모두 P1 작업 시점의 가드 대상이지 현재 블로커 아님.
- TASTE.md §5 미정 항목(분량 스케일링, 게이지 초기값, Fingerprint confidence 임계, 대체 재료 허용)은 P1 진입 직전 유케이 결정 필요.

### 메모
- 빌드 검증(`npm install && npm run typecheck && npm run build`)은 사용자(유케이)가 더미 Upstash/Anthropic/Supabase 키를 `.env.local`에 채운 후 직접 실행 권고. server-only 위반은 빌드 타임에 잡힘.
- Supabase 프로젝트가 아직 없으므로 `supabase db push`는 P1 진입 시 사용자 측 셋업.
- Cook→Postmortem 자동 진입(§4 강제 규칙)은 P1에서 modal 또는 blocking route 둘 중 하나 선택 필요.

---

## 세션 0 — 설계 합의 & 문서화 (기획 단계)

### 한 일
- 바이브 코딩의 루프를 레시피로 이식하는 컨셉 확립 (v1 즉시빌드 → v2 대화빌드 → v3 생성/수정 분리)
- v3 BUILD MODE 프로토타입 완성, Next.js 프로젝트로 포팅 + 빌드 검증 통과
- VIBE 2.0 기획: Cook=Run (Build→Cook→Postmortem 순환, RuntimeLog 피드백 루프)
- 복제 불가능성 전략 확정:
  - 시간 해자: Fingerprint (MVP), 집단 지성 (Phase 2)
  - 즉시 해자: 용접 구조(D-008) + 취향(D-009) ← 진짜 방어
- 전체 문서 세트 작성 (CLAUDE.md + docs/*)

### 다음 할 일 (우선순위 순 — ROADMAP 참조)
1. `lib/schema.ts`에 steps `{text, timer_sec}` 구조 반영 (D-005) + CookRun/RuntimeLog/Fingerprint 추가
2. `components/CookMode.tsx` 구현 (타이머 + Wake Lock + 핫픽스)
3. `components/Postmortem.tsx` + `/api/run` (용접 강제: Cook→Postmortem→Fingerprint)
4. Supabase 연결 (`lib/supabase.ts`, 테이블 + RLS)
5. 배포 전: `/api/*` rate limit (P0 보안)

### 막힌 것 / 결정 대기 (유케이에게)
- TASTE.md §5의 미정 항목들 (분량 스케일링, 게이지 초기값, Fingerprint 임계 confidence, 대체 재료 허용 범위)

### 메모
- v3 단일 파일(`VibeRecipe.tsx`)을 BuildMode.tsx로 분리하면서 schema 변경(steps 구조)을 같이 반영할 것. 한 번에.
