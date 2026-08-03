import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { captureProposedPlan, filterLegacyProposedPlanMessages } from "./core/context.ts";
import { buildPlanModePrompt } from "./core/prompt.ts";
import { createSavePlanSession } from "./core/save-plan.ts";
import { isSafeCommand } from "./core/safety.ts";
import { createInitialState, enterPlanMode, exitPlanMode, restoreState } from "./core/state.ts";
import {
  isPlanMutationToolName,
  normalModeToolNames,
  planModeToolNames,
  readSelectedToolNames,
  safeGetActiveTools,
  safeGetAllTools,
  writeSelectedToolNames,
} from "./core/tools.ts";
import { STATE_ENTRY_TYPE, STATUS_KEY, WIDGET_KEY } from "./shared/constants.ts";
import type { PlanModeState } from "./shared/types.ts";
import { type PlanMenuAction, showPlanMenu, showPlanReadyMenu } from "./tui/menus.ts";
import { createToolSelectorComponent } from "./tui/tool-selector.ts";

interface PendingModeTransition {
  enabled: boolean;
  prompt?: string;
  consumePlan?: boolean;
  applyOnSettled?: boolean;
}

export default function createExtension(pi: ExtensionAPI): void {
  let state: PlanModeState = createInitialState();
  let previousTools: string[] | undefined;
  let pendingMenuTimer: ReturnType<typeof setTimeout> | undefined;
  let savePlanSession: ReturnType<typeof createSavePlanSession> | undefined;
  let pendingModeTransition: PendingModeTransition | undefined;

  pi.registerFlag("plan", {
    description: "Start in plan mode (read-only by default)",
    type: "boolean",
    default: false,
  });

  function persist(): void {
    pi.appendEntry(STATE_ENTRY_TYPE, state);
  }

  function updateUi(ctx: ExtensionContext): void {
    if (!state.enabled) {
      clearUi(ctx);
      return;
    }

    const ready = state.awaitingAction || Boolean(state.latestPlan);
    ctx.ui.setStatus(STATUS_KEY, ready ? "plan ready" : "plan active");
    ctx.ui.setWidget(
      WIDGET_KEY,
      ready
        ? ["Proposed plan ready", "Use /plan to implement, revise, or exit Plan mode."]
        : ["Plan mode: planning", "Produce a <proposed_plan> block."],
    );
  }

  function clearUi(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  }

  function activatePlanModeTools(): void {
    if (previousTools === undefined) {
      previousTools = safeGetActiveTools(pi);
    }
    pi.setActiveTools(planModeToolNames(state.selectedToolNames));
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
    savePlanSession = undefined;
    state = exitPlanMode(state);
    restoreTools();
    persist();
    updateUi(ctx);
  }

  function sendPlanModeMessage(content: string, ctx: ExtensionContext): void {
    pi.sendUserMessage(content, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
  }

  function applyModeTransition(transition: PendingModeTransition, ctx: ExtensionContext): void {
    if (transition.enabled !== state.enabled) {
      if (transition.enabled) doEnter(ctx);
      else doExit(ctx);
    }

    if (transition.consumePlan) {
      state = { ...state, latestPlan: undefined, awaitingAction: false };
      persist();
      updateUi(ctx);
    }

    if (transition.prompt) sendPlanModeMessage(transition.prompt, ctx);
  }

  function requestModeTransition(
    transition: PendingModeTransition,
    ctx: ExtensionContext,
  ): boolean {
    if (ctx.isIdle()) {
      pendingModeTransition = undefined;
      applyModeTransition(transition, ctx);
      return true;
    }

    const waitForIdle = (ctx as Partial<ExtensionCommandContext>).waitForIdle;
    if (typeof waitForIdle !== "function" && !transition.applyOnSettled) {
      ctx.ui.notify("Plan mode change is unavailable until Pi is idle.", "warning");
      return false;
    }

    pendingModeTransition = transition;
    if (typeof waitForIdle === "function") {
      void waitForIdle.call(ctx).then(() => {
        if (pendingModeTransition !== transition) return;
        pendingModeTransition = undefined;
        applyModeTransition(transition, ctx);
      });
    }
    ctx.ui.notify("Plan mode change queued until Pi is idle.", "info");
    return false;
  }

  async function runToolSelector(ctx: ExtensionContext): Promise<void> {
    if (!ctx.isIdle()) {
      ctx.ui.notify("Plan-mode tool configuration is unavailable while Pi is busy.", "warning");
      return;
    }
    const allTools = safeGetAllTools(pi);
    const selections = await ctx.ui.custom<string[] | null>((_tui, theme, _keybindings, done) =>
      createToolSelectorComponent({
        tools: allTools,
        previousSelections: state.selectedToolNames ?? undefined,
        theme: {
          fg: (color: string, text: string) => theme.fg(color as never, text),
          bold: (text: string) => theme.bold(text),
          dim: (text: string) => theme.fg("dim" as never, text),
        },
        done,
      }),
    );

    if (selections === null) {
      ctx.ui.notify("No changes to Plan-mode tools.", "info");
      return;
    }
    state = { ...state, selectedToolNames: selections };
    activatePlanModeTools();
    persist();

    void writeSelectedToolNames(selections, allTools);

    const count = selections.length;
    const msg =
      count === 0
        ? "Plan-mode tools reset to defaults."
        : `Plan-mode tools updated: ${count} optional tool(s) enabled.`;
    ctx.ui.notify(msg, "info");
  }

  async function handleMenuAction(action: PlanMenuAction, ctx: ExtensionContext): Promise<void> {
    switch (action) {
      case "implement": {
        if (!state.latestPlan) {
          ctx.ui.notify("No latest plan is available to implement.", "warning");
          break;
        }
        if (
          requestModeTransition(
            { enabled: false, prompt: "Implement the plan.", consumePlan: true },
            ctx,
          )
        ) {
          ctx.ui.notify("Implementing plan. Full access restored.", "info");
        }
        break;
      }
      case "save":
        if (!state.latestPlan) {
          ctx.ui.notify("No latest plan is available to save.", "warning");
          break;
        }
        if (!ctx.isIdle()) {
          ctx.ui.notify("Save plan is unavailable while the agent is busy.", "warning");
          break;
        }
        savePlanSession = createSavePlanSession(state.latestPlan, ctx.cwd);
        pi.setActiveTools(savePlanSession.toolNames());
        sendPlanModeMessage(savePlanSession.userPrompt, ctx);
        break;
      case "exit":
        if (requestModeTransition({ enabled: false }, ctx)) {
          ctx.ui.notify("Plan mode disabled.", "info");
        }
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
          if (requestModeTransition({ enabled: true, prompt: command }, ctx)) {
            ctx.ui.notify("Plan mode enabled.", "info");
          }
          return;
        }
        sendPlanModeMessage(command, ctx);
        return;
      }

      if (!state.enabled || pendingModeTransition?.enabled === false) {
        if (requestModeTransition({ enabled: true }, ctx)) {
          ctx.ui.notify("Plan mode enabled.", "info");
        }
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
      if (requestModeTransition({ enabled: false }, ctx)) {
        ctx.ui.notify("Plan mode disabled.", "info");
      }
    },
  });

  pi.registerCommand("plan:tools", {
    description: "Configure plan mode tools",
    handler: async (_args, ctx) => {
      clearPendingMenu();
      if (!ctx.isIdle()) {
        await runToolSelector(ctx);
        return;
      }
      if (!state.enabled) {
        doEnter(ctx);
        ctx.ui.notify("Plan mode enabled.", "info");
      }
      await runToolSelector(ctx);
    },
  });

  pi.registerShortcut(Key.ctrlAlt("p"), {
    description: "Toggle Plan mode",
    handler: async (ctx) => {
      clearPendingMenu();
      const current = pendingModeTransition?.enabled ?? state.enabled;
      const enabled = !current;
      if (requestModeTransition({ enabled, applyOnSettled: true }, ctx)) {
        ctx.ui.notify(enabled ? "Plan mode enabled." : "Plan mode disabled.", "info");
      }
    },
  });

  pi.on("tool_call", async (event, _ctx) => {
    if (!state.enabled) return;

    if (savePlanSession !== undefined) {
      if (event.toolName === "write") {
        const result = savePlanSession.authorizeToolCall(event);
        pi.setActiveTools(savePlanSession.toolNames());
        return result;
      }
      if (event.toolName === "edit") {
        return {
          block: true,
          reason: "Save plan does not allow 'edit'. Use only the approved write call.",
        };
      }
    } else if (isPlanMutationToolName(event.toolName)) {
      const selected = state.selectedToolNames ?? [];
      if (!selected.includes(event.toolName)) {
        return {
          block: true,
          reason: `Plan mode blocks '${event.toolName}'. Enable it with /plan:tools, or exit plan mode first with /plan:exit.`,
        };
      }
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

  pi.on("tool_execution_end", async (event) => {
    if (event.toolName !== "write" || savePlanSession === undefined) return;
    savePlanSession.recordToolExecution(event);
    pi.setActiveTools(savePlanSession.toolNames());
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (state.enabled && savePlanSession !== undefined) {
      pi.setActiveTools(savePlanSession.toolNames());
      return savePlanSession.beforeAgentStart(event);
    }

    if (state.latestPlan !== undefined || state.awaitingAction) {
      state = { ...state, latestPlan: undefined, awaitingAction: false };
      persist();
      updateUi(ctx);
    }

    if (!state.enabled) return;

    pi.setActiveTools(planModeToolNames(state.selectedToolNames));
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPlanModePrompt(state.selectedToolNames)}`,
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!state.enabled) return;
    if (savePlanSession !== undefined) return;
    const plan = captureProposedPlan(event.messages);
    if (!plan) return;
    state = { ...state, latestPlan: plan, awaitingAction: true };
    persist();
    updateUi(ctx);
    clearPendingMenu();
    pendingMenuTimer = setTimeout(
      () =>
        void showPlanReadyMenu(ctx, state)
          .then((action) => handleMenuAction(action, ctx))
          .catch(() => {}),
      0,
    );
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (savePlanSession !== undefined) {
      const didSave = savePlanSession.saved();
      savePlanSession = undefined;
      if (state.enabled) {
        pi.setActiveTools(planModeToolNames(state.selectedToolNames));
      }
      if (!didSave) {
        ctx.ui.notify("Save plan failed or was not completed.", "warning");
      }
    }

    const transition = pendingModeTransition?.applyOnSettled ? pendingModeTransition : undefined;
    if (transition !== undefined) {
      pendingModeTransition = undefined;
      applyModeTransition(transition, ctx);
    }
  });

  pi.on("context", async (event) => {
    return filterLegacyProposedPlanMessages(event.messages);
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    state = restoreState(entries);

    if (pi.getFlag("plan") === true) {
      state = enterPlanMode(state);
    }

    const selectedToolNames = await readSelectedToolNames();
    if (selectedToolNames !== undefined) {
      state = { ...state, selectedToolNames };
    }

    if (state.enabled) {
      activatePlanModeTools();
    }
    updateUi(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearPendingMenu();
    pendingModeTransition = undefined;
    if (savePlanSession !== undefined && state.enabled) {
      pi.setActiveTools(planModeToolNames(state.selectedToolNames));
    }
    savePlanSession = undefined;
    persist();
    clearUi(ctx);
  });
}
