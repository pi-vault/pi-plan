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

function compareTools(a: PlanToolInfo, b: PlanToolInfo): number {
  const aBuiltin = a.sourceInfo.source === "builtin";
  const bBuiltin = b.sourceInfo.source === "builtin";
  if (aBuiltin !== bBuiltin) return aBuiltin ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function getVisibleTools(state: ToolSelectorState): PlanToolInfo[] {
  if (state.query) {
    const query = state.query.toLowerCase();
    return state.tools.filter((tool) => tool.name.toLowerCase().includes(query));
  }
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

function policyColor(label: string): string {
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

  const policy = getToolPolicy(tool);
  const checkboxRaw = selected || policy.alwaysOn ? "[•]" : "[ ]";
  const markerRaw = focused ? "▸" : " ";
  const marker = focused ? theme.fg("accent", markerRaw) : markerRaw;
  const prefixRaw = `${markerRaw} ${checkboxRaw} `;
  const prefixWidth = visibleWidth(prefixRaw);
  const policyStyled = theme.fg(policyColor(policy.label), policy.label);
  const policyWidth = visibleWidth(policy.label);
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
  let state: ToolSelectorState = {
    tools: [...options.tools].sort(compareTools),
    selectedNames: new Set(options.previousSelections ?? []),
    cursorIndex: 0,
    page: 0,
    query: "",
    queryCursor: 0,
  };

  return {
    invalidate(): void {},
    handleInput(data: string): void {
      if (matchesKey(data, Key.escape)) {
        options.done(null);
        return;
      }
      if (matchesKey(data, Key.enter)) {
        options.done(
          [...state.selectedNames].filter((name) => !SAFE_PLAN_TOOL_NAMES.has(name)),
        );
        return;
      }
      if (matchesKey(data, Key.up)) {
        state = { ...state, cursorIndex: clampCursor(state, state.cursorIndex - 1) };
        return;
      }
      if (matchesKey(data, Key.down)) {
        state = { ...state, cursorIndex: clampCursor(state, state.cursorIndex + 1) };
        return;
      }
      if (matchesKey(data, Key.space)) {
        const tool = getVisibleTools(state)[clampCursor(state, state.cursorIndex)];
        if (!tool || !getToolPolicy(tool).toggleable) return;
        const selectedNames = new Set(state.selectedNames);
        if (selectedNames.has(tool.name)) selectedNames.delete(tool.name);
        else selectedNames.add(tool.name);
        state = { ...state, selectedNames };
        return;
      }
      if (matchesKey(data, Key.left)) {
        state = state.query
          ? { ...state, queryCursor: Math.max(0, state.queryCursor - 1) }
          : { ...state, page: Math.max(state.page - 1, 0), cursorIndex: 0 };
        return;
      }
      if (matchesKey(data, Key.right)) {
        state = state.query
          ? { ...state, queryCursor: Math.min(state.query.length, state.queryCursor + 1) }
          : {
              ...state,
              page: Math.min(state.page + 1, totalPages(state) - 1),
              cursorIndex: 0,
            };
        return;
      }
      if (matchesKey(data, Key.backspace)) {
        if (state.queryCursor === 0) return;
        const query =
          state.query.slice(0, state.queryCursor - 1) + state.query.slice(state.queryCursor);
        const nextState = { ...state, query, queryCursor: state.queryCursor - 1 };
        state = { ...nextState, cursorIndex: clampCursor(nextState, state.cursorIndex) };
        return;
      }
      if (/^[\x20-\x7E]$/.test(data) && !matchesKey(data, Key.space)) {
        const query =
          state.query.slice(0, state.queryCursor) +
          data +
          state.query.slice(state.queryCursor);
        const nextState = { ...state, query, queryCursor: state.queryCursor + 1 };
        state = { ...nextState, cursorIndex: clampCursor(nextState, state.cursorIndex) };
      }
    },
    render(width: number): string[] {
      return renderToolSelector(state, options.theme, width);
    },
  };
}
