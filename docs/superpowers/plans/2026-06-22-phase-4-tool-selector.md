# Phase 4: `/plan tools` Selector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginated tool selector allowing users to enable/disable extension and custom tools during plan mode.

**Architecture:** Tool selection logic in `core/tools.ts` merges user selections with safe defaults. The selector UI in `tui/menus.ts` uses paginated `ctx.ui.select` calls. Selections are persisted in `state.selectedToolNames` and applied via `activatePlanModeTools` in `index.ts`.

**Tech Stack:** TypeScript (ESM, Node16 module resolution, `.ts` extensions), Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-06-22-pi-plan-design.md`

**Depends on:** Phases 1-3 (`docs/plans/2026-06-22-phase-1-plan-mode-toggle.md`, `docs/plans/2026-06-22-phase-2-prompt-and-detection.md`, `docs/plans/2026-06-22-phase-3-menus-and-subcommands.md`)

---

### Task 1: Add constant and update test helpers

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Add TOOL_SELECTOR_PAGE_SIZE to constants**

Open `src/shared/constants.ts` and add:

```typescript
export const STATE_ENTRY_TYPE = "plan-mode-state";
export const STATUS_KEY = "pi-plan";
export const WIDGET_KEY = "pi-plan";
export const TOOL_SELECTOR_PAGE_SIZE = 10;

export const SAFE_BUILTIN_PLAN_TOOLS = new Set(["read", "bash", "grep", "find", "ls"]);
export const BLOCKED_BUILTIN_TOOLS = new Set(["edit", "write"]);
export const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

export const MUTATING_BASH_PATTERNS: RegExp[] = [
  /^\s*(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|ln)\b/,
  /^\s*(git\s+(commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]))\b/,
  />\s*\S/,
  /\|\s*(xargs|tee)\b/,
  /^\s*(npm|pnpm|yarn)\s+(install|add|remove|run\b(?!\s+test|\s+lint|\s+check|\s+build))\b/,
  /^\s*(pip|pip3)\s+(install|uninstall)\b/,
  /^\s*(brew)\s+(install|uninstall|upgrade)\b/,
];

export const SAFE_BASH_PATTERNS: RegExp[] = [
  /^\s*(cat|head|tail|less|more|wc|echo|printf)\b/,
  /^\s*(ls|find|fd|rg|grep|awk|sed|cut|sort|uniq|tr|diff|file|stat|du|df)\b/,
  /^\s*(git\s+(status|log|diff|show|branch|remote|stash\s+list))\b/,
  /^\s*(node|ts-node|tsx)\s+--?(version|help)\b/,
  /^\s*(npm|pnpm|yarn)\s+(list|ls|info|outdated|run\s+(test|lint|check|build))\b/,
  /^\s*(which|type|command|whereis|env|printenv|pwd|date|whoami|hostname)\b/,
];
```

(The mutating and safe patterns should already exist from Phase 1; add only `TOOL_SELECTOR_PAGE_SIZE` if constants already has the patterns.)

- [ ] **Step 2: Add `allTools` support to MockPi in `tests/helpers.ts`**

Add a `ToolInfoLike` interface and update `createMockPi` to accept and expose `allTools`:

Replace the `createMockPi` function signature and factory:

```typescript
interface ToolInfoLike {
  name: string;
  description?: string;
  sourceInfo: { source: string };
}

export interface MockPi {
  pi: ExtensionAPI;
  flags: Map<string, RegisteredFlag>;
  flagValues: Map<string, boolean | string>;
  commands: Map<string, RegisteredCommand>;
  events: Map<string, EventHandler[]>;
  activeTools: string[];
  entries: Array<{ customType: string; data: unknown }>;
  messages: Array<{ message: unknown; options: unknown }>;
  userMessages: Array<{ content: unknown; options: unknown }>;
  allTools: ToolInfoLike[];
  fireEvent(name: string, event: unknown, ctx: MockContext): Promise<unknown>;
}

export function createMockPi(options?: {
  activeTools?: string[];
  allTools?: ToolInfoLike[];
}): MockPi {
  const flags = new Map<string, RegisteredFlag>();
  const flagValues = new Map<string, boolean | string>();
  const commands = new Map<string, RegisteredCommand>();
  const events = new Map<string, EventHandler[]>();
  let activeTools = options?.activeTools ?? ["read", "bash", "edit", "write"];
  const entries: Array<{ customType: string; data: unknown }> = [];
  const messages: Array<{ message: unknown; options: unknown }> = [];
  const userMessages: Array<{ content: unknown; options: unknown }> = [];
  let allTools: ToolInfoLike[] = options?.allTools ?? [];

  const mock: MockPi = {
    pi: {
      registerFlag(name: string, opts: RegisteredFlag) {
        flags.set(name, opts);
        if (opts.default !== undefined) flagValues.set(name, opts.default);
      },
      registerCommand(name: string, opts: RegisteredCommand) {
        commands.set(name, opts);
      },
      on(event: string, handler: EventHandler) {
        const handlers = events.get(event) ?? [];
        handlers.push(handler);
        events.set(event, handlers);
      },
      getFlag(name: string) {
        return flagValues.get(name);
      },
      getActiveTools() {
        return [...activeTools];
      },
      setActiveTools(toolNames: string[]) {
        activeTools = [...toolNames];
        mock.activeTools = activeTools;
      },
      appendEntry(customType: string, data: unknown) {
        entries.push({ customType, data });
      },
      sendMessage(message: unknown, opts: unknown) {
        messages.push({ message, options: opts });
      },
      sendUserMessage(content: unknown, opts: unknown) {
        userMessages.push({ content, options: opts });
      },
      getAllTools() {
        return [...allTools];
      },
    } as unknown as ExtensionAPI,
    flags,
    flagValues,
    commands,
    events,
    get activeTools() {
      return activeTools;
    },
    set activeTools(tools: string[]) {
      activeTools = tools;
    },
    entries,
    messages,
    userMessages,
    get allTools() {
      return allTools;
    },
    set allTools(tools: ToolInfoLike[]) {
      allTools = tools;
    },
    async fireEvent(name: string, event: unknown, mockCtx: MockContext) {
      const handlers = events.get(name) ?? [];
      let result: unknown;
      for (const handler of handlers) {
        result = await handler(event, mockCtx.ctx);
      }
      return result;
    },
  };

  return mock;
}
```

- [ ] **Step 3: Run existing tests to verify nothing is broken**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

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

Add to `tests/core/tools.test.ts`:

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

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- `planModeToolNamesWithSelections` not found

- [ ] **Step 3: Implement `planModeToolNamesWithSelections` in `src/core/tools.ts`**

Replace the full file:

```typescript
import { DEFAULT_TOOLS, SAFE_BUILTIN_PLAN_TOOLS } from "../shared/constants.ts";

export function defaultPlanModeToolNames(): string[] {
  return [...SAFE_BUILTIN_PLAN_TOOLS];
}

export function normalModeToolNames(previousTools: string[] | undefined): string[] {
  return previousTools && previousTools.length > 0 ? [...previousTools] : [...DEFAULT_TOOLS];
}

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/tools.ts tests/core/tools.test.ts
git commit -m "feat: add planModeToolNamesWithSelections"
```

---

### Task 3: showToolSelector (TDD)

**Files:**
- Modify: `src/tui/menus.ts`
- Modify: `tests/tui/menus.test.ts`

The tool selector is paginated. It loops through pages, showing a batch of tools plus navigation items ("Next page", "Previous page", "Done"). The user toggles selections one at a time, then selects "Done" to confirm.

- [ ] **Step 1: Write the failing tests**

Add to `tests/tui/menus.test.ts`:

```typescript
import { showToolSelector } from "../../src/tui/menus.ts";
import { createInitialState } from "../../src/core/state.ts";

type ToolInfoLike = { name: string; description?: string; sourceInfo: { source: string } };

function makeTools(names: string[], source = "extension"): ToolInfoLike[] {
  return names.map((name) => ({ name, description: `${name} tool`, sourceInfo: { source } }));
}

describe("showToolSelector", () => {
  it("returns undefined when user immediately selects Done with no changes", async () => {
    const tools = makeTools(["my-tool"]);
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({ selectResponses: ["__done__"] });

    const result = await showToolSelector(ctx.ctx, tools, state);
    expect(result).toBeUndefined();
  });

  it("returns selected tool names when user toggles a tool and selects Done", async () => {
    const tools = makeTools(["my-tool", "other-tool"]);
    const state = { ...createInitialState(), enabled: true };
    // First select "my-tool" to toggle it on, then select "__done__"
    const ctx = createMockContext({ selectResponses: ["my-tool", "__done__"] });

    const result = await showToolSelector(ctx.ctx, tools, state);
    expect(result).toBeDefined();
    expect(result).toContain("my-tool");
    expect(result).not.toContain("other-tool");
  });

  it("excludes blocked built-in tools from selector items", async () => {
    const tools = [
      { name: "edit", description: "Edit files", sourceInfo: { source: "builtin" } },
      { name: "write", description: "Write files", sourceInfo: { source: "builtin" } },
      { name: "my-tool", description: "My tool", sourceInfo: { source: "extension" } },
    ];
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({ selectResponses: ["__done__"] });

    await showToolSelector(ctx.ctx, tools, state);

    // edit and write should not appear as selectable items
    const allItemValues = ctx.selectCalls.flatMap((call) =>
      (call.items as Array<{ value: string }>).map((i) => i.value),
    );
    expect(allItemValues).not.toContain("edit");
    expect(allItemValues).not.toContain("write");
    expect(allItemValues).toContain("my-tool");
  });

  it("shows pagination when there are more tools than page size", async () => {
    // Create 11 tools (more than default page size of 10)
    const tools = makeTools(
      Array.from({ length: 11 }, (_, i) => `tool-${i}`),
      "extension",
    );
    const state = { ...createInitialState(), enabled: true };
    // Go to next page, then done
    const ctx = createMockContext({ selectResponses: ["__next__", "__done__"] });

    await showToolSelector(ctx.ctx, tools, state);

    // First page select call should include a "next page" item
    const firstPageItems = ctx.selectCalls[0].items as Array<{ value: string }>;
    expect(firstPageItems.some((i) => i.value === "__next__")).toBe(true);
  });

  it("persists toggled state across pages", async () => {
    const tools = makeTools(
      Array.from({ length: 11 }, (_, i) => `tool-${i}`),
      "extension",
    );
    const state = { ...createInitialState(), enabled: true };
    // Toggle tool-0 on page 1, go to next page, then done
    const ctx = createMockContext({ selectResponses: ["tool-0", "__next__", "__done__"] });

    const result = await showToolSelector(ctx.ctx, tools, state);
    expect(result).toBeDefined();
    expect(result).toContain("tool-0");
    // Ensure tool-10 (page 2 only) is not selected
    expect(result).not.toContain("tool-10");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- `showToolSelector` not found

- [ ] **Step 3: Implement `showToolSelector` in `src/tui/menus.ts`**

Replace `src/tui/menus.ts` with the complete updated file:

```typescript
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  BLOCKED_BUILTIN_TOOLS,
  SAFE_BUILTIN_PLAN_TOOLS,
  TOOL_SELECTOR_PAGE_SIZE,
} from "../shared/constants.ts";
import type { PlanModeState } from "../shared/types.ts";

export type PlanMenuAction = "implement" | "stay" | "exit" | "show-plan" | "tools";

interface SelectUI {
  select(opts: {
    title?: string;
    items: Array<{ label: string; value: string }>;
  }): Promise<string | undefined>;
}

function getSelectUI(ctx: ExtensionContext): SelectUI {
  return ctx.ui as unknown as SelectUI;
}

export async function showPlanReadyMenu(ctx: ExtensionContext): Promise<PlanMenuAction> {
  const choice = await getSelectUI(ctx).select({
    title: "Plan ready",
    items: [
      { label: "Implement this plan", value: "implement" },
      { label: "Stay in Plan mode", value: "stay" },
      { label: "Exit Plan mode", value: "exit" },
    ],
  });
  return (choice as PlanMenuAction) ?? "stay";
}

export async function showPlanMenu(
  ctx: ExtensionContext,
  state: PlanModeState,
): Promise<PlanMenuAction> {
  const items: Array<{ label: string; value: string }> = [];

  if (state.latestPlan) {
    items.push({ label: "Show latest proposed plan", value: "show-plan" });
    items.push({ label: "Implement this plan", value: "implement" });
  }

  items.push({ label: "Configure Plan-mode tools", value: "tools" });
  items.push({ label: "Stay in Plan mode", value: "stay" });
  items.push({ label: "Exit Plan mode", value: "exit" });

  const choice = await getSelectUI(ctx).select({
    title: "Plan mode",
    items,
  });
  return (choice as PlanMenuAction) ?? "stay";
}

interface ToolInfo {
  name: string;
  description?: string;
  sourceInfo: { source: string };
}

/**
 * Paginated tool selector. Returns the array of non-builtin tool names the user
 * wants enabled, or undefined if the user made no changes (selected Done immediately).
 */
export async function showToolSelector(
  ctx: ExtensionContext,
  allTools: ToolInfo[],
  state: PlanModeState,
): Promise<string[] | undefined> {
  const ui = getSelectUI(ctx);

  // Only non-blocked tools are selectable
  const selectableTools = allTools.filter((t) => !BLOCKED_BUILTIN_TOOLS.has(t.name));

  // Current selection: user's saved selections, or empty (builtins are always on)
  const selected = new Set<string>(state.selectedToolNames ?? []);
  const initialSelected = new Set<string>(selected);

  let page = 0;
  const pageSize = TOOL_SELECTOR_PAGE_SIZE;
  const totalPages = Math.ceil(selectableTools.length / pageSize);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const start = page * pageSize;
    const pageTools = selectableTools.slice(start, start + pageSize);

    const items: Array<{ label: string; value: string }> = pageTools.map((tool) => {
      const isBuiltin = tool.sourceInfo.source === "builtin";
      const isAlwaysOn = SAFE_BUILTIN_PLAN_TOOLS.has(tool.name);
      const isBash = tool.name === "bash";

      let suffix = "";
      if (isAlwaysOn) {
        suffix = " [always on]";
      } else if (isBash) {
        suffix = " [read-only always on]";
      } else if (selected.has(tool.name)) {
        suffix = " [enabled]";
      } else {
        suffix = " [disabled]";
      }

      const source = isBuiltin ? "built-in" : tool.sourceInfo.source;

      return {
        label: `${tool.name} (${source})${suffix}`,
        value: isAlwaysOn || isBash ? `__noop_${tool.name}__` : tool.name,
      };
    });

    if (totalPages > 1 && page < totalPages - 1) {
      items.push({ label: "Next page ->", value: "__next__" });
    }
    if (page > 0) {
      items.push({ label: "<- Previous page", value: "__prev__" });
    }
    items.push({ label: "Done", value: "__done__" });

    const pageLabel = totalPages > 1 ? ` (page ${page + 1}/${totalPages})` : "";
    const choice = await ui.select({ title: `Configure Plan-mode tools${pageLabel}`, items });

    if (choice === "__done__" || choice === undefined) {
      break;
    }
    if (choice === "__next__") {
      page = Math.min(page + 1, totalPages - 1);
      continue;
    }
    if (choice === "__prev__") {
      page = Math.max(page - 1, 0);
      continue;
    }
    if (choice?.startsWith("__noop_")) {
      continue;
    }
    if (choice) {
      // Toggle the selection
      if (selected.has(choice)) {
        selected.delete(choice);
      } else {
        selected.add(choice);
      }
    }
  }

  // If nothing changed, return undefined (no-op for caller)
  const unchanged =
    selected.size === initialSelected.size &&
    [...selected].every((t) => initialSelected.has(t));
  if (unchanged) return undefined;

  // Only return non-builtin selections (builtins are always included by activatePlanModeTools)
  return [...selected].filter((name) => !SAFE_BUILTIN_PLAN_TOOLS.has(name));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/tui/menus.ts tests/tui/menus.test.ts
git commit -m "feat: add tool selector menu"
```

---

### Task 4: Wire tool selector in index.ts

**Files:**
- Modify: `src/index.ts`

This task updates three things in `index.ts`:
1. `activatePlanModeTools` uses `planModeToolNamesWithSelections(state.selectedToolNames)`
2. `handleMenuAction`'s `"tools"` case calls `showToolSelector` and updates state
3. The `/plan tools` command handler calls `showToolSelector` directly

- [ ] **Step 1: Update `src/index.ts`**

Replace the full `index.ts`:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildPlanModePrompt } from "./core/prompt.ts";
import { isSafeCommand } from "./core/safety.ts";
import { createInitialState, enterPlanMode, exitPlanMode, restoreState } from "./core/state.ts";
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
  planModeToolNamesWithSelections,
} from "./core/tools.ts";
import { extractProposedPlan, filterPlanModeEntries, getAssistantMessageText } from "./core/context.ts";
import {
  BLOCKED_BUILTIN_TOOLS,
  STATE_ENTRY_TYPE,
  STATUS_KEY,
  WIDGET_KEY,
} from "./shared/constants.ts";
import type { PlanModeState, SessionEntry } from "./shared/types.ts";
import { formatStatus } from "./tui/status.ts";
import { formatWidgetLines } from "./tui/widgets.ts";
import { showPlanMenu, showPlanReadyMenu, showToolSelector, type PlanMenuAction } from "./tui/menus.ts";

export default function createExtension(pi: ExtensionAPI): void {
  let state: PlanModeState = createInitialState();
  let previousTools: string[] | undefined;

  pi.registerFlag("plan", {
    description: "Start in plan mode (read-only exploration)",
    type: "boolean",
    default: false,
  });

  function persist(): void {
    pi.appendEntry(STATE_ENTRY_TYPE, state);
  }

  function updateUi(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, formatStatus(state));
    ctx.ui.setWidget(WIDGET_KEY, formatWidgetLines(state));
  }

  function clearUi(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  }

  function activatePlanModeTools(): void {
    if (previousTools === undefined) {
      previousTools = pi.getActiveTools();
    }
    pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames));
  }

  function restoreTools(): void {
    pi.setActiveTools(normalModeToolNames(previousTools));
    previousTools = undefined;
  }

  function doEnter(ctx: ExtensionContext): void {
    state = enterPlanMode(state);
    activatePlanModeTools();
    persist();
    updateUi(ctx);
  }

  function doExit(ctx: ExtensionContext): void {
    state = exitPlanMode(state);
    restoreTools();
    persist();
    updateUi(ctx);
  }

  function sendPlanModeMessage(content: string, ctx: ExtensionContext): void {
    pi.sendUserMessage(content, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
  }

  async function runToolSelector(ctx: ExtensionContext): Promise<void> {
    const allTools = pi.getAllTools();
    const selections = await showToolSelector(ctx, allTools, state);
    if (selections !== undefined) {
      state = { ...state, selectedToolNames: selections };
      activatePlanModeTools();
      persist();
    }
    const count = (state.selectedToolNames ?? []).length;
    const msg =
      count === 0
        ? "Plan mode tools reset to defaults."
        : `Plan mode tools updated: ${count} extension tool(s) enabled.`;
    ctx.ui.notify(msg, "info");
  }

  async function handleMenuAction(action: PlanMenuAction, ctx: ExtensionContext): Promise<void> {
    switch (action) {
      case "implement": {
        const plan = state.latestPlan;
        doExit(ctx);
        if (plan) {
          sendPlanModeMessage(
            `Plan mode is now disabled. Full tool access is restored. Implement this proposed plan now:\n\n${plan}`,
            ctx,
          );
        }
        ctx.ui.notify("Implementing plan. Full access restored.", "info");
        break;
      }
      case "exit":
        doExit(ctx);
        ctx.ui.notify("Plan mode disabled.", "info");
        break;
      case "show-plan":
        if (state.latestPlan) {
          ctx.ui.notify(state.latestPlan, "info");
        }
        break;
      case "tools":
        await runToolSelector(ctx);
        break;
      case "stay":
      default:
        break;
    }
  }

  pi.registerCommand("plan", {
    description: "Enter or manage plan mode",
    handler: async (args, ctx) => {
      const command = args.trim();
      const lower = command.toLowerCase();

      if (lower === "exit" || lower === "off") {
        if (state.enabled) doExit(ctx);
        ctx.ui.notify("Plan mode disabled.", "info");
        return;
      }

      if (lower === "tools") {
        if (!state.enabled) {
          doEnter(ctx);
          ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
        }
        await runToolSelector(ctx);
        return;
      }

      if (command) {
        // /plan <prompt> -- enter if needed then submit the prompt
        if (!state.enabled) {
          doEnter(ctx);
          ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
        }
        sendPlanModeMessage(command, ctx);
        return;
      }

      // No args
      if (!state.enabled) {
        doEnter(ctx);
        ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
        return;
      }

      // In plan mode with no args -- show menu
      const action = await showPlanMenu(ctx, state);
      await handleMenuAction(action, ctx);
    },
    getArgumentCompletions: (prefix: string) => {
      return ["exit", "off", "tools"].filter((c) => c.startsWith(prefix.toLowerCase()));
    },
  });

  pi.on("tool_call", async (event) => {
    if (!state.enabled) return;

    if (BLOCKED_BUILTIN_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: `Plan mode blocks '${event.toolName}'. Exit plan mode first with /plan exit.`,
      };
    }

    if (event.toolName === "bash") {
      const input = event.input as Record<string, unknown>;
      const command = typeof input.command === "string" ? input.command : "";
      if (!isSafeCommand(command)) {
        return {
          block: true,
          reason: `Plan mode blocks mutating or non-allowlisted bash commands.\nCommand: ${command}`,
        };
      }
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (!state.enabled) return;
    pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames));
    state = { ...state, latestPlan: undefined, awaitingAction: false };
    return { systemPrompt: (event.systemPrompt as string) + "\n\n" + buildPlanModePrompt() };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!state.enabled) return;
    const messages = (event.messages as Array<Record<string, unknown>>) ?? [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const text = getAssistantMessageText(lastAssistant);
    const plan = extractProposedPlan(text);
    if (!plan) return;
    state = { ...state, latestPlan: plan, awaitingAction: true };
    persist();
    updateUi(ctx);
    // Auto-show plan-ready menu after current event loop tick
    setTimeout(
      () => void showPlanReadyMenu(ctx).then((action) => handleMenuAction(action, ctx)),
      0,
    );
  });

  pi.on("context", async (event) => {
    const messages = (event.messages as Array<Record<string, unknown>>) ?? [];
    const filtered = filterPlanModeEntries(messages, STATE_ENTRY_TYPE);
    if (filtered.length !== messages.length) {
      return { messages: filtered };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries() as SessionEntry[];
    state = restoreState(entries);

    if (pi.getFlag("plan") === true) {
      state = enterPlanMode(state);
    }

    if (state.enabled) {
      activatePlanModeTools();
    }
    updateUi(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    persist();
    clearUi(ctx);
  });
}
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

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
    // First enter plan mode
    const ctx = createMockContext({ selectResponses: ["my-search", "__done__"] });
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    // Now run /plan tools
    const ctx2 = createMockContext({ selectResponses: ["my-search", "__done__"] });
    await mock.commands.get("plan")!.handler("tools", ctx2.ctx);

    // my-search should now be in active tools
    expect(mock.activeTools).toContain("my-search");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("enters plan mode when running /plan tools while not in plan mode", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: ["__done__"] });

    await mock.commands.get("plan")!.handler("tools", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBeDefined();
  });

  it("tools action from plan menu calls tool selector", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);
    // Enter plan mode
    const ctx = createMockContext({ selectResponses: ["tools", "__done__"] });
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    // Run /plan (shows menu) -> select tools -> Done
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    // Should have opened the tool selector (select called twice: once for menu, once for selector)
    expect(ctx.selectCalls).toHaveLength(2);
  });

  it("selectedToolNames persists across session restore", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);

    // Enter plan mode and configure tools
    const ctx = createMockContext({ selectResponses: ["my-tool", "__done__"] });
    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan")!.handler("tools", ctx.ctx);

    // Get the persisted state
    const persistedEntries = mock.entries.filter((e) => e.customType === "plan-mode-state");
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
