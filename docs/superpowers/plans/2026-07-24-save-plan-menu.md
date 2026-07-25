# Save Plan Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an idle-only `Save plan` menu action that gives the agent a one-turn, workspace-scoped permission to write the current plan to a new Markdown file, then returns to Plan mode with the plan retained.

**Architecture:** Keep writing agent-mediated. The extension never writes the file directly and adds no persistent state or custom tool. A short-lived save context narrows active tools with public `pi.setActiveTools` to safe built-ins plus the existing built-in `write`; `tool_call` preflight validates exact content and a safe destination, freezes the approved input, and reserves one write call ID. Pi 0.82's `agent_settled` event ends the authorization after retries and queued follow-ups.

**Tech Stack:** TypeScript, Pi extension APIs (`setActiveTools`, `agent_settled`, `tool_execution_end`), Node `fs`/`path`, Vitest, pnpm.

---

The branch already has Pi coding-agent and Pi TUI dev dependencies at `^0.82.0`, with the lockfile resolving 0.82.0. Only the peer ranges remain at `*`. The existing baseline passes 256 tests and the package dry-run; verification currently emits the package's Node 24.15+ engine warning because the shell is running Node 23.11.

## 1. Update Pi peer dependency floor

**Files:** `package.json`

- [ ] Change only the two peer dependency ranges in `package.json` to `>=0.82.0`; do not rewrite already-correct dev dependency or unrelated lockfile entries.
- [ ] Run `pnpm check`; expect Biome, TypeScript, and all existing tests to pass, with only the unsupported-Node engine warning when running under Node 23.11.

## 2. Add the menu action and idle gating

**Files:** `src/tui/menus.ts`, `src/index.ts`, `tests/tui/menus.test.ts`, `tests/helpers.ts`

- [ ] Extend `PlanMenuAction` with `"save"` and add the label `Save plan`.
- [ ] In both the plan-ready menu and the management menu, show Save only when a plan exists and `ctx.isIdle()` is true. Keep ordering as `Implement`, `Save plan`, `Stay in Plan`, `Exit` for the ready menu and `Show plan`, `Implement`, `Save plan`, `Tools`, `Stay in Plan`, `Exit` for the management menu.
- [ ] Return a warning/no-op if a stale save action is received without a plan or while busy.
- [ ] Extend `createMockContext` with an optional `cwd` (defaulting to `process.cwd()`). Preserve the existing `isIdle` option and default it to `true` so menu tests can exercise busy suppression.
- [ ] Add menu tests for labels, ordering, missing-plan behavior, and busy suppression; update existing option-count assertions.

**Verification:** `pnpm exec vitest run tests/tui/menus.test.ts tests/index.test.ts -t "menu|Save|stale"`

## 3. Implement the transient save turn

**Files:** `src/index.ts`, `tests/index.test.ts`

- [ ] Add closure state:
  ```ts
  let planToSave: string | undefined;
  let planWriteCallId: string | undefined;
  let planSaveSucceeded = false;
  ```
- [ ] Add a `clearPlanSaveState()` helper that sets all three values to `undefined`/`false`. Add `activatePlanSaveTools()` using the public API: start with `SAFE_BUILTIN_PLAN_TOOLS`, append `write` only while no write is reserved or completed, and call `pi.setActiveTools(tools)`. Do not capture `previousTools` from this temporary tool set.
- [ ] On `save`, require an idle context, capture the exact current plan, reset the transient flags, activate strict tools, and call `sendPlanModeMessage` with instructions to choose a new `.md` path in an existing directory inside `ctx.cwd`, write the exact plan only, and make no other edits or implementation changes.
- [ ] In `before_agent_start`, branch before normal Plan-mode tool reapplication: while saving, call `activatePlanSaveTools()`, preserve `latestPlan` and `awaitingAction`, and append a narrow `[PLAN SAVE TURN]` exception to the system prompt. Leave normal-turn stale-plan clearing unchanged.
- [ ] In `agent_end`, return early during a save turn so save chatter cannot replace the stored plan or schedule another menu.
- [ ] Register `agent_settled` (Pi 0.82) to end the save turn after retries and queued follow-ups: retain the plan, clear transient state, restore normal selected tools directly with `pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames))`, and warn if no successful write occurred.
- [ ] Clear transient authorization in `doExit` and `session_shutdown`; restore normal tools on exit.

**Verification:** Add integration tests that prove the save message contains the full plan, save prompts preserve it, `agent_end` does not extract/retrigger, `agent_settled` cleans up on success and failure, optional extension tools are suppressed, and ordinary Plan turns still block `write`.

## 4. Add write preflight and race-safe call tracking

**Files:** `src/index.ts`, `tests/index.test.ts`

- [ ] Handle `write` in `tool_call` before the generic blocked-tool branch. Authorize only when a save is active, no write is reserved/completed, the path and content are strings, and `content === planToSave`.
- [ ] Accept only ordinary relative lowercase `.md` paths. Reject absolute paths, every `..` path segment, leading `~`, leading `@`, `file:` URLs, and Unicode-space variants. Resolve with `resolve(realpathSync(ctx.cwd), path)`.
- [ ] Require the parent directory to exist and be a directory, resolve workspace and parent with `realpathSync`, ensure containment with `relative` (not a string prefix), and reject any target directory entry with `lstatSync(target, { throwIfNoEntry: false })`, including broken symlinks.
- [ ] On valid preflight, freeze `event.input` so later extension handlers cannot mutate the approved path/content, reserve `event.toolCallId`, remove `write` from active tools immediately, and allow the built-in write to execute. On invalid input, block with a user-facing reason and default-deny filesystem exceptions.
- [ ] Handle the matching call ID in `tool_execution_end`, not only `tool_result`: clear and re-enable `write` after an execution error; mark success and keep `write` disabled after success. This also releases reservations for calls blocked by a later `tool_call` handler, because Pi emits `tool_execution_end` for those calls but no `tool_result`.
- [ ] Keep ordinary `edit`/`write` blocking and unsafe-bash behavior unchanged. Add `// ponytail: preflight existence check is not atomic; use an exclusive-create save tool if concurrent no-clobber becomes required.`
- [ ] Add boundary tests for exact content, altered content, existing targets, broken target symlinks, non-Markdown paths, missing/file parents, absolute/traversal/home/`@`/`file:`/Unicode-space paths, symlinked parents outside the workspace, frozen input, sibling write calls, later-handler blocking, retries after failure, and successful completion.

**Verification:** `pnpm exec vitest run tests/index.test.ts -t "write|path|symlink|content|retry|execution_end"`

## 5. Document the workflow

**Files:** `README.md`, `CHANGELOG.md`

- [ ] Document that Save plan is available only while idle, asks the agent to choose the filename, retains the plan in Plan mode, and grants temporary write permission only for that save turn.
- [ ] State that the preflight refuses existing directory entries, broken symlinks, traversal, and paths outside the workspace; do not claim atomic protection against a concurrent filesystem race.
- [ ] Remove the old `/plan:exit` plus next-prompt workaround.
- [ ] In Unreleased changelog entries, add explicit Save plan behavior and the Pi 0.82 minimum; retain the existing note about removing automatic exit-time prompts.

## 6. Verify the complete change

- [ ] Run `pnpm exec vitest run tests/tui/menus.test.ts tests/index.test.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm run pack:dry-run`.
- [ ] Run the checks under Node 24.15+ so the declared engine requirement is satisfied; if only Node 23.11 is available, record the engine warning as an environment limitation.
- [ ] Manually smoke-test from a temporary directory with:
      `/Users/lanh/Developer/pi-packages/pi/pi-test.sh -e /Users/lanh/Developer/pi-vault/pi-plan/src/index.ts --plan`
      (enter a plan, choose Save plan, and inspect the newly created file). Record that this check requires Pi credentials.

## Commit checkpoints

- [ ] Commit dependency/API-floor changes.
- [ ] Commit menu and save-turn lifecycle changes.
- [ ] Commit write validation, tests, and documentation.

## Required implementation contracts

The implementation must preserve these exact interfaces and state transitions; do not introduce a new persistent state field:

```ts
function clearPlanSaveState(): void {
  planToSave = undefined;
  planWriteCallId = undefined;
  planSaveSucceeded = false;
}

function activatePlanSaveTools(): void {
  const tools = [...SAFE_BUILTIN_PLAN_TOOLS];
  if (planWriteCallId === undefined && !planSaveSucceeded) tools.push("write");
  pi.setActiveTools(tools);
}
```

The save branch in `before_agent_start` must run before the existing normal Plan-mode branch:

```ts
if (state.enabled && planToSave !== undefined) {
  activatePlanSaveTools();
  return {
    systemPrompt: `${event.systemPrompt}\n\n${buildPlanModePrompt()}\n\n[PLAN SAVE TURN]\nUse only one approved write call for the exact captured plan. Do not edit, implement, or modify any other file.`,
  };
}
```

The write preflight must use this validation order: exact captured content, string path, relative-path restrictions, lowercase `.md` extension, existing parent directory, workspace containment, target `lstat`, freeze, then call-ID reservation. Any failed check returns `{ block: true, reason }` and leaves the reservation unset. A matching `tool_execution_end` with `isError: true` clears the reservation and re-enables `write`; a matching successful event sets `planSaveSucceeded` and leaves `write` disabled.

The tests must drive the extension through `createMockPi().fireEvent(...)` and verify active-tool arrays, notifications, persisted plan state, and returned block objects. Filesystem boundary tests must use a temporary workspace supplied through `createMockContext({ cwd })`; they must not write into the repository.

## Self-review

- [ ] Confirm the implementation uses only public `pi.setActiveTools` and the Pi 0.82 `agent_settled`/`tool_execution_end` events.
- [ ] Confirm no task relies on a persistent save-state field, custom tool, direct extension file write, or an atomicity guarantee the design does not provide.
- [ ] Confirm tests cover the broken-symlink target case and mutation by later tool-call handlers, not only ordinary path traversal.
