import {
  BLOCKED_BUILTIN_TOOLS,
  SAFE_BUILTIN_PLAN_TOOLS,
  TOOL_SELECTOR_PAGE_SIZE,
} from "../shared/constants.ts";

export { TOOL_SELECTOR_PAGE_SIZE };

export interface ToolSelectorItem {
  name: string;
  sourceInfo: { source: string };
}

export interface ToolSelectorState {
  tools: ToolSelectorItem[];
  selectedNames: Set<string>;
  cursorIndex: number;
  page: number;
  query: string;
  queryCursor: number;
}

export type ToolSelectorAction =
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

export type ToolSelectorResult =
  | { type: "next"; state: ToolSelectorState }
  | { type: "done"; selections: string[] | null };

function isBuiltin(tool: ToolSelectorItem): boolean {
  return tool.sourceInfo.source === "builtin";
}

export function isToggleable(tool: ToolSelectorItem): boolean {
  if (!isBuiltin(tool)) return true;
  if (SAFE_BUILTIN_PLAN_TOOLS.has(tool.name)) return false;
  if (BLOCKED_BUILTIN_TOOLS.has(tool.name)) return false;
  return true;
}

export function toolPolicyLabel(tool: ToolSelectorItem): string {
  if (isBuiltin(tool)) {
    if (BLOCKED_BUILTIN_TOOLS.has(tool.name)) return "built-in blocked";
    if (tool.name === "bash") return "built-in limited";
    return "built-in";
  }
  return `user risk: ${tool.sourceInfo.source}`;
}

function compareTools(a: ToolSelectorItem, b: ToolSelectorItem): number {
  const aBuiltin = isBuiltin(a);
  const bBuiltin = isBuiltin(b);
  if (aBuiltin !== bBuiltin) return aBuiltin ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function initToolSelectorState(
  tools: ToolSelectorItem[],
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

function matchesQuery(tool: ToolSelectorItem, query: string): boolean {
  if (!query) return true;
  return tool.name.toLowerCase().includes(query.toLowerCase());
}

export function getVisibleTools(state: ToolSelectorState): ToolSelectorItem[] {
  if (state.query) {
    return state.tools.filter((t) => matchesQuery(t, state.query));
  }
  const start = state.page * TOOL_SELECTOR_PAGE_SIZE;
  return state.tools.slice(start, start + TOOL_SELECTOR_PAGE_SIZE);
}

export function totalPages(state: ToolSelectorState): number {
  return Math.max(1, Math.ceil(state.tools.length / TOOL_SELECTOR_PAGE_SIZE));
}

function clampCursor(state: ToolSelectorState, index: number): number {
  const visible = getVisibleTools(state);
  if (visible.length === 0) return 0;
  return Math.max(0, Math.min(index, visible.length - 1));
}

export function isAlwaysOn(tool: ToolSelectorItem): boolean {
  return isBuiltin(tool) && SAFE_BUILTIN_PLAN_TOOLS.has(tool.name);
}

export function toolSelectorReducer(
  state: ToolSelectorState,
  action: ToolSelectorAction,
): ToolSelectorResult {
  switch (action.type) {
    case "cancel":
      return { type: "done", selections: null };

    case "save": {
      const names = [...state.selectedNames].filter((name) => !SAFE_BUILTIN_PLAN_TOOLS.has(name));
      return { type: "done", selections: names };
    }

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
      const next = new Set(state.selectedNames);
      if (next.has(tool.name)) next.delete(tool.name);
      else next.add(tool.name);
      return { type: "next", state: { ...state, selectedNames: next } };
    }

    case "next_page": {
      if (state.query) return { type: "next", state };
      const maxPage = totalPages(state) - 1;
      const nextPage = Math.min(state.page + 1, maxPage);
      return {
        type: "next",
        state: { ...state, page: nextPage, cursorIndex: 0 },
      };
    }

    case "prev_page": {
      if (state.query) return { type: "next", state };
      const prevPage = Math.max(state.page - 1, 0);
      return {
        type: "next",
        state: { ...state, page: prevPage, cursorIndex: 0 },
      };
    }

    case "type_char": {
      const query =
        state.query.slice(0, state.queryCursor) +
        action.char +
        state.query.slice(state.queryCursor);
      const queryCursor = state.queryCursor + 1;
      const newState = { ...state, query, queryCursor };
      return {
        type: "next",
        state: { ...newState, cursorIndex: clampCursor(newState, state.cursorIndex) },
      };
    }

    case "backspace": {
      if (state.queryCursor === 0) return { type: "next", state };
      const query =
        state.query.slice(0, state.queryCursor - 1) + state.query.slice(state.queryCursor);
      const queryCursor = state.queryCursor - 1;
      const newState = { ...state, query, queryCursor };
      return {
        type: "next",
        state: { ...newState, cursorIndex: clampCursor(newState, state.cursorIndex) },
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
        state: {
          ...state,
          queryCursor: Math.min(state.query.length, state.queryCursor + 1),
        },
      };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
