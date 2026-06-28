# CLAUDE.md — 바이브 레시피 (VIBE RECIPE)

> 이 파일은 Claude Code가 모든 세션에서 가장 먼저 읽는 헌법이다.
> 여기 적힌 것은 "참고"가 아니라 "제약"이다. 충돌 시 이 문서가 이긴다.
> 새 작업을 시작하기 전에 반드시 이 파일과 `docs/DECISIONS.md`를 읽는다.

---

## 0. 한 줄 정의

레시피를 코드처럼 **빌드(write)** 하고, 부엌에서 **실행(run)** 하고, 런타임 결과를 다음 빌드로 **되먹이는(debug)** 페어 쿠킹 IDE.

기존 레시피 앱은 레시피를 주고 손을 뗀다. 우리는 부엌에서 일어난 일을 시스템이 기억하게 만든다.

---

## 1. 제품 철학 (절대 흔들리지 않는 것)

1. **요리는 컴파일이 아니라 런타임이다.** 레시피 생성에서 끝나는 기능은 우리 제품이 아니다. 모든 기능은 결국 "실제로 요리해본 결과"로 수렴해야 한다.
2. **답변이 아니라 diff를 준다.** 사용자가 보는 것은 채팅 버블이 아니라 변경 내역이다.
3. **한 번에 완성하지 않는다.** 바이브 코딩의 페어 프로그래밍처럼, 한 턴에 한 단계씩 합의하며 빌드한다.
4. **베끼려면 전부를 베껴야 한다.** 각 기능은 독립 부품이 아니라 하나로 용접된 루프의 일부다. (→ §4 용접 구조)

이 네 가지에 어긋나는 기능 제안은, 사용자가 요청해도 먼저 충돌을 지적하고 확인을 받는다.

---

## 2. 핵심 메타포 매핑 (바이브 코딩 → 레시피)

| 바이브 코딩 | 바이브 레시피 | 구현 위치 |
|---|---|---|
| 코드베이스 (single source of truth) | `RecipeState` JSON | `lib/schema.ts` |
| plan mode, 점진 커밋 | 빌드 파이프라인 concept→base→taste→steps→done | `lib/prompt.ts` |
| `str_replace` 부분 수정 | 패치 규율: 무관 필드 불변 | 시스템 프롬프트 §규칙6 |
| git diff | 수정만 diff로 (생성은 산출물 카드) | `lib/diff.ts` `splitDiff` |
| `npm run dev` (실행) | Cook Mode | `components/CookMode.tsx` |
| 런타임 에러 / 스택트레이스 | RuntimeLog (어느 스텝에서 터졌나) | `lib/runtime.ts` |
| 컴파일 에러 재던지기 | Zod 검증 실패 시 에러 피드백 자동 재시도 | `app/api/recipe/route.ts` |
| 린트 경고 | warnings (전자레인지로 바삭 등) | 시스템 프롬프트 §규칙7 |
| 회귀 테스트 | known_issues를 다음 빌드에 주입 | `lib/fingerprint.ts` |

**메타포를 어디까지 가져갈지의 기준** (DECISIONS.md D-002 참조): 코딩 문법(diff 기호 등)을 그대로 가져오지 말고, 그 문법이 *해결하던 문제*(변경 추적)를 가져온다. 생성을 diff로 보여주는 것은 메타포의 오용이다.

---

## 3. 3-모드 = 개발 사이클

```
BUILD ──> COOK ──> POSTMORTEM
  ▲                      │
  └──── RuntimeLog 주입 ──┘
```

- **BUILD**: 대화로 레시피 빌드. 생성은 산출물 카드로, 수정만 diff로.
- **COOK**: `recipe.run()`. 스텝 진행 + 타이머 + 핸즈프리 + 인라인 핫픽스.
- **POSTMORTEM**: 30초 회고. 결과 평가 + 실패 스텝 핀포인트. 이것이 RuntimeLog가 된다.

세 모드는 분리된 화면이 아니라 하나의 순환이다. 어느 하나만 구현하면 제품이 아니다.

---

## 4. 용접 구조 (THE WELD) — 가장 중요

이 제품의 복제 불가능성은 기능이 아니라 **용접 구조**에서 나온다. 각 단계의 출력은 다음 단계의 **필수 입력**이다. 레고가 아니라 용접이다.

```
Cook의 핫픽스 ──필수──> Postmortem 회고
Postmortem ──필수──> Fingerprint 갱신
Fingerprint ──필수──> 다음 Build의 첫 프롬프트
```

### 강제 규칙 (코드로 박을 것)
- BUILD가 시작될 때 해당 레시피/사용자의 `RuntimeLog`와 `Fingerprint`를 **반드시** 조회한다. 없으면 "맹탕(cold start)" 상태로 명시한다.
- COOK에서 발생한 핫픽스는 **반드시** `CookRun.step_events`에 기록되고, 종료 시 POSTMORTEM으로 흘러간다. 핫픽스만 기록하고 버리는 경로는 금지.
- POSTMORTEM 없이 COOK을 종료할 수 없다 (최소 1탭 회고는 받는다).

### 금지 사항
- ❌ Cook Mode를 독립 화면으로만 구현하고 데이터를 어디에도 안 흘리는 것
- ❌ Postmortem 결과를 Fingerprint에 반영하지 않고 별점처럼 죽이는 것
- ❌ "이 기능만 일단 예쁘게" — 용접을 끊는 모든 부분 구현

새 기능을 추가할 때는 항상 자문한다: **"이 기능을 떼어내도 다른 단계가 여전히 완전한가?"** 답이 "예"라면 용접이 안 된 것이다. 다시 설계한다.

---

## 5. 취향 해자 (TASTE) — 명세서로 못 옮기는 판단

이 제품의 두 번째 DNA는 유케이의 도메인 판단이다 (커피·차 로스팅/관능평가 배경). 코드 곳곳의 미세한 판단 — 맛 게이지를 6개로 둘지, 스텝을 몇 개로 자를지, 핫픽스에서 "물 넣어" vs "불 줄여" 중 무엇을 먼저 말할지 — 은 명세가 아니라 감각이다.

### Claude Code에게
- 맛/식감 분류, 스텝 분할 기준, 조리 원리 판단이 필요한 순간에는 **임의로 결정하지 말고** `docs/TASTE.md`의 원칙을 따른다.
- TASTE.md에 없는 새 판단이 필요하면, 결정하지 말고 사용자(유케이)에게 묻는다. 이 판단들이 곧 해자다.

---

## 6. 기술 스택 & 구조

- Next.js 15 (App Router) + React 19 + TypeScript + Zod
- Supabase (Postgres) — RuntimeLog/Fingerprint 영속화. **localStorage 금지** (해자의 자산이므로 서버 영속 필수)
- 엔진: Anthropic API. 기본 모델 `claude-haiku-4-5-20251001`, 환경변수 `VIBE_RECIPE_MODEL`로 교체
- 배포: Vercel

```
app/
├── page.tsx                  # 엔트리
├── api/recipe/route.ts       # 엔진: API 호출 + Zod 검증 + 자동 재시도
├── api/run/route.ts          # CookRun 저장 + Fingerprint 갱신
lib/
├── schema.ts                 # RecipeState/CookRun/Fingerprint Zod 스키마 (타입의 단일 진실)
├── prompt.ts                 # 페어 쿠킹 시스템 프롬프트
├── diff.ts                   # splitDiff: 생성 vs 수정 분리 (diff는 코드가 계산)
├── runtime.ts                # CookRun → RuntimeLog 집계
├── fingerprint.ts            # 여러 레시피의 RuntimeLog → 사람별 부엌 지문
components/
├── BuildMode.tsx
├── CookMode.tsx
└── Postmortem.tsx
docs/
├── DECISIONS.md  PRD.md  DATA_MODEL.md  ENGINE.md  TASTE.md  MAP.md  SESSION.md  ROADMAP.md
```

---

## 7. 불변 설계 결정 (요약 — 상세는 DECISIONS.md)

- **D-001** diff는 LLM이 아니라 코드가 계산한다. LLM은 new_state 전체를 반환.
- **D-002** 생성은 산출물 카드, 수정만 diff. (git이 새 파일에 +500줄 diff를 안 보여주는 이유)
- **D-003** 한 턴에 한 단계. "알아서 다 해줘"는 예외로 허용.
- **D-004** 검증 실패는 에러 피드백으로 1회 자동 재시도.
- **D-005** 타이머 시간은 텍스트 파싱 금지. 스텝에 `timer_sec` 필드로 내장.
- **D-006** 핫픽스는 새 버전을 만들지 않는다. CookRun에만 기록.
- **D-007** Fingerprint는 MVP 필수. 집단 지성(네트워크)은 Phase 2.

---

## 8. 작업 규약 (Claude Code 행동 지침)

1. 세션 시작 시 `CLAUDE.md` → `docs/SESSION.md` → `docs/DECISIONS.md` 순으로 읽는다.
2. 설계에 영향을 주는 결정을 내렸으면 `docs/DECISIONS.md`에 ADR 형식으로 추가한다.
3. 세션 종료 시 `docs/SESSION.md`에 한 일 / 다음 할 일 / 막힌 것을 기록한다.
4. 새 파일/모듈을 만들면 `docs/MAP.md`를 갱신한다.
5. 보안: API 키는 서버에만. 배포 전 `/api/*`에 rate limit 필수 (ROADMAP P0).
6. 철학(§1)이나 용접 구조(§4)와 충돌하는 요청은 구현 전에 충돌을 명시하고 확인받는다.

---

## 9. 하네스: VIBE RECIPE 6인 에이전트 팀

**목표:** 헌법(§1·§4·§7) 사전 가드와 사후 정합성 검증을 양방향으로 강제하면서 BUILD/COOK/POSTMORTEM 루프를 구현한다.

**트리거:** ROADMAP 항목 진행, schema/엔진/UI 변경, 새 ADR 후보 발생, 핫픽스·RuntimeLog·Fingerprint 관련 작업, 용접 정합성 검증 요청 시 `viberecipe-orchestrator` 스킬을 사용한다. 단순 질문·읽기 작업은 직접 응답해도 무방.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-13 | 초기 하네스 구성 (6인 팀: welding-architect, schema-architect, engine-builder, ui-builder, doc-taste-scribe, welding-inspector / 스킬 4: viberecipe-orchestrator, constitution-check, weld-trace, taste-consult) | 전체 | 그린필드 프로젝트의 헌법 준수형 구현 체계 구축 |
| 2026-06-13 | Phase 6 검증 보강 — (1) welding-architect/inspector/doc-taste-scribe에 `Skill` 도구로 각자의 절차 스킬을 호출하도록 명시, (2) 6개 에이전트 전부에 "재호출 지침" 섹션 추가 | agents/* | 드라이런에서 스킬 호출 명시 누락 + 후속 작업 시 에이전트 측 대응 누락 발견 |
| 2026-06-14 | P0 사이클 완료 — 셸 부트스트랩 + rate limit + env 격리 + ADR D-011 등재. 신규 파일 23개(`app/*`, `lib/*`, `components/*`, `supabase/migrations/0001_init.sql`, 루트 설정 5종). welding-inspector PASS. | docs/* + 전체 셸 | ROADMAP P0 두 항목 완료 |
| 2026-06-15 | P1 엔진 코어 완료 — lib/prompt.ts + lib/buildContext.ts(신설) + /api/recipe 본문 + ADR D-012/D-013/D-014 등재. welding-inspector PASS 결함 0건. | docs/* + lib/* + app/api/recipe | ROADMAP P1 첫 묶음 |
| 2026-06-18 | P1 Cook 사이드 구현 — lib/auth.ts 신설, /api/run RPC 루프, runtime/fingerprint/diff 본문, Build/Cook/Postmortem 작업용 UI, ADR D-016~D-018 등재. | app/* + components/* + lib/* + docs/* | Cook→Postmortem→RuntimeLog/Fingerprint 용접 루프 활성화 |
| 2026-06-20 | P1 마무리 — FingerprintCard 신설(부엌 지문 가시화), lib/fingerprintStore.ts + /api/fingerprint 신설, app/page.tsx Postmortem 저장 → 카드 재페치 회로(용접 가시성), ADR D-019(Fingerprint 클라 노출 SSOT) + D-020(confidence 백분율) 등재, TASTE.md §5 항목 등재. welding-inspector FP.T4 PASS 결함 0. ROADMAP P1 8/8 완료. | app/* + components/* + lib/* + docs/* | ROADMAP P1 마지막 항목 — D-007 가치 전달의 사용자 인식 가시화 |
| 2026-06-21 | BUILD 리디자인 — components/BuildMode.tsx 풀 재작성(채팅 + 5-stage progress + 옵션 칩 + 임베드 ArtifactCard/GaugesCard/StepsCard/ModifiedChips/Warnings), app/globals.css 신규 40+ 클래스, ADR D-021 등재(2026-06-18 IDE 풍 SUPERSEDED), TASTE.md §6 신규 등재. welding-inspector BR.T3 PASS 결함 0. /api/recipe 인터페이스 변경 0. | components/BuildMode.tsx + app/globals.css + docs/* | §1.3/D-002/D-003 정신 *UX 복원* — 메타포 함정(코딩 문법 동일시 오류) 사례 학습 |
| 2026-06-21 | 고도화 사이클 1 — 사용자 직접 수정(D-022) + 에디트 히스토리(D-023). 임베드 인터랙티브 확장(재료/도구 칩 ✕ + 게이지 +/-), Mutation 모델 + B+ 흐름(즉시 mutate + user 메시지 자동 생성), 클라 messages 무한 누적, 1단계 undo. D-001/D-002/D-021 결과 섹션 보강. TASTE §6 mutation 표현 등재. welding-inspector AD.T3 PASS 결함 0. /api/recipe·schema 변경 0. | components/BuildMode.tsx + app/globals.css + docs/* | 페어 프로그래밍 *양방향* 흐름 — *사용자 주도 → LLM 합의*를 UI로 박음 |
| 2026-06-21 | 고도화 사이클 2 — Plan 가시화(D-024) + Context 투명성(D-025). lib/stagePlan.ts 신설(stage별 required/optional 필드 SSOT, RecipeField=keyof RecipeState 컴파일 결합). /api/recipe 응답 wrapper에 context_used 추가(서버가 채움, EngineResponseSchema 변경 0). 임베드 최상단에 StagePlanCard + ContextMetaCard 두 메타 카드. D-021 결과 섹션에 임베드 2층위(상태 메타 / 산출물 메타) 명시화. welding-inspector PC.T4 PASS 결함 0. | lib/stagePlan.ts + app/api/recipe/route.ts + components/BuildMode.tsx + app/globals.css + docs/* | 페어 프로그래밍 *plan 패널 + context 인스펙터* — 사용자가 어디까지 합의했고 왜 이 응답이 왔는지 항상 본다 |
| 2026-06-21 | 디자인 사이클 1 (DR1) — 시각 시스템 적용(D-026). 사용자 디자인 스크린샷 3종 기반. 색 5종(--paper/--ink/--heat/--gold + 신규 --accent-green) + 폰트 3종(next/font/google Newsreader + JetBrains Mono + Pretendard fallback) + 마이크로 요소(pair-chef "셰" 아바타 + 사용자 칩 검정/흰 + 원형 주황 ↑ 전송 + aux-chip 4종 + 헤더 brand-line/autosave-pill/cook-mode-btn). TASTE §6 *잠정→확정*. welding-inspector DR1.T3 PASS 결함 0. /api/recipe·schema 변경 0. | app/layout.tsx + app/globals.css + app/page.tsx + components/BuildMode.tsx + docs/* | 디자인 시스템 SSOT 박음 — 임의 hex 금지(D-009 정합). 메타포 함정의 시각판 재발 방지 |
| 2026-06-21 | 디자인 사이클 2 (DR2) — 2-pane 레이아웃(D-027). 사용자 0001 스크린샷의 핵심. 좌 chat-side(채팅+옵션칩+Warnings 인라인+입력) / 우 recipe-side sticky `<RecipeCanvas>`(산출물 + 메타 mini + 변경 칩 + 빈 상태). pipeline-rail / runtime-inspector 제거. FingerprintCard 페이지 하단 이동. 헤더 h1/p 제거 슬림화. BuildMode 풀 재작성 + 신규 `<RecipeCanvas>` / `<StagePlanCardMini>` / `<ContextMetaCardMini>`. D-021 결과 섹션에 *공간 분리* 보강. welding-inspector DR2.T3 PASS 결함 0. EngineResponseSchema / RequestBodySchema / lib/schema / /api/recipe 변경 0. | app/page.tsx + components/BuildMode.tsx + app/globals.css + docs/* | 페어 코딩 IDE의 우측 코드 패널 메타포 — 대화는 *흐름*, 캔버스는 *결과* |
| 2026-06-28 | 에이전트형 BUILD 고도화 사이클 (DR4) — 응답 2단계 스트리밍(D-029). 사용자 선택 방향("BUILD 대화를 더 에이전트답게") + AskUserQuestion(방식 B / 범위 ① 스트리밍). LLM 출력 = 평문 메시지 → `===STATE_JSON===` → 구조 JSON(message 제외). 서버 SSE: 평문 토큰 실시간(delta) + 구조 JSON 완결 검증 후 done. `EngineStructuredSchema=omit(message)` 신설(additive). route.ts 비스트리밍→ReadableStream(streamAnthropicText/runStreamingAttempt/assembleEngineResponse), BuildMode `consumeRecipeStream`+`streamingText`+`.stream-caret`. D-001(검증 후 diff)/D-002/D-004 보존, §4 무영향. welding-inspector DR4.T6 PASS 결함 0. typecheck/6-test PASS. | lib/schema.ts + lib/prompt.ts + app/api/recipe/route.ts + components/BuildMode.tsx + app/globals.css + docs/* | 페어 코딩의 *실시간 타이핑* 페어링 감각 — 단 new_state 원자성(D-001)을 깨지 않는 2단계 분리 |
| 2026-06-21 | 디자인 사이클 3 (DR3) — cold-start hero(D-028). 0002 스크린샷 정합. messages=0 && lastResponse=null 분기에서 `<ColdStartHero>` 단독 렌더 — 시간 라벨(formatTimeLabel 동적) + 큰 제목 "오늘, 뭐가 있어요?" + 부제 + 입력 + quickstart 5종("냉장고 털기/10분 야식/다이어트 한 끼/손님 초대상/아이 반찬"). 첫 입력 = 자동 2-pane 진입. welding-inspector DR3.T3 PASS 결함 0. /api/recipe·schema 변경 0. | components/BuildMode.tsx + app/globals.css + docs/* | 처음 만나는 사용자에게 *시작점 명시* — 칩이 합의의 첫 칸 |
