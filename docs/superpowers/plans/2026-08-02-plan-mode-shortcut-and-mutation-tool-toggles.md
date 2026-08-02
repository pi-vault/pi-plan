# Plan-Mode Shortcut and Mutation-Tool Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conflict-free `Ctrl+Alt+P` Plan-mode shortcut and let users independently opt `edit` and `write` into Plan mode through the existing persisted tool selector.

**Architecture:** Reuse `selectedToolNames` as the single source of truth. A canonical mutation-tool tuple and name guard in `src/core/tools.ts` are consumed by selector policy, prompt generation, and runtime authorization. No new command, state field, dependency, or configuration format is introduced. Save-plan sessions retain their exact-content, write-only authorization and take precedence over ordinary mutation-tool selection.

**Tech Stack:** TypeScript, Pi Extension API, `@earendil-works/pi-tui`, Vitest, Biome, pnpm.

---

## File Map

- `src/core/tools.ts`: canonical mutation-tool names, selector policy, active-tool composition, and existing persistence.
- `src/core/prompt.ts`: Plan-mode prompt rules parameterized by selected mutation tools.
- `src/tui/tool-selector.ts`: warning labels and toggle behavior driven by the shared policy.
- `src/index.ts`: `Ctrl+Alt+P`, selected-tool runtime authorization, dynamic prompt injection, and neutral notifications.
- `tests/helpers.ts`: shortcut-aware Pi test double.
- `tests/core/tools.test.ts`, `tests/core/prompt.test.ts`, `tests/tui/tool-selector.test.ts`, `tests/index.test.ts`: unit and integration regressions.
- `README.md`, `CHANGELOG.md`: current user-facing behavior; do not modify released changelog history.

### Task 1: Add failing unit coverage for the shared mutation policy

**Files:** `tests/core/tools.test.ts`, `tests/core/prompt.test.ts`, `tests/tui/tool-selector.test.ts`

- [ ] **Step 1: Specify the canonical mutation guard in tests.** Add expectations for the planned export `isPlanMutationToolName`:

```ts
expect(isPlanMutationToolName("edit")).toBe(true);
expect(isPlanMutationToolName("write")).toBe(true);
expect(isPlanMutationToolName("bash")).toBe(false);
```

- [ ] **Step 2: Replace blocked-policy expectations.** In `tests/core/tools.test.ts`, assert that both built-in `edit` and `write` return exactly `{ alwaysOn: false, toggleable: true, label: "user risk: built-in mutation" }`. Keep safe built-ins always-on and extension tools user-risk optional. Assert `planModeToolNames(["edit", "write"])` returns `read`, `bash`, `grep`, `find`, `ls`, `edit`, `write` in that order.

- [ ] **Step 3: Add exact prompt-state tests.** Add tests for all four selection states. The expected dynamic lines are:

```ts
expect(buildPlanModePrompt([])).toContain(
  "Do not edit files, write files, or execute the plan.",
);
expect(buildPlanModePrompt(["edit"])).toContain(
  "Enabled mutation tools: edit.",
);
expect(buildPlanModePrompt(["write"])).toContain(
  "Enabled mutation tools: write.",
);
expect(buildPlanModePrompt(["edit", "write"])).toContain(
  "Enabled mutation tools: edit, write.",
);
for (const selected of [[], ["edit"], ["write"], ["edit", "write"]]) {
  expect(buildPlanModePrompt(selected)).toContain(
    "Unselected mutation tools remain blocked. Do not execute the plan.",
  );
}
```

Also assert that the no-selection prompt contains the exit reminder for all changes, while a selected-tool prompt only requires exit before implementing the proposed plan. Assert all variants contain `Skills requiring unavailable tools or mutating bash commands will be blocked.`

- [ ] **Step 4: Add selector interaction tests.** Update `tests/tui/tool-selector.test.ts` so built-in `edit` and `write` render unchecked with the shared warning label. Add a selector containing `edit`, `write`, and an extension tool; navigate and press Space on each row independently; verify Enter returns exactly the selected names. Keep safe built-ins non-toggleable.

- [ ] **Step 5: Run the focused tests and verify red.** Run:

```bash
mise exec node@24.15.0 -- pnpm exec vitest run \
  tests/core/tools.test.ts tests/core/prompt.test.ts tests/tui/tool-selector.test.ts
```

Expected: the new assertions fail against the current blocked-tool and static-prompt implementation.

### Task 2: Implement the shared policy and coherent prompt

**Files:** `src/core/tools.ts`, `src/tui/tool-selector.ts`, `src/core/prompt.ts`

- [ ] **Step 1: Add the canonical mutation tuple and helpers.** In `src/core/tools.ts`, add:

```ts
export const PLAN_MUTATION_TOOL_NAMES = ["edit", "write"] as const;

export function isPlanMutationToolName(name: string): boolean {
  return PLAN_MUTATION_TOOL_NAMES.some((mutationToolName) => mutationToolName === name);
}
```

Replace `BLOCKED_TOOL_NAMES` with this tuple and use the guard from `getToolPolicy`. `getToolPolicy` must return the user-risk mutation policy for both names. Do not add either mutation tool to `SAFE_PLAN_TOOL_NAMES`; `planModeToolNames` must include them only when selected. Existing JSON persistence should then store and restore `edit: true` and `write: true` without schema changes.

- [ ] **Step 2: Update selector copy without changing interaction mechanics.** Change the selector subtitle to `Optional tools run at user risk.`. Keep Space gated by `getToolPolicy(tool).toggleable` and keep safe-tool filtering on Enter; selected `edit`/`write` names must be returned as optional selections.

- [ ] **Step 3: Make `buildPlanModePrompt` selection-aware.** Change the function signature to `buildPlanModePrompt(selectedToolNames: readonly string[] = [])` and derive enabled names by filtering `PLAN_MUTATION_TOOL_NAMES`. Replace the static mutation and exit-rule text with these exact branches:

```ts
const mutationRules =
  enabled.length === 0
    ? "- Do not edit files, write files, or execute the plan."
    : `- Enabled mutation tools: ${enabled.join(", ")}. Use them only for file changes the user explicitly requests.\n- Unselected mutation tools remain blocked. Do not execute the plan.`;

const changeRule =
  enabled.length === 0
    ? '- If the user asks you to make changes or implement something, remind them to exit Plan Mode first by running /plan and choosing "Implement this plan", or by running /plan exit.'
    : '- If the user asks you to implement the proposed plan, remind them to exit Plan Mode first by running /plan and choosing "Implement this plan", or by running /plan exit.';
```

Keep the existing phases, proposed-plan template, Bash restriction, and mode-transition rules. Replace the old skill sentence with `Skills requiring unavailable tools or mutating bash commands will be blocked.` so it is true in every selection state.

- [ ] **Step 4: Rerun focused unit tests.** The three test files from Task 1 must pass.

### Task 3: Add `Ctrl+Alt+P` and enforce permissions at runtime

**Files:** `tests/helpers.ts`, `tests/index.test.ts`, `src/index.ts`

- [ ] **Step 1: Extend the Pi test double.** Add a registered-shortcut type whose handler accepts `ExtensionContext`, add `shortcuts: Map<string, RegisteredShortcut>` to `MockPi`, and implement `registerShortcut` by storing each registration under its string key.

- [ ] **Step 2: Add failing shortcut tests.** In `tests/index.test.ts`, assert `mock.shortcuts.has("ctrl+alt+p")`, invoke its handler twice while idle, and verify status changes from `plan active` to cleared. Add a busy test using a production-shaped `ExtensionContext` without command-only `waitForIdle()`: press once, verify the queued notification, settle the agent, and verify the mode changes; press twice while busy and verify the second target cancels the first.

- [ ] **Step 3: Add failing authorization tests.** Cover all four selection states in `tests/index.test.ts`: default `edit` and `write` calls block; edit-only permits edit but blocks write; write-only permits write but blocks edit; both permit both. Assert active tools match the same selections and `before_agent_start` includes the same prompt rules.

- [ ] **Step 4: Add persistence and Save-plan regression tests.** Extend the existing temporary-agent-dir JSON tests to write/read both booleans. Add a session-start test proving persisted `edit`/`write` override session-only selections. Add a Save-plan test proving `edit` is blocked even if persisted, ordinary write authorization is not used during Save plan, and after `agent_settled` the selected ordinary tools are restored.

- [ ] **Step 5: Run `tests/index.test.ts` and verify red.** Run:

```bash
mise exec node@24.15.0 -- pnpm exec vitest run tests/index.test.ts
```

Expected: the new shortcut and permission cases fail before production changes.

- [ ] **Step 6: Register the shortcut with Pi’s supported helper.** Import `Key` from `@earendil-works/pi-tui` and register after the existing command registrations:

```ts
pi.registerShortcut(Key.ctrlAlt("p"), {
  description: "Toggle Plan mode",
  handler: async (ctx) => {
    clearPendingMenu();
    const current = pendingModeTransition?.enabled ?? state.enabled;
    const enabled = !current;
    if (requestModeTransition({ enabled, applyOnSettled: true }, ctx)) {
      ctx.ui.notify(
        enabled ? "Plan mode enabled." : "Plan mode disabled.",
        "info",
      );
    }
  },
});
```

Pi 0.83’s extension runner confirms this key is not reserved; Pi’s bundled Plan-mode example uses the same shortcut. Do not register Shift-Tab because Pi reserves it for `app.thinking.cycle`. The transition marker enables a shortcut-only fallback: command contexts continue using `waitForIdle()`, while busy shortcut contexts store the latest transition for `agent_settled` because Pi does not expose `waitForIdle()` on `ExtensionContext`. Keep other non-command contexts on the existing warning path so prompt-bearing transitions never run before all settlement handlers finish.

- [ ] **Step 7: Replace unconditional mutation blocking.** In `src/index.ts`, handle Save plan first: route `write` to `savePlanSession.authorizeToolCall`, block `edit`, and do not allow ordinary mutation authorization during that session. Outside Save plan, for any `isPlanMutationToolName(event.toolName)`, return `undefined` only when `state.selectedToolNames?.includes(event.toolName)` is true; otherwise return the existing Plan-mode block result. Leave Bash validation unchanged.

- [ ] **Step 8: Pass selection into the normal prompt and update notifications.** Call `buildPlanModePrompt(state.selectedToolNames ?? [])` from normal `before_agent_start`. Replace entry messages that say write tools are disabled with `Plan mode enabled.` and change the selector count message from `extension tool(s)` to `optional tool(s)`.

- [ ] **Step 9: Rerun integration tests.** Run `mise exec node@24.15.0 -- pnpm exec vitest run tests/index.test.ts`; all existing and new cases must pass.

### Task 4: Update current documentation only

**Files:** `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Update README current behavior.** Change the description from unqualified read-only planning to read-only by default. Document `Ctrl+Alt+P` under Plan-mode usage and state that Shift-Tab remains Pi’s thinking-level shortcut. Update Configure Optional Tools and Safety Boundaries to say `edit` and `write` are independently disabled by default, persist after opt-in, and are limited to explicit user-requested changes. Keep Save plan’s exact one-write exception separate.

- [ ] **Step 2: Update only `CHANGELOG.md`’s `[Unreleased]` section.** Add entries for the shortcut and independently persisted mutation-tool opt-ins. Do not edit released sections that describe historical behavior.

### Task 5: Verify and review the implementation

**Files:** all files modified above

- [ ] **Step 1: Run the full project checks under the declared runtime.** Run:

```bash
mise exec node@24.15.0 -- pnpm check
```

Expected: Biome lint, TypeScript, and all tests pass. The current baseline is 9 test files and 233 tests passing under this runtime.

- [ ] **Step 2: Run the package dry run.** Run `mise exec node@24.15.0 -- pnpm run pack:dry-run`; confirm the package contains updated source, README, and changelog with no dependency or lockfile changes.

- [ ] **Step 3: Smoke-test the local extension in isolation.** From the repository root run `mise exec node@24.15.0 -- pi --no-extensions -e ./src/index.ts --no-session`. Verify `Ctrl+Alt+P` toggles Plan mode, Shift-Tab still changes thinking level, `/plan:tools` independently selects `edit` and `write`, and unselected mutation calls are blocked. Use a temporary `PI_CODING_AGENT_DIR` when checking persisted JSON.

- [ ] **Step 4: Review the final diff.** Run `git diff --check` and `git status --short`. Confirm only planned source, test, README, changelog, and plan files changed; no screenshot asset is modified.

## Self-review

- The four permission states have explicit policy, active-tool, prompt, runtime, persistence, and test coverage.
- The canonical mutation tuple prevents policy/prompt/runtime drift.
- Prompt rules no longer contradict explicit opt-in behavior or skill availability.
- Save-plan precedence remains exact-content and write-only, regardless of persisted mutation selections.
- Shortcut behavior matches Pi 0.83’s extension API and reserved-key policy; Shift-Tab remains untouched.
- Released changelog history and the screenshot are intentionally out of scope.
- No placeholders, new dependencies, migrations, or unrelated refactors remain.
