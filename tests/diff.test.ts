import assert from "node:assert/strict";
import { splitDiff } from "@/lib/diff";
import type { RecipeState } from "@/lib/schema";

declare const test: (name: string, fn: () => void) => void;

test("splitDiff treats every field as created when previous state is null", () => {
  const next: RecipeState = {
    name: "김치볶음밥",
    time_min: 12,
  };

  assert.deepEqual(splitDiff(null, next), {
    created: [
      { field: "name", value: "김치볶음밥" },
      { field: "time_min", value: 12 },
    ],
    modified: [],
  });
});

test("splitDiff separates new fields from modified existing fields", () => {
  const prev: RecipeState = {
    name: "김치볶음밥",
    time_min: 12,
  };
  const next: RecipeState = {
    name: "김치볶음밥",
    time_min: 10,
    tools: ["팬"],
  };

  assert.deepEqual(splitDiff(prev, next), {
    created: [{ field: "tools", value: ["팬"] }],
    modified: [{ field: "time_min", before: 12, after: 10 }],
  });
});
