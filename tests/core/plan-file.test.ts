import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { savePlanToFile } from "../../src/core/plan-file.ts";

function createMockCtx(options: {
  inputResponse?: string | undefined;
  cwd: string;
}) {
  const notifications: Array<{ message: string; type?: string }> = [];
  return {
    ctx: {
      cwd: options.cwd,
      hasUI: true,
      ui: {
        async input(_title: string, _placeholder?: string) {
          return options.inputResponse;
        },
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
      },
    } as any,
    notifications,
  };
}

describe("savePlanToFile", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes plan to the specified path", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: "my-plan.md", cwd: tempDir });

    await savePlanToFile("# The Plan\n## Summary\nDo stuff", mock.ctx);

    const content = readFileSync(join(tempDir, "my-plan.md"), "utf-8");
    expect(content).toBe("# The Plan\n## Summary\nDo stuff");
  });

  it("resolves relative paths against cwd", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: "sub/plan.md", cwd: tempDir });

    await savePlanToFile("# Plan", mock.ctx);

    const content = readFileSync(join(tempDir, "sub", "plan.md"), "utf-8");
    expect(content).toBe("# Plan");
  });

  it("skips writing when user cancels input", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: undefined, cwd: tempDir });

    await savePlanToFile("# Plan", mock.ctx);

    expect(mock.notifications).toHaveLength(0);
  });

  it("skips writing when user provides empty string", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: "  ", cwd: tempDir });

    await savePlanToFile("# Plan", mock.ctx);

    expect(mock.notifications).toHaveLength(0);
  });

  it("handles absolute paths", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const absPath = join(tempDir, "abs-plan.md");
    const mock = createMockCtx({ inputResponse: absPath, cwd: "/other" });

    await savePlanToFile("# Abs Plan", mock.ctx);

    const content = readFileSync(absPath, "utf-8");
    expect(content).toBe("# Abs Plan");
  });

  it("notifies on success", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: "plan.md", cwd: tempDir });

    await savePlanToFile("# Plan", mock.ctx);

    expect(mock.notifications).toHaveLength(1);
    expect(mock.notifications[0].message).toContain("Plan saved");
    expect(mock.notifications[0].type).toBe("info");
  });

  it("notifies on write failure", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-test-"));
    const mock = createMockCtx({ inputResponse: "/dev/null/impossible/plan.md", cwd: tempDir });

    await savePlanToFile("# Plan", mock.ctx);

    expect(mock.notifications).toHaveLength(1);
    expect(mock.notifications[0].message).toContain("Failed to save");
    expect(mock.notifications[0].type).toBe("warning");
  });

  it("skips when hasUI is false", async () => {
    const mock = createMockCtx({ inputResponse: "plan.md", cwd: "/unused" });
    (mock.ctx as any).hasUI = false;

    await savePlanToFile("# Plan", mock.ctx);

    expect(mock.notifications).toHaveLength(0);
  });
});
