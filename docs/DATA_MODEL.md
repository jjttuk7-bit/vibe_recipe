# DATA_MODEL.md — 데이터 모델

> 타입의 단일 진실은 `lib/schema.ts` (Zod). 이 문서는 의도와 관계를 설명한다.
> 핵심: 데이터 모델 자체가 용접 구조(D-008)를 강제한다. Cook 없이는 RuntimeLog가 없고, RuntimeLog 없이는 Fingerprint가 없다.

---

## 1. RecipeState — 레시피 = 코드베이스

```ts
type RecipeState = {
  name?: string;
  concept?: string;                 // 한 줄
  ingredients?: { name: string; amount: string }[];
  taste?: { spicy, salty, sweet, sour, umami, fatty };   // 각 0~10
  texture?: { crispy, soft, chewy, soupy, thick };       // 각 0~10
  tools?: string[];
  time_min?: number;
  steps?: { text: string; timer_sec: number }[];          // D-005: 타이머 내장
};
```

- 점진 빌드(D-003)라 모든 필드 optional. 단계가 진행되며 채워진다.
- 게이지는 0~10 정수로 clamp (LLM이 벗어나도 깨지지 않게).
- **steps 구조 주의**: v3의 `string[]`에서 `{text, timer_sec}[]`로 변경됨 (D-005). Cook Mode 타이머의 전제.

---

## 2. CookRun — 조리 1회 = 한 번의 실행

```ts
type CookRun = {
  id: string;
  recipe_id: string;
  user_id: string;
  started_at: string;
  completed: boolean;
  outcome: "good" | "meh" | "failed" | null;
  step_events: {
    step_index: number;
    type: "done" | "timer_done" | "hotfix" | "failed_here";
    note?: string;        // "너무 짜서 물 추가", "여기서 탔음"
    timestamp: string;
  }[];
};
```

- COOK 모드의 모든 진행/핫픽스가 여기 쌓인다.
- 핫픽스는 `type:"hotfix"`로만 기록되고 RecipeState는 안 건드린다 (D-006).
- POSTMORTEM 없이 종료 불가 → `outcome`은 최소 1회 입력 강제.

---

## 3. RuntimeLog — 레시피에 누적되는 런타임 지식

```ts
type RuntimeLog = {
  recipe_id: string;
  total_runs: number;
  known_issues: {
    step_index: number;
    issue: string;          // "3번 강불이면 탐"
    fix_applied?: string;   // "중약불 + 30초 단축으로 해결"
    resolved: boolean;
  }[];
};
```

- 여러 `CookRun`을 집계해서 만든다 (`lib/runtime.ts`).
- BUILD 시작 시 이 레시피의 `known_issues`를 엔진 프롬프트에 주입 → 회귀 방지.

---

## 4. Fingerprint — 사람별 부엌 지문 (해자, D-007)

```ts
type Fingerprint = {
  user_id: string;
  total_runs_all_recipes: number;
  traits: {
    key: string;            // "heat_power", "noodle_overcook", "sweet_aversion"
    label: string;          // "화력 강함", "면류 불음 주의", "단맛 회피"
    confidence: number;     // 0~1, run 수가 쌓일수록 상승
    evidence_run_ids: string[];
  }[];
};
```

- 여러 레시피의 RuntimeLog를 **가로질러** 패턴을 뽑는다 (`lib/fingerprint.ts`).
  - 예: 볶음류 레시피 다수에서 `failed_here`가 강불 스텝에 몰림 → `heat_power: 강함`
  - 예: 단맛을 매번 -2씩 패치 → `sweet_aversion`
- BUILD 첫 프롬프트에 주입 → 처음부터 그 부엌에 맞는 레시피.
- 사용자에게 프로필로 노출 → 전환 비용. 다른 앱은 다시 0회차부터.

---

## 5. 용접 의존성 (THE WELD를 데이터로 강제)

```
RecipeState ──(빌드)──> CookRun ──(집계)──> RuntimeLog ──(교차분석)──> Fingerprint
     ▲                                                                      │
     └──────────────(다음 빌드 프롬프트에 주입)──────────────────────────────┘
```

- **단방향 의존이 곧 해자**: CookRun 없이 RuntimeLog 못 만들고, RuntimeLog 없이 Fingerprint 못 만든다. 경쟁자가 BUILD UI만 베끼면 이 사슬 전체가 비어 있다.
- BUILD가 Fingerprint를 조회하지 못하면 "cold start"로 명시 (맹탕 경고). 이 조회를 생략하는 구현은 용접을 끊는 것 → 금지(D-008).

---

## 6. Supabase 테이블 (제안)

| 테이블 | 키 | 비고 |
|---|---|---|
| `recipes` | id, user_id | RecipeState를 jsonb로 |
| `recipe_versions` | id, recipe_id, version, state | 빌드/패치 히스토리 (롤백용) |
| `cook_runs` | id, recipe_id, user_id | step_events를 jsonb로 |
| `runtime_logs` | recipe_id | known_issues를 jsonb로 (cook_runs에서 갱신) |
| `fingerprints` | user_id | traits를 jsonb로 (runtime_logs 교차분석) |

RLS: 모든 테이블 `user_id` 기반 행 수준 보안. Fingerprint/RuntimeLog는 본인만 접근(Phase 2 집단 지성에서 익명 집계로 확장).
