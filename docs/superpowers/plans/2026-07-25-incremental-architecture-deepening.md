# Incremental Architecture Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen pi-plan's shallow modules and concentrate Plan mode behavior behind a few coherent interfaces while preserving the Pi 0.82 extension contract.

**Architecture:** Execute five independently passing refactors from simplest to most complex: inline duplicate UI formatting, deepen context handling, consolidate tool policy and persistence, collapse selector internals behind its factory, and isolate Save plan lifecycle in an opaque session. `src/index.ts` remains the Pi event coordinator; no generic runtime abstraction, adapter, or new dependency is introduced.

**Tech Stack:** TypeScript ESM, Node.js >=24.15.0, Vitest, Biome, Pi coding-agent 0.82 extension types, Pi TUI 0.82.

---

## Constraints and compatibility

- Preserve the documented extension entry point, `--plan`, `/plan`, `/plan:exit`, `/plan:tools`, menu labels, status/widget text, session persistence, tool config JSON shape, and agent-mediated writes.
- Internal imports are not compatibility surfaces. Delete shallow modules instead of adding re-export shims.
- The only intentional behavior correction is proposed-plan delimiter parsing: opening and closing tags must be the only non-whitespace text on their lines. Preserve case-insensitivity, multiline content, trimming, empty blocks, and CRLF support.
- Use Pi's exported event and tool types. Do not recreate competing `ToolInfo` or event-result shapes.
- Preserve existing Save authorization wording and policy, including the prompt/authorization root-directory wording mismatch. Do not expand this plan into a product-policy change.
- Keep the package engine at `>=24.15.0` by decision; do not align it downward to Pi's `>=22.19.0` engine.
- Preserve `docs/superpowers/specs/2026-07-25-fix-plan-extraction.md`; it is existing user work and must not be deleted or rewritten.
- The baseline is 280 tests in 12 files. The current environment is Node 23.11.0, below the package engine, and `pnpm check` reports six pre-existing lint warnings. Do not add warnings.

## File map

- `src/index.ts`: Pi registration and event orchestration; remains the only production caller of the deepened modules.
- `src/core/context.ts`: plan capture and context sanitation implementation.
- `src/core/tools.ts`: tool policy, active-tool computation, and persisted selection implementation.
- `src/core/safety.ts`: private shell-command patterns plus the existing `isSafeCommand` interface.
- `src/core/save-plan.ts`: new opaque Save plan session.
- `src/tui/tool-selector.ts`: selector interface plus private state, input, pagination, and rendering implementation.
- `tests/index.test.ts`: thin extension wiring and command/event acceptance tests.
- `tests/core/context.test.ts`, `tests/core/tools.test.ts`, `tests/core/safety.test.ts`, `tests/core/save-plan.test.ts`: focused core interfaces.
- `tests/tui/tool-selector.test.ts`: selector behavior through the factory seam.

### Task 1: Delete shallow status and widget modules

**Files:**

- Modify: `src/index.ts`
- Delete: `src/tui/status.ts`
- Delete: `src/tui/widgets.ts`
- Modify: `tests/index.test.ts`
- Delete: `tests/tui/status.test.ts`
- Delete: `tests/tui/widgets.test.ts`

- [ ] **Step 1: Add combined UI readiness assertions**

Extend `tests/index.test.ts` with enabled/no-plan and enabled/ready cases. Assert `plan active` plus the planning widget in the first case, and `plan ready` plus the ready widget when `latestPlan` or `awaitingAction` is set. Keep the existing disabled case asserting both UI values are absent.

- [ ] **Step 2: Run the focused tests**

Run `pnpm test -- tests/index.test.ts`.

Expected: PASS before implementation; the assertions describe current behavior.

- [ ] **Step 3: Inline the formatters**

In `src/index.ts`, remove the formatter imports and use:

```ts
function updateUi(ctx: ExtensionContext): void {
  if (!state.enabled) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }
  const ready = state.awaitingAction || state.latestPlan !== undefined;
  ctx.ui.setStatus(STATUS_KEY, ready ? "plan ready" : "plan active");
  ctx.ui.setWidget(
    WIDGET_KEY,
    ready
      ? [
          "Proposed plan ready",
          "Use /plan to implement, revise, or exit Plan mode.",
        ]
      : ["Plan mode: planning", "Produce a <proposed_plan> block."],
  );
}
```

Keep `clearUi` unchanged.

- [ ] **Step 4: Delete obsolete files and tests**

Delete `src/tui/status.ts`, `src/tui/widgets.ts`, `tests/tui/status.test.ts`, and `tests/tui/widgets.test.ts`. Keep their assertions in `tests/index.test.ts`.

- [ ] **Step 5: Verify and commit**

Run `pnpm check`. Expected: all tests pass and no new lint warnings. Commit with `git add src/index.ts tests/index.test.ts src/tui/status.ts src/tui/widgets.ts tests/tui/status.test.ts tests/tui/widgets.test.ts && git commit -m "refactor: inline plan mode UI formatting"`.

### Task 2: Fix and deepen context handling

**Files:**

- Modify: `tests/core/context.test.ts`
- Modify: `src/core/context.ts`
- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Add the delimiter regression and message cases**

Add tests for an inline introduction followed by a standalone block, uppercase tags, surrounding horizontal whitespace, CRLF, empty blocks, malformed/non-standalone blocks, user messages, custom plan messages, and state-entry removal. The inline case must return exactly `# Intended` and preserve the introduction during sanitation.

- [ ] **Step 2: Run the regression**

Run `pnpm test -- tests/core/context.test.ts`.

Expected: the inline regression FAILS against the current unanchored expression.

- [ ] **Step 3: Anchor the shared patterns**

In `src/core/context.ts`, use:

```ts
const PLAN_BLOCK_PATTERN =
  /^[ \\t]*<proposed_plan>[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*<\\/proposed_plan>[ \\t]*\\r?$/im;
const ALL_PLAN_BLOCK_PATTERN =
  /^[ \\t]*<proposed_plan>[ \\t]*\\r?\\n[\\s\\S]*?^[ \\t]*<\\/proposed_plan>[ \\t]*\\r?$/gim;
```

Trim the captured body. Same-line tags and inline mentions must not match.

- [ ] **Step 4: Expose two Pi-typed operations**

Import `AgentEndEvent`, `ContextEvent`, and `ContextEventResult` as type-only imports from `@earendil-works/pi-coding-agent`. Make message-shape helpers private and expose:

```ts
export function captureProposedPlan(
  messages: AgentEndEvent["messages"],
): string | undefined;

export function sanitizePlanModeContext(
  messages: ContextEvent["messages"],
  enabled: boolean,
): ContextEventResult | undefined;
```

`captureProposedPlan` selects the last assistant message, flattens string/text-part content, and extracts the valid standalone plan. `sanitizePlanModeContext` removes state entries, removes custom proposed-plan messages only when disabled, strips valid plan blocks only when disabled, and returns `undefined` when no message changes are needed.

- [ ] **Step 5: Update event wiring**

In `agent_end`, call `captureProposedPlan(messages)`. In `context`, return `sanitizePlanModeContext(messages, state.enabled)` directly. Remove the old extraction/text/filter imports and casts. Update integration tests to assert event behavior only.

- [ ] **Step 6: Verify and commit**

Run `pnpm test -- tests/core/context.test.ts tests/index.test.ts && pnpm check`. Expected: all context and extension tests pass with the regression fixed. Commit with `git add src/core/context.ts src/index.ts tests/core/context.test.ts tests/index.test.ts && git commit -m "refactor: deepen plan context handling"`.

### Task 3: Consolidate tool policy and persistence

**Files:**

- Modify: `src/core/tools.ts`, `src/core/safety.ts`, `src/index.ts`, `src/tui/tool-selector.ts`
- Delete: `src/core/config.ts`, `tests/core/config.test.ts`
- Modify: `tests/core/tools.test.ts`, `tests/core/safety.test.ts`, `tests/index.test.ts`

- [ ] **Step 1: Characterize existing policy and persistence**

Keep tests for default, custom, Save, and normal-mode tool names, safe Pi access fallbacks, and the existing `extensions/plan-tools.json` JSON read/write behavior. Run `pnpm test -- tests/core/tools.test.ts tests/core/config.test.ts tests/core/safety.test.ts` and expect PASS before implementation.

- [ ] **Step 2: Use Pi's official tool type**

Import `ToolInfo` from `@earendil-works/pi-coding-agent`. If a narrow selector view is needed, define only:

```ts
export type PlanToolInfo = Pick<ToolInfo, "name"> & {
  sourceInfo: Pick<ToolInfo["sourceInfo"], "source">;
};
```

Return official `ToolInfo[]` from `safeGetAllTools`; do not define a competing full tool shape.

- [ ] **Step 3: Move policy and persistence into `tools.ts`**

Keep the existing constants private and expose the existing behavior through `getToolPolicy`, `planModeToolNames`, `savePlanToolNames`, `normalModeToolNames`, `safeGetAllTools`, `safeGetActiveTools`, `readSelectedToolNames`, and `writeSelectedToolNames`. Keep path construction, boolean-map conversion, and silent non-critical persistence failures private.

- [ ] **Step 4: Move shell patterns behind safety**

Move `MUTATING_BASH_PATTERNS` and `SAFE_BASH_PATTERNS` from `src/shared/constants.ts` into `src/core/safety.ts` without changing expressions or command-segment behavior. Keep only `isSafeCommand` as the safety module interface.

- [ ] **Step 5: Update callers and delete config**

Update `src/index.ts` and the selector to use the consolidated functions. Delete `src/core/config.ts` and its direct tests after persistence coverage passes.

- [ ] **Step 6: Verify and commit**

Run `pnpm test -- tests/core/tools.test.ts tests/core/safety.test.ts tests/index.test.ts && pnpm check`. Commit with `git add src/core/tools.ts src/core/safety.ts src/shared/constants.ts src/index.ts src/tui/tool-selector.ts tests/core/tools.test.ts tests/core/safety.test.ts tests/index.test.ts src/core/config.ts tests/core/config.test.ts && git commit -m "refactor: consolidate plan tool policy"`.

### Task 4: Collapse selector internals behind the factory seam

**Files:**

- Modify: `src/tui/tool-selector.ts`, `tests/index.test.ts`
- Create: `tests/tui/tool-selector.test.ts`
- Delete: `src/tui/tool-selector-state.ts`, `src/tui/tool-selector-render.ts`, and their direct tests

- [ ] **Step 1: Add factory-level tests using raw Pi TUI bytes**

Construct the component through `createToolSelectorComponent`. Since Pi's TUI sends raw input bytes, use optional handler calls and raw values:

```ts
component.handleInput?.(" "); // space
component.handleInput?.("\\r"); // enter
expect(done).toHaveBeenCalledWith(["custom"]);
```

Use `"\\x1b[A"`, `"\\x1b[B"`, `"\\x1b[C"`, `"\\x1b[D"` for arrows, `"\\x1b"` for escape, and `"\\x7f"` for backspace. Cover search editing, cursor movement, pagination, blocked/always-on policy display, cancellation, and narrow widths.

- [ ] **Step 2: Run the seam tests**

Run `pnpm test -- tests/tui/tool-selector.test.ts tests/index.test.ts`. Expected: the factory tests pass before internal consolidation.

- [ ] **Step 3: Remove redundant render plumbing and inline helpers**

Remove the `requestRender` option and the `requestRender = () => component.invalidate()` closure from `src/index.ts`; Pi's TUI automatically requests a render after the focused component handles input. Keep `invalidate(): void {}` as the no-op required by `Component`. Move state, input, pagination, row rendering, and layout helpers into `tool-selector.ts` as non-exported functions.

- [ ] **Step 4: Delete old seams and direct tests**

Delete the state/render modules and direct helper tests. Preserve behavior assertions through the factory test and extension command test.

- [ ] **Step 5: Verify and commit**

Run `pnpm test -- tests/tui/tool-selector.test.ts tests/index.test.ts && pnpm check`. Commit with `git add src/tui/tool-selector.ts tests/tui/tool-selector.test.ts tests/index.test.ts src/tui/tool-selector-state.ts src/tui/tool-selector-render.ts tests/tui/tool-selector-state.test.ts tests/tui/tool-selector-render.test.ts && git commit -m "refactor: deepen tool selector module"`.

### Task 5: Isolate the Save plan lifecycle in an opaque session

**Files:**

- Create: `src/core/save-plan.ts`, `tests/core/save-plan.test.ts`
- Modify: `src/index.ts`, `tests/index.test.ts`, `tests/helpers.ts`

- [ ] **Step 1: Extract focused lifecycle tests**

Move path, exact-content, reservation, retry, success-lockout, freeze, and settlement assertions into `tests/core/save-plan.test.ts`. Keep extension tests for Save menu creation and event routing.

- [ ] **Step 2: Add the Pi-typed session seam and run it**

Import `BeforeAgentStartEvent`, `BeforeAgentStartEventResult`, `ToolCallEvent`, `ToolCallEventResult`, and `ToolExecutionEndEvent` as type-only imports. Define:

```ts
export interface SavePlanSession {
  readonly userPrompt: string;
  toolNames(): string[];
  authorizeToolCall(event: ToolCallEvent): ToolCallEventResult | undefined;
  recordToolExecution(event: ToolExecutionEndEvent): void;
  beforeAgentStart(event: BeforeAgentStartEvent): BeforeAgentStartEventResult;
  outcome(): "saved" | "failed";
}

export function createSavePlanSession(
  plan: string,
  workspaceRoot: string,
): SavePlanSession;
```

Run `pnpm test -- tests/core/save-plan.test.ts`. Expected: FAIL until the new module exists.

- [ ] **Step 3: Implement the minimum session state machine**

Preserve the exact Save prompt/system wording, relative lowercase `.md` path validation, traversal/prefix/Unicode-space/parent/symlink/workspace/target-existence checks, exact content, and frozen authorized input. `authorizeToolCall` returns `undefined` for non-`write` calls, validates write calls, and reserves one matching call. `recordToolExecution` ignores non-write/mismatched IDs, reopens after an error, and locks after success. `beforeAgentStart` preserves the incoming `systemPrompt` chain and adds the Save instructions. `outcome()` returns `"failed"` until a write succeeds. The session performs no direct filesystem write.

- [ ] **Step 4: Mirror Pi's first-block event semantics in tests**

Update `tests/helpers.ts` only for `tool_call`: iterate handlers in order and return immediately on the first result containing `block: true`, matching Pi's extension runner. Do not emulate unrelated runner behavior.

- [ ] **Step 5: Replace Save globals and helpers in `src/index.ts`**

Replace `planToSave`, `planWriteCallId`, and `planSaveSucceeded` with `let savePlanSession: SavePlanSession | undefined`. Create it from `state.latestPlan` and `ctx.cwd`, activate `session.toolNames()`, delegate `tool_call`, `tool_execution_end`, and `before_agent_start`, then settle, clear, notify, and restore the normal tools exactly as today. Exit and shutdown discard the session and restore the existing tool set.

- [ ] **Step 6: Verify and commit**

Run `pnpm test -- tests/core/save-plan.test.ts tests/index.test.ts && pnpm check && pnpm run pack:dry-run`. Commit with `git add src/core/save-plan.ts tests/core/save-plan.test.ts src/index.ts tests/index.test.ts tests/helpers.ts && git commit -m "refactor: isolate Save plan lifecycle"`.

### Task 6: Final acceptance

- [ ] **Step 1: Run the complete local checks**

Run `pnpm check && pnpm run pack:dry-run && git diff --check && git status --short`. Expected: tests pass, packaging includes the new core module and excludes deleted modules, diff checking is clean, and no unexpected artifacts are tracked.

- [ ] **Step 2: Run the real Pi TUI smoke path**

From `/Users/lanh/Developer/pi-packages/pi`, launch Pi with the extension and no other extensions, for example `pnpm exec pi -ne -e /Users/lanh/Developer/pi-vault/pi-plan/src/index.ts`. In a terminal session, exercise `/plan`, `/plan:tools`, raw selector navigation and save/cancel, then `/plan:exit`. Do not call a real model API; verify only command registration, rendering, input handling, and cleanup.

- [ ] **Step 3: Review scope**

Confirm UI readiness is implemented once, context callers use the two deep operations, tool types come from Pi, selector helpers are private, Save state is one session, and no dependency, adapter, persistence format, command, or product behavior was added. Keep any root-only Save wording mismatch as a separate follow-up.
