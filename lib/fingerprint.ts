// 사람별 부엌 지문 (DATA_MODEL.md §4, D-007 해자).
//
// 용접 의존성 (D-008):
//
//   RuntimeLog[]  ──cross-recipe analysis──>  Fingerprint.traits
//      (여러 레시피)                              (사람 단위 패턴)
//
// 예시 패턴 (TASTE.md 참조 — 임의 결정 금지, D-009):
//   - 볶음류 다수에서 강불 스텝에 failed_here 가 몰림 → "heat_power: 강함"
//   - 단맛을 매번 -2 씩 패치 → "sweet_aversion"
//
// 본 파일은 placeholder. 시그니처 가이드 (P1):
//
//   recomputeFingerprint(userId: string, logs: RuntimeLog[]): Fingerprint
//
// 호출자 (app/api/run/route.ts) 가 RuntimeLog 갱신 직후 호출. 호출 누락은
// §4 용접 깨짐 = BUILD 가 cold start 로만 동작하는 회귀.

export {};
