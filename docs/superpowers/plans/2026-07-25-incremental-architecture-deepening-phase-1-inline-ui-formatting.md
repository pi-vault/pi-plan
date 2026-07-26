# Phase 1: Inline Plan Mode UI Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Complete every checkbox before committing this phase.

**Goal:** Delete the shallow status/widget formatter modules while preserving every existing Plan-mode UI state.

**Architecture:** Keep UI synchronization private to `src/index.ts`, where Plan state transitions and Pi UI registration already meet. Test the behavior through registered commands and session events; add no replacement formatter seam.

**Tech Stack:** TypeScript ESM, Vitest, Biome, Pi Extension API 0.82.

---

**Prerequisite:** Preserve unrelated working-tree changes. Run the focused test command exactly as written below; `pnpm test -- tests/index.test.ts` runs the full suite in this repository. Do not change context, tool, selector, or Save behavior in this phase.

**Files:** Modify `src/index.ts` and `tests/index.test.ts`; delete `src/tui/status.ts`, `src/tui/widgets.ts`, `tests/tui/status.test.ts`, and `tests/tui/widgets.test.ts`.

- [ ] **Step 1: Establish the baseline**

Run:

```bash
git status --short
pnpm test tests/index.test.ts
pnpm check
```

Expected: the focused file passes with 79 tests and the full suite passes with 280 tests. The current six Biome warnings and Node 23 engine warning are pre-existing; add no warnings.

- [ ] **Step 2: Add exact UI integration assertions**

Replace the current `describe("widgets", ...)` block in `tests/index.test.ts` with:

```ts
describe("Plan mode UI", () => {
  async function restoreUiState(
    latestPlan: string | undefined,
    awaitingAction: boolean,
  ) {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      entries: [
        {
          type: "custom",
          customType: "plan-mode-state",
          data: { enabled: true, latestPlan, awaitingAction },
          id: "ui-state",
          parentId: null,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    await mock.fireEvent(
      "session_start",
      { type: "session_start", reason: "resume" },
      ctx,
    );
    return ctx;
  }

  it("shows active UI when enabled without a plan", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.widgets.get("pi-plan")).toEqual([
      "Plan mode: planning",
      "Produce a <proposed_plan> block.",
    ]);
  });

  it.each([
    ["latestPlan", "# Plan", false],
    ["awaitingAction", undefined, true],
  ] as const)("shows ready UI from %s", async (_source, latestPlan, awaitingAction) => {
    const ctx = await restoreUiState(latestPlan, awaitingAction);

    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
    expect(ctx.widgets.get("pi-plan")).toEqual([
      "Proposed plan ready",
      "Use /plan to implement, revise, or exit Plan mode.",
    ]);
  });

  it("keeps a restored empty plan active", async () => {
    const ctx = await restoreUiState("", false);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.widgets.get("pi-plan")).toEqual([
      "Plan mode: planning",
      "Produce a <proposed_plan> block.",
    ]);
  });

  it("clears both UI values on exit", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan:exit")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(ctx.widgets.get("pi-plan")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Verify the assertions describe current behavior**

Run:

```bash
pnpm test tests/index.test.ts
```

Expected: PASS before the implementation change.

- [ ] **Step 4: Inline the formatter behavior**

In `src/index.ts`, remove the formatter imports and replace `updateUi` with:

```ts
function updateUi(ctx: ExtensionContext): void {
  if (!state.enabled) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }

  const ready = state.awaitingAction || Boolean(state.latestPlan);
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

Keep `clearUi` unchanged. `Boolean(state.latestPlan)` preserves the current formatter behavior for a restored empty-string plan.

- [ ] **Step 5: Delete obsolete seams**

Delete `src/tui/status.ts`, `src/tui/widgets.ts`, `tests/tui/status.test.ts`, and `tests/tui/widgets.test.ts`. Keep all UI behavior assertions in `tests/index.test.ts`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm test tests/index.test.ts
pnpm check
git diff --check
git diff -- src/index.ts tests/index.test.ts src/tui/status.ts src/tui/widgets.ts tests/tui/status.test.ts tests/tui/widgets.test.ts
```

Expected: all tests pass, no warnings beyond the six recorded at baseline, and `git diff --check` produces no output. Commit only the scoped files:

```bash
git add src/index.ts tests/index.test.ts src/tui/status.ts src/tui/widgets.ts tests/tui/status.test.ts tests/tui/widgets.test.ts
git commit -m "refactor: inline plan mode UI formatting"
```

**Usable result:** Plan mode retains the same active/ready status and widget, including the restored empty-plan edge case, with four shallow files removed.
