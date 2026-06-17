import assert from "node:assert/strict";
import { rebuildRuntimeLog } from "@/lib/runtime";
import type { CookRun } from "@/lib/schema";

declare const test: (name: string, fn: () => void) => void;

const baseRun: Omit<CookRun, "id" | "step_events" | "outcome"> = {
  recipe_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  started_at: "2026-06-18T00:00:00.000Z",
  completed: true,
};

test("rebuildRuntimeLog condenses repeated failures and hotfixes by step", () => {
  const runs: CookRun[] = [
    {
      ...baseRun,
      id: "33333333-3333-4333-8333-333333333331",
      outcome: "failed",
      step_events: [
        {
          step_index: 1,
          type: "failed_here",
          note: "팬에서 탔음",
          timestamp: "2026-06-18T00:04:00.000Z",
        },
      ],
    },
    {
      ...baseRun,
      id: "33333333-3333-4333-8333-333333333332",
      outcome: "meh",
      step_events: [
        {
          step_index: 1,
          type: "hotfix",
          category: "burnt",
          note: "불을 낮춤",
          timestamp: "2026-06-18T00:05:00.000Z",
        },
      ],
    },
  ];

  const log = rebuildRuntimeLog(baseRun.recipe_id, runs);

  assert.equal(log.recipe_id, baseRun.recipe_id);
  assert.equal(log.total_runs, 2);
  assert.deepEqual(log.known_issues, [
    {
      step_index: 1,
      issue: "스텝 1에서 타는 문제가 반복됨",
      fix_applied: "불을 낮춤",
      resolved: false,
    },
  ]);
});

test("rebuildRuntimeLog marks an issue resolved when later successful run has no issue on that step", () => {
  const runs: CookRun[] = [
    {
      ...baseRun,
      id: "33333333-3333-4333-8333-333333333333",
      outcome: "failed",
      step_events: [
        {
          step_index: 2,
          type: "hotfix",
          category: "salty",
          note: "물을 추가",
          timestamp: "2026-06-18T00:04:00.000Z",
        },
      ],
    },
    {
      ...baseRun,
      id: "33333333-3333-4333-8333-333333333334",
      outcome: "good",
      step_events: [
        {
          step_index: 0,
          type: "done",
          timestamp: "2026-06-18T00:06:00.000Z",
        },
      ],
    },
  ];

  const log = rebuildRuntimeLog(baseRun.recipe_id, runs);

  assert.equal(log.known_issues[0]?.resolved, true);
});
