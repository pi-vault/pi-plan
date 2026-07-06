# Phase 4: Save Plan to File on Exit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When exiting plan mode (via implement or exit), prompt the user for a file path and save the latest plan to disk.

**Architecture:** New `src/core/plan-file.ts` module handles prompting and file I/O. Exit paths in `src/index.ts` await this before clearing state.

**Tech Stack:** TypeScript, Node.js `node:fs/promises`, vitest

**Prerequisite:** Phases 1-3 completed.

---

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

  it("notifies on success", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: "plan.md", cwd: tempDir });

    await savePlanToFile("# Plan", mock.ctx);

    expect(mock.notifications).toHaveLength(1);
    expect(mock.notifications[0].message).toContain("Plan saved");
    expect(mock.notifications[0].type).toBe("info");
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

Add `input` method to `ctx.ui` (after the `select` method):

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

- [ ] **Step 2: Write the failing tests**

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

  await handler("", ctx.ctx); // menu -> exit

  expect(ctx.inputCalls).toHaveLength(1);
});

it("exit: does not prompt when no plan exists", async () => {
  const mock = createMockPi();
  createExtension(mock.pi);
  const ctx = createMockContext({
    selectResponses: [PLAN_MENU_LABELS.exit],
    inputResponses: [],
  });

  const handler = mock.commands.get("plan")!.handler;
  await handler("", ctx.ctx); // enter plan mode
  await handler("", ctx.ctx); // menu -> exit (no plan yet)

  expect(ctx.inputCalls).toHaveLength(0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- tests/index.test.ts`
Expected: FAIL — no input prompt shown

- [ ] **Step 4: Wire savePlanToFile into handleMenuAction and command handlers**

In `src/index.ts`, add the import:

```ts
import { savePlanToFile } from "./core/plan-file.ts";
```

Update `handleMenuAction`:

```ts
async function handleMenuAction(
  action: PlanMenuAction,
  ctx: ExtensionContext,
): Promise<void> {
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
