# Remove Plan-Save Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove proposed-plan path prompts and file writes while preserving the latest plan for exactly the first normal-mode turn after exit.

**Architecture:** Treat `state.latestPlan` as the authoritative handoff state. A disabled state with `latestPlan` set represents one pending handoff; the first disabled-mode `before_agent_start` injects it into that turn's system prompt and consumes it. Implement actions retain the full plan in their synthetic user message so queued follow-ups do not depend on `before_agent_start`.

**Tech Stack:** TypeScript, Node.js 24, Vitest, Biome, pnpm, Pi coding-agent extension API 0.80.3-compatible.

---

## Behavioral Specification

- `/plan:exit`, the plan-menu Exit action, and the plan-menu Implement action never call `ctx.ui.input` or write a plan file.
- A normal exit preserves the latest plan as a one-turn handoff. The next disabled-mode `before_agent_start` adds it to that turn's system prompt, then clears and persists it.
- Re-entering plan mode before that next turn discards the pending handoff.
- Implement sends the full plan in its synthetic user message and clears pending state before sending, so both idle and queued-follow-up execution receive exactly one plan copy.
- State entries, legacy `proposed-plan` custom messages, and tagged assistant plan blocks remain filtered from normal-mode context after the handoff is consumed.
- The duplicate custom `proposed-plan` message currently emitted from `agent_end` is removed. The original assistant response remains visible in the transcript.
- Existing commands, menus, tool restoration, status/widgets, and plan-mode prompt behavior remain unchanged.
- Existing files created by older versions are not modified or deleted.

### Post-exit write workflow

After selecting Exit (or running `/plan:exit`), the next ordinary prompt may
instruct Pi to save the retained plan, for example:

```text
Write the latest proposed plan verbatim to docs/my-plan.md. Do not implement it.
```

This works only for that immediate next model-triggering prompt because the
handoff is consumed at `before_agent_start`. `/plan:exit <instruction>` is not
supported because the command handler does not forward arguments to a model
turn. Selecting Implement remains an immediate implementation action.

## Files and Responsibilities

- Modify `src/core/state.ts`: preserve and consume `latestPlan` across exit, restart, re-entry, and first-turn handoff without adding a new state field.
- Modify `src/index.ts`: implement one-turn system-prompt handoff, clear state before Implement delivery, remove unsafe custom-message emission, and remove file-save calls.
- Keep `src/core/context.ts` filtering legacy plan messages and tagged assistant blocks; do not add latest-message retention logic.
- Modify `tests/core/state.test.ts`, `tests/index.test.ts`, and `tests/helpers.ts`: cover state lifecycle, one-turn injection, no-prompt exits, and removal of unsafe custom-message emission.
- Delete `src/core/plan-file.ts` and `tests/core/plan-file.test.ts`.
- Modify `README.md` to document one-turn context retention and remove file-saving/custom-timeline claims.

### Task 1: Preserve and consume pending plan state

**Files:**

- Modify: `src/core/state.ts`
- Test: `tests/core/state.test.ts`

- [ ] **Step 1: Add failing state lifecycle tests.**

Add these cases to `tests/core/state.test.ts`:

```ts
it("preserves the latest plan when exiting plan mode", () => {
  const state = {
    enabled: true,
    latestPlan: "pending plan",
    awaitingAction: true,
    selectedToolNames: ["read"] as string[] | undefined,
  };

  expect(exitPlanMode(state)).toEqual({
    enabled: false,
    latestPlan: "pending plan",
    awaitingAction: false,
    selectedToolNames: ["read"],
  });
});

it("restores a pending plan from disabled persisted state", () => {
  const state = restoreState([
    customEntry("plan-mode-state", {
      enabled: false,
      latestPlan: "pending after restart",
      awaitingAction: false,
    }),
  ]);

  expect(state.latestPlan).toBe("pending after restart");
  expect(state.enabled).toBe(false);
  expect(state.awaitingAction).toBe(false);
});

it("clears an unconsumed handoff when plan mode is re-entered", () => {
  const state = enterPlanMode({
    enabled: false,
    latestPlan: "stale handoff",
    awaitingAction: false,
    selectedToolNames: undefined,
  });

  expect(state).toEqual({
    enabled: true,
    latestPlan: undefined,
    awaitingAction: false,
    selectedToolNames: undefined,
  });
});
```

Update the existing disabled-state restore assertion so a disabled entry with no `latestPlan` still returns `latestPlan: undefined`; only a stored plan is retained.

- [ ] **Step 2: Run the state tests and verify they fail.**

Run: `pnpm exec vitest run tests/core/state.test.ts -t "preserves|pending|unconsumed"`

Expected: FAIL because `exitPlanMode` and `restoreState` currently clear all plan data whenever disabled, and `enterPlanMode` currently preserves stale plan data.

- [ ] **Step 3: Implement the state lifecycle.**

Update `src/core/state.ts` with these behaviors:

```ts
export function enterPlanMode(state: PlanModeState): PlanModeState {
  return {
    ...state,
    enabled: true,
    latestPlan: undefined,
    awaitingAction: false,
  };
}

export function exitPlanMode(state: PlanModeState): PlanModeState {
  return {
    ...state,
    enabled: false,
    awaitingAction: false,
  };
}
```

In `restoreState`, always restore `entry.data.latestPlan`; only restore `awaitingAction` when `enabled` is true:

```ts
return {
  enabled,
  latestPlan: entry.data.latestPlan,
  awaitingAction: enabled ? (entry.data.awaitingAction ?? false) : false,
  selectedToolNames: entry.data.selectedToolNames,
};
```

Do not add a new `PlanModeState` property; disabled `latestPlan` is the pending marker.

- [ ] **Step 4: Run the state tests.**

Run: `pnpm exec vitest run tests/core/state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the state change.**

```bash
git add src/core/state.ts tests/core/state.test.ts
git commit -m "refactor: preserve pending plan across exit"
```

### Task 2: Inject the plan once through Pi's before-agent lifecycle

**Files:**

- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Add a failing one-turn handoff test.**

Add this case to the `before_agent_start` tests in `tests/index.test.ts`:

```ts
it("injects a pending plan once after exiting plan mode", async () => {
  const mock = createMockPi();
  createExtension(mock.pi);
  const ctx = createMockContext({
    entries: [
      {
        type: "custom",
        customType: "plan-mode-state",
        data: {
          enabled: false,
          latestPlan: "# Pending Plan\n\nDo the work",
          awaitingAction: false,
        },
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

  const first = await mock.fireEvent(
    "before_agent_start",
    { type: "before_agent_start", systemPrompt: "base prompt" },
    ctx,
  );
  const firstPrompt = first as { systemPrompt: string };
  expect(firstPrompt.systemPrompt).toContain("# Pending Plan");
  expect(firstPrompt.systemPrompt).toContain(
    "do not implement the plan unless asked",
  );

  const second = await mock.fireEvent(
    "before_agent_start",
    { type: "before_agent_start", systemPrompt: "base prompt" },
    ctx,
  );
  expect(second).toBeUndefined();

  const saved = mock.entries.at(-1)?.data as { latestPlan?: string };
  expect(saved.latestPlan).toBeUndefined();
});
```

- [ ] **Step 2: Run the handoff test and verify it fails.**

Run: `pnpm exec vitest run tests/index.test.ts -t "injects a pending plan once"`

Expected: FAIL because disabled `before_agent_start` currently returns nothing and `restoreState` discards disabled plans.

- [ ] **Step 3: Implement disabled-mode handoff injection.**

In `src/index.ts`, keep the existing enabled-mode branch. After it, add a disabled-mode branch before returning:

```ts
const plan = state.latestPlan;
if (!plan) return;

state = { ...state, latestPlan: undefined, awaitingAction: false };
persist();
return {
  systemPrompt:
    `${event.systemPrompt}\n\n[PLAN HANDOFF]\n` +
    "The latest proposed plan is available for this turn as context. " +
    "Follow the current user request; do not implement the plan unless asked.\n\n" +
    plan,
};
```

The existing enabled branch must continue clearing `latestPlan` at the start of a new planning turn and returning the plan-mode system prompt.

- [ ] **Step 4: Run handoff and existing prompt tests.**

Run: `pnpm exec vitest run tests/index.test.ts -t "before_agent_start|plan <prompt>"`

Expected: PASS.

- [ ] **Step 5: Add restart and re-entry coverage.**

Keep the state tests from Task 1 and add these index-level assertions:

- a restored disabled state with `latestPlan` injects once;
- entering `/plan` before the next prompt clears the pending plan and does not inject it;
- a disabled state with no plan does not modify the system prompt.

- [ ] **Step 6: Commit the one-turn handoff.**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: hand off plan context for one turn"
```

### Task 3: Remove duplicate custom plan emission and make Implement reliable

**Files:**

- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`
- Keep: `src/core/context.ts` legacy filtering behavior

- [ ] **Step 1: Add failing assertions for custom-message and Implement behavior.**

Update the existing proposed-plan detection test in `tests/index.test.ts` to assert that `mock.messages` does not contain a `proposed-plan` custom message after `agent_end`.

Update the existing Implement test to assert the full plan remains in the synthetic user message:

```ts
expect(mock.userMessages[0].content as string).toContain("# My Plan");
```

Add an assertion that the final persisted state has no pending `latestPlan` after Implement.

- [ ] **Step 2: Run the tests and verify they fail.**

Run: `pnpm exec vitest run tests/index.test.ts -t "proposed-plan|implement"`

Expected: FAIL because `agent_end` currently sends the custom message and Implement leaves the plan in the disabled state.

- [ ] **Step 3: Remove the unsafe `agent_end` custom-message send.**

In `src/index.ts`, delete the `pi.sendMessage({ customType: PROPOSED_PLAN_MESSAGE_TYPE, ... })` block from `agent_end`. Leave plan extraction, state persistence, status/widget updates, and the ready menu unchanged.

Keep `PROPOSED_PLAN_MESSAGE_TYPE` in the context-filter path so custom messages written by older versions are still removed after exit.

- [ ] **Step 4: Clear pending state before Implement delivery.**

In the `implement` menu action:

1. Capture `const plan = state.latestPlan`.
2. Exit plan mode, preserving the plan.
3. If `plan` exists, clear `state.latestPlan`, set `awaitingAction` false, and call `persist()` before sending the implementation message.
4. Keep the existing full-plan user message unchanged.

The full plan must remain in this message because Pi’s `sendUserMessage` can queue a follow-up while streaming, and queued continuations do not invoke `before_agent_start`.

- [ ] **Step 5: Run the focused tests.**

Run: `pnpm exec vitest run tests/core/context.test.ts tests/index.test.ts`

Expected: PASS, including no duplicate custom message and exactly one full plan in Implement handoff.

- [ ] **Step 6: Commit the lifecycle fix.**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "fix: avoid duplicate plan context messages"
```

### Task 4: Delete filesystem saving and path prompts

**Files:**

- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`
- Modify: `tests/helpers.ts`
- Delete: `src/core/plan-file.ts`
- Delete: `tests/core/plan-file.test.ts`

- [ ] **Step 1: Change all exit-path tests to assert no prompt.**

Update plan-present tests for menu Implement, menu Exit, and `/plan:exit` to assert:

```ts
expect(ctx.inputCalls).toHaveLength(0);
```

Remove tests whose only purpose is proving that a save prompt appears. Keep status, tool-restoration, and implementation-handoff assertions.

- [ ] **Step 2: Run the exit-path tests and verify they fail.**

Run: `pnpm exec vitest run tests/index.test.ts -t "exit|implement"`

Expected: FAIL because the current handlers still invoke `savePlanToFile` when a plan exists.

- [ ] **Step 3: Remove save calls from every exit path.**

In `src/index.ts`:

- delete the `savePlanToFile` import;
- delete the call in Implement;
- delete the call in menu Exit;
- delete the call in `/plan:exit`.

Leave `doExit(ctx)`, notifications, and the full-plan Implement message intact.

- [ ] **Step 4: Remove prompt-only test scaffolding.**

In `tests/helpers.ts`, remove `inputResponses` and its queue. Retain `inputCalls` and use:

```ts
async input(title: string, placeholder?: string) {
  inputCalls.push({ title, placeholder });
  return undefined;
}
```

Remove the configurable mock `cwd` option if it is no longer used after deleting the plan-file tests.

- [ ] **Step 5: Delete the obsolete helper and tests.**

Delete `src/core/plan-file.ts` and `tests/core/plan-file.test.ts`.

- [ ] **Step 6: Run the focused tests.**

Run: `pnpm exec vitest run tests/core/context.test.ts tests/index.test.ts tests/core/state.test.ts`

Expected: PASS, including zero input calls on all exit paths.

- [ ] **Step 7: Commit the deletion.**

```bash
git add src/index.ts tests/index.test.ts tests/helpers.ts
git add -u src/core/plan-file.ts tests/core/plan-file.test.ts
git commit -m "refactor: remove plan file saving"
```

### Task 5: Update documentation and verify the package

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Remove stale file-saving documentation.**

Remove current-behavior and `/plan:exit` statements claiming that users choose a save path or that plans are saved on exit.

- [ ] **Step 2: Document the one-turn handoff.**

State that an ordinary exit keeps the latest plan in context for the next normal-mode turn only, then consumes it. State that Implement sends the full plan directly as the implementation instruction.

Include the supported user flow and its limitation:

```text
1. Select Exit or run `/plan:exit`.
2. On the next prompt, ask: “Write the latest proposed plan verbatim to docs/my-plan.md. Do not implement it.”
```

Clarify that `/plan:exit write ...` cannot perform this handoff because slash-command arguments are not sent as a model prompt, and that re-entering plan mode before the next prompt discards the pending handoff.

Remove the claim that the extension adds a separate display-only proposed-plan timeline message; the assistant response itself remains visible.

- [ ] **Step 3: Verify documentation references.**

Run: `rg -n "save|Save plan|proposed-plan\\.md|display-only|timeline" README.md`

Expected: no stale claim describes path prompts, exit-time file saving, or a duplicate display-only plan message.

- [ ] **Step 4: Commit documentation.**

```bash
git add README.md
git commit -m "docs: update plan handoff behavior"
```

- [ ] **Step 5: Run full verification.**

Run: `pnpm check`

Expected: Biome lint, TypeScript typecheck, and all Vitest tests pass.

- [ ] **Step 6: Verify package contents and diff.**

Run: `pnpm run pack:dry-run`

Expected: the package contains the remaining `src` files and no `src/core/plan-file.ts`.

Run: `rg -n "savePlanToFile|PROPOSED_PLAN_MESSAGE_TYPE" src tests`

Expected: `savePlanToFile` has no matches; `PROPOSED_PLAN_MESSAGE_TYPE` appears only in legacy filtering/tests.

Run: `git diff --check HEAD~5..HEAD`

Expected: no whitespace errors and no unrelated files changed across the five implementation commits.

## Self-Review

- Spec coverage: one-turn state retention is Tasks 1–2; Pi lifecycle safety and Implement delivery are Task 3; prompt/file removal is Task 4; documentation and verification are Task 5.
- Placeholder scan: every step names exact files, code behavior, commands, and expected results.
- Type consistency: `PlanModeState` gains no fields; disabled `latestPlan` is the pending marker; `exitPlanMode`, `restoreState`, and `before_agent_start` use the same lifecycle invariant.
- Pi compatibility: the design uses only APIs available in Pi 0.80.3 (`before_agent_start`, `sendUserMessage`, `sendMessage`, and `appendEntry`) and does not depend on the newer `agent_settled` event.
