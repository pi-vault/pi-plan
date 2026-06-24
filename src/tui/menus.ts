import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PlanModeState } from "../shared/types.ts";
import {
  BLOCKED_BUILTIN_TOOLS,
  SAFE_BUILTIN_PLAN_TOOLS,
  TOOL_SELECTOR_PAGE_SIZE,
} from "../shared/constants.ts";

export type PlanMenuAction = "implement" | "stay" | "exit" | "show-plan" | "tools";

export const PLAN_MENU_LABELS: Record<PlanMenuAction, string> = {
  implement: "Implement this plan",
  stay: "Stay in Plan mode",
  exit: "Exit Plan mode",
  "show-plan": "Show latest proposed plan",
  tools: "Configure tools",
};

export const TOOL_SELECTOR_LABELS = {
  next: "Next page ->",
  prev: "<- Previous page",
  done: "Done",
} as const;

const LABEL_TO_ACTION = new Map<string, PlanMenuAction>(
  Object.entries(PLAN_MENU_LABELS).map(([action, label]) => [label, action as PlanMenuAction]),
);

function resolveAction(choice: string | undefined): PlanMenuAction {
  if (!choice) return "stay";
  return LABEL_TO_ACTION.get(choice) ?? "stay";
}

export async function showPlanReadyMenu(ctx: ExtensionContext): Promise<PlanMenuAction> {
  const choice = await ctx.ui.select("Plan ready", [
    PLAN_MENU_LABELS.implement,
    PLAN_MENU_LABELS.stay,
    PLAN_MENU_LABELS.exit,
  ]);
  return resolveAction(choice);
}

export async function showPlanMenu(
  ctx: ExtensionContext,
  state: PlanModeState,
): Promise<PlanMenuAction> {
  const options: string[] = [];

  if (state.latestPlan) {
    options.push(PLAN_MENU_LABELS["show-plan"]);
    options.push(PLAN_MENU_LABELS.implement);
  }

  options.push(PLAN_MENU_LABELS.tools);
  options.push(PLAN_MENU_LABELS.stay);
  options.push(PLAN_MENU_LABELS.exit);

  const choice = await ctx.ui.select("Plan mode", options);
  return resolveAction(choice);
}

interface ToolSelectorItem {
  name: string;
  sourceInfo: { source: string };
}

/**
 * Paginated tool selector. Returns the array of non-builtin tool names the user
 * wants enabled, or undefined if the user made no changes or cancelled.
 */
export async function showToolSelector(
  ctx: ExtensionContext,
  allTools: ToolSelectorItem[],
  state: PlanModeState,
): Promise<string[] | undefined> {
  const selectableTools = allTools.filter(
    (t) => !BLOCKED_BUILTIN_TOOLS.has(t.name),
  );

  if (selectableTools.length === 0) return undefined;

  const selected = new Set<string>(state.selectedToolNames ?? []);
  const initialSnapshot = new Set<string>(selected);

  let page = 0;
  const pageSize = TOOL_SELECTOR_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(selectableTools.length / pageSize));

  for (;;) {
    const start = page * pageSize;
    const pageTools = selectableTools.slice(start, start + pageSize);
    const labelToAction = new Map<string, string>();
    const options: string[] = [];

    for (const tool of pageTools) {
      const isAlwaysOn = SAFE_BUILTIN_PLAN_TOOLS.has(tool.name);
      const source =
        tool.sourceInfo.source === "builtin"
          ? "built-in"
          : tool.sourceInfo.source;
      const suffix = isAlwaysOn
        ? " [always on]"
        : selected.has(tool.name)
          ? " [enabled]"
          : " [disabled]";
      const label = `${tool.name} (${source})${suffix}`;
      options.push(label);
      labelToAction.set(label, isAlwaysOn ? "__noop__" : tool.name);
    }

    if (totalPages > 1 && page < totalPages - 1) {
      options.push(TOOL_SELECTOR_LABELS.next);
    }
    if (page > 0) {
      options.push(TOOL_SELECTOR_LABELS.prev);
    }
    options.push(TOOL_SELECTOR_LABELS.done);

    const pageLabel =
      totalPages > 1 ? ` (page ${page + 1}/${totalPages})` : "";
    const choice = await ctx.ui.select(
      `Configure Plan-mode tools${pageLabel}`,
      options,
    );

    if (!choice || choice === TOOL_SELECTOR_LABELS.done) break;
    if (choice === TOOL_SELECTOR_LABELS.next) {
      page = Math.min(page + 1, totalPages - 1);
      continue;
    }
    if (choice === TOOL_SELECTOR_LABELS.prev) {
      page = Math.max(page - 1, 0);
      continue;
    }

    const action = labelToAction.get(choice);
    if (!action || action === "__noop__") continue;

    if (selected.has(action)) {
      selected.delete(action);
    } else {
      selected.add(action);
    }
  }

  const unchanged =
    selected.size === initialSnapshot.size &&
    [...selected].every((t) => initialSnapshot.has(t));
  if (unchanged) return undefined;

  return [...selected].filter((name) => !SAFE_BUILTIN_PLAN_TOOLS.has(name));
}
