# Phase 3: Plan Action Menus and Command Subcommands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full plan lifecycle with implement/stay/exit menus, `/plan <prompt>` support, and auto-show plan-ready menu after detection.

**Architecture:** Menu functions in `tui/menus.ts` return `PlanMenuAction` values. `handleMenuAction` in `index.ts` processes choices (exit plan mode, send implementation message, show plan, or no-op). The `/plan` command handler is upgraded from a simple toggle to a menu-based flow with subcommand routing.

**Tech Stack:** TypeScript (ESM, Node16 module resolution, `.ts` extensions), Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-06-22-pi-plan-design.md`

**Depends on:** Phase 1 + Phase 2 (`docs/plans/2026-06-22-phase-1-plan-mode-toggle.md`, `docs/plans/2026-06-22-phase-2-prompt-and-detection.md`)

---

### Task 1: Update test helpers to support ctx.ui.select

**Files:**
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Replace `tests/helpers.ts` with updated version**

The updated mock adds `select()` to `ctx.ui` and `selectCalls` tracking to `MockContext`:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SessionEntry } from "../src/shared/types.ts";

interface RegisteredFlag {
  description?: string;
  type: string;
  default?: boolean | string;
}

interface RegisteredCommand {
  description?: string;
  handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => unknown;
}

type EventHandler = (event: unknown, ctx: ExtensionContext) => Promise<unknown> | unknown;

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
  fireEvent(name: string, event: unknown, ctx: MockContext): Promise<unknown>;
}

export interface MockContext {
  ctx: ExtensionContext;
  statuses: Map<string, string | undefined>;
  notifications: Array<{ message: string; type?: string }>;
  widgets: Map<string, unknown>;
  selectCalls: Array<{ title?: string; items: unknown[] }>;
}

export function createMockPi(options?: { activeTools?: string[] }): MockPi {
  const flags = new Map<string, RegisteredFlag>();
  const flagValues = new Map<string, boolean | string>();
  const commands = new Map<string, RegisteredCommand>();
  const events = new Map<string, EventHandler[]>();
  let activeTools = options?.activeTools ?? ["read", "bash", "edit", "write"];
  const entries: Array<{ customType: string; data: unknown }> = [];
  const messages: Array<{ message: unknown; options: unknown }> = [];
  const userMessages: Array<{ content: unknown; options: unknown }> = [];

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
    } as unknown as ExtensionAPI,
    flags,
    flagValues,
    commands,
    events,
    activeTools,
    entries,
    messages,
    userMessages,
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

export function createMockContext(options?: {
  entries?: SessionEntry[];
  hasUI?: boolean;
  isIdle?: boolean;
  selectResponses?: string[];
}): MockContext {
  const statuses = new Map<string, string | undefined>();
  const notifications: Array<{ message: string; type?: string }> = [];
  const widgets = new Map<string, unknown>();
  const selectCalls: Array<{ title?: string; items: unknown[] }> = [];
  const selectQueue = [...(options?.selectResponses ?? [])];
  const sessionEntries = options?.entries ?? [];

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
        async select(opts: { title?: string; items: unknown[] }) {
          selectCalls.push(opts);
          return selectQueue.shift();
        },
        theme: {
          fg(_color: string, text: string) {
            return text;
          },
        },
      },
      hasUI: options?.hasUI ?? true,
      isIdle: () => options?.isIdle ?? true,
      sessionManager: {
        getEntries: () => sessionEntries,
      },
    } as unknown as ExtensionContext,
    statuses,
    notifications,
    widgets,
    selectCalls,
  };

  return mockCtx;
}
```

Note: `setWidget` now deletes the key when value is `undefined` (makes `ctx.widgets.get(key)` return `undefined` as expected by tests checking "widget is cleared").

- [ ] **Step 2: Run tests to verify Phase 1+2 tests still pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/helpers.ts
git commit -m "feat: add ctx.ui.select mock to test helpers"
```

---

### Task 2: Plan menu functions (TDD)

**Files:**
- Create: `src/tui/menus.ts`
- Create: `tests/tui/menus.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tui/menus.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { showPlanMenu, showPlanReadyMenu } from "../../src/tui/menus.ts";
import { createInitialState } from "../../src/core/state.ts";
import { createMockContext } from "../helpers.ts";

describe("showPlanReadyMenu", () => {
  it("returns implement when user selects implement", async () => {
    const ctx = createMockContext({ selectResponses: ["implement"] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("implement");
  });

  it("returns stay when user selects stay", async () => {
    const ctx = createMockContext({ selectResponses: ["stay"] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("stay");
  });

  it("returns exit when user selects exit", async () => {
    const ctx = createMockContext({ selectResponses: ["exit"] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("exit");
  });

  it("defaults to stay when selection is cancelled (undefined)", async () => {
    const ctx = createMockContext({ selectResponses: [] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("stay");
  });

  it("calls ctx.ui.select with three items", async () => {
    const ctx = createMockContext({ selectResponses: ["stay"] });
    await showPlanReadyMenu(ctx.ctx);
    expect(ctx.selectCalls).toHaveLength(1);
    expect(ctx.selectCalls[0].items).toHaveLength(3);
  });
});

describe("showPlanMenu", () => {
  it("includes show-plan and implement when plan exists", async () => {
    const ctx = createMockContext({ selectResponses: ["stay"] });
    const state = { ...createInitialState(), enabled: true, latestPlan: "# My Plan" };
    await showPlanMenu(ctx.ctx, state);
    const items = ctx.selectCalls[0].items as Array<{ value: string }>;
    const values = items.map((i) => i.value);
    expect(values).toContain("show-plan");
    expect(values).toContain("implement");
    expect(values).toContain("stay");
    expect(values).toContain("exit");
  });

  it("excludes show-plan and implement when no plan exists", async () => {
    const ctx = createMockContext({ selectResponses: ["stay"] });
    const state = { ...createInitialState(), enabled: true };
    await showPlanMenu(ctx.ctx, state);
    const items = ctx.selectCalls[0].items as Array<{ value: string }>;
    const values = items.map((i) => i.value);
    expect(values).not.toContain("show-plan");
    expect(values).not.toContain("implement");
    expect(values).toContain("stay");
    expect(values).toContain("exit");
  });

  it("returns selected action", async () => {
    const ctx = createMockContext({ selectResponses: ["exit"] });
    const state = { ...createInitialState(), enabled: true };
    const action = await showPlanMenu(ctx.ctx, state);
    expect(action).toBe("exit");
  });

  it("defaults to stay when cancelled", async () => {
    const ctx = createMockContext({ selectResponses: [] });
    const state = { ...createInitialState(), enabled: true };
    const action = await showPlanMenu(ctx.ctx, state);
    expect(action).toBe("stay");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- `showPlanReadyMenu` not found

- [ ] **Step 3: Implement `src/tui/menus.ts`**

```typescript
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PlanModeState } from "../shared/types.ts";

export type PlanMenuAction = "implement" | "stay" | "exit" | "show-plan" | "tools";

export async function showPlanReadyMenu(ctx: ExtensionContext): Promise<PlanMenuAction> {
  const choice = await (ctx.ui as unknown as {
    select(opts: { title?: string; items: Array<{ label: string; value: string }> }): Promise<
      string | undefined
    >;
  }).select({
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

  items.push({ label: "Stay in Plan mode", value: "stay" });
  items.push({ label: "Exit Plan mode", value: "exit" });

  const choice = await (ctx.ui as unknown as {
    select(opts: { title?: string; items: Array<{ label: string; value: string }> }): Promise<
      string | undefined
    >;
  }).select({
    title: "Plan mode",
    items,
  });
  return (choice as PlanMenuAction) ?? "stay";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/tui/menus.ts tests/tui/menus.test.ts
git commit -m "feat: add plan ready and plan menus"
```

---

### Task 3: Wire menus, subcommands, and message delivery in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` with Phase 3 version**

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildPlanModePrompt } from "./core/prompt.ts";
import { isSafeCommand } from "./core/safety.ts";
import { createInitialState, enterPlanMode, exitPlanMode, restoreState } from "./core/state.ts";
import { defaultPlanModeToolNames, normalModeToolNames } from "./core/tools.ts";
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
import { showPlanMenu, showPlanReadyMenu, type PlanMenuAction } from "./tui/menus.ts";

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
    pi.setActiveTools(defaultPlanModeToolNames());
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
        // Phase 4: show tool selector
        ctx.ui.notify("Tool selector not yet available.", "info");
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
        // Phase 4: show tool selector
        ctx.ui.notify("Tool selector not yet available.", "info");
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
    pi.setActiveTools(defaultPlanModeToolNames());
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

- [ ] **Step 2: Run tests to verify Phase 1+2 tests still pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

Note: The Phase 1 test "toggles plan mode off" by running `/plan` twice will now FAIL because the second `/plan` in plan mode shows a menu instead of toggling off. Update that test in the next step.

- [ ] **Step 3: Update the "toggles plan mode off" test in `tests/index.test.ts`**

Find the test:
```typescript
it("toggles plan mode off", async () => {
```

Replace it with:
```typescript
it("shows plan menu when /plan is run in plan mode", async () => {
  const mock = createMockPi();
  createExtension(mock.pi);
  const ctx = createMockContext({ selectResponses: ["stay"] });

  const handler = mock.commands.get("plan")!.handler;
  await handler("", ctx.ctx); // on

  // Second /plan shows menu, not toggle
  await handler("", ctx.ctx);

  // Plan mode is still on (we chose "stay")
  expect(ctx.statuses.get("pi-plan")).toBe("plan active");
  expect(ctx.selectCalls).toHaveLength(1);
});
```

- [ ] **Step 4: Run tests to verify they all pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: wire plan menus, subcommands, and message delivery"
```

---

### Task 4: Integration tests for Phase 3 features

**Files:**
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Append Phase 3 integration tests to `tests/index.test.ts`**

Add the following `describe` blocks at the end of the file:

```typescript
describe("plan menu actions", () => {
  it("implement: exits plan mode and sends implementation message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: ["implement"] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    // Simulate plan detection
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# My Plan\n## Summary\nBuild the thing\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    // Show plan menu and select "implement"
    await handler("", ctx.ctx);

    // Plan mode should be off
    expect(ctx.statuses.get("pi-plan")).toBeUndefined();

    // Implementation message should have been sent
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content as string).toContain("Implement this proposed plan now");
    expect(mock.userMessages[0].content as string).toContain("# My Plan");
  });

  it("exit: exits plan mode without sending message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: ["exit"] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode
    await handler("", ctx.ctx); // show menu, select exit

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(0);
  });

  it("stay: keeps plan mode active", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: ["stay"] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);
    await handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.userMessages).toHaveLength(0);
  });

  it("show-plan: notifies with plan content", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: ["show-plan"] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);

    // Simulate plan detection
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          { role: "assistant", content: "<proposed_plan>\n# My Plan\n</proposed_plan>" },
        ],
      },
      ctx,
    );

    await handler("", ctx.ctx);

    expect(ctx.notifications.some((n) => n.message.includes("# My Plan"))).toBe(true);
  });
});

describe("/plan <prompt>", () => {
  it("enters plan mode and sends the prompt as a user message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("Add dark mode support", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content).toBe("Add dark mode support");
  });

  it("stays in plan mode and sends prompt if already in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter
    await handler("Now explore the auth module", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content).toBe("Now explore the auth module");
  });

  it("does not submit 'exit' or 'off' as a prompt", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter
    await handler("exit", ctx.ctx); // should exit, not submit "exit" as prompt

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(0);
  });
});

describe("getArgumentCompletions", () => {
  it("returns completions for matching prefix", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const completions = mock.commands.get("plan")!.getArgumentCompletions?.("e");
    expect(completions).toContain("exit");
    expect(completions).not.toContain("tools");
    expect(completions).not.toContain("off");
  });

  it("returns all completions for empty prefix", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const completions = mock.commands.get("plan")!.getArgumentCompletions?.("") as string[];
    expect(completions).toContain("exit");
    expect(completions).toContain("off");
    expect(completions).toContain("tools");
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/index.test.ts
git commit -m "test: add Phase 3 integration tests"
```

---

### Task 5: Final verification

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

- [ ] **Step 4: Verify the file structure**

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
