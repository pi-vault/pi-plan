import type {
  CustomEntry,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { STATE_ENTRY_TYPE } from "../shared/constants.ts";
import type { PlanModeState } from "../shared/types.ts";

export function createInitialState(): PlanModeState {
  return {
    enabled: false,
    latestPlan: undefined,
    awaitingAction: false,
    selectedToolNames: undefined,
  };
}

export function enterPlanMode(state: PlanModeState): PlanModeState {
  return { ...state, enabled: true, awaitingAction: false };
}

export function exitPlanMode(state: PlanModeState): PlanModeState {
  return {
    ...state,
    enabled: false,
    latestPlan: undefined,
    awaitingAction: false,
  };
}

function isPlanStateEntry(
  entry: SessionEntry,
): entry is CustomEntry<Partial<PlanModeState>> {
  return entry.type === "custom" && entry.customType === STATE_ENTRY_TYPE;
}

export function restoreState(entries: SessionEntry[]): PlanModeState {
  const entry = entries.filter(isPlanStateEntry).pop();

  if (!entry?.data) return createInitialState();

  const enabled = entry.data.enabled ?? false;
  return {
    enabled,
    latestPlan: enabled ? entry.data.latestPlan : undefined,
    awaitingAction: enabled ? (entry.data.awaitingAction ?? false) : false,
    selectedToolNames: entry.data.selectedToolNames,
  };
}
