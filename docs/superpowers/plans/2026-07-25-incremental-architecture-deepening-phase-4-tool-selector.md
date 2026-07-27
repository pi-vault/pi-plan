# Phase 4: Collapse Tool Selector Internals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the selector factory the only production seam while preserving all `/plan:tools` interactions and Pi TUI rendering behavior.

**Architecture:** Move selector state, reduction, input handling, filtering, pagination, policy rows, layout, and rendering into `src/tui/tool-selector.ts` as private declarations. Keep `createToolSelectorComponent` as the only exported selector API. Pi TUI 0.82 owns render scheduling after focused input, so remove the dead custom render callback.

**Tech Stack:** TypeScript ESM, Node.js >=24.15.0, Vitest, Biome, `@earendil-works/pi-tui` 0.82.

---

**Prerequisite:** Phase 3 is present. Run commands with the repository's installed Node version:

```bash
mise exec node@24.15.0 -- pnpm check
```

Expected: 255 tests pass. The existing `tests/helpers.ts:168` Biome `noBannedTypes` warning is allowed; do not add warnings.

**Files:**

- Modify: `src/tui/tool-selector.ts`, `src/index.ts`
- Create: `tests/tui/tool-selector.test.ts`
- Delete: `src/tui/tool-selector-state.ts`, `src/tui/tool-selector-render.ts`, `tests/tui/tool-selector-state.test.ts`, `tests/tui/tool-selector-render.test.ts`
- Verify without modifying: `tests/index.test.ts`

### Task 1: Characterize the selector through its factory

**Files:** Create `tests/tui/tool-selector.test.ts`.

- [ ] **Step 1: Add the factory test builder against the current API**

Import `createToolSelectorComponent`, `PlanToolInfo`, and Pi TUI's `visibleWidth`. Define identity theme functions and a `createSelector` helper that passes `requestRender: vi.fn()` for the current factory. Do not assert the callback; it is removed in Task 2.

```ts
function createSelector(
  tools: PlanToolInfo[],
  previousSelections: string[] = [],
  done = vi.fn(),
) {
  return {
    component: createToolSelectorComponent({
      tools,
      previousSelections,
      theme: identityTheme,
      done,
      requestRender: vi.fn(),
    }),
    done,
  };
}
```

Use these raw Pi TUI inputs in every interaction test:

```ts
const key = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  escape: "\x1b",
  enter: "\r",
  backspace: "\x7f",
  space: " ",
};
```

- [ ] **Step 2: Add initial render and policy coverage**

Construct built-in `edit` and `read` tools plus extension `alpha` and `zeta`, with `alpha` in `previousSelections`. Assert the title/help lines, built-ins appear before extensions, `read` is checked, `edit` is unchecked and labeled `built-in blocked`, and `alpha` is checked.

- [ ] **Step 3: Add navigation and selection coverage**

Use extension tools `alpha` and `beta`. Send Up at the first row, Down twice, and assert the focused row remains clamped at the first/last item by checking the `▸` marker in `component.render(80)`. Toggle the focused tool with Space, press Enter, and assert `done` receives the selected extension name.

- [ ] **Step 4: Add non-toggleable policy coverage**

Use built-in `edit`, built-in `read`, and extension `custom`. Send Space while focused on `edit` and `read`; assert neither is selected. Move to `custom`, toggle it, press Enter, and assert `done` receives `['custom']`.

- [ ] **Step 5: Add search editing coverage**

Use tools `abc`, `ac`, and `zzz`. Send `a`, `c`, Left, `b`, and assert the rendered query is `abc` with only `abc` visible. Send Right, Backspace, `x`, and assert the rendered query is `abx` with `No tools match the search.` visible.

- [ ] **Step 6: Add pagination, cancellation, and width coverage**

Use `TOOL_SELECTOR_PAGE_SIZE + 1` extension tools. Send Right twice and assert the page label remains `(2/2)`; send Left twice and assert it remains `(1/2)`. Assert the labels move between `(1/2)` and `(2/2)` on the first movement in each direction. Construct a second selector, send Escape, and assert `done` receives `null`. For widths `1` and `20`, assert rendering does not throw and every returned line satisfies `visibleWidth(line) <= width`.

- [ ] **Step 7: Verify characterization tests before moving code**

Run:

```bash
mise exec node@24.15.0 -- pnpm test -- tests/tui/tool-selector.test.ts tests/index.test.ts
```

Expected: the new factory tests and existing `/plan:tools` integration tests pass against the current split implementation.

### Task 2: Inline selector internals and remove render plumbing

**Files:** Modify `src/tui/tool-selector.ts`, `src/index.ts`, and `tests/tui/tool-selector.test.ts`.

- [ ] **Step 1: Define the final factory boundary**

Change the factory options to remove `requestRender`:

```ts
export function createToolSelectorComponent(options: {
  tools: PlanToolInfo[];
  previousSelections: string[] | undefined;
  theme: ToolSelectorTheme;
  done: (result: string[] | null) => void;
}): Component
```

Keep `ToolSelectorTheme` private unless a consumer requires it. Keep `invalidate(): void {}` as the no-op required by `Component`.

- [ ] **Step 2: Move the state and reducer declarations**

Move `ToolSelectorState`, action/result types, sorting, initialization, filtering, pagination, policy display helpers, cursor clamping, and `toolSelectorReducer` from `tool-selector-state.ts` into `tool-selector.ts`. Keep `getToolPolicy`, `planModeToolNames`, and `TOOL_SELECTOR_PAGE_SIZE` imported from their existing owners. Do not change reducer behavior.

- [ ] **Step 3: Move rendering declarations**

Move theme constants, policy coloring, row layout, truncation, and `renderToolSelector` from `tool-selector-render.ts` into `tool-selector.ts`. Keep Pi TUI's `truncateToWidth` and `visibleWidth` imports. Do not change rendered strings, ordering, or width behavior.

- [ ] **Step 4: Remove callback dispatching**

In the factory dispatch function, retain only these effects: call `options.done` for reducer results of type `done`, or replace private state for reducer results of type `next`. Remove the `options.requestRender()` call.

- [ ] **Step 5: Remove the dead callback from `src/index.ts`**

Delete the local `requestRender` variable, the `requestRender = () => component.invalidate()` assignment, and the `requestRender` option passed to `createToolSelectorComponent`. Leave the `ctx.ui.custom` factory and all command behavior unchanged.

- [ ] **Step 6: Update the factory test builder**

Remove only `requestRender: vi.fn()` from `createSelector` in `tests/tui/tool-selector.test.ts`. The test scenarios and assertions must remain unchanged.

- [ ] **Step 7: Verify the consolidated module**

Run:

```bash
mise exec node@24.15.0 -- pnpm test -- tests/tui/tool-selector.test.ts tests/index.test.ts
```

Expected: the same factory and integration tests pass with the final factory boundary.

### Task 3: Delete redundant seams and complete acceptance

**Files:** Delete the four old selector modules/tests listed above.

- [ ] **Step 1: Remove old selector seams**

Delete `src/tui/tool-selector-state.ts`, `src/tui/tool-selector-render.ts`, `tests/tui/tool-selector-state.test.ts`, and `tests/tui/tool-selector-render.test.ts`. Confirm no imports remain; the only selector production import is `createToolSelectorComponent` from `src/index.ts`.

- [ ] **Step 2: Run focused and repository checks**

Run:

```bash
mise exec node@24.15.0 -- pnpm test -- tests/tui/tool-selector.test.ts tests/index.test.ts
mise exec node@24.15.0 -- pnpm check
git diff --check
git status --short
```

Expected: all tests pass, the pre-existing `tests/helpers.ts` warning is unchanged, `git diff --check` is clean, and only the planned source/test files are changed.

- [ ] **Step 3: Commit the phase**

```bash
git add src/tui/tool-selector.ts src/index.ts tests/tui/tool-selector.test.ts \
  src/tui/tool-selector-state.ts src/tui/tool-selector-render.ts \
  tests/tui/tool-selector-state.test.ts tests/tui/tool-selector-render.test.ts
git commit -m "refactor: deepen tool selector module"
```

**Usable result:** `/plan:tools` still supports selection, search, navigation, cancellation, pagination, and narrow rendering, while selector implementation details are private to one module.

**Scope boundary:** Do not change persisted tool policy, command wording, tool names, persistence format, dependencies, or the existing blocked-selection edge case in this phase.
