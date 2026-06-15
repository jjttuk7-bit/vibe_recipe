# Phase 1.5: 사전 조건 감사 (Pre-Team)

P0 작업을 분해하기 전에, 작업의 **전제 조건**이 충족되어 있는지 점검한다.
이는 welding-architect가 헌법 검증 Step 1을 시작하기 전에 자명히 발견할 사항이므로,
팀을 스폰하기 전에 사용자에게 보고하여 비용을 절감한다.

## 발견: 프로젝트 셸 부재

`D:/projects/services/draft/viberecipe/vibe-recipe-docs/` 내부에 다음이 모두 부재함:

| 파일/디렉토리 | 상태 | P0와의 관계 |
|--------------|------|------------|
| `package.json` | 없음 | npm install (`@upstash/ratelimit`) 불가 |
| `app/` | 없음 | `/api/*` 라우트를 둘 곳이 없음 |
| `next.config.ts` / `next.config.js` | 없음 | Next.js 설정 부재 |
| `.env.local` / `.env.example` | 없음 | `ANTHROPIC_API_KEY` 격리 검증 대상 없음 |
| `tsconfig.json` | 없음 | TypeScript 설정 부재 |
| `vercel.json` (선택) | 없음 | 배포 타깃 부재 |
| `supabase/` | 없음 | DB 클라이언트 부재 (P1까지는 OK이지만 .env에는 영향) |

## 결정 분기

P0를 진행하려면 둘 중 하나:

### 옵션 A: 프로젝트 셸 부트스트랩 후 P0 진행
- Next.js 15 + React 19 + TS + Zod + Supabase 클라이언트 + Anthropic SDK + @upstash/ratelimit 초기 설치
- `app/page.tsx`, `app/api/recipe/route.ts` (placeholder), `app/api/run/route.ts` (placeholder) 셸 생성
- `.env.example`로 키 정책 명시 (실제 키는 사용자가 직접 입력)
- 그 위에 rate limit 미들웨어 + 환경변수 점검 적용
- 부트스트랩은 ROADMAP에 명시되지 않은 작업이라 신규 ADR 후보 (D-011?)

### 옵션 B: 셸은 별도 작업으로 분리, P0를 명세화로 마무리
- 부트스트랩이 들어올 때 적용할 P0 사양·코드 스니펫을 `docs/SECURITY.md` 등으로 사전 정의
- 실제 코드는 셸이 만들어진 직후 적용
- 장점: 이번 세션은 가볍게 종료. 단점: P0 "실제로 막은" 상태 아님

### 옵션 C: ROADMAP을 재해석 — "공개 배포 직전에 적용한다"는 의미였다면
- 셸이 있을 때 적용할 정책만 결정하고 종료
- ROADMAP 메모에 적용 조건 명시

## welding-architect 사전 의견 (시뮬레이션)

옵션 A: **NEED_USER_DECISION** — 헌법(§7)이 부트스트랩 자체에 대해 침묵.
  - 정해진 ADR이 D-001~D-010이며 부트스트랩에 대한 결정은 없음
  - "이걸 결정해 ADR D-011로 등재할지"가 곧 NEED_USER_DECISION
  - 핵심 질문: 셸 생성 시 D-007(Supabase 영속) / D-005(timer_sec 내장) / D-006(핫픽스 분리)를 처음부터 강제하는 디렉토리 구조와 placeholder를 둘지

옵션 B: PASS 가능. 단 P0가 형식상 미완료 상태로 남음.

옵션 C: PASS. ROADMAP의 의도를 재확인하는 것이라 헌법 충돌 없음.
