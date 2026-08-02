# Preserve Plan Context Across Mode Switches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Plan mode and normal mode share one conversation while applying busy mode changes only after Pi becomes idle.

**Architecture:** Mode is session state, not a context boundary. The context hook preserves every real user and assistant message while filtering only legacy v0.3 `customType: "proposed-plan"` duplicates. `src/index.ts` owns one non-persisted pending transition; idle requests apply immediately, busy requests replace that slot, and `agent_settled` applies the latest request after Save-plan cleanup.

**Tech Stack:** TypeScript, Pi extension API, Vitest, Biome, pnpm.

**Design:** `docs/superpowers/specs/2026-08-02-preserve-plan-context-design.md`

---

## File Map

- Modify `src/core/context.ts`: retain plan capture and replace assistant sanitization with a legacy-custom-message compatibility filter.
- Modify `src/core/state.ts`: preserve `latestPlan` when entering Plan mode.
- Modify `src/index.ts`: keep the context compatibility hook, clear menu cache at real turn start, queue busy transitions, and submit `Implement the plan.` after switching to normal mode.
- Modify `tests/helpers.ts`: let integration tests move a mock context from busy to idle.
- Modify `tests/core/context.test.ts` and `tests/core/state.test.ts`: cover the compatibility filter and cache-preserving entry.
- Modify `tests/index.test.ts`: cover context preservation, immediate and deferred transitions, latest-request-wins behavior, cache lifecycle, Save-plan ordering, and shutdown cleanup.
- Modify `README.md` and `CHANGELOG.md`: document continuous context and idle-deferred switching.
- Keep `src/shared/constants.ts` unchanged: `PROPOSED_PLAN_MESSAGE_TYPE` is still required for old-session compatibility.

### Task 1: Preserve conversation messages and legacy-session compatibility

**Files:**
- Modify: `tests/core/context.test.ts:1-150`
- Modify: `tests/core/state.test.ts:45-66`
- Modify: `tests/index.test.ts:927-1060`
- Modify: `src/core/context.ts:1-87`
- Modify: `src/core/state.ts:14-16`
- Modify: `src/index.ts:1-5,328-330`

- [ ] **Step 1: Replace the sanitizer unit tests with compatibility-filter tests and update the entry-state expectation**

  In `tests/core/context.test.ts`, import `filterLegacyProposedPlanMessages` instead of `sanitizePlanModeContext` and replace the sanitizer describe block with:

  ```ts
  describe("filterLegacyProposedPlanMessages", () => {
    it("removes only legacy custom plan messages", () => {
      const plan = assistantText("<proposed_plan>\n# Current\n</proposed_plan>");
      const messages = [
        user("hello"),
        proposedPlanMessage("old duplicate"),
        plan,
      ];

      expect(filterLegacyProposedPlanMessages(messages)).toEqual({
        messages: [user("hello"), plan],
      });
    });

    it("leaves assistant plan blocks and clean context unchanged", () => {
      const messages = [
        user("<proposed_plan>\n# User text\n</proposed_plan>"),
        assistantText("Before\n<proposed_plan>\n# Assistant plan\n</proposed_plan>\nAfter"),
      ];

      expect(filterLegacyProposedPlanMessages(messages)).toBeUndefined();
    });
  });
  ```

  In `tests/core/state.test.ts`, replace the `enterPlanMode` cache test with:

  ```ts
  it("preserves the latest plan and clears awaiting action", () => {
    const state = {
      ...createInitialState(),
      latestPlan: "cached plan",
      awaitingAction: true,
    };

    const next = enterPlanMode(state);

    expect(next.enabled).toBe(true);
    expect(next.latestPlan).toBe("cached plan");
    expect(next.awaitingAction).toBe(false);
  });
  ```

- [ ] **Step 2: Replace the index-level context tests with a both-modes regression**

  In `tests/index.test.ts`, replace the current `describe("context handler", ...)` block with:

  ```ts
  describe("context handler", () => {
    it.each([false, true])(
      "preserves assistant plans and filters legacy duplicates when enabled=%s",
      async (enabled) => {
        const mock = createMockPi();
        createExtension(mock.pi);
        const ctx = createMockContext();
        if (enabled) await mock.commands.get("plan")!.handler("", ctx.ctx);
        const assistantPlan = {
          role: "assistant" as const,
          content: [{ type: "text" as const, text: "<proposed_plan>\n# Plan\n</proposed_plan>" }],
        };

        const result = await mock.fireEvent(
          "context",
          {
            type: "context",
            messages: [
              { role: "user", content: "plan this" },
              {
                role: "custom",
                customType: "proposed-plan",
                content: "legacy duplicate",
                display: true,
                timestamp: 0,
              },
              assistantPlan,
            ],
          },
          ctx,
        );

        expect(result).toEqual({
          messages: [{ role: "user", content: "plan this" }, assistantPlan],
        });
      },
    );

    it("returns undefined for clean context", async () => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext();

      expect(
        await mock.fireEvent(
          "context",
          { type: "context", messages: [{ role: "user", content: "hello" }] },
          ctx,
        ),
      ).toBeUndefined();
    });
  });
  ```

- [ ] **Step 3: Run the focused tests and verify they fail for the old behavior**

  Run:

  ```bash
  pnpm vitest run tests/core/context.test.ts tests/core/state.test.ts tests/index.test.ts
  ```

  Expected: FAIL because `filterLegacyProposedPlanMessages` is not exported, `enterPlanMode` clears `latestPlan`, and normal-mode assistant plans are stripped.

- [ ] **Step 4: Replace assistant sanitization with the minimal legacy filter**

  In `src/core/context.ts`, remove `ALL_PLAN_BLOCK_PATTERN` and `sanitizeAssistantMessage`. Keep `PLAN_BLOCK_PATTERN`, `assistantText`, and `captureProposedPlan`, then add:

  ```ts
  export function filterLegacyProposedPlanMessages(
    messages: ContextEvent["messages"],
  ): { messages: ContextEvent["messages"] } | undefined {
    const filtered = messages.filter(
      (message) =>
        message.role !== "custom" || message.customType !== PROPOSED_PLAN_MESSAGE_TYPE,
    );

    return filtered.length === messages.length ? undefined : { messages: filtered };
  }
  ```

  In `src/core/state.ts`, replace `enterPlanMode` with:

  ```ts
  export function enterPlanMode(state: PlanModeState): PlanModeState {
    return { ...state, enabled: true, awaitingAction: false };
  }
  ```

  In `src/index.ts`, import `filterLegacyProposedPlanMessages` and keep a mode-independent context hook:

  ```ts
  import {
    captureProposedPlan,
    filterLegacyProposedPlanMessages,
  } from "./core/context.ts";
  ```

  ```ts
  pi.on("context", async (event) => {
    return filterLegacyProposedPlanMessages(event.messages);
  });
  ```

- [ ] **Step 5: Run the focused tests and verify they pass**

  Run:

  ```bash
  pnpm vitest run tests/core/context.test.ts tests/core/state.test.ts tests/index.test.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Commit the context and state behavior**

  ```bash
  git add src/core/context.ts src/core/state.ts src/index.ts tests/core/context.test.ts tests/core/state.test.ts tests/index.test.ts
  git commit -m "fix: preserve plan messages across mode switches"
  ```

### Task 2: Queue busy mode transitions until Pi is idle

**Files:**
- Modify: `tests/helpers.ts:29-51,131-207`
- Modify: `tests/index.test.ts:52-256,1137-1222,1652-1761`
- Modify: `src/index.ts:27-231,316-326,351-359`

- [ ] **Step 1: Make test idleness mutable**

  In `tests/helpers.ts`, add `setIdle` to `MockContext`, store idleness in a local variable, and use it from `ctx.isIdle`:

  ```ts
  export interface MockContext {
    ctx: ExtensionCommandContext;
    statuses: Map<string, string | undefined>;
    notifications: Array<{ message: string; type?: string }>;
    widgets: Map<string, unknown>;
    selectCalls: Array<{ title: string; options: string[] }>;
    inputCalls: Array<{ title: string; placeholder?: string }>;
    customCalls: Array<{ result: unknown }>;
    setIdle(value: boolean): void;
  }
  ```

  Add this beside `sessionEntries`:

  ```ts
  let idle = options?.isIdle ?? true;
  ```

  Replace the mock `isIdle` property and add the controller to the returned object:

  ```ts
  isIdle: () => idle,
  ```

  ```ts
  setIdle(value: boolean) {
    idle = value;
  },
  ```

- [ ] **Step 2: Add deferred-transition regressions**

  Add this block to `tests/index.test.ts` after the command tests:

  ```ts
  describe("deferred mode transitions", () => {
    it("queues plan entry and its prompt until agent_settled", async () => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext();
      const initialTools = [...mock.activeTools];
      ctx.setIdle(false);

      await mock.commands.get("plan")!.handler("draft a migration plan", ctx.ctx);

      expect(mock.activeTools).toEqual(initialTools);
      expect(ctx.statuses.get("pi-plan")).toBeUndefined();
      expect(mock.userMessages).toHaveLength(0);

      ctx.setIdle(true);
      await mock.fireEvent("agent_settled", { type: "agent_settled" }, ctx);

      expect(mock.activeTools).not.toContain("write");
      expect(ctx.statuses.get("pi-plan")).toBe("plan active");
      expect(mock.userMessages).toEqual([
        { content: "draft a migration plan", options: undefined },
      ]);
    });

    it("queues plan exit without changing current tools or state", async () => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext();
      await mock.commands.get("plan")!.handler("", ctx.ctx);
      const planTools = [...mock.activeTools];
      ctx.setIdle(false);

      await mock.commands.get("plan:exit")!.handler("", ctx.ctx);

      expect(mock.activeTools).toEqual(planTools);
      expect(ctx.statuses.get("pi-plan")).toBe("plan active");

      ctx.setIdle(true);
      await mock.fireEvent("agent_settled", { type: "agent_settled" }, ctx);

      expect(mock.activeTools).toContain("write");
      expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    });

    it("sends an already-active Plan prompt as an immediate follow-up", async () => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext();
      await mock.commands.get("plan")!.handler("", ctx.ctx);
      ctx.setIdle(false);

      await mock.commands.get("plan")!.handler("refine the plan", ctx.ctx);

      expect(mock.userMessages).toEqual([
        { content: "refine the plan", options: { deliverAs: "followUp" } },
      ]);
      expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    });

    it("queues implementation and consumes the plan only when settled", async () => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext({
        entries: [
          {
            type: "custom",
            customType: "plan-mode-state",
            data: { enabled: true, latestPlan: "# Queued Plan", awaitingAction: true },
            id: "queued-plan",
            parentId: null,
            timestamp: new Date().toISOString(),
          },
        ],
        selectResponses: [PLAN_MENU_LABELS.implement],
      });
      await mock.fireEvent("session_start", { type: "session_start", reason: "resume" }, ctx);
      ctx.setIdle(false);
      const entriesBefore = mock.entries.length;

      await mock.commands.get("plan")!.handler("", ctx.ctx);

      expect(mock.activeTools).not.toContain("write");
      expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
      expect(mock.userMessages).toHaveLength(0);
      expect(mock.entries).toHaveLength(entriesBefore);

      ctx.setIdle(true);
      await mock.fireEvent("agent_settled", { type: "agent_settled" }, ctx);

      expect(mock.activeTools).toContain("write");
      expect(mock.userMessages).toEqual([{ content: "Implement the plan.", options: undefined }]);
      expect(mock.entries.at(-1)?.data).toMatchObject({
        latestPlan: undefined,
        awaitingAction: false,
      });
    });

    it("lets the latest request cancel a queued entry", async () => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext({ isIdle: false });
      const initialTools = [...mock.activeTools];

      await mock.commands.get("plan")!.handler("obsolete prompt", ctx.ctx);
      await mock.commands.get("plan:exit")!.handler("", ctx.ctx);
      ctx.setIdle(true);
      await mock.fireEvent("agent_settled", { type: "agent_settled" }, ctx);

      expect(mock.activeTools).toEqual(initialTools);
      expect(ctx.statuses.get("pi-plan")).toBeUndefined();
      expect(mock.userMessages).toHaveLength(0);
    });

    it("lets /plan cancel a queued exit without opening the menu", async () => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext();
      await mock.commands.get("plan")!.handler("", ctx.ctx);
      ctx.setIdle(false);

      await mock.commands.get("plan:exit")!.handler("", ctx.ctx);
      await mock.commands.get("plan")!.handler("", ctx.ctx);

      expect(ctx.selectCalls).toHaveLength(0);
      ctx.setIdle(true);
      await mock.fireEvent("agent_settled", { type: "agent_settled" }, ctx);
      expect(ctx.statuses.get("pi-plan")).toBe("plan active");
      expect(mock.activeTools).not.toContain("write");
    });

    it("finishes Save-plan cleanup before applying a queued exit", async () => {
      const mock = createMockPi();
      const setActiveTools = vi.spyOn(mock.pi, "setActiveTools");
      createExtension(mock.pi);
      const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.save] });
      await mock.commands.get("plan")!.handler("", ctx.ctx);
      await mock.fireEvent(
        "agent_end",
        {
          type: "agent_end",
          messages: [assistantText("<proposed_plan>\n# Save Me\n</proposed_plan>")],
        },
        ctx,
      );
      await mock.commands.get("plan")!.handler("", ctx.ctx);
      ctx.setIdle(false);
      await mock.commands.get("plan:exit")!.handler("", ctx.ctx);

      ctx.setIdle(true);
      await mock.fireEvent("agent_settled", { type: "agent_settled" }, ctx);

      expect(setActiveTools.mock.calls.at(-2)?.[0]).not.toContain("write");
      expect(setActiveTools.mock.calls.at(-1)?.[0]).toContain("write");
      expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    });

    it("drops a queued transition on session shutdown", async () => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext({ isIdle: false });

      await mock.commands.get("plan")!.handler("queued prompt", ctx.ctx);
      await mock.fireEvent("session_shutdown", { type: "session_shutdown", reason: "quit" }, ctx);
      ctx.setIdle(true);
      await mock.fireEvent("agent_settled", { type: "agent_settled" }, ctx);

      expect(ctx.statuses.get("pi-plan")).toBeUndefined();
      expect(mock.activeTools).toContain("write");
      expect(mock.userMessages).toHaveLength(0);
    });

    it("warns instead of opening tool configuration while busy", async () => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext({ isIdle: false });

      await mock.commands.get("plan:tools")!.handler("", ctx.ctx);

      expect(ctx.customCalls).toHaveLength(0);
      expect(ctx.statuses.get("pi-plan")).toBeUndefined();
      expect(ctx.notifications).toContainEqual({
        message: "Plan-mode tool configuration is unavailable while Pi is busy.",
        type: "warning",
      });
    });
  });
  ```

  Delete the old `"implement: queues the full plan as a follow-up when busy"` test; the deferred implementation case above replaces it. In the existing idle `"implement: exits plan mode and sends implementation message"` test, replace the full-plan assertion with:

  ```ts
  expect(mock.userMessages).toEqual([{ content: "Implement the plan.", options: undefined }]);
  ```

  In `"warns and does nothing for stale Save plan menu action while busy"`, create an initially idle context and make it busy only after the plan is captured:

  ```ts
  const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.save] });
  ```

  ```ts
  await mock.fireEvent(
    "agent_end",
    {
      type: "agent_end",
      messages: [assistantText("<proposed_plan>\n# Plan\n</proposed_plan>")],
    },
    ctx,
  );
  ctx.setIdle(false);
  await handler("", ctx.ctx);
  ```

- [ ] **Step 3: Run the integration tests and verify the new cases fail**

  Run:

  ```bash
  pnpm vitest run tests/index.test.ts
  ```

  Expected: FAIL because busy commands currently mutate tools/state immediately and submit follow-up messages before `agent_settled`.

- [ ] **Step 4: Add the single pending-transition slot and its apply/request helpers**

  In `src/index.ts`, add the local type above `createExtension`:

  ```ts
  interface PendingModeTransition {
    enabled: boolean;
    prompt?: string;
    consumePlan?: boolean;
  }
  ```

  Add the slot beside the other in-memory lifecycle state:

  ```ts
  let pendingModeTransition: PendingModeTransition | undefined;
  ```

  Add these functions after `sendPlanModeMessage`:

  ```ts
  function applyModeTransition(
    transition: PendingModeTransition,
    ctx: ExtensionContext,
  ): void {
    if (transition.enabled !== state.enabled) {
      if (transition.enabled) doEnter(ctx);
      else doExit(ctx);
    }

    if (transition.consumePlan) {
      state = { ...state, latestPlan: undefined, awaitingAction: false };
      persist();
      updateUi(ctx);
    }

    if (transition.prompt) sendPlanModeMessage(transition.prompt, ctx);
  }

  function requestModeTransition(
    transition: PendingModeTransition,
    ctx: ExtensionContext,
  ): boolean {
    if (ctx.isIdle()) {
      pendingModeTransition = undefined;
      applyModeTransition(transition, ctx);
      return true;
    }

    pendingModeTransition = transition;
    ctx.ui.notify("Plan mode change queued until Pi is idle.", "info");
    return false;
  }
  ```

- [ ] **Step 5: Route mode-changing commands and menu actions through the helper**

  Replace the `implement`, `exit`, and `tools` menu branches with:

  ```ts
  case "implement":
    if (!state.latestPlan) {
      ctx.ui.notify("No latest plan is available to implement.", "warning");
      break;
    }
    if (
      requestModeTransition(
        { enabled: false, prompt: "Implement the plan.", consumePlan: true },
        ctx,
      )
    ) {
      ctx.ui.notify("Implementing plan. Full access restored.", "info");
    }
    break;
  case "exit":
    if (requestModeTransition({ enabled: false }, ctx)) {
      ctx.ui.notify("Plan mode disabled.", "info");
    }
    break;
  case "tools":
    await runToolSelector(ctx);
    break;
  ```

  Start `runToolSelector` with:

  ```ts
  if (!ctx.isIdle()) {
    ctx.ui.notify("Plan-mode tool configuration is unavailable while Pi is busy.", "warning");
    return;
  }
  ```

  Replace the `/plan` command's argument and disabled-mode branches with:

  ```ts
  if (command) {
    if (!state.enabled) {
      if (requestModeTransition({ enabled: true, prompt: command }, ctx)) {
        ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
      }
      return;
    }
    sendPlanModeMessage(command, ctx);
    return;
  }

  if (!state.enabled || pendingModeTransition?.enabled === false) {
    if (requestModeTransition({ enabled: true }, ctx)) {
      ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
    }
    return;
  }
  ```

  Replace the `/plan:exit` handler body with:

  ```ts
  clearPendingMenu();
  if (requestModeTransition({ enabled: false }, ctx)) {
    ctx.ui.notify("Plan mode disabled.", "info");
  }
  ```

  In `/plan:tools`, guard before `doEnter`:

  ```ts
  clearPendingMenu();
  if (!ctx.isIdle()) {
    await runToolSelector(ctx);
    return;
  }
  if (!state.enabled) {
    doEnter(ctx);
    ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
  }
  await runToolSelector(ctx);
  ```

- [ ] **Step 6: Apply the latest request after Save cleanup and drop it at shutdown**

  Replace the `agent_settled` handler with:

  ```ts
  pi.on("agent_settled", async (_event, ctx) => {
    if (savePlanSession !== undefined) {
      const didSave = savePlanSession.saved();
      savePlanSession = undefined;
      if (state.enabled) {
        pi.setActiveTools(planModeToolNames(state.selectedToolNames));
      }
      if (!didSave) {
        ctx.ui.notify("Save plan failed or was not completed.", "warning");
      }
    }

    const transition = pendingModeTransition;
    pendingModeTransition = undefined;
    if (transition) applyModeTransition(transition, ctx);
  });
  ```

  Add this line near the start of `session_shutdown`, immediately after `clearPendingMenu()`:

  ```ts
  pendingModeTransition = undefined;
  ```

- [ ] **Step 7: Run the focused tests and verify they pass**

  Run:

  ```bash
  pnpm vitest run tests/index.test.ts
  ```

  Expected: PASS, including deferred entry, exit, implementation, cancellation, Save ordering, tool configuration, and shutdown cases.

- [ ] **Step 8: Commit deferred switching**

  ```bash
  git add src/index.ts tests/helpers.ts tests/index.test.ts
  git commit -m "fix: defer plan mode switches until idle"
  ```

### Task 3: Clear the Plan-menu cache at the next real turn

**Files:**
- Modify: `tests/index.test.ts:671-823,1137-1222,1693-1728`
- Modify: `src/index.ts:274-296`

- [ ] **Step 1: Replace handoff/cache tests with shared turn-start behavior**

  Replace the restored-disabled-state handoff test with:

  ```ts
  it("clears and persists restored cache on the next normal turn without a handoff", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      entries: [
        {
          type: "custom",
          customType: "plan-mode-state",
          data: { enabled: false, latestPlan: "# Restored Plan", awaitingAction: true },
          id: "restored",
          parentId: null,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    await mock.fireEvent("session_start", { type: "session_start", reason: "resume" }, ctx);

    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );

    expect(result).toBeUndefined();
    expect(mock.entries.at(-1)?.data).toMatchObject({
      latestPlan: undefined,
      awaitingAction: false,
    });
  });
  ```

  Replace the re-entry discard test with:

  ```ts
  it("keeps cached plan actions across exit and re-entry until the next turn", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      entries: [
        {
          type: "custom",
          customType: "plan-mode-state",
          data: { enabled: true, latestPlan: "# Pending Plan", awaitingAction: true },
          id: "pending",
          parentId: null,
          timestamp: new Date().toISOString(),
        },
      ],
      selectResponses: [PLAN_MENU_LABELS.stay],
    });
    await mock.fireEvent("session_start", { type: "session_start", reason: "resume" }, ctx);

    await mock.commands.get("plan:exit")!.handler("", ctx.ctx);
    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    expect(ctx.selectCalls[0]?.options).toContain(PLAN_MENU_LABELS.implement);
    expect(ctx.selectCalls[0]?.options).toContain(PLAN_MENU_LABELS["show-plan"]);

    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );

    expect((result as { systemPrompt: string }).systemPrompt).toContain("[PLAN MODE ACTIVE]");
    expect(mock.entries.at(-1)?.data).toMatchObject({
      latestPlan: undefined,
      awaitingAction: false,
    });
    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
  });
  ```

  Update the Save-turn exit assertion to remove `[PLAN HANDOFF]`:

  ```ts
  expect(result).toBeUndefined();
  ```

- [ ] **Step 2: Run the index tests and verify the lifecycle cases fail**

  Run:

  ```bash
  pnpm vitest run tests/index.test.ts
  ```

  Expected: FAIL because normal mode still injects `[PLAN HANDOFF]` and enabled-mode cache clearing is not persisted.

- [ ] **Step 3: Replace `before_agent_start` with one shared cache-clear path**

  Keep the Save-plan branch first, then replace the remaining handler body with:

  ```ts
  if (state.latestPlan !== undefined || state.awaitingAction) {
    state = { ...state, latestPlan: undefined, awaitingAction: false };
    persist();
    updateUi(ctx);
  }

  if (!state.enabled) return;

  pi.setActiveTools(planModeToolNames(state.selectedToolNames));
  return {
    systemPrompt: `${event.systemPrompt}\n\n${buildPlanModePrompt()}`,
  };
  ```

  This removes `[PLAN HANDOFF]` entirely. Do not change the preceding Save-plan branch; it must retain the cache until its specialized turn settles.

- [ ] **Step 4: Run all behavior-focused tests**

  Run:

  ```bash
  pnpm vitest run tests/core/context.test.ts tests/core/state.test.ts tests/index.test.ts tests/core/save-plan.test.ts tests/tui/menus.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit cache lifecycle behavior**

  ```bash
  git add src/index.ts tests/index.test.ts
  git commit -m "fix: clear plan menu cache at turn start"
  ```

### Task 4: Document continuous context and idle-deferred switching

**Files:**
- Modify: `README.md:54-87`
- Modify: `CHANGELOG.md:1-5`

- [ ] **Step 1: Update the README workflow and command reference**

  Replace the Implement and Exit bullets under “Work through a plan” with:

  ```markdown
     - **Implement this plan** - turn Plan mode off, restore full tool access, and submit `Implement the plan.` in the same conversation.
     - **Exit Plan mode** - leave planning without removing prior user or assistant messages. The latest-plan menu cache remains available until the next turn starts.
  ```

  Replace the `/plan:exit` command row with:

  ```markdown
  | `/plan:exit`     | Turn off Plan mode and restore the previous tool set without removing conversation history.                        |
  ```

  Add this paragraph after the command table:

  ```markdown
  If Pi is busy, mode-changing commands and menu actions wait until the current turn settles. Only the latest queued switch is applied. Showing a plan and staying in Plan mode remain immediate; tool configuration requires Pi to be idle.
  ```

- [ ] **Step 2: Add an Unreleased changelog entry**

  Insert this above `0.4.0`:

  ```markdown
  ## [Unreleased]

  ### Changed

  - Preserve complete conversation context when switching between Plan mode and normal mode; old display-only proposed-plan messages remain filtered to avoid duplicate context.
  - Defer mode changes requested during an active turn until Pi is idle, with the latest queued request taking precedence.
  - Submit `Implement the plan.` in the retained conversation instead of copying the full cached plan into a new handoff prompt.
  ```

- [ ] **Step 3: Run documentation formatting checks**

  Run:

  ```bash
  git diff --check -- README.md CHANGELOG.md
  ```

  Expected: exit code 0 with no whitespace diagnostics.

- [ ] **Step 4: Commit the documentation**

  ```bash
  git add README.md CHANGELOG.md
  git commit -m "docs: explain persistent plan mode context"
  ```

### Task 5: Verify the complete package

**Files:** None.

- [ ] **Step 1: Run the full quality suite**

  Run:

  ```bash
  pnpm check
  ```

  Expected: Biome lint, TypeScript typecheck, and all Vitest tests pass.

- [ ] **Step 2: Verify package contents without publishing**

  Run:

  ```bash
  pnpm run pack:dry-run
  ```

  Expected: exit code 0; the tarball includes `src`, `docs/assets`, `LICENSE`, `CHANGELOG.md`, and `README.md`, with no test files or generated implementation artifacts.

- [ ] **Step 3: Check scope and worktree cleanliness**

  Run:

  ```bash
  git diff --check
  git status --short
  ```

  Expected: `git diff --check` exits 0. `git status --short` shows no uncommitted implementation changes after the task commits.

## Acceptance Criteria

- User and assistant messages, including assistant `<proposed_plan>` blocks, survive Plan → normal → Plan switches.
- Legacy `customType: "proposed-plan"` messages are filtered in both modes so old sessions do not duplicate a plan under a user role.
- Entering or exiting while idle updates tools, state, UI, and persistence immediately.
- Entering, exiting, or implementing while busy changes nothing until `agent_settled`; then the latest queued request applies once.
- An opposite busy request can cancel a queued transition even when its target matches the current mode.
- Save-plan cleanup occurs before a pending transition, and session shutdown discards pending work.
- Exit and re-entry without a turn preserve `latestPlan`; the next real turn clears and persists the menu cache in either mode.
- Implement switches to normal mode, consumes `latestPlan`, and submits exactly `Implement the plan.` in the retained conversation.
- Tool configuration while busy warns without changing mode or opening a selector.
- No persisted state field, migration, dependency, new module, session branch, Shift-Tab shortcut, or fresh-context action is added.
