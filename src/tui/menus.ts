import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PlanModeState } from "../shared/types.ts";

export type PlanMenuAction = "implement" | "stay" | "exit" | "show-plan" | "tools";

export const PLAN_MENU_LABELS: Record<PlanMenuAction, string> = {
  implement: "Implement this plan",
  stay: "Stay in Plan mode",
  exit: "Exit Plan mode",
  "show-plan": "Show latest proposed plan",
  tools: "Configure tools",
};

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

  options.push(PLAN_MENU_LABELS.stay);
  options.push(PLAN_MENU_LABELS.exit);

  const choice = await ctx.ui.select("Plan mode", options);
  return resolveAction(choice);
}
