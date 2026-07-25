import { describe, expect, it } from "vitest";
import { createInitialState } from "../../src/core/state.ts";
import { PLAN_MENU_LABELS, showPlanMenu, showPlanReadyMenu } from "../../src/tui/menus.ts";
import { createMockContext } from "../helpers.ts";

describe("showPlanReadyMenu", () => {
  it("includes Save plan label", () => {
    expect(PLAN_MENU_LABELS.save).toBe("Save plan");
  });

  it("returns implement when user selects implement label", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.implement] });
    const action = await showPlanReadyMenu(ctx.ctx, {
      ...createInitialState(),
      latestPlan: "# Plan",
    });
    expect(action).toBe("implement");
  });

  it("returns stay when user selects stay label", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const action = await showPlanReadyMenu(ctx.ctx, {
      ...createInitialState(),
      latestPlan: "# Plan",
    });
    expect(action).toBe("stay");
  });

  it("returns exit when user selects exit label", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.exit] });
    const action = await showPlanReadyMenu(ctx.ctx, {
      ...createInitialState(),
      latestPlan: "# Plan",
    });
    expect(action).toBe("exit");
  });

  it("defaults to stay when selection is cancelled (undefined)", async () => {
    const ctx = createMockContext({ selectResponses: [] });
    const action = await showPlanReadyMenu(ctx.ctx, {
      ...createInitialState(),
      latestPlan: "# Plan",
    });
    expect(action).toBe("stay");
  });

  it("shows Implement, Save plan, Stay, Exit in order when plan exists and idle", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    await showPlanReadyMenu(ctx.ctx, {
      ...createInitialState(),
      latestPlan: "# Plan",
    });
    expect(ctx.selectCalls).toHaveLength(1);
    expect(ctx.selectCalls[0].options).toEqual([
      PLAN_MENU_LABELS.implement,
      PLAN_MENU_LABELS.save,
      PLAN_MENU_LABELS.stay,
      PLAN_MENU_LABELS.exit,
    ]);
  });

  it("hides Save plan when no plan exists", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    await showPlanReadyMenu(ctx.ctx, createInitialState());
    expect(ctx.selectCalls[0].options).toEqual([
      PLAN_MENU_LABELS.implement,
      PLAN_MENU_LABELS.stay,
      PLAN_MENU_LABELS.exit,
    ]);
  });

  it("hides Save plan when context is busy", async () => {
    const ctx = createMockContext({ isIdle: false, selectResponses: [PLAN_MENU_LABELS.stay] });
    await showPlanReadyMenu(ctx.ctx, {
      ...createInitialState(),
      latestPlan: "# Plan",
    });
    expect(ctx.selectCalls[0].options).toEqual([
      PLAN_MENU_LABELS.implement,
      PLAN_MENU_LABELS.stay,
      PLAN_MENU_LABELS.exit,
    ]);
  });
});

describe("showPlanMenu", () => {
  it("includes show-plan, implement, and Save plan options in order when plan exists and idle", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true, latestPlan: "# My Plan" };
    await showPlanMenu(ctx.ctx, state);
    expect(ctx.selectCalls[0].options).toEqual([
      PLAN_MENU_LABELS["show-plan"],
      PLAN_MENU_LABELS.implement,
      PLAN_MENU_LABELS.save,
      PLAN_MENU_LABELS.tools,
      PLAN_MENU_LABELS.stay,
      PLAN_MENU_LABELS.exit,
    ]);
  });

  it("excludes show-plan, implement, and Save plan options when no plan exists", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true };
    await showPlanMenu(ctx.ctx, state);
    expect(ctx.selectCalls[0].options).toEqual([
      PLAN_MENU_LABELS.tools,
      PLAN_MENU_LABELS.stay,
      PLAN_MENU_LABELS.exit,
    ]);
  });

  it("hides Save plan when plan exists but context is busy", async () => {
    const ctx = createMockContext({ isIdle: false, selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true, latestPlan: "# My Plan" };
    await showPlanMenu(ctx.ctx, state);
    expect(ctx.selectCalls[0].options).toEqual([
      PLAN_MENU_LABELS["show-plan"],
      PLAN_MENU_LABELS.implement,
      PLAN_MENU_LABELS.tools,
      PLAN_MENU_LABELS.stay,
      PLAN_MENU_LABELS.exit,
    ]);
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

  it("includes Configure tools option", async () => {
    const ctx = createMockContext({ selectResponses: [PLAN_MENU_LABELS.stay] });
    const state = { ...createInitialState(), enabled: true };
    await showPlanMenu(ctx.ctx, state);
    const options = ctx.selectCalls[0].options;
    expect(options).toContain(PLAN_MENU_LABELS.tools);
  });
});
