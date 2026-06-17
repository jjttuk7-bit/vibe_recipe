# Kitchen IDE Redesign Design

**Goal:** Make Vibe Recipe feel like a pair-cooking IDE: recipes are built, run in the kitchen, debugged through postmortem, and fed back into the next build.

**Approved Direction:** 부엌 IDE. Warm kitchen surface plus IDE instrumentation, not a generic recipe app dashboard.

---

## Product Read

Vibe Recipe is not a recipe reader. It is a runtime loop:

```text
BUILD -> COOK -> POSTMORTEM -> RuntimeLog/Fingerprint -> next BUILD
```

The UI must show this loop immediately. The current implementation is functional, but reads like a form-based dashboard. The redesign should make the core metaphor visible without adding new backend behavior.

## Visual Language

- **Tone:** warm technical. A kitchen counter with instrumentation, not a dark code editor.
- **Composition:** left pipeline rail, central workbench, right runtime/log panel.
- **Color:** ink black for structure, warm paper/counter surfaces, green for running/compiled states, orange for heat/runtime events, red for failure.
- **Typography:** strong editorial display for the product name, compact UI text for labels and state.
- **UI shape:** restrained panels and rails. Avoid decorative card piles. Use status chips, log rows, diff rows, terminal-like prompt areas, and run-state bands.

## Screen Model

### App Shell

The first viewport should communicate the loop. The header becomes a command/workbench header:

- Brand: `바이브 레시피`
- Subtitle: `Pair-cooking IDE`
- Status cluster: auth state, recipe id, stage, current mode.
- Pipeline rail: `BUILD`, `COOK`, `POSTMORTEM`, `LEARN`.

The shell should not explain features in prose. It should use state labels and spatial hierarchy.

### BUILD

BUILD becomes the compile bench.

- User input is a prompt surface.
- Engine response is the compiler output.
- RecipeState is shown as a state object/file inspector.
- `splitDiff` output is shown as:
  - created fields = new artifacts
  - modified fields = patch/diff rows
- The sample loader can remain, but it should look like loading a fixture, not a demo CTA.

### COOK

COOK becomes the runtime screen.

- The current step is the active instruction.
- Timer reads as a run clock.
- Hotfix buttons are runtime patch categories.
- Event list is an execution log.
- Wake Lock / Notification state reads as environment status.
- It must remain touch-friendly and mobile-first.

### POSTMORTEM

POSTMORTEM becomes the run report.

- Outcome is the run result.
- Failed step is a stack-trace pin.
- Submitted run should feel like it writes back into RuntimeLog/Fingerprint.
- There is still no skip path.

### Side Panel

The right panel becomes `Runtime Context`.

Show:

- user fingerprint availability
- recipe id
- stage
- step count
- CookRun event count
- note that current MVP needs manual JWT/existing recipe id

This panel should feel like an inspector, not a help card.

## Constraints

- Do not change API contracts in this redesign.
- Do not add login or recipe row creation yet.
- Keep the existing working MVP flow:
  - manual JWT
  - existing recipe id
  - BuildMode calls `/api/recipe`
  - CookMode emits `step_events`
  - Postmortem calls `/api/run`
- Maintain D-006: CookMode must not mutate RecipeState through hotfixes.
- Maintain mobile usability: large Cook controls and non-overlapping text.

## Success Criteria

- First glance communicates BUILD -> COOK -> POSTMORTEM -> LEARN.
- The UI feels product-specific, not a generic SaaS dashboard.
- Cook Mode feels like an active runtime, not a static recipe card.
- Postmortem feels like a report that feeds learning.
- Existing tests, typecheck, and build still pass.
