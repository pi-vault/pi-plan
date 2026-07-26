# Phase 4: Collapse Tool Selector Internals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Complete every checkbox before committing this phase.

**Goal:** Make the selector factory the only production seam while preserving all `/plan:tools` interactions and Pi TUI rendering behavior.

**Architecture:** Move reducer, input, filtering, pagination, policy rows, layout, and rendering helpers into `src/tui/tool-selector.ts` as private functions. Pi TUI owns render scheduling after focused input, so no custom render callback is needed.

**Tech Stack:** TypeScript ESM, Vitest, Pi TUI `Component`, raw terminal key bytes.

---

**Prerequisite:** Phase 3 commit is present and `pnpm check` passes.

**Files:** Modify `src/tui/tool-selector.ts`, `src/index.ts`, and `tests/index.test.ts`; create `tests/tui/tool-selector.test.ts`; delete `src/tui/tool-selector-state.ts`, `src/tui/tool-selector-render.ts`, and their direct tests.

- [ ] **Step 1: Add factory-level tests**

Construct the component through `createToolSelectorComponent` and invoke raw input through the optional handler:

```ts
const done = vi.fn();
const component = createToolSelectorComponent({
  tools: [
    { name: "read", sourceInfo: { source: "builtin" } },
    { name: "custom", sourceInfo: { source: "extension" } },
  ],
  previousSelections: [],
  theme: identityTheme,
  done,
});
component.handleInput?.(" ");
component.handleInput?.("\r");
expect(done).toHaveBeenCalledWith(["custom"]);
```

Cover search editing, cursor movement, pagination, blocked/always-on policy display, cancellation, and narrow render widths. Use `"\x1b[A"`, `"\x1b[B"`, `"\x1b[C"`, `"\x1b[D"`, `"\x1b"`, and `"\x7f"` for arrows, escape, and backspace.

- [ ] **Step 2: Verify the factory behavior before moving code**

Run `pnpm test -- tests/tui/tool-selector.test.ts tests/index.test.ts`.

Expected: PASS against the current factory and helper modules.

- [ ] **Step 3: Remove redundant render plumbing and inline internals**

Remove the `requestRender` option and `requestRender = () => component.invalidate()` closure from `src/index.ts`; Pi TUI calls its render request after focused input. Keep `invalidate(): void {}` as the no-op required by `Component`. Move all state, input, pagination, row, and layout helpers into `tool-selector.ts` without exporting them.

- [ ] **Step 4: Delete old seams and direct tests**

Delete the state/render modules and direct helper tests. Preserve all behavior assertions through `tests/tui/tool-selector.test.ts` and the extension command test.

- [ ] **Step 5: Verify and commit**

Run `pnpm test -- tests/tui/tool-selector.test.ts tests/index.test.ts && pnpm check && git diff --check`.

Expected: selector and extension tests pass with no new warnings. Commit:

```bash
git add src/tui/tool-selector.ts src/index.ts tests/tui/tool-selector.test.ts tests/index.test.ts src/tui/tool-selector-state.ts src/tui/tool-selector-render.ts tests/tui/tool-selector-state.test.ts tests/tui/tool-selector-render.test.ts
git commit -m "refactor: deepen tool selector module"
```

**Usable result:** `/plan:tools` still supports selection, search, navigation, cancellation, and rendering with private implementation details.
