# DR4.T6 정합성 검증 (welding-inspector)

**판정**: **PASS 결함 0**

## 용접 트레이스 (D-029 데이터 흐름)
LLM 스트림 → [route] 평문/구조 분리 → 구조 JSON `EngineStructuredSchema.safeParse` → message 합쳐 `EngineResponseSchema.safeParse` → `done` 이벤트 → [client] `consumeRecipeStream` → engineResponse → `splitDiff(prev, new_state)`(클라 코드) → onRecipeStateChange.

| 점검 | 결과 |
|------|------|
| D-001 (new_state 검증 후 diff) | new_state 는 구분자 뒤 구조 JSON 에 통째 → 완결 수신 후 1건 safeParse → 그 후 splitDiff. **반쪽 상태 렌더 0** ✅ |
| D-002 (생성=카드/수정=diff, 코드 계산) | splitDiff 클라 유지, 스트리밍은 message 평문에만 ✅ |
| D-003 (한 턴 한 단계) | prompt 파이프라인 절 무변 ✅ |
| D-004 (1회 재시도) | runStreamingAttempt 최대 2회. reset 후 재스트리밍, 2회 실패→error ✅ |
| §4 용접 (BUILD 무손상) | [4] fetchBuildContext/cold_start/context_used 유지. Cook/Postmortem/Fingerprint 경로 무변 ✅ |

## 경계면 비교
| 경계 | 결과 |
|------|------|
| A: prompt 출력명세 ↔ EngineStructuredSchema | 평문 + 5키 JSON ↔ omit(message) 5키 = 1:1 ✅ |
| 엔진 StreamEvent ↔ 클라 StreamClientEvent | delta/reset/done/error 4종 1:1 ✅ |
| done 페이로드 ↔ RecipeSuccessPayload | {engineResponse, parsedAt, context_used} ↔ isRecipeSuccessPayload 통과 ✅ |

## 회귀
- 비스트리밍 헬퍼 잔존 참조 0 (grep PASS). EngineResponse contract 외형 무변(소비측 6키 그대로).
- typecheck PASS / 6/6 test PASS.

## 결함
**없음.**

미세 메모/위험: R-DR4-1(cold-hero 첫 응답 미노출), R-DR4-3(재시도 2회 호출), R-DR4-4(평문 내 구분자 리터럴), M-DR4-1(평문 trailing 개행) — 모두 비범위 또는 의도된 동작.
