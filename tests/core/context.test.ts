import type { AgentEndEvent, ContextEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  captureProposedPlan,
  sanitizePlanModeContext,
} from "../../src/core/context.ts";

type AgentMessage = ContextEvent["messages"][number];
type AssistantMessage = Extract<AgentEndEvent["messages"][number], { role: "assistant" }>;
type UserMessage = Extract<AgentMessage, { role: "user" }>;
type CustomMessage = Extract<AgentMessage, { role: "custom" }>;

function assistant(
  content: AssistantMessage["content"],
): AssistantMessage {
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
        assistantText("Intro mentions <proposed_plan> inline."),
        assistantText("<proposed_plan>\n# Intended\n</proposed_plan>"),
      ]),
    ).toBe("# Intended");
  });

  it("accepts standalone tags with case, horizontal whitespace, and CRLF", () => {
    expect(
      captureProposedPlan([
        assistantText("  <PROPOSED_PLAN>  \r\n# Plan\r\n  </PROPOSED_PLAN>  "),
      ]),
    ).toBe("# Plan");
  });

  it("returns undefined for empty, same-line, malformed, or absent blocks", () => {
    expect(captureProposedPlan([assistantText("<proposed_plan>\n  \n</proposed_plan>")])).toBeUndefined();
    expect(captureProposedPlan([assistantText("<proposed_plan># Inline</proposed_plan>")])).toBeUndefined();
    expect(captureProposedPlan([assistantText("<proposed_plan>\n# Missing close")])).toBeUndefined();
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
describe("sanitizePlanModeContext", () => {
  it("removes legacy proposed-plan messages and standalone blocks while disabled", () => {
    const messages = [
      user("hello"),
      proposedPlanMessage("old plan"),
      assistantText(
        "Intro mentions <proposed_plan> inline.\n<proposed_plan>\n# Old\n</proposed_plan>\nAfter.",
      ),
    ];

    expect(sanitizePlanModeContext(messages, false)).toEqual({
      messages: [
        user("hello"),
        assistantText("Intro mentions <proposed_plan> inline.\n\nAfter."),
      ],
    });
  });

  it("preserves user messages, non-text content, and malformed blocks", () => {
    const messages = [
      user("<proposed_plan>\n# User Plan\n</proposed_plan>"),
      assistant([
        { type: "thinking", thinking: "reasoning" },
        { type: "text", text: "<proposed_plan># Inline</proposed_plan>" },
        { type: "toolCall", id: "call-1", name: "read", arguments: {} },
      ]),
    ];

    expect(sanitizePlanModeContext(messages, false)).toBeUndefined();
  });

  it("returns undefined without changes while enabled or when disabled context is clean", () => {
    const messages = [assistantText("<proposed_plan>\n# Current\n</proposed_plan>")];

    expect(sanitizePlanModeContext(messages, true)).toBeUndefined();
    expect(sanitizePlanModeContext([assistantText("No plan")], false)).toBeUndefined();
  });
});
