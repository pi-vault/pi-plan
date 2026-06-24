const PLAN_BLOCK_REGEX = /<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i;

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

export function filterPlanModeEntries(
  messages: Array<Record<string, unknown>>,
  entryType: string,
): Array<Record<string, unknown>> {
  return messages.filter((msg) => msg.customType !== entryType);
}
