# Persistence and Context Cleanup

Date: 2026-07-06

## Summary

Four focused improvements to pi-plan:

1. Persistent tool selections via a JSON config file
2. Strip proposed plan blocks from context on plan mode exit, with plan-to-file save
3. Display-only proposed plan message in chat history
4. Try/catch safety around `getAllTools()` / `getActiveTools()` calls

## 1. Persistent Tool Config

### Problem

Tool selections stored via `appendEntry` only persist within a Pi session. Across Pi relaunches, selections are lost and the user must re-select tools every time they enter plan mode.

### Design

Read/write a JSON file at `$PI_CODING_AGENT_DIR/extensions/plan-tools.json` using Node.js `node:fs/promises`.

File format -- full `Record<string, boolean>` map:

```json
{
  "read": true,
  "bash": true,
  "grep": true,
  "find": true,
  "ls": true,
  "edit": false,
  "write": false,
  "firecrawl_search": true
}
```

### Behavior

- **On `session_start`:** Load the file. If it exists and parses successfully, derive `selectedToolNames` from keys where value is `true` (excluding safe builtins which are always on). If the file doesn't exist, use current defaults (safe builtins only).
- **On tool selector save:** Write the updated full map to the file. Update in-memory `state.selectedToolNames` as before.
- **Session-entry persistence (`appendEntry`):** Remains for in-session state (enabled, latestPlan, awaitingAction) but `selectedToolNames` in the persisted entry becomes informational only -- the file is authoritative for tool selections.
- **Fallback:** If `PI_CODING_AGENT_DIR` env var is unset, skip file I/O entirely and fall back to session-only persistence (current behavior).
- **Error handling:** File read/write wrapped in try/catch. On read failure, notify the user with a warning and fall back to defaults. On write failure, notify with a warning but don't block the selector flow.

### New Module

`src/core/config.ts`:

```ts
// Reads tool config from $PI_CODING_AGENT_DIR/extensions/plan-tools.json
export function readToolConfig(): Promise<Record<string, boolean> | undefined>;

// Writes tool config to the same path
export function writeToolConfig(config: Record<string, boolean>): Promise<void>;

// Resolves config file path, returns undefined if env var is unset
export function getConfigFilePath(): string | undefined;
```

### Changes to Existing Files

- `src/core/tools.ts`: Add `toolConfigToSelectedNames(config: Record<string, boolean>): string[]` and `selectedNamesToToolConfig(names: string[], allTools: ToolSelectorItem[]): Record<string, boolean>` converters.
- `src/index.ts`: On `session_start`, call `readToolConfig()` and use result to populate `state.selectedToolNames`. On tool selector save, call `writeToolConfig()` after updating state.

## 2. Strip Proposed Plan Blocks From Context + Write Plan to File

### Problem

When plan mode exits, `<proposed_plan>` blocks in assistant messages remain in the LLM context, potentially confusing later non-plan turns.

### Design: Write Plan to File

On any exit path (implement, exit/off) where `state.latestPlan` is non-empty:

1. Prompt user for a file path via `ctx.ui.input("Save plan to:", "proposed-plan.md")`.
2. If the user provides a path, resolve it relative to `ctx.cwd` and write `state.latestPlan` using `node:fs/promises` `writeFile`.
3. If the user cancels the input dialog (returns `undefined`), skip writing -- don't block exit.
4. Notify on success or failure.

### Design: Strip Plan Blocks From Context

In the `context` event handler, when `state.enabled === false`:

- Iterate over all messages in `event.messages`.
- For messages with `role === "assistant"`, strip `<proposed_plan>...</proposed_plan>` blocks from content.
- Handle both string content and array-of-blocks content (`{ type: "text", text: string }`).
- Return the filtered messages array.

### Changes to `src/core/context.ts`

Add:

```ts
// Regex for matching proposed plan blocks (global, case-insensitive)
const PROPOSED_PLAN_BLOCK_PATTERN =
  /<proposed_plan>\s*[\s\S]*?\s*<\/proposed_plan>/gi;

// Strip all <proposed_plan> blocks from a text string
export function stripProposedPlanBlocks(text: string): string;

// Strip proposed plan blocks from all assistant messages in an array
export function stripProposedPlanBlocksFromMessages(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>>;
```

### Changes to `src/index.ts`

- In the `context` handler: when `!state.enabled`, call `stripProposedPlanBlocksFromMessages` on the filtered messages before returning.
- In `handleMenuAction` and command handlers: await `savePlanToFile` before calling `doExit` (which clears `latestPlan`). `doExit` itself remains synchronous; callers gate the async save.

### New Module

`src/core/plan-file.ts`:

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// Prompts user for path and writes plan content to file
export async function savePlanToFile(
  plan: string,
  ctx: ExtensionContext,
): Promise<void>;
```

## 3. Display-Only Proposed Plan Message

### Problem

After detecting a proposed plan, pi-plan shows it via notify/widget only. There's no persistent visible record in chat history.

### Design

After detecting a proposed plan in the `agent_end` handler, send a display-only message:

```ts
pi.sendMessage(
  {
    customType: "proposed-plan",
    content: `**Proposed Plan**\n\n${plan}`,
    display: true,
  },
  { triggerTurn: false },
);
```

This places a visible message in the session timeline without triggering an agent turn.

### Constant

Add `PROPOSED_PLAN_MESSAGE_TYPE = "proposed-plan"` to `src/shared/constants.ts`.

### Context Filtering

The existing `context` handler filters messages with `customType === STATE_ENTRY_TYPE` unconditionally (they should never reach the LLM). When plan mode is off, additionally filter out messages with `customType === PROPOSED_PLAN_MESSAGE_TYPE` and strip plan blocks from assistant messages. When plan mode is on, keep proposed-plan messages in context (the agent may reference its own prior plan).

### Changes

- `src/shared/constants.ts`: Add `PROPOSED_PLAN_MESSAGE_TYPE`.
- `src/index.ts`: Add `pi.sendMessage` call in `agent_end` handler after plan detection and before showing the ready menu.
- `src/core/context.ts`: Update `filterPlanModeEntries` to also filter out messages with `customType === PROPOSED_PLAN_MESSAGE_TYPE` when plan mode is off.

## 4. Try/Catch Safety Around Tool APIs

### Problem

`pi.getAllTools()` and `pi.getActiveTools()` can throw if called before the extension runtime is fully bound or in edge cases during shutdown.

### Design

Add safe wrapper functions in `src/core/tools.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ToolSelectorItem } from "../tui/tool-selector-state.ts";
import { DEFAULT_TOOLS } from "../shared/constants.ts";

export function safeGetAllTools(pi: ExtensionAPI): ToolSelectorItem[] {
  try {
    return pi.getAllTools() as ToolSelectorItem[];
  } catch {
    return [];
  }
}

export function safeGetActiveTools(pi: ExtensionAPI): string[] {
  try {
    return pi.getActiveTools();
  } catch {
    return [...DEFAULT_TOOLS];
  }
}
```

### Changes

- `src/core/tools.ts`: Add the two functions above.
- `src/index.ts`: Replace `pi.getAllTools() as ToolSelectorItem[]` with `safeGetAllTools(pi)` and `pi.getActiveTools()` with `safeGetActiveTools(pi)`.

## Testing Strategy

- **Config persistence:** Unit tests for `readToolConfig`, `writeToolConfig`, `toolConfigToSelectedNames`, `selectedNamesToToolConfig`. Use temp directories for file I/O tests.
- **Context stripping:** Unit tests for `stripProposedPlanBlocks` and `stripProposedPlanBlocksFromMessages` with various message shapes (string content, array-of-blocks, mixed roles).
- **Plan file save:** Unit test for `savePlanToFile` with mocked `ctx.ui.input` and temp file writes.
- **Safe wrappers:** Unit tests that verify fallback behavior when the wrapped call throws.
- **Integration:** Existing tests continue to pass; update any tests that assert on the `context` event handler output.

## File Summary

| File                           | Change                                                               |
| ------------------------------ | -------------------------------------------------------------------- |
| `src/core/config.ts`           | New -- config file read/write                                        |
| `src/core/plan-file.ts`        | New -- plan-to-file save flow                                        |
| `src/core/context.ts`          | Add `stripProposedPlanBlocks`, `stripProposedPlanBlocksFromMessages` |
| `src/core/tools.ts`            | Add `safeGetAllTools`, `safeGetActiveTools`, config converters       |
| `src/shared/constants.ts`      | Add `PROPOSED_PLAN_MESSAGE_TYPE`                                     |
| `src/index.ts`                 | Wire new behaviors, replace direct API calls with safe wrappers      |
| `tests/core/config.test.ts`    | New                                                                  |
| `tests/core/plan-file.test.ts` | New                                                                  |
| `tests/core/context.test.ts`   | Add stripping tests                                                  |
| `tests/core/tools.test.ts`     | Add safe wrapper tests                                               |
