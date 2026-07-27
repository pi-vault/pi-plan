# Isolate Save Plan Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the extension's scattered Save globals with one private session while preserving Save authorization, retries, success lockout, cleanup, settlement, and all existing wording.

**Architecture:** `src/core/save-plan.ts` owns only Save-specific prompt construction, write validation, reservation, execution outcome, and Save-turn prompt chaining. `src/index.ts` remains the Pi event coordinator and continues enforcing normal Plan-mode `edit` and unsafe `bash` restrictions. The session never writes files directly.

**Tech Stack:** TypeScript ESM, Vitest, Biome, Node.js >=24.15.0, Pi coding-agent 0.82 exported event/result types, Pi TUI 0.82.

---

## File Responsibilities

- Create `src/core/save-plan.ts`: closure-backed Save session factory; no exported single-implementation interface and no filesystem writes.
- Create `tests/core/save-plan.test.ts`: direct state-machine tests for prompt text, validation, reservation, retry, freezing, lockout, and outcome.
- Modify `src/index.ts`: construct/discard the session and route Save events while retaining Plan safety for non-write tools.
- Modify `tests/index.test.ts`: retain menu/routing/settlement/cleanup integration tests and add coordinator regressions.
- Modify `tests/helpers.ts`: make only `tool_call` dispatch stop at Pi's first blocking result and replace the unsafe `Function` annotation with `Parameters<ExtensionUIContext["custom"]>[0]`.

### Task 1: Extract focused Save session tests

**Files:**

- Create: `tests/core/save-plan.test.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Create the test fixture and exact prompt assertions**

Use a temporary workspace containing `docs/`, create a session with `createSavePlanSession("# Saved Plan", workspace)`, and assert the complete prompt string, including the workspace path and captured plan. Assert that `session.toolNames()` initially equals `savePlanToolNames(true)`.

```ts
const workspace = mkdtempSync(join(tmpdir(), "pi-plan-save-session-"));
mkdirSync(join(workspace, "docs"));
const session = createSavePlanSession("# Saved Plan", workspace);

expect(session.userPrompt).toBe(
  `Save the current proposed plan. Choose a new lowercase .md filename in the workspace root ${workspace}. Prefix the filename with today's date followed by a hyphen (YYYY-MM-DD-); use date +%F if needed. Pass only the filename as a relative workspace path; do not use an absolute path or a subdirectory. Write exactly the plan below to that file. Do not add leading or trailing whitespace, including a trailing newline. Make no other changes.\n\n# Saved Plan`,
);
expect(session.toolNames()).toEqual([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "write",
]);
```

- [ ] **Step 2: Add direct authorization tests for valid and invalid writes**

Cover these exact inputs and expected result: `plan.md` and `docs/plan.md` return `undefined`; content changes, `null`, `undefined`, non-`.md`, uppercase names, absolute paths, `~`, `@`, `file:`, `..`, Unicode spaces, missing parents, file parents, existing targets, broken target symlinks, and outside-workspace symlink parents return `{ block: true }` with the existing reason strings. After a valid authorization, assert `session.toolNames()` omits `write`.

- [ ] **Step 3: Add reservation, retry, mismatch, freeze, and lockout tests**

Use `ToolExecutionEndEvent` objects with matching and mismatched IDs. Assert that a second write is blocked while the first is reserved, an error re-enables `write`, a mismatched completion changes nothing, and a successful completion permanently removes `write`. Assert `Object.isFrozen(event.input) === true` after authorization and `session.saved()` is `false` before success and `true` after success.

- [ ] **Step 4: Add Save-turn prompt chaining tests**

Call `session.beforeAgentStart({ type: "before_agent_start", systemPrompt: "base", ... })` and assert the returned prompt starts with `base`, includes `buildPlanModePrompt()` and `[PLAN SAVE TURN]`, and retains the exact captured plan instructions.

- [ ] **Step 5: Run the new tests before implementation**

Run:

```bash
mise exec -- pnpm test -- tests/core/save-plan.test.ts
```

Expected: FAIL because `src/core/save-plan.ts` does not exist yet.

### Task 2: Implement the Save session

**Files:**

- Create: `src/core/save-plan.ts`

- [ ] **Step 1: Add Pi type-only imports and the inferred factory return**

Import `BeforeAgentStartEvent`, `BeforeAgentStartEventResult`, `ToolCallEvent`, `ToolCallEventResult`, and `ToolExecutionEndEvent` from `@earendil-works/pi-coding-agent` with `import type`. Define the factory and its private method signatures as:

```ts
export function createSavePlanSession(plan: string, workspaceRoot: string) {
  // private mutable state and returned methods live here
}
```

The returned object must expose exactly `userPrompt`, `toolNames()`, `authorizeToolCall(event)`, `recordToolExecution(event)`, `beforeAgentStart(event)`, and `saved()`. Use these exact method types: `authorizeToolCall(event: ToolCallEvent): ToolCallEventResult | undefined`, `recordToolExecution(event: ToolExecutionEndEvent): void`, and `beforeAgentStart(event: BeforeAgentStartEvent): BeforeAgentStartEventResult`. `authorizeToolCall()` returns `undefined` for non-write events without changing state.

- [ ] **Step 2: Move the current Save prompt and validation into the factory**

Keep the current prompt text byte-for-byte. Store `plan`, `workspaceRoot`, `writeCallId`, and `writeSucceeded` in the closure. For a `write` event, validate an object input, exact string content, and the current path policy; resolve `ctx.cwd` through `realpathSync`, resolve the candidate path, require an existing directory parent, reject parents resolving outside the workspace, and reject any existing target including a broken symlink. Freeze the validated input, store `event.toolCallId`, and return `undefined` for an authorized write. Return the current block reason for every rejection.

- [ ] **Step 3: Implement dynamic tools and execution recording**

Return `savePlanToolNames(writeCallId === undefined && !writeSucceeded)` from `toolNames()`. Ignore non-write and mismatched execution-end events. Clear the reservation and reopen `write` after `isError === true`; clear the reservation and set `writeSucceeded = true` after success. Return `writeSucceeded` from `saved()`.

- [ ] **Step 4: Implement Save-turn system prompt composition**

Return:

```ts
{
  systemPrompt: `${event.systemPrompt}\n\n${buildPlanModePrompt()}\n\n[PLAN SAVE TURN]\nUse only one approved write call for the exact captured plan. Do not edit, implement, or modify any other file.`,
}
```

This preserves Pi's chaining contract: the session receives the current prompt and returns a replacement containing it.

- [ ] **Step 5: Run the focused session tests**

Run:

```bash
mise exec -- pnpm test -- tests/core/save-plan.test.ts
```

Expected: all direct session tests pass.

### Task 3: Match Pi's first-block test dispatch

**Files:**

- Modify: `tests/helpers.ts`

- [ ] **Step 1: Update only `tool_call` dispatch**

Use this logic inside `fireEvent`:

```ts
for (const handler of handlers) {
  result = await handler(event, mockCtx.ctx);
  if (
    name === "tool_call" &&
    (result as { block?: unknown } | undefined)?.block === true
  ) {
    return result;
  }
}
return result;
```

Import `ExtensionUIContext` as a type and change the `custom` mock parameter to `Parameters<ExtensionUIContext["custom"]>[0]`. Do not change dispatch behavior for any other event.

- [ ] **Step 2: Add the first-block regression to extension tests**

Register a later `tool_call` handler with a counter, trigger a write that the Save session blocks, and assert that the counter remains zero. Keep the existing authorized-write/later-handler-block test to prove that an authorized call still reaches later handlers.

- [ ] **Step 3: Run helper and extension tests**

Run:

```bash
mise exec -- pnpm test -- tests/index.test.ts
```

Expected: all extension tests pass and the helper no longer emits the `noBannedTypes` warning.

### Task 4: Replace Save globals in the extension

**Files:**

- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Replace the three globals and Save helpers**

Import `createSavePlanSession` and define:

```ts
let savePlanSession: ReturnType<typeof createSavePlanSession> | undefined;
```

Remove `planToSave`, `planWriteCallId`, `planSaveSucceeded`, `clearPlanSaveState`, `activatePlanSaveTools`, and the local Save path-validation code.

- [ ] **Step 2: Route the Save menu action through the session**

On `save`, retain the existing latest-plan and idle checks, create the session from `state.latestPlan` and `ctx.cwd`, call `pi.setActiveTools(savePlanSession.toolNames())`, and send `savePlanSession.userPrompt`.

- [ ] **Step 3: Preserve non-write Plan safety during Save**

In `tool_call`, handle `write` with the session and refresh active tools after authorization. If no session exists, return the existing Plan-mode write block. Then keep the existing `edit` block and `isSafeCommand` check for `bash`; never return early for non-write events merely because a Save session exists.

- [ ] **Step 4: Delegate lifecycle events and cleanup**

For `tool_execution_end`, call `recordToolExecution()` and refresh active tools. For Save `before_agent_start`, refresh tools and return `beforeAgentStart(event)`. Skip proposed-plan capture while a Save session exists. On `agent_settled`, read `saved()`, clear the session, restore Plan tools, and notify only when it was not saved. Exit and shutdown must clear the session and restore the existing tool set.

- [ ] **Step 5: Run focused integration tests**

Run:

```bash
mise exec -- pnpm test -- tests/core/save-plan.test.ts tests/index.test.ts
```

Expected: session tests and extension routing, settlement, cleanup, retry, success-lockout, and unsafe-bash regressions all pass.

### Task 5: Complete verification and Pi smoke acceptance

**Files:**

- Modify: `src/core/save-plan.ts`
- Modify: `src/index.ts`
- Modify: `tests/core/save-plan.test.ts`
- Modify: `tests/index.test.ts`
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Run the complete repository checks**

Run:

```bash
mise exec -- pnpm check
mise exec -- pnpm run pack:dry-run
git diff --check
git status --short
```

Expected: zero lint diagnostics, TypeScript succeeds, all tests pass, packaging includes `src/core/save-plan.ts`, and no unexpected files are modified. The package must be checked under Node 24.15.0 because `package.json` requires `>=24.15.0`.

- [ ] **Step 2: Run the no-model Pi TUI smoke path**

From `/Users/lanh/Developer/pi-packages/pi`, use a controlled tmux session and run:

```bash
mise exec -- ./pi-test.sh --no-env --no-session -ne -e /Users/lanh/Developer/pi-vault/pi-plan/src/index.ts
```

Verify startup, `/plan`, `/plan:tools`, arrow/space/search input, selector cancellation, `/plan:exit`, UI cleanup, and absence of crashes. Do not attempt Save manually: without a model, Pi cannot produce the `agent_end` plan required to open the Save menu. Save behavior is fully covered by the automated tests above.

- [ ] **Step 3: Commit the completed refactor**

```bash
git add src/core/save-plan.ts tests/core/save-plan.test.ts src/index.ts tests/index.test.ts tests/helpers.ts
git commit -m "refactor: isolate Save plan lifecycle"
```

**Usable result:** Save state is private to one session, Pi event ordering is accurately tested, Plan safety remains enforced during Save, package checks pass under the supported Node version, and the real Pi TUI command path is smoke-tested without external API access.
