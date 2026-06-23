import { describe, expect, it } from "vitest";
import { createInitialState } from "../../src/core/state.ts";
import { formatStatus } from "../../src/tui/status.ts";

describe("formatStatus", () => {
  it("returns undefined when plan mode is off", () => {
    expect(formatStatus(createInitialState())).toBeUndefined();
  });

  it("returns 'plan active' when enabled with no plan", () => {
    const state = { ...createInitialState(), enabled: true };
    expect(formatStatus(state)).toBe("plan active");
  });

  it("returns 'plan ready' when a plan exists", () => {
    const state = {
      ...createInitialState(),
      enabled: true,
      latestPlan: "some plan",
    };
    expect(formatStatus(state)).toBe("plan ready");
  });

  it("returns 'plan ready' when awaitingAction is true", () => {
    const state = {
      ...createInitialState(),
      enabled: true,
      awaitingAction: true,
    };
    expect(formatStatus(state)).toBe("plan ready");
  });
});
