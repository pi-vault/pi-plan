# Phase 4: `/plan tools` Selector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginated tool selector allowing users to enable/disable extension and custom tools during plan mode.

**Architecture:** Tool selection logic in `core/tools.ts` merges user selections with safe defaults. The selector UI in `tui/menus.ts` uses the existing `ctx.ui.select(title, options)` API with a label-to-value map for each page. Selections are persisted in `state.selectedToolNames` and applied via `activatePlanModeTools` in `index.ts`.

**Tech Stack:** TypeScript (ESM, Node16 module resolution, `.ts` extensions), Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-06-22-pi-plan-design.md`

**Depends on:** Phases 1-3 (all merged to master)

**Key constraints:**
- The SDK's `ctx.ui.select` signature is `select(title: string, options: string[]): Promise<string | undefined>` — the selector must use this API, not an object-based variant.
- All Phase 3 bug fixes must be preserved: `pendingMenuTimer`/`clearPendingMenu()` (double-menu race), `.catch(() => {})` (unhandled rejection), `updateUi(ctx)` in `before_agent_start`.
- `PLAN_MENU_LABELS`, `LABEL_TO_ACTION`, and `resolveAction` in `menus.ts` must be preserved — existing tests depend on them.

---

### Task 1: Add constant and update test helpers

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Add TOOL_SELECTOR_PAGE_SIZE to constants**

Open `src/shared/constants.ts` and add after the existing `WIDGET_KEY` line:

```typescript
export const TOOL_SELECTOR_PAGE_SIZE = 10;
```

(All other constants remain unchanged.)

- [ ] **Step 2: Add `allTools` support to MockPi in `tests/helpers.ts`**

Add a `ToolInfoLike` interface before `MockPi`:

```typescript
export interface ToolInfoLike {
  name: string;
  description?: string;
  sourceInfo: { source: string };
}
```

Add `allTools` to the `MockPi` interface:

```typescript
export interface MockPi {
  // ... existing fields ...
  allTools: ToolInfoLike[];
  // ... existing fireEvent ...
}
```

Update `createMockPi` to accept and expose `allTools`:

```typescript
export function createMockPi(options?: {
  activeTools?: string[];
  allTools?: ToolInfoLike[];
}): MockPi {
```

Inside the factory, after the existing `userMessages` array:

```typescript
  const allTools: ToolInfoLike[] = options?.allTools ?? [];
```

Add `getAllTools()` to the mock `pi` object (after `sendUserMessage`):

```typescript
      getAllTools() {
        return [...allTools];
      },
```

Add `allTools` to the returned `mock` object:

```typescript
    allTools,
```

- [ ] **Step 3: Run existing tests to verify nothing is broken**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS (169 tests)

- [ ] **Step 4: Commit**

```bash
git add src/shared/constants.ts tests/helpers.ts
git commit -m "feat: add TOOL_SELECTOR_PAGE_SIZE and allTools to test helpers"
```

---

### Task 2: planModeToolNamesWithSelections (TDD)

**Files:**
- Modify: `src/core/tools.ts`
- Modify: `tests/core/tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/tools.test.ts`:

```typescript
import { planModeToolNamesWithSelections } from "../../src/core/tools.ts";

describe("planModeToolNamesWithSelections", () => {
  it("returns default plan mode tools when selectedToolNames is undefined", () => {
    const tools = planModeToolNamesWithSelections(undefined);
    expect(tools).toContain("read");
    expect(tools).toContain("bash");
    expect(tools).toContain("grep");
    expect(tools).toContain("find");
    expect(tools).toContain("ls");
    expect(tools).not.toContain("edit");
    expect(tools).not.toContain("write");
  });

  it("merges safe defaults with user selections", () => {
    const tools = planModeToolNamesWithSelections(["my-search-tool"]);
    expect(tools).toContain("read");
    expect(tools).toContain("bash");
    expect(tools).toContain("my-search-tool");
  });

  it("deduplicates tools", () => {
    const tools = planModeToolNamesWithSelections(["read", "my-tool"]);
    const readCount = tools.filter((t) => t === "read").length;
    expect(readCount).toBe(1);
    expect(tools).toContain("my-tool");
  });

  it("returns only defaults when selections is empty array", () => {
    const tools = planModeToolNamesWithSelections([]);
    expect(tools).toContain("read");
    expect(tools).toContain("bash");
    expect(tools.length).toBe(5); // 5 SAFE_BUILTIN_PLAN_TOOLS
  });
});
```

Update the import at the top of the file to include `planModeToolNamesWithSelections`:

```typescript
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
  planModeToolNamesWithSelections,
} from "../../src/core/tools.ts";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL — `planModeToolNamesWithSelections` not found

- [ ] **Step 3: Implement `planModeToolNamesWithSelections` in `src/core/tools.ts`**

Append to `src/core/tools.ts`:

```typescript
export function planModeToolNamesWithSelections(
  selectedToolNames: string[] | undefined,
): string[] {
  if (selectedToolNames === undefined) {
    return defaultPlanModeToolNames();
  }
  const merged = new Set([...SAFE_BUILTIN_PLAN_TOOLS, ...selectedToolNames]);
  return [...merged];
}
```

Also fix `normalModeToolNames` to return a copy instead of the original reference (prevents mutation leaks):

```diff
- return previousTools && previousTools.length > 0
-   ? previousTools
-   : [...DEFAULT_TOOLS];
+ return previousTools && previousTools.length > 0
+   ? [...previousTools]
+   : [...DEFAULT_TOOLS];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/tools.ts tests/core/tools.test.ts
git commit -m "feat: add planModeToolNamesWithSelections"
```

---

### Task 3: showToolSelector and menu update (TDD)

**Files:**
- Modify: `src/tui/menus.ts`
- Modify: `tests/tui/menus.test.ts`

The tool selector uses the existing `ctx.ui.select(title, options)` API. Each page renders tool labels with status suffixes (`[always on]`, `[enabled]`, `[disabled]`). A `labelToAction` map resolves the selected label back to a tool name or control action. The selector loops until the user selects "Done" or cancels.

- [ ] **Step 1: Add "Configure tools" to showPlanMenu**

In `src/tui/menus.ts`, inside `showPlanMenu`, add the tools option before stay/exit:

```typescript
  options.push(PLAN_MENU_LABELS.tools);
  options.push(PLAN_MENU_LABELS.stay);
  options.push(PLAN_MENU_LABELS.exit);
```

(Replace the existing two pushes for stay and exit.)

- [ ] **Step 2: Write the failing tests for showToolSelector**

Append to `tests/tui/menus.test.ts`:

```typescript
import {
  showToolSelector,
  TOOL_SELECTOR_LABELS,
} from "../../src/tui/menus.ts";
import type { ToolInfoLike } from "../helpers.ts";

function makeTools(names: string[], source = "extension"): ToolInfoLike[] {
  return names.map((name) => ({
    name,
    description: `${name} tool`,
    sourceInfo: { source },
  }));
}

describe("showToolSelector", () => {
  it("returns undefined when user immediately selects Done with no changes", async () => {
    const tools = makeTools(["my-tool"]);
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.done],
    });

    const result = await showToolSelector(ctx.ctx, tools, state);
    expect(result).toBeUndefined();
  });

  it("returns selected tool names when user toggles a tool and selects Done", async () => {
    const tools = makeTools(["my-tool", "other-tool"]);
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [
        "my-tool (extension) [disabled]",
        TOOL_SELECTOR_LABELS.done,
      ],
    });

    const result = await showToolSelector(ctx.ctx, tools, state);
    expect(result).toBeDefined();
    expect(result).toContain("my-tool");
    expect(result).not.toContain("other-tool");
  });

  it("excludes blocked built-in tools from selector options", async () => {
    const tools = [
      { name: "edit", description: "Edit files", sourceInfo: { source: "builtin" } },
      { name: "write", description: "Write files", sourceInfo: { source: "builtin" } },
      { name: "my-tool", description: "My tool", sourceInfo: { source: "extension" } },
    ];
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.done],
    });

    await showToolSelector(ctx.ctx, tools, state);

    const allOptions = ctx.selectCalls.flatMap((call) => call.options);
    expect(allOptions.some((o) => o.startsWith("edit "))).toBe(false);
    expect(allOptions.some((o) => o.startsWith("write "))).toBe(false);
    expect(allOptions.some((o) => o.startsWith("my-tool "))).toBe(true);
  });

  it("shows pagination when there are more tools than page size", async () => {
    const tools = makeTools(
      Array.from({ length: 11 }, (_, i) => `tool-${i}`),
    );
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.next, TOOL_SELECTOR_LABELS.done],
    });

    await showToolSelector(ctx.ctx, tools, state);

    const firstPageOptions = ctx.selectCalls[0].options;
    expect(firstPageOptions).toContain(TOOL_SELECTOR_LABELS.next);
    expect(firstPageOptions).not.toContain(TOOL_SELECTOR_LABELS.prev);
  });

  it("persists toggled state across pages", async () => {
    const tools = makeTools(
      Array.from({ length: 11 }, (_, i) => `tool-${i}`),
    );
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [
        "tool-0 (extension) [disabled]",
        TOOL_SELECTOR_LABELS.next,
        TOOL_SELECTOR_LABELS.done,
      ],
    });

    const result = await showToolSelector(ctx.ctx, tools, state);
    expect(result).toBeDefined();
    expect(result).toContain("tool-0");
    expect(result).not.toContain("tool-10");
  });

  it("shows always-on label for safe builtin tools", async () => {
    const tools = [
      { name: "read", description: "Read files", sourceInfo: { source: "builtin" } },
      { name: "my-tool", description: "My tool", sourceInfo: { source: "extension" } },
    ];
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.done],
    });

    await showToolSelector(ctx.ctx, tools, state);

    const options = ctx.selectCalls[0].options;
    expect(options.some((o) => o.includes("read") && o.includes("[always on]"))).toBe(true);
  });

  it("returns undefined for empty tool list", async () => {
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({ selectResponses: [] });

    const result = await showToolSelector(ctx.ctx, [], state);
    expect(result).toBeUndefined();
  });
});

describe("showPlanMenu with tools option", () => {
  it("includes Configure tools option", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true };
    await showPlanMenu(ctx.ctx, state);
    const options = ctx.selectCalls[0].options;
    expect(options).toContain(PLAN_MENU_LABELS.tools);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL — `showToolSelector` and `TOOL_SELECTOR_LABELS` not found

- [ ] **Step 4: Implement `showToolSelector` in `src/tui/menus.ts`**

Add the following imports at the top of `src/tui/menus.ts` (after the existing imports):

```typescript
import {
  BLOCKED_BUILTIN_TOOLS,
  SAFE_BUILTIN_PLAN_TOOLS,
  TOOL_SELECTOR_PAGE_SIZE,
} from "../shared/constants.ts";
```

Add the exported labels constant (after `PLAN_MENU_LABELS`):

```typescript
export const TOOL_SELECTOR_LABELS = {
  next: "Next page ->",
  prev: "<- Previous page",
  done: "Done",
} as const;
```

Add an internal interface and the `showToolSelector` function at the end of the file:

```typescript
interface ToolSelectorItem {
  name: string;
  sourceInfo: { source: string };
}

/**
 * Paginated tool selector. Returns the array of non-builtin tool names the user
 * wants enabled, or undefined if the user made no changes or cancelled.
 */
export async function showToolSelector(
  ctx: ExtensionContext,
  allTools: ToolSelectorItem[],
  state: PlanModeState,
): Promise<string[] | undefined> {
  const selectableTools = allTools.filter(
    (t) => !BLOCKED_BUILTIN_TOOLS.has(t.name),
  );

  if (selectableTools.length === 0) return undefined;

  const selected = new Set<string>(state.selectedToolNames ?? []);
  const initialSnapshot = new Set<string>(selected);

  let page = 0;
  const pageSize = TOOL_SELECTOR_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(selectableTools.length / pageSize));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const start = page * pageSize;
    const pageTools = selectableTools.slice(start, start + pageSize);
    const labelToAction = new Map<string, string>();
    const options: string[] = [];

    for (const tool of pageTools) {
      const isAlwaysOn = SAFE_BUILTIN_PLAN_TOOLS.has(tool.name);
      const source =
        tool.sourceInfo.source === "builtin"
          ? "built-in"
          : tool.sourceInfo.source;
      const suffix = isAlwaysOn
        ? " [always on]"
        : selected.has(tool.name)
          ? " [enabled]"
          : " [disabled]";
      const label = `${tool.name} (${source})${suffix}`;
      options.push(label);
      labelToAction.set(label, isAlwaysOn ? "__noop__" : tool.name);
    }

    if (totalPages > 1 && page < totalPages - 1) {
      options.push(TOOL_SELECTOR_LABELS.next);
    }
    if (page > 0) {
      options.push(TOOL_SELECTOR_LABELS.prev);
    }
    options.push(TOOL_SELECTOR_LABELS.done);

    const pageLabel =
      totalPages > 1 ? ` (page ${page + 1}/${totalPages})` : "";
    const choice = await ctx.ui.select(
      `Configure Plan-mode tools${pageLabel}`,
      options,
    );

    if (!choice || choice === TOOL_SELECTOR_LABELS.done) break;
    if (choice === TOOL_SELECTOR_LABELS.next) {
      page = Math.min(page + 1, totalPages - 1);
      continue;
    }
    if (choice === TOOL_SELECTOR_LABELS.prev) {
      page = Math.max(page - 1, 0);
      continue;
    }

    const action = labelToAction.get(choice);
    if (!action || action === "__noop__") continue;

    if (selected.has(action)) {
      selected.delete(action);
    } else {
      selected.add(action);
    }
  }

  const unchanged =
    selected.size === initialSnapshot.size &&
    [...selected].every((t) => initialSnapshot.has(t));
  if (unchanged) return undefined;

  return [...selected].filter((name) => !SAFE_BUILTIN_PLAN_TOOLS.has(name));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/tui/menus.ts tests/tui/menus.test.ts
git commit -m "feat: add showToolSelector and tools option to plan menu"
```

---

### Task 4: Wire tool selector in index.ts

**Files:**
- Modify: `src/index.ts`

This task makes four surgical changes. All Phase 3 code (`pendingMenuTimer`, `clearPendingMenu`, `.catch(() => {})`, `updateUi(ctx)` in `before_agent_start`) is preserved.

- [ ] **Step 1: Update imports**

Replace the tools import:

```diff
- import { defaultPlanModeToolNames, normalModeToolNames } from "./core/tools.ts";
+ import { normalModeToolNames, planModeToolNamesWithSelections } from "./core/tools.ts";
```

Add `showToolSelector` to the menus import:

```diff
- import { showPlanMenu, showPlanReadyMenu, type PlanMenuAction } from "./tui/menus.ts";
+ import { showPlanMenu, showPlanReadyMenu, showToolSelector, type PlanMenuAction } from "./tui/menus.ts";
```

- [ ] **Step 2: Update `activatePlanModeTools`**

Replace:

```typescript
  function activatePlanModeTools(): void {
    if (previousTools === undefined) {
      previousTools = pi.getActiveTools();
    }
    pi.setActiveTools(defaultPlanModeToolNames());
  }
```

With:

```typescript
  function activatePlanModeTools(): void {
    if (previousTools === undefined) {
      previousTools = pi.getActiveTools();
    }
    pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames));
  }
```

- [ ] **Step 3: Add `runToolSelector` helper**

Add after `sendPlanModeMessage`:

```typescript
  async function runToolSelector(ctx: ExtensionContext): Promise<void> {
    const allTools = pi.getAllTools();
    const selections = await showToolSelector(ctx, allTools, state);
    if (selections === undefined) {
      ctx.ui.notify("No changes to Plan-mode tools.", "info");
      return;
    }
    state = { ...state, selectedToolNames: selections };
    activatePlanModeTools();
    persist();
    const count = selections.length;
    const msg =
      count === 0
        ? "Plan-mode tools reset to defaults."
        : `Plan-mode tools updated: ${count} extension tool(s) enabled.`;
    ctx.ui.notify(msg, "info");
  }
```

- [ ] **Step 4: Update `handleMenuAction` tools case**

Replace:

```typescript
      case "tools":
        // Phase 4: show tool selector
        ctx.ui.notify("Tool selector not yet available.", "info");
        break;
```

With:

```typescript
      case "tools":
        await runToolSelector(ctx);
        break;
```

- [ ] **Step 5: Update `/plan tools` command handler**

Replace:

```typescript
      if (lower === "tools") {
        if (!state.enabled) {
          doEnter(ctx);
          ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
        }
        // Phase 4: show tool selector
        ctx.ui.notify("Tool selector not yet available.", "info");
        return;
      }
```

With:

```typescript
      if (lower === "tools") {
        if (!state.enabled) {
          doEnter(ctx);
          ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
        }
        await runToolSelector(ctx);
        return;
      }
```

- [ ] **Step 6: Update `before_agent_start` to use selection-aware tools**

Replace the single line inside `before_agent_start`:

```diff
-     pi.setActiveTools(defaultPlanModeToolNames());
+     pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames));
```

(Keep all surrounding code: `updateUi(ctx)`, state reset, systemPrompt return — all unchanged.)

- [ ] **Step 7: Run tests**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire tool selector into plan mode"
```

---

### Task 5: Integration tests for Phase 4

**Files:**
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Append Phase 4 integration tests**

Add at the end of `tests/index.test.ts`:

```typescript
import { TOOL_SELECTOR_LABELS } from "../src/tui/menus.ts";

describe("/plan tools", () => {
  it("opens tool selector and applies selections", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
      allTools: [
        { name: "read", description: "Read files", sourceInfo: { source: "builtin" } },
        { name: "bash", description: "Run bash", sourceInfo: { source: "builtin" } },
        { name: "edit", description: "Edit files", sourceInfo: { source: "builtin" } },
        { name: "write", description: "Write files", sourceInfo: { source: "builtin" } },
        { name: "my-search", description: "Search tool", sourceInfo: { source: "my-extension" } },
      ],
    });
    createExtension(mock.pi);

    // Enter plan mode first
    const ctx1 = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx1.ctx);

    // Run /plan tools — toggle my-search on, then Done
    const ctx2 = createMockContext({
      selectResponses: [
        "my-search (my-extension) [disabled]",
        TOOL_SELECTOR_LABELS.done,
      ],
    });
    await mock.commands.get("plan")!.handler("tools", ctx2.ctx);

    expect(mock.activeTools).toContain("my-search");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).toContain("bash");
    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
  });

  it("enters plan mode when running /plan tools while not in plan mode", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.done],
    });

    await mock.commands.get("plan")!.handler("tools", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
  });

  it("tools action from plan menu calls tool selector", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);

    // Enter plan mode
    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS.tools, TOOL_SELECTOR_LABELS.done],
    });
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    // Run /plan again (shows menu) -> select "Configure tools" -> selector opens -> Done
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    // Two select calls: one for plan menu, one for tool selector
    expect(ctx.selectCalls).toHaveLength(2);
  });

  it("preserves selected tools across before_agent_start", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
      allTools: [
        { name: "my-search", description: "Search", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);

    // Enter plan mode and configure tools
    const ctx = createMockContext({
      selectResponses: [
        "my-search (my-ext) [disabled]",
        TOOL_SELECTOR_LABELS.done,
      ],
    });
    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan")!.handler("tools", ctx.ctx);

    expect(mock.activeTools).toContain("my-search");

    // Simulate another extension modifying tools between turns
    mock.pi.setActiveTools(["read", "bash", "edit", "write"]);

    // before_agent_start should re-apply plan-mode tools WITH selections
    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "" },
      ctx,
    );

    expect(mock.activeTools).toContain("my-search");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("selectedToolNames persists across session restore", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);

    // Enter plan mode and configure tools
    const ctx = createMockContext({
      selectResponses: [
        "my-tool (my-ext) [disabled]",
        TOOL_SELECTOR_LABELS.done,
      ],
    });
    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan")!.handler("tools", ctx.ctx);

    // Check persisted state includes selectedToolNames
    const persistedEntries = mock.entries.filter(
      (e) => e.customType === "plan-mode-state",
    );
    expect(persistedEntries.length).toBeGreaterThan(0);

    const lastEntry = persistedEntries[persistedEntries.length - 1];
    const persistedState = lastEntry.data as { selectedToolNames?: string[] };
    expect(persistedState.selectedToolNames).toContain("my-tool");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/index.test.ts
git commit -m "test: add Phase 4 integration tests"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full check suite**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm check`

This runs `biome lint . && tsc --noEmit && vitest run`. All three must pass.

- [ ] **Step 2: Fix any lint or type errors**

If biome reports formatting issues: `pnpm format`
If biome reports lint issues: fix manually.
If tsc reports type errors: fix in the relevant file.
Re-run `pnpm check` after each fix.

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve lint and type issues"
```

(Skip if Step 1 passed clean.)

- [ ] **Step 4: Verify the final file structure**

Run: `find src tests -type f -name '*.ts' | sort`

Expected output:
```
src/core/context.ts
src/core/prompt.ts
src/core/safety.ts
src/core/state.ts
src/core/tools.ts
src/index.ts
src/shared/constants.ts
src/shared/types.ts
src/tui/menus.ts
src/tui/status.ts
src/tui/widgets.ts
tests/core/context.test.ts
tests/core/prompt.test.ts
tests/core/safety.test.ts
tests/core/state.test.ts
tests/core/tools.test.ts
tests/helpers.ts
tests/index.test.ts
tests/tui/menus.test.ts
tests/tui/status.test.ts
tests/tui/widgets.test.ts
```

- [ ] **Step 5: Confirm all four phases produce a coherent feature**

Review the arc:
- Phase 1: toggle with safety enforcement
- Phase 2: agent knows it's in plan mode; extension detects `<proposed_plan>` blocks
- Phase 3: full plan lifecycle with menus and `/plan <prompt>`
- Phase 4: user can configure which extension tools are available during plan mode

If all tests pass and the file structure matches, Phase 4 and the full feature are complete.
