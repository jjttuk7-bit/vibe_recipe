import type { Fingerprint, RuntimeLog, Trait } from "@/lib/schema";

type TraitCandidate = {
  key: string;
  label: string;
  matches: (issue: string) => boolean;
};

const MIN_OBSERVATIONS = 3;
const MIN_RATIO = 0.6;

const CANDIDATES: TraitCandidate[] = [
  {
    key: "burnt_prone",
    label: "타는 문제가 반복되는 편",
    matches: (issue) => issue.includes("타는"),
  },
  {
    key: "salty_prone",
    label: "짠맛 보정이 자주 필요한 편",
    matches: (issue) => issue.includes("짠"),
  },
  {
    key: "bland_prone",
    label: "간이 약해지는 편",
    matches: (issue) => issue.includes("싱거운"),
  },
  {
    key: "watery_prone",
    label: "농도 보정이 자주 필요한 편",
    matches: (issue) => issue.includes("묽은"),
  },
];

export function recomputeFingerprint(
  userId: string,
  logs: readonly RuntimeLog[],
): Fingerprint {
  const totalRuns = logs.reduce((sum, log) => sum + log.total_runs, 0);

  return {
    user_id: userId,
    total_runs_all_recipes: totalRuns,
    traits: CANDIDATES.flatMap((candidate) =>
      buildTrait(candidate, logs, totalRuns),
    ),
  };
}

function buildTrait(
  candidate: TraitCandidate,
  logs: readonly RuntimeLog[],
  totalRuns: number,
): Trait[] {
  if (totalRuns === 0) return [];

  let observations = 0;
  const evidence = new Set<string>();

  for (const log of logs) {
    for (const issue of log.known_issues) {
      if (!candidate.matches(issue.issue)) continue;
      observations += 1;
      evidence.add(log.recipe_id);
    }
  }

  const confidence = roundConfidence(observations / totalRuns);
  if (observations < MIN_OBSERVATIONS || confidence < MIN_RATIO) return [];

  return [
    {
      key: candidate.key,
      label: candidate.label,
      confidence,
      evidence_run_ids: Array.from(evidence),
    },
  ];
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
