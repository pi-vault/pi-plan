# Phase 3: Strip Proposed Plan Blocks From Context

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When plan mode is off, strip `<proposed_plan>...</proposed_plan>` blocks from assistant message content in the LLM context to prevent stale plans from polluting subsequent turns.

**Architecture:** Two new pure functions in `src/core/context.ts` for stripping, wired into the context handler in `src/index.ts`.

**Tech Stack:** TypeScript, vitest, regex

**Prerequisite:** Phase 2 completed (context handler already uses `filterPlanModeMessages`).

---

### Task 3.1: Add strip functions to context.ts

**Files:**

- Modify: `src/core/context.ts`
- Test: `tests/core/context.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/context.test.ts` (update the import at the top):

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
Expected: FAIL — `stripProposedPlanBlocks` and `stripProposedPlanBlocksFromMessages` not exported

- [ ] **Step 3: Implement the strip functions**

Add to `src/core/context.ts` (after the existing functions):

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

Add `stripProposedPlanBlocksFromMessages` to the import from `./core/context.ts`:

```ts
import {
  extractProposedPlan,
  filterPlanModeMessages,
  getAssistantMessageText,
  stripProposedPlanBlocksFromMessages,
} from "./core/context.ts";
```

Replace the context handler:

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

- [ ] **Step 4: Update existing test that expects plan blocks to remain**

The existing test "keeps proposed_plan blocks in assistant messages" in `tests/index.test.ts` now expects the opposite behavior (plan mode is off, so blocks are stripped). Replace it with:

```ts
it("strips proposed_plan blocks from assistant messages when plan mode is off (basic)", async () => {
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
