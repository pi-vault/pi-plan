import { describe, expect, it } from "vitest";
import { TOOL_SELECTOR_PAGE_SIZE } from "../../src/shared/constants.ts";
import {
  getVisibleTools,
  initToolSelectorState,
  isToggleable,
  type ToolSelectorAction,
  type ToolSelectorItem,
  type ToolSelectorResult,
  toolPolicyLabel,
  toolSelectorReducer,
} from "../../src/tui/tool-selector-state.ts";

function makeTools(names: string[], source = "extension"): ToolSelectorItem[] {
  return names.map((name) => ({
    name,
    sourceInfo: { source },
  }));
}

function builtinTool(name: string): ToolSelectorItem {
  return { name, sourceInfo: { source: "builtin" } };
}

describe("initToolSelectorState", () => {
  it("creates state with empty selections", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, undefined);
    expect(state.selectedNames.size).toBe(0);
    expect(state.cursorIndex).toBe(0);
    expect(state.page).toBe(0);
    expect(state.query).toBe("");
  });

  it("restores previous selections", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, ["a"]);
    expect(state.selectedNames.has("a")).toBe(true);
    expect(state.selectedNames.has("b")).toBe(false);
  });

  it("sorts built-in tools before extension tools", () => {
    const tools = [
      ...makeTools(["zebra"]),
      builtinTool("read"),
      ...makeTools(["alpha"]),
      builtinTool("bash"),
    ];
    const state = initToolSelectorState(tools, undefined);
    const names = state.tools.map((t) => t.name);
    expect(names.indexOf("bash")).toBeLessThan(names.indexOf("alpha"));
    expect(names.indexOf("read")).toBeLessThan(names.indexOf("zebra"));
  });
});

describe("toolSelectorReducer", () => {
  it("move_down increments cursor", () => {
    const tools = makeTools(["a", "b", "c"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "move_down" });
    expect(result.type).toBe("next");
    if (result.type === "next") expect(result.state.cursorIndex).toBe(1);
  });

  it("move_up decrements cursor", () => {
    const tools = makeTools(["a", "b", "c"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, cursorIndex: 2 };
    const result = toolSelectorReducer(state, { type: "move_up" });
    expect(result.type).toBe("next");
    if (result.type === "next") expect(result.state.cursorIndex).toBe(1);
  });

  it("move_up clamps at 0", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "move_up" });
    if (result.type === "next") expect(result.state.cursorIndex).toBe(0);
  });

  it("move_down clamps at last item", () => {
    const tools = makeTools(["a", "b"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, cursorIndex: 1 };
    const result = toolSelectorReducer(state, { type: "move_down" });
    if (result.type === "next") expect(result.state.cursorIndex).toBe(1);
  });

  it("toggle adds tool to selectedNames", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "toggle" });
    if (result.type === "next") expect(result.state.selectedNames.has("a")).toBe(true);
  });

  it("toggle removes tool from selectedNames", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, ["a"]);
    const result = toolSelectorReducer(state, { type: "toggle" });
    if (result.type === "next") expect(result.state.selectedNames.has("a")).toBe(false);
  });

  it("toggle is no-op for safe builtin tools", () => {
    const tools = [builtinTool("read"), ...makeTools(["a"])];
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "toggle" });
    if (result.type === "next") expect(result.state.selectedNames.has("read")).toBe(false);
  });

  it("toggle is no-op for blocked builtin tools", () => {
    const tools = [builtinTool("edit"), ...makeTools(["a"])];
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "toggle" });
    if (result.type === "next") expect(result.state.selectedNames.has("edit")).toBe(false);
  });

  it("next_page increments page and resets cursor", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, cursorIndex: 5 };
    const result = toolSelectorReducer(state, { type: "next_page" });
    if (result.type === "next") {
      expect(result.state.page).toBe(1);
      expect(result.state.cursorIndex).toBe(0);
    }
  });

  it("next_page clamps at last page", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, page: 1 };
    const result = toolSelectorReducer(state, { type: "next_page" });
    if (result.type === "next") expect(result.state.page).toBe(1);
  });

  it("prev_page decrements page", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, page: 1 };
    const result = toolSelectorReducer(state, { type: "prev_page" });
    if (result.type === "next") expect(result.state.page).toBe(0);
  });

  it("prev_page clamps at 0", () => {
    const tools = makeTools(["a", "b"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "prev_page" });
    if (result.type === "next") expect(result.state.page).toBe(0);
  });

  it("type_char appends to query", () => {
    const tools = makeTools(["abc", "def"]);
    const state = initToolSelectorState(tools, undefined);
    const r1 = toolSelectorReducer(state, { type: "type_char", char: "a" });
    if (r1.type === "next") {
      expect(r1.state.query).toBe("a");
      expect(r1.state.queryCursor).toBe(1);
    }
  });

  it("type_char inserts at cursor position", () => {
    const tools = makeTools(["abc", "def"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "adc", queryCursor: 1 };
    const result = toolSelectorReducer(state, { type: "type_char", char: "b" });
    if (result.type === "next") {
      expect(result.state.query).toBe("abdc");
      expect(result.state.queryCursor).toBe(2);
    }
  });

  it("backspace removes last character from query", () => {
    const tools = makeTools(["abc", "def"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "ab", queryCursor: 2 };
    const result = toolSelectorReducer(state, { type: "backspace" });
    if (result.type === "next") {
      expect(result.state.query).toBe("a");
      expect(result.state.queryCursor).toBe(1);
    }
  });

  it("backspace removes character before cursor in middle of query", () => {
    const tools = makeTools(["abc"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "abcd", queryCursor: 2 };
    const result = toolSelectorReducer(state, { type: "backspace" });
    if (result.type === "next") {
      expect(result.state.query).toBe("acd");
      expect(result.state.queryCursor).toBe(1);
    }
  });

  it("backspace is no-op when query is empty", () => {
    const tools = makeTools(["a"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "backspace" });
    if (result.type === "next") expect(result.state.query).toBe("");
  });

  it("search filters visible tools", () => {
    const tools = makeTools(["grep", "find", "my-search"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "search" };
    const visible = getVisibleTools(state);
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe("my-search");
  });

  it("cursor_left moves queryCursor left when searching", () => {
    const tools = makeTools(["a"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "abc", queryCursor: 3 };
    const result = toolSelectorReducer(state, { type: "cursor_left" });
    if (result.type === "next") expect(result.state.queryCursor).toBe(2);
  });

  it("cursor_right moves queryCursor right when searching", () => {
    const tools = makeTools(["a"]);
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "abc", queryCursor: 1 };
    const result = toolSelectorReducer(state, { type: "cursor_right" });
    if (result.type === "next") expect(result.state.queryCursor).toBe(2);
  });

  it("save returns selected non-builtin tool names", () => {
    const tools = [builtinTool("read"), ...makeTools(["a", "b"])];
    const state = initToolSelectorState(tools, ["a"]);
    const result = toolSelectorReducer(state, { type: "save" });
    expect(result.type).toBe("done");
    if (result.type === "done") {
      expect(result.selections).toContain("a");
      expect(result.selections).not.toContain("read");
    }
  });

  it("cancel returns null", () => {
    const tools = makeTools(["a"]);
    const state = initToolSelectorState(tools, undefined);
    const result = toolSelectorReducer(state, { type: "cancel" });
    expect(result.type).toBe("done");
    if (result.type === "done") expect(result.selections).toBeNull();
  });
});

describe("getVisibleTools", () => {
  it("returns all tools when no query and within page", () => {
    const tools = makeTools(["a", "b", "c"]);
    const state = initToolSelectorState(tools, undefined);
    expect(getVisibleTools(state)).toHaveLength(3);
  });

  it("returns page slice when no query", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    const state = initToolSelectorState(tools, undefined);
    const visible = getVisibleTools(state);
    expect(visible).toHaveLength(TOOL_SELECTOR_PAGE_SIZE);
  });

  it("returns filtered tools ignoring pagination when searching", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `tool-${i}`));
    let state = initToolSelectorState(tools, undefined);
    state = { ...state, query: "tool-1", page: 0 };
    const visible = getVisibleTools(state);
    expect(visible.length).toBeLessThan(15);
    expect(visible.every((t) => t.name.includes("tool-1"))).toBe(true);
  });
});

describe("toolPolicyLabel", () => {
  it("returns 'built-in' for safe builtin tools", () => {
    expect(toolPolicyLabel(builtinTool("read"))).toBe("built-in");
    expect(toolPolicyLabel(builtinTool("grep"))).toBe("built-in");
  });

  it("returns 'built-in limited' for bash", () => {
    expect(toolPolicyLabel(builtinTool("bash"))).toBe("built-in limited");
  });

  it("returns 'built-in blocked' for edit and write", () => {
    expect(toolPolicyLabel(builtinTool("edit"))).toBe("built-in blocked");
    expect(toolPolicyLabel(builtinTool("write"))).toBe("built-in blocked");
  });

  it("returns 'user risk: source' for extension tools", () => {
    const tool = makeTools(["x"], "my-ext")[0];
    expect(toolPolicyLabel(tool)).toBe("user risk: my-ext");
  });
});

describe("isToggleable", () => {
  it("returns false for safe builtin tools", () => {
    expect(isToggleable(builtinTool("read"))).toBe(false);
  });

  it("returns false for blocked builtin tools", () => {
    expect(isToggleable(builtinTool("edit"))).toBe(false);
  });

  it("returns true for extension tools", () => {
    expect(isToggleable(makeTools(["x"])[0])).toBe(true);
  });
});
