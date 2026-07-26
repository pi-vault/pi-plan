# Phase 1: Inline Plan Mode UI Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Complete every checkbox before committing this phase.

**Goal:** Remove the shallow status/widget formatter modules while preserving every visible Plan-mode UI state.

**Architecture:** Keep UI readiness calculation in `src/index.ts`, where Plan state and Pi UI registration already meet. Delete the two one-purpose formatter modules and retain their behavior assertions in extension tests.

**Tech Stack:** TypeScript ESM, Vitest, Biome, Pi Extension API.

---

**Prerequisite:** Baseline `pnpm test` passes; do not change context, tool, selector, or Save behavior in this phase.

**Files:** Modify `src/index.ts` and `tests/index.test.ts`; delete `src/tui/status.ts`, `src/tui/widgets.ts`, `tests/tui/status.test.ts`, and `tests/tui/widgets.test.ts`.

- [ ] **Step 1: Add combined UI assertions**

In `tests/index.test.ts`, assert enabled/no-plan produces status `plan active` and the planning widget; enabled/ready (`latestPlan` or `awaitingAction`) produces `plan ready` and the ready widget; disabled state clears both values.

- [ ] **Step 2: Verify the assertions describe current behavior**

Run `pnpm test -- tests/index.test.ts`.

Expected: PASS before the implementation change.

- [ ] **Step 3: Inline the formatter behavior**

Replace the formatter imports and `updateUi` body in `src/index.ts` with:

```ts
function updateUi(ctx: ExtensionContext): void {
  if (!state.enabled) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }
  const ready = state.awaitingAction || state.latestPlan !== undefined;
  ctx.ui.setStatus(STATUS_KEY, ready ? "plan ready" : "plan active");
  ctx.ui.setWidget(
    WIDGET_KEY,
    ready
      ? [
          "Proposed plan ready",
          "Use /plan to implement, revise, or exit Plan mode.",
        ]
      : ["Plan mode: planning", "Produce a <proposed_plan> block."],
  );
}
```

Keep `clearUi` unchanged.

- [ ] **Step 4: Delete obsolete seams**

Delete both source formatter files and both direct formatter test files. Keep equivalent assertions in `tests/index.test.ts`.

- [ ] **Step 5: Verify and commit**

Run `pnpm check` and `git diff --check`. Expected: all tests pass and no new lint warnings. Commit:

```bash
git add src/index.ts tests/index.test.ts src/tui/status.ts src/tui/widgets.ts tests/tui/status.test.ts tests/tui/widgets.test.ts
git commit -m "refactor: inline plan mode UI formatting"
```

**Usable result:** Plan mode still displays the same active/ready status and widget, with four shallow files removed.
