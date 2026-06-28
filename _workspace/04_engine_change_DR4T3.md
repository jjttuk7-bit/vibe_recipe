# DR4.T3 엔진 보고서 — 2단계 스트리밍

## 변경
- `lib/prompt.ts` `renderOutputContract()`: 출력 명세를 **2단계 형식**으로 — (1)평문 대화 메시지 → (2)`===STATE_JSON===` 단독 줄 → (3)message 제외 5개 키 구조 JSON. 형식 규율 절 추가. 불변 규칙 #2 문구 "JSON 앞 평문" 반영.
- `lib/schema.ts`: `EngineStructuredSchema = EngineResponseSchema.omit({ message:true })` + 타입 추가 (additive, 기존 EngineResponse 무변).
- `app/api/recipe/route.ts`: `[5]` 비스트리밍 호출/재시도 → **SSE 스트리밍**으로 교체.
  - `streamAnthropicText()` async generator (`stream:true`, text_delta yield)
  - `runStreamingAttempt()`: 평문은 emitDelta 실시간(구분자 길이만큼 꼬리 보류), 구분자 뒤 구조 JSON 완결 수신
  - `assembleEngineResponse()`: 구조 JSON → EngineStructuredSchema safeParse → message 합쳐 EngineResponseSchema 재검증
  - `retryUserMessage()`: D-004 1회 재시도, 2단계 형식 명시
  - SSE 프레임 `data:{json}\n\n`, 이벤트 delta/reset/done/error
  - 제거: callAnthropic / tryParseEngineResponse / callEngineWithRetry / EngineValidationError

## 헌법 정합
- **D-001 보존**: new_state 는 구분자 뒤 구조 JSON 에 통째로 담겨 **완결 수신 후 1건으로 safeParse** → 그 다음에야 클라가 splitDiff. 반쪽 상태 렌더 없음.
- **D-002 보존**: diff 는 여전히 클라 코드(splitDiff)가 계산. 스트리밍은 message 평문에만 적용.
- **D-004 보존**: runStreamingAttempt 정확히 2회(1차+재시도) 한도. 3회째 금지.
- **§4 무영향**: [4] fetchBuildContext / cold_start 주입 / context_used 모두 유지.

## 잔존 위험
- R-DR4-3: 검증 실패 재시도 시 reset 후 평문 재스트리밍 — LLM 2회 호출(기존과 동일 비용 한도).
- R-DR4-4: 모델이 평문 안에 "===STATE_JSON===" 리터럴을 쓰면 조기 분할 — 모델 통제 영역, 저위험.
