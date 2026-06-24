# Phase 5: Tool Selector State Reducer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `custom()` mock to test helpers, then build the pure state reducer for the new tool selector TUI component. This phase is additive — the extension continues working the old way.

**Architecture:** A pure reducer (`tool-selector-state.ts`) with no I/O, no theme, no rendering. State transitions only. Follows the pi-status `editor-state.ts` pattern.

**Tech Stack:** TypeScript (ES2022, strict, Node16 ESM), vitest.

**Spec:** `docs/superpowers/specs/2026-06-24-refactor-commands-and-tool-selector-design.md`

**Verification:** `npx vitest run` — all existing 187 tests pass + new reducer tests pass.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `tests/helpers.ts` | Modify | Add `custom()` mock + `bold()` to theme mock |
| `src/tui/tool-selector-state.ts` | Create | State type, actions, reducer (pure functions) |
| `tests/tui/tool-selector-state.test.ts` | Create | Reducer unit tests |

---

### Task 1: Add `custom()` mock to test helpers

**Files:** `tests/helpers.ts`

- [ ] **Step 1: Add `customCalls` to MockContext interface**

In `tests/helpers.ts`, add `customCalls` field to the `MockContext` interface (after `selectCalls`):

```typescript
export interface MockContext {
  ctx: ExtensionCommandContext;
  statuses: Map<string, string | undefined>;
  notifications: Array<{ message: string; type?: string }>;
  widgets: Map<string, unknown>;
  selectCalls: Array<{ title: string; options: string[] }>;
  customCalls: Array<{ result: unknown }>;
}
```

- [ ] **Step 2: Add `customResult` option and wire `custom()` + `bold()` in createMockContext**

Replace the `createMockContext` function (starting at line 128) with:

```typescript
export function createMockContext(options?: {
  entries?: SessionEntry[];
  hasUI?: boolean;
  isIdle?: boolean;
  selectResponses?: string[];
  customResult?: unknown;
}): MockContext {
  const statuses = new Map<string, string | undefined>();
  const notifications: Array<{ message: string; type?: string }> = [];
  const widgets = new Map<string, unknown>();
  const selectCalls: Array<{ title: string; options: string[] }> = [];
  const customCalls: Array<{ result: unknown }> = [];
  const selectQueue = [...(options?.selectResponses ?? [])];
  const sessionEntries: SessionEntry[] = options?.entries ?? [];

  const mockCtx: MockContext = {
    ctx: {
      ui: {
        setStatus(key: string, value: string | undefined) {
          statuses.set(key, value);
        },
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
        setWidget(key: string, content: unknown) {
          if (content === undefined) {
            widgets.delete(key);
          } else {
            widgets.set(key, content);
          }
        },
        async select(title: string, opts: string[]) {
          selectCalls.push({ title, options: opts });
          return selectQueue.shift();
        },
        async custom(factory: Function) {
          const result = options?.customResult ?? null;
          customCalls.push({ result });
          const noopTheme = {
            fg: (_color: string, text: string) => text,
            bold: (text: string) => text,
          };
          const done = (_r: unknown) => {};
          factory({}, noopTheme, {}, done);
          return result;
        },
        theme: {
          fg(_color: string, text: string) {
            return text;
          },
          bold(text: string) {
            return text;
          },
        },
      },
      hasUI: options?.hasUI ?? true,
      isIdle: () => options?.isIdle ?? true,
      sessionManager: {
        getEntries: () => sessionEntries,
      },
    } as unknown as ExtensionCommandContext,
    statuses,
    notifications,
    widgets,
    selectCalls,
    customCalls,
  };

  return mockCtx;
}
```

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All 187 existing tests pass (no behavior change).

- [ ] **Step 4: Commit**

```bash
git add tests/helpers.ts
git commit -m "test: add custom() and bold() mocks to test helpers"
```

---

### Task 2: Create tool selector state reducer

**Files:** `src/tui/tool-selector-state.ts`, `tests/tui/tool-selector-state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tui/tool-selector-state.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  type ToolSelectorAction,
  type ToolSelectorItem,
  type ToolSelectorResult,
  TOOL_SELECTOR_PAGE_SIZE,
  initToolSelectorState,
  toolSelectorReducer,
  getVisibleTools,
  toolPolicyLabel,
  isToggleable,
} from "../../src/tui/tool-selector-state.ts";

function makeTools(names: string[], source = "extension"): ToolSelectorItem[] {
  return names.map((name) => ({
    name,
    sourceInfo: { source },
  }));
}

function builtinTool(name: string): ToolSelectorItem {
  return { name, sourceInfo: { source: "builtin" } };
}

describe("initToolSelectorState", () => {
  it("creates state with empty selections", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, undefined);
    expect(state.selectedNames.size).toBe(0);
    expect(state.cursorIndex).toBe(0);
    expect(state.page).toBe(0);
    expect(state.query).toBe("");
  });

  it("restores previous selections", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, ["a"]);
    expect(state.selectedNames.has("a")).toBe(true);
    expect(state.selectedNames.has("b")).toBe(false);
  });

  it("sorts built-in tools before extension tools", () => {
    const tools = [
      ...makeTools(["zebra"]),
      builtinTool("read"),
      ...makeTools(["alpha"]),
      builtinTool("bash"),
    ];
    const state = initToolSelectorState(tools, undefined);
    const names = state.tools.map((t) => t.name);
    expect(names.indexOf("bash")).toBeLessThan(names.indexOf("alpha"));
    expect(names.indexOf("read")).toBeLessThan(names.indexOf("zebra"));
  });
});

describe("toolSelectorReducer", () => {
  it("move_down increments cursor", () => {
    const tools = makeTools(["a", "b", "c"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "move_down" });
    expect(result.type).toBe("next");
    if (result.type === "next") expect(result.state.cursorIndex).toBe(1);
  });

  it("move_up decrements cursor", () => {
    const tools = makeTools(["a", "b", "c"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, cursorIndex: 2 };
    const result = toolSelectorReducer(state, { type: "move_up" });
    expect(result.type).toBe("next");
    if (result.type === "next") expect(result.state.cursorIndex).toBe(1);
  });

  it("move_up clamps at 0", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "move_up" });
    if (result.type === "next") expect(result.state.cursorIndex).toBe(0);
  });

  it("move_down clamps at last item", () => {
    const tools = makeTools(["a", "b"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, cursorIndex: 1 };
    const result = toolSelectorReducer(state, { type: "move_down" });
    if (result.type === "next") expect(result.state.cursorIndex).toBe(1);
  });

  it("toggle adds tool to selectedNames", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "toggle" });
    if (result.type === "next") expect(result.state.selectedNames.has("a")).toBe(true);
  });

  it("toggle removes tool from selectedNames", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, ["a"]);
    const result = toolSelectorReducer(state, { type: "toggle" });
    if (result.type === "next") expect(result.state.selectedNames.has("a")).toBe(false);
  });

  it("toggle is no-op for safe builtin tools", () => {
    const tools = [builtinTool("read"), ...makeTools(["a"])];
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "toggle" });
    if (result.type === "next") expect(result.state.selectedNames.has("read")).toBe(false);
  });

  it("toggle is no-op for blocked builtin tools", () => {
    const tools = [builtinTool("edit"), ...makeTools(["a"])];
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "toggle" });
    if (result.type === "next") expect(result.state.selectedNames.has("edit")).toBe(false);
  });

  it("next_page increments page", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "next_page" });
    if (result.type === "next") expect(result.state.page).toBe(1);
  });

  it("next_page clamps at last page", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, page: 1 };
    const result = toolSelectorReducer(state, { type: "next_page" });
    if (result.type === "next") expect(result.state.page).toBe(1);
  });

  it("prev_page decrements page", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, page: 1 };
    const result = toolSelectorReducer(state, { type: "prev_page" });
    if (result.type === "next") expect(result.state.page).toBe(0);
  });

  it("prev_page clamps at 0", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "prev_page" });
    if (result.type === "next") expect(result.state.page).toBe(0);
  });

  it("type_char appends to query", () => {
    const tools = makeTools(["abc", "def"]);
    const state = initToolSelectorState(tools, undefined);
    const r1 = toolSelectorReducer(state, { type: "type_char", char: "a" });
    if (r1.type === "next") {
      expect(r1.state.query).toBe("a");
      expect(r1.state.queryCursor).toBe(1);
    }
  });

  it("backspace removes last character from query", () => {
    const tools = makeTools(["abc", "def"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "ab", queryCursor: 2 };
    const result = toolSelectorReducer(state, { type: "backspace" });
    if (result.type === "next") expect(result.state.query).toBe("a");
  });

  it("backspace is no-op when query is empty", () => {
    const tools = makeTools(["a"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "backspace" });
    if (result.type === "next") expect(result.state.query).toBe("");
  });

  it("search filters visible tools", () => {
    const tools = makeTools(["grep", "find", "my-search"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "search" };
    const visible = getVisibleTools(state);
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe("my-search");
  });

  it("cursor_left moves queryCursor left when searching", () => {
    const tools = makeTools(["a"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "abc", queryCursor: 3 };
    const result = toolSelectorReducer(state, { type: "cursor_left" });
    if (result.type === "next") expect(result.state.queryCursor).toBe(2);
  });

  it("cursor_right moves queryCursor right when searching", () => {
    const tools = makeTools(["a"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "abc", queryCursor: 1 };
    const result = toolSelectorReducer(state, { type: "cursor_right" });
    if (result.type === "next") expect(result.state.queryCursor).toBe(2);
  });

  it("save returns selected non-builtin tool names", () => {
    const tools = [builtinTool("read"), ...makeTools(["a", "b"])];
    const state = initToolSelectorState(tools, ["a"]);
    const result = toolSelectorReducer(state, { type: "save" });
    expect(result.type).toBe("done");
    if (result.type === "done") {
      expect(result.selections).toContain("a");
      expect(result.selections).not.toContain("read");
    }
  });

  it("cancel returns null", () => {
    const tools = makeTools(["a"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "cancel" });
    expect(result.type).toBe("done");
    if (result.type === "done") expect(result.selections).toBeNull();
  });
});

describe("getVisibleTools", () => {
  it("returns all tools when no query and within page", () => {
    const tools = makeTools(["a", "b", "c"]);
    const state = initToolSelectorState(tools, undefined);
    expect(getVisibleTools(state)).toHaveLength(3);
  });

  it("returns page slice when no query", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    const state = initToolSelectorState(tools, undefined);
    const visible = getVisibleTools(state);
    expect(visible).toHaveLength(TOOL_SELECTOR_PAGE_SIZE);
  });

  it("returns filtered tools ignoring pagination when searching", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `tool-${i}`));
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "tool-1", page: 0 };
    const visible = getVisibleTools(state);
    expect(visible.length).toBeLessThan(15);
    expect(visible.every((t) => t.name.includes("tool-1"))).toBe(true);
  });
});

describe("toolPolicyLabel", () => {
  it("returns 'built-in' for safe builtin tools", () => {
    expect(toolPolicyLabel(builtinTool("read"))).toBe("built-in");
    expect(toolPolicyLabel(builtinTool("grep"))).toBe("built-in");
  });

  it("returns 'built-in limited' for bash", () => {
    expect(toolPolicyLabel(builtinTool("bash"))).toBe("built-in limited");
  });

  it("returns 'built-in blocked' for edit and write", () => {
    expect(toolPolicyLabel(builtinTool("edit"))).toBe("built-in blocked");
    expect(toolPolicyLabel(builtinTool("write"))).toBe("built-in blocked");
  });

  it("returns 'user risk: source' for extension tools", () => {
    const tool = makeTools(["x"], "my-ext")[0];
    expect(toolPolicyLabel(tool)).toBe("user risk: my-ext");
  });
});

describe("isToggleable", () => {
  it("returns false for safe builtin tools", () => {
    expect(isToggleable(builtinTool("read"))).toBe(false);
  });

  it("returns false for blocked builtin tools", () => {
    expect(isToggleable(builtinTool("edit"))).toBe(false);
  });

  it("returns true for extension tools", () => {
    expect(isToggleable(makeTools(["x"])[0])).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tui/tool-selector-state.test.ts`
Expected: FAIL — module `../../src/tui/tool-selector-state.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/tui/tool-selector-state.ts`:

```typescript
import {
  BLOCKED_BUILTIN_TOOLS,
  SAFE_BUILTIN_PLAN_TOOLS,
} from "../shared/constants.ts";

export const TOOL_SELECTOR_PAGE_SIZE = 10;

export interface ToolSelectorItem {
  name: string;
  sourceInfo: { source: string };
}

export interface ToolSelectorState {
  tools: ToolSelectorItem[];
  selectedNames: Set<string>;
  cursorIndex: number;
  page: number;
  query: string;
  queryCursor: number;
}

export type ToolSelectorAction =
  | { type: "move_up" }
  | { type: "move_down" }
  | { type: "toggle" }
  | { type: "next_page" }
  | { type: "prev_page" }
  | { type: "type_char"; char: string }
  | { type: "backspace" }
  | { type: "cursor_left" }
  | { type: "cursor_right" }
  | { type: "save" }
  | { type: "cancel" };

export type ToolSelectorResult =
  | { type: "next"; state: ToolSelectorState }
  | { type: "done"; selections: string[] | null };

function isBuiltin(tool: ToolSelectorItem): boolean {
  return tool.sourceInfo.source === "builtin";
}

export function isToggleable(tool: ToolSelectorItem): boolean {
  if (!isBuiltin(tool)) return true;
  if (SAFE_BUILTIN_PLAN_TOOLS.has(tool.name)) return false;
  if (BLOCKED_BUILTIN_TOOLS.has(tool.name)) return false;
  return true;
}

export function toolPolicyLabel(tool: ToolSelectorItem): string {
  if (isBuiltin(tool)) {
    if (BLOCKED_BUILTIN_TOOLS.has(tool.name)) return "built-in blocked";
    if (tool.name === "bash") return "built-in limited";
    return "built-in";
  }
  return `user risk: ${tool.sourceInfo.source}`;
}

function compareTools(a: ToolSelectorItem, b: ToolSelectorItem): number {
  const aBuiltin = isBuiltin(a);
  const bBuiltin = isBuiltin(b);
  if (aBuiltin !== bBuiltin) return aBuiltin ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function initToolSelectorState(
  tools: ToolSelectorItem[],
  previousSelections: string[] | undefined,
): ToolSelectorState {
  return {
    tools: [...tools].sort(compareTools),
    selectedNames: new Set(previousSelections ?? []),
    cursorIndex: 0,
    page: 0,
    query: "",
    queryCursor: 0,
  };
}

function matchesQuery(tool: ToolSelectorItem, query: string): boolean {
  if (!query) return true;
  return tool.name.toLowerCase().includes(query.toLowerCase());
}

export function getVisibleTools(state: ToolSelectorState): ToolSelectorItem[] {
  if (state.query) {
    return state.tools.filter((t) => matchesQuery(t, state.query));
  }
  const start = state.page * TOOL_SELECTOR_PAGE_SIZE;
  return state.tools.slice(start, start + TOOL_SELECTOR_PAGE_SIZE);
}

export function totalPages(state: ToolSelectorState): number {
  return Math.max(1, Math.ceil(state.tools.length / TOOL_SELECTOR_PAGE_SIZE));
}

function clampCursor(state: ToolSelectorState, index: number): number {
  const visible = getVisibleTools(state);
  if (visible.length === 0) return 0;
  return Math.max(0, Math.min(index, visible.length - 1));
}

export function isAlwaysOn(tool: ToolSelectorItem): boolean {
  return isBuiltin(tool) && SAFE_BUILTIN_PLAN_TOOLS.has(tool.name);
}

export function toolSelectorReducer(
  state: ToolSelectorState,
  action: ToolSelectorAction,
): ToolSelectorResult {
  switch (action.type) {
    case "cancel":
      return { type: "done", selections: null };

    case "save": {
      const names = [...state.selectedNames].filter(
        (name) => !SAFE_BUILTIN_PLAN_TOOLS.has(name),
      );
      return { type: "done", selections: names };
    }

    case "move_up":
      return {
        type: "next",
        state: { ...state, cursorIndex: clampCursor(state, state.cursorIndex - 1) },
      };

    case "move_down":
      return {
        type: "next",
        state: { ...state, cursorIndex: clampCursor(state, state.cursorIndex + 1) },
      };

    case "toggle": {
      const visible = getVisibleTools(state);
      const tool = visible[clampCursor(state, state.cursorIndex)];
      if (!tool || !isToggleable(tool)) return { type: "next", state };
      const next = new Set(state.selectedNames);
      if (next.has(tool.name)) next.delete(tool.name);
      else next.add(tool.name);
      return { type: "next", state: { ...state, selectedNames: next } };
    }

    case "next_page": {
      if (state.query) return { type: "next", state };
      const maxPage = totalPages(state) - 1;
      const nextPage = Math.min(state.page + 1, maxPage);
      return {
        type: "next",
        state: { ...state, page: nextPage, cursorIndex: 0 },
      };
    }

    case "prev_page": {
      if (state.query) return { type: "next", state };
      const prevPage = Math.max(state.page - 1, 0);
      return {
        type: "next",
        state: { ...state, page: prevPage, cursorIndex: 0 },
      };
    }

    case "type_char": {
      const query = state.query.slice(0, state.queryCursor) +
        action.char +
        state.query.slice(state.queryCursor);
      const queryCursor = state.queryCursor + 1;
      const newState = { ...state, query, queryCursor };
      return {
        type: "next",
        state: { ...newState, cursorIndex: clampCursor(newState, state.cursorIndex) },
      };
    }

    case "backspace": {
      if (state.queryCursor === 0) return { type: "next", state };
      const query = state.query.slice(0, state.queryCursor - 1) +
        state.query.slice(state.queryCursor);
      const queryCursor = state.queryCursor - 1;
      const newState = { ...state, query, queryCursor };
      return {
        type: "next",
        state: { ...newState, cursorIndex: clampCursor(newState, state.cursorIndex) },
      };
    }

    case "cursor_left":
      return {
        type: "next",
        state: { ...state, queryCursor: Math.max(0, state.queryCursor - 1) },
      };

    case "cursor_right":
      return {
        type: "next",
        state: { ...state, queryCursor: Math.min(state.query.length, state.queryCursor + 1) },
      };
  }
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All existing 187 tests pass + new reducer tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tui/tool-selector-state.ts tests/tui/tool-selector-state.test.ts
git commit -m "feat: add tool selector state reducer

Adds the pure state machine for the new custom TUI tool selector.
No changes to existing extension behavior."
```
