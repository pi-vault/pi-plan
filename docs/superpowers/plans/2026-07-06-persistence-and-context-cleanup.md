# Persistence and Context Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent tool selections, context stripping of plan blocks, display-only plan messages, and try/catch safety to pi-plan.

**Architecture:** Four independent improvements layered onto the existing extension. Each phase produces a working commit. New pure modules (`config.ts`, `plan-file.ts`) handle I/O; existing modules (`context.ts`, `tools.ts`) gain helper functions; `index.ts` wires them together.

**Tech Stack:** TypeScript, Node.js `node:fs/promises`, vitest, `@earendil-works/pi-coding-agent` extension API

---

## Phase 1: Try/Catch Safety Wrappers

Simplest change. Two new functions, two call-site replacements.

### Task 1.1: Add safe wrapper functions to tools.ts

**Files:**

- Modify: `src/core/tools.ts`
- Test: `tests/core/tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/tools.test.ts`:

```ts
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
} from "../../src/core/tools.ts";

describe("safeGetAllTools", () => {
  it("returns tools from pi.getAllTools()", () => {
    const tools = [{ name: "read", sourceInfo: { source: "builtin" } }];
    const pi = { getAllTools: () => tools } as any;
    expect(safeGetAllTools(pi)).toEqual(tools);
  });

  it("returns empty array when getAllTools throws", () => {
    const pi = {
      getAllTools: () => {
        throw new Error("not bound");
      },
    } as any;
    expect(safeGetAllTools(pi)).toEqual([]);
  });
});

describe("safeGetActiveTools", () => {
  it("returns tools from pi.getActiveTools()", () => {
    const pi = { getActiveTools: () => ["read", "bash"] } as any;
    expect(safeGetActiveTools(pi)).toEqual(["read", "bash"]);
  });

  it("returns DEFAULT_TOOLS when getActiveTools throws", () => {
    const pi = {
      getActiveTools: () => {
        throw new Error("not bound");
      },
    } as any;
    expect(safeGetActiveTools(pi)).toEqual(["read", "bash", "edit", "write"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/core/tools.test.ts`
Expected: FAIL — `safeGetAllTools` and `safeGetActiveTools` not exported

- [ ] **Step 3: Implement the safe wrappers**

Add to `src/core/tools.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ToolSelectorItem } from "../tui/tool-selector-state.ts";
import { DEFAULT_TOOLS, SAFE_BUILTIN_PLAN_TOOLS } from "../shared/constants.ts";

export function safeGetAllTools(pi: ExtensionAPI): ToolSelectorItem[] {
  try {
    return pi.getAllTools() as ToolSelectorItem[];
  } catch {
    return [];
  }
}

export function safeGetActiveTools(pi: ExtensionAPI): string[] {
  try {
    return pi.getActiveTools();
  } catch {
    return [...DEFAULT_TOOLS];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/tools.test.ts`
Expected: PASS

### Task 1.2: Replace direct API calls in index.ts

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Update imports in index.ts**

Change the import from `./core/tools.ts`:

```ts
import {
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
} from "./core/tools.ts";
```

- [ ] **Step 2: Replace `pi.getActiveTools()` in activatePlanModeTools**

Change:

```ts
function activatePlanModeTools(): void {
  if (previousTools === undefined) {
    previousTools = safeGetActiveTools(pi);
  }
  pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames));
}
```

- [ ] **Step 3: Replace `pi.getAllTools()` in runToolSelector**

Change:

```ts
  async function runToolSelector(ctx: ExtensionContext): Promise<void> {
    const allTools = safeGetAllTools(pi);
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/core/tools.ts src/index.ts tests/core/tools.test.ts
git commit -m "feat: add try/catch safety wrappers for getAllTools and getActiveTools"
```

---

## Phase 2: Display-Only Proposed Plan Message

### Task 2.1: Add PROPOSED_PLAN_MESSAGE_TYPE constant

**Files:**

- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add the constant**

Add after the existing constant declarations in `src/shared/constants.ts`:

```ts
export const PROPOSED_PLAN_MESSAGE_TYPE = "proposed-plan";
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

### Task 2.2: Send display message in agent_end

**Files:**

- Modify: `src/index.ts`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `agent_end` describe block in `tests/index.test.ts`:

```ts
it("sends a display-only proposed-plan message when plan is detected", async () => {
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
          content:
            "<proposed_plan>\n# The Plan\n## Summary\nDo it\n</proposed_plan>",
        },
      ],
    },
    ctx,
  );

  const planMessage = mock.messages.find(
    (m) => (m.message as any).customType === "proposed-plan",
  );
  expect(planMessage).toBeDefined();
  expect((planMessage!.message as any).display).toBe(true);
  expect((planMessage!.message as any).content).toContain("# The Plan");
  expect(planMessage!.options).toEqual({ triggerTurn: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/index.test.ts`
Expected: FAIL — no message sent with customType "proposed-plan"

- [ ] **Step 3: Add sendMessage call in agent_end handler**

In `src/index.ts`, update the `agent_end` handler. After `updateUi(ctx);` and before `clearPendingMenu();`, add:

```ts
pi.sendMessage(
  {
    customType: PROPOSED_PLAN_MESSAGE_TYPE,
    content: `**Proposed Plan**\n\n${plan}`,
    display: true,
  },
  { triggerTurn: false },
);
```

Also add `PROPOSED_PLAN_MESSAGE_TYPE` to the imports from `./shared/constants.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/index.test.ts`
Expected: PASS

### Task 2.3: Filter proposed-plan messages from context when plan mode is off

**Files:**

- Modify: `src/core/context.ts`
- Modify: `src/index.ts`
- Test: `tests/core/context.test.ts`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Write the failing unit test for filterPlanModeMessages**

Add to `tests/core/context.test.ts`:

```ts
import {
  extractProposedPlan,
  filterPlanModeEntries,
  filterPlanModeMessages,
  getAssistantMessageText,
} from "../../src/core/context.ts";
import {
  PROPOSED_PLAN_MESSAGE_TYPE,
  STATE_ENTRY_TYPE,
} from "../../src/shared/constants.ts";

describe("filterPlanModeMessages", () => {
  it("removes both state entries and proposed-plan messages", () => {
    const messages = [
      { role: "user", content: "hello" },
      { customType: STATE_ENTRY_TYPE, data: { enabled: true } },
      {
        customType: PROPOSED_PLAN_MESSAGE_TYPE,
        content: "plan text",
        display: true,
      },
      { role: "assistant", content: "world" },
    ];
    const filtered = filterPlanModeMessages(
      messages,
      STATE_ENTRY_TYPE,
      PROPOSED_PLAN_MESSAGE_TYPE,
    );
    expect(filtered).toHaveLength(2);
    expect(filtered[0]).toEqual({ role: "user", content: "hello" });
    expect(filtered[1]).toEqual({ role: "assistant", content: "world" });
  });

  it("keeps proposed-plan messages when planMessageType is undefined", () => {
    const messages = [
      {
        customType: PROPOSED_PLAN_MESSAGE_TYPE,
        content: "plan",
        display: true,
      },
      { role: "assistant", content: "world" },
    ];
    const filtered = filterPlanModeMessages(
      messages,
      STATE_ENTRY_TYPE,
      undefined,
    );
    expect(filtered).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/core/context.test.ts`
Expected: FAIL — `filterPlanModeMessages` not exported

- [ ] **Step 3: Implement filterPlanModeMessages**

Add to `src/core/context.ts`:

```ts
export function filterPlanModeMessages(
  messages: Array<Record<string, unknown>>,
  stateEntryType: string,
  planMessageType: string | undefined,
): Array<Record<string, unknown>> {
  return messages.filter((msg) => {
    if (msg.customType === stateEntryType) return false;
    if (planMessageType && msg.customType === planMessageType) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/context.test.ts`
Expected: PASS

- [ ] **Step 5: Update context handler in index.ts**

In `src/index.ts`, update the context handler to use `filterPlanModeMessages` and filter proposed-plan messages when plan mode is off:

```ts
pi.on("context", async (event) => {
  const messages =
    (event.messages as unknown as Array<Record<string, unknown>>) ?? [];
  const planMessageType = state.enabled
    ? undefined
    : PROPOSED_PLAN_MESSAGE_TYPE;
  const filtered = filterPlanModeMessages(
    messages,
    STATE_ENTRY_TYPE,
    planMessageType,
  );
  if (filtered.length !== messages.length) {
    return { messages: filtered as unknown as typeof event.messages };
  }
});
```

Update import in `src/index.ts`:

```ts
import {
  extractProposedPlan,
  filterPlanModeMessages,
  getAssistantMessageText,
} from "./core/context.ts";
```

- [ ] **Step 6: Write integration test for context filtering with plan mode off**

Add to the `context handler` describe block in `tests/index.test.ts`:

```ts
it("filters proposed-plan messages when plan mode is off", async () => {
  const mock = createMockPi();
  createExtension(mock.pi);
  const ctx = createMockContext();

  const result = await mock.fireEvent(
    "context",
    {
      type: "context",
      messages: [
        { role: "user", content: "hello" },
        { customType: "proposed-plan", content: "old plan", display: true },
        { role: "assistant", content: "world" },
      ],
    },
    ctx,
  );

  expect(result).toBeDefined();
  const { messages } = result as { messages: unknown[] };
  expect(messages).toHaveLength(2);
});

it("keeps proposed-plan messages when plan mode is on", async () => {
  const mock = createMockPi();
  createExtension(mock.pi);
  const ctx = createMockContext();
  await mock.commands.get("plan")!.handler("", ctx.ctx);

  const result = await mock.fireEvent(
    "context",
    {
      type: "context",
      messages: [
        { customType: "proposed-plan", content: "current plan", display: true },
        { role: "assistant", content: "world" },
      ],
    },
    ctx,
  );

  // No filtering needed — both messages stay
  expect(result).toBeUndefined();
});
```

- [ ] **Step 7: Run full test suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/shared/constants.ts src/core/context.ts src/index.ts tests/core/context.test.ts tests/index.test.ts
git commit -m "feat: send display-only proposed-plan message and filter from context when off"
```

---

## Phase 3: Strip Proposed Plan Blocks From Context

### Task 3.1: Add strip functions to context.ts

**Files:**

- Modify: `src/core/context.ts`
- Test: `tests/core/context.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/context.test.ts`:

```ts
import {
  extractProposedPlan,
  filterPlanModeEntries,
  filterPlanModeMessages,
  getAssistantMessageText,
  stripProposedPlanBlocks,
  stripProposedPlanBlocksFromMessages,
} from "../../src/core/context.ts";

describe("stripProposedPlanBlocks", () => {
  it("removes a single proposed_plan block", () => {
    const text = "Before\n<proposed_plan>\n# Plan\n</proposed_plan>\nAfter";
    expect(stripProposedPlanBlocks(text)).toBe("Before\n\nAfter");
  });

  it("removes multiple proposed_plan blocks", () => {
    const text =
      "A<proposed_plan>one</proposed_plan>B<proposed_plan>two</proposed_plan>C";
    expect(stripProposedPlanBlocks(text)).toBe("ABC");
  });

  it("returns text unchanged when no plan blocks", () => {
    const text = "just normal text";
    expect(stripProposedPlanBlocks(text)).toBe("just normal text");
  });

  it("is case-insensitive", () => {
    const text = "X<PROPOSED_PLAN>content</PROPOSED_PLAN>Y";
    expect(stripProposedPlanBlocks(text)).toBe("XY");
  });
});

describe("stripProposedPlanBlocksFromMessages", () => {
  it("strips plan blocks from assistant messages with string content", () => {
    const messages = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "Here: <proposed_plan>\n# Plan\n</proposed_plan>\nDone.",
      },
    ];
    const result = stripProposedPlanBlocksFromMessages(messages);
    expect(result[0]).toEqual({ role: "user", content: "hello" });
    expect((result[1] as any).content).toBe("Here: \nDone.");
  });

  it("strips plan blocks from assistant messages with array content", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Before <proposed_plan>plan</proposed_plan> after",
          },
          { type: "tool_use", name: "read" },
        ],
      },
    ];
    const result = stripProposedPlanBlocksFromMessages(messages);
    const content = (result[0] as any).content;
    expect(content[0].text).toBe("Before  after");
    expect(content[1]).toEqual({ type: "tool_use", name: "read" });
  });

  it("does not modify user messages", () => {
    const messages = [
      { role: "user", content: "<proposed_plan>user plan</proposed_plan>" },
    ];
    const result = stripProposedPlanBlocksFromMessages(messages);
    expect((result[0] as any).content).toBe(
      "<proposed_plan>user plan</proposed_plan>",
    );
  });

  it("returns same array reference when nothing to strip", () => {
    const messages = [{ role: "assistant", content: "no plan here" }];
    const result = stripProposedPlanBlocksFromMessages(messages);
    expect(result).toBe(messages);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/core/context.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement the strip functions**

Add to `src/core/context.ts`:

```ts
const PROPOSED_PLAN_BLOCK_PATTERN =
  /<proposed_plan>\s*[\s\S]*?\s*<\/proposed_plan>/gi;

export function stripProposedPlanBlocks(text: string): string {
  return text.replace(PROPOSED_PLAN_BLOCK_PATTERN, "");
}

export function stripProposedPlanBlocksFromMessages(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  let changed = false;
  const result = messages.map((msg) => {
    if (msg.role !== "assistant") return msg;
    const content = msg.content;
    if (typeof content === "string") {
      const stripped = stripProposedPlanBlocks(content);
      if (stripped !== content) {
        changed = true;
        return { ...msg, content: stripped };
      }
      return msg;
    }
    if (!Array.isArray(content)) return msg;
    let blockChanged = false;
    const newContent = content.map((block: Record<string, unknown>) => {
      if (block.type !== "text" || typeof block.text !== "string") return block;
      const stripped = stripProposedPlanBlocks(block.text as string);
      if (stripped !== block.text) {
        blockChanged = true;
        return { ...block, text: stripped };
      }
      return block;
    });
    if (blockChanged) {
      changed = true;
      return { ...msg, content: newContent };
    }
    return msg;
  });
  return changed ? result : messages;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/context.test.ts`
Expected: PASS

### Task 3.2: Wire stripping into the context handler

**Files:**

- Modify: `src/index.ts`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Write the failing integration test**

Add to the `context handler` describe block in `tests/index.test.ts`:

```ts
it("strips proposed_plan blocks from assistant messages when plan mode is off", async () => {
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
          content:
            "Here is the plan:\n<proposed_plan>\n# Old Plan\n</proposed_plan>\nEnd.",
        },
      ],
    },
    ctx,
  );

  expect(result).toBeDefined();
  const { messages } = result as { messages: Array<Record<string, unknown>> };
  expect(messages).toHaveLength(1);
  expect((messages[0] as any).content).toBe("Here is the plan:\n\nEnd.");
});

it("does not strip proposed_plan blocks when plan mode is on", async () => {
  const mock = createMockPi();
  createExtension(mock.pi);
  const ctx = createMockContext();
  await mock.commands.get("plan")!.handler("", ctx.ctx);

  const result = await mock.fireEvent(
    "context",
    {
      type: "context",
      messages: [
        {
          role: "assistant",
          content: "<proposed_plan>\n# Current Plan\n</proposed_plan>",
        },
      ],
    },
    ctx,
  );

  // No filtering — plan mode is on, no state entries to remove
  expect(result).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/index.test.ts`
Expected: FAIL — plan blocks not stripped

- [ ] **Step 3: Update context handler in index.ts**

Update the context handler to also strip plan blocks when plan mode is off:

```ts
pi.on("context", async (event) => {
  const messages =
    (event.messages as unknown as Array<Record<string, unknown>>) ?? [];
  const planMessageType = state.enabled
    ? undefined
    : PROPOSED_PLAN_MESSAGE_TYPE;
  const filtered = filterPlanModeMessages(
    messages,
    STATE_ENTRY_TYPE,
    planMessageType,
  );
  const processed = state.enabled
    ? filtered
    : stripProposedPlanBlocksFromMessages(filtered);
  if (processed !== messages || processed.length !== messages.length) {
    return { messages: processed as unknown as typeof event.messages };
  }
});
```

Add `stripProposedPlanBlocksFromMessages` to the import from `./core/context.ts`.

- [ ] **Step 4: Update existing test that expects plan blocks to remain**

The existing test "keeps proposed_plan blocks in assistant messages" in `tests/index.test.ts` now expects the opposite behavior when plan mode is off. Replace it:

```ts
it("strips proposed_plan blocks from assistant messages when plan mode is off", async () => {
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

  expect(result).toBeDefined();
  const msgs = (result as { messages: Array<{ content: string }> }).messages;
  expect(msgs[0].content).not.toContain("<proposed_plan>");
});
```

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/core/context.ts src/index.ts tests/core/context.test.ts tests/index.test.ts
git commit -m "feat: strip proposed_plan blocks from context when plan mode is off"
```

---

## Phase 4: Save Plan to File on Exit

### Task 4.1: Create plan-file module

**Files:**

- Create: `src/core/plan-file.ts`
- Create: `tests/core/plan-file.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/plan-file.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { savePlanToFile } from "../../src/core/plan-file.ts";

function createMockCtx(options: {
  inputResponse?: string | undefined;
  cwd: string;
}) {
  const notifications: Array<{ message: string; type?: string }> = [];
  return {
    ctx: {
      cwd: options.cwd,
      ui: {
        async input(_title: string, _placeholder?: string) {
          return options.inputResponse;
        },
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
      },
    } as any,
    notifications,
  };
}

describe("savePlanToFile", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes plan to the specified path", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: "my-plan.md", cwd: tempDir });

    await savePlanToFile("# The Plan\n## Summary\nDo stuff", mock.ctx);

    const content = readFileSync(join(tempDir, "my-plan.md"), "utf-8");
    expect(content).toBe("# The Plan\n## Summary\nDo stuff");
  });

  it("resolves relative paths against cwd", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: "sub/plan.md", cwd: tempDir });

    await savePlanToFile("# Plan", mock.ctx);

    const content = readFileSync(join(tempDir, "sub", "plan.md"), "utf-8");
    expect(content).toBe("# Plan");
  });

  it("skips writing when user cancels input", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: undefined, cwd: tempDir });

    await savePlanToFile("# Plan", mock.ctx);

    expect(existsSync(join(tempDir, "proposed-plan.md"))).toBe(false);
    expect(mock.notifications).toHaveLength(0);
  });

  it("skips writing when user provides empty string", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: "  ", cwd: tempDir });

    await savePlanToFile("# Plan", mock.ctx);

    expect(mock.notifications).toHaveLength(0);
  });

  it("handles absolute paths", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const absPath = join(tempDir, "abs-plan.md");
    const mock = createMockCtx({ inputResponse: absPath, cwd: "/other" });

    await savePlanToFile("# Abs Plan", mock.ctx);

    const content = readFileSync(absPath, "utf-8");
    expect(content).toBe("# Abs Plan");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/core/plan-file.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement savePlanToFile**

Create `src/core/plan-file.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export async function savePlanToFile(
  plan: string,
  ctx: ExtensionContext,
): Promise<void> {
  const input = await ctx.ui.input("Save plan to:", "proposed-plan.md");
  if (!input || !input.trim()) return;

  const filePath = isAbsolute(input.trim())
    ? input.trim()
    : resolve(ctx.cwd, input.trim());

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, plan, "utf-8");
    ctx.ui.notify(`Plan saved to ${filePath}`, "info");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to save plan: ${message}`, "warning");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/plan-file.test.ts`
Expected: PASS

### Task 4.2: Wire plan save into exit paths

**Files:**

- Modify: `src/index.ts`
- Modify: `tests/helpers.ts`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Add `input` and `cwd` to mock context**

In `tests/helpers.ts`, update `MockContext` interface to include `inputCalls`:

```ts
export interface MockContext {
  ctx: ExtensionCommandContext;
  statuses: Map<string, string | undefined>;
  notifications: Array<{ message: string; type?: string }>;
  widgets: Map<string, unknown>;
  selectCalls: Array<{ title: string; options: string[] }>;
  inputCalls: Array<{ title: string; placeholder?: string }>;
  customCalls: Array<{ result: unknown }>;
}
```

Update `createMockContext` options to accept `cwd` and `inputResponses`:

```ts
export function createMockContext(options?: {
  entries?: SessionEntry[];
  hasUI?: boolean;
  isIdle?: boolean;
  cwd?: string;
  selectResponses?: string[];
  inputResponses?: (string | undefined)[];
  customResult?: unknown;
}): MockContext {
```

Inside the function body, add the input queue and tracking array alongside `selectQueue`:

```ts
const inputQueue = [...(options?.inputResponses ?? [])];
const inputCalls: Array<{ title: string; placeholder?: string }> = [];
```

Add `input` method to `ctx.ui` (after `select`):

```ts
        async input(title: string, placeholder?: string) {
          inputCalls.push({ title, placeholder });
          return inputQueue.shift();
        },
```

Add `cwd` to the `ctx` object (after `isIdle`):

```ts
      cwd: options?.cwd ?? "/mock/cwd",
```

Add `inputCalls` to the returned `mockCtx` object:

```ts
    inputCalls,
```

- [ ] **Step 2: Write the failing test**

Add to the `plan menu actions` describe block in `tests/index.test.ts`:

```ts
it("implement: prompts to save plan before exiting", async () => {
  const mock = createMockPi();
  createExtension(mock.pi);
  const ctx = createMockContext({
    selectResponses: [PLAN_MENU_LABELS.implement],
    inputResponses: [undefined], // user cancels save
  });

  const handler = mock.commands.get("plan")!.handler;
  await handler("", ctx.ctx); // enter

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

  await handler("", ctx.ctx); // menu -> implement

  expect(ctx.inputCalls).toHaveLength(1);
  expect(ctx.inputCalls[0].title).toContain("Save plan");
});

it("exit: prompts to save plan before exiting when plan exists", async () => {
  const mock = createMockPi();
  createExtension(mock.pi);
  const ctx = createMockContext({
    selectResponses: [PLAN_MENU_LABELS.exit],
    inputResponses: [undefined], // user cancels save
  });

  const handler = mock.commands.get("plan")!.handler;
  await handler("", ctx.ctx); // enter

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

  await handler("", ctx.ctx); // menu -> exit

  expect(ctx.inputCalls).toHaveLength(1);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- tests/index.test.ts`
Expected: FAIL

- [ ] **Step 4: Wire savePlanToFile into handleMenuAction and command handlers**

In `src/index.ts`, import `savePlanToFile`:

```ts
import { savePlanToFile } from "./core/plan-file.ts";
```

Update `handleMenuAction`:

```ts
  async function handleMenuAction(action: PlanMenuAction, ctx: ExtensionContext): Promise<void> {
    switch (action) {
      case "implement": {
        const plan = state.latestPlan;
        if (plan) await savePlanToFile(plan, ctx);
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
        if (state.latestPlan) await savePlanToFile(state.latestPlan, ctx);
        doExit(ctx);
        ctx.ui.notify("Plan mode disabled.", "info");
        break;
```

Update the `plan:exit` command handler:

```ts
pi.registerCommand("plan:exit", {
  description: "Exit plan mode",
  handler: async (_args, ctx) => {
    clearPendingMenu();
    if (state.enabled) {
      if (state.latestPlan) await savePlanToFile(state.latestPlan, ctx);
      doExit(ctx);
    }
    ctx.ui.notify("Plan mode disabled.", "info");
  },
});
```

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/core/plan-file.ts tests/core/plan-file.test.ts src/index.ts tests/helpers.ts tests/index.test.ts
git commit -m "feat: save plan to file on exit paths"
```

---

## Phase 5: Persistent Tool Config

### Task 5.1: Create config module

**Files:**

- Create: `src/core/config.ts`
- Create: `tests/core/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/config.test.ts`:

```ts
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConfigFilePath,
  readToolConfig,
  writeToolConfig,
} from "../../src/core/config.ts";

describe("getConfigFilePath", () => {
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("returns path under PI_CODING_AGENT_DIR", () => {
    process.env.PI_CODING_AGENT_DIR = "/home/user/.config/pi";
    expect(getConfigFilePath()).toBe(
      "/home/user/.config/pi/extensions/plan-tools.json",
    );
  });

  it("returns undefined when env var is unset", () => {
    delete process.env.PI_CODING_AGENT_DIR;
    expect(getConfigFilePath()).toBeUndefined();
  });

  it("returns undefined when env var is empty", () => {
    process.env.PI_CODING_AGENT_DIR = "";
    expect(getConfigFilePath()).toBeUndefined();
  });
});

describe("readToolConfig", () => {
  let tempDir: string;
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-config-"));
    process.env.PI_CODING_AGENT_DIR = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("returns undefined when file does not exist", async () => {
    expect(await readToolConfig()).toBeUndefined();
  });

  it("returns parsed config when file exists", async () => {
    const configPath = join(tempDir, "extensions", "plan-tools.json");
    const dir = join(tempDir, "extensions");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ read: true, custom: true, edit: false }),
    );

    const config = await readToolConfig();
    expect(config).toEqual({ read: true, custom: true, edit: false });
  });

  it("returns undefined when file contains invalid JSON", async () => {
    const dir = join(tempDir, "extensions");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plan-tools.json"), "not json");

    expect(await readToolConfig()).toBeUndefined();
  });

  it("returns undefined when env var is unset", async () => {
    delete process.env.PI_CODING_AGENT_DIR;
    expect(await readToolConfig()).toBeUndefined();
  });
});

describe("writeToolConfig", () => {
  let tempDir: string;
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-config-"));
    process.env.PI_CODING_AGENT_DIR = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("writes config to the correct path", async () => {
    const config = { read: true, bash: true, custom: true };
    await writeToolConfig(config);

    const configPath = join(tempDir, "extensions", "plan-tools.json");
    expect(existsSync(configPath)).toBe(true);
    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content).toEqual(config);
  });

  it("creates the extensions directory if missing", async () => {
    await writeToolConfig({ read: true });

    const dir = join(tempDir, "extensions");
    expect(existsSync(dir)).toBe(true);
  });

  it("does nothing when env var is unset", async () => {
    delete process.env.PI_CODING_AGENT_DIR;
    await writeToolConfig({ read: true });
    // No throw, no file created
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/core/config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the config module**

Create `src/core/config.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CONFIG_FILENAME = "extensions/plan-tools.json";

export function getConfigFilePath(): string | undefined {
  const dir = process.env.PI_CODING_AGENT_DIR;
  if (!dir) return undefined;
  return join(dir, CONFIG_FILENAME);
}

export async function readToolConfig(): Promise<
  Record<string, boolean> | undefined
> {
  const filePath = getConfigFilePath();
  if (!filePath) return undefined;

  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return undefined;
    }
    return parsed as Record<string, boolean>;
  } catch {
    return undefined;
  }
}

export async function writeToolConfig(
  config: Record<string, boolean>,
): Promise<void> {
  const filePath = getConfigFilePath();
  if (!filePath) return;

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // Silently fail — caller should notify user
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/config.test.ts`
Expected: PASS

### Task 5.2: Add config converters to tools.ts

**Files:**

- Modify: `src/core/tools.ts`
- Test: `tests/core/tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/tools.test.ts`:

```ts
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
  toolConfigToSelectedNames,
  selectedNamesToToolConfig,
} from "../../src/core/tools.ts";

describe("toolConfigToSelectedNames", () => {
  it("returns names where value is true, excluding safe builtins", () => {
    const config = {
      read: true,
      bash: true,
      custom: true,
      edit: false,
      another: true,
    };
    const result = toolConfigToSelectedNames(config);
    expect(result).toContain("custom");
    expect(result).toContain("another");
    expect(result).not.toContain("read");
    expect(result).not.toContain("bash");
    expect(result).not.toContain("edit");
  });

  it("returns empty array when all values are false", () => {
    const config = { custom: false, edit: false };
    expect(toolConfigToSelectedNames(config)).toEqual([]);
  });

  it("returns empty array for empty config", () => {
    expect(toolConfigToSelectedNames({})).toEqual([]);
  });
});

describe("selectedNamesToToolConfig", () => {
  it("builds full map from selected names and all tools", () => {
    const allTools = [
      { name: "read", sourceInfo: { source: "builtin" } },
      { name: "bash", sourceInfo: { source: "builtin" } },
      { name: "edit", sourceInfo: { source: "builtin" } },
      { name: "custom", sourceInfo: { source: "extension" } },
      { name: "another", sourceInfo: { source: "extension" } },
    ];
    const selected = ["custom"];
    const config = selectedNamesToToolConfig(selected, allTools);
    expect(config).toEqual({
      read: true,
      bash: true,
      edit: false,
      custom: true,
      another: false,
    });
  });

  it("marks safe builtins as true regardless of selection", () => {
    const allTools = [
      { name: "read", sourceInfo: { source: "builtin" } },
      { name: "grep", sourceInfo: { source: "builtin" } },
    ];
    const config = selectedNamesToToolConfig([], allTools);
    expect(config.read).toBe(true);
    expect(config.grep).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/core/tools.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement converters**

Add to `src/core/tools.ts`:

```ts
import type { ToolSelectorItem } from "../tui/tool-selector-state.ts";

export function toolConfigToSelectedNames(
  config: Record<string, boolean>,
): string[] {
  return Object.entries(config)
    .filter(([name, enabled]) => enabled && !SAFE_BUILTIN_PLAN_TOOLS.has(name))
    .map(([name]) => name);
}

export function selectedNamesToToolConfig(
  selectedNames: string[],
  allTools: ToolSelectorItem[],
): Record<string, boolean> {
  const selected = new Set(selectedNames);
  const config: Record<string, boolean> = {};
  for (const tool of allTools) {
    if (SAFE_BUILTIN_PLAN_TOOLS.has(tool.name)) {
      config[tool.name] = true;
    } else {
      config[tool.name] = selected.has(tool.name);
    }
  }
  return config;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/tools.test.ts`
Expected: PASS

### Task 5.3: Wire config into session_start and tool selector

**Files:**

- Modify: `src/index.ts`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Write the failing test for config loading on session_start**

Add to `tests/index.test.ts` in the `session persistence` describe block:

```ts
it("loads tool selections from config file on session_start", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
    await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const tempDir = mkdtempSync(join(tmpdir(), "pi-plan-config-"));
  const configDir = join(tempDir, "extensions");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "plan-tools.json"),
    JSON.stringify({ read: true, bash: true, custom_tool: true, edit: false }),
  );

  const originalEnv = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = tempDir;

  try {
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

    // Should include custom_tool from config
    expect(mock.activeTools).toContain("custom_tool");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).not.toContain("edit");
  } finally {
    process.env.PI_CODING_AGENT_DIR = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/index.test.ts`
Expected: FAIL — config file not loaded

- [ ] **Step 3: Wire config loading into session_start**

In `src/index.ts`, import config functions:

```ts
import { readToolConfig, writeToolConfig } from "./core/config.ts";
import {
  toolConfigToSelectedNames,
  selectedNamesToToolConfig,
} from "./core/tools.ts";
```

Update the `session_start` handler:

```ts
pi.on("session_start", async (_event, ctx) => {
  const entries = ctx.sessionManager.getEntries();
  state = restoreState(entries);

  if (pi.getFlag("plan") === true) {
    state = enterPlanMode(state);
  }

  // Load persistent tool config (overrides session-entry selections)
  const toolConfig = await readToolConfig();
  if (toolConfig) {
    state = {
      ...state,
      selectedToolNames: toolConfigToSelectedNames(toolConfig),
    };
  }

  if (state.enabled) {
    activatePlanModeTools();
  }
  updateUi(ctx);
});
```

- [ ] **Step 4: Wire config writing into tool selector save**

In the `runToolSelector` function, after `state = { ...state, selectedToolNames: selections };`, add config write:

```ts
state = { ...state, selectedToolNames: selections };
activatePlanModeTools();
persist();

// Persist to config file
const allTools = safeGetAllTools(pi);
const toolConfig = selectedNamesToToolConfig(selections, allTools);
writeToolConfig(toolConfig).catch(() => {});

const count = selections.length;
```

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/config.ts src/core/tools.ts src/index.ts tests/core/config.test.ts tests/core/tools.test.ts tests/index.test.ts
git commit -m "feat: persist tool selections to config file across Pi sessions"
```

---

## Verification

- [ ] **Run full check**

Run: `pnpm check`
Expected: Lint, typecheck, and all tests pass.

- [ ] **Manual smoke test (optional)**

If running locally with Pi:

1. `pi -e ./` to load the extension
2. `/plan` to enter plan mode
3. `/plan:tools` to select some tools, verify they persist after quit/relaunch
4. Get a proposed plan, verify display message appears in history
5. Exit plan mode, verify plan-to-file prompt appears
6. Verify context no longer contains plan blocks after exit
