# Phase 3: Consolidate Tool Policy and Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Complete every checkbox before committing this phase.

**Goal:** Make `src/core/tools.ts` the single owner of tool policy, active-tool computation, and selection persistence while keeping shell safety in `src/core/safety.ts`.

**Architecture:** Use Pi's official `ToolInfo` for tool discovery. Keep policy constants, config path construction, JSON conversion, and non-critical persistence failure handling private; expose only the functions required by `src/index.ts` and the selector.

**Tech Stack:** TypeScript ESM, Vitest, Biome, Pi coding-agent 0.82 `ToolInfo` and `ExtensionAPI`.

---

**Prerequisite:** Phase 2 commit is present and `pnpm check` passes.

**Files:** Modify `src/core/tools.ts`, `src/core/safety.ts`, `src/shared/constants.ts`, `src/index.ts`, `src/tui/tool-selector.ts`, and related tests; delete `src/core/config.ts` and `tests/core/config.test.ts`.

- [ ] **Step 1: Characterize current behavior**

Keep or add assertions for:

```ts
expect(planModeToolNames(undefined)).toEqual([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
]);
expect(planModeToolNames(["custom"])).toEqual(
  expect.arrayContaining(["read", "bash", "grep", "find", "ls", "custom"]),
);
expect(savePlanToolNames(true)).toEqual([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "write",
]);
expect(normalModeToolNames(undefined)).toEqual([
  "read",
  "bash",
  "edit",
  "write",
]);
```

Also retain safe Pi access fallback tests and `extensions/plan-tools.json` read/write tests.

- [ ] **Step 2: Run the focused baseline**

Run `pnpm test -- tests/core/tools.test.ts tests/core/config.test.ts tests/core/safety.test.ts`.

Expected: PASS before consolidation.

- [ ] **Step 3: Adopt Pi's official type**

Import `ToolInfo` from `@earendil-works/pi-coding-agent`. For a narrow selector view, use only:

```ts
export type PlanToolInfo = Pick<ToolInfo, "name"> & {
  sourceInfo: Pick<ToolInfo["sourceInfo"], "source">;
};
```

`safeGetAllTools` returns official `ToolInfo[]`; do not define a competing full tool shape.

- [ ] **Step 4: Consolidate policy and persistence**

Keep the existing behavior behind `getToolPolicy`, `planModeToolNames`, `savePlanToolNames`, `normalModeToolNames`, `safeGetAllTools`, `safeGetActiveTools`, `readSelectedToolNames`, and `writeSelectedToolNames`. Keep constants, path construction, boolean-map conversion, and silent non-critical persistence failures private.

- [ ] **Step 5: Move shell patterns and delete config**

Move `MUTATING_BASH_PATTERNS` and `SAFE_BASH_PATTERNS` from `src/shared/constants.ts` into `src/core/safety.ts` without changing expressions or command-segment behavior. Keep only `isSafeCommand` public. Update callers, then delete `src/core/config.ts` and its direct tests after persistence coverage passes.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm test -- tests/core/tools.test.ts tests/core/safety.test.ts tests/index.test.ts
pnpm check
git diff --check
```

Expected: tool policy, persistence, safety, and extension tests pass with no new warnings. Commit:

```bash
git add src/core/tools.ts src/core/safety.ts src/shared/constants.ts src/index.ts src/tui/tool-selector.ts tests/core/tools.test.ts tests/core/safety.test.ts tests/index.test.ts src/core/config.ts tests/core/config.test.ts
git commit -m "refactor: consolidate plan tool policy"
```

**Usable result:** Plan, Save, normal-mode, and persisted tool selection behave as before with one core policy owner.
