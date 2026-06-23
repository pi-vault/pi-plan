# Phase 2: System Prompt Injection and Plan Detection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent knows it's in plan mode via system prompt, detects `<proposed_plan>` blocks, and shows widget status.

**Architecture:** Pure functions for prompt building (`core/prompt.ts`), plan extraction and context filtering (`core/context.ts`), and widget formatting (`tui/widgets.ts`). Wired into `index.ts` via `before_agent_start`, `agent_end`, and `context` event handlers.

**Tech Stack:** TypeScript (ESM, Node16 module resolution, `.ts` extensions), Vitest, Biome

**Spec:** `docs/superpowers/specs/2026-06-22-pi-plan-design.md`

**Depends on:** Phase 1 (`docs/plans/2026-06-22-phase-1-plan-mode-toggle.md`)

---

### Task 1: Add WIDGET_KEY to shared constants

**Files:**
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add WIDGET_KEY**

Open `src/shared/constants.ts` and add after `STATUS_KEY`:

```typescript
export const STATE_ENTRY_TYPE = "plan-mode-state";
export const STATUS_KEY = "pi-plan";
export const WIDGET_KEY = "pi-plan";

export const SAFE_BUILTIN_PLAN_TOOLS = new Set(["read", "bash", "grep", "find", "ls"]);
// ... rest unchanged
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm typecheck`
Expected: PASS, no errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat: add WIDGET_KEY constant for Phase 2"
```

---

### Task 2: Plan mode system prompt (TDD)

**Files:**
- Create: `src/core/prompt.ts`
- Create: `tests/core/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildPlanModePrompt } from "../../src/core/prompt.ts";

describe("buildPlanModePrompt", () => {
  it("contains the plan mode active marker", () => {
    expect(buildPlanModePrompt()).toContain("[PLAN MODE ACTIVE]");
  });

  it("contains mode rules", () => {
    const prompt = buildPlanModePrompt();
    expect(prompt).toContain("Do not edit files");
    expect(prompt).toContain("/plan exit");
    expect(prompt).toContain("Bash is restricted to read-only commands");
  });

  it("contains skill awareness line", () => {
    expect(buildPlanModePrompt()).toContain("Skills and tools listed in the system prompt");
  });

  it("contains the three planning phases", () => {
    const prompt = buildPlanModePrompt();
    expect(prompt).toContain("Phase 1 -- Explore");
    expect(prompt).toContain("Phase 2 -- Clarify");
    expect(prompt).toContain("Phase 3 -- Plan");
  });

  it("contains the proposed_plan template block", () => {
    const prompt = buildPlanModePrompt();
    expect(prompt).toContain("<proposed_plan>");
    expect(prompt).toContain("</proposed_plan>");
    expect(prompt).toContain("## Summary");
    expect(prompt).toContain("## Key Changes");
    expect(prompt).toContain("## Test Plan");
    expect(prompt).toContain("## Assumptions");
  });

  it("tells the agent not to ask should I proceed", () => {
    expect(buildPlanModePrompt()).toContain("Do not ask");
    expect(buildPlanModePrompt()).toContain("menu handles next steps");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- `buildPlanModePrompt` not found

- [ ] **Step 3: Implement `src/core/prompt.ts`**

```typescript
const PLAN_MODE_PROMPT = `[PLAN MODE ACTIVE]
# Plan Mode (Conversational)

You are in Plan Mode. Produce a decision-complete implementation plan
before any code mutation happens.

## Mode rules

- Stay in Plan Mode until the user explicitly exits or chooses to implement.
- Do not edit files, write files, or execute the plan.
- If the user asks you to make changes or implement something, remind them
  to exit Plan Mode first by running /plan and choosing "Implement this plan",
  or by running /plan exit.
- Bash is restricted to read-only commands.
- Skills and tools listed in the system prompt are available if they operate
  through currently enabled Plan Mode tools. Skills that require edit, write,
  or mutating bash commands will be blocked.

## Phase 1 -- Explore

- Use read-only tools to inspect files, search code, check configuration.
- Resolve discoverable facts before asking the user.

## Phase 2 -- Clarify

- Ask about purpose, constraints, success criteria, preferences, and tradeoffs.
- Do not guess when ambiguity changes the outcome.

## Phase 3 -- Plan

- Once intent and implementation details are clear, produce exactly one
  <proposed_plan> block:

<proposed_plan>
# Title
## Summary
## Key Changes
## Test Plan
## Assumptions
</proposed_plan>

- The plan must be decision-complete: no open questions for the implementer.
- Do not ask "should I proceed?" -- the Plan Mode menu handles next steps.`;

export function buildPlanModePrompt(): string {
  return PLAN_MODE_PROMPT;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/prompt.ts tests/core/prompt.test.ts
git commit -m "feat: add plan mode system prompt"
```

---

### Task 3: Plan extraction and context filtering (TDD)

**Files:**
- Create: `src/core/context.ts`
- Create: `tests/core/context.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/context.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  extractProposedPlan,
  filterPlanModeEntries,
  getAssistantMessageText,
} from "../../src/core/context.ts";
import { STATE_ENTRY_TYPE } from "../../src/shared/constants.ts";

describe("extractProposedPlan", () => {
  it("extracts plan content from tags", () => {
    const text =
      "Here is my plan:\n<proposed_plan>\n# My Plan\n## Summary\nDo stuff\n</proposed_plan>\nDone.";
    expect(extractProposedPlan(text)).toBe("# My Plan\n## Summary\nDo stuff");
  });

  it("returns undefined when no plan tags present", () => {
    expect(extractProposedPlan("Just some text without plan tags")).toBeUndefined();
  });

  it("returns undefined when plan tags are empty", () => {
    expect(extractProposedPlan("<proposed_plan></proposed_plan>")).toBeUndefined();
    expect(extractProposedPlan("<proposed_plan>  </proposed_plan>")).toBeUndefined();
  });

  it("is case-insensitive for the tags", () => {
    expect(extractProposedPlan("<PROPOSED_PLAN>\n# Plan\n</PROPOSED_PLAN>")).toBe("# Plan");
  });

  it("trims whitespace from extracted content", () => {
    expect(extractProposedPlan("<proposed_plan>\n\n# Plan\n\n</proposed_plan>")).toBe("# Plan");
  });
});

describe("getAssistantMessageText", () => {
  it("returns string content directly", () => {
    const message: Record<string, unknown> = { role: "assistant", content: "hello world" };
    expect(getAssistantMessageText(message)).toBe("hello world");
  });

  it("extracts text parts from content array", () => {
    const message: Record<string, unknown> = {
      role: "assistant",
      content: [
        { type: "text", text: "line one" },
        { type: "tool_call", name: "read", input: {} },
        { type: "text", text: "line two" },
      ],
    };
    expect(getAssistantMessageText(message)).toBe("line one\nline two");
  });

  it("returns empty string when content is missing", () => {
    expect(getAssistantMessageText({})).toBe("");
    expect(getAssistantMessageText({ content: undefined })).toBe("");
  });

  it("returns empty string when content is not string or array", () => {
    expect(getAssistantMessageText({ content: 42 })).toBe("");
  });

  it("skips non-text content parts", () => {
    const message: Record<string, unknown> = {
      content: [
        { type: "tool_result", content: "result" },
        { type: "text", text: "only this" },
      ],
    };
    expect(getAssistantMessageText(message)).toBe("only this");
  });
});

describe("filterPlanModeEntries", () => {
  it("removes entries matching the state entry type", () => {
    const messages = [
      { role: "user", content: "hello" },
      { customType: STATE_ENTRY_TYPE, data: { enabled: true } },
      { role: "assistant", content: "world" },
    ];
    const filtered = filterPlanModeEntries(messages, STATE_ENTRY_TYPE);
    expect(filtered).toHaveLength(2);
    expect(filtered[0]).toEqual({ role: "user", content: "hello" });
    expect(filtered[1]).toEqual({ role: "assistant", content: "world" });
  });

  it("returns all messages when no state entries exist", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    expect(filterPlanModeEntries(messages, STATE_ENTRY_TYPE)).toHaveLength(2);
  });

  it("keeps proposed_plan blocks in assistant messages", () => {
    const messages = [
      { role: "assistant", content: "Plan:\n<proposed_plan>\n# Plan\n</proposed_plan>" },
    ];
    const filtered = filterPlanModeEntries(messages, STATE_ENTRY_TYPE);
    expect(filtered).toHaveLength(1);
    expect((filtered[0].content as string)).toContain("<proposed_plan>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- `extractProposedPlan` not found

- [ ] **Step 3: Implement `src/core/context.ts`**

```typescript
const PLAN_BLOCK_REGEX = /<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i;

export function extractProposedPlan(text: string): string | undefined {
  const match = text.match(PLAN_BLOCK_REGEX);
  const content = match?.[1]?.trim();
  return content || undefined;
}

export function getAssistantMessageText(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is Record<string, unknown> =>
        typeof part === "object" && part !== null && (part as Record<string, unknown>).type === "text",
    )
    .map((part) => String(part.text ?? ""))
    .join("\n");
}

export function filterPlanModeEntries(
  messages: Array<Record<string, unknown>>,
  entryType: string,
): Array<Record<string, unknown>> {
  return messages.filter((msg) => msg.customType !== entryType);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/context.ts tests/core/context.test.ts
git commit -m "feat: add plan extraction and context filtering"
```

---

### Task 4: Widget formatting (TDD)

**Files:**
- Create: `src/tui/widgets.ts`
- Create: `tests/tui/widgets.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tui/widgets.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createInitialState } from "../../src/core/state.ts";
import { formatWidgetLines } from "../../src/tui/widgets.ts";

describe("formatWidgetLines", () => {
  it("returns undefined when plan mode is off", () => {
    expect(formatWidgetLines(createInitialState())).toBeUndefined();
  });

  it("returns planning lines when enabled with no plan", () => {
    const state = { ...createInitialState(), enabled: true };
    const lines = formatWidgetLines(state);
    expect(lines).toBeDefined();
    expect(lines!.some((l) => l.includes("Plan mode"))).toBe(true);
    expect(lines!.some((l) => l.includes("<proposed_plan>"))).toBe(true);
  });

  it("returns plan ready lines when awaitingAction is true", () => {
    const state = { ...createInitialState(), enabled: true, awaitingAction: true };
    const lines = formatWidgetLines(state);
    expect(lines).toBeDefined();
    expect(lines!.some((l) => l.toLowerCase().includes("ready"))).toBe(true);
    expect(lines!.some((l) => l.includes("/plan"))).toBe(true);
  });

  it("returns plan ready lines when latestPlan exists", () => {
    const state = { ...createInitialState(), enabled: true, latestPlan: "some plan" };
    const lines = formatWidgetLines(state);
    expect(lines).toBeDefined();
    expect(lines!.some((l) => l.toLowerCase().includes("ready"))).toBe(true);
  });

  it("returns an array of strings", () => {
    const state = { ...createInitialState(), enabled: true };
    const lines = formatWidgetLines(state);
    expect(Array.isArray(lines)).toBe(true);
    lines!.forEach((l) => expect(typeof l).toBe("string"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- `formatWidgetLines` not found

- [ ] **Step 3: Implement `src/tui/widgets.ts`**

```typescript
import type { PlanModeState } from "../shared/types.ts";

export function formatWidgetLines(state: PlanModeState): string[] | undefined {
  if (!state.enabled) return undefined;
  if (state.awaitingAction || state.latestPlan) {
    return [
      "Proposed plan ready",
      "Use /plan to implement, revise, or exit Plan mode.",
    ];
  }
  return ["Plan mode: planning", "Produce a <proposed_plan> block."];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/tui/widgets.ts tests/tui/widgets.test.ts
git commit -m "feat: add plan mode widget formatting"
```

---

### Task 5: Wire Phase 2 event handlers in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` with Phase 2 version**

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
import type { PlanModeState } from "./shared/types.ts";
import { formatStatus } from "./tui/status.ts";
import { formatWidgetLines } from "./tui/widgets.ts";

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

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only exploration)",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();

      if (command === "exit" || command === "off") {
        doExit(ctx);
        ctx.ui.notify("Plan mode disabled.", "info");
        return;
      }

      if (state.enabled) {
        doExit(ctx);
        ctx.ui.notify("Plan mode disabled. Full access restored.", "info");
      } else {
        doEnter(ctx);
        ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
      }
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

  pi.on("before_agent_start", async (event, ctx) => {
    if (!state.enabled) return;
    // Re-apply plan mode tools each turn (handles other extensions modifying tool list)
    pi.setActiveTools(defaultPlanModeToolNames());
    // Clear stale plan state for the new turn
    state = { ...state, latestPlan: undefined, awaitingAction: false };
    updateUi(ctx);
    return { systemPrompt: event.systemPrompt + "\n\n" + buildPlanModePrompt() };
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
  });

  pi.on("context", async (event) => {
    const messages = (event.messages as Array<Record<string, unknown>>) ?? [];
    const filtered = filterPlanModeEntries(messages, STATE_ENTRY_TYPE);
    if (filtered.length !== messages.length) {
      return { messages: filtered };
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
    persist();
    clearUi(ctx);
  });
}
```

- [ ] **Step 2: Run tests to verify Phase 1 tests still pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS (Phase 1 tests must still pass)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire before_agent_start, agent_end, and context handlers"
```

---

### Task 6: Integration tests for Phase 2 handlers

**Files:**
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Append Phase 2 integration tests to `tests/index.test.ts`**

Add the following `describe` blocks at the end of `tests/index.test.ts`:

```typescript
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
    const mock = createMockPi({ activeTools: ["read", "bash", "edit", "write"] });
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    // Simulate another extension adding a mutating tool
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

    // Simulate plan having been detected in a previous turn
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

    // New turn starts
    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base" },
      ctx,
    );
    // Status should revert to "plan active" (plan cleared for new turn)
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
          { role: "assistant", content: "<proposed_plan>\n# Plan\n</proposed_plan>" },
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
        messages: [{ role: "assistant", content: "Just some text, no plan yet." }],
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

    const entriesBefore = mock.entries.filter((e) => e.customType === "plan-mode-state").length;

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          { role: "assistant", content: "<proposed_plan>\n# Plan\n</proposed_plan>" },
        ],
      },
      ctx,
    );

    const entriesAfter = mock.entries.filter((e) => e.customType === "plan-mode-state").length;
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

    // No plan-mode-state entries to filter, so result is undefined (original messages kept)
    // OR if result is returned, the plan block must be intact
    if (result) {
      const msgs = (result as { messages: Array<{ content: string }> }).messages;
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
          { role: "assistant", content: "<proposed_plan>\n# Plan\n</proposed_plan>" },
        ],
      },
      ctx,
    );

    const widget = ctx.widgets.get("pi-plan") as string[];
    expect(widget).toBeDefined();
    expect(widget.some((line) => line.toLowerCase().includes("ready"))).toBe(true);
  });

  it("clears widget when plan mode exits", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx); // on
    expect(ctx.widgets.get("pi-plan")).toBeDefined();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // off
    expect(ctx.widgets.get("pi-plan")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/index.test.ts
git commit -m "test: add Phase 2 integration tests"
```

---

### Task 7: Final verification

**Files:** None

- [ ] **Step 1: Run the full check suite**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm check`

This runs `biome lint . && tsc --noEmit && vitest run`. All three must pass.

- [ ] **Step 2: Fix any lint or type errors**

If biome reports formatting issues: `pnpm format`
If biome reports lint issues: fix them manually in the reported file.
If tsc reports type errors: fix them in the relevant file.
Re-run `pnpm check` after each fix until clean.

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
src/tui/status.ts
src/tui/widgets.ts
tests/core/context.test.ts
tests/core/prompt.test.ts
tests/core/safety.test.ts
tests/core/state.test.ts
tests/core/tools.test.ts
tests/helpers.ts
tests/index.test.ts
tests/tui/status.test.ts
tests/tui/widgets.test.ts
```
