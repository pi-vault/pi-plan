# Phase 3: Consolidate Tool Policy and Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `src/core/tools.ts` the single owner of Plan-mode tool policy, active-tool computation, Pi tool discovery fallbacks, and optional-tool persistence without changing product behavior.

**Architecture:** Keep `src/index.ts` as the Pi event coordinator. Move tool-name policy and `extensions/plan-tools.json` conversion/persistence into `src/core/tools.ts`; keep shell-command patterns private to `src/core/safety.ts`. The selector continues to own navigation and rendering in this phase, but delegates policy decisions to `core/tools.ts`; Phase 4 may then remove its internal seams.

**Tech Stack:** TypeScript ESM, Node.js >=24.15.0, Vitest, Biome, Pi coding-agent 0.82 `ToolInfo` and `ExtensionAPI`.

---

**Prerequisite:** Phase 2 is merged and the working tree is clean. The current environment is Node 23.11.0, below the declared engine; `pnpm check` may report that engine warning. The current lint baseline has two warnings: the unrelated `Function` type in `tests/helpers.ts` and unused selector-test imports that are removed while updating those tests. The phase must not add warnings.

**Persistence decision:** Preserve the documented cross-session `extensions/plan-tools.json` behavior. Pi's `/tools` session-entry example is used only as a reference for official `ToolInfo` and active-tool APIs, not as a reason to change this package's persistence contract.

**Files:**

- Modify `src/core/tools.ts` to own policy, active-tool computation, official tool typing, and JSON persistence.
- Modify `src/core/safety.ts` and `src/shared/constants.ts` to relocate shell patterns and remove tool-policy constants.
- Modify `src/index.ts` to call the consolidated interfaces.
- Modify `src/tui/tool-selector.ts`, `src/tui/tool-selector-state.ts`, and `src/tui/tool-selector-render.ts` to use `PlanToolInfo` and `getToolPolicy`.
- Modify `tests/core/tools.test.ts`, `tests/core/safety.test.ts`, `tests/index.test.ts`, `tests/tui/tool-selector-state.test.ts`, and `tests/tui/tool-selector-render.test.ts`.
- Delete `src/core/config.ts` and `tests/core/config.test.ts` after their coverage moves into `tools.test.ts`.

## Internal interfaces

`src/core/tools.ts` must export these exact interfaces:

```ts
export type PlanToolInfo = Pick<ToolInfo, "name"> & {
  sourceInfo: Pick<ToolInfo["sourceInfo"], "source">;
};

export function getToolPolicy(tool: PlanToolInfo): {
  alwaysOn: boolean;
  toggleable: boolean;
  label: string;
};

export function planModeToolNames(selected?: string[]): string[];
export function savePlanToolNames(writeAvailable: boolean): string[];
export function normalModeToolNames(previous?: string[]): string[];
export function safeGetAllTools(pi: ExtensionAPI): ToolInfo[];
export function safeGetActiveTools(pi: ExtensionAPI): string[];
export function readSelectedToolNames(): Promise<string[] | undefined>;
export function writeSelectedToolNames(
  selected: string[],
  allTools: PlanToolInfo[],
): Promise<void>;
```

Policy behavior is fixed:

- Built-in `read`, `grep`, `find`, and `ls`: always on, not toggleable, `built-in`.
- Built-in `bash`: always on, not toggleable, `built-in limited`.
- Built-in `edit` and `write`: blocked, not toggleable, `built-in blocked`.
- Other built-ins: optional and toggleable, `built-in`.
- Non-built-ins: optional and toggleable, `user risk: <source>`.

`planModeToolNames` returns the ordered safe five (`read`, `bash`, `grep`, `find`, `ls`) plus deduplicated selections. `savePlanToolNames(true)` appends `write`; `savePlanToolNames(false)` does not. `normalModeToolNames` preserves a non-empty previous list and otherwise returns `read`, `bash`, `edit`, `write`.

`readSelectedToolNames` returns `undefined` for a missing/invalid file or JSON containing no boolean values. A valid boolean map with no selected optional tools returns `[]`. `writeSelectedToolNames` preserves the existing boolean-map JSON shape, forces safe-name entries to `true`, marks other discovered tools from `selected`, creates `extensions/`, and silently absorbs non-critical filesystem failures.

## Task 1: Characterize behavior and move persistence tests

**Files:**

- Modify: `tests/core/tools.test.ts`
- Modify: `tests/index.test.ts`
- Delete later: `tests/core/config.test.ts`

- [ ] **Step 1: Run the real focused baseline**

Run:

```bash
pnpm exec vitest run tests/core/tools.test.ts tests/core/config.test.ts tests/core/safety.test.ts
```

Expected: 3 test files and 97 tests pass.

- [ ] **Step 2: Add failing tests for the consolidated API**

Replace imports of the old tool-name/config functions with the interfaces above. Add assertions for:

```ts
expect(planModeToolNames()).toEqual(["read", "bash", "grep", "find", "ls"]);
expect(planModeToolNames(["custom", "read"])).toEqual([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "custom",
]);
expect(savePlanToolNames(true)).toEqual([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "write",
]);
expect(savePlanToolNames(false)).toEqual([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
]);
expect(normalModeToolNames()).toEqual(["read", "bash", "edit", "write"]);
```

Cover every `getToolPolicy` row, Pi access exceptions, missing/invalid/no-boolean JSON, valid empty selection, mixed boolean values, exact written JSON, and a write failure that resolves without throwing. Use temporary `PI_CODING_AGENT_DIR` values and restore the environment after each test.

Add one `tests/index.test.ts` session-start case proving a valid JSON selection overrides a different restored `selectedToolNames` value.

- [ ] **Step 3: Run the new tests and confirm they fail for missing interfaces**

Run:

```bash
pnpm exec vitest run tests/core/tools.test.ts tests/index.test.ts
```

Expected: FAIL during collection or assertions because the consolidated exports do not exist yet.

## Task 2: Implement the core owner

**Files:**

- Modify: `src/core/tools.ts`
- Modify: `tests/core/tools.test.ts`

- [ ] **Step 1: Import Pi's official type and Node filesystem APIs**

Use `ToolInfo` and `ExtensionAPI` from `@earendil-works/pi-coding-agent`; use `node:fs/promises` and `node:path` for the existing config file behavior.

- [ ] **Step 2: Implement private policy constants and `getToolPolicy`**

Keep the ordered safe names, blocked names, normal defaults, and config filename private. Match the policy table exactly, including source-sensitive labels for selector display.

- [ ] **Step 3: Implement tool-name computation and Pi fallbacks**

Use a `Set` to deduplicate selected names. `safeGetAllTools` returns `pi.getAllTools()` and returns `[]` if it throws. `safeGetActiveTools` returns `pi.getActiveTools()` and falls back to the normal four if it throws.

- [ ] **Step 4: Implement JSON persistence**

Keep config-path construction, boolean filtering, and failure suppression private. Preserve the current distinction between `undefined` (no usable config) and `[]` (usable config with no selected optional tools).

- [ ] **Step 5: Run core tests**

Run:

```bash
pnpm exec vitest run tests/core/tools.test.ts
```

Expected: all tool-policy, fallback, and persistence tests pass.

## Task 3: Move shell safety ownership

**Files:**

- Modify: `src/core/safety.ts`
- Modify: `src/shared/constants.ts`
- Modify: `tests/core/safety.test.ts`

- [ ] **Step 1: Move the pattern arrays unchanged**

Move `MUTATING_BASH_PATTERNS` and `SAFE_BASH_PATTERNS` into `src/core/safety.ts`. Do not alter expressions, separator checks, substitution checks, or pipe-segment behavior. Remove only those two exports from `src/shared/constants.ts`.

- [ ] **Step 2: Run safety tests**

Run:

```bash
pnpm exec vitest run tests/core/safety.test.ts
```

Expected: every existing safe, mutating, chained, piped, and redirect case passes.

## Task 4: Update callers and selector policy boundary

**Files:**

- Modify: `src/index.ts`
- Modify: `src/tui/tool-selector.ts`
- Modify: `src/tui/tool-selector-state.ts`
- Modify: `src/tui/tool-selector-render.ts`
- Modify: selector and integration tests listed above
- Delete: `src/core/config.ts`, `tests/core/config.test.ts`

- [ ] **Step 1: Replace index imports and active-tool calls**

Use `planModeToolNames`, `savePlanToolNames`, `readSelectedToolNames`, and `writeSelectedToolNames`. Replace inline Save computation with:

```ts
pi.setActiveTools(
  savePlanToolNames(planWriteCallId === undefined && !planSaveSucceeded),
);
```

Keep session-entry restoration first, then let a valid JSON selection override it. Fire-and-forget persistence with `void writeSelectedToolNames(...)`; the core function owns error suppression.

- [ ] **Step 2: Replace selector types and policy helpers**

Use `PlanToolInfo` in state, selector, renderer, and tests. Make `isToggleable`, `isAlwaysOn`, and `toolPolicyLabel` delegate to `getToolPolicy`; leave sorting, pagination, search, rendering, and reducer behavior unchanged.

- [ ] **Step 3: Remove obsolete config module and shared policy exports**

Delete `src/core/config.ts` and `tests/core/config.test.ts`. Remove the now-unused safe/blocked/default tool constants from `src/shared/constants.ts`; keep UI/state constants there.

- [ ] **Step 4: Run integration and selector tests**

Run:

```bash
pnpm exec vitest run \
  tests/core/tools.test.ts \
  tests/core/safety.test.ts \
  tests/tui/tool-selector-state.test.ts \
  tests/tui/tool-selector-render.test.ts \
  tests/index.test.ts
```

Expected: all tests pass with unchanged Plan entry/exit, selector, Save, restoration, and safety behavior.

## Task 5: Final verification and commit

- [ ] **Step 1: Run the full checks**

Run:

```bash
pnpm check
git diff --check
git status --short
```

Expected: tests, typecheck, and lint pass; the known Node engine warning may remain; no new lint warnings or unexpected files appear.

- [ ] **Step 2: Review the diff against the contract**

Confirm that no command, label, dependency, persistence format, shell expression, or product behavior changed; only policy ownership, type ownership, and module boundaries changed.

- [ ] **Step 3: Commit the phase**

```bash
git add \
  docs/superpowers/plans/2026-07-25-incremental-architecture-deepening-phase-3-tool-policy.md \
  src/core/tools.ts src/core/safety.ts src/core/config.ts \
  src/shared/constants.ts src/index.ts \
  src/tui/tool-selector.ts src/tui/tool-selector-state.ts src/tui/tool-selector-render.ts \
  tests/core/tools.test.ts tests/core/safety.test.ts tests/core/config.test.ts \
  tests/tui/tool-selector-state.test.ts tests/tui/tool-selector-render.test.ts \
  tests/index.test.ts
git commit -m "refactor: consolidate plan tool policy"
```

**Usable result:** Plan mode, Save mode, normal-mode restoration, selector policy display, shell safety, and persisted optional-tool selections behave as before with one core policy/persistence owner.
