import { describe, expect, it } from "vitest";
import { PLAN_MENU_LABELS, showPlanMenu, showPlanReadyMenu } from "../../src/tui/menus.ts";
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
