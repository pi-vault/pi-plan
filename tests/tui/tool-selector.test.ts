import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { PlanToolInfo } from "../../src/core/tools.ts";
import { TOOL_SELECTOR_PAGE_SIZE } from "../../src/shared/constants.ts";
import { createToolSelectorComponent } from "../../src/tui/tool-selector.ts";

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  dim: (text: string) => text,
};

const key = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  escape: "\x1b",
  enter: "\r",
  backspace: "\x7f",
  space: " ",
};

function extensionTool(name: string): PlanToolInfo {
  return { name, sourceInfo: { source: "extension" } };
}

function builtinTool(name: string): PlanToolInfo {
  return { name, sourceInfo: { source: "builtin" } };
}

function createSelector(tools: PlanToolInfo[], previousSelections: string[] = []) {
  const done = vi.fn<(result: string[] | null) => void>();
  const component = createToolSelectorComponent({
    tools,
    previousSelections,
    theme: identityTheme,
    done,
  });
  return { component, done };
}

function row(lines: string[], name: string): string {
  const result = lines.find((line) => line.includes(name));
  expect(result).toBeDefined();
  return result!;
}

function focusedRow(lines: string[]): string {
  const result = lines.find((line) => line.includes("▸") && line.includes("["));
  expect(result).toBeDefined();
  return result!;
}

describe("createToolSelectorComponent", () => {
  it("renders sorted policy rows and restored selections", () => {
    const { component } = createSelector(
      [
        extensionTool("zeta"),
        builtinTool("read"),
        builtinTool("bash"),
        extensionTool("alpha"),
        builtinTool("edit"),
      ],
      ["alpha"],
    );

    const lines = component.render(80);
    expect(lines[0]).toContain("Configure Plan-mode tools");
    expect(lines).toContain("Non-built-in tools run at user risk.");
    expect(lines.at(-1)).toContain("Toggle");
    expect(lines.at(-1)).toContain("Page");
    expect(lines.findIndex((line) => line.includes("edit"))).toBeLessThan(
      lines.findIndex((line) => line.includes("alpha")),
    );
    expect(lines.findIndex((line) => line.includes("read"))).toBeLessThan(
      lines.findIndex((line) => line.includes("alpha")),
    );
    expect(row(lines, "read")).toContain("[•]");
    expect(row(lines, "edit")).toContain("[ ]");
    expect(row(lines, "edit")).toContain("built-in blocked");
    expect(row(lines, "bash")).toContain("built-in limited");
    expect(row(lines, "alpha")).toContain("[•]");
  });

  it("clamps navigation and saves the toggled extension", () => {
    const { component, done } = createSelector([extensionTool("alpha"), extensionTool("beta")]);

    component.handleInput?.(key.up);
    expect(focusedRow(component.render(80))).toContain("alpha");
    component.handleInput?.(key.down);
    component.handleInput?.(key.down);
    expect(focusedRow(component.render(80))).toContain("beta");
    component.handleInput?.(key.space);
    component.handleInput?.(key.enter);

    expect(done).toHaveBeenCalledWith(["beta"]);
  });

  it("does not toggle always-on or blocked built-ins", () => {
    const { component, done } = createSelector([
      builtinTool("edit"),
      builtinTool("read"),
      extensionTool("custom"),
    ]);

    component.handleInput?.(key.space);
    component.handleInput?.(key.down);
    component.handleInput?.(key.space);
    component.handleInput?.(key.down);
    component.handleInput?.(key.space);
    component.handleInput?.(key.enter);

    expect(done).toHaveBeenCalledWith(["custom"]);
  });

  it("omits safe plan tool names from restored selections on save", () => {
    const { component, done } = createSelector([extensionTool("read")], ["read"]);

    component.handleInput?.(key.enter);

    expect(done).toHaveBeenCalledWith([]);
  });

  it("edits the search query at the cursor and shows no-match feedback", () => {
    const { component } = createSelector([
      extensionTool("abc"),
      extensionTool("ac"),
      extensionTool("zzz"),
    ]);

    component.handleInput?.("a");
    component.handleInput?.("c");
    component.handleInput?.(key.left);
    component.handleInput?.("b");
    const matchingLines = component.render(80);
    expect(matchingLines).toContain("▸ abc");
    expect(matchingLines.at(-1)).toContain("Cursor");
    expect(row(matchingLines, "abc")).toContain("abc");
    expect(matchingLines.some((line) => line.includes("[ ] ac"))).toBe(false);

    component.handleInput?.(key.right);
    component.handleInput?.(key.backspace);
    component.handleInput?.("x");
    const noMatchLines = component.render(80);
    expect(noMatchLines).toContain("▸ abx");
    expect(noMatchLines).toContain("No tools match the search.");
  });

  it("pages through the complete tool list and clamps at page boundaries", () => {
    const tools = Array.from({ length: TOOL_SELECTOR_PAGE_SIZE + 1 }, (_, index) =>
      extensionTool(`tool-${String(index).padStart(2, "0")}`),
    );
    const { component } = createSelector(tools);

    expect(component.render(80)[0]).toContain("(1/2)");
    component.handleInput?.(key.right);
    expect(component.render(80)[0]).toContain("(2/2)");
    component.handleInput?.(key.right);
    expect(component.render(80)[0]).toContain("(2/2)");
    component.handleInput?.(key.left);
    expect(component.render(80)[0]).toContain("(1/2)");
    component.handleInput?.(key.left);
    expect(component.render(80)[0]).toContain("(1/2)");
  });

  it("cancels with null", () => {
    const { component, done } = createSelector([extensionTool("custom")]);

    component.handleInput?.(key.escape);

    expect(done).toHaveBeenCalledWith(null);
  });

  it("keeps every rendered line within narrow widths", () => {
    const { component } = createSelector([builtinTool("edit"), extensionTool("custom-tool")]);

    for (const width of [1, 20]) {
      const lines = component.render(width);
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    }
  });
});
