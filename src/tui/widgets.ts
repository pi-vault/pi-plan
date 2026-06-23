import type { PlanModeState } from "../shared/types.ts";

export function formatWidgetLines(state: PlanModeState): string[] | undefined {
  if (!state.enabled) return undefined;
  if (state.awaitingAction || state.latestPlan) {
    return [
      "Proposed plan ready",
      "Use /plan to implement, revise, or exit Plan mode.",
    ];
  }
  return ["Plan mode: planning", "Produce a <proposed_plan> block."];
}
