import { describe, expect, it } from "vitest";
import { buildPlanModePrompt } from "../../src/core/prompt.ts";

describe("buildPlanModePrompt", () => {
  it("contains the plan mode active marker", () => {
    expect(buildPlanModePrompt()).toContain("[PLAN MODE ACTIVE]");
  });

  it("contains mode rules", () => {
    const prompt = buildPlanModePrompt();
    expect(prompt).toContain("Do not edit files");
    expect(prompt).toContain("/plan exit");
    expect(prompt).toContain("Bash is restricted to read-only commands");
  });

  it("contains skill awareness line", () => {
    expect(buildPlanModePrompt()).toContain("Skills and tools listed in the system prompt");
  });

  it("contains the three planning phases", () => {
    const prompt = buildPlanModePrompt();
    expect(prompt).toContain("Phase 1 -- Explore");
    expect(prompt).toContain("Phase 2 -- Clarify");
    expect(prompt).toContain("Phase 3 -- Plan");
  });

  it("contains the proposed_plan template block", () => {
    const prompt = buildPlanModePrompt();
    expect(prompt).toContain("<proposed_plan>");
    expect(prompt).toContain("</proposed_plan>");
    expect(prompt).toContain("## Summary");
    expect(prompt).toContain("## Key Changes");
    expect(prompt).toContain("## Test Plan");
    expect(prompt).toContain("## Assumptions");
  });

  it("tells the agent not to ask should I proceed", () => {
    expect(buildPlanModePrompt()).toContain("Do not ask");
    expect(buildPlanModePrompt()).toContain("menu handles next steps");
  });
});
