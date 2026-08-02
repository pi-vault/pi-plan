import { PLAN_MUTATION_TOOL_NAMES } from "./tools.ts";

const PHASES_AND_TEMPLATE = `## Phase 1 -- Explore

- Use read-only tools to inspect files, search code, check configuration.
- Resolve discoverable facts before asking the user.

## Phase 2 -- Clarify

- Ask about purpose, constraints, success criteria, preferences, and tradeoffs.
- Do not guess when ambiguity changes the outcome.

## Phase 3 -- Plan

- Once intent and implementation details are clear, produce exactly one
  <proposed_plan> block:

<proposed_plan>
# Title
## Summary
## Key Changes
## Test Plan
## Assumptions
</proposed_plan>

- The plan must be decision-complete: no open questions for the implementer.
- Do not ask "should I proceed?" -- the Plan Mode menu handles next steps.`;

export function buildPlanModePrompt(selectedToolNames: readonly string[] = []): string {
  const enabled = PLAN_MUTATION_TOOL_NAMES.filter((name) => selectedToolNames.includes(name));
  const mutationRule =
    enabled.length === 0
      ? "- Do not edit files, write files, or execute the plan.\n- Unselected mutation tools remain blocked. Do not execute the plan."
      : `- Enabled mutation tools: ${enabled.join(", ")}. Use them only for file changes the user explicitly requests.\n- Unselected mutation tools remain blocked. Do not execute the plan.`;
  const changeRule =
    enabled.length === 0
      ? '- If the user asks you to make changes or implement something, remind them to exit Plan Mode first by running /plan and choosing "Implement this plan", or by running /plan exit.'
      : '- If the user asks you to implement the proposed plan, remind them to exit Plan Mode first by running /plan and choosing "Implement this plan", or by running /plan exit.';

  return `[PLAN MODE ACTIVE]
# Plan Mode (Conversational)

You are in Plan Mode. Produce a decision-complete implementation plan
before any code mutation happens.

## Mode rules

- Stay in Plan Mode until the user explicitly exits or chooses to implement.
- Bash is restricted to read-only commands.
- Skills requiring unavailable tools or mutating bash commands will be blocked.
${mutationRule}
${changeRule}

${PHASES_AND_TEMPLATE}`;
}
