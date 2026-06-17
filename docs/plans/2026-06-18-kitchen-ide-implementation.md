# Kitchen IDE Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the existing working MVP UI so Vibe Recipe reads as a warm pair-cooking IDE with a visible BUILD -> COOK -> POSTMORTEM -> LEARN loop.

**Architecture:** Keep all current data flow and API contracts. Change component markup and CSS classes in `app/page.tsx`, `components/BuildMode.tsx`, `components/CookMode.tsx`, `components/Postmortem.tsx`, and `app/globals.css`. No backend changes should be needed.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS modules via global stylesheet, existing Zod schemas and API routes.

---

### Task 1: Shell And Pipeline Identity

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Step 1: Update shell structure**

Replace the current topbar/workspace visual hierarchy with:

- `.ide-shell`
- `.command-header`
- `.pipeline-rail`
- `.workbench`
- `.runtime-inspector`

Keep the same state variables and callbacks.

**Step 2: Add pipeline states**

Render four rail items:

```text
BUILD
COOK
POSTMORTEM
LEARN
```

`LEARN` is display-only for now and should reflect RuntimeLog/Fingerprint conceptually.

**Step 3: Run verification**

Run:

```bash
npm run typecheck
```

Expected: exit 0.

---

### Task 2: BUILD As Compile Bench

**Files:**
- Modify: `components/BuildMode.tsx`
- Modify: `app/globals.css`

**Step 1: Rename visual regions**

Use compile-oriented labels:

- prompt surface
- compiler output
- state inspector
- artifact/diff rows

Do not change API payloads.

**Step 2: Preserve sample fixture**

Keep the sample loader but label it as a fixture load pattern rather than a demo.

**Step 3: Run verification**

Run:

```bash
npm test
npm run typecheck
```

Expected: both exit 0.

---

### Task 3: COOK As Runtime

**Files:**
- Modify: `components/CookMode.tsx`
- Modify: `app/globals.css`

**Step 1: Runtime framing**

Make the active step look like a running instruction:

- run clock
- current instruction
- environment status
- runtime patch deck
- execution log

**Step 2: Preserve behavior**

Do not add any RecipeState mutation path. Hotfix remains StepEvent append only.

**Step 3: Run verification**

Run:

```bash
npm run typecheck
```

Expected: exit 0.

---

### Task 4: POSTMORTEM As Run Report

**Files:**
- Modify: `components/Postmortem.tsx`
- Modify: `app/globals.css`

**Step 1: Run report styling**

Make outcome buttons read as run results and failed step as a stack-trace pin.

**Step 2: Preserve no-skip behavior**

Submit remains disabled until required data is present. There is no skip CTA.

**Step 3: Run verification**

Run:

```bash
npm run typecheck
```

Expected: exit 0.

---

### Task 5: Final Verification And Commit

**Files:**
- Review all modified files.

**Step 1: Full verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected:

- tests pass
- typecheck exits 0
- build exits 0 without warnings

**Step 2: Dev server smoke check**

Run or reuse dev server and check:

```bash
Invoke-WebRequest -Uri http://127.0.0.1:3000 -UseBasicParsing
```

Expected: HTTP 200.

**Step 3: Commit**

```bash
git add app/page.tsx app/globals.css components/BuildMode.tsx components/CookMode.tsx components/Postmortem.tsx docs/plans/2026-06-18-kitchen-ide-design.md docs/plans/2026-06-18-kitchen-ide-implementation.md
git commit -m "design: reshape UI as kitchen IDE"
```
