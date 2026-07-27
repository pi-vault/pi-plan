import { type Component, Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getToolPolicy, planModeToolNames, type PlanToolInfo } from "../core/tools.ts";
import { TOOL_SELECTOR_PAGE_SIZE } from "../shared/constants.ts";

const SAFE_PLAN_TOOL_NAMES = new Set(planModeToolNames());
const LABEL_COLUMN_WIDTH = 24;
const LAYOUT_GAP = "  ";
const MIN_POLICY_WIDTH = 12;
const HELP_BASE =
  "Toggle: Space  •  Navigate: ↑/↓  •  Page: ←/→  •  Save: Enter  •  Cancel: Esc";
const HELP_SEARCHING =
  "Toggle: Space  •  Navigate: ↑/↓  •  Cursor: ←/→  •  Save: Enter  •  Cancel: Esc";
const SUBTITLE = "Non-built-in tools run at user risk.";
const SEARCH_PLACEHOLDER = "Type to search";

interface ToolSelectorTheme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
}

interface ToolSelectorState {
  tools: PlanToolInfo[];
  selectedNames: Set<string>;
  cursorIndex: number;
  page: number;
  query: string;
  queryCursor: number;
}

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

type ToolSelectorResult =
  | { type: "next"; state: ToolSelectorState }
  | { type: "done"; selections: string[] | null };

function isBuiltin(tool: PlanToolInfo): boolean {
  return tool.sourceInfo.source === "builtin";
}

function isToggleable(tool: PlanToolInfo): boolean {
  return getToolPolicy(tool).toggleable;
}

function toolPolicyLabel(tool: PlanToolInfo): string {
  return getToolPolicy(tool).label;
}

function compareTools(a: PlanToolInfo, b: PlanToolInfo): number {
  const aBuiltin = isBuiltin(a);
  const bBuiltin = isBuiltin(b);
  if (aBuiltin !== bBuiltin) return aBuiltin ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function initToolSelectorState(
  tools: PlanToolInfo[],
  previousSelections: string[] | undefined,
): ToolSelectorState {
  return {
    tools: [...tools].sort(compareTools),
    selectedNames: new Set(previousSelections ?? []),
    cursorIndex: 0,
    page: 0,
    query: "",
    queryCursor: 0,
  };
}

function matchesQuery(tool: PlanToolInfo, query: string): boolean {
  if (!query) return true;
  return tool.name.toLowerCase().includes(query.toLowerCase());
}

function getVisibleTools(state: ToolSelectorState): PlanToolInfo[] {
  if (state.query) return state.tools.filter((tool) => matchesQuery(tool, state.query));
  const start = state.page * TOOL_SELECTOR_PAGE_SIZE;
  return state.tools.slice(start, start + TOOL_SELECTOR_PAGE_SIZE);
}

function totalPages(state: ToolSelectorState): number {
  return Math.max(1, Math.ceil(state.tools.length / TOOL_SELECTOR_PAGE_SIZE));
}

function clampCursor(state: ToolSelectorState, index: number): number {
  const visible = getVisibleTools(state);
  if (visible.length === 0) return 0;
  return Math.max(0, Math.min(index, visible.length - 1));
}

function isAlwaysOn(tool: PlanToolInfo): boolean {
  return getToolPolicy(tool).alwaysOn;
}

function toolSelectorReducer(
  state: ToolSelectorState,
  action: ToolSelectorAction,
): ToolSelectorResult {
  switch (action.type) {
    case "cancel":
      return { type: "done", selections: null };

    case "save":
      return {
        type: "done",
        selections: [...state.selectedNames].filter((name) => !SAFE_PLAN_TOOL_NAMES.has(name)),
      };

    case "move_up":
      return {
        type: "next",
        state: { ...state, cursorIndex: clampCursor(state, state.cursorIndex - 1) },
      };

    case "move_down":
      return {
        type: "next",
        state: { ...state, cursorIndex: clampCursor(state, state.cursorIndex + 1) },
      };

    case "toggle": {
      const visible = getVisibleTools(state);
      const tool = visible[clampCursor(state, state.cursorIndex)];
      if (!tool || !isToggleable(tool)) return { type: "next", state };
      const selectedNames = new Set(state.selectedNames);
      if (selectedNames.has(tool.name)) selectedNames.delete(tool.name);
      else selectedNames.add(tool.name);
      return { type: "next", state: { ...state, selectedNames } };
    }

    case "next_page": {
      if (state.query) return { type: "next", state };
      const page = Math.min(state.page + 1, totalPages(state) - 1);
      return { type: "next", state: { ...state, page, cursorIndex: 0 } };
    }

    case "prev_page": {
      if (state.query) return { type: "next", state };
      const page = Math.max(state.page - 1, 0);
      return { type: "next", state: { ...state, page, cursorIndex: 0 } };
    }

    case "type_char": {
      const query =
        state.query.slice(0, state.queryCursor) +
        action.char +
        state.query.slice(state.queryCursor);
      const nextState = { ...state, query, queryCursor: state.queryCursor + 1 };
      return {
        type: "next",
        state: { ...nextState, cursorIndex: clampCursor(nextState, state.cursorIndex) },
      };
    }

    case "backspace": {
      if (state.queryCursor === 0) return { type: "next", state };
      const query =
        state.query.slice(0, state.queryCursor - 1) + state.query.slice(state.queryCursor);
      const nextState = { ...state, query, queryCursor: state.queryCursor - 1 };
      return {
        type: "next",
        state: { ...nextState, cursorIndex: clampCursor(nextState, state.cursorIndex) },
      };
    }

    case "cursor_left":
      return {
        type: "next",
        state: { ...state, queryCursor: Math.max(0, state.queryCursor - 1) },
      };

    case "cursor_right":
      return {
        type: "next",
        state: { ...state, queryCursor: Math.min(state.query.length, state.queryCursor + 1) },
      };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function policyColor(tool: PlanToolInfo): string {
  const label = toolPolicyLabel(tool);
  if (label === "built-in blocked") return "error";
  if (label === "built-in limited" || label.startsWith("user risk")) return "warning";
  return "dim";
}

function renderToolRow(
  tool: PlanToolInfo,
  selected: boolean,
  focused: boolean,
  theme: ToolSelectorTheme,
  width: number,
): string {
  if (width < 1) return "";

  const checkboxRaw = selected || isAlwaysOn(tool) ? "[•]" : "[ ]";
  const markerRaw = focused ? "▸" : " ";
  const marker = focused ? theme.fg("accent", markerRaw) : markerRaw;
  const prefixRaw = `${markerRaw} ${checkboxRaw} `;
  const prefixWidth = visibleWidth(prefixRaw);
  const policy = toolPolicyLabel(tool);
  const policyStyled = theme.fg(policyColor(tool), policy);
  const policyWidth = visibleWidth(policy);
  const checkbox = focused ? theme.fg("accent", theme.bold(checkboxRaw)) : checkboxRaw;
  const alignedMinWidth = prefixWidth + LABEL_COLUMN_WIDTH + LAYOUT_GAP.length + MIN_POLICY_WIDTH;

  if (width >= alignedMinWidth) {
    const labelFitted = truncateToWidth(tool.name, LABEL_COLUMN_WIDTH);
    const labelPadded = labelFitted.padEnd(LABEL_COLUMN_WIDTH);
    const label = focused ? theme.fg("accent", theme.bold(labelPadded)) : labelPadded;
    const policyFitted = truncateToWidth(
      policyStyled,
      Math.max(1, width - prefixWidth - LABEL_COLUMN_WIDTH - LAYOUT_GAP.length),
    );
    return `${marker} ${checkbox} ${label}${LAYOUT_GAP}${policyFitted}`;
  }

  const remaining = Math.max(0, width - prefixWidth - policyWidth - 2);
  const nameText = truncateToWidth(tool.name, Math.max(1, remaining));
  const label = focused ? theme.fg("accent", theme.bold(nameText)) : nameText;
  return truncateToWidth(`${marker} ${checkbox} ${label}  ${policyStyled}`, width);
}

function renderToolSelector(
  state: ToolSelectorState,
  theme: ToolSelectorTheme,
  width: number,
): string[] {
  const pages = totalPages(state);
  const pageLabel = pages > 1 && !state.query ? ` (${state.page + 1}/${pages})` : "";
  const lines = [
    truncateToWidth(theme.fg("accent", theme.bold(`Configure Plan-mode tools${pageLabel}`)), width),
    truncateToWidth(theme.dim(SUBTITLE), width),
    "",
    truncateToWidth(theme.dim(SEARCH_PLACEHOLDER), width),
    truncateToWidth(`▸ ${state.query}`, width),
  ];
  const visible = getVisibleTools(state);

  for (let index = 0; index < visible.length; index++) {
    const tool = visible[index];
    lines.push(
      renderToolRow(
        tool,
        state.selectedNames.has(tool.name),
        index === state.cursorIndex,
        theme,
        width,
      ),
    );
  }

  if (visible.length === 0 && state.query) {
    lines.push(truncateToWidth(theme.dim("No tools match the search."), width));
  }

  lines.push("", truncateToWidth(theme.dim(state.query ? HELP_SEARCHING : HELP_BASE), width));
  return lines;
}

export function createToolSelectorComponent(options: {
  tools: PlanToolInfo[];
  previousSelections: string[] | undefined;
  theme: ToolSelectorTheme;
  done: (result: string[] | null) => void;
}): Component {
  let state = initToolSelectorState(options.tools, options.previousSelections);

  function dispatch(action: ToolSelectorAction): void {
    const result = toolSelectorReducer(state, action);
    if (result.type === "done") options.done(result.selections);
    else state = result.state;
  }

  return {
    invalidate(): void {},
    handleInput(data: string): void {
      if (matchesKey(data, Key.escape)) return void dispatch({ type: "cancel" });
      if (matchesKey(data, Key.enter)) return void dispatch({ type: "save" });
      if (matchesKey(data, Key.up)) return void dispatch({ type: "move_up" });
      if (matchesKey(data, Key.down)) return void dispatch({ type: "move_down" });
      if (matchesKey(data, Key.space)) return void dispatch({ type: "toggle" });
      if (matchesKey(data, Key.left)) {
        if (state.query) return void dispatch({ type: "cursor_left" });
        return void dispatch({ type: "prev_page" });
      }
      if (matchesKey(data, Key.right)) {
        if (state.query) return void dispatch({ type: "cursor_right" });
        return void dispatch({ type: "next_page" });
      }
      if (matchesKey(data, Key.backspace)) return void dispatch({ type: "backspace" });
      if (/^[\x20-\x7E]$/.test(data) && !matchesKey(data, Key.space)) {
        return void dispatch({ type: "type_char", char: data });
      }
    },
    render(width: number): string[] {
      return renderToolSelector(state, options.theme, width);
    },
  };
}
