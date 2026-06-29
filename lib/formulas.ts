// lib/formulas.ts — L2 지식 팩 (교체 가능). 첫 팩 = K-Food Formula.
//
// VISION.md 층위 아키텍처 + CLAUDE.md §1.5 가드레일:
//   "책은 팩이지 플랫폼이 아니다." 코어(L1: schema/엔진)는 요리권 무관.
//   이 파일은 *데이터 모듈*이다 — 이탈리안/일식/베이킹 팩으로 교체·추가 가능.
//   prompt.ts 는 activePack 을 받아 시스템 프롬프트에 주입한다.
//
// 데이터 출처: 유케이 『K-Food Formula Kitchen』(12 공식). 본 v1 은 책에서
// *실제로 확인된* 부분만 담는다. 미확인 공식의 정확 비율은 비워 두고(지어내지 않음),
// 셰프는 재료-맛 역할 맵 + 공식 논리로 합리적으로 보정한다.

import type { Ingredient } from "@/lib/schema";

/**
 * 공식 실전 비율 — **출처·검증 플래그 필수**.
 *
 * 검증 구조(사용자 요구): 비율은 해자다. LLM 기억/추측에 맡기지 않는다.
 *   - source: 어디서 왔나 (책 공식 번호 등).
 *   - verified: *저자(유케이) 확인 완료* 만 true. 자동 추출만 된 건 false.
 * 셰프는 verified=true 만 "공식 비율"로 단정한다. false 는 "추정"으로만.
 */
export type FormulaRatio = {
  name: string;
  ratio: string;
  /** 이 공식으로 만들 수 있는 음식 (검증된 목록 — 메뉴 제안의 기준, 지어내기 금지). */
  dishes?: string[];
  tip?: string;
  source: string;
  verified: boolean;
};

export type KnowledgePack = {
  id: string;
  title: string;
  /** 한 줄 철학 — 셰프 행동의 북극성. */
  doctrine: string;
  /** 재료 → 맛 역할. 조절("더 매콤")의 근거가 된다. */
  ingredientRoles: { ingredient: string; role: string }[];
  /** 조리 동작 어휘. */
  moves: string[];
  /** 공식 카테고리 (KR/EN). */
  formulas: { ko: string; en: string }[];
  /** 계량 기준. */
  measuring: string[];
  /** 공식 실전 비율 (출처·검증 동반). 지어내지 않는다. */
  ratios: FormulaRatio[];
};

export const KFOOD_PACK: KnowledgePack = {
  id: "kfood",
  title: "K-Food Formula",
  doctrine:
    "공식이 기준(기본)을 만들고, 사용자가 입맛으로 완성한다. 기본은 셰프가 먼저 깔고, 추가·조절만 사용자에게 묻는다.",
  ingredientRoles: [
    { ingredient: "간장", role: "짠맛·감칠맛" },
    { ingredient: "고추장", role: "매운맛·단맛" },
    { ingredient: "고춧가루", role: "매운맛(칼칼함)" },
    { ingredient: "된장", role: "구수함·깊은맛" },
    { ingredient: "식초", role: "새콤함(맛을 밝게)" },
    { ingredient: "설탕", role: "단맛(균형)" },
    { ingredient: "참기름·참깨", role: "고소함(마무리 향)" },
    { ingredient: "마늘·대파", role: "향(베이스)" },
  ],
  moves: [
    "무침(toss)",
    "볶음(stir-fry)",
    "조림(simmer)",
    "국/찌개(soup·stew)",
    "구이(grill)",
    "전(pan-fry)",
  ],
  formulas: [
    { ko: "간장양념", en: "Soy Seasoning" },
    { ko: "고추장양념", en: "Gochujang" },
    { ko: "나물무침", en: "Namul" },
    { ko: "간장조림", en: "Soy Simmer" },
    { ko: "매운조림", en: "Spicy Simmer" },
    { ko: "된장국", en: "Doenjang Soup" },
    { ko: "김치찌개", en: "Kimchi Stew" },
    { ko: "비빔양념", en: "Bibim Sauce" },
    { ko: "불고기양념", en: "Korean Marinade" },
    { ko: "전 반죽", en: "Jeon Batter" },
    { ko: "빠른 피클", en: "Quick Pickle" },
    { ko: "마무리", en: "Finishing Touch" },
  ],
  measuring: ["1큰술(T) = 15ml", "1작은술(t) = 5ml", "종이컵 = 180ml"],
  ratios: [
    {
      name: "고추장 양념(무침)",
      ratio: "고추장 2T : 설탕 1T : 다진마늘 1t : 식초 1T : 참기름 1T : 깨 1t",
      dishes: ["오이무침", "비빔국수", "비빔밥", "상추무침", "매운두부무침"],
      tip: "아삭하게: 오이 살짝 절여 5분 → 물기 닦고 무치기. (매콤·달콤·새콤·고소)",
      source: "K-Food Formula Kitchen 공식 02 (이미지 자동 추출)",
      verified: false, // 이터레이션 1 — 유케이 확인 대기.
    },
    {
      name: "김치찌개",
      ratio: "김치 1컵 : 김치국물 ½컵 : 다진마늘 1t : 설탕 1t : 물 2컵",
      dishes: ["김치찌개", "참치김치찌개", "돼지고기김치찌개", "김치국", "김치두부찌개"],
      tip: "너무 시면 설탕 조금 더 + 오래 끓이기.",
      source: "K-Food Formula Kitchen 공식 07 (이미지 자동 추출)",
      verified: false, // 저자(유케이) 확인 전 — 검증 파이프라인 통과 시 true.
    },
  ],
};

// 현재 활성 팩 (교체 지점). 다른 요리권 팩을 만들면 여기서 바꾼다.
export const ACTIVE_PACK: KnowledgePack = KFOOD_PACK;

// ───────────────────────────────────────────────────────────────────────────
// 결정적 role 추론 (LLM 누락 보완) — 양념/향신 이름은 코드가 seasoning 으로.
// eval 에서 role 이 모델 무관하게 0/3 으로 안 잡혀 도입(서버가 보장).
// L2 팩 지식(요리권별 양념 목록) → 코어(route)는 이 함수를 호출만.
// ───────────────────────────────────────────────────────────────────────────
const SEASONING_KEYWORDS = [
  "간장",
  "고추장",
  "고춧가루",
  "된장",
  "쌈장",
  "식초",
  "설탕",
  "소금",
  "후추",
  "참기름",
  "들기름",
  "고추기름",
  "참깨",
  "깨소금",
  "마늘",
  "대파",
  "쪽파",
  "생강",
  "굴소스",
  "액젓",
  "물엿",
  "올리고당",
  "미림",
  "맛술",
];

export function enrichIngredientRoles(
  ingredients: Ingredient[],
): Ingredient[] {
  return ingredients.map((ing) => {
    if (ing.role) return ing;
    const isSeasoning = SEASONING_KEYWORDS.some((k) => ing.name.includes(k));
    return isSeasoning ? { ...ing, role: "seasoning" as const } : ing;
  });
}

// 시스템 프롬프트에 주입할 한식 지식 섹션 문자열.
// 검증 구조: 비율을 verified / 미검증으로 갈라 셰프에게 다르게 쓰게 한다.
export function renderKnowledgePack(pack: KnowledgePack): string {
  const roles = pack.ingredientRoles
    .map((r) => `${r.ingredient}=${r.role}`)
    .join(" / ");
  const cats = pack.formulas.map((f) => f.ko).join("·");
  const fmt = (r: FormulaRatio): string => {
    const dishes =
      r.dishes && r.dishes.length > 0
        ? ` · 만들 수 있는 음식: ${r.dishes.join("/")}`
        : "";
    return `- ${r.name}: ${r.ratio}${dishes}${r.tip ? `\n  팁: ${r.tip}` : ""}`;
  };
  const verified = pack.ratios.filter((r) => r.verified);
  const unverified = pack.ratios.filter((r) => !r.verified);

  const lines = [
    `## 지식 팩 — ${pack.title}`,
    pack.doctrine,
    "",
    "### 재료-맛 역할 (조절의 근거)",
    roles,
    "→ \"더 매콤\"=고추장·고춧가루↑ / \"더 깊게\"=된장·간장↑ / \"느끼함↓\"=식초 약간 / \"싱거움\"=간장(짠맛만 말고 감칠맛도 같이).",
    "",
    `### 조리 동작\n${pack.moves.join(" · ")}`,
    `### 12 공식 카테고리\n${cats}`,
    `### 계량\n${pack.measuring.join(" / ")}`,
  ];
  if (verified.length > 0) {
    lines.push(
      "### 검증된 실전 비율 (저자 확인 — '공식'으로 단정 가능)",
      verified.map(fmt).join("\n"),
    );
  }
  if (unverified.length > 0) {
    lines.push(
      "### 미검증 비율 (저자 확인 전 — '내 추정'으로만, '공식'이라 단정 금지)",
      unverified.map(fmt).join("\n"),
    );
  }
  lines.push(
    "",
    "규율(검증 구조):",
    "- **메뉴 제안은 위 '만들 수 있는 음식' 목록에서만** 한다. 목록에 없는 메뉴(예: 실제로 잘 안 만드는 '오이전')를 지어내지 마라.",
    "- **공식을 적용하면 그 공식의 전체 양념 구성을 기본(new_state)에 자동 포함**한다 (예: 고추장 무침 → 고추장·설탕·마늘·식초·참기름·깨 전부). 공식 양념을 '골라 추가'하라고 묻지 마라 — 이미 기본이다. 물을 땐 \"공식대로 양념 다 잡았어, 특별히 더할 거 없으면 이대로 가자\"처럼 안내하고, options 는 공식 *밖*의 진짜 선택지(예: 오이무침에 양파·당근)이거나 비운다. 초보가 막막하지 않게.",
    "- 공식에 없는 양념을 임의로 더하지 마라 — 예: 고추장 무침에 **간장 금지.** 사용자 명시 요청 시만.",
    "- 맛·방향 제안은 재료-맛 역할에 근거해 **구체적으로 풀어준다** — 얇은 이분법 대신 도움 되는 내용을. 예: \"매콤하게는 고추장·고춧가루로, 감칠맛 깊게는 간장·굴소스로, 단짠은 설탕 약간 더하면 돼. 어디로?\" (단 chip 라벨을 '옵션으로 ~제안' 식 메타로 나열하진 마라 — 내용으로 채운다.)",
    "- **검증된 비율만 '공식 비율'로 단정**, 미검증은 공식 논리로 추론하되 정확 비율은 확정 전임을 밝힌다. 비율·재료를 지어내지 마라.",
  );
  return lines.join("\n");
}
