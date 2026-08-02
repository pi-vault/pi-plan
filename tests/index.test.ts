import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentEndEvent } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import createExtension from "../src/index.ts";
import { PLAN_MENU_LABELS } from "../src/tui/menus.ts";
import { createMockContext, createMockPi } from "./helpers.ts";

type AssistantMessage = Extract<AgentEndEvent["messages"][number], { role: "assistant" }>;

function assistantText(
  text: string,
): Pick<AssistantMessage, "role" | "content"> {
  return { role: "assistant", content: [{ type: "text", text }] };
}

describe("createExtension", () => {
  it("registers the plan flag", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.flags.has("plan")).toBe(true);
    expect(mock.flags.get("plan")?.type).toBe("boolean");
  });

  it("registers plan, plan:exit, and plan:tools commands", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.commands.has("plan")).toBe(true);
    expect(mock.commands.has("plan:exit")).toBe(true);
    expect(mock.commands.has("plan:tools")).toBe(true);
  });

  it("registers session_start, session_shutdown, tool_call, tool_execution_end, and before_agent_start handlers", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.events.has("session_start")).toBe(true);
    expect(mock.events.has("session_shutdown")).toBe(true);
    expect(mock.events.has("tool_call")).toBe(true);
    expect(mock.events.has("tool_execution_end")).toBe(true);
    expect(mock.events.has("before_agent_start")).toBe(true);
  });
});

describe("/plan command", () => {
  it("toggles plan mode on", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.notifications.some((n) => n.message.includes("enabled"))).toBe(true);
  });

  it("shows plan menu when /plan is run in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on
    await handler("", ctx.ctx); // menu

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.selectCalls).toHaveLength(1);
  });

  it("warns and does nothing for stale Save plan menu action without a latest plan", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.save] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on
    await handler("", ctx.ctx); // menu

    expect(mock.userMessages).toHaveLength(0);
    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(
      ctx.notifications.some(
        (n) => n.type === "warning" && n.message.includes("latest plan"),
      ),
    ).toBe(true);
  });

  it("warns and does nothing for stale Save plan menu action while busy", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ isIdle: false, selectResponses: [PLAN_MENU_LABELS.save] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# Plan\n</proposed_plan>"),
        ],
      },
      ctx,
    );

    await handler("", ctx.ctx); // stale save action
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mock.userMessages).toHaveLength(0);
    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
    expect(
      ctx.notifications.some((n) => n.type === "warning" && n.message.includes("busy")),
    ).toBe(
      true,
    );
  });

  it("treats any args as a prompt", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("exit", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content).toBe("exit");
  });
});

describe("/plan:exit command", () => {
  it("exits plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // on
    await mock.commands.get("plan:exit")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
  });

  it("is a no-op when plan mode is already off", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan:exit")!.handler("", ctx.ctx);
    expect(ctx.notifications.some((n) => n.message.includes("disabled"))).toBe(true);
  });

  it("does not prompt when a plan exists", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter plan mode

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# Plan\n</proposed_plan>"),
        ],
      },
      ctx,
    );

    await mock.commands.get("plan:exit")!.handler("", ctx.ctx);

    expect(ctx.inputCalls).toHaveLength(0);
  });
});

describe("tool management", () => {
  it("switches to plan-mode tools on enter", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
    });
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).toContain("bash");
    expect(mock.activeTools).toContain("grep");
    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
  });

  it("restores previous tools on exit", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write", "custom"],
    });
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // on
    await mock.commands.get("plan:exit")!.handler("", ctx.ctx); // off

    expect(mock.activeTools).toContain("edit");
    expect(mock.activeTools).toContain("write");
    expect(mock.activeTools).toContain("custom");
  });

  it("re-applies plan-mode tools on before_agent_start", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enable

    mock.pi.setActiveTools(["read", "bash", "edit", "write"]);
    expect(mock.activeTools).toContain("edit");

    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "" },
      ctx,
    );

    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).toContain("bash");
  });

  it("does not modify tools on before_agent_start when plan mode is off", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
    });
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "" },
      ctx,
    );

    expect(mock.activeTools).toContain("edit");
    expect(mock.activeTools).toContain("write");
  });
});

describe("tool_call blocking", () => {
  it("blocks edit tool in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "tool_call",
      { type: "tool_call", toolCallId: "1", toolName: "edit", input: {} },
      ctx,
    );
    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("blocks ordinary write tool in plan mode outside a save turn", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "tool_call",
      { type: "tool_call", toolCallId: "1", toolName: "write", input: {} },
      ctx,
    );
    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("blocks unsafe bash commands in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "1",
        toolName: "bash",
        input: { command: "rm -rf /" },
      },
      ctx,
    );
    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("allows safe bash commands in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "1",
        toolName: "bash",
        input: { command: "cat file.ts" },
      },
      ctx,
    );
    expect(result).toBeUndefined();
  });

  it("does not block tools when plan mode is off", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "tool_call",
      { type: "tool_call", toolCallId: "1", toolName: "edit", input: {} },
      ctx,
    );
    expect(result).toBeUndefined();
  });
});

describe("write save preflight", () => {
  function setupSavePlan(plan = "# Saved Plan\n") {
    const workspace = mkdtempSync(join(tmpdir(), "pi-plan-write-"));
    mkdirSync(join(workspace, "docs"), { recursive: true });
    const capturedPlan = plan.trim();

    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ cwd: workspace, selectResponses: [PLAN_MENU_LABELS.save] });

    const startSave = async () => {
      await mock.commands.get("plan")!.handler("", ctx.ctx);
      await mock.fireEvent(
        "agent_end",
        {
          type: "agent_end",
          messages: [assistantText(`<proposed_plan>\n${plan}</proposed_plan>`)],
        },
        ctx,
      );
      await mock.commands.get("plan")!.handler("", ctx.ctx);
    };

    tempDirs.push(workspace);
    return { mock, ctx, plan: capturedPlan, startSave };
  }

  const tempDirs: string[] = [];

  afterEach(() => {
    for (const path of tempDirs.splice(0)) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it("does not call later tool handlers after Save blocks a write", async () => {
    const test = setupSavePlan();
    await test.startSave();
    let laterHandlerCalled = false;
    test.mock.pi.on("tool_call", async () => {
      laterHandlerCalled = true;
    });

    await test.mock.fireEvent(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "write-blocked",
        toolName: "write",
        input: { path: "docs/plan.md", content: "changed" },
      },
      test.ctx,
    );

    expect(laterHandlerCalled).toBe(false);
  });

  it("keeps unsafe bash blocked while Save is active", async () => {
    const test = setupSavePlan();
    await test.startSave();

    expect(
      await test.mock.fireEvent(
        "tool_call",
        {
          type: "tool_call",
          toolCallId: "bash-save",
          toolName: "bash",
          input: { command: "touch docs/other.md" },
        },
        test.ctx,
      ),
    ).toEqual(expect.objectContaining({ block: true }));
  });

  it("freezes write input before later handlers can mutate it", async () => {
    const test = setupSavePlan();
    await test.startSave();

    let frozen = false;
    let contentAfter = "";
    test.mock.pi.on("tool_call", async (event) => {
      const input = (event as { input: { content: string } }).input;
      frozen = Object.isFrozen(input);
      try {
        input.content = "changed";
      } catch {
        // expected in strict mode
      }
      contentAfter = input.content;
    });

    await test.mock.fireEvent(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "write-frozen",
        toolName: "write",
        input: { path: "docs/plan.md", content: test.plan },
      },
      test.ctx,
    );

    expect(frozen).toBe(true);
    expect(contentAfter).toBe(test.plan);
  });

  it("re-enables write after a later handler blocks and tool_execution_end arrives", async () => {
    const test = setupSavePlan();
    await test.startSave();

    test.mock.pi.on("tool_call", async () => ({ block: true, reason: "later block" }));

    const result = await test.mock.fireEvent(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "write-blocked-later",
        toolName: "write",
        input: { path: "docs/plan.md", content: test.plan },
      },
      test.ctx,
    );

    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(test.mock.activeTools).not.toContain("write");

    await test.mock.fireEvent(
      "tool_execution_end",
      {
        type: "tool_execution_end",
        toolCallId: "write-blocked-later",
        toolName: "write",
        result: undefined,
        isError: true,
      },
      test.ctx,
    );

    expect(test.mock.activeTools).toContain("write");
  });

  it("keeps write disabled after successful tool_execution_end and finishes without the failure notification", async () => {
    const test = setupSavePlan();
    await test.startSave();

    const result = await test.mock.fireEvent(
      "tool_call",
      {
        type: "tool_call",
        toolCallId: "write-success",
        toolName: "write",
        input: { path: "docs/plan.md", content: test.plan },
      },
      test.ctx,
    );

    expect(result).toBeUndefined();

    await test.mock.fireEvent(
      "tool_execution_end",
      {
        type: "tool_execution_end",
        toolCallId: "write-success",
        toolName: "write",
        result: { ok: true },
        isError: false,
      },
      test.ctx,
    );

    expect(test.mock.activeTools).not.toContain("write");

    await test.mock.fireEvent("agent_settled", { type: "agent_settled" }, test.ctx);

    expect(test.mock.activeTools).not.toContain("write");
    expect(
      test.ctx.notifications.some((n) => n.type === "warning" && n.message.includes("Save plan failed")),
    ).toBe(false);
    expect(test.ctx.statuses.get("pi-plan")).toBe("plan ready");
  });
});

describe("session persistence", () => {
  it("persists state on enter and exit", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on
    await mock.commands.get("plan:exit")!.handler("", ctx.ctx); // off

    const planEntries = mock.entries.filter((e) => e.customType === "plan-mode-state");
    expect(planEntries.length).toBeGreaterThanOrEqual(2);
  });

  it("restores enabled state from session_start", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      entries: [
        {
          type: "custom",
          customType: "plan-mode-state",
          data: { enabled: true },
          id: "1",
          parentId: null,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    await mock.fireEvent("session_start", { type: "session_start", reason: "resume" }, ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
  });

  it("activates plan mode from --plan flag", async () => {
    const mock = createMockPi();
    mock.flagValues.set("plan", true);
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.fireEvent("session_start", { type: "session_start", reason: "startup" }, ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("clears UI on session_shutdown", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enable
    expect(ctx.statuses.get("pi-plan")).toBe("plan active");

    await mock.fireEvent("session_shutdown", { type: "session_shutdown", reason: "quit" }, ctx);

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
  });

  it("uses valid JSON selections over restored session selections on session_start", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pi-plan-config-"));
    const configDir = join(tempDir, "extensions");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "plan-tools.json"),
      JSON.stringify({ read: true, bash: true, custom_tool: true, edit: false }),
    );

    const originalEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tempDir;

    try {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext({
        entries: [
          {
            type: "custom",
            customType: "plan-mode-state",
            data: { enabled: true, selectedToolNames: ["session-only"] },
            id: "1",
            parentId: null,
            timestamp: new Date().toISOString(),
          },
        ],
      });

      await mock.fireEvent("session_start", { type: "session_start", reason: "resume" }, ctx);

      expect(mock.activeTools).toContain("custom_tool");
      expect(mock.activeTools).toContain("read");
      expect(mock.activeTools).not.toContain("session-only");
      expect(mock.activeTools).not.toContain("edit");
    } finally {
      if (originalEnv !== undefined) {
        process.env.PI_CODING_AGENT_DIR = originalEnv;
      } else {
        delete process.env.PI_CODING_AGENT_DIR;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("writes tool config to file when tool selector saves", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pi-plan-config-"));
    const originalEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tempDir;

    try {
      const mock = createMockPi({
        allTools: [
          { name: "read", description: "Read", sourceInfo: { source: "builtin" } },
          { name: "bash", description: "Bash", sourceInfo: { source: "builtin" } },
          { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
        ],
      });
      createExtension(mock.pi);

      const ctx = createMockContext({ customResult: ["my-tool"] });
      await mock.commands.get("plan")!.handler("", ctx.ctx); // enter plan mode
      await mock.commands.get("plan:tools")!.handler("", ctx.ctx); // select my-tool

      // Wait for async write to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      const configPath = join(tempDir, "extensions", "plan-tools.json");
      expect(existsSync(configPath)).toBe(true);
      const written = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(written.read).toBe(true);
      expect(written.bash).toBe(true);
      expect(written["my-tool"]).toBe(true);
    } finally {
      if (originalEnv !== undefined) {
        process.env.PI_CODING_AGENT_DIR = originalEnv;
      } else {
        delete process.env.PI_CODING_AGENT_DIR;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("before_agent_start", () => {
  it("injects a pending plan once after restoring disabled state", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      entries: [
        {
          type: "custom",
          customType: "plan-mode-state",
          data: { enabled: false, latestPlan: "# Restored Plan", awaitingAction: true },
          id: "1",
          parentId: null,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    await mock.fireEvent("session_start", { type: "session_start", reason: "resume" }, ctx);

    const first = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );
    expect((first as { systemPrompt: string }).systemPrompt).toContain("base prompt");
    expect((first as { systemPrompt: string }).systemPrompt).toContain("[PLAN HANDOFF]");
    expect((first as { systemPrompt: string }).systemPrompt).toContain(
      "The latest proposed plan is available for this turn as context. Follow the current user request; do not implement the plan unless asked.",
    );
    expect((first as { systemPrompt: string }).systemPrompt).toContain("# Restored Plan");

    const second = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );
    expect(second).toBeUndefined();

    const persisted = mock.entries.filter((entry) => entry.customType === "plan-mode-state");
    expect(persisted.at(-1)?.data).toMatchObject({ latestPlan: undefined, awaitingAction: false });
  });

  it("discards a pending plan when /plan re-enters plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      entries: [
        {
          type: "custom",
          customType: "plan-mode-state",
          data: { enabled: false, latestPlan: "# Pending Plan", awaitingAction: true },
          id: "1",
          parentId: null,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    await mock.fireEvent("session_start", { type: "session_start", reason: "resume" }, ctx);
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );
    const { systemPrompt } = result as { systemPrompt: string };
    expect(systemPrompt).toContain("[PLAN MODE ACTIVE]");
    expect(systemPrompt).not.toContain("[PLAN HANDOFF]");
    expect(systemPrompt).not.toContain("# Pending Plan");
  });

  it("injects plan mode prompt when plan mode is enabled", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );

    expect(result).toBeDefined();
    const { systemPrompt } = result as { systemPrompt: string };
    expect(systemPrompt).toContain("base prompt");
    expect(systemPrompt).toContain("[PLAN MODE ACTIVE]");
  });

  it("leaves the prompt unchanged when disabled with no pending plan", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );

    expect(result).toBeUndefined();
  });

  it("re-applies plan mode tools each turn", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
    });
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    mock.pi.setActiveTools([...mock.activeTools, "custom-editor"]);

    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base" },
      ctx,
    );

    expect(mock.activeTools).not.toContain("custom-editor");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("clears stale plan state for new turn", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "<proposed_plan>\n# Plan\n</proposed_plan>" }],
          },
        ],
      },
      ctx,
    );
    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");

    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base" },
      ctx,
    );
    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
  });
});

describe("agent_end", () => {
  it("detects proposed plan and sets status to plan ready", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          { role: "user", content: "make a plan" },
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Here is my plan:\n<proposed_plan>\n# My Plan\n## Summary\nDo stuff\n</proposed_plan>",
              },
            ],
          },
        ],
      },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
    expect(
      mock.messages.some(
        (m) => (m.message as { customType?: unknown }).customType === "proposed-plan",
      ),
    ).toBe(false);
  });

  it("does nothing when plan mode is off", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "<proposed_plan>\n# Plan\n</proposed_plan>" }],
          },
        ],
      },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
  });

  it("does nothing when no proposed plan in messages", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [{ role: "assistant", content: [{ type: "text", text: "Just some text, no plan yet." }] }],
      },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
  });

  it("persists state when plan is detected", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const entriesBefore = mock.entries.filter((e) => e.customType === "plan-mode-state").length;

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "<proposed_plan>\n# Plan\n</proposed_plan>" }],
          },
        ],
      },
      ctx,
    );

    const entriesAfter = mock.entries.filter((e) => e.customType === "plan-mode-state").length;
    expect(entriesAfter).toBeGreaterThan(entriesBefore);
  });
});

describe("context handler", () => {
  it.each([false, true])(
    "preserves assistant plans and filters legacy duplicates when enabled=%s",
    async (enabled) => {
      const mock = createMockPi();
      createExtension(mock.pi);
      const ctx = createMockContext();
      if (enabled) await mock.commands.get("plan")!.handler("", ctx.ctx);
      const assistantPlan = {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "<proposed_plan>\n# Plan\n</proposed_plan>" }],
      };

      const result = await mock.fireEvent(
        "context",
        {
          type: "context",
          messages: [
            { role: "user", content: "plan this" },
            {
              role: "custom",
              customType: "proposed-plan",
              content: "legacy duplicate",
              display: true,
              timestamp: 0,
            },
            assistantPlan,
          ],
        },
        ctx,
      );

      expect(result).toEqual({
        messages: [{ role: "user", content: "plan this" }, assistantPlan],
      });
    },
  );

  it("returns undefined for clean context", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    expect(
      await mock.fireEvent(
        "context",
        { type: "context", messages: [{ role: "user", content: "hello" }] },
        ctx,
      ),
    ).toBeUndefined();
  });
});

describe("Plan mode UI", () => {
  async function restoreUiState(latestPlan: string | undefined, awaitingAction: boolean) {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      entries: [
        {
          type: "custom",
          customType: "plan-mode-state",
          data: { enabled: true, latestPlan, awaitingAction },
          id: "ui-state",
          parentId: null,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    await mock.fireEvent(
      "session_start",
      { type: "session_start", reason: "resume" },
      ctx,
    );
    return ctx;
  }

  it("shows active UI when enabled without a plan", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.widgets.get("pi-plan")).toEqual([
      "Plan mode: planning",
      "Produce a <proposed_plan> block.",
    ]);
  });

  it.each([
    ["latestPlan", "# Plan", false],
    ["awaitingAction", undefined, true],
  ] as const)("shows ready UI from %s", async (_source, latestPlan, awaitingAction) => {
    const ctx = await restoreUiState(latestPlan, awaitingAction);

    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
    expect(ctx.widgets.get("pi-plan")).toEqual([
      "Proposed plan ready",
      "Use /plan to implement, revise, or exit Plan mode.",
    ]);
  });

  it("keeps a restored empty plan active", async () => {
    const ctx = await restoreUiState("", false);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.widgets.get("pi-plan")).toEqual([
      "Plan mode: planning",
      "Produce a <proposed_plan> block.",
    ]);
  });

  it("clears both UI values on exit", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan:exit")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(ctx.widgets.get("pi-plan")).toBeUndefined();
  });
});

describe("plan menu actions", () => {
  it("implement: exits plan mode and sends implementation message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS.implement],
    });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText(
            "<proposed_plan>\n# My Plan\n## Summary\nBuild the thing\n</proposed_plan>",
          ),
        ],
      },
      ctx,
    );

    await handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content).toBe(
      "Plan mode is now disabled. Full tool access is restored. Implement this proposed plan now:\n\n# My Plan\n## Summary\nBuild the thing",
    );
    expect(ctx.inputCalls).toHaveLength(0);
    const persisted = mock.entries.filter((entry) => entry.customType === "plan-mode-state");
    expect(persisted.at(-1)?.data).toMatchObject({ latestPlan: undefined, awaitingAction: false });
  });

  it("implement: queues the full plan as a follow-up when busy", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      isIdle: false,
      selectResponses: [PLAN_MENU_LABELS.implement],
    });
    const plan = "# Queued Plan\n\n## Details\nKeep every line.";

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [assistantText(`<proposed_plan>\n${plan}\n</proposed_plan>`)],
      },
      ctx,
    );
    await handler("", ctx.ctx);

    expect(mock.userMessages[0].content).toContain(plan);
    expect(mock.userMessages[0].options).toEqual({ deliverAs: "followUp" });
    const persisted = mock.entries.filter((entry) => entry.customType === "plan-mode-state");
    expect(persisted.at(-1)?.data).toMatchObject({ latestPlan: undefined, awaitingAction: false });
  });

  it("exit: exits plan mode without sending message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.exit] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# Plan\n</proposed_plan>"),
        ],
      },
      ctx,
    );
    await handler("", ctx.ctx); // show menu, select exit

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(0);
    expect(ctx.inputCalls).toHaveLength(0);
  });

  it("stay: keeps plan mode active", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);
    await handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.userMessages).toHaveLength(0);
  });

  it("show-plan: notifies with plan content", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS["show-plan"]],
    });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# My Plan\n</proposed_plan>"),
        ],
      },
      ctx,
    );

    await handler("", ctx.ctx);

    expect(ctx.notifications.some((n) => n.message.includes("# My Plan"))).toBe(true);
  });

});

describe("/plan <prompt>", () => {
  it("enters plan mode and sends the prompt as a user message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("Add dark mode support", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content).toBe("Add dark mode support");
  });

  it("stays in plan mode and sends prompt if already in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter
    await handler("Now explore the auth module", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content).toBe("Now explore the auth module");
  });
});

describe("agent_end auto-show menu", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-shows plan-ready menu and processes action after plan detection", async () => {
    vi.useFakeTimers();
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS.implement],
    });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText(
            "<proposed_plan>\n# Auto Plan\n## Summary\nDo the thing\n</proposed_plan>",
          ),
        ],
      },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");

    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.selectCalls).toHaveLength(1);
    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content as string).toContain("# Auto Plan");
  });

  it("cancels auto-menu when user manually invokes /plan first", async () => {
    vi.useFakeTimers();
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# Plan\n</proposed_plan>"),
        ],
      },
      ctx,
    );

    await handler("", ctx.ctx);

    expect(ctx.selectCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.selectCalls).toHaveLength(1);
  });
});

describe("/plan:tools command", () => {
  it("opens tool selector when invoked", async () => {
    const mock = createMockPi({
      allTools: [
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({ customResult: null });

    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.customCalls).toHaveLength(1);
  });

  it("enters plan mode when running /plan:tools while not in plan mode", async () => {
    const mock = createMockPi({
      allTools: [
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({ customResult: null });

    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.notifications.some((n) => n.message.includes("enabled"))).toBe(true);
  });

  it("applies selections when tool selector returns names", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
      allTools: [
        {
          name: "my-search",
          description: "Search",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({ customResult: ["my-search"] });

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);

    expect(mock.activeTools).toContain("my-search");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("notifies no changes when tool selector returns null", async () => {
    const mock = createMockPi({
      allTools: [
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({ customResult: null });

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);

    expect(ctx.notifications.some((n) => n.message.includes("No changes"))).toBe(true);
  });

  it("tools action from plan menu calls tool selector", async () => {
    const mock = createMockPi({
      allTools: [
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);

    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS.tools],
      customResult: null,
    });
    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan")!.handler("", ctx.ctx); // menu -> tools

    expect(ctx.selectCalls).toHaveLength(1);
    expect(ctx.customCalls).toHaveLength(1);
  });

  it("preserves selected tools across before_agent_start", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
      allTools: [
        {
          name: "my-search",
          description: "Search",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);

    const ctx = createMockContext({ customResult: ["my-search"] });
    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx); // select my-search

    expect(mock.activeTools).toContain("my-search");

    // Simulate another extension modifying tools between turns
    mock.pi.setActiveTools(["read", "bash", "edit", "write"]);

    // before_agent_start should re-apply plan-mode tools WITH selections
    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "" },
      ctx,
    );

    expect(mock.activeTools).toContain("my-search");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("selectedToolNames persists across session restore", async () => {
    const mock = createMockPi({
      allTools: [
        {
          name: "my-tool",
          description: "My tool",
          sourceInfo: { source: "my-ext" },
        },
      ],
    });
    createExtension(mock.pi);

    const ctx = createMockContext({ customResult: ["my-tool"] });
    await mock.commands.get("plan")!.handler("", ctx.ctx); // enter
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx); // select my-tool

    // Check persisted state includes selectedToolNames
    const persistedEntries = mock.entries.filter((e) => e.customType === "plan-mode-state");
    expect(persistedEntries.length).toBeGreaterThan(0);

    const lastEntry = persistedEntries[persistedEntries.length - 1];
    const persistedState = lastEntry.data as { selectedToolNames?: string[] };
    expect(persistedState.selectedToolNames).toContain("my-tool");
  });
});

describe("plan save lifecycle", () => {
  it("sends the full captured plan and restricts tools for a save turn", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-search", description: "Search", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({
      cwd: "/repo",
      customResult: ["my-search"],
      selectResponses: [PLAN_MENU_LABELS.save],
    });

    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# Ship It\n\nDetails\n</proposed_plan>"),
        ],
      },
      ctx,
    );

    await mock.commands.get("plan")!.handler("", ctx.ctx);

    expect(mock.userMessages).toHaveLength(1);
    const saveMessage = mock.userMessages[0].content;
    expect(saveMessage).toBe(
      "Save the current proposed plan. Choose a new lowercase .md filename in the workspace root /repo. Prefix the filename with today's date followed by a hyphen (YYYY-MM-DD-); use date +%F if needed. Pass only the filename as a relative workspace path; do not use an absolute path or a subdirectory. Write exactly the plan below to that file. Do not add leading or trailing whitespace, including a trailing newline. Make no other changes.\n\n# Ship It\n\nDetails",
    );
    expect(mock.userMessages[0].options).toBeUndefined();
    expect(mock.activeTools).toEqual(
      expect.arrayContaining(["read", "bash", "grep", "find", "ls", "write"]),
    );
    expect(mock.activeTools).not.toContain("my-search");
    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
  });

  it("uses the narrow save-turn prompt and suppresses optional tools", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-search", description: "Search", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({
      customResult: ["my-search"],
      selectResponses: [PLAN_MENU_LABELS.save],
    });

    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# Saved Plan\n</proposed_plan>"),
        ],
      },
      ctx,
    );
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );

    expect((result as { systemPrompt: string }).systemPrompt).toContain("[PLAN SAVE TURN]");
    expect((result as { systemPrompt: string }).systemPrompt).toContain("[PLAN MODE ACTIVE]");
    expect((result as { systemPrompt: string }).systemPrompt).not.toContain("# Saved Plan");
    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
    expect(mock.activeTools).toEqual(
      expect.arrayContaining(["read", "bash", "grep", "find", "ls", "write"]),
    );
    expect(mock.activeTools).not.toContain("my-search");
  });

  it("ignores agent_end plan extraction while a save turn is active", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.save] });

    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# Original Plan\n</proposed_plan>"),
        ],
      },
      ctx,
    );
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# Replacement Plan\n</proposed_plan>"),
        ],
      },
      ctx,
    );

    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );

    expect((result as { systemPrompt: string }).systemPrompt).not.toContain("# Original Plan");
    expect((result as { systemPrompt: string }).systemPrompt).not.toContain("# Replacement Plan");
    const persistedEntries = mock.entries.filter((entry) => entry.customType === "plan-mode-state");
    expect(persistedEntries.at(-1)?.data).toMatchObject({ latestPlan: "# Original Plan" });
    expect(ctx.selectCalls).toHaveLength(1);
  });

  it("warns and restores ordinary plan tools when the save turn settles without success", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-search", description: "Search", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({
      customResult: ["my-search"],
      selectResponses: [PLAN_MENU_LABELS.save],
    });

    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          assistantText("<proposed_plan>\n# Save Me\n</proposed_plan>"),
        ],
      },
      ctx,
    );
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent("agent_settled", { type: "agent_settled" }, ctx);

    expect(mock.activeTools).toContain("my-search");
    expect(mock.activeTools).not.toContain("write");
    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
    expect(
      ctx.notifications.some((n) => n.type === "warning" && n.message.includes("Save plan failed")),
    ).toBe(true);
    const persistedEntries = mock.entries.filter((entry) => entry.customType === "plan-mode-state");
    expect(persistedEntries.at(-1)?.data).toMatchObject({
      latestPlan: "# Save Me",
      awaitingAction: true,
    });
  });

  it("restores full previous tools and clears save-turn state on exit", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write", "custom-before"],
      allTools: [
        { name: "my-search", description: "Search", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({
      customResult: ["my-search"],
      selectResponses: [PLAN_MENU_LABELS.save],
    });

    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [assistantText("<proposed_plan>\n# Save Me\n</proposed_plan>")],
      },
      ctx,
    );
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.commands.get("plan:exit")!.handler("", ctx.ctx);

    expect(mock.activeTools).toEqual(expect.arrayContaining(["edit", "write", "custom-before"]));
    const result = await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base prompt" },
      ctx,
    );
    expect((result as { systemPrompt: string }).systemPrompt).toContain("[PLAN HANDOFF]");
    expect((result as { systemPrompt: string }).systemPrompt).not.toContain("[PLAN SAVE TURN]");
  });

  it("restores ordinary plan tools and clears UI on session shutdown during save turn", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-search", description: "Search", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({
      customResult: ["my-search"],
      selectResponses: [PLAN_MENU_LABELS.save],
    });

    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan:tools")!.handler("", ctx.ctx);
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [assistantText("<proposed_plan>\n# Save Me\n</proposed_plan>")],
      },
      ctx,
    );
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent("session_shutdown", { type: "session_shutdown", reason: "quit" }, ctx);

    expect(mock.activeTools).toEqual(
      expect.arrayContaining(["read", "bash", "grep", "find", "ls", "my-search"]),
    );
    expect(mock.activeTools).not.toContain("write");
    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
  });
});
