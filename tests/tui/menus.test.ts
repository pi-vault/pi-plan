import { describe, expect, it } from "vitest";
import {
  PLAN_MENU_LABELS,
  showPlanMenu,
  showPlanReadyMenu,
  showToolSelector,
  TOOL_SELECTOR_LABELS,
} from "../../src/tui/menus.ts";
import type { ToolInfoLike } from "../helpers.ts";
import { createInitialState } from "../../src/core/state.ts";
import { createMockContext } from "../helpers.ts";

describe("showPlanReadyMenu", () => {
  it("returns implement when user selects implement label", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.implement] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("implement");
  });

  it("returns stay when user selects stay label", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("stay");
  });

  it("returns exit when user selects exit label", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.exit] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("exit");
  });

  it("defaults to stay when selection is cancelled (undefined)", async () => {
    const ctx = createMockContext({ selectResponses: [] });
    const action = await showPlanReadyMenu(ctx.ctx);
    expect(action).toBe("stay");
  });

  it("calls ctx.ui.select with three options", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    await showPlanReadyMenu(ctx.ctx);
    expect(ctx.selectCalls).toHaveLength(1);
    expect(ctx.selectCalls[0].options).toHaveLength(3);
  });
});

describe("showPlanMenu", () => {
  it("includes show-plan and implement options when plan exists", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true, latestPlan: "# My Plan" };
    await showPlanMenu(ctx.ctx, state);
    const options = ctx.selectCalls[0].options;
    expect(options).toContain(PLAN_MENU_LABELS["show-plan"]);
    expect(options).toContain(PLAN_MENU_LABELS.implement);
    expect(options).toContain(PLAN_MENU_LABELS.stay);
    expect(options).toContain(PLAN_MENU_LABELS.exit);
  });

  it("excludes show-plan and implement options when no plan exists", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true };
    await showPlanMenu(ctx.ctx, state);
    const options = ctx.selectCalls[0].options;
    expect(options).not.toContain(PLAN_MENU_LABELS["show-plan"]);
    expect(options).not.toContain(PLAN_MENU_LABELS.implement);
    expect(options).toContain(PLAN_MENU_LABELS.stay);
    expect(options).toContain(PLAN_MENU_LABELS.exit);
  });

  it("returns selected action", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.exit] });
    const state = { ...createInitialState(), enabled: true };
    const action = await showPlanMenu(ctx.ctx, state);
    expect(action).toBe("exit");
  });

  it("defaults to stay when cancelled", async () => {
    const ctx = createMockContext({ selectResponses: [] });
    const state = { ...createInitialState(), enabled: true };
    const action = await showPlanMenu(ctx.ctx, state);
    expect(action).toBe("stay");
  });
});

function makeTools(names: string[], source = "extension"): ToolInfoLike[] {
  return names.map((name) => ({
    name,
    description: `${name} tool`,
    sourceInfo: { source },
  }));
}

describe("showToolSelector", () => {
  it("returns undefined when user immediately selects Done with no changes", async () => {
    const tools = makeTools(["my-tool"]);
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.done],
    });

    const result = await showToolSelector(ctx.ctx, tools, state);
    expect(result).toBeUndefined();
  });

  it("returns selected tool names when user toggles a tool and selects Done", async () => {
    const tools = makeTools(["my-tool", "other-tool"]);
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [
        "my-tool (extension) [disabled]",
        TOOL_SELECTOR_LABELS.done,
      ],
    });

    const result = await showToolSelector(ctx.ctx, tools, state);
    expect(result).toBeDefined();
    expect(result).toContain("my-tool");
    expect(result).not.toContain("other-tool");
  });

  it("excludes blocked built-in tools from selector options", async () => {
    const tools = [
      { name: "edit", description: "Edit files", sourceInfo: { source: "builtin" } },
      { name: "write", description: "Write files", sourceInfo: { source: "builtin" } },
      { name: "my-tool", description: "My tool", sourceInfo: { source: "extension" } },
    ];
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.done],
    });

    await showToolSelector(ctx.ctx, tools, state);

    const allOptions = ctx.selectCalls.flatMap((call) => call.options);
    expect(allOptions.some((o) => o.startsWith("edit "))).toBe(false);
    expect(allOptions.some((o) => o.startsWith("write "))).toBe(false);
    expect(allOptions.some((o) => o.startsWith("my-tool "))).toBe(true);
  });

  it("shows pagination when there are more tools than page size", async () => {
    const tools = makeTools(
      Array.from({ length: 11 }, (_, i) => `tool-${i}`),
    );
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.next, TOOL_SELECTOR_LABELS.done],
    });

    await showToolSelector(ctx.ctx, tools, state);

    const firstPageOptions = ctx.selectCalls[0].options;
    expect(firstPageOptions).toContain(TOOL_SELECTOR_LABELS.next);
    expect(firstPageOptions).not.toContain(TOOL_SELECTOR_LABELS.prev);
  });

  it("persists toggled state across pages", async () => {
    const tools = makeTools(
      Array.from({ length: 11 }, (_, i) => `tool-${i}`),
    );
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [
        "tool-0 (extension) [disabled]",
        TOOL_SELECTOR_LABELS.next,
        TOOL_SELECTOR_LABELS.done,
      ],
    });

    const result = await showToolSelector(ctx.ctx, tools, state);
    expect(result).toBeDefined();
    expect(result).toContain("tool-0");
    expect(result).not.toContain("tool-10");
  });

  it("shows always-on label for safe builtin tools", async () => {
    const tools = [
      { name: "read", description: "Read files", sourceInfo: { source: "builtin" } },
      { name: "my-tool", description: "My tool", sourceInfo: { source: "extension" } },
    ];
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({
      selectResponses: [TOOL_SELECTOR_LABELS.done],
    });

    await showToolSelector(ctx.ctx, tools, state);

    const options = ctx.selectCalls[0].options;
    expect(options.some((o) => o.includes("read") && o.includes("[always on]"))).toBe(true);
  });

  it("returns undefined for empty tool list", async () => {
    const state = { ...createInitialState(), enabled: true };
    const ctx = createMockContext({ selectResponses: [] });

    const result = await showToolSelector(ctx.ctx, [], state);
    expect(result).toBeUndefined();
  });
});

describe("showPlanMenu with tools option", () => {
  it("includes Configure tools option", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true };
    await showPlanMenu(ctx.ctx, state);
    const options = ctx.selectCalls[0].options;
    expect(options).toContain(PLAN_MENU_LABELS.tools);
  });
});
