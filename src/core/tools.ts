import { DEFAULT_TOOLS, SAFE_BUILTIN_PLAN_TOOLS } from "../shared/constants.ts";

export function defaultPlanModeToolNames(): string[] {
  return [...SAFE_BUILTIN_PLAN_TOOLS];
}

export function normalModeToolNames(
  previousTools: string[] | undefined,
): string[] {
  return previousTools && previousTools.length > 0
    ? [...previousTools]
    : [...DEFAULT_TOOLS];
}

export function planModeToolNamesWithSelections(
  selectedToolNames: string[] | undefined,
): string[] {
  if (selectedToolNames === undefined) {
    return defaultPlanModeToolNames();
  }
  const merged = new Set([...SAFE_BUILTIN_PLAN_TOOLS, ...selectedToolNames]);
  return [...merged];
}
