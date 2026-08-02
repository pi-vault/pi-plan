import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getToolPolicy,
  isPlanMutationToolName,
  normalModeToolNames,
  type PlanToolInfo,
  planModeToolNames,
  readSelectedToolNames,
  safeGetActiveTools,
  safeGetAllTools,
  savePlanToolNames,
  selectedPlanMutationToolNames,
  writeSelectedToolNames,
} from "../../src/core/tools.ts";

function tool(name: string, source = "builtin"): PlanToolInfo {
  return { name, sourceInfo: { source } };
}

describe("isPlanMutationToolName", () => {
  it("matches the canonical built-in mutation tools", () => {
    expect(isPlanMutationToolName("edit")).toBe(true);
    expect(isPlanMutationToolName("write")).toBe(true);
  });

  it("rejects non-mutation tool names", () => {
    expect(isPlanMutationToolName("bash")).toBe(false);
    expect(isPlanMutationToolName("read")).toBe(false);
    expect(isPlanMutationToolName("custom")).toBe(false);
    expect(isPlanMutationToolName("")).toBe(false);
  });
});

describe("selectedPlanMutationToolNames", () => {
  it("returns an empty array for an empty or missing selection", () => {
    expect(selectedPlanMutationToolNames([])).toEqual([]);
    expect(selectedPlanMutationToolNames()).toEqual([]);
  });

  it("returns only the selected mutation tools in canonical order", () => {
    expect(selectedPlanMutationToolNames(["write", "custom", "edit"])).toEqual([
      "edit",
      "write",
    ]);
  });

  it("ignores non-mutation tools in the selection", () => {
    expect(selectedPlanMutationToolNames(["bash", "read", "custom"])).toEqual([]);
  });
});

describe("getToolPolicy", () => {
  it("returns the fixed policy for every built-in row", () => {
    for (const name of ["read", "grep", "find", "ls"]) {
      expect(getToolPolicy(tool(name))).toEqual({
        alwaysOn: true,
        toggleable: false,
        label: "built-in",
      });
    }
    expect(getToolPolicy(tool("bash"))).toEqual({
      alwaysOn: true,
      toggleable: false,
      label: "built-in limited",
    });
    expect(getToolPolicy(tool("edit"))).toEqual({
      alwaysOn: false,
      toggleable: true,
      label: "user risk: built-in mutation",
    });
    expect(getToolPolicy(tool("write"))).toEqual({
      alwaysOn: false,
      toggleable: true,
      label: "user risk: built-in mutation",
    });
    expect(getToolPolicy(tool("custom-built-in"))).toEqual({
      alwaysOn: false,
      toggleable: true,
      label: "built-in",
    });
  });

  it("marks non-built-in tools as user-risk optional tools", () => {
    expect(getToolPolicy(tool("custom", "my-extension"))).toEqual({
      alwaysOn: false,
      toggleable: true,
      label: "user risk: my-extension",
    });
  });
});

describe("tool names", () => {
  it("returns plan-mode tools in safe order", () => {
    expect(planModeToolNames()).toEqual(["read", "bash", "grep", "find", "ls"]);
  });

  it("appends selections after deduplicating safe names", () => {
    expect(planModeToolNames(["custom", "read"])).toEqual([
      "read",
      "bash",
      "grep",
      "find",
      "ls",
      "custom",
    ]);
  });

  it("includes edit and write when explicitly selected", () => {
    expect(planModeToolNames(["edit", "write"])).toEqual([
      "read",
      "bash",
      "grep",
      "find",
      "ls",
      "edit",
      "write",
    ]);
  });

  it("adds write only while saving", () => {
    expect(savePlanToolNames(true)).toEqual(["read", "bash", "grep", "find", "ls", "write"]);
    expect(savePlanToolNames(false)).toEqual(["read", "bash", "grep", "find", "ls"]);
  });

  it("preserves previous normal-mode tools or falls back to defaults", () => {
    const previous = ["read", "bash", "edit", "write", "custom-tool"];
    expect(normalModeToolNames(previous)).toEqual(previous);
    expect(normalModeToolNames()).toEqual(["read", "bash", "edit", "write"]);
    expect(normalModeToolNames([])).toEqual(["read", "bash", "edit", "write"]);
  });
});

describe("Pi tool access", () => {
  it("returns tools from pi.getAllTools()", () => {
    const tools = [tool("read")];
    const pi = { getAllTools: () => tools } as unknown as ExtensionAPI;
    expect(safeGetAllTools(pi)).toEqual(tools);
  });

  it("returns an empty array when getAllTools throws", () => {
    const pi = {
      getAllTools: () => {
        throw new Error("not bound");
      },
    } as unknown as ExtensionAPI;
    expect(safeGetAllTools(pi)).toEqual([]);
  });

  it("returns tools from pi.getActiveTools()", () => {
    const pi = { getActiveTools: () => ["read", "bash"] } as unknown as ExtensionAPI;
    expect(safeGetActiveTools(pi)).toEqual(["read", "bash"]);
  });

  it("returns normal defaults when getActiveTools throws", () => {
    const pi = {
      getActiveTools: () => {
        throw new Error("not bound");
      },
    } as unknown as ExtensionAPI;
    expect(safeGetActiveTools(pi)).toEqual(["read", "bash", "edit", "write"]);
  });
});

describe("selected tool persistence", () => {
  let tempDir: string;
  const originalEnv = process.env.PI_CODING_AGENT_DIR;
  const configPath = () => join(tempDir, "extensions", "plan-tools.json");

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-tools-"));
    process.env.PI_CODING_AGENT_DIR = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalEnv;
  });

  it("returns undefined for missing, invalid, or boolean-free JSON", async () => {
    await expect(readSelectedToolNames()).resolves.toBeUndefined();

    mkdirSync(join(tempDir, "extensions"), { recursive: true });
    writeFileSync(configPath(), "not json");
    await expect(readSelectedToolNames()).resolves.toBeUndefined();

    writeFileSync(configPath(), JSON.stringify({ custom: "yes", broken: 42 }));
    await expect(readSelectedToolNames()).resolves.toBeUndefined();
  });

  it("rejects JSON arrays even when they contain booleans", async () => {
    mkdirSync(join(tempDir, "extensions"), { recursive: true });
    writeFileSync(configPath(), JSON.stringify([true, false]));

    await expect(readSelectedToolNames()).resolves.toBeUndefined();
  });

  it("returns an empty selection for a valid boolean map without selected optional tools", async () => {
    mkdirSync(join(tempDir, "extensions"), { recursive: true });
    writeFileSync(configPath(), JSON.stringify({ read: true, bash: true, custom: false }));

    await expect(readSelectedToolNames()).resolves.toEqual([]);
  });

  it("returns selected names from mixed boolean JSON", async () => {
    mkdirSync(join(tempDir, "extensions"), { recursive: true });
    writeFileSync(
      configPath(),
      JSON.stringify({ read: true, custom: true, disabled: false, ignored: "yes" }),
    );

    await expect(readSelectedToolNames()).resolves.toEqual(["custom"]);
  });

  it("writes the existing boolean-map JSON shape", async () => {
    const allTools = [
      tool("read"),
      tool("bash"),
      tool("grep"),
      tool("find"),
      tool("ls"),
      tool("edit"),
      tool("custom", "extension"),
      tool("another", "extension"),
    ];

    await writeSelectedToolNames(["custom"], allTools);

    expect(existsSync(configPath())).toBe(true);
    expect(JSON.parse(readFileSync(configPath(), "utf-8"))).toEqual({
      read: true,
      bash: true,
      grep: true,
      find: true,
      ls: true,
      edit: false,
      custom: true,
      another: false,
    });
  });

  it("absorbs persistence failures", async () => {
    const blockedDir = join(tempDir, "not-a-directory");
    writeFileSync(blockedDir, "file");
    process.env.PI_CODING_AGENT_DIR = blockedDir;

    await expect(writeSelectedToolNames([], [tool("read")])).resolves.toBeUndefined();
  });
});
