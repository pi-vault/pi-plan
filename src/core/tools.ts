import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ToolInfo,
} from "@earendil-works/pi-coding-agent";

const SAFE_PLAN_TOOL_NAMES = ["read", "bash", "grep", "find", "ls"];
const SAFE_PLAN_TOOL_NAME_SET = new Set(SAFE_PLAN_TOOL_NAMES);
export const PLAN_MUTATION_TOOL_NAMES = ["edit", "write"] as const;
const NORMAL_MODE_TOOL_NAMES = ["read", "bash", "edit", "write"];
const CONFIG_FILENAME = "extensions/plan-tools.json";

export function isPlanMutationToolName(name: string): boolean {
  return PLAN_MUTATION_TOOL_NAMES.some((mutationToolName) => mutationToolName === name);
}

export type PlanToolInfo = Pick<ToolInfo, "name"> & {
  sourceInfo: Pick<ToolInfo["sourceInfo"], "source">;
};

export function getToolPolicy(tool: PlanToolInfo): {
  alwaysOn: boolean;
  toggleable: boolean;
  label: string;
} {
  if (tool.sourceInfo.source !== "builtin") {
    return {
      alwaysOn: false,
      toggleable: true,
      label: `user risk: ${tool.sourceInfo.source}`,
    };
  }
  if (SAFE_PLAN_TOOL_NAME_SET.has(tool.name)) {
    return {
      alwaysOn: true,
      toggleable: false,
      label: tool.name === "bash" ? "built-in limited" : "built-in",
    };
  }
  if (isPlanMutationToolName(tool.name)) {
    return {
      alwaysOn: false,
      toggleable: true,
      label: "user risk: built-in mutation",
    };
  }
  return { alwaysOn: false, toggleable: true, label: "built-in" };
}

export function planModeToolNames(selected: string[] = []): string[] {
  return [...new Set([...SAFE_PLAN_TOOL_NAMES, ...selected])];
}

export function savePlanToolNames(writeAvailable: boolean): string[] {
  return writeAvailable
    ? [...SAFE_PLAN_TOOL_NAMES, "write"]
    : [...SAFE_PLAN_TOOL_NAMES];
}

export function normalModeToolNames(previous?: string[]): string[] {
  return previous && previous.length > 0
    ? [...previous]
    : [...NORMAL_MODE_TOOL_NAMES];
}

export function safeGetAllTools(pi: ExtensionAPI): ToolInfo[] {
  try {
    return pi.getAllTools();
  } catch {
    return [];
  }
}

export function safeGetActiveTools(pi: ExtensionAPI): string[] {
  try {
    return pi.getActiveTools();
  } catch {
    return [...NORMAL_MODE_TOOL_NAMES];
  }
}

function configFilePath(): string {
  return join(getAgentDir(), CONFIG_FILENAME);
}

export async function readSelectedToolNames(): Promise<string[] | undefined> {
  try {
    const parsed = JSON.parse(await readFile(configFilePath(), "utf-8"));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")
      return undefined;
    const entries = Object.entries(parsed).filter(
      ([, value]) => typeof value === "boolean",
    );
    if (entries.length === 0) return undefined;
    return entries
      .filter(
        ([name, enabled]) => enabled && !SAFE_PLAN_TOOL_NAME_SET.has(name),
      )
      .map(([name]) => name);
  } catch {
    return undefined;
  }
}

export async function writeSelectedToolNames(
  selected: string[],
  allTools: PlanToolInfo[],
): Promise<void> {
  const config = Object.fromEntries(
    allTools.map((tool) => [
      tool.name,
      SAFE_PLAN_TOOL_NAME_SET.has(tool.name) || selected.includes(tool.name),
    ]),
  );
  const filePath = configFilePath();

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // Persistence is optional.
  }
}
