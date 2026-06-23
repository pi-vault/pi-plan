import { describe, expect, it } from "vitest";
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
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
    expect(normalModeToolNames(undefined)).toEqual([
      "read",
      "bash",
      "edit",
      "write",
    ]);
  });

  it("returns defaults when previous is empty", () => {
    expect(normalModeToolNames([])).toEqual(["read", "bash", "edit", "write"]);
  });
});
