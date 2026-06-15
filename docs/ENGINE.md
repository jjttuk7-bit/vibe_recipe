# ENGINE.md — 엔진(LLM) 사양

> 실제 시스템 프롬프트는 `lib/prompt.ts`. 이 문서는 계약과 불변 규칙을 정의한다.

---

## 1. 엔진의 역할

엔진은 "페어 쿠킹 파트너"다. 바이브 코딩의 페어 프로그래머처럼, 레시피를 한 번에 완성하지 않고 대화로 점진 빌드하며, 빌드 완료 후에는 패치/디버깅을 처리한다.

모델: 기본 `claude-haiku-4-5-20251001` (짧은 구조화 JSON, 빠른 응답). 복잡한 협의는 `VIBE_RECIPE_MODEL=claude-sonnet-4-6`.

---

## 2. 빌드 파이프라인 (한 턴 한 단계, D-003)

```
concept → base → taste → steps → done
```

- concept: 재료/제약 듣고 방향 2~3개 제안
- base: name, concept, ingredients, tools 확정
- taste: taste, texture 게이지 협의
- steps: steps(+timer_sec), time_min 컴파일 → done
- done: 패치 모드 (수정·디버깅)

예외: "알아서 다 해줘" → 남은 단계 일괄 완성 후 done.

---

## 3. 입출력 계약

### 입력 (서버 → 엔진)
- 최근 8턴 대화
- 현재 RecipeState (없으면 null)
- **해당 레시피의 RuntimeLog.known_issues** (회귀 방지 주입)
- **사용자 Fingerprint.traits** (부엌 보정 주입) — 용접 구조의 핵심

### 출력 (엔진 → 서버) — 순수 JSON만
```json
{
  "message": "대화 텍스트 (1~3문장)",
  "stage": "concept|base|taste|steps|done",
  "new_state": { "확정된 필드만" } 또는 null,
  "options": ["선택지 (각 15자 이내)"],
  "change_log": ["요리 관점 문장만"],
  "warnings": ["조리 원리상 위험/한계"]
}
```

---

## 4. 불변 규칙 (프롬프트에 박힌 것)

1. 한 턴에 한 단계만. 절대 한 번에 전체 레시피 생성 금지.
2. message는 1~3문장. steps 완료 시 축하 대신 핵심 팁 1개.
3. options 2~3개, 각 15자 이내. done에서는 수정/응용 제안.
4. "알아서/한번에" 요청 시 일괄 완성 → done.
5. new_state엔 확정된 필드만. 변경 없으면 null.
6. **패치 규율**: 이미 확정된 필드는 요청 없이 절대 변경 금지 (str_replace 정신).
7. 불가능한 요구(전자레인지로 바삭 등)는 warnings에 솔직히 적고 타협안 제시.
8. change_log는 요리 관점 문장만. "stage 변경", "필드 확정" 같은 내부 메타 금지.
9. **RuntimeLog 주입 시**: 알려진 실패를 먼저 언급하고 선제 보정. 예: "지난번 3번에서 태웠으니 중약불로 낮추고 30초 줄일게."
10. 모두 한국어, 간결하게.

---

## 5. 검증 & 자동 재시도 (D-004)

`app/api/recipe/route.ts`:
1. 엔진 호출 → 텍스트에서 JSON 추출 → Zod 검증
2. 실패 시: 에러 내용을 대화에 덧붙여 1회 재호출 (컴파일 에러 되던지기)
3. 2회 연속 실패 → 502, 사용자에게 "다시 시도" 노출

게이지 clamp(0~10), steps 최대 8개 등은 Zod transform에서 방어.

---

## 6. 타이머 출력 (D-005)

steps 단계에서 각 스텝은 반드시 `{ text, timer_sec }`로 출력한다. 시간 없는 스텝은 `timer_sec: 0`. 텍스트에 "3분"이라 쓰고 끝내면 안 된다 — Cook Mode가 파싱하지 않는다.

---

## 7. 취향 의존 판단 (D-009)

맛 분해 방식, 스텝 분할 기준, 핫픽스 우선순위 등은 `docs/TASTE.md`를 따른다. 프롬프트가 다루지 않는 새로운 판단이 필요하면 임의 결정하지 말 것 — 이 판단들이 해자다.
