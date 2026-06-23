const PLAN_MODE_PROMPT = `[PLAN MODE ACTIVE]
# Plan Mode (Conversational)

You are in Plan Mode. Produce a decision-complete implementation plan
before any code mutation happens.

## Mode rules

- Stay in Plan Mode until the user explicitly exits or chooses to implement.
- Do not edit files, write files, or execute the plan.
- If the user asks you to make changes or implement something, remind them
  to exit Plan Mode first by running /plan and choosing "Implement this plan",
  or by running /plan exit.
- Bash is restricted to read-only commands.
- Skills and tools listed in the system prompt are available if they operate
  through currently enabled Plan Mode tools. Skills that require edit, write,
  or mutating bash commands will be blocked.

## Phase 1 -- Explore

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

export function buildPlanModePrompt(): string {
  return PLAN_MODE_PROMPT;
}
