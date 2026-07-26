# Phase 2: Deepen Context Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Complete every checkbox before committing this phase.

**Goal:** Correct proposed-plan extraction and expose two Pi-typed context operations instead of low-level composition helpers.

**Architecture:** `src/core/context.ts` owns delimiter parsing, assistant content flattening, state-message filtering, and sanitation. `src/index.ts` only calls `captureProposedPlan` and `sanitizePlanModeContext` from Pi event handlers.

**Tech Stack:** TypeScript ESM, Vitest, Pi coding-agent 0.82 event types.

---

**Prerequisite:** Phase 1 commit is present and `pnpm check` passes.

**Files:** Modify `src/core/context.ts`, `src/index.ts`, `tests/core/context.test.ts`, and `tests/index.test.ts`.

- [ ] **Step 1: Add regression and sanitation cases**

Cover an inline introduction followed by a standalone block, uppercase tags, horizontal whitespace, CRLF, empty blocks, malformed/non-standalone blocks, user messages, custom proposed-plan messages, and state-entry removal. The inline case must capture exactly `# Intended` and preserve the introduction during sanitation.

- [ ] **Step 2: Run the regression before fixing it**

Run `pnpm test -- tests/core/context.test.ts`.

Expected: the inline case fails because the current expression starts at an inline tag mention.

- [ ] **Step 3: Anchor both delimiter patterns**

Use these module-private patterns in `src/core/context.ts`:

```ts
const PLAN_BLOCK_PATTERN =
  /^[ \t]*<proposed_plan>[ \t]*\r?\n([\s\S]*?)^[ \t]*<\/proposed_plan>[ \t]*\r?$/im;
const ALL_PLAN_BLOCK_PATTERN =
  /^[ \t]*<proposed_plan>[ \t]*\r?\n[\s\S]*?^[ \t]*<\/proposed_plan>[ \t]*\r?$/gim;
```

Trim captured content. Same-line tags and inline mentions must not match.

- [ ] **Step 4: Replace exports with Pi-typed operations**

Import `AgentEndEvent`, `ContextEvent`, and `ContextEventResult` as type-only imports and expose exactly:

```ts
export function captureProposedPlan(
  messages: AgentEndEvent["messages"],
): string | undefined;

export function sanitizePlanModeContext(
  messages: ContextEvent["messages"],
  enabled: boolean,
): ContextEventResult | undefined;
```

Make message-shape helpers private. Capture the last assistant message and flatten string/text-part content. Sanitation removes state entries, removes custom proposed-plan messages only when disabled, strips valid plan blocks only when disabled, and returns `undefined` when unchanged.

- [ ] **Step 5: Update event wiring**

In `agent_end`, replace reverse-message selection and extraction composition with `captureProposedPlan(messages)`. In `context`, return `sanitizePlanModeContext(messages, state.enabled)` directly. Remove old imports and casts; keep integration tests at the event boundary.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm test -- tests/core/context.test.ts tests/index.test.ts
pnpm check
git diff --check
```

Expected: the regression and all existing context/extension tests pass with no new warnings. Commit:

```bash
git add src/core/context.ts src/index.ts tests/core/context.test.ts tests/index.test.ts
git commit -m "refactor: deepen plan context handling"
```

**Usable result:** Plan capture ignores inline mentions, context sanitation has one typed seam, and Plan mode remains operational.
