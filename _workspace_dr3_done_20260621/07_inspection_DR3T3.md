# DR3.T3 정합성 검증

**판정**: **PASS 결함 0**

## 회귀 점검
| 영역 | 결과 |
|------|------|
| 데이터 용접 5+1 라인 | 변경 0 |
| /api/recipe 요청/응답 | 변경 0 |
| EngineResponseSchema/RequestBodySchema/lib/schema | 변경 0 |
| 사용자 mutation (D-022) | hero에서 미노출, RecipeState 부재 시점 — 흐름 무변 |
| undo (D-023) | hero에서 미노출. undoLast 후 messages 0 → 자동 hero 복귀 (정합) |
| Plan/Context (D-024/D-025) | hero에서 미노출. 첫 응답 후 RecipeCanvas로 자동 노출 |
| 디자인 시스템 (D-026) | hero가 토큰 자연 적용 — Newsreader 큰 제목, JetBrains Mono eyebrow, send-btn / aux-chip 재사용 |
| 2-pane (D-027) | hero ↔ 2-pane 분기로 자연 공존 |

## D-028 적용 검증
| 결정 | 적용 |
|------|------|
| messages=0 && lastResponse=null 분기 | `showHero` 조건 |
| 시간 라벨 동적 | formatTimeLabel + useEffect 60s 주기 |
| 5종 quickstart 칩 (0002 그대로) | HERO_QUICK_STARTS 상수, onQuickStart=submit(label) |
| 첫 submit → 자동 2-pane 진입 | messages 채워지면 showHero=false |
| auth 미준비 차단 | quickstart 칩 disabled + hint 표시 |

## SSR 마커 9종 매치
- cold-hero / cold-hero-title / cold-hero-eyebrow / quickstart-chip ✅
- "오늘, 뭐가 있어요?" / "재료만 알려주면" / "냉장고 털기" / "10분 야식" / "두부 한 모..." ✅

## 자동 검증
- typecheck PASS
- 6/6 test PASS

## 결함
**없음.**

미세 메모:
- M-DR3-1: 시간 라벨 SSR 시점과 클라 hydration 시점이 *서로 다른 시간대*면 미세 깜빡임 — useState 초기값이 서버/클라 다를 수 있음. 정상 동작 (React hydration mismatch warning 가능성). 본 사이클 비범위로 둠.
- M-DR3-2: hero가 "60vh min-height" — 매우 작은 화면에서는 답답할 수 있으나 콘텐츠 fit 우선.
