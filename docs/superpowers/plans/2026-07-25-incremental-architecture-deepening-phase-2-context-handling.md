# Phase 2: Deepen Context Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Complete every checkbox before committing this phase. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct standalone proposed-plan extraction and expose two Pi-typed context operations while preserving Plan mode behavior.

**Architecture:** `src/core/context.ts` owns delimiter parsing, assistant text extraction, legacy custom-message filtering, and context sanitation. `src/index.ts` remains the Pi event coordinator and calls only `captureProposedPlan` and `sanitizePlanModeContext`. The design follows Pi 0.82's `AgentMessage[]` contract and its session projection: persisted `appendEntry` state is not included in `ContextEvent.messages`.

**Tech Stack:** TypeScript ESM, Node.js >=24.15.0, Vitest, Biome, Pi coding-agent 0.82 event types.

---

**Prerequisite:** Phase 1 is present and `pnpm check` passes. The current baseline is Node 24.15.0, 273 passing tests in 10 files, and six pre-existing Biome warnings. Do not add warnings.

**Files:** Modify `src/core/context.ts`, `src/index.ts`, `tests/core/context.test.ts`, and `tests/index.test.ts`. Do not add a dependency or change prompt, save, persistence, or command behavior.

**Why this replaces the previous draft:** Pi's `CustomEntry` records created by `appendEntry` are excluded by `sessionEntryToContextMessages`, so state-entry filtering does not belong in a typed context operation. The previous `pnpm test -- <file>` commands also run the full suite in this repository; use `pnpm exec vitest run <file>` for focused checks.

### Task 1: Write the final typed context tests first

**Files:**

- Modify: `tests/core/context.test.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Replace the old context helper imports with the final API.**

Import only `captureProposedPlan` and `sanitizePlanModeContext` from `src/core/context.ts`. Add a local Pi-shaped assistant fixture using `Extract<AgentEndEvent["messages"][number], { role: "assistant" }>` with `content: [{ type: "text", text }]`, `api: "anthropic-messages"`, `provider: "anthropic"`, `model: "test"`, zeroed usage, `stopReason: "stop"`, and `timestamp: 0`.

- [ ] **Step 2: Add capture cases with exact expectations.**

Use these inputs and assertions:

```ts
expect(
  captureProposedPlan([
    assistant("Intro mentions <proposed_plan> inline."),
    assistant(
      "<proposed_plan>\n# Intended\n</proposed_plan>",
    ),
  ]),
).toBe("# Intended");

expect(captureProposedPlan([assistant("<PROPOSED_PLAN>\r\n# Plan\r\n</PROPOSED_PLAN>")]))
  .toBe("# Plan");
expect(captureProposedPlan([assistant("  <proposed_plan>  \n# Plan\n  </proposed_plan>  ")])).toBe("# Plan");
expect(captureProposedPlan([assistant("<proposed_plan>\n  \n</proposed_plan>")])).toBeUndefined();
expect(captureProposedPlan([assistant("<proposed_plan># Inline</proposed_plan>")])).toBeUndefined();
expect(captureProposedPlan([assistant("<proposed_plan>\n# Missing close")])).toBeUndefined();
expect(captureProposedPlan([assistant("No plan")])).toBeUndefined();
```

Also verify that only the last assistant message is inspected and that thinking/tool-call parts are ignored while text parts are joined with `"\n"`.

- [ ] **Step 3: Add sanitation cases with exact message-shape expectations.**

For `enabled: false`, verify that a legacy `{ role: "custom", customType: "proposed-plan", ... }` message is removed, a standalone assistant block is removed, and surrounding text remains. Verify inline mentions, user messages, non-text parts, malformed blocks, and unchanged messages remain untouched. For `enabled: true`, verify the original messages are preserved and the result is `undefined`. Verify unchanged disabled input also returns `undefined`.

Do not add a state-entry context test; persisted state is not an `AgentMessage`.

- [ ] **Step 4: Update integration fixtures to Pi-shaped assistant content.**

In `tests/index.test.ts`, change `agent_end` and `context` assistant fixtures from string `content` to text-part arrays. Keep assertions at the event boundary: plan detection sets `plan ready`, and context filtering returns the expected messages or `undefined`.

- [ ] **Step 5: Run the focused tests before implementation.**

Run:

```bash
pnpm exec vitest run tests/core/context.test.ts
```

Expected: FAIL during module loading because `captureProposedPlan` and `sanitizePlanModeContext` are not exported yet.

### Task 2: Implement the typed context seam and wire the events

**Files:**

- Modify: `src/core/context.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Anchor the parser patterns.**

Keep these module-private patterns and trim the captured body:

```ts
const PLAN_BLOCK_PATTERN =
  /^[ \t]*<proposed_plan>[ \t]*\r?\n([\s\S]*?)^[ \t]*<\/proposed_plan>[ \t]*\r?$/im;
const ALL_PLAN_BLOCK_PATTERN =
  /^[ \t]*<proposed_plan>[ \t]*\r?\n[\s\S]*?^[ \t]*<\/proposed_plan>[ \t]*\r?$/gim;
```

Opening and closing tags must be the only non-whitespace text on their lines. Inline and same-line tags therefore remain ordinary text.

- [ ] **Step 2: Replace the public context helpers with Pi-typed operations.**

Add type-only imports and expose exactly:

```ts
export function captureProposedPlan(
  messages: AgentEndEvent["messages"],
): string | undefined;

export function sanitizePlanModeContext(
  messages: ContextEvent["messages"],
  enabled: boolean,
): { messages: ContextEvent["messages"] } | undefined;
```

`captureProposedPlan` scans backward for the last assistant, joins its text-part strings with newlines, and returns the trimmed first valid block or `undefined`. `sanitizePlanModeContext` returns `undefined` when enabled; otherwise it removes only legacy proposed-plan custom messages and strips valid blocks from assistant text parts, cloning only changed values. Pi 0.82 does not re-export `ContextEventResult` at its package root, so the operation exposes the structurally compatible result shape instead. Leave unsupported malformed runtime content unchanged rather than adding a second public message model.

- [ ] **Step 3: Replace the event-boundary composition in `src/index.ts`.**

In `agent_end`, replace reverse-message selection plus `getAssistantMessageText`/`extractProposedPlan` calls with `captureProposedPlan(event.messages)`. In `context`, return `sanitizePlanModeContext(event.messages, state.enabled)` directly. Remove the old context-helper imports and casts. Keep `STATE_ENTRY_TYPE` for session persistence and remove only the now-unused context-filter constant import.

- [ ] **Step 4: Run the focused implementation tests.**

Run:

```bash
pnpm exec vitest run tests/core/context.test.ts tests/index.test.ts
```

Expected: all focused context and extension tests pass.

### Task 3: Verify and commit the phase

**Files:**

- Verify: `src/core/context.ts`
- Verify: `src/index.ts`
- Verify: `tests/core/context.test.ts`
- Verify: `tests/index.test.ts`

- [ ] **Step 1: Run the full quality checks.**

Run:

```bash
pnpm check
git diff --check
git status --short
```

Expected: lint, typecheck, and all tests pass; no new warnings appear; only the four planned files are modified.

- [ ] **Step 2: Commit the verified phase.**

```bash
git add src/core/context.ts src/index.ts tests/core/context.test.ts tests/index.test.ts
git commit -m "refactor: deepen plan context handling"
```

**Usable result:** Plan capture ignores inline delimiter mentions, context sanitation has one typed Pi seam, persisted state is not incorrectly treated as context, and Plan mode remains operational.

**Assumptions:** Pi 0.82's exported event/message types are authoritative; legacy `proposed-plan` custom messages remain removable after exit; the prompt emits one standalone block; nested or multiple-block recovery is out of scope.
