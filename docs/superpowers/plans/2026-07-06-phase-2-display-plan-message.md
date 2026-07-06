# Phase 2: Display-Only Proposed Plan Message

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After detecting a proposed plan, send a display-only message into the session timeline and filter these messages from LLM context when plan mode is off.

**Architecture:** New constant, one `pi.sendMessage` call in the `agent_end` handler, and a new `filterPlanModeMessages` function that replaces `filterPlanModeEntries` in the context handler.

**Tech Stack:** TypeScript, vitest, `@earendil-works/pi-coding-agent` extension API

**Prerequisite:** Phase 1 completed (safe wrappers in place).

---

### Task 2.1: Add PROPOSED_PLAN_MESSAGE_TYPE constant

**Files:**

- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add the constant**

Add after `export const DEFAULT_TOOLS = [...]` in `src/shared/constants.ts`:

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

In `src/index.ts`, add `PROPOSED_PLAN_MESSAGE_TYPE` to the imports from `./shared/constants.ts`:

```ts
import {
  BLOCKED_BUILTIN_TOOLS,
  PROPOSED_PLAN_MESSAGE_TYPE,
  STATE_ENTRY_TYPE,
  STATUS_KEY,
  WIDGET_KEY,
} from "./shared/constants.ts";
```

In the `agent_end` handler, after `updateUi(ctx);` and before `clearPendingMenu();`, add:

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

Add to `tests/core/context.test.ts` (update the import at the top to include the new function):

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

Add to `src/core/context.ts` (after the existing `filterPlanModeEntries` function):

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

Update the import from `./core/context.ts` to use `filterPlanModeMessages` instead of `filterPlanModeEntries`:

```ts
import {
  extractProposedPlan,
  filterPlanModeMessages,
  getAssistantMessageText,
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
  if (filtered.length !== messages.length) {
    return { messages: filtered as unknown as typeof event.messages };
  }
});
```

- [ ] **Step 6: Write integration tests for context filtering**

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
