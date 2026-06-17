import assert from "node:assert/strict";
import { recomputeFingerprint } from "@/lib/fingerprint";
import type { RuntimeLog } from "@/lib/schema";

declare const test: (name: string, fn: () => void) => void;

test("recomputeFingerprint creates a trait when a pattern has at least 3 observations and 0.6 ratio", () => {
  const userId = "22222222-2222-4222-8222-222222222222";
  const logs: RuntimeLog[] = [
    {
      recipe_id: "11111111-1111-4111-8111-111111111111",
      total_runs: 3,
      known_issues: [
        {
          step_index: 1,
          issue: "스텝 1에서 타는 문제가 반복됨",
          resolved: false,
        },
        {
          step_index: 2,
          issue: "스텝 2에서 타는 문제가 반복됨",
          resolved: false,
        },
      ],
    },
    {
      recipe_id: "11111111-1111-4111-8111-111111111112",
      total_runs: 2,
      known_issues: [
        {
          step_index: 0,
          issue: "스텝 0에서 타는 문제가 반복됨",
          resolved: false,
        },
      ],
    },
  ];

  const fingerprint = recomputeFingerprint(userId, logs);

  assert.equal(fingerprint.user_id, userId);
  assert.equal(fingerprint.total_runs_all_recipes, 5);
  assert.deepEqual(fingerprint.traits, [
    {
      key: "burnt_prone",
      label: "타는 문제가 반복되는 편",
      confidence: 0.6,
      evidence_run_ids: [
        "11111111-1111-4111-8111-111111111111",
        "11111111-1111-4111-8111-111111111112",
      ],
    },
  ]);
});

test("recomputeFingerprint does not create a trait below the observation gate", () => {
  const fingerprint = recomputeFingerprint("22222222-2222-4222-8222-222222222222", [
    {
      recipe_id: "11111111-1111-4111-8111-111111111111",
      total_runs: 2,
      known_issues: [
        {
          step_index: 1,
          issue: "스텝 1에서 타는 문제가 반복됨",
          resolved: false,
        },
      ],
    },
  ]);

  assert.deepEqual(fingerprint.traits, []);
});
