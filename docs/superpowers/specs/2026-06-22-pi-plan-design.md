# pi-plan: Codex-like Plan Mode Extension for Pi

## Summary

pi-plan adds a `/plan` command to Pi that enters a read-only planning mode. In plan mode, the agent explores the codebase and produces a decision-complete `<proposed_plan>` block before any code mutation happens. Built-in write tools are disabled, bash is restricted to safe read-only commands, and the system prompt guides the agent through an explore-clarify-plan workflow. When the plan is ready, the user can implement it (restoring full tool access and triggering an implementation turn), stay in plan mode to revise, or exit and discard the plan.

No execution tracking or progress widgets. The extension focuses entirely on producing a good plan and handing off cleanly to normal mode.

## Module Structure

```
src/
  index.ts              -- Entry point: createExtension(), registers command/flag/events
  shared/
    types.ts            -- PlanModeState, SessionEntry types, ToolInfo re-export
    constants.ts        -- Tool sets, bash patterns, status keys, plan block regex
  core/
    state.ts            -- persist(), restore(), state transitions (enter/exit/implement)
    safety.ts           -- isSafeCommand(), MUTATING_BASH_PATTERNS, SAFE_BASH_PATTERNS
    context.ts          -- extractProposedPlan(), context message filtering
    tools.ts            -- activatePlanModeTools(), restoreTools(), planModeToolNames(), filtering
    prompt.ts           -- buildPlanModePrompt() system prompt injection
  tui/
    status.ts           -- updateStatus(), formatStatus(), clearStatus()
    menus.ts            -- showPlanReadyMenu(), showPlanMenu(), showToolSelector()
    widgets.ts          -- updateWidget(), clearWidget()

tests/
  index.test.ts         -- Integration: createExtension registers everything correctly
  core/
    state.test.ts       -- persist/restore roundtrip, state transitions
    safety.test.ts      -- isSafeCommand() against known safe/dangerous commands
    context.test.ts     -- extractProposedPlan(), context message filtering
    tools.test.ts       -- planModeToolNames(), activate/restore logic
    prompt.test.ts      -- buildPlanModePrompt() contains expected markers
  tui/
    status.test.ts      -- formatStatus() returns correct strings
    menus.test.ts       -- menu choice handling (with mocks)
```

## State Management

### State Shape

```typescript
interface PlanModeState {
  enabled: boolean;
  latestPlan: string | undefined;
  awaitingAction: boolean;
  selectedToolNames: string[] | undefined;
}
```

### State Transitions

- **enterPlanMode()** -- `enabled: true`, snapshot current tools as `previousTools` (closure-local), activate plan-mode tools.
- **exitPlanMode()** -- `enabled: false`, clear `latestPlan` and `awaitingAction`, restore `previousTools`.
- **startImplementation()** -- call `exitPlanMode()`, then send the proposed plan as a user message to trigger an implementation turn with full tool access.
- **Plan detected** (in `agent_end`) -- set `latestPlan` to extracted content, `awaitingAction: true`.
- **New turn starts** (in `before_agent_start`) -- clear `latestPlan` and `awaitingAction` so the agent does not treat stale plans as current.

### Persistence

`pi.appendEntry("plan-mode-state", state)` after every state change. Restored from session entries on `session_start` by scanning for the latest entry with `customType === "plan-mode-state"`. The `previousTools` snapshot is closure-local (not persisted); on resume, plan-mode tools are re-derived from restored state.

## Tool Management

### Default Plan-Mode Tools

`read`, `bash` (filtered), `grep`, `find`, `ls` -- the safe built-in read-only set.

### Tool Lifecycle

1. On enter: snapshot `pi.getActiveTools()` as `previousTools`, call `pi.setActiveTools()` with the plan-mode set.
2. On exit/implement: restore from `previousTools`, falling back to `["read", "bash", "edit", "write"]` if snapshot is missing.
3. Extension/custom tools are disabled by default but can be opted in via `/plan tools`.

### `/plan tools` Selector

- Calls `pi.getAllTools()` to get all available tools with `sourceInfo`.
- Paginated at 10 tools per page.
- Built-in tools: `read`, `grep`, `find`, `ls` are selectable; `edit` and `write` are shown but blocked; `bash` is shown as "built-in limited".
- Non-built-in tools: selectable, labeled with source info and "user risk" warning.
- Selections stored in `state.selectedToolNames` and persisted.

### Bash Filtering

The `tool_call` event handler intercepts bash calls when plan mode is active. Commands are checked against two pattern lists:

- **MUTATING_BASH_PATTERNS**: `rm`, `mv`, `cp`, `mkdir`, `touch`, `chmod`, git write operations, package installs, `sudo`, `kill`, editors, redirects, etc.
- **SAFE_BASH_PATTERNS**: `cat`, `head`, `tail`, `grep`, `find`, `ls`, `pwd`, `git status/log/diff/show/branch`, `npm list/view/info`, `sed -n`, `jq`, `awk`, `rg`, `fd`, version checks, etc.

A command is safe only if it matches at least one safe pattern and no mutating patterns. Blocked commands return `{ block: true, reason: "Plan mode blocks mutating or non-allowlisted bash commands.\nCommand: <command>" }`.

### Before-Agent-Start Tool Refresh

Each turn re-applies `pi.setActiveTools()` with the current plan-mode tools to handle edge cases where other extensions modify the tool list between turns.

## Plan Detection and Context Management

### Plan Output Format

The agent wraps its final plan in `<proposed_plan>...</proposed_plan>` tags.

### Detection Flow

1. `agent_end` fires -- extract latest assistant message text.
2. `extractProposedPlan(text)` matches `/<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i`.
3. If found: set `state.latestPlan` and `state.awaitingAction = true`, then schedule the plan-ready menu via `setTimeout(0)` to run after the current agent loop completes.
4. If not found: persist state, update UI, no menu.

### Context Stripping

The `context` event handler filters messages before they reach the LLM:

- **When plan mode is active:** Remove legacy plan-mode context messages (custom type markers from previous sessions) but keep everything else including `<proposed_plan>` blocks.
- **When plan mode is off:** Remove plan-mode context injection messages (the `[PLAN MODE ACTIVE]` system prompt artifacts). `<proposed_plan>` blocks in assistant messages are kept intact so the agent can still reference the plan after exiting (e.g., to write it to a file).

Original session entries are not modified -- only the context view sent to the LLM is filtered.

### Implementation Handoff

When the user chooses "Implement", `startImplementation()`:

1. Captures `state.latestPlan`.
2. Calls `exitPlanMode()` (restores tools, clears state).
3. Sends a user message: `"Plan mode is now disabled. Full tool access is restored. Implement this proposed plan now:\n\n<plan text>"`.
4. This triggers a new agent turn with full tool access.

### Exit (No Implementation)

When the user chooses "Exit", `exitPlanMode()`:

1. Restores tools.
2. Clears `enabled`, `latestPlan`, `awaitingAction`.
3. No message sent, no turn triggered.
4. The user is back to normal mode. The `<proposed_plan>` block remains in context so the agent can still reference it (e.g., to write it to a file).

### Message Delivery

When sending a user message (for implementation handoff or `/plan <prompt>`), check `ctx.isIdle()`. If idle, send directly via `pi.sendUserMessage()`. If the agent is streaming, use `{ deliverAs: "followUp" }` to queue the message after the current turn.

### Session Lifecycle

- **`session_start`**: Restore persisted state. Check `--plan` flag. Activate plan-mode tools if enabled, otherwise ensure plan-mode-only tools are removed from the active set.
- **`session_shutdown`**: Persist current state. Clear status and widget.

## Commands, Flag, and UI

### `/plan` Command

| Input                       | Behavior                                                                |
| --------------------------- | ----------------------------------------------------------------------- |
| `/plan` (not in plan mode)  | Enter plan mode, notify user                                            |
| `/plan` (in plan mode)      | Show plan menu                                                          |
| `/plan <prompt>`            | Enter plan mode if needed, submit `<prompt>` as first plan-mode message |
| `/plan tools`               | Enter plan mode if needed, show paginated tool selector                 |
| `/plan exit` or `/plan off` | Exit plan mode, discard proposed plan                                   |

`getArgumentCompletions` returns completions for `exit`, `off`, `tools`.

### Plan Menu (shown when `/plan` is run while already in plan mode)

When a proposed plan exists:

- Show latest proposed plan
- Implement this plan
- Configure Plan-mode tools
- Stay in Plan mode
- Exit Plan mode

When no proposed plan:

- Configure Plan-mode tools
- Stay in Plan mode
- Exit Plan mode

### Plan Ready Menu (shown automatically after `<proposed_plan>` is detected)

- Implement this plan
- Stay in Plan mode
- Exit Plan mode

### `--plan` Flag

`pi.registerFlag("plan", { type: "boolean", default: false })`. Checked on `session_start`; if true, sets `state.enabled = true`.

### Status Indicator

Published via `ctx.ui.setStatus("pi-plan", value)`. Compatible with Pi's default footer and pi-status custom footer.

| State                         | Status value          |
| ----------------------------- | --------------------- |
| Plan mode off                 | `undefined` (cleared) |
| Plan mode active, no plan yet | `"plan active"`       |
| Plan ready                    | `"plan ready"`        |

Plain strings, under 18 characters. No ANSI theming.

### Widget

Published via `ctx.ui.setWidget("pi-plan", lines)`.

| State         | Widget content                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| Plan mode off | `undefined` (cleared)                                                           |
| Planning      | `["Plan mode: planning", <tool summary>, "Produce a <proposed_plan> block."]`   |
| Plan ready    | `["Proposed plan ready", "Use /plan to implement, revise, or exit Plan mode."]` |

## System Prompt Injection

The `before_agent_start` handler appends a plan-mode prompt to the system prompt when `state.enabled` is true. Returned via `{ systemPrompt: event.systemPrompt + "\n\n" + buildPlanModePrompt() }`.

### Plan Mode Prompt Content

```
[PLAN MODE ACTIVE]
# Plan Mode (Conversational)

You are in Plan Mode. Produce a decision-complete implementation plan
before any code mutation happens.

## Mode rules

- Stay in Plan Mode until the user explicitly exits or chooses to implement.
- Do not edit files, write files, or execute the plan.
- If the user asks you to make changes or implement something, remind them
  to exit Plan Mode first by running /plan and choosing "Implement this plan",
  or by running /plan exit.
- Bash is restricted to read-only commands.
- Skills and tools listed in the system prompt are available if they operate
  through currently enabled Plan Mode tools. Skills that require edit, write,
  or mutating bash commands will be blocked.

## Phase 1 -- Explore

- Use read-only tools to inspect files, search code, check configuration.
- Resolve discoverable facts before asking the user.

## Phase 2 -- Clarify

- Ask about purpose, constraints, success criteria, preferences, and tradeoffs.
- Do not guess when ambiguity changes the outcome.

## Phase 3 -- Plan

- Once intent and implementation details are clear, produce exactly one
  <proposed_plan> block:

<proposed_plan>
# Title
## Summary
## Key Changes
## Test Plan
## Assumptions
</proposed_plan>

- The plan must be decision-complete: no open questions for the implementer.
- Do not ask "should I proceed?" -- the Plan Mode menu handles next steps.
```

## Testing Strategy

Tests mirror the src structure. Pure functions are tested directly. Extension wiring is tested against a mock `ExtensionAPI`.

| Test file                    | Coverage                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `tests/index.test.ts`        | `createExtension()` registers flag, command, event handlers on mock Pi                         |
| `tests/core/state.test.ts`   | State transitions: enter/exit/implement clear correct fields; restore from entries             |
| `tests/core/safety.test.ts`  | `isSafeCommand()` against safe commands and dangerous commands                                 |
| `tests/core/context.test.ts` | `extractProposedPlan()`, context message filtering (artifacts removed, plan blocks kept)       |
| `tests/core/tools.test.ts`   | `planModeToolNames()` returns correct set; blocked tools filtered                              |
| `tests/core/prompt.test.ts`  | `buildPlanModePrompt()` contains plan mode marker and key instructions                         |
| `tests/tui/status.test.ts`   | `formatStatus()` returns correct strings for each state                                        |
| `tests/tui/menus.test.ts`    | Menu choice routing: implement triggers exit + message, exit triggers exit only, stay is no-op |

### Mock ExtensionAPI

Captures calls to `registerFlag`, `registerCommand`, `on`, `setActiveTools`, `getActiveTools`, `getAllTools`, `appendEntry`, `sendMessage`, `sendUserMessage` for assertions.

## Out of Scope

- Execution tracking / progress widgets / `[DONE:n]` markers
- Custom `plan_mode_question` tool
- Keyboard shortcut
- Skill enable/disable (no Pi API support; revisit if `getActiveSkills`/`setActiveSkills` is added)
- ANSI-themed status values (plain strings work with both default and custom status bars)
