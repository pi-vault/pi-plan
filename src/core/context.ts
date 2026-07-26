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

function extractProposedPlan(text: string): string | undefined {
  const content = text.match(PLAN_BLOCK_PATTERN)?.[1]?.trim();
  return content || undefined;
}

function assistantText(message: AssistantMessage): string {
  const content: unknown = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}

function sanitizeAssistantMessage(
  message: AssistantMessage,
): AssistantMessage | undefined {
  const content = message.content;
  if (!Array.isArray(content)) return undefined;

  let changed = false;
  const sanitizedContent = content.map((part) => {
    if (part.type !== "text") return part;
    const text = part.text.replace(ALL_PLAN_BLOCK_PATTERN, "");
    if (text === part.text) return part;
    changed = true;
    return { ...part, text };
  });

  return changed ? { ...message, content: sanitizedContent } : undefined;
}

export function captureProposedPlan(
  messages: AgentEndEvent["messages"],
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return extractProposedPlan(assistantText(message));
    }
  }
  return undefined;
}

export function sanitizePlanModeContext(
  messages: ContextEvent["messages"],
  enabled: boolean,
): { messages: ContextEvent["messages"] } | undefined {
  if (enabled) return undefined;

  let changed = false;
  const sanitizedMessages: ContextEvent["messages"] = [];

  for (const message of messages) {
    if (message.role === "custom" && message.customType === PROPOSED_PLAN_MESSAGE_TYPE) {
      changed = true;
      continue;
    }

    if (message.role !== "assistant") {
      sanitizedMessages.push(message);
      continue;
    }

    const sanitizedMessage = sanitizeAssistantMessage(message);
    if (sanitizedMessage) {
      changed = true;
      sanitizedMessages.push(sanitizedMessage);
    } else {
      sanitizedMessages.push(message);
    }
  }

  return changed ? { messages: sanitizedMessages } : undefined;
}
