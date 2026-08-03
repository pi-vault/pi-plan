import type { AgentEndEvent, ContextEvent } from "@earendil-works/pi-coding-agent";
import { PROPOSED_PLAN_MESSAGE_TYPE } from "../shared/constants.ts";

const PLAN_BLOCK_PATTERN =
  /^[ \t]*<proposed_plan>[ \t]*\r?\n([\s\S]*?)^[ \t]*<\/proposed_plan>[ \t]*\r?$/im;

type AssistantMessage = Extract<AgentEndEvent["messages"][number], { role: "assistant" }>;

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export function captureProposedPlan(messages: AgentEndEvent["messages"]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      const plan = assistantText(message).match(PLAN_BLOCK_PATTERN)?.[1]?.trim();
      return plan || undefined;
    }
  }
  return undefined;
}

export function filterLegacyProposedPlanMessages(
  messages: ContextEvent["messages"],
): { messages: ContextEvent["messages"] } | undefined {
  const filtered = messages.filter(
    (message) => message.role !== "custom" || message.customType !== PROPOSED_PLAN_MESSAGE_TYPE,
  );

  return filtered.length === messages.length ? undefined : { messages: filtered };
}
