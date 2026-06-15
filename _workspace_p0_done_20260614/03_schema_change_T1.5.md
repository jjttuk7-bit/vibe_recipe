# T1.5 — 스키마 변경 보고서

**작성자**: schema-architect
**일자**: 2026-06-13
**입력**: `docs/DATA_MODEL.md` §1~§6, `docs/DECISIONS.md` D-005·D-006·D-007·D-008, `docs/ENGINE.md` §3·§5·§6, `_workspace/02b_user_decision_T1.md` (후보 A 채택)
**산출물**: `lib/schema.ts`, `supabase/migrations/0001_init.sql`

> **개정 이력**
> - rev1 (2026-06-13): 초안 — RecipeState/CookRun/RuntimeLog/Fingerprint/BuildContext + 마이그레이션.
> - **rev2 (2026-06-13)**: engine-builder 요청 + ENGINE.md 정독에 따른 보강.
>   - `EngineResponseSchema` 신설 (ENGINE.md §3 계약). `app/api/recipe/route.ts` D-004 재시도 골격이 이걸로 safeParse.
>   - `StageSchema` 신설 (`"concept"|"base"|"taste"|"steps"|"done"`).
>   - `Step.timer_sec` 타입을 `number|null` → `number ≥ 0`으로 정합화. ENGINE.md §6 컨벤션("시간 없는 스텝은 timer_sec=0")이 더 구체적·운영 친화적이라 채택. Cook Mode는 `timer_sec === 0`이면 타이머 UI 미표시.
>   - `GaugeSchema`를 `int().min(0).max(10)`에서 `coerce` + `transform(clamp 0~10 + round)`로 강화 (ENGINE.md §5 "게이지 clamp는 Zod transform에서 방어"). LLM이 12나 -1을 뱉어도 정상화.
>   - `RecipeState.steps`에 `.max(8)` 추가 (ENGINE.md §5).

---

## 1. 추가/수정/삭제 요약

이전 상태가 "스키마 부재"이므로 본 변경은 **전면 신설(initial)** 이다. 따라서 "추가"만 존재하고 "수정/삭제"는 없다. 대신 DATA_MODEL.md 대비 **명세 보강(refinement)** 사항을 명시한다.

### 1.1 신설 (lib/schema.ts)

| 식별자 | 종류 | 매핑되는 헌법 조항 |
|---|---|---|
| `IngredientSchema`, `Ingredient` | 재료 1개 (name+amount) | DATA_MODEL.md §1 |
| `TasteSchema`, `Taste` | 맛 게이지 6종 (0~10 정수) | DATA_MODEL.md §1 |
| `TextureSchema`, `Texture` | 식감 게이지 5종 (0~10 정수) | DATA_MODEL.md §1 |
| `StepSchema`, `Step` | **D-005 강제**: `{ text, timer_sec: number\|null }` | D-005 |
| `RecipeStateSchema`, `RecipeState` | 레시피 상태 전체. 모든 필드 optional (D-003 점진 빌드) | §1, D-003 |
| `StepEventTypeSchema`, `StepEventType` | **D-006 강제**: `"done"\|"timer_done"\|"hotfix"\|"failed_here"` | D-006 |
| `StepEventSchema`, `StepEvent` | step_events 한 건 | §2 |
| `OutcomeSchema`, `Outcome` | `"good"\|"meh"\|"failed"\|null` | §4 (Postmortem) |
| `CookRunSchema`, `CookRun` | 조리 1회 | §2 |
| `KnownIssueSchema`, `KnownIssue` | runtime_log 항목 1건 | §3 |
| `RuntimeLogSchema`, `RuntimeLog` | 레시피별 런타임 지식 | §3 |
| `TraitSchema`, `Trait` | fingerprint trait 1건 | §4 |
| `FingerprintSchema`, `Fingerprint` | 유저별 부엌 지문 (해자) | §4, D-007 |
| `BuildContextSchema`, `BuildContext` | **D-008 강제 지점**: 다음 BUILD에 주입되는 패키지 (`{ runtime_log, fingerprint, cold_start }`) | §4, D-008 |
| `StageSchema`, `Stage` | 빌드 파이프라인 단계 (`"concept"\|"base"\|"taste"\|"steps"\|"done"`) [rev2] | ENGINE.md §2 |
| `EngineResponseSchema`, `EngineResponse` | 엔진 → 서버 JSON 출력 계약. `app/api/recipe/route.ts` D-004 재시도 골격이 safeParse [rev2] | ENGINE.md §3 |

### 1.2 신설 (supabase/migrations/0001_init.sql)

| 테이블 | 키 / 관계 | jsonb 컬럼 → Zod 매핑 |
|---|---|---|
| `recipes` | id, user_id → auth.users | `state` ↔ `RecipeState` |
| `recipe_versions` | (recipe_id, version) unique | `state` ↔ `RecipeState` (이력 스냅샷) |
| `cook_runs` | recipe_id, user_id | `step_events` ↔ `StepEvent[]`, `outcome` ↔ `Outcome` |
| `runtime_logs` | recipe_id PK | `known_issues` ↔ `KnownIssue[]` |
| `fingerprints` | user_id PK | `traits` ↔ `Trait[]` |

모든 테이블에 RLS 활성화 + `auth.uid() = user_id` 정책. 정책 없는 테이블 없음.

### 1.3 DATA_MODEL.md 대비 명세 보강

DATA_MODEL.md는 의도와 관계 문서라 일부 디테일이 추론에 맡겨져 있었다. SSOT 작성 시 다음을 명시화했다 (헌법 충돌 없음 — 모두 D-005·D-006·D-007·D-008의 직접 귀결).

| 보강 항목 | 이유 |
|---|---|
| `Step.timer_sec`을 `number\|null` (옵셔널 아님) | DATA_MODEL.md는 `timer_sec: number`로만 표기. 옵셔널로 두면 빌드 단계에서 timer가 없는 스텝에 필드를 누락 → "정규식으로 파싱하지 않는다"(D-005) 위반 표류 위험. **타이머가 없으면 명시적으로 null을 박는다.** |
| `Outcome`이 `null` 가능 (DB에서는 `text NULL`) | DATA_MODEL.md의 `outcome: ... \| null`을 그대로 반영. Postmortem 미진입 상태를 표현. `completed=true && outcome=null` 금지 강제는 라우트 레벨 refine으로 P1에서 추가 (본 골격은 타입만). |
| `step_events`가 jsonb 배열이며 type에 `"hotfix"` 포함 | **D-006 강제 지점**. 핫픽스가 별도 테이블/필드가 아니라 step_events의 한 type임을 타입과 DB 양쪽에서 강제. |
| `recipe_versions`에 update/delete 정책 없음 | 히스토리는 불변. RLS로 자동 차단 (정책이 없으면 RLS에서 거부됨). |
| `cook_runs`에 delete 정책 없음 | 조리 기록 삭제는 Fingerprint 해자를 파괴하는 행위. 본인이라도 별도 ADR로 결정 필요. (현재는 차단.) |
| `BuildContextSchema` 추가 | DATA_MODEL.md에 없는 신규 타입이지만 **D-008(§4 강제 규칙)을 코드 레벨에서 강제**하기 위해 필수. RuntimeLog/Fingerprint 둘 다 null이면 `cold_start: true`로 시스템 프롬프트가 "맹탕 모드"임을 명시하도록 강제. |
| `recipes.created_at` / `recipes.updated_at` + 트리거 | DATA_MODEL.md에 명시 없으나 운영상 필수. Zod 스키마에는 포함하지 않음 (DB가 채움). |

### 1.4 삭제 / 미포함

- 없음 (전면 신설).

---

## 2. 마이그레이션 노트

### 2.1 적용 순서

`0001_init.sql` 단일 파일로 전체 스키마 생성. 의존 순서:

1. `pgcrypto` extension (`gen_random_uuid`용)
2. `recipes`
3. `recipe_versions` (recipes 참조)
4. `cook_runs` (recipes 참조)
5. `runtime_logs` (recipes 참조, PK = recipe_id)
6. `fingerprints` (auth.users 참조, PK = user_id)
7. `touch_updated_at()` 함수 + 트리거 3개 (recipes, runtime_logs, fingerprints)

### 2.2 사전 조건

- Supabase 프로젝트 + `auth.users` 테이블 존재 (Supabase 기본 제공).
- 별도 마이그레이션 도구 결정은 NEED_USER_DECISION 후보 D-011 보강 사항 (제안: Supabase CLI 또는 `supabase migration up`).

### 2.3 P0 셸 단계의 적용 정책

- 셸 부트스트랩 시점에는 **마이그레이션 파일을 작성만** 한다. 실제 Supabase 프로젝트 연결과 `supabase db push` 적용은 사용자(유케이)가 Supabase 프로젝트를 생성한 후. 본 P0 사이클에서는 `npm run build`가 성공하는 것이 셸 부트스트랩 성공 조건.

### 2.4 후속 마이그레이션 예상 (P1+)

- `0002_*`: P1에서 `app/api/run/route.ts`가 cook_runs → runtime_logs 갱신을 트랜잭션으로 처리할 때 필요하면 SQL 함수 추가.
- `0003_*`: Phase 2(D-007) 집단 지성 도입 시 익명 집계 테이블 추가.

---

## 3. 다음 단계 의존성 다이어그램

```
                ┌────────────────────────────────────────────┐
                │  lib/schema.ts  (이 SSOT)                  │
                │  ─────────────                              │
                │  RecipeStateSchema   RecipeState           │
                │  CookRunSchema       CookRun               │
                │  RuntimeLogSchema    RuntimeLog            │
                │  FingerprintSchema   Fingerprint           │
                │  BuildContextSchema  BuildContext (D-008)  │
                └───┬────────┬──────────┬────────────┬───────┘
                    │        │          │            │
       ┌────────────┘        │          │            └─────────────┐
       │                     │          │                          │
       ▼                     ▼          ▼                          ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│ app/api/     │  │ app/api/run/     │  │ lib/runtime.ts   │  │ lib/fingerprint.ts  │
│ recipe/      │  │ route.ts         │  │ (CookRun→        │  │ (RuntimeLog 교차→   │
│ route.ts     │  │ (CookRun 저장 +  │  │  RuntimeLog 집계)│  │  Fingerprint)       │
│ (Zod 검증 +  │  │  RuntimeLog 갱신 │  │                  │  │                     │
│  D-004 재시도)│  │  + Fingerprint   │  │                  │  │                     │
│              │  │  재계산 — D-008) │  │                  │  │                     │
└──────────────┘  └──────────────────┘  └──────────────────┘  └─────────────────────┘
       │                     │                    │                      │
       └─────────────────────┴────────────────────┴──────────────────────┘
                                     │
                                     ▼
                       ┌─────────────────────────────────┐
                       │ supabase/migrations/0001_init   │
                       │ ────────────────────────────────│
                       │ recipes.state         (jsonb)   │
                       │ recipe_versions.state (jsonb)   │
                       │ cook_runs.step_events (jsonb)   │
                       │ cook_runs.outcome     (text)    │
                       │ runtime_logs.known_issues       │
                       │ fingerprints.traits             │
                       └─────────────────────────────────┘
                                     ▲
                                     │ 경계 C (welding-inspector 검증)
                                     │ Zod ↔ DB 컬럼 매핑
```

### 3.1 engine-builder가 schema 의존 없이 시작 가능한 영역

- `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`
- `lib/ratelimit.ts`, `lib/env.ts`, `lib/supabase.ts` (D-007 주석)
- `lib/prompt.ts`, `lib/diff.ts`, `lib/runtime.ts`, `lib/fingerprint.ts` (빈 export + 용접 다이어그램 주석)
- `components/BuildMode.tsx`, `components/CookMode.tsx`, `components/Postmortem.tsx` (빈 placeholder)
- `app/page.tsx` (placeholder)

### 3.2 engine-builder가 schema 완료(=T1.5 완료) 후 진행

- `app/api/recipe/route.ts` — `RecipeStateSchema` 임포트 필요 (D-004 재시도 골격)
- `app/api/run/route.ts` — `CookRunSchema`, `RuntimeLogSchema`, `FingerprintSchema` 임포트 필요 (D-008 용접 강제 지점)

### 3.3 임포트 경로 표준

```ts
import {
  RecipeStateSchema, type RecipeState,
  CookRunSchema, type CookRun,
  RuntimeLogSchema, type RuntimeLog,
  FingerprintSchema, type Fingerprint,
  BuildContextSchema, type BuildContext,
  StepSchema, type Step,
  StepEventSchema, type StepEvent,
  OutcomeSchema, type Outcome,
} from "@/lib/schema";
```

`tsconfig.json` paths에서 `"@/*": ["./*"]` 매핑 필요 — engine-builder가 처리.

---

## 4. welding-inspector 검증 항목 (경계 C — Zod ↔ DB)

T2 완료 후 weld-trace로 다음을 확인:

| 검증 항목 | 기대 결과 |
|---|---|
| `recipes.state` jsonb → `RecipeStateSchema.safeParse(row.state).success` | true (RecipeState 라운드트립) |
| `cook_runs.step_events` jsonb → `z.array(StepEventSchema).safeParse(row.step_events).success` | true |
| `cook_runs.outcome` text → `OutcomeSchema.safeParse(row.outcome).success` | NULL/유효값 모두 true |
| `cook_runs` type 컬럼 값 도메인 = `StepEventTypeSchema` 도메인 | `"hotfix"` 포함, 1:1 일치 (D-006) |
| `runtime_logs.known_issues` jsonb → `z.array(KnownIssueSchema)` | true |
| `fingerprints.traits` jsonb → `z.array(TraitSchema)` | true |
| 모든 사용자 데이터 테이블에 RLS 활성화 + 정책 존재 | 5/5 테이블 (recipes, recipe_versions, cook_runs, runtime_logs, fingerprints) |

---

## 5. 헌법 강제 자가 점검 체크리스트

- [x] **D-005**: `StepSchema`가 `string`이 아니다. `{ text, timer_sec: number\|null }` 구조.
- [x] **D-006**: 핫픽스 채널이 RecipeState에 없다. `StepEventTypeSchema`의 한 enum 값으로만 존재.
- [x] **D-007**: 마이그레이션이 모든 사용자 데이터 테이블에 RLS 정책을 박는다. localStorage 분기 없음.
- [x] **D-008**: `BuildContextSchema`가 RuntimeLog + Fingerprint를 묶어 BUILD에 주입하는 구조를 코드 타입으로 강제. `cold_start` 필드 명시.
- [x] **§4 단방향 의존**: 외래키 체인이 `recipes → cook_runs → runtime_logs` + `auth.users → fingerprints`로 단방향.
- [x] **모든 타입을 한 곳에서 임포트**: `lib/schema.ts`만 SSOT. UI/엔진/DB가 분리된 타입 정의 없음.
