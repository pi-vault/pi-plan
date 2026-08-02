# Preserve Plan Context Across Mode Switches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Plan mode and normal mode share the same conversation context, matching Codex's in-place collaboration-mode switching.

**Architecture:** Plan mode remains a Pi extension policy applied per turn. It changes active tools, safety checks, UI state, and the Plan-mode prompt, but never filters or rewrites stored conversation messages. The cached `latestPlan` remains menu/save state only and is cleared when the next turn begins.

**Tech Stack:** TypeScript, Pi extension API, Vitest, Biome, pnpm.

---

## File Map

- Modify `src/index.ts`: remove context pruning and one-turn handoff; keep mode/tool lifecycle and change implementation submission.
- Modify `src/core/context.ts`, `src/core/state.ts`, and `src/shared/constants.ts`: retain plan extraction, preserve the cached plan on re-entry, and remove obsolete sanitization symbols.
- Modify `tests/core/context.test.ts`, `tests/core/state.test.ts`, and `tests/index.test.ts`: replace pruning/handoff assertions with same-context transition coverage.
- Modify `README.md` and `CHANGELOG.md`: document continuous conversation semantics.

### Task 1: Update regression tests first

**Files:** `tests/core/context.test.ts`, `tests/core/state.test.ts`, `tests/index.test.ts`

- [ ] Change the `enterPlanMode` test to expect `latestPlan` to survive entry while `awaitingAction` resets.
- [ ] Remove tests that expect assistant `<proposed_plan>` blocks to be stripped or legacy plan messages to be hidden by the context handler.
- [ ] Add an integration assertion that normal-mode context messages are returned unchanged (the extension must not register a `context` handler).
- [ ] Change the restored-disabled-state test: the first normal `before_agent_start` returns no handoff system prompt, clears the cached plan state, and persists `{ latestPlan: undefined, awaitingAction: false }`.
- [ ] Add a transition test: capture a plan, exit, re-enter before another turn, and verify the Plan menu still offers plan actions; then start a turn and verify the cache clears.
- [ ] Change the implementation-action assertion from the full plan prompt to exactly `Implement the plan.` while retaining the full conversation as the source of context.
- [ ] Run the focused tests and confirm they fail for the current implementation:

  ```bash
  pnpm vitest run tests/core/context.test.ts tests/core/state.test.ts tests/index.test.ts
  ```

### Task 2: Remove context loss and align transitions

**Files:** `src/index.ts`, `src/core/context.ts`, `src/core/state.ts`, `src/shared/constants.ts`

- [ ] Change `enterPlanMode` to return the existing `latestPlan` unchanged while clearing only `awaitingAction`.
- [ ] Delete assistant-message sanitization and the `sanitizePlanModeContext` export; keep `assistantText` and `captureProposedPlan` for plan detection.
- [ ] Remove the obsolete `PROPOSED_PLAN_MESSAGE_TYPE` constant once no source or test references remain.
- [ ] Remove the `context` event registration and its import from `src/index.ts`; Pi will pass all stored conversation messages through in both modes.
- [ ] Replace the disabled branch of `before_agent_start` with a per-turn cache clear: when a cached plan exists, clear it, persist state, refresh UI, and return `undefined`; otherwise leave the event untouched.
- [ ] Keep the enabled branch’s Plan prompt and tool reapplication unchanged.
- [ ] In the `implement` menu action, exit first, clear and persist the cached plan, then call `sendPlanModeMessage("Implement the plan.", ctx)`.
- [ ] Run the focused tests again and confirm they pass:

  ```bash
  pnpm vitest run tests/core/context.test.ts tests/core/state.test.ts tests/index.test.ts
  ```

### Task 3: Update user-facing behavior documentation

**Files:** `README.md`, `CHANGELOG.md`

- [ ] Replace the claim that Exit preserves the plan for only the first normal-mode turn with the same-conversation behavior: mode switches preserve prior messages, while the menu cache lasts until the next turn.
- [ ] Document that **Implement this plan** submits a short implementation request in the retained conversation.
- [ ] Add an Unreleased changelog entry describing removal of context pruning and the Codex-aligned same-context handoff.
- [ ] Keep Save plan, tool configuration, and safety-boundary documentation unchanged except where wording references the old handoff.

### Task 4: Verify the complete package

**Files:** none beyond the changes above

- [ ] Run the full quality suite:

  ```bash
  pnpm check
  ```

  Expected: Biome lint, TypeScript typecheck, and all Vitest tests pass.

- [ ] Verify the package contents without publishing:

  ```bash
  pnpm run pack:dry-run
  ```

  Expected: the package includes the updated source and documentation and no generated or test-only files.

- [ ] Review the diff to confirm there are no new dependencies, persisted state fields, branches, or unrelated refactors.
- [ ] Commit the completed implementation as a small focused change, for example:

  ```bash
  git add src tests README.md CHANGELOG.md
  git commit -m "fix: preserve context across plan mode switches"
  ```

## Acceptance Criteria

- Switching Plan → normal → Plan without a new turn keeps the same conversation and latest Plan-menu cache.
- A normal-mode turn receives prior Plan messages without a `[PLAN HANDOFF]` system override.
- The implementation action uses `Implement the plan.` and relies on retained history.
- Plan-mode tools and safety restrictions still apply after re-entry.
- Existing persisted state resumes without migration or data loss.
