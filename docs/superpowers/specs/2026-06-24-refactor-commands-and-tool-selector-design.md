# Refactor Commands and Tool Selector

## Summary

Two changes to pi-plan:

1. **Command format refactor** -- change `/plan subcommand` to `/plan:subcommand` using separate command registrations
2. **Custom tool selector** -- replace `ctx.ui.select()` with a `ctx.ui.custom()` component matching the pi-status editor pattern, with themed colors, `[*]`/`[ ]` checkboxes, cursor indicator, pagination, and search

## 1. Command format

### Current

```
/plan                  -> enter plan mode or show menu
/plan <prompt>         -> enter + send prompt
/plan tools            -> show tool selector
/plan exit             -> exit plan mode
/plan off              -> alias for exit
```

All handled by a single `pi.registerCommand("plan", ...)` with arg parsing.

### New

| Command        | Behavior                                     |
| -------------- | -------------------------------------------- |
| `/plan`        | Enter plan mode (or show menu if already in) |
| `/plan <text>` | Enter plan mode + send prompt                |
| `/plan:tools`  | Enter (if needed) + show tool selector       |
| `/plan:exit`   | Exit plan mode                               |

- `/plan:off` is removed. With explicit subcommands there is no ambiguity to warrant an alias.
- Each subcommand is a separate `pi.registerCommand()` call.
- The main `/plan` command keeps free-form prompt handling (`/plan <text>`).
- `getArgumentCompletions` is removed from the main command since subcommands are separate.

### Files changed

- `src/index.ts` -- split command registration, remove arg parsing and completions
- `tests/index.test.ts` -- update command invocation tests to use new names

## 2. Custom tool selector

### Motivation

The current tool selector uses `ctx.ui.select()`, which is a simple single-choice picker. It cannot:

- Show a persistent cursor indicator
- Display themed colors for tool policy labels
- Let users search/filter the tool list
- Provide a checkbox-style multi-select experience

### Design

Replace with a custom TUI component via `ctx.ui.custom()`, following the pi-status editor pattern (`editor.ts` + `editor-state.ts` + `editor-render.ts`).

### Visual layout

Each row follows the format: `{cursor} {checkbox} {name}  {policy-label}`

Symbols (shown as ASCII approximations since markdown interferes with the real characters):

- Cursor indicator: U+25B8 right-pointing triangle
- Enabled bullet: U+2022 bullet inside brackets
- Separator dot in help line: U+2022 bullet

Example with 5 tools, first row focused:

```
Configure Plan-mode tools (1/2)

{cursor} [{bullet}] read               built-in
         [{bullet}] bash               built-in limited
         [ ] grep               built-in
         [ ] find               built-in
         [ ] custom-tool        user risk: ext/pkg

Toggle: Space {dot} Navigate: Up/Down {dot} Page: Left/Right {dot} Save: Enter {dot} Cancel: Esc
```

Where `{cursor}` = U+25B8, `{bullet}` = U+2022, `{dot}` = U+2022. Unfocused rows have a space where the cursor would be.

### UI elements

| Element                        | Character             | Color           |
| ------------------------------ | --------------------- | --------------- |
| Cursor indicator (focused row) | `>` (U+25B8)          | `accent`        |
| Enabled checkbox               | `[*]` (bullet U+2022) | default         |
| Disabled checkbox              | `[ ]`                 | default         |
| Tool name (focused)            | plain text            | `accent` + bold |
| Tool name (unfocused)          | plain text            | default         |
| `built-in` label               | text                  | `dim`           |
| `built-in limited` label       | text                  | `warning`       |
| `built-in blocked` label       | text                  | `error`         |
| `user risk: {source}` label    | text                  | `warning`       |
| Help line                      | text                  | `dim`           |
| Title                          | text                  | `accent` + bold |
| Subtitle                       | text                  | `dim`           |

### Theme integration

Access Pi theme via the `theme` parameter from `ctx.ui.custom(factory)`:

```typescript
ctx.ui.custom<ToolSelectorResult>((tui, theme, keybindings, done) => {
  return createToolSelectorComponent({ theme, tools, state, done, ... });
});
```

Theme color roles used (from `ThemeColor`): `accent`, `dim`, `warning`, `error`.

### Keyboard handling

| Key                    | Action                                             |
| ---------------------- | -------------------------------------------------- |
| Up/Down                | Move cursor in list                                |
| Space                  | Toggle selected tool (no-op for always-on/blocked) |
| Left/Right (no search) | Previous/next page                                 |
| Left/Right (searching) | Move text cursor in search input                   |
| Enter                  | Save selections and close                          |
| Esc                    | Cancel (discard changes)                           |
| Printable chars        | Append to search query                             |
| Backspace              | Remove last search character                       |

### Search behavior

- Search input displayed at top: `{U+25B8} {query}` (matches pi-status pattern)
- Typing printable characters filters the tool list by name (case-insensitive substring match)
- Filtered results remain toggleable
- Pagination disabled while search is active
- Help line updates to show `Cursor: Left/Right` instead of `Page: Left/Right` when searching
- Cursor position within query tracked by `queryCursor` for Left/Right navigation

### State

```typescript
interface ToolSelectorState {
  tools: ToolSelectorItem[]; // all selectable tools
  selectedNames: Set<string>; // currently enabled tool names
  cursorIndex: number; // focused row in current view
  page: number; // current page (0-based)
  query: string; // search filter text
  queryCursor: number; // text cursor position in query
}
```

### Actions

```typescript
type ToolSelectorAction =
  | { type: "move_up" }
  | { type: "move_down" }
  | { type: "toggle" }
  | { type: "next_page" }
  | { type: "prev_page" }
  | { type: "type_char"; char: string }
  | { type: "backspace" }
  | { type: "cursor_left" }
  | { type: "cursor_right" }
  | { type: "save" }
  | { type: "cancel" };
```

### Result type

```typescript
type ToolSelectorResult = string[] | null;
// string[] = selected non-builtin tool names
// null = cancelled (no changes)
```

### Architecture

New files under `src/tui/`:

| File                      | Purpose                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `tool-selector.ts`        | Component factory -- wires keyboard input to reducer, calls render |
| `tool-selector-state.ts`  | State type, actions, reducer (pure functions)                      |
| `tool-selector-render.ts` | Render function -- produces `string[]` lines from state + theme    |

Existing files changed:

| File                      | Change                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `src/tui/menus.ts`        | Remove `showToolSelector` function and `TOOL_SELECTOR_LABELS`. Keep menu functions.  |
| `src/index.ts`            | Import new tool selector, call via `ctx.ui.custom()` instead of `showToolSelector()` |
| `src/shared/constants.ts` | Keep `TOOL_SELECTOR_PAGE_SIZE` (used by new component)                               |

### Tool sorting

Built-in tools sort before extension tools (matching reference). Within each group, alphabetical by name.

### Blocked tools

`edit` and `write` are shown in the list but:

- Cannot be toggled (Space is a no-op)
- Checkbox is always `[ ]`
- Policy label `built-in blocked` shown in `error` color
- Notify with warning if user tries to toggle

### Always-on tools

`read`, `bash`, `grep`, `find`, `ls` are shown with:

- Checkbox always `[*]`
- Cannot be toggled (Space is a no-op)
- Policy label `built-in` or `built-in limited` (for bash)

## Test plan

- [ ] `/plan:tools` enters plan mode if not already in, then shows the custom tool selector
- [ ] `/plan:exit` exits plan mode and restores tools
- [ ] `/plan` with no args enters plan mode or shows menu
- [ ] `/plan <prompt>` enters and sends the prompt
- [ ] Old `/plan tools`, `/plan exit`, `/plan off` no longer handled by the plan command
- [ ] Tool selector renders correct lines for a given state (snapshot tests on render output)
- [ ] Reducer: move_up/move_down wraps or clamps cursor
- [ ] Reducer: toggle adds/removes from selectedNames (no-op for blocked/always-on)
- [ ] Reducer: next_page/prev_page changes page (clamped to bounds)
- [ ] Reducer: type_char/backspace updates query and filters visible tools
- [ ] Reducer: Left/Right dispatches page or cursor based on query state
- [ ] Reducer: save returns selected names, cancel returns null
- [ ] Policy labels are correct for each tool type
- [ ] Theme colors applied correctly (accent, dim, warning, error)
- [ ] Search filters tools by case-insensitive substring match
- [ ] Pagination disabled during search
- [ ] Help line updates based on search state

## Assumptions

- `ctx.ui.custom()` is available on the Pi extension API (confirmed in types)
- `pi.theme` provides `fg(color, text)` and `bold(text)` (confirmed from `Theme` type)
- The `Key` enum and `matchesKey` utility are available from `@earendil-works/pi-tui`
- `truncateToWidth` and `visibleWidth` are available from `@earendil-works/pi-tui` for responsive layout
- The tool selector page size (10) is retained from the current implementation
