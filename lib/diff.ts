import type { RecipeState } from "@/lib/schema";

export type CreatedDiff = {
  field: keyof RecipeState;
  value: unknown;
};

export type ModifiedDiff = {
  field: keyof RecipeState;
  before: unknown;
  after: unknown;
};

export type SplitDiff = {
  created: CreatedDiff[];
  modified: ModifiedDiff[];
};

export function splitDiff(
  prevState: RecipeState | null,
  newState: RecipeState,
): SplitDiff {
  const created: CreatedDiff[] = [];
  const modified: ModifiedDiff[] = [];

  for (const [field, value] of Object.entries(newState) as Array<
    [keyof RecipeState, unknown]
  >) {
    if (value === undefined) continue;
    if (prevState === null || prevState[field] === undefined) {
      created.push({ field, value });
      continue;
    }

    const before = prevState[field];
    if (!jsonEqual(before, value)) {
      modified.push({ field, before, after: value });
    }
  }

  return { created, modified };
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
