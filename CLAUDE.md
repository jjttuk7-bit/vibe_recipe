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
