# Phase 5: Isolate Save Plan Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Complete every checkbox before committing this phase.

**Goal:** Replace scattered Save globals with one Pi-typed session while preserving authorization, retry, success-lockout, cleanup, and settlement behavior.

**Architecture:** `src/core/save-plan.ts` owns the Save state machine and validation; `src/index.ts` delegates Pi events to it. The session never writes files directly. Tests mirror Pi's first-block `tool_call` runner semantics without emulating unrelated runtime behavior.

**Tech Stack:** TypeScript ESM, Vitest, Biome, Pi coding-agent 0.82 event/result types.

---

**Prerequisite:** Phase 4 commit is present and `pnpm check` passes.

**Files:** Create `src/core/save-plan.ts` and `tests/core/save-plan.test.ts`; modify `src/index.ts`, `tests/index.test.ts`, and `tests/helpers.ts`.

- [ ] **Step 1: Extract focused lifecycle tests**

Move path, exact-content, reservation, retry, success-lockout, freeze, and settlement assertions into `tests/core/save-plan.test.ts`. Keep extension tests for Save menu creation and event routing.

- [ ] **Step 2: Add the Pi-typed session seam**

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

Run `pnpm test -- tests/core/save-plan.test.ts`.

Expected: FAIL until `src/core/save-plan.ts` exists.

- [ ] **Step 3: Implement the session state machine**

Preserve exact Save prompt/system wording, relative lowercase `.md` validation, traversal/prefix/Unicode-space/parent/symlink/workspace/target-existence checks, exact content, and frozen authorized input. `authorizeToolCall` returns `undefined` for non-write events, validates and reserves one write, and returns Pi's `ToolCallEventResult` for blocked writes. `recordToolExecution` ignores non-write/mismatched IDs, reopens after an error, and locks after success. `beforeAgentStart` preserves the incoming system prompt chain and adds Save instructions. `outcome()` returns `"failed"` until success. Use `savePlanToolNames`; do not perform direct filesystem writes.

- [ ] **Step 4: Mirror Pi's first-block semantics in the test helper**

In `tests/helpers.ts`, for `tool_call` only, iterate handlers in order and immediately return the first result containing `block: true`. Keep the helper unchanged for unrelated events.

- [ ] **Step 5: Replace Save globals in the extension**

Replace `planToSave`, `planWriteCallId`, and `planSaveSucceeded` with:

```ts
let savePlanSession: SavePlanSession | undefined;
```

Create the session from `state.latestPlan` and `ctx.cwd`; activate `session.toolNames()`; delegate `tool_call`, `tool_execution_end`, and `before_agent_start`; settle, notify, clear, and restore normal Plan tools exactly as before. Exit and shutdown discard the session and restore the existing tools.

- [ ] **Step 6: Verify the complete lifecycle**

Run:

```bash
pnpm test -- tests/core/save-plan.test.ts tests/index.test.ts
pnpm check
pnpm run pack:dry-run
git diff --check
```

Expected: focused and extension tests pass, packaging succeeds, and no new warnings appear.

- [ ] **Step 7: Run final Pi TUI smoke acceptance**

From `/Users/lanh/Developer/pi-packages/pi`, run:

```bash
pnpm exec pi -ne -e /Users/lanh/Developer/pi-vault/pi-plan/src/index.ts
```

Exercise `/plan`, `/plan:tools`, raw selector navigation, Save/cancel, and `/plan:exit` without a real model API. Confirm command registration, UI rendering, raw input handling, Save cleanup, and tool restoration.

- [ ] **Step 8: Commit the completed refactor**

```bash
git add src/core/save-plan.ts tests/core/save-plan.test.ts src/index.ts tests/index.test.ts tests/helpers.ts
git commit -m "refactor: isolate Save plan lifecycle"
```

**Usable result:** Save remains safe and recoverable, the extension passes the complete local suite and packaging check, and the real Pi TUI path is manually accepted.
