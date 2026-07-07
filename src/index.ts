import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  extractProposedPlan,
  filterPlanModeMessages,
  getAssistantMessageText,
  stripProposedPlanBlocksFromMessages,
} from "./core/context.ts";
import { readToolConfig, writeToolConfig } from "./core/config.ts";
import { buildPlanModePrompt } from "./core/prompt.ts";
import { isSafeCommand } from "./core/safety.ts";
import { createInitialState, enterPlanMode, exitPlanMode, restoreState } from "./core/state.ts";
import {
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
  selectedNamesToToolConfig,
  toolConfigToSelectedNames,
} from "./core/tools.ts";
import {
  BLOCKED_BUILTIN_TOOLS,
  PROPOSED_PLAN_MESSAGE_TYPE,
  STATE_ENTRY_TYPE,
  STATUS_KEY,
  WIDGET_KEY,
} from "./shared/constants.ts";
import type { PlanModeState } from "./shared/types.ts";
import { savePlanToFile } from "./core/plan-file.ts";
import { type PlanMenuAction, showPlanMenu, showPlanReadyMenu } from "./tui/menus.ts";
import { formatStatus } from "./tui/status.ts";
import { createToolSelectorComponent } from "./tui/tool-selector.ts";
import { formatWidgetLines } from "./tui/widgets.ts";

export default function createExtension(pi: ExtensionAPI): void {
  let state: PlanModeState = createInitialState();
  let previousTools: string[] | undefined;
  let pendingMenuTimer: ReturnType<typeof setTimeout> | undefined;

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
      previousTools = safeGetActiveTools(pi);
    }
    pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames));
  }

  function restoreTools(): void {
    pi.setActiveTools(normalModeToolNames(previousTools));
    previousTools = undefined;
  }

  function clearPendingMenu(): void {
    if (pendingMenuTimer !== undefined) {
      clearTimeout(pendingMenuTimer);
      pendingMenuTimer = undefined;
    }
  }

  function doEnter(ctx: ExtensionContext): void {
    state = enterPlanMode(state);
    activatePlanModeTools();
    persist();
    updateUi(ctx);
  }

  function doExit(ctx: ExtensionContext): void {
    clearPendingMenu();
    state = exitPlanMode(state);
    restoreTools();
    persist();
    updateUi(ctx);
  }

  function sendPlanModeMessage(content: string, ctx: ExtensionContext): void {
    pi.sendUserMessage(content, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
  }

  async function runToolSelector(ctx: ExtensionContext): Promise<void> {
    const allTools = safeGetAllTools(pi);
    const selections = await ctx.ui.custom<string[] | null>((_tui, theme, _keybindings, done) => {
      let requestRender: () => void = () => {};
      const component = createToolSelectorComponent({
        tools: allTools,
        previousSelections: state.selectedToolNames ?? undefined,
        theme: {
          fg: (color: string, text: string) => theme.fg(color as never, text),
          bold: (text: string) => theme.bold(text),
          dim: (text: string) => theme.fg("dim" as never, text),
        },
        done,
        requestRender: () => requestRender(),
      });
      requestRender = () => component.invalidate();
      return component;
    });

    if (selections === null) {
      ctx.ui.notify("No changes to Plan-mode tools.", "info");
      return;
    }
    state = { ...state, selectedToolNames: selections };
    activatePlanModeTools();
    persist();

    // Persist to config file
    const toolConfig = selectedNamesToToolConfig(selections, allTools);
    writeToolConfig(toolConfig).catch(() => {});

    const count = selections.length;
    const msg =
      count === 0
        ? "Plan-mode tools reset to defaults."
        : `Plan-mode tools updated: ${count} extension tool(s) enabled.`;
    ctx.ui.notify(msg, "info");
  }

  async function handleMenuAction(action: PlanMenuAction, ctx: ExtensionContext): Promise<void> {
    switch (action) {
      case "implement": {
        const plan = state.latestPlan;
        if (plan) await savePlanToFile(plan, ctx);
        doExit(ctx);
        if (plan) {
          sendPlanModeMessage(
            `Plan mode is now disabled. Full tool access is restored. Implement this proposed plan now:\n\n${plan}`,
            ctx,
          );
        }
        ctx.ui.notify("Implementing plan. Full access restored.", "info");
        break;
      }
      case "exit":
        if (state.latestPlan) await savePlanToFile(state.latestPlan, ctx);
        doExit(ctx);
        ctx.ui.notify("Plan mode disabled.", "info");
        break;
      case "show-plan":
        if (state.latestPlan) {
          ctx.ui.notify(state.latestPlan, "info");
        }
        break;
      case "tools":
        await runToolSelector(ctx);
        break;
      default:
        break;
    }
  }

  pi.registerCommand("plan", {
    description: "Enter or manage plan mode",
    handler: async (args, ctx) => {
      clearPendingMenu();
      const command = args.trim();

      if (command) {
        if (!state.enabled) {
          doEnter(ctx);
          ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
        }
        sendPlanModeMessage(command, ctx);
        return;
      }

      if (!state.enabled) {
        doEnter(ctx);
        ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
        return;
      }

      const action = await showPlanMenu(ctx, state);
      await handleMenuAction(action, ctx);
    },
  });

  pi.registerCommand("plan:exit", {
    description: "Exit plan mode",
    handler: async (_args, ctx) => {
      clearPendingMenu();
      if (state.enabled) {
        if (state.latestPlan) await savePlanToFile(state.latestPlan, ctx);
        doExit(ctx);
      }
      ctx.ui.notify("Plan mode disabled.", "info");
    },
  });

  pi.registerCommand("plan:tools", {
    description: "Configure plan mode tools",
    handler: async (_args, ctx) => {
      clearPendingMenu();
      if (!state.enabled) {
        doEnter(ctx);
        ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
      }
      await runToolSelector(ctx);
    },
  });

  pi.on("tool_call", async (event) => {
    if (!state.enabled) return;

    if (BLOCKED_BUILTIN_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: `Plan mode blocks '${event.toolName}'. Exit plan mode first with /plan:exit.`,
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
    pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames));
    state = { ...state, latestPlan: undefined, awaitingAction: false };
    updateUi(ctx);
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPlanModePrompt()}`,
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!state.enabled) return;
    const messages = (event.messages as unknown as Array<Record<string, unknown>>) ?? [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const text = getAssistantMessageText(lastAssistant);
    const plan = extractProposedPlan(text);
    if (!plan) return;
    state = { ...state, latestPlan: plan, awaitingAction: true };
    persist();
    updateUi(ctx);
    pi.sendMessage(
      {
        customType: PROPOSED_PLAN_MESSAGE_TYPE,
        content: `**Proposed Plan**\n\n${plan}`,
        display: true,
      },
      { triggerTurn: false },
    );
    clearPendingMenu();
    pendingMenuTimer = setTimeout(
      () =>
        void showPlanReadyMenu(ctx)
          .then((action) => handleMenuAction(action, ctx))
          .catch(() => {}),
      0,
    );
  });

  pi.on("context", async (event) => {
    const messages = (event.messages as unknown as Array<Record<string, unknown>>) ?? [];
    const planMessageType = state.enabled ? undefined : PROPOSED_PLAN_MESSAGE_TYPE;
    const filtered = filterPlanModeMessages(messages, STATE_ENTRY_TYPE, planMessageType);
    const processed = state.enabled
      ? filtered
      : stripProposedPlanBlocksFromMessages(filtered);
    if (filtered.length !== messages.length || processed !== filtered) {
      return { messages: processed as unknown as typeof event.messages };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    state = restoreState(entries);

    if (pi.getFlag("plan") === true) {
      state = enterPlanMode(state);
    }

    // Load persistent tool config (overrides session-entry selections)
    const toolConfig = await readToolConfig();
    if (toolConfig) {
      state = { ...state, selectedToolNames: toolConfigToSelectedNames(toolConfig) };
    }

    if (state.enabled) {
      activatePlanModeTools();
    }
    updateUi(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearPendingMenu();
    persist();
    clearUi(ctx);
  });
}
