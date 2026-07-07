import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_TOOLS, SAFE_BUILTIN_PLAN_TOOLS } from "../shared/constants.ts";
import type { ToolSelectorItem } from "../tui/tool-selector-state.ts";

export function defaultPlanModeToolNames(): string[] {
  return [...SAFE_BUILTIN_PLAN_TOOLS];
}

export function normalModeToolNames(previousTools: string[] | undefined): string[] {
  return previousTools && previousTools.length > 0 ? [...previousTools] : [...DEFAULT_TOOLS];
}

export function planModeToolNamesWithSelections(selectedToolNames: string[] | undefined): string[] {
  if (selectedToolNames === undefined) {
    return defaultPlanModeToolNames();
  }
  const merged = new Set([...SAFE_BUILTIN_PLAN_TOOLS, ...selectedToolNames]);
  return [...merged];
}

export function safeGetAllTools(pi: ExtensionAPI): ToolSelectorItem[] {
  try {
    return pi.getAllTools() as ToolSelectorItem[];
  } catch {
    return [];
  }
}

export function safeGetActiveTools(pi: ExtensionAPI): string[] {
  try {
    return pi.getActiveTools();
  } catch {
    return [...DEFAULT_TOOLS];
  }
}
