# 바이브 레시피 — 문서 세트

Claude Code로 이 프로젝트를 빌드하기 위한 전체 문서다. 코드를 통제하는 제약 장치이자, 우리가 합의한 모든 설계 결정의 단일 출처.

## 읽는 순서

1. **`CLAUDE.md`** — 최상위 헌법. Claude Code가 매 세션 가장 먼저 읽는다. 철학, 메타포 매핑, 용접 구조, 작업 규약.
2. **`docs/DECISIONS.md`** — 왜 이렇게 설계했는가 (ADR 10개, D-001 ~ D-010).
3. **`docs/PRD.md`** — 무엇을 만드는가.
4. **`docs/DATA_MODEL.md`** — 데이터 구조와 용접 의존성.
5. **`docs/ENGINE.md`** — LLM 엔진 사양 (입출력 계약, 불변 규칙).
6. **`docs/TASTE.md`** — 명세서로 못 옮기는 도메인 판단 (해자).
7. **`docs/MAP.md`** — 코드베이스 지도.
8. **`docs/SESSION.md`** — 세션 로그 (지금까지 / 다음).
9. **`docs/ROADMAP.md`** — 우선순위 작업 목록.

## Claude Code 시작하기

이 문서들을 코드 저장소 루트에 둔 뒤:

```bash
# Claude Code 실행 후 첫 지시 예시
> CLAUDE.md와 docs/ 전체를 읽고, ROADMAP.md의 P1 첫 항목
> (schema에 timer_sec + CookRun/RuntimeLog/Fingerprint 추가)부터 시작해줘.
```

Claude Code는 CLAUDE.md §8 작업 규약에 따라:
- 세션 시작 시 CLAUDE.md → SESSION.md → DECISIONS.md를 읽고
- 설계 결정은 DECISIONS.md에 ADR로 남기고
- 세션 종료 시 SESSION.md를 갱신하고
- 새 파일은 MAP.md에 등록하고
- 철학/용접 구조와 충돌하는 요청은 구현 전 확인을 받는다.

## 두 개의 핵심을 잊지 말 것

1. **용접 구조(D-008)**: 모든 기능은 하나로 용접된 루프의 일부다. "떼어내도 완전한 기능"은 용접 실패다.
2. **취향(D-009)**: TASTE.md에 없는 도메인 판단은 임의로 내리지 말고 묻는다.

> 복제 불가능성의 한 줄: **"베끼려면 전부를 베껴야 하는데, 전부를 베끼려면 유케이의 감각을 가져야 한다."**
