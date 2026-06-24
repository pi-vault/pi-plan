import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  enterPlanMode,
  exitPlanMode,
  restoreState,
} from "../../src/core/state.ts";

/** Helper to build a CustomEntry with required base fields */
function customEntry(customType: string, data: Record<string, unknown>): SessionEntry {
  return {
    type: "custom",
    customType,
    data,
    id: crypto.randomUUID(),
    parentId: null,
    timestamp: new Date().toISOString(),
  } as SessionEntry;
}

/** Helper to build a non-custom entry */
function messageEntry(): SessionEntry {
  return {
    type: "message",
    id: crypto.randomUUID(),
    parentId: null,
    timestamp: new Date().toISOString(),
    message: { role: "user", content: "hello" },
  } as SessionEntry;
}

describe("createInitialState", () => {
  it("returns disabled state with no plan", () => {
    const state = createInitialState();
    expect(state).toEqual({
      enabled: false,
      latestPlan: undefined,
      awaitingAction: false,
      selectedToolNames: undefined,
    });
  });
});

describe("enterPlanMode", () => {
  it("enables plan mode and clears awaitingAction", () => {
    const state = createInitialState();
    const next = enterPlanMode(state);
    expect(next.enabled).toBe(true);
    expect(next.awaitingAction).toBe(false);
  });

  it("preserves selectedToolNames", () => {
    const state = {
      ...createInitialState(),
      selectedToolNames: ["read", "grep"],
    };
    const next = enterPlanMode(state);
    expect(next.selectedToolNames).toEqual(["read", "grep"]);
  });
});

describe("exitPlanMode", () => {
  it("disables plan mode and clears plan data", () => {
    const state = {
      enabled: true,
      latestPlan: "some plan",
      awaitingAction: true,
      selectedToolNames: ["read"] as string[] | undefined,
    };
    const next = exitPlanMode(state);
    expect(next.enabled).toBe(false);
    expect(next.latestPlan).toBeUndefined();
    expect(next.awaitingAction).toBe(false);
  });

  it("preserves selectedToolNames for next plan session", () => {
    const state = {
      enabled: true,
      latestPlan: undefined,
      awaitingAction: false,
      selectedToolNames: ["read", "grep"] as string[] | undefined,
    };
    const next = exitPlanMode(state);
    expect(next.selectedToolNames).toEqual(["read", "grep"]);
  });
});

describe("restoreState", () => {
  it("returns initial state when no entries exist", () => {
    const state = restoreState([]);
    expect(state).toEqual(createInitialState());
  });

  it("restores from the latest plan-mode-state entry", () => {
    const entries = [
      customEntry("plan-mode-state", { enabled: true }),
      customEntry("plan-mode-state", { enabled: false }),
    ];
    const state = restoreState(entries);
    expect(state.enabled).toBe(false);
  });

  it("clears plan data when restored as disabled", () => {
    const entries = [
      customEntry("plan-mode-state", {
        enabled: false,
        latestPlan: "stale plan",
        awaitingAction: true,
      }),
    ];
    const state = restoreState(entries);
    expect(state.enabled).toBe(false);
    expect(state.latestPlan).toBeUndefined();
    expect(state.awaitingAction).toBe(false);
  });

  it("preserves plan data when restored as enabled", () => {
    const entries = [
      customEntry("plan-mode-state", {
        enabled: true,
        latestPlan: "a plan",
        awaitingAction: true,
        selectedToolNames: ["read"],
      }),
    ];
    const state = restoreState(entries);
    expect(state.enabled).toBe(true);
    expect(state.latestPlan).toBe("a plan");
    expect(state.awaitingAction).toBe(true);
    expect(state.selectedToolNames).toEqual(["read"]);
  });

  it("ignores non-plan-mode entries", () => {
    const entries = [messageEntry(), customEntry("other-ext", { enabled: true })];
    const state = restoreState(entries);
    expect(state).toEqual(createInitialState());
  });
});
