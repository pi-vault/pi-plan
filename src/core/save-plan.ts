import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ToolCallEvent,
  ToolCallEventResult,
  ToolExecutionEndEvent,
} from "@earendil-works/pi-coding-agent";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { buildPlanModePrompt } from "./prompt.ts";
import { savePlanToolNames } from "./tools.ts";

export function createSavePlanSession(plan: string, workspaceRoot: string) {
  let writeCallId: string | undefined;
  let writeSucceeded = false;
  const userPrompt = `Save the current proposed plan. Choose a new lowercase .md filename in the workspace root ${workspaceRoot}. Prefix the filename with today's date followed by a hyphen (YYYY-MM-DD-); use date +%F if needed. Pass only the filename as a relative workspace path; do not use an absolute path or a subdirectory. Write exactly the plan below to that file. Do not add leading or trailing whitespace, including a trailing newline. Make no other changes.\n\n${plan}`;

  return {
    userPrompt,
    toolNames: () => savePlanToolNames(writeCallId === undefined && !writeSucceeded),
    authorizeToolCall(event: ToolCallEvent): ToolCallEventResult | undefined {
      if (event.toolName !== "write") return undefined;
      if (writeCallId !== undefined || writeSucceeded) {
        return {
          block: true,
          reason: "Plan mode blocks 'write'. Exit plan mode first with /plan:exit.",
        };
      }
      const input =
        typeof event.input === "object" && event.input !== null
          ? (event.input as Record<string, unknown>)
          : undefined;
      if (input === undefined) {
        return { block: true, reason: "Save plan requires an input object with path and content." };
      }
      if (input.content !== plan) {
        return { block: true, reason: "Save plan requires the exact captured plan content." };
      }
      const filePath = typeof input.path === "string" ? input.path : undefined;
      if (filePath === undefined) {
        return { block: true, reason: "Save plan requires a string file path." };
      }
      if (
        filePath.startsWith("/") ||
        filePath.startsWith("~") ||
        filePath.startsWith("@") ||
        filePath.startsWith("file:") ||
        /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/u.test(filePath) ||
        filePath.split("/").includes("..")
      ) {
        return { block: true, reason: "Save plan path must be a normal relative workspace path." };
      }
      if (!/^[a-z0-9_./-]+\.md$/.test(filePath)) {
        return { block: true, reason: "Save plan path must be a lowercase .md file." };
      }
      try {
        const workspacePath = realpathSync(workspaceRoot);
        const targetPath = resolve(workspacePath, filePath);
        const parentPath = realpathSync(dirname(targetPath));
        const parentStats = lstatSync(parentPath, { throwIfNoEntry: false });
        if (!parentStats?.isDirectory()) {
          return { block: true, reason: "Save plan parent directory must already exist." };
        }
        const parentRelative = relative(workspacePath, parentPath);
        if (parentRelative === ".." || parentRelative.startsWith(`..${sep}`)) {
          return { block: true, reason: "Save plan path must stay inside the workspace." };
        }
        // ponytail: preflight existence check is not atomic; use an exclusive-create save tool if concurrent no-clobber becomes required.
        if (lstatSync(targetPath, { throwIfNoEntry: false }) !== undefined) {
          return { block: true, reason: "Save plan target must not already exist." };
        }
      } catch {
        return {
          block: true,
          reason: "Save plan path must be an existing directory inside the workspace.",
        };
      }
      Object.freeze(input);
      writeCallId = event.toolCallId;
      return undefined;
    },
    recordToolExecution(event: ToolExecutionEndEvent) {
      if (event.toolName !== "write" || event.toolCallId !== writeCallId) return;
      writeCallId = undefined;
      if (!event.isError) writeSucceeded = true;
    },
    saved: () => writeSucceeded,
    beforeAgentStart(event: BeforeAgentStartEvent): BeforeAgentStartEventResult {
      return {
        systemPrompt: `${event.systemPrompt}\n\n${buildPlanModePrompt()}\n\n[PLAN SAVE TURN]\nUse only one approved write call for the exact captured plan. Do not edit, implement, or modify any other file.`,
      };
    },
  };
}
