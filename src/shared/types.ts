export interface PlanModeState {
  enabled: boolean;
  latestPlan: string | undefined;
  awaitingAction: boolean;
  selectedToolNames: string[] | undefined;
}
