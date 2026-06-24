# Phase 7: Command Refactor and Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the old `ctx.ui.select()`-based tool selector, refactor `/plan subcommand` to `/plan:subcommand` format using separate command registrations, wire `ctx.ui.custom()` to the new tool selector component, and update all integration tests.

**Architecture:** The monolithic `/plan` command handler splits into three `pi.registerCommand()` calls: `plan` (toggle + prompt), `plan:exit`, and `plan:tools`. The old `showToolSelector` function in `menus.ts` is removed. The new `runToolSelector` function in `index.ts` uses `ctx.ui.custom()` with `createToolSelectorComponent`.

**Tech Stack:** TypeScript (ES2022, strict, Node16 ESM), `@earendil-works/pi-coding-agent` extension API, vitest, biome.

**Spec:** `docs/superpowers/specs/2026-06-24-refactor-commands-and-tool-selector-design.md`

**Prerequisite:** Phases 5 and 6 must be complete (all three `tool-selector-*.ts` files exist).

**Verification:** `npm run check` — biome + typecheck + all tests pass.

---

## File Map

| File                      | Action | Responsibility                                                        |
| ------------------------- | ------ | --------------------------------------------------------------------- |
| `src/tui/menus.ts`        | Modify | Remove `showToolSelector`, `TOOL_SELECTOR_LABELS`, `ToolSelectorItem` |
| `src/index.ts`            | Modify | Split commands, wire `ctx.ui.custom()`                                |
| `tests/tui/menus.test.ts` | Modify | Remove `showToolSelector` tests                                       |
| `tests/index.test.ts`     | Modify | Update for new command format                                         |

---

### Task 1: Remove old tool selector from menus

**Files:** `src/tui/menus.ts`, `tests/tui/menus.test.ts`

- [ ] **Step 1: Rewrite `src/tui/menus.ts` — remove tool selector**

Replace the entire file with (only menu functions remain):

```typescript
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PlanModeState } from "../shared/types.ts";

export type PlanMenuAction =
  | "implement"
  | "stay"
  | "exit"
  | "show-plan"
  | "tools";

export const PLAN_MENU_LABELS: Record<PlanMenuAction, string> = {
  implement: "Implement this plan",
  stay: "Stay in Plan mode",
  exit: "Exit Plan mode",
  "show-plan": "Show latest proposed plan",
  tools: "Configure tools",
};

const LABEL_TO_ACTION = new Map<string, PlanMenuAction>(
  Object.entries(PLAN_MENU_LABELS).map(([action, label]) => [
    label,
    action as PlanMenuAction,
  ]),
);

function resolveAction(choice: string | undefined): PlanMenuAction {
  if (!choice) return "stay";
  return LABEL_TO_ACTION.get(choice) ?? "stay";
}

export async function showPlanReadyMenu(
  ctx: ExtensionContext,
): Promise<PlanMenuAction> {
  const choice = await ctx.ui.select("Plan ready", [
    PLAN_MENU_LABELS.implement,
    PLAN_MENU_LABELS.stay,
    PLAN_MENU_LABELS.exit,
  ]);
  return resolveAction(choice);
}

export async function showPlanMenu(
  ctx: ExtensionContext,
  state: PlanModeState,
): Promise<PlanMenuAction> {
  const options: string[] = [];

  if (state.latestPlan) {
    options.push(PLAN_MENU_LABELS["show-plan"]);
    options.push(PLAN_MENU_LABELS.implement);
  }

  options.push(PLAN_MENU_LABELS.tools);
  options.push(PLAN_MENU_LABELS.stay);
  options.push(PLAN_MENU_LABELS.exit);

  const choice = await ctx.ui.select("Plan mode", options);
  return resolveAction(choice);
}
```

- [ ] **Step 2: Update `tests/tui/menus.test.ts` — remove tool selector tests**

Replace the entire file with:

```typescript
import { describe, expect, it } from "vitest";
import {
  PLAN_MENU_LABELS,
  showPlanMenu,
  showPlanReadyMenu,
} from "../../src/tui/menus.ts";
import { createInitialState } from "../../src/core/state.ts";
import { createMockContext } from "../helpers.ts";

describe("showPlanReadyMenu", () => {
  it("returns implement when user selects implement label", async () => {
    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS.implement],
    });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("implement");
  });

  it("returns stay when user selects stay label", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("stay");
  });

  it("returns exit when user selects exit label", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.exit] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("exit");
  });

  it("defaults to stay when selection is cancelled (undefined)", async () => {
    const ctx = createMockContext({ selectResponses: [] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("stay");
  });

  it("calls ctx.ui.select with three options", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    await showPlanReadyMenu(ctx.ctx);
    expect(ctx.selectCalls).toHaveLength(1);
    expect(ctx.selectCalls[0].options).toHaveLength(3);
  });
});

describe("showPlanMenu", () => {
  it("includes show-plan and implement options when plan exists", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = {
      ...createInitialState(),
      enabled: true,
      latestPlan: "# My Plan",
    };
    await showPlanMenu(ctx.ctx, state);
    const options = ctx.selectCalls[0].options;
    expect(options).toContain(PLAN_MENU_LABELS["show-plan"]);
    expect(options).toContain(PLAN_MENU_LABELS.implement);
    expect(options).toContain(PLAN_MENU_LABELS.stay);
    expect(options).toContain(PLAN_MENU_LABELS.exit);
  });

  it("excludes show-plan and implement options when no plan exists", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true };
    await showPlanMenu(ctx.ctx, state);
    const options = ctx.selectCalls[0].options;
    expect(options).not.toContain(PLAN_MENU_LABELS["show-plan"]);
    expect(options).not.toContain(PLAN_MENU_LABELS.implement);
    expect(options).toContain(PLAN_MENU_LABELS.stay);
    expect(options).toContain(PLAN_MENU_LABELS.exit);
  });

  it("returns selected action", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.exit] });
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

  it("includes Configure tools option", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true };
    await showPlanMenu(ctx.ctx, state);
    const options = ctx.selectCalls[0].options;
    expect(options).toContain(PLAN_MENU_LABELS.tools);
  });
});
```

- [ ] **Step 3: Run menu tests only**

Run: `npx vitest run tests/tui/menus.test.ts`
Expected: All menu tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tui/menus.ts tests/tui/menus.test.ts
git commit -m "refactor: remove old tool selector from menus module"
```

---

### Task 2: Refactor commands and wire new tool selector in index.ts

**Files:** `src/index.ts`

- [ ] **Step 1: Rewrite `src/index.ts`**

Replace the entire file with:

```typescript
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { buildPlanModePrompt } from "./core/prompt.ts";
import { isSafeCommand } from "./core/safety.ts";
import {
  createInitialState,
  enterPlanMode,
  exitPlanMode,
  restoreState,
} from "./core/state.ts";
import {
  normalModeToolNames,
  planModeToolNamesWithSelections,
} from "./core/tools.ts";
import {
  extractProposedPlan,
  filterPlanModeEntries,
  getAssistantMessageText,
} from "./core/context.ts";
import {
  BLOCKED_BUILTIN_TOOLS,
  STATE_ENTRY_TYPE,
  STATUS_KEY,
  WIDGET_KEY,
} from "./shared/constants.ts";
import type { PlanModeState } from "./shared/types.ts";
import { formatStatus } from "./tui/status.ts";
import { formatWidgetLines } from "./tui/widgets.ts";
import {
  showPlanMenu,
  showPlanReadyMenu,
  type PlanMenuAction,
} from "./tui/menus.ts";
import {
  createToolSelectorComponent,
  type ToolSelectorItem,
} from "./tui/tool-selector.ts";

export default function createExtension(pi: ExtensionAPI): void {
  let state: PlanModeState = createInitialState();
  let previousTools: string[] | undefined;
  let pendingMenuTimer: ReturnType<typeof setTimeout> | undefined;

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

  function clearPendingMenu(): void {
    if (pendingMenuTimer !== undefined) {
      clearTimeout(pendingMenuTimer);
      pendingMenuTimer = undefined;
    }
  }

  function doEnter(ctx: ExtensionContext): void {
    state = enterPlanMode(state);
    activatePlanModeTools();
    persist();
    updateUi(ctx);
  }

  function doExit(ctx: ExtensionContext): void {
    clearPendingMenu();
    state = exitPlanMode(state);
    restoreTools();
    persist();
    updateUi(ctx);
  }

  function sendPlanModeMessage(content: string, ctx: ExtensionContext): void {
    pi.sendUserMessage(
      content,
      ctx.isIdle() ? undefined : { deliverAs: "followUp" },
    );
  }

  async function runToolSelector(ctx: ExtensionContext): Promise<void> {
    const allTools = pi.getAllTools() as ToolSelectorItem[];
    const selections = await ctx.ui.custom<string[] | null>(
      (_tui, theme, _keybindings, done) => {
        let requestRender: () => void = () => {};
        const component = createToolSelectorComponent({
          tools: allTools,
          previousSelections: state.selectedToolNames ?? undefined,
          theme: {
            fg: (color: string, text: string) => theme.fg(color as never, text),
            bold: (text: string) => theme.bold(text),
            dim: (text: string) => theme.fg("dim" as never, text),
          },
          done,
          requestRender: () => requestRender(),
        });
        requestRender = () => component.invalidate();
        return component;
      },
    );

    if (selections === null) {
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

  async function handleMenuAction(
    action: PlanMenuAction,
    ctx: ExtensionContext,
  ): Promise<void> {
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
      default:
        break;
    }
  }

  pi.registerCommand("plan", {
    description: "Enter or manage plan mode",
    handler: async (args, ctx) => {
      clearPendingMenu();
      const command = args.trim();

      if (command) {
        if (!state.enabled) {
          doEnter(ctx);
          ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
        }
        sendPlanModeMessage(command, ctx);
        return;
      }

      if (!state.enabled) {
        doEnter(ctx);
        ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
        return;
      }

      const action = await showPlanMenu(ctx, state);
      await handleMenuAction(action, ctx);
    },
  });

  pi.registerCommand("plan:exit", {
    description: "Exit plan mode",
    handler: async (_args, ctx) => {
      clearPendingMenu();
      if (state.enabled) doExit(ctx);
      ctx.ui.notify("Plan mode disabled.", "info");
    },
  });

  pi.registerCommand("plan:tools", {
    description: "Configure plan mode tools",
    handler: async (_args, ctx) => {
      clearPendingMenu();
      if (!state.enabled) {
        doEnter(ctx);
        ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
      }
      await runToolSelector(ctx);
    },
  });

  pi.on("tool_call", async (event) => {
    if (!state.enabled) return;

    if (BLOCKED_BUILTIN_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: `Plan mode blocks '${event.toolName}'. Exit plan mode first with /plan:exit.`,
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

  pi.on("before_agent_start", async (event, ctx) => {
    if (!state.enabled) return;
    pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames));
    state = { ...state, latestPlan: undefined, awaitingAction: false };
    updateUi(ctx);
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPlanModePrompt()}`,
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!state.enabled) return;
    const messages =
      (event.messages as unknown as Array<Record<string, unknown>>) ?? [];
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const text = getAssistantMessageText(lastAssistant);
    const plan = extractProposedPlan(text);
    if (!plan) return;
    state = { ...state, latestPlan: plan, awaitingAction: true };
    persist();
    updateUi(ctx);
    clearPendingMenu();
    pendingMenuTimer = setTimeout(
      () =>
        void showPlanReadyMenu(ctx)
          .then((action) => handleMenuAction(action, ctx))
          .catch(() => {}),
      0,
    );
  });

  pi.on("context", async (event) => {
    const messages =
      (event.messages as unknown as Array<Record<string, unknown>>) ?? [];
    const filtered = filterPlanModeEntries(messages, STATE_ENTRY_TYPE);
    if (filtered.length !== messages.length) {
      return { messages: filtered as unknown as typeof event.messages };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
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
    clearPendingMenu();
    persist();
    clearUi(ctx);
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: split commands into plan, plan:exit, plan:tools and wire custom tool selector"
```

---

### Task 3: Update integration tests for new command format

**Files:** `tests/index.test.ts`

This is a large file rewrite. The key changes:

- Remove `TOOL_SELECTOR_LABELS` import
- Replace `handler("exit", ...)` / `handler("off", ...)` with `mock.commands.get("plan:exit")!.handler("", ...)`
- Replace `handler("tools", ...)` with `mock.commands.get("plan:tools")!.handler("", ...)`
- Remove `getArgumentCompletions` tests
- Update `/plan tools` tests to use `customCalls` instead of `selectCalls`
- Update registration test to check for three commands
- `/plan exit` is now treated as a prompt (not a subcommand)

- [ ] **Step 1: Rewrite `tests/index.test.ts`**

Replace the entire file with:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import createExtension from "../src/index.ts";
import { createMockContext, createMockPi } from "./helpers.ts";
import { PLAN_MENU_LABELS } from "../src/tui/menus.ts";

describe("createExtension", () => {
  it("registers the plan flag", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.flags.has("plan")).toBe(true);
    expect(mock.flags.get("plan")?.type).toBe("boolean");
  });

  it("registers plan, plan:exit, and plan:tools commands", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.commands.has("plan")).toBe(true);
    expect(mock.commands.has("plan:exit")).toBe(true);
    expect(mock.commands.has("plan:tools")).toBe(true);
  });

  it("registers session_start, session_shutdown, tool_call, and before_agent_start handlers", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.events.has("session_start")).toBe(true);
    expect(mock.events.has("session_shutdown")).toBe(true);
    expect(mock.events.has("tool_call")).toBe(true);
    expect(mock.events.has("before_agent_start")).toBe(true);
  });
});

describe("/plan command", () => {
  it("toggles plan mode on", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.notifications.some((n) => n.message.includes("enabled"))).toBe(
      true,
    );
  });

  it("shows plan menu when /plan is run in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: ["Stay in Plan mode"] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on
    await handler("", ctx.ctx); // menu

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.selectCalls).toHaveLength(1);
  });

  it("treats any args as a prompt", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("exit", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content).toBe("exit");
  });
});

describe("/plan:exit command", () => {
  it("exits plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // on
    await mock.commands.get("plan:exit")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
  });

  it("is a no-op when plan mode is already off", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan:exit")!.handler("", ctx.ctx);
    expect(ctx.notifications.some((n) => n.message.includes("disabled"))).toBe(
      true,
    );
  });
});

describe("tool management", () => {
  it("switches to plan-mode tools on enter", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
    });
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).toContain("bash");
    expect(mock.activeTools).toContain("grep");
    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
  });

  it("restores previous tools on exit", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write", "custom"],
    });
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // on
    await mock.commands.get("plan:exit")!.handler("", ctx.ctx); // off

    expect(mock.activeTools).toContain("edit");
    expect(mock.activeTools).toContain("write");
    expect(mock.activeTools).toContain("custom");
  });

  it("re-applies plan-mode tools on before_agent_start", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enable

    mock.pi.setActiveTools(["read", "bash", "edit", "write"]);
    expect(mock.activeTools).toContain("edit");

    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "" },
      ctx,
    );

    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).toContain("bash");
  });

  it("does not modify tools on before_agent_start when plan mode is off", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
    });
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "" },
      ctx,
    );

    expect(mock.activeTools).toContain("edit");
    expect(mock.activeTools).toContain("write");
  });
});

describe("tool_call blocking", () => {
  it("blocks edit tool in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "tool_call",
      { type: "tool_call", toolCallId: "1", toolName: "edit", input: {} },
      ctx,
    );
    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("blocks write tool in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "tool_call",
      { type: "tool_call", toolCallId: "1", toolName: "write", input: {} },
      ctx,
    );
    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("blocks unsafe bash commands in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "1",
        toolName: "bash",
        input: { command: "rm -rf /" },
      },
      ctx,
    );
    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("allows safe bash commands in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "1",
        toolName: "bash",
        input: { command: "cat file.ts" },
      },
      ctx,
    );
    expect(result).toBeUndefined();
  });

  it("does not block tools when plan mode is off", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "tool_call",
      { type: "tool_call", toolCallId: "1", toolName: "edit", input: {} },
      ctx,
    );
    expect(result).toBeUndefined();
  });
});

describe("session persistence", () => {
  it("persists state on enter and exit", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // on
    await mock.commands.get("plan:exit")!.handler("", ctx.ctx); // off

    const planEntries = mock.entries.filter(
      (e) => e.customType === "plan-mode-state",
    );
    expect(planEntries.length).toBeGreaterThanOrEqual(2);
  });

  it("restores enabled state from session_start", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      entries: [
        {
          type: "custom",
          customType: "plan-mode-state",
          data: { enabled: true },
          id: "1",
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

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
  });

  it("activates plan mode from --plan flag", async () => {
    const mock = createMockPi();
    mock.flagValues.set("plan", true);
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.fireEvent(
      "session_start",
      { type: "session_start", reason: "startup" },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("clears UI on session_shutdown", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enable
    expect(ctx.statuses.get("pi-plan")).toBe("plan active");

    await mock.fireEvent(
      "session_shutdown",
      { type: "session_shutdown", reason: "quit" },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
  });
});

describe("before_agent_start", () => {
  it("injects plan mode prompt when plan mode is enabled", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );

    expect(result).toBeDefined();
    const { systemPrompt } = result as { systemPrompt: string };
    expect(systemPrompt).toContain("base prompt");
    expect(systemPrompt).toContain("[PLAN MODE ACTIVE]");
  });

  it("does not modify prompt when plan mode is off", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );

    expect(result).toBeUndefined();
  });

  it("re-applies plan mode tools each turn", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
    });
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    mock.pi.setActiveTools([...mock.activeTools, "custom-editor"]);

    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base" },
      ctx,
    );

    expect(mock.activeTools).not.toContain("custom-editor");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("clears stale plan state for new turn", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );
    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");

    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base" },
      ctx,
    );
    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
  });
});

describe("agent_end", () => {
  it("detects proposed plan and sets status to plan ready", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          { role: "user", content: "make a plan" },
          {
            role: "assistant",
            content:
              "Here is my plan:\n<proposed_plan>\n# My Plan\n## Summary\nDo stuff\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
  });

  it("does nothing when plan mode is off", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
  });

  it("does nothing when no proposed plan in messages", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          { role: "assistant", content: "Just some text, no plan yet." },
        ],
      },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
  });

  it("persists state when plan is detected", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const entriesBefore = mock.entries.filter(
      (e) => e.customType === "plan-mode-state",
    ).length;

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    const entriesAfter = mock.entries.filter(
      (e) => e.customType === "plan-mode-state",
    ).length;
    expect(entriesAfter).toBeGreaterThan(entriesBefore);
  });
});

describe("context handler", () => {
  it("filters out plan-mode-state entries", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "context",
      {
        type: "context",
        messages: [
          { role: "user", content: "hello" },
          { customType: "plan-mode-state", data: { enabled: true } },
          { role: "assistant", content: "world" },
        ],
      },
      ctx,
    );

    expect(result).toBeDefined();
    const { messages } = result as { messages: unknown[] };
    expect(messages).toHaveLength(2);
  });

  it("keeps proposed_plan blocks in assistant messages", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "context",
      {
        type: "context",
        messages: [
          {
            role: "assistant",
            content: "text <proposed_plan>\n# Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    if (result) {
      const msgs = (result as { messages: Array<{ content: string }> })
        .messages;
      expect(msgs[0].content).toContain("<proposed_plan>");
    }
  });

  it("returns undefined when nothing to filter", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "context",
      {
        type: "context",
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "world" },
        ],
      },
      ctx,
    );

    expect(result).toBeUndefined();
  });
});

describe("widgets", () => {
  it("shows planning widget when plan mode is enabled", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const widget = ctx.widgets.get("pi-plan") as string[];
    expect(widget).toBeDefined();
    expect(widget.some((line) => line.includes("Plan mode"))).toBe(true);
  });

  it("shows plan ready widget after plan is detected", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    const widget = ctx.widgets.get("pi-plan") as string[];
    expect(widget).toBeDefined();
    expect(widget.some((line) => line.toLowerCase().includes("ready"))).toBe(
      true,
    );
  });

  it("clears widget when plan mode exits", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx); // on
    expect(ctx.widgets.get("pi-plan")).toBeDefined();

    await mock.commands.get("plan:exit")!.handler("", ctx.ctx); // off
    expect(ctx.widgets.get("pi-plan")).toBeUndefined();
  });
});

describe("plan menu actions", () => {
  it("implement: exits plan mode and sends implementation message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS.implement],
    });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content:
              "<proposed_plan>\n# My Plan\n## Summary\nBuild the thing\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    await handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content as string).toContain(
      "Implement this proposed plan now",
    );
    expect(mock.userMessages[0].content as string).toContain("# My Plan");
  });

  it("exit: exits plan mode without sending message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.exit] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode
    await handler("", ctx.ctx); // show menu, select exit

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(0);
  });

  it("stay: keeps plan mode active", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);
    await handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.userMessages).toHaveLength(0);
  });

  it("show-plan: notifies with plan content", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS["show-plan"]],
    });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# My Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    await handler("", ctx.ctx);

    expect(ctx.notifications.some((n) => n.message.includes("# My Plan"))).toBe(
      true,
    );
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
});

describe("agent_end auto-show menu", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-shows plan-ready menu and processes action after plan detection", async () => {
    vi.useFakeTimers();
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS.implement],
    });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content:
              "<proposed_plan>\n# Auto Plan\n## Summary\nDo the thing\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");

    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.selectCalls).toHaveLength(1);
    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content as string).toContain("# Auto Plan");
  });

  it("cancels auto-menu when user manually invokes /plan first", async () => {
    vi.useFakeTimers();
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    await handler("", ctx.ctx);

    expect(ctx.selectCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.selectCalls).toHaveLength(1);
  });
});

describe("/plan:tools command", () => {
  it("opens tool selector when invoked", async () => {
    const mock = createMockPi({
      allTools: [
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({ customResult: null });

    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.customCalls).toHaveLength(1);
  });

  it("enters plan mode when running /plan:tools while not in plan mode", async () => {
    const mock = createMockPi({
      allTools: [
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({ customResult: null });

    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.notifications.some((n) => n.message.includes("enabled"))).toBe(
      true,
    );
  });

  it("applies selections when tool selector returns names", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
      allTools: [
        {
          name: "my-search",
          description: "Search",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({ customResult: ["my-search"] });

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);

    expect(mock.activeTools).toContain("my-search");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("notifies no changes when tool selector returns null", async () => {
    const mock = createMockPi({
      allTools: [
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({ customResult: null });

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);

    expect(
      ctx.notifications.some((n) => n.message.includes("No changes")),
    ).toBe(true);
  });

  it("tools action from plan menu calls tool selector", async () => {
    const mock = createMockPi({
      allTools: [
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);

    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS.tools],
      customResult: null,
    });
    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan")!.handler("", ctx.ctx); // menu -> tools

    expect(ctx.selectCalls).toHaveLength(1);
    expect(ctx.customCalls).toHaveLength(1);
  });

  it("preserves selected tools across before_agent_start", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
      allTools: [
        {
          name: "my-search",
          description: "Search",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);

    const ctx = createMockContext({ customResult: ["my-search"] });
    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx); // select my-search

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
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);

    const ctx = createMockContext({ customResult: ["my-tool"] });
    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx); // select my-tool

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

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/index.test.ts
git commit -m "test: update integration tests for plan:exit and plan:tools command format"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run biome format**

Run: `npx biome format --write src/ tests/`

- [ ] **Step 2: Run biome lint**

Run: `npx biome lint src/ tests/`
Expected: No errors.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit any formatting changes**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: format and lint"
```

(Skip commit if no changes.)

- [ ] **Step 6: Run full check script**

Run: `npm run check`
Expected: All checks pass (biome + typecheck + tests).
