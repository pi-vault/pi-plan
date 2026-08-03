import type { AgentEndEvent, ContextEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { captureProposedPlan, filterLegacyProposedPlanMessages } from "../../src/core/context.ts";

type AgentMessage = ContextEvent["messages"][number];
type AssistantMessage = Extract<AgentEndEvent["messages"][number], { role: "assistant" }>;
type UserMessage = Extract<AgentMessage, { role: "user" }>;
type CustomMessage = Extract<AgentMessage, { role: "custom" }>;

function assistant(content: AssistantMessage["content"]): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}

function assistantText(text: string): AssistantMessage {
  return assistant([{ type: "text", text }]);
}

function user(content: UserMessage["content"]): UserMessage {
  return { role: "user", content, timestamp: 0 };
}

function proposedPlanMessage(content: string): CustomMessage {
  return {
    role: "custom",
    customType: "proposed-plan",
    content,
    display: true,
    timestamp: 0,
  };
}

describe("captureProposedPlan", () => {
  it("ignores an inline delimiter mention before a standalone plan block", () => {
    expect(
      captureProposedPlan([
        assistantText(
          "Intro mentions <proposed_plan>\n# Not intended\n</proposed_plan>\n<proposed_plan>\n# Intended\n</proposed_plan>",
        ),
      ]),
    ).toBe("# Intended");
  });

  it("accepts standalone tags with case, horizontal whitespace, and CRLF", () => {
    expect(
      captureProposedPlan([assistantText("  <PROPOSED_PLAN>  \r\n# Plan\r\n  </PROPOSED_PLAN>  ")]),
    ).toBe("# Plan");
  });

  it("returns undefined for empty, same-line, malformed, or absent blocks", () => {
    expect(
      captureProposedPlan([assistantText("<proposed_plan>\n  \n</proposed_plan>")]),
    ).toBeUndefined();
    expect(
      captureProposedPlan([assistantText("<proposed_plan># Inline</proposed_plan>")]),
    ).toBeUndefined();
    expect(
      captureProposedPlan([assistantText("<proposed_plan>\n# Missing close")]),
    ).toBeUndefined();
    expect(captureProposedPlan([assistantText("No plan")])).toBeUndefined();
  });

  it("uses only the last assistant message and joins its text parts", () => {
    expect(
      captureProposedPlan([
        assistantText("<proposed_plan>\n# Earlier\n</proposed_plan>"),
        assistant([
          { type: "thinking", thinking: "reasoning" },
          { type: "text", text: "<proposed_plan>\n# " },
          { type: "toolCall", id: "call-1", name: "read", arguments: {} },
          { type: "text", text: "Latest\n</proposed_plan>" },
        ]),
      ]),
    ).toBe("# \nLatest");
  });
});

describe("filterLegacyProposedPlanMessages", () => {
  it("removes only legacy custom plan messages", () => {
    const plan = assistantText("<proposed_plan>\n# Current\n</proposed_plan>");
    const messages = [user("hello"), proposedPlanMessage("old duplicate"), plan];

    expect(filterLegacyProposedPlanMessages(messages)).toEqual({
      messages: [user("hello"), plan],
    });
  });

  it("leaves assistant plan blocks and clean context unchanged", () => {
    const messages = [
      user("<proposed_plan>\n# User text\n</proposed_plan>"),
      assistantText("Before\n<proposed_plan>\n# Assistant plan\n</proposed_plan>\nAfter"),
    ];

    expect(filterLegacyProposedPlanMessages(messages)).toBeUndefined();
  });
});
