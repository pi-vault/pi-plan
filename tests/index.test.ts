import { afterEach, describe, expect, it, vi } from "vitest";
import createExtension from "../src/index.ts";
import { createMockContext, createMockPi } from "./helpers.ts";
import { PLAN_MENU_LABELS, TOOL_SELECTOR_LABELS } from "../src/tui/menus.ts";

describe("createExtension", () => {
  it("registers the plan flag", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.flags.has("plan")).toBe(true);
    expect(mock.flags.get("plan")?.type).toBe("boolean");
  });

  it("registers the plan command", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.commands.has("plan")).toBe(true);
  });

  it("registers session_start, session_shutdown, tool_call, and before_agent_start handlers", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.events.has("session_start")).toBe(true);
    expect(mock.events.has("session_shutdown")).toBe(true);
    expect(mock.events.has("tool_call")).toBe(true);
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
    expect(ctx.notifications.some((n) => n.message.includes("enabled"))).toBe(
      true,
    );
  });

  it("shows plan menu when /plan is run in plan mode", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: ["Stay in Plan mode"] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on

    // Second /plan shows menu, not toggle
    await handler("", ctx.ctx);

    // Plan mode is still on (we chose "stay")
    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(ctx.selectCalls).toHaveLength(1);
  });

  it("exits plan mode with /plan exit", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on
    await handler("exit", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
  });

  it("exits plan mode with /plan off", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on
    await handler("off", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
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

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on
    await handler("exit", ctx.ctx); // off

    expect(mock.activeTools).toContain("edit");
    expect(mock.activeTools).toContain("write");
    expect(mock.activeTools).toContain("custom");
  });

  it("re-applies plan-mode tools on before_agent_start", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enable

    // Simulate another extension modifying tools between turns
    mock.pi.setActiveTools(["read", "bash", "edit", "write"]);
    expect(mock.activeTools).toContain("edit");

    // before_agent_start should restore plan-mode tools
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

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enable

    const result = await mock.fireEvent(
      "tool_call",
      { type: "tool_call", toolCallId: "1", toolName: "edit", input: {} },
      ctx,
    );
    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("blocks write tool in plan mode", async () => {
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

describe("session persistence", () => {
  it("persists state on enter and exit", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on
    await handler("exit", ctx.ctx); // off

    const planEntries = mock.entries.filter(
      (e) => e.customType === "plan-mode-state",
    );
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

    await mock.fireEvent(
      "session_start",
      { type: "session_start", reason: "resume" },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
  });

  it("activates plan mode from --plan flag", async () => {
    const mock = createMockPi();
    mock.flagValues.set("plan", true);
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.fireEvent(
      "session_start",
      { type: "session_start", reason: "startup" },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("clears UI on session_shutdown", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    await mock.commands.get("plan")!.handler("", ctx.ctx); // enable
    expect(ctx.statuses.get("pi-plan")).toBe("plan active");

    await mock.fireEvent(
      "session_shutdown",
      { type: "session_shutdown", reason: "quit" },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
  });
});

describe("before_agent_start", () => {
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

  it("does not modify prompt when plan mode is off", async () => {
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
    const mock = createMockPi({ activeTools: ["read", "bash", "edit", "write"] });
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    // Simulate another extension adding a mutating tool
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

    // Simulate plan having been detected in a previous turn
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );
    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");

    // New turn starts
    await mock.fireEvent(
      "before_agent_start",
      { type: "before_agent_start", systemPrompt: "base" },
      ctx,
    );
    // Status should revert to "plan active" (plan cleared for new turn)
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
            content:
              "Here is my plan:\n<proposed_plan>\n# My Plan\n## Summary\nDo stuff\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");
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
          { role: "assistant", content: "<proposed_plan>\n# Plan\n</proposed_plan>" },
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
        messages: [{ role: "assistant", content: "Just some text, no plan yet." }],
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
          { role: "assistant", content: "<proposed_plan>\n# Plan\n</proposed_plan>" },
        ],
      },
      ctx,
    );

    const entriesAfter = mock.entries.filter((e) => e.customType === "plan-mode-state").length;
    expect(entriesAfter).toBeGreaterThan(entriesBefore);
  });
});

describe("context handler", () => {
  it("filters out plan-mode-state entries", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "context",
      {
        type: "context",
        messages: [
          { role: "user", content: "hello" },
          { customType: "plan-mode-state", data: { enabled: true } },
          { role: "assistant", content: "world" },
        ],
      },
      ctx,
    );

    expect(result).toBeDefined();
    const { messages } = result as { messages: unknown[] };
    expect(messages).toHaveLength(2);
  });

  it("keeps proposed_plan blocks in assistant messages", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "context",
      {
        type: "context",
        messages: [
          {
            role: "assistant",
            content: "text <proposed_plan>\n# Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    // No plan-mode-state entries to filter, so result is undefined (original messages kept)
    // OR if result is returned, the plan block must be intact
    if (result) {
      const msgs = (result as { messages: Array<{ content: string }> }).messages;
      expect(msgs[0].content).toContain("<proposed_plan>");
    }
  });

  it("returns undefined when nothing to filter", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const result = await mock.fireEvent(
      "context",
      {
        type: "context",
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "world" },
        ],
      },
      ctx,
    );

    expect(result).toBeUndefined();
  });
});

describe("widgets", () => {
  it("shows planning widget when plan mode is enabled", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    const widget = ctx.widgets.get("pi-plan") as string[];
    expect(widget).toBeDefined();
    expect(widget.some((line) => line.includes("Plan mode"))).toBe(true);
  });

  it("shows plan ready widget after plan is detected", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          { role: "assistant", content: "<proposed_plan>\n# Plan\n</proposed_plan>" },
        ],
      },
      ctx,
    );

    const widget = ctx.widgets.get("pi-plan") as string[];
    expect(widget).toBeDefined();
    expect(widget.some((line) => line.toLowerCase().includes("ready"))).toBe(true);
  });

  it("clears widget when plan mode exits", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx.ctx); // on
    expect(ctx.widgets.get("pi-plan")).toBeDefined();

    await mock.commands.get("plan")!.handler("exit", ctx.ctx); // off
    expect(ctx.widgets.get("pi-plan")).toBeUndefined();
  });
});

describe("plan menu actions", () => {
  it("implement: exits plan mode and sends implementation message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.implement] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    // Simulate plan detection
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# My Plan\n## Summary\nBuild the thing\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    // Show plan menu and select "implement"
    await handler("", ctx.ctx);

    // Plan mode should be off
    expect(ctx.statuses.get("pi-plan")).toBeUndefined();

    // Implementation message should have been sent
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content as string).toContain("Implement this proposed plan now");
    expect(mock.userMessages[0].content as string).toContain("# My Plan");
  });

  it("exit: exits plan mode without sending message", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.exit] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode
    await handler("", ctx.ctx); // show menu, select exit

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(0);
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
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS["show-plan"]] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx);

    // Simulate plan detection
    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          { role: "assistant", content: "<proposed_plan>\n# My Plan\n</proposed_plan>" },
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

  it("does not submit 'exit' or 'off' as a prompt", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter
    await handler("exit", ctx.ctx); // should exit, not submit "exit" as prompt

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(0);
  });
});

describe("getArgumentCompletions", () => {
  it("returns completions for matching prefix", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const completions = mock.commands.get("plan")!.getArgumentCompletions?.("e") as
      | Array<{ value: string }>
      | undefined;
    const values = completions?.map((c) => c.value) ?? [];
    expect(values).toContain("exit");
    expect(values).not.toContain("tools");
    expect(values).not.toContain("off");
  });

  it("returns all completions for empty prefix", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const completions = mock.commands.get("plan")!.getArgumentCompletions?.("") as
      | Array<{ value: string }>
      | undefined;
    const values = completions?.map((c) => c.value) ?? [];
    expect(values).toContain("exit");
    expect(values).toContain("off");
    expect(values).toContain("tools");
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
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.implement] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content:
              "<proposed_plan>\n# Auto Plan\n## Summary\nDo the thing\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    // Timer hasn't fired yet — plan mode still active
    expect(ctx.statuses.get("pi-plan")).toBe("plan ready");

    // Advance the timer
    await vi.advanceTimersByTimeAsync(0);

    // Menu was shown and "implement" was selected — plan mode exited
    expect(ctx.selectCalls).toHaveLength(1);
    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(mock.userMessages).toHaveLength(1);
    expect(mock.userMessages[0].content as string).toContain("# Auto Plan");
  });

  it("cancels auto-menu when user manually invokes /plan first", async () => {
    vi.useFakeTimers();
    const mock = createMockPi();
    createExtension(mock.pi);
    // First response for the manual /plan menu, second would be for auto-menu (should not fire)
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // enter plan mode

    await mock.fireEvent(
      "agent_end",
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: "<proposed_plan>\n# Plan\n</proposed_plan>",
          },
        ],
      },
      ctx,
    );

    // User manually invokes /plan before timer fires — cancels pending auto-menu
    await handler("", ctx.ctx);

    // Only one select call (from the manual /plan)
    expect(ctx.selectCalls).toHaveLength(1);

    // Advance timer — nothing should happen since it was cleared
    await vi.advanceTimersByTimeAsync(0);

    // Still only one select call
    expect(ctx.selectCalls).toHaveLength(1);
  });
});

describe("/plan tools", () => {
  it("opens tool selector and applies selections", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
      allTools: [
        { name: "read", description: "Read files", sourceInfo: { source: "builtin" } },
        { name: "bash", description: "Run bash", sourceInfo: { source: "builtin" } },
        { name: "edit", description: "Edit files", sourceInfo: { source: "builtin" } },
        { name: "write", description: "Write files", sourceInfo: { source: "builtin" } },
        { name: "my-search", description: "Search tool", sourceInfo: { source: "my-extension" } },
      ],
    });
    createExtension(mock.pi);

    // Enter plan mode first
    const ctx1 = createMockContext();
    await mock.commands.get("plan")!.handler("", ctx1.ctx);

    // Run /plan tools — toggle my-search on, then Done
    const ctx2 = createMockContext({
      selectResponses: [
        "my-search (my-extension) [disabled]",
        TOOL_SELECTOR_LABELS.done,
      ],
    });
    await mock.commands.get("plan")!.handler("tools", ctx2.ctx);

    expect(mock.activeTools).toContain("my-search");
    expect(mock.activeTools).toContain("read");
    expect(mock.activeTools).toContain("bash");
    expect(mock.activeTools).not.toContain("edit");
    expect(mock.activeTools).not.toContain("write");
  });

  it("enters plan mode when running /plan tools while not in plan mode", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.done],
    });

    await mock.commands.get("plan")!.handler("tools", ctx.ctx);

    expect(ctx.statuses.get("pi-plan")).toBe("plan active");
  });

  it("tools action from plan menu calls tool selector", async () => {
    const mock = createMockPi({
      allTools: [
        { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);

    // Enter plan mode
    const ctx = createMockContext({
      selectResponses: [PLAN_MENU_LABELS.tools, TOOL_SELECTOR_LABELS.done],
    });
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    // Run /plan again (shows menu) -> select "Configure tools" -> selector opens -> Done
    await mock.commands.get("plan")!.handler("", ctx.ctx);

    // Two select calls: one for plan menu, one for tool selector
    expect(ctx.selectCalls).toHaveLength(2);
  });

  it("preserves selected tools across before_agent_start", async () => {
    const mock = createMockPi({
      activeTools: ["read", "bash", "edit", "write"],
      allTools: [
        { name: "my-search", description: "Search", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);

    // Enter plan mode and configure tools
    const ctx = createMockContext({
      selectResponses: [
        "my-search (my-ext) [disabled]",
        TOOL_SELECTOR_LABELS.done,
      ],
    });
    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan")!.handler("tools", ctx.ctx);

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
        { name: "my-tool", description: "My tool", sourceInfo: { source: "my-ext" } },
      ],
    });
    createExtension(mock.pi);

    // Enter plan mode and configure tools
    const ctx = createMockContext({
      selectResponses: [
        "my-tool (my-ext) [disabled]",
        TOOL_SELECTOR_LABELS.done,
      ],
    });
    await mock.commands.get("plan")!.handler("", ctx.ctx);
    await mock.commands.get("plan")!.handler("tools", ctx.ctx);

    // Check persisted state includes selectedToolNames
    const persistedEntries = mock.entries.filter(
      (e) => e.customType === "plan-mode-state",
    );
    expect(persistedEntries.length).toBeGreaterThan(0);

    const lastEntry = persistedEntries[persistedEntries.length - 1];
    const persistedState = lastEntry.data as { selectedToolNames?: string[] };
    expect(persistedState.selectedToolNames).toContain("my-tool");
  });
});
