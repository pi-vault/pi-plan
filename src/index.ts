import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildPlanModePrompt } from "./core/prompt.ts";
import { isSafeCommand } from "./core/safety.ts";
import { createInitialState, enterPlanMode, exitPlanMode, restoreState } from "./core/state.ts";
import { defaultPlanModeToolNames, normalModeToolNames } from "./core/tools.ts";
import { extractProposedPlan, filterPlanModeEntries, getAssistantMessageText } from "./core/context.ts";
import {
  BLOCKED_BUILTIN_TOOLS,
  STATE_ENTRY_TYPE,
  STATUS_KEY,
  WIDGET_KEY,
} from "./shared/constants.ts";
import type { PlanModeState } from "./shared/types.ts";
import { formatStatus } from "./tui/status.ts";
import { formatWidgetLines } from "./tui/widgets.ts";

export default function createExtension(pi: ExtensionAPI): void {
  let state: PlanModeState = createInitialState();
  let previousTools: string[] | undefined;

  pi.registerFlag("plan", {
    description: "Start in plan mode (read-only exploration)",
    type: "boolean",
    default: false,
  });

  function persist(): void {
    pi.appendEntry(STATE_ENTRY_TYPE, state);
  }

  function updateUi(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, formatStatus(state));
    ctx.ui.setWidget(WIDGET_KEY, formatWidgetLines(state));
  }

  function clearUi(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  }

  function activatePlanModeTools(): void {
    if (previousTools === undefined) {
      previousTools = pi.getActiveTools();
    }
    pi.setActiveTools(defaultPlanModeToolNames());
  }

  function restoreTools(): void {
    pi.setActiveTools(normalModeToolNames(previousTools));
    previousTools = undefined;
  }

  function doEnter(ctx: ExtensionContext): void {
    state = enterPlanMode(state);
    activatePlanModeTools();
    persist();
    updateUi(ctx);
  }

  function doExit(ctx: ExtensionContext): void {
    state = exitPlanMode(state);
    restoreTools();
    persist();
    updateUi(ctx);
  }

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only exploration)",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();

      if (command === "exit" || command === "off") {
        doExit(ctx);
        ctx.ui.notify("Plan mode disabled.", "info");
        return;
      }

      if (state.enabled) {
        doExit(ctx);
        ctx.ui.notify("Plan mode disabled. Full access restored.", "info");
      } else {
        doEnter(ctx);
        ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
      }
    },
  });

  pi.on("tool_call", async (event) => {
    if (!state.enabled) return;

    if (BLOCKED_BUILTIN_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: `Plan mode blocks '${event.toolName}'. Exit plan mode first with /plan exit.`,
      };
    }

    if (event.toolName === "bash") {
      const input = event.input as Record<string, unknown>;
      const command = typeof input.command === "string" ? input.command : "";
      if (!isSafeCommand(command)) {
        return {
          block: true,
          reason: `Plan mode blocks mutating or non-allowlisted bash commands.\nCommand: ${command}`,
        };
      }
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!state.enabled) return;
    // Re-apply plan mode tools each turn (handles other extensions modifying tool list)
    pi.setActiveTools(defaultPlanModeToolNames());
    // Clear stale plan state for the new turn
    state = { ...state, latestPlan: undefined, awaitingAction: false };
    updateUi(ctx);
    return { systemPrompt: event.systemPrompt + "\n\n" + buildPlanModePrompt() };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!state.enabled) return;
    const messages = (event.messages as Array<Record<string, unknown>>) ?? [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const text = getAssistantMessageText(lastAssistant);
    const plan = extractProposedPlan(text);
    if (!plan) return;
    state = { ...state, latestPlan: plan, awaitingAction: true };
    persist();
    updateUi(ctx);
  });

  pi.on("context", async (event) => {
    const messages = (event.messages as Array<Record<string, unknown>>) ?? [];
    const filtered = filterPlanModeEntries(messages, STATE_ENTRY_TYPE);
    if (filtered.length !== messages.length) {
      return { messages: filtered };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    state = restoreState(entries);

    if (pi.getFlag("plan") === true) {
      state = enterPlanMode(state);
    }

    if (state.enabled) {
      activatePlanModeTools();
    }
    updateUi(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    persist();
    clearUi(ctx);
  });
}
