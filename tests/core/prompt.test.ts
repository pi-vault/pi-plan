import { describe, expect, it } from "vitest";
import { buildPlanModePrompt } from "../../src/core/prompt.ts";

describe("buildPlanModePrompt", () => {
  it("contains the plan mode active marker", () => {
    expect(buildPlanModePrompt()).toContain("[PLAN MODE ACTIVE]");
  });

  it("contains the three planning phases", () => {
    const prompt = buildPlanModePrompt();
    expect(prompt).toContain("Phase 1 -- Explore");
    expect(prompt).toContain("Phase 2 -- Clarify");
    expect(prompt).toContain("Phase 3 -- Plan");
  });

  it("contains the proposed_plan template", () => {
    const prompt = buildPlanModePrompt();
    expect(prompt).toContain("<proposed_plan>");
    expect(prompt).toContain("</proposed_plan>");
    expect(prompt).toContain("## Summary");
    expect(prompt).toContain("## Key Changes");
    expect(prompt).toContain("## Test Plan");
    expect(prompt).toContain("## Assumptions");
  });

  it("contains the phase-3 'do not ask' guidance", () => {
    const prompt = buildPlanModePrompt();
    expect(prompt).toContain("Do not ask");
    expect(prompt).toContain("menu handles next steps");
  });

  it("keeps the strict no-mutation rule with no selection", () => {
    expect(buildPlanModePrompt([])).toContain(
      "Do not edit files, write files, or execute the plan.",
    );
  });

  it("names the enabled mutation tools when selected", () => {
    expect(buildPlanModePrompt(["edit"])).toContain("Enabled mutation tools: edit.");
    expect(buildPlanModePrompt(["write"])).toContain("Enabled mutation tools: write.");
    expect(buildPlanModePrompt(["edit", "write"])).toContain(
      "Enabled mutation tools: edit, write.",
    );
  });

  for (const selected of [[], ["edit"], ["write"], ["edit", "write"]] as const) {
    it(`reaffirms unselected mutation tools remain blocked for ${JSON.stringify(selected)}`, () => {
      expect(buildPlanModePrompt(selected)).toContain(
        "Unselected mutation tools remain blocked. Do not execute the plan.",
      );
    });
  }

  it("keeps bash restrictions regardless of selection", () => {
    for (const selected of [[], ["edit"], ["write"], ["edit", "write"]] as const) {
      expect(buildPlanModePrompt(selected)).toContain("Bash is restricted to read-only commands.");
    }
  });

  it("warns about skills blocked by unavailable or mutating tools in every state", () => {
    for (const selected of [[], ["edit"], ["write"], ["edit", "write"]] as const) {
      expect(buildPlanModePrompt(selected)).toContain(
        "Skills requiring unavailable tools or mutating bash commands will be blocked.",
      );
    }
  });

  it("reminds to exit for any change request with no selection", () => {
    expect(buildPlanModePrompt([])).toContain(
      'If the user asks you to make changes or implement something, remind them to exit Plan Mode first by running /plan and choosing "Implement this plan", or by running /plan exit.',
    );
  });

  it("narrows the exit reminder to the proposed plan when tools are selected", () => {
    expect(buildPlanModePrompt(["edit"])).toContain(
      'If the user asks you to implement the proposed plan, remind them to exit Plan Mode first by running /plan and choosing "Implement this plan", or by running /plan exit.',
    );
    expect(buildPlanModePrompt(["edit"])).not.toContain(
      "If the user asks you to make changes or implement something",
    );
  });
});
