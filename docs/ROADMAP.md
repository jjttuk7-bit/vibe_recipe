# ROADMAP.md — 로드맵

> 우선순위: P0(블로커) > P1(MVP 핵심) > P2(MVP 강화) > P3(Phase 2)
> 각 항목은 완료 시 SESSION.md와 MAP.md에 반영한다.

---

## P0 — 출시 블로커 (이게 없으면 공개 불가)

- [x] `/api/*` rate limit (IP 기반, `@upstash/ratelimit` 권장). API 키 비용 보호. **공개 URL 배포 전 필수.** (완료 2026-06-14, ADR D-011 셸 부트스트랩 동반)
- [x] 환경변수 점검: `ANTHROPIC_API_KEY` 서버 격리 확인. 클라이언트 번들에 키 노출 없는지. (완료 2026-06-14, `lib/env.ts` + `import "server-only"`)

## P1 — MVP 핵심 (용접 루프 완성)

- [x] `lib/schema.ts`: steps를 `{text, timer_sec}[]`로 (D-005). CookRun/RuntimeLog/Fingerprint 스키마 추가.
- [ ] `lib/prompt.ts`: RuntimeLog.known_issues + Fingerprint.traits 주입 로직 (ENGINE.md §3, 규칙9).
- [x] `components/CookMode.tsx`: 스텝 진행 + `timer_sec` 타이머 + Wake Lock + 인라인 핫픽스(D-006).
- [x] `components/Postmortem.tsx`: 3단 평가 + 실패 스텝 핀포인트.
- [x] `app/api/run/route.ts`: CookRun 저장 → RuntimeLog 갱신 → Fingerprint 재계산. **용접 강제 지점**(D-008).
- [x] `lib/runtime.ts` + `lib/fingerprint.ts`: 집계/교차분석 로직.
- [x] `lib/supabase.ts` + 테이블 5종 + RLS (DATA_MODEL.md §6).
- [ ] `components/FingerprintCard.tsx`: 부엌 지문 프로필 노출 (전환 비용).

## P2 — MVP 강화

- [ ] 모드 자동 판단 (입력 구체성 기반, D-003a): 모호→대화빌드, 명확→즉시빌드.
- [ ] 버전 타임라인 UI 복원 (v1에 있던 체크아웃/롤백). `recipe_versions` 활용.
- [ ] 빌드 완료 → Cook 진입 → Postmortem 완료율 측정(성공지표).
- [ ] Rule Engine 분리: 조리 원리(도구-식감 호환 등)를 LLM에서 코드로 일부 이전.

## P3 — Phase 2 (해자 확장)

- [ ] 집단 부엌 지성: n명의 같은-스텝 실패 → 레시피 자가 진화 제안 (네트워크 효과). 사용자 임계점 이후.
- [ ] 음성 진행: Web Speech API ("다음" / "너무 짜").
- [ ] 멀티 타이머 동시 진행.
- [ ] 레시피/Fingerprint 커뮤니티 공유 (익명 집계).

---

## 주의 — 매 작업 전 자문 (D-008 용접 테스트)

새 기능을 만들기 전에: **"이 기능을 떼어내도 다른 단계가 여전히 완전한가?"**
- 답이 "예" → 용접이 안 된 것. 다시 설계.
- 답이 "아니오" → 좋다. 의존성이 해자다.
