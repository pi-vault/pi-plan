import type {
  AgentEndEvent,
  ContextEvent,
} from "@earendil-works/pi-coding-agent";
import { PROPOSED_PLAN_MESSAGE_TYPE } from "../shared/constants.ts";

const PLAN_BLOCK_PATTERN =
  /^[ \t]*<proposed_plan>[ \t]*\r?\n([\s\S]*?)^[ \t]*<\/proposed_plan>[ \t]*\r?$/im;
const ALL_PLAN_BLOCK_PATTERN =
  /^[ \t]*<proposed_plan>[ \t]*\r?\n[\s\S]*?^[ \t]*<\/proposed_plan>[ \t]*\r?$/gim;

type AssistantMessage = Extract<AgentEndEvent["messages"][number], { role: "assistant" }>;

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function sanitizeAssistantMessage(
  message: AssistantMessage,
): AssistantMessage {
  const content = message.content;
  const ranges = [...assistantText(message).matchAll(ALL_PLAN_BLOCK_PATTERN)].map(
    (match) => [match.index, match.index + match[0].length] as const,
  );
  if (ranges.length === 0) return message;

  let offset = 0;
  const sanitizedContent = content.map((part) => {
    if (part.type !== "text") return part;
    const start = offset;
    const end = start + part.text.length;
    offset = end + 1;

    let sanitizedText = part.text;
    for (let index = ranges.length - 1; index >= 0; index -= 1) {
      const range = ranges[index];
      if (!range) continue;
      const overlapStart = Math.max(start, range[0]);
      const overlapEnd = Math.min(end, range[1]);
      if (overlapStart >= overlapEnd) continue;

      const localStart = overlapStart - start;
      const localEnd = overlapEnd - start;
      sanitizedText =
        sanitizedText.slice(0, localStart) + sanitizedText.slice(localEnd);
    }

    return sanitizedText === part.text ? part : { ...part, text: sanitizedText };
  });

  return { ...message, content: sanitizedContent };
}

export function captureProposedPlan(
  messages: AgentEndEvent["messages"],
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      const plan = assistantText(message).match(PLAN_BLOCK_PATTERN)?.[1]?.trim();
      return plan || undefined;
    }
  }
  return undefined;
}

export function sanitizePlanModeContext(
  messages: ContextEvent["messages"],
  enabled: boolean,
): { messages: ContextEvent["messages"] } | undefined {
  if (enabled) return undefined;

  const sanitizedMessages = messages.flatMap<ContextEvent["messages"][number]>((message) => {
    if (message.role === "custom" && message.customType === PROPOSED_PLAN_MESSAGE_TYPE) {
      return [];
    }
    if (message.role !== "assistant") return [message];
    return [sanitizeAssistantMessage(message)];
  });

  return messages.every((message, index) => sanitizedMessages[index] === message)
    ? undefined
    : { messages: sanitizedMessages };
}
