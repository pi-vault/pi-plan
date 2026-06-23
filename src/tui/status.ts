import type { PlanModeState } from "../shared/types.ts";

export function formatStatus(state: PlanModeState): string | undefined {
  if (!state.enabled) return undefined;
  if (state.awaitingAction || state.latestPlan) return "plan ready";
  return "plan active";
}
