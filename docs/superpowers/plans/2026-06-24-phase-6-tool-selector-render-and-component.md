# Phase 6: Tool Selector Render + Component

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the render function and component shell for the tool selector TUI. This phase is additive — the extension continues working the old way. After this phase, the complete tool selector component exists and compiles.

**Architecture:** A render function (`tool-selector-render.ts`) takes state + theme and returns `string[]` lines. A thin component shell (`tool-selector.ts`) wires keyboard input to the reducer and calls render. Follows the pi-status `editor.ts` / `editor-render.ts` pattern.

**Tech Stack:** TypeScript (ES2022, strict, Node16 ESM), `@earendil-works/pi-tui` (`Key`, `matchesKey`, `Component`, `truncateToWidth`, `visibleWidth`), vitest.

**Spec:** `docs/superpowers/specs/2026-06-24-refactor-commands-and-tool-selector-design.md`

**Prerequisite:** Phase 5 must be complete (`src/tui/tool-selector-state.ts` exists and passes tests).

**Verification:** `npx vitest run` — all tests pass + new render tests pass. `npx tsc --noEmit` passes.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/tui/tool-selector-render.ts` | Create | Render function: state + theme → `string[]` lines |
| `src/tui/tool-selector.ts` | Create | Component factory: keyboard → dispatch → render |
| `tests/tui/tool-selector-render.test.ts` | Create | Render output tests |

---

### Task 1: Create tool selector render function

**Files:** `src/tui/tool-selector-render.ts`, `tests/tui/tool-selector-render.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tui/tool-selector-render.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { renderToolSelector, type ToolSelectorTheme } from "../../src/tui/tool-selector-render.ts";
import { initToolSelectorState } from "../../src/tui/tool-selector-state.ts";
import type { ToolSelectorItem } from "../../src/tui/tool-selector-state.ts";

const noTheme: ToolSelectorTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
  dim: (text) => text,
};

function makeTools(names: string[], source = "extension"): ToolSelectorItem[] {
  return names.map((name) => ({
    name,
    sourceInfo: { source },
  }));
}

function builtinTool(name: string): ToolSelectorItem {
  return { name, sourceInfo: { source: "builtin" } };
}

describe("renderToolSelector", () => {
  it("renders title line", () => {
    const state = initToolSelectorState(makeTools(["a"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines[0]).toContain("Configure Plan-mode tools");
  });

  it("renders subtitle line", () => {
    const state = initToolSelectorState(makeTools(["a"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("user risk"))).toBe(true);
  });

  it("renders tool rows with checkbox markers", () => {
    const state = initToolSelectorState(makeTools(["my-tool"]), ["my-tool"]);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("[\u2022]") && l.includes("my-tool"))).toBe(true);
  });

  it("renders unchecked tools with [ ]", () => {
    const state = initToolSelectorState(makeTools(["my-tool"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("[ ]") && l.includes("my-tool"))).toBe(true);
  });

  it("renders cursor indicator on focused row", () => {
    const state = initToolSelectorState(makeTools(["a", "b"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("\u25B8"))).toBe(true);
  });

  it("renders policy labels for builtin tools", () => {
    const tools = [builtinTool("read"), builtinTool("bash"), builtinTool("edit")];
    const state = initToolSelectorState(tools, undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("built-in limited"))).toBe(true);
    expect(lines.some((l) => l.includes("built-in blocked"))).toBe(true);
  });

  it("renders help line", () => {
    const state = initToolSelectorState(makeTools(["a"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("Toggle");
    expect(lastLine).toContain("Enter");
    expect(lastLine).toContain("Esc");
  });

  it("shows Page in help when not searching", () => {
    const state = initToolSelectorState(makeTools(["a"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("Page");
  });

  it("shows Cursor in help when searching", () => {
    let state = initToolSelectorState(makeTools(["a"]), undefined);
    state = { ...state, query: "a", queryCursor: 1 };
    const lines = renderToolSelector(state, noTheme, 80);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("Cursor");
  });

  it("renders search query line", () => {
    let state = initToolSelectorState(makeTools(["a"]), undefined);
    state = { ...state, query: "test", queryCursor: 4 };
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("\u25B8 test"))).toBe(true);
  });

  it("renders page indicator when multiple pages", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    const state = initToolSelectorState(tools, undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines[0]).toContain("(1/2)");
  });

  it("always-on builtin tools show checked", () => {
    const tools = [builtinTool("read")];
    const state = initToolSelectorState(tools, undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("[\u2022]") && l.includes("read"))).toBe(true);
  });

  it("shows empty message when search has no results", () => {
    let state = initToolSelectorState(makeTools(["alpha", "beta"]), undefined);
    state = { ...state, query: "zzz", queryCursor: 3 };
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("No tools match"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tui/tool-selector-render.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/tui/tool-selector-render.ts`:

```typescript
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  type ToolSelectorItem,
  type ToolSelectorState,
  getVisibleTools,
  isAlwaysOn,
  isToggleable,
  toolPolicyLabel,
  totalPages,
} from "./tool-selector-state.ts";

export interface ToolSelectorTheme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
}

const LABEL_COLUMN_WIDTH = 24;
const LAYOUT_GAP = "  ";
const MIN_POLICY_WIDTH = 12;

const HELP_BASE =
  "Toggle: Space  \u2022  Navigate: \u2191/\u2193  \u2022  Page: \u2190/\u2192  \u2022  Save: Enter  \u2022  Cancel: Esc";
const HELP_SEARCHING =
  "Toggle: Space  \u2022  Navigate: \u2191/\u2193  \u2022  Cursor: \u2190/\u2192  \u2022  Save: Enter  \u2022  Cancel: Esc";
const SUBTITLE = "Non-built-in tools run at user risk.";
const SEARCH_PLACEHOLDER = "Type to search";

function policyColor(tool: ToolSelectorItem): string {
  const label = toolPolicyLabel(tool);
  if (label === "built-in blocked") return "error";
  if (label === "built-in limited") return "warning";
  if (label.startsWith("user risk")) return "warning";
  return "dim";
}

function renderToolRow(
  tool: ToolSelectorItem,
  selected: boolean,
  focused: boolean,
  theme: ToolSelectorTheme,
  width: number,
): string {
  if (width < 1) return "";

  const isChecked = selected || isAlwaysOn(tool);
  const checkboxRaw = isChecked ? "[\u2022]" : "[ ]";
  const markerRaw = focused ? "\u25B8" : " ";
  const marker = focused ? theme.fg("accent", markerRaw) : markerRaw;
  const prefixRaw = `${markerRaw} ${checkboxRaw} `;
  const prefixWidth = visibleWidth(prefixRaw);

  const policy = toolPolicyLabel(tool);
  const policyStyled = theme.fg(policyColor(tool), policy);
  const policyWidth = visibleWidth(policy);

  const checkbox = focused ? theme.fg("accent", theme.bold(checkboxRaw)) : checkboxRaw;
  const alignedMinWidth = prefixWidth + LABEL_COLUMN_WIDTH + LAYOUT_GAP.length + MIN_POLICY_WIDTH;

  if (width >= alignedMinWidth) {
    const labelFitted = truncateToWidth(tool.name, LABEL_COLUMN_WIDTH);
    const labelPadded = labelFitted.padEnd(LABEL_COLUMN_WIDTH);
    const label = focused ? theme.fg("accent", theme.bold(labelPadded)) : labelPadded;
    const policyFitted = truncateToWidth(
      policyStyled,
      Math.max(1, width - prefixWidth - LABEL_COLUMN_WIDTH - LAYOUT_GAP.length),
    );
    return `${marker} ${checkbox} ${label}${LAYOUT_GAP}${policyFitted}`;
  }

  const remaining = Math.max(0, width - prefixWidth - policyWidth - 2);
  const nameText = truncateToWidth(tool.name, Math.max(1, remaining));
  const label = focused ? theme.fg("accent", theme.bold(nameText)) : nameText;
  return truncateToWidth(`${marker} ${checkbox} ${label}  ${policyStyled}`, width);
}

export function renderToolSelector(
  state: ToolSelectorState,
  theme: ToolSelectorTheme,
  width: number,
): string[] {
  const lines: string[] = [];
  const pages = totalPages(state);
  const pageLabel = pages > 1 && !state.query ? ` (${state.page + 1}/${pages})` : "";
  const title = `Configure Plan-mode tools${pageLabel}`;

  lines.push(truncateToWidth(theme.fg("accent", theme.bold(title)), width));
  lines.push(truncateToWidth(theme.dim(SUBTITLE), width));
  lines.push("");
  lines.push(truncateToWidth(theme.dim(SEARCH_PLACEHOLDER), width));
  lines.push(truncateToWidth(`\u25B8 ${state.query}`, width));

  const visible = getVisibleTools(state);
  for (let i = 0; i < visible.length; i++) {
    const tool = visible[i];
    const focused = i === state.cursorIndex;
    const selected = state.selectedNames.has(tool.name);
    lines.push(renderToolRow(tool, selected, focused, theme, width));
  }

  if (visible.length === 0 && state.query) {
    lines.push(truncateToWidth(theme.dim("No tools match the search."), width));
  }

  lines.push("");
  lines.push(truncateToWidth(theme.dim(state.query ? HELP_SEARCHING : HELP_BASE), width));

  return lines;
}
```

- [ ] **Step 4: Run render tests**

Run: `npx vitest run tests/tui/tool-selector-render.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/tool-selector-render.ts tests/tui/tool-selector-render.test.ts
git commit -m "feat: add tool selector render function"
```

---

### Task 2: Create tool selector component shell

**Files:** `src/tui/tool-selector.ts`

- [ ] **Step 1: Write the implementation**

Create `src/tui/tool-selector.ts`:

```typescript
import { Key, matchesKey, type Component } from "@earendil-works/pi-tui";
import {
  type ToolSelectorItem,
  type ToolSelectorState,
  initToolSelectorState,
  toolSelectorReducer,
} from "./tool-selector-state.ts";
import { renderToolSelector, type ToolSelectorTheme } from "./tool-selector-render.ts";

export type { ToolSelectorItem } from "./tool-selector-state.ts";

export function createToolSelectorComponent(options: {
  tools: ToolSelectorItem[];
  previousSelections: string[] | undefined;
  theme: ToolSelectorTheme;
  done: (result: string[] | null) => void;
  requestRender: () => void;
}): Component {
  let state: ToolSelectorState = initToolSelectorState(
    options.tools,
    options.previousSelections,
  );

  function dispatch(action: Parameters<typeof toolSelectorReducer>[1]): void {
    const result = toolSelectorReducer(state, action);
    if (result.type === "done") {
      options.done(result.selections);
    } else if (result.state !== state) {
      state = result.state;
      options.requestRender();
    }
  }

  return {
    invalidate(): void {},
    handleInput(data: string): void {
      if (matchesKey(data, Key.escape)) return void dispatch({ type: "cancel" });
      if (matchesKey(data, Key.enter)) return void dispatch({ type: "save" });
      if (matchesKey(data, Key.up)) return void dispatch({ type: "move_up" });
      if (matchesKey(data, Key.down)) return void dispatch({ type: "move_down" });
      if (matchesKey(data, Key.space)) return void dispatch({ type: "toggle" });
      if (matchesKey(data, Key.left)) {
        if (state.query) return void dispatch({ type: "cursor_left" });
        return void dispatch({ type: "prev_page" });
      }
      if (matchesKey(data, Key.right)) {
        if (state.query) return void dispatch({ type: "cursor_right" });
        return void dispatch({ type: "next_page" });
      }
      if (matchesKey(data, Key.backspace))
        return void dispatch({ type: "backspace" });
      if (/^[\x20-\x7E]$/.test(data) && !matchesKey(data, Key.space))
        return void dispatch({ type: "type_char", char: data });
    },
    render(width: number): string[] {
      return renderToolSelector(state, options.theme, width);
    },
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new state + new render).

- [ ] **Step 4: Commit**

```bash
git add src/tui/tool-selector.ts
git commit -m "feat: add tool selector TUI component shell"
```
