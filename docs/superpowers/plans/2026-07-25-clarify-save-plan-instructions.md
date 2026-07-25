# Clarify Save-Plan Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the save-plan prompt request a new dated Markdown filename at the workspace root and preserve the captured plan byte-for-byte.

**Architecture:** Keep the existing agent-mediated save turn and all current path/content preflight rules. Change only the user message sent by `handleMenuAction()` and the tests that define that prompt contract; Pi 0.82.0 may create parent directories, but `pi-plan` intentionally rejects missing parents, so the prompt will use the existing workspace root and avoid requiring directory creation.

**Tech Stack:** TypeScript, Pi extension API, Node.js filesystem/path validation, Vitest, pnpm.

---

## File Map

- Modify `tests/index.test.ts`: assert the complete save-turn prompt and use a dated root filename in the successful preflight case.
- Modify `src/index.ts`: update only the save message in `handleMenuAction()`.
- Do not modify validation, authorization, save state, documentation, or any other worktree files.

### Task 1: Define the dated root-filename contract in tests

**Files:**

- Modify: `tests/index.test.ts:1756-1800` (save lifecycle prompt test)
- Modify: `tests/index.test.ts:371-405` (successful write preflight test)

- [ ] **Step 1: Replace the loose prompt assertions with an exact message assertion.**

In `"sends the full captured plan and restricts tools for a save turn"`, keep the existing setup and lifecycle assertions, then replace the three current prompt-content assertions with:

```ts
const saveMessage = mock.userMessages[0].content;
expect(saveMessage).toBe(
  "Save the current proposed plan. Choose a new lowercase .md filename in the workspace root /repo. Prefix the filename with today's date followed by a hyphen (YYYY-MM-DD-); use date +%F if needed. Pass only the filename as a relative workspace path; do not use an absolute path or a subdirectory. Write exactly the plan below to that file. Do not add leading or trailing whitespace, including a trailing newline. Make no other changes.\n\n# Ship It\n\nDetails",
);
```

Leave these assertions unchanged:

```ts
expect(mock.userMessages).toHaveLength(1);
expect(mock.userMessages[0].options).toBeUndefined();
expect(mock.activeTools).toEqual(
  expect.arrayContaining([...SAFE_BUILTIN_PLAN_TOOLS, "write"]),
);
expect(mock.activeTools).not.toContain("my-search");
expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
```

- [ ] **Step 2: Change the successful preflight destination to a dated workspace-root filename.**

In `"allows one exact write for the captured content and sibling write paths only"`, change the valid input from:

```ts
input: { path: "docs/plan.md", content: test.plan },
```

to:

```ts
input: { path: "2026-07-25-plan.md", content: test.plan },
```

This verifies that the existing lowercase `.md` validation accepts the dated root filename without creating a directory. Keep the other preflight fixtures, including the missing-parent rejection, unchanged.

- [ ] **Step 3: Run the focused tests and verify the prompt test fails before implementation.**

Run:

```bash
pnpm exec vitest run tests/index.test.ts -t "sends the full captured plan|allows one exact write"
```

Expected: the dated root-filename preflight test passes, while the prompt test fails because the current message still says `choose a new lowercase .md file` and does not contain the new path/date/whitespace instructions.

### Task 2: Update the save-turn prompt and verify the complete change

**Files:**

- Modify: `src/index.ts:188-192` (`handleMenuAction()` save branch)
- Test: `tests/index.test.ts` from Task 1

- [ ] **Step 1: Replace only the save message template.**

In the `case "save"` branch, replace the existing `sendPlanModeMessage()` content with:

```ts
sendPlanModeMessage(
  `Save the current proposed plan. Choose a new lowercase .md filename in the workspace root ${ctx.cwd}. Prefix the filename with today's date followed by a hyphen (YYYY-MM-DD-); use date +%F if needed. Pass only the filename as a relative workspace path; do not use an absolute path or a subdirectory. Write exactly the plan below to that file. Do not add leading or trailing whitespace, including a trailing newline. Make no other changes.\n\n${planToSave}`,
  ctx,
);
```

Do not alter `clearPlanSaveState()`, `activatePlanSaveTools()`, path preflight, exact-content comparison, tool authorization, or save lifecycle state.

- [ ] **Step 2: Rerun the focused regression.**

Run:

```bash
pnpm exec vitest run tests/index.test.ts -t "sends the full captured plan|allows one exact write"
```

Expected: both selected tests pass.

- [ ] **Step 3: Run the full project check.**

Run:

```bash
pnpm check
```

Expected: Biome, TypeScript, and all Vitest tests pass. The repository may emit its existing Node engine warning because the current environment is Node 23.11 while `package.json` declares Node `>=24.15.0`.

- [ ] **Step 4: Review the diff and confirm scope.**

Run:

```bash
git diff -- src/index.ts tests/index.test.ts
git status --short
```

Expected: only the save prompt and the two planned test edits are present; unrelated worktree files remain unstaged and untouched.

- [ ] **Step 5: Commit only the implementation files.**

After confirming the scope, run:

```bash
git add src/index.ts tests/index.test.ts
git commit -m "fix: clarify plan save constraints"
```

Do not stage or commit this plan file or unrelated worktree changes unless explicitly requested.

## Self-Review

- Pi 0.82.0's built-in `write` creates parent directories recursively, but `pi-plan` preflight still requires the parent to exist; using a root-relative filename avoids that boundary.
- The date prefix is an instruction only, not a new validation rule. Existing lowercase `.md` validation accepts `2026-07-25-plan.md`.
- The prompt preserves internal plan whitespace and forbids only added leading/trailing whitespace, including a trailing newline.
- No public API, interface, type, persistence, authorization, or documentation changes are required.
- No placeholders, incomplete sections, or unassigned requirements remain.
