import { describe, expect, it } from "vitest";
import { createInitialState } from "../../src/core/state.ts";
import { formatWidgetLines } from "../../src/tui/widgets.ts";

describe("formatWidgetLines", () => {
  it("returns undefined when plan mode is off", () => {
    expect(formatWidgetLines(createInitialState())).toBeUndefined();
  });

  it("returns planning lines when enabled with no plan", () => {
    const state = { ...createInitialState(), enabled: true };
    const lines = formatWidgetLines(state);
    expect(lines).toBeDefined();
    expect(lines!.some((l) => l.includes("Plan mode"))).toBe(true);
    expect(lines!.some((l) => l.includes("<proposed_plan>"))).toBe(true);
  });

  it("returns plan ready lines when awaitingAction is true", () => {
    const state = { ...createInitialState(), enabled: true, awaitingAction: true };
    const lines = formatWidgetLines(state);
    expect(lines).toBeDefined();
    expect(lines!.some((l) => l.toLowerCase().includes("ready"))).toBe(true);
    expect(lines!.some((l) => l.includes("/plan"))).toBe(true);
  });

  it("returns plan ready lines when latestPlan exists", () => {
    const state = { ...createInitialState(), enabled: true, latestPlan: "some plan" };
    const lines = formatWidgetLines(state);
    expect(lines).toBeDefined();
    expect(lines!.some((l) => l.toLowerCase().includes("ready"))).toBe(true);
  });

  it("returns an array of strings", () => {
    const state = { ...createInitialState(), enabled: true };
    const lines = formatWidgetLines(state);
    expect(Array.isArray(lines)).toBe(true);
    lines!.forEach((l) => expect(typeof l).toBe("string"));
  });
});
