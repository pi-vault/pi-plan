import { describe, expect, it } from "vitest";
import {
  extractProposedPlan,
  filterPlanModeEntries,
  filterPlanModeMessages,
  getAssistantMessageText,
  stripProposedPlanBlocksFromMessages,
} from "../../src/core/context.ts";
import {
  PROPOSED_PLAN_MESSAGE_TYPE,
  STATE_ENTRY_TYPE,
} from "../../src/shared/constants.ts";

describe("extractProposedPlan", () => {
  it("extracts plan content from tags", () => {
    const text =
      "Here is my plan:\n<proposed_plan>\n# My Plan\n## Summary\nDo stuff\n</proposed_plan>\nDone.";
    expect(extractProposedPlan(text)).toBe("# My Plan\n## Summary\nDo stuff");
  });

  it("returns undefined when no plan tags present", () => {
    expect(extractProposedPlan("Just some text without plan tags")).toBeUndefined();
  });

  it("returns undefined when plan tags are empty", () => {
    expect(extractProposedPlan("<proposed_plan></proposed_plan>")).toBeUndefined();
    expect(extractProposedPlan("<proposed_plan>  </proposed_plan>")).toBeUndefined();
  });

  it("is case-insensitive for the tags", () => {
    expect(extractProposedPlan("<PROPOSED_PLAN>\n# Plan\n</PROPOSED_PLAN>")).toBe("# Plan");
  });

  it("trims whitespace from extracted content", () => {
    expect(extractProposedPlan("<proposed_plan>\n\n# Plan\n\n</proposed_plan>")).toBe("# Plan");
  });
});

describe("getAssistantMessageText", () => {
  it("returns string content directly", () => {
    const message: Record<string, unknown> = { role: "assistant", content: "hello world" };
    expect(getAssistantMessageText(message)).toBe("hello world");
  });

  it("extracts text parts from content array", () => {
    const message: Record<string, unknown> = {
      role: "assistant",
      content: [
        { type: "text", text: "line one" },
        { type: "tool_call", name: "read", input: {} },
        { type: "text", text: "line two" },
      ],
    };
    expect(getAssistantMessageText(message)).toBe("line one\nline two");
  });

  it("returns empty string when content is missing", () => {
    expect(getAssistantMessageText({})).toBe("");
    expect(getAssistantMessageText({ content: undefined })).toBe("");
  });

  it("returns empty string when content is not string or array", () => {
    expect(getAssistantMessageText({ content: 42 })).toBe("");
  });

  it("skips non-text content parts", () => {
    const message: Record<string, unknown> = {
      content: [
        { type: "tool_result", content: "result" },
        { type: "text", text: "only this" },
      ],
    };
    expect(getAssistantMessageText(message)).toBe("only this");
  });
});

describe("filterPlanModeEntries", () => {
  it("removes entries matching the state entry type", () => {
    const messages = [
      { role: "user", content: "hello" },
      { customType: STATE_ENTRY_TYPE, data: { enabled: true } },
      { role: "assistant", content: "world" },
    ];
    const filtered = filterPlanModeEntries(messages, STATE_ENTRY_TYPE);
    expect(filtered).toHaveLength(2);
    expect(filtered[0]).toEqual({ role: "user", content: "hello" });
    expect(filtered[1]).toEqual({ role: "assistant", content: "world" });
  });

  it("returns all messages when no state entries exist", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    expect(filterPlanModeEntries(messages, STATE_ENTRY_TYPE)).toHaveLength(2);
  });

  it("keeps proposed_plan blocks in assistant messages", () => {
    const messages = [
      { role: "assistant", content: "Plan:\n<proposed_plan>\n# Plan\n</proposed_plan>" },
    ];
    const filtered = filterPlanModeEntries(messages, STATE_ENTRY_TYPE);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content as string).toContain("<proposed_plan>");
  });
});

describe("filterPlanModeMessages", () => {
  it("removes both state entries and proposed-plan messages", () => {
    const messages = [
      { role: "user", content: "hello" },
      { customType: STATE_ENTRY_TYPE, data: { enabled: true } },
      {
        customType: PROPOSED_PLAN_MESSAGE_TYPE,
        content: "plan text",
        display: true,
      },
      { role: "assistant", content: "world" },
    ];
    const filtered = filterPlanModeMessages(
      messages,
      STATE_ENTRY_TYPE,
      PROPOSED_PLAN_MESSAGE_TYPE,
    );
    expect(filtered).toHaveLength(2);
    expect(filtered[0]).toEqual({ role: "user", content: "hello" });
    expect(filtered[1]).toEqual({ role: "assistant", content: "world" });
  });

  it("keeps proposed-plan messages when planMessageType is undefined", () => {
    const messages = [
      {
        customType: PROPOSED_PLAN_MESSAGE_TYPE,
        content: "plan",
        display: true,
      },
      { role: "assistant", content: "world" },
    ];
    const filtered = filterPlanModeMessages(
      messages,
      STATE_ENTRY_TYPE,
      undefined,
    );
    expect(filtered).toHaveLength(2);
  });

  it("always filters state entries regardless of planMessageType", () => {
    const messages = [
      { customType: STATE_ENTRY_TYPE, data: { enabled: true } },
      { role: "user", content: "hello" },
    ];
    const filtered = filterPlanModeMessages(messages, STATE_ENTRY_TYPE, undefined);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toEqual({ role: "user", content: "hello" });
  });
});

describe("stripProposedPlanBlocksFromMessages", () => {
  it("strips plan blocks from assistant messages with string content", () => {
    const messages = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "Here: <proposed_plan>\n# Plan\n</proposed_plan>\nDone.",
      },
    ];
    const result = stripProposedPlanBlocksFromMessages(messages);
    expect(result[0]).toEqual({ role: "user", content: "hello" });
    expect((result[1] as any).content).toBe("Here: \nDone.");
  });

  it("strips plan blocks from assistant messages with array content", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Before <proposed_plan>plan</proposed_plan> after",
          },
          { type: "tool_use", name: "read" },
        ],
      },
    ];
    const result = stripProposedPlanBlocksFromMessages(messages);
    const content = (result[0] as any).content;
    expect(content[0].text).toBe("Before  after");
    expect(content[1]).toEqual({ type: "tool_use", name: "read" });
  });

  it("does not modify user messages", () => {
    const messages = [
      { role: "user", content: "<proposed_plan>user plan</proposed_plan>" },
    ];
    const result = stripProposedPlanBlocksFromMessages(messages);
    expect((result[0] as any).content).toBe(
      "<proposed_plan>user plan</proposed_plan>",
    );
  });

  it("returns same array reference when nothing to strip", () => {
    const messages = [{ role: "assistant", content: "no plan here" }];
    const result = stripProposedPlanBlocksFromMessages(messages);
    expect(result).toBe(messages);
  });
});
