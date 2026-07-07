import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
} from "../../src/core/tools.ts";

describe("defaultPlanModeToolNames", () => {
  it("returns safe built-in tools", () => {
    const tools = defaultPlanModeToolNames();
    expect(tools).toContain("read");
    expect(tools).toContain("bash");
    expect(tools).toContain("grep");
    expect(tools).toContain("find");
    expect(tools).toContain("ls");
  });

  it("does not include edit or write", () => {
    const tools = defaultPlanModeToolNames();
    expect(tools).not.toContain("edit");
    expect(tools).not.toContain("write");
  });
});

describe("normalModeToolNames", () => {
  it("returns previous tools when available", () => {
    const previous = ["read", "bash", "edit", "write", "custom-tool"];
    expect(normalModeToolNames(previous)).toEqual(previous);
  });

  it("returns defaults when previous is undefined", () => {
    expect(normalModeToolNames(undefined)).toEqual(["read", "bash", "edit", "write"]);
  });

  it("returns defaults when previous is empty", () => {
    expect(normalModeToolNames([])).toEqual(["read", "bash", "edit", "write"]);
  });
});

describe("planModeToolNamesWithSelections", () => {
  it("returns default plan mode tools when selectedToolNames is undefined", () => {
    const tools = planModeToolNamesWithSelections(undefined);
    expect(tools).toContain("read");
    expect(tools).toContain("bash");
    expect(tools).toContain("grep");
    expect(tools).toContain("find");
    expect(tools).toContain("ls");
    expect(tools).not.toContain("edit");
    expect(tools).not.toContain("write");
  });

  it("merges safe defaults with user selections", () => {
    const tools = planModeToolNamesWithSelections(["my-search-tool"]);
    expect(tools).toContain("read");
    expect(tools).toContain("bash");
    expect(tools).toContain("my-search-tool");
  });

  it("deduplicates tools", () => {
    const tools = planModeToolNamesWithSelections(["read", "my-tool"]);
    const readCount = tools.filter((t) => t === "read").length;
    expect(readCount).toBe(1);
    expect(tools).toContain("my-tool");
  });

  it("returns only defaults when selections is empty array", () => {
    const tools = planModeToolNamesWithSelections([]);
    expect(tools).toContain("read");
    expect(tools).toContain("bash");
    expect(tools.length).toBe(5); // 5 SAFE_BUILTIN_PLAN_TOOLS
  });
});

describe("safeGetAllTools", () => {
  it("returns tools from pi.getAllTools()", () => {
    const tools = [{ name: "read", sourceInfo: { source: "builtin" } }];
    const pi = { getAllTools: () => tools } as unknown as ExtensionAPI;
    expect(safeGetAllTools(pi)).toEqual(tools);
  });

  it("returns empty array when getAllTools throws", () => {
    const pi = {
      getAllTools: () => {
        throw new Error("not bound");
      },
    } as unknown as ExtensionAPI;
    expect(safeGetAllTools(pi)).toEqual([]);
  });
});

describe("safeGetActiveTools", () => {
  it("returns tools from pi.getActiveTools()", () => {
    const pi = { getActiveTools: () => ["read", "bash"] } as unknown as ExtensionAPI;
    expect(safeGetActiveTools(pi)).toEqual(["read", "bash"]);
  });

  it("returns DEFAULT_TOOLS when getActiveTools throws", () => {
    const pi = {
      getActiveTools: () => {
        throw new Error("not bound");
      },
    } as unknown as ExtensionAPI;
    expect(safeGetActiveTools(pi)).toEqual(["read", "bash", "edit", "write"]);
  });
});
