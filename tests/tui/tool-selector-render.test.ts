import { describe, expect, it } from "vitest";
import { renderToolSelector, type ToolSelectorTheme } from "../../src/tui/tool-selector-render.ts";
import { initToolSelectorState } from "../../src/tui/tool-selector-state.ts";
import type { ToolSelectorItem } from "../../src/tui/tool-selector-state.ts";

const noTheme: ToolSelectorTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
  dim: (text) => text,
};

function makeTools(names: string[], source = "extension"): ToolSelectorItem[] {
  return names.map((name) => ({
    name,
    sourceInfo: { source },
  }));
}

function builtinTool(name: string): ToolSelectorItem {
  return { name, sourceInfo: { source: "builtin" } };
}

describe("renderToolSelector", () => {
  it("renders title line", () => {
    const state = initToolSelectorState(makeTools(["a"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines[0]).toContain("Configure Plan-mode tools");
  });

  it("renders subtitle line", () => {
    const state = initToolSelectorState(makeTools(["a"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("user risk"))).toBe(true);
  });

  it("renders tool rows with checkbox markers", () => {
    const state = initToolSelectorState(makeTools(["my-tool"]), ["my-tool"]);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("[\u2022]") && l.includes("my-tool"))).toBe(true);
  });

  it("renders unchecked tools with [ ]", () => {
    const state = initToolSelectorState(makeTools(["my-tool"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("[ ]") && l.includes("my-tool"))).toBe(true);
  });

  it("renders cursor indicator on focused tool row", () => {
    const state = initToolSelectorState(makeTools(["a", "b"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    // The ▸ must appear on a tool row (one with a checkbox), not just the search line
    expect(lines.some((l) => l.includes("\u25B8") && l.includes("[ ]"))).toBe(true);
  });

  it("renders policy labels for builtin tools", () => {
    const tools = [builtinTool("read"), builtinTool("bash"), builtinTool("edit")];
    const state = initToolSelectorState(tools, undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("built-in limited"))).toBe(true);
    expect(lines.some((l) => l.includes("built-in blocked"))).toBe(true);
  });

  it("renders help line", () => {
    const state = initToolSelectorState(makeTools(["a"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("Toggle");
    expect(lastLine).toContain("Enter");
    expect(lastLine).toContain("Esc");
  });

  it("shows Page in help when not searching", () => {
    const state = initToolSelectorState(makeTools(["a"]), undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("Page");
  });

  it("shows Cursor in help when searching", () => {
    let state = initToolSelectorState(makeTools(["a"]), undefined);
    state = { ...state, query: "a", queryCursor: 1 };
    const lines = renderToolSelector(state, noTheme, 80);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("Cursor");
  });

  it("renders search query line", () => {
    let state = initToolSelectorState(makeTools(["a"]), undefined);
    state = { ...state, query: "test", queryCursor: 4 };
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("\u25B8 test"))).toBe(true);
  });

  it("renders page indicator when multiple pages", () => {
    const tools = makeTools(Array.from({ length: 15 }, (_, i) => `t${i}`));
    const state = initToolSelectorState(tools, undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines[0]).toContain("(1/2)");
  });

  it("always-on builtin tools show checked", () => {
    const tools = [builtinTool("read")];
    const state = initToolSelectorState(tools, undefined);
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("[\u2022]") && l.includes("read"))).toBe(true);
  });

  it("shows empty message when search has no results", () => {
    let state = initToolSelectorState(makeTools(["alpha", "beta"]), undefined);
    state = { ...state, query: "zzz", queryCursor: 3 };
    const lines = renderToolSelector(state, noTheme, 80);
    expect(lines.some((l) => l.includes("No tools match"))).toBe(true);
  });
});
