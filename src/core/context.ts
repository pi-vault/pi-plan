const PLAN_BLOCK_REGEX = /<proposed_plan>([\s\S]*?)<\/proposed_plan>/i;

export function extractProposedPlan(text: string): string | undefined {
  const match = text.match(PLAN_BLOCK_REGEX);
  const content = match?.[1]?.trim();
  return content || undefined;
}

export function getAssistantMessageText(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is Record<string, unknown> =>
        typeof part === "object" &&
        part !== null &&
        (part as Record<string, unknown>).type === "text",
    )
    .map((part) => String(part.text ?? ""))
    .join("\n");
}

const PROPOSED_PLAN_BLOCK_PATTERN =
  /<proposed_plan>[\s\S]*?<\/proposed_plan>/gi;

function stripProposedPlanBlocks(text: string): string {
  return text.replace(PROPOSED_PLAN_BLOCK_PATTERN, "");
}

export function stripProposedPlanBlocksFromMessages(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  let changed = false;
  const result = messages.map((msg) => {
    if (msg.role !== "assistant") return msg;
    const content = msg.content;
    if (typeof content === "string") {
      const stripped = stripProposedPlanBlocks(content);
      if (stripped !== content) {
        changed = true;
        return { ...msg, content: stripped };
      }
      return msg;
    }
    if (!Array.isArray(content)) return msg;
    let blockChanged = false;
    const newContent = content.map((block: Record<string, unknown>) => {
      if (block.type !== "text" || typeof block.text !== "string") return block;
      const stripped = stripProposedPlanBlocks(block.text as string);
      if (stripped !== block.text) {
        blockChanged = true;
        return { ...block, text: stripped };
      }
      return block;
    });
    if (blockChanged) {
      changed = true;
      return { ...msg, content: newContent };
    }
    return msg;
  });
  return changed ? result : messages;
}

export function filterPlanModeMessages(
  messages: Array<Record<string, unknown>>,
  stateEntryType: string,
  planMessageType: string | undefined,
): Array<Record<string, unknown>> {
  return messages.filter((msg) => {
    if (msg.customType === stateEntryType) return false;
    if (planMessageType && msg.customType === planMessageType) return false;
    return true;
  });
}
