import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import {
  captureProposedPlan,
  sanitizePlanModeContext,
} from "./core/context.ts";
import { buildPlanModePrompt } from "./core/prompt.ts";
import { isSafeCommand } from "./core/safety.ts";
import { createInitialState, enterPlanMode, exitPlanMode, restoreState } from "./core/state.ts";
import {
  normalModeToolNames,
  planModeToolNames,
  readSelectedToolNames,
  safeGetActiveTools,
  safeGetAllTools,
  savePlanToolNames,
  writeSelectedToolNames,
} from "./core/tools.ts";
import {
  STATE_ENTRY_TYPE,
  STATUS_KEY,
  WIDGET_KEY,
} from "./shared/constants.ts";
import type { PlanModeState } from "./shared/types.ts";
import { type PlanMenuAction, showPlanMenu, showPlanReadyMenu } from "./tui/menus.ts";
import { createToolSelectorComponent } from "./tui/tool-selector.ts";

export default function createExtension(pi: ExtensionAPI): void {
  let state: PlanModeState = createInitialState();
  let previousTools: string[] | undefined;
  let pendingMenuTimer: ReturnType<typeof setTimeout> | undefined;
  let planToSave: string | undefined;
  let planWriteCallId: string | undefined;
  let planSaveSucceeded = false;

  pi.registerFlag("plan", {
    description: "Start in plan mode (read-only exploration)",
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
        ? [
            "Proposed plan ready",
            "Use /plan to implement, revise, or exit Plan mode.",
          ]
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

  function clearPlanSaveState(): void {
    planToSave = undefined;
    planWriteCallId = undefined;
    planSaveSucceeded = false;
  }

  function activatePlanSaveTools(): void {
    pi.setActiveTools(savePlanToolNames(planWriteCallId === undefined && !planSaveSucceeded));
  }

  function blockPlanSave(reason: string): { block: true; reason: string } {
    return { block: true, reason };
  }

  function doEnter(ctx: ExtensionContext): void {
    state = enterPlanMode(state);
    activatePlanModeTools();
    persist();
    updateUi(ctx);
  }

  function doExit(ctx: ExtensionContext): void {
    clearPendingMenu();
    clearPlanSaveState();
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

    void writeSelectedToolNames(selections, allTools);

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
        doExit(ctx);
        if (plan) {
          state = { ...state, latestPlan: undefined, awaitingAction: false };
          persist();
          sendPlanModeMessage(
            `Plan mode is now disabled. Full tool access is restored. Implement this proposed plan now:\n\n${plan}`,
            ctx,
          );
        }
        ctx.ui.notify("Implementing plan. Full access restored.", "info");
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
        clearPlanSaveState();
        planToSave = state.latestPlan;
        activatePlanSaveTools();
        sendPlanModeMessage(
          `Save the current proposed plan. Choose a new lowercase .md filename in the workspace root ${ctx.cwd}. Prefix the filename with today's date followed by a hyphen (YYYY-MM-DD-); use date +%F if needed. Pass only the filename as a relative workspace path; do not use an absolute path or a subdirectory. Write exactly the plan below to that file. Do not add leading or trailing whitespace, including a trailing newline. Make no other changes.\n\n${planToSave}`,
          ctx,
        );
        break;
      case "exit":
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

  pi.on("tool_call", async (event, ctx) => {
    if (!state.enabled) return;

    if (event.toolName === "write") {
      if (planToSave === undefined || planWriteCallId !== undefined || planSaveSucceeded) {
        return blockPlanSave("Plan mode blocks 'write'. Exit plan mode first with /plan:exit.");
      }

      const input =
        typeof event.input === "object" && event.input !== null
          ? (event.input as Record<string, unknown>)
          : undefined;
      if (input === undefined) {
        return blockPlanSave("Save plan requires an input object with path and content.");
      }

      const content = input.content;
      if (typeof content !== "string" || content !== planToSave) {
        return blockPlanSave("Save plan requires the exact captured plan content.");
      }

      const filePath = typeof input.path === "string" ? input.path : undefined;
      if (filePath === undefined) {
        return blockPlanSave("Save plan requires a string file path.");
      }

      if (
        filePath.startsWith("/") ||
        filePath.startsWith("~") ||
        filePath.startsWith("@") ||
        filePath.startsWith("file:") ||
        /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/u.test(filePath) ||
        filePath.split("/").includes("..")
      ) {
        return blockPlanSave("Save plan path must be a normal relative workspace path.");
      }

      if (!/^[a-z0-9_./-]+\.md$/.test(filePath)) {
        return blockPlanSave("Save plan path must be a lowercase .md file.");
      }

      try {
        const workspaceRoot = realpathSync(ctx.cwd);
        const targetPath = resolve(workspaceRoot, filePath);
        const parentPath = dirname(targetPath);
        const parentRealPath = realpathSync(parentPath);
        const parentStats = lstatSync(parentRealPath, { throwIfNoEntry: false });
        if (!parentStats?.isDirectory()) {
          return blockPlanSave("Save plan parent directory must already exist.");
        }

        const parentRelative = relative(workspaceRoot, parentRealPath);
        if (parentRelative === ".." || parentRelative.startsWith(`..${sep}`)) {
          return blockPlanSave("Save plan path must stay inside the workspace.");
        }

        const targetStats = lstatSync(targetPath, { throwIfNoEntry: false });
        // ponytail: preflight existence check is not atomic; use an exclusive-create save tool if concurrent no-clobber becomes required.
        if (targetStats !== undefined) {
          return blockPlanSave("Save plan target must not already exist.");
        }
      } catch {
        return blockPlanSave("Save plan path must be an existing directory inside the workspace.");
      }

      Object.freeze(input);
      planWriteCallId = event.toolCallId;
      activatePlanSaveTools();
      return;
    }

    if (event.toolName === "edit") {
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

  pi.on("tool_execution_end", async (event) => {
    if (event.toolName !== "write" || event.toolCallId !== planWriteCallId) return;

    planWriteCallId = undefined;
    if (event.isError) {
      activatePlanSaveTools();
    } else {
      planSaveSucceeded = true;
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (state.enabled && planToSave !== undefined) {
      activatePlanSaveTools();
      return {
        systemPrompt: `${event.systemPrompt}\n\n${buildPlanModePrompt()}\n\n[PLAN SAVE TURN]\nUse only one approved write call for the exact captured plan. Do not edit, implement, or modify any other file.`,
      };
    }

    if (!state.enabled) {
      const plan = state.latestPlan;
      if (!plan) return;
      state = { ...state, latestPlan: undefined, awaitingAction: false };
      persist();
      updateUi(ctx);
      return {
        systemPrompt: `${event.systemPrompt}\n\n[PLAN HANDOFF]\nThe latest proposed plan is available for this turn as context. Follow the current user request; do not implement the plan unless asked.\n\n${plan}`,
      };
    }
    pi.setActiveTools(planModeToolNames(state.selectedToolNames));
    state = { ...state, latestPlan: undefined, awaitingAction: false };
    updateUi(ctx);
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPlanModePrompt()}`,
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!state.enabled) return;
    if (planToSave !== undefined) return;
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
    if (planToSave === undefined) return;
    const didSave = planSaveSucceeded;
    clearPlanSaveState();
    if (state.enabled) {
      pi.setActiveTools(planModeToolNames(state.selectedToolNames));
    }
    if (!didSave) {
      ctx.ui.notify("Save plan failed or was not completed.", "warning");
    }
  });

  pi.on("context", async (event) => {
    return sanitizePlanModeContext(event.messages, state.enabled);
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
    if (planToSave !== undefined && state.enabled) {
      pi.setActiveTools(planModeToolNames(state.selectedToolNames));
    }
    clearPlanSaveState();
    persist();
    clearUi(ctx);
  });
}
