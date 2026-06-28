// 데모 로컬 학습 — localStorage 기반 "부엌 지문".
//
// 헌법 주의: CLAUDE.md §6 은 localStorage 금지(영속은 Supabase)다. 본 모듈은
// **데모 모드의 가벼운 학습 루프**로, 로그인+DB 전환 시 서버 영속(lib/fingerprint.ts,
// /api/fingerprint)으로 승격할 자리표시자다. 운영체제의 ③ 기억/학습 계층을
// 로그인 없이 체험하게 하는 목적.
//
// 루프: 빌드 완료 → 사용자 피드백(짰다/느끼했다…) → 같은 불만 누적 → 확정 trait
//        → 다음 빌드 프롬프트에 주입(선제 보정).

const KEY = "viberecipe.fingerprint.v1";
// 같은 불만이 이 횟수 이상이면 "확정 trait" 으로 승격 → 프롬프트 주입.
const TRAIT_THRESHOLD = 2;

export type FeedbackKind =
  | "good"
  | "salty"
  | "bland"
  | "greasy"
  | "burnt"
  | "spicy";

// 칩 라벨 (사용자에게 보이는 피드백 버튼).
export const FEEDBACK_LABELS: Record<FeedbackKind, string> = {
  good: "좋았어요",
  salty: "짰어요",
  bland: "싱거웠어요",
  greasy: "느끼했어요",
  burnt: "탔어요",
  spicy: "매웠어요",
};

// 불만 → 다음 빌드에 주입할 trait 문구. "good" 은 trait 없음(긍정).
const FEEDBACK_TRAIT: Partial<Record<FeedbackKind, string>> = {
  salty: "간을 덜 짜게",
  bland: "간을 조금 더 강하게",
  greasy: "덜 기름지게 (느끼함 줄이기)",
  burnt: "불은 약하게, 시간은 짧게",
  spicy: "덜 맵게",
};

export type LocalFingerprint = {
  counts: Partial<Record<FeedbackKind, number>>;
  totalMeals: number;
  updatedAt: string;
};

function empty(): LocalFingerprint {
  return { counts: {}, totalMeals: 0, updatedAt: "" };
}

export function loadFingerprint(): LocalFingerprint {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<LocalFingerprint>;
    return {
      counts: parsed.counts ?? {},
      totalMeals: parsed.totalMeals ?? 0,
      updatedAt: parsed.updatedAt ?? "",
    };
  } catch {
    return empty();
  }
}

function save(fp: LocalFingerprint): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(fp));
  } catch {
    // 사적 모드/용량 초과 등 — 학습은 베스트에포트.
  }
}

export function recordFeedback(kind: FeedbackKind): LocalFingerprint {
  const fp = loadFingerprint();
  fp.counts[kind] = (fp.counts[kind] ?? 0) + 1;
  fp.totalMeals += 1;
  fp.updatedAt = new Date().toISOString();
  save(fp);
  return fp;
}

export function resetFingerprint(): LocalFingerprint {
  const fp = empty();
  save(fp);
  return fp;
}

// 확정 trait 문구 (불만 누적 ≥ TRAIT_THRESHOLD). 다음 빌드 요청의 client_traits.
export function traitLabels(fp: LocalFingerprint): string[] {
  const out: string[] = [];
  for (const kind of Object.keys(FEEDBACK_TRAIT) as FeedbackKind[]) {
    const phrase = FEEDBACK_TRAIT[kind];
    if (phrase && (fp.counts[kind] ?? 0) >= TRAIT_THRESHOLD) out.push(phrase);
  }
  return out;
}
