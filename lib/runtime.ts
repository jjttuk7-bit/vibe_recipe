import type {
  CookRun,
  HotfixCategory,
  KnownIssue,
  RuntimeLog,
  StepEvent,
} from "@/lib/schema";

type IssueBucket = {
  stepIndex: number;
  category: HotfixCategory | "failed";
  fixApplied?: string;
  lastIssueRunIndex: number;
};

export function rebuildRuntimeLog(
  recipeId: string,
  runs: readonly CookRun[],
): RuntimeLog {
  const buckets = new Map<number, IssueBucket>();

  runs.forEach((run, runIndex) => {
    for (const event of run.step_events) {
      switch (event.type) {
        case "done":
        case "timer_done":
          break;
        case "failed_here":
          upsertIssueBucket(buckets, event, "failed", runIndex);
          break;
        case "hotfix":
          upsertIssueBucket(buckets, event, event.category, runIndex);
          break;
        default: {
          const _exhaustive: never = event;
          void _exhaustive;
        }
      }
    }
  });

  return {
    recipe_id: recipeId,
    total_runs: runs.length,
    known_issues: Array.from(buckets.values())
      .sort((a, b) => a.stepIndex - b.stepIndex)
      .map((bucket) => toKnownIssue(bucket, runs)),
  };
}

function upsertIssueBucket(
  buckets: Map<number, IssueBucket>,
  event: Extract<StepEvent, { type: "failed_here" | "hotfix" }>,
  category: IssueBucket["category"],
  runIndex: number,
): void {
  const previous = buckets.get(event.step_index);
  buckets.set(event.step_index, {
    stepIndex: event.step_index,
    category,
    fixApplied: event.note ?? previous?.fixApplied,
    lastIssueRunIndex: runIndex,
  });
}

function toKnownIssue(bucket: IssueBucket, runs: readonly CookRun[]): KnownIssue {
  return {
    step_index: bucket.stepIndex,
    issue: renderIssue(bucket.stepIndex, bucket.category),
    fix_applied: bucket.fixApplied,
    resolved: isResolvedAfter(bucket, runs),
  };
}

function isResolvedAfter(bucket: IssueBucket, runs: readonly CookRun[]): boolean {
  return runs.slice(bucket.lastIssueRunIndex + 1).some((run) => {
    if (run.outcome !== "good") return false;
    return !run.step_events.some(
      (event) =>
        event.step_index === bucket.stepIndex &&
        (event.type === "failed_here" || event.type === "hotfix"),
    );
  });
}

function renderIssue(
  stepIndex: number,
  category: IssueBucket["category"],
): string {
  switch (category) {
    case "salty":
      return `스텝 ${stepIndex}에서 짠 문제가 반복됨`;
    case "bland":
      return `스텝 ${stepIndex}에서 싱거운 문제가 반복됨`;
    case "burnt":
      return `스텝 ${stepIndex}에서 타는 문제가 반복됨`;
    case "watery":
      return `스텝 ${stepIndex}에서 묽은 문제가 반복됨`;
    case "other":
      return `스텝 ${stepIndex}에서 핫픽스가 필요한 문제가 반복됨`;
    case "failed":
      return `스텝 ${stepIndex}에서 실패가 반복됨`;
    default: {
      const _exhaustive: never = category;
      void _exhaustive;
      return `스텝 ${stepIndex}에서 문제가 반복됨`;
    }
  }
}
