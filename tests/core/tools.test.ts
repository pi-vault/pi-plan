import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
  selectedNamesToToolConfig,
  toolConfigToSelectedNames,
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

describe("toolConfigToSelectedNames", () => {
  it("returns names where value is true, excluding safe builtins", () => {
    const config = {
      read: true,
      bash: true,
      custom: true,
      edit: false,
      another: true,
    };
    const result = toolConfigToSelectedNames(config);
    expect(result).toContain("custom");
    expect(result).toContain("another");
    expect(result).not.toContain("read");
    expect(result).not.toContain("bash");
    expect(result).not.toContain("edit");
  });

  it("returns empty array when all values are false", () => {
    const config = { custom: false, edit: false };
    expect(toolConfigToSelectedNames(config)).toEqual([]);
  });

  it("returns empty array for empty config", () => {
    expect(toolConfigToSelectedNames({})).toEqual([]);
  });
});

describe("selectedNamesToToolConfig", () => {
  it("builds full map from selected names and all tools", () => {
    const allTools = [
      { name: "read", sourceInfo: { source: "builtin" } },
      { name: "bash", sourceInfo: { source: "builtin" } },
      { name: "edit", sourceInfo: { source: "builtin" } },
      { name: "custom", sourceInfo: { source: "extension" } },
      { name: "another", sourceInfo: { source: "extension" } },
    ];
    const selected = ["custom"];
    const config = selectedNamesToToolConfig(selected, allTools);
    expect(config).toEqual({
      read: true,
      bash: true,
      edit: false,
      custom: true,
      another: false,
    });
  });

  it("marks safe builtins as true regardless of selection", () => {
    const allTools = [
      { name: "read", sourceInfo: { source: "builtin" } },
      { name: "grep", sourceInfo: { source: "builtin" } },
    ];
    const config = selectedNamesToToolConfig([], allTools);
    expect(config.read).toBe(true);
    expect(config.grep).toBe(true);
  });
});
