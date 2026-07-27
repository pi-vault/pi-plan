import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPlanModePrompt } from "../../src/core/prompt.ts";
import { createSavePlanSession } from "../../src/core/save-plan.ts";
import { savePlanToolNames } from "../../src/core/tools.ts";

const workspaces: string[] = [];

function workspace(): string {
  const path = mkdtempSync(join(tmpdir(), "pi-plan-save-session-"));
  mkdirSync(join(path, "docs"));
  workspaces.push(path);
  return path;
}

afterEach(() => {
  for (const path of workspaces.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("createSavePlanSession", () => {
  it("builds the exact Save prompt for the captured plan", () => {
    const root = workspace();
    const session = createSavePlanSession("# Saved Plan", root);

    expect(session.userPrompt).toBe(
      `Save the current proposed plan. Choose a new lowercase .md filename in the workspace root ${root}. Prefix the filename with today's date followed by a hyphen (YYYY-MM-DD-); use date +%F if needed. Pass only the filename as a relative workspace path; do not use an absolute path or a subdirectory. Write exactly the plan below to that file. Do not add leading or trailing whitespace, including a trailing newline. Make no other changes.\n\n# Saved Plan`,
    );
    expect(session.toolNames()).toEqual(savePlanToolNames(true));
  });

  it.each(["plan.md", "docs/plan.md"])("authorizes one exact write to %s", (path) => {
    const root = workspace();
    const session = createSavePlanSession("# Saved Plan", root);

    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "write-1",
        toolName: "write",
        input: { path, content: "# Saved Plan" },
      }),
    ).toBeUndefined();
    expect(session.toolNames()).not.toContain("write");
  });

  it("ignores non-write tool calls without changing state", () => {
    const session = createSavePlanSession("# Saved Plan", workspace());

    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "read-1",
        toolName: "read",
        input: { path: "plan.md" },
      }),
    ).toBeUndefined();
    expect(session.toolNames()).toEqual(savePlanToolNames(true));
  });

  it("blocks a write whose content differs from the captured plan", () => {
    const session = createSavePlanSession("# Saved Plan", workspace());

    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "write-content",
        toolName: "write",
        input: { path: "docs/plan.md", content: "# Changed Plan" },
      }),
    ).toEqual({ block: true, reason: "Save plan requires the exact captured plan content." });
    expect(session.toolNames()).toContain("write");
  });

  it("blocks malformed write input instead of throwing", () => {
    const session = createSavePlanSession("# Saved Plan", workspace());

    for (const input of [null, undefined]) {
      expect(
        session.authorizeToolCall({
          type: "tool_call",
          toolCallId: "write-malformed",
          toolName: "write",
          input,
        } as never),
      ).toEqual({
        block: true,
        reason: "Save plan requires an input object with path and content.",
      });
    }
  });

  it.each(["docs/plan.txt", "docs/Plan.md"])(
    "blocks %s outside the lowercase markdown policy",
    (path) => {
      const session = createSavePlanSession("# Saved Plan", workspace());
      expect(
        session.authorizeToolCall({
          type: "tool_call",
          toolCallId: "write-path",
          toolName: "write",
          input: { path, content: "# Saved Plan" },
        }),
      ).toEqual({ block: true, reason: "Save plan path must be a lowercase .md file." });
    },
  );

  it("blocks absolute, traversal, and special-prefix paths", () => {
    const root = workspace();
    const paths = [
      join(root, "docs/plan.md"),
      "../plan.md",
      "~/plan.md",
      "@docs/plan.md",
      "file:///tmp/plan.md",
      "docs/plan\u00A0.md",
    ];

    for (const path of paths) {
      const session = createSavePlanSession("# Saved Plan", root);
      expect(
        session.authorizeToolCall({
          type: "tool_call",
          toolCallId: `write-${path}`,
          toolName: "write",
          input: { path, content: "# Saved Plan" },
        }),
      ).toEqual({
        block: true,
        reason: "Save plan path must be a normal relative workspace path.",
      });
    }
  });

  it("blocks a path whose parent directory does not exist", () => {
    const session = createSavePlanSession("# Saved Plan", workspace());

    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "write-missing-parent",
        toolName: "write",
        input: { path: "missing/plan.md", content: "# Saved Plan" },
      }),
    ).toEqual({
      block: true,
      reason: "Save plan path must be an existing directory inside the workspace.",
    });
  });

  it("blocks an existing write target", () => {
    const root = workspace();
    writeFileSync(join(root, "docs/plan.md"), "existing");
    const session = createSavePlanSession("# Saved Plan", root);

    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "write-existing",
        toolName: "write",
        input: { path: "docs/plan.md", content: "# Saved Plan" },
      }),
    ).toEqual({ block: true, reason: "Save plan target must not already exist." });
  });

  it("blocks a file used as the target parent", () => {
    const root = workspace();
    writeFileSync(join(root, "docs/taken"), "not a directory");
    const session = createSavePlanSession("# Saved Plan", root);

    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "write-file-parent",
        toolName: "write",
        input: { path: "docs/taken/plan.md", content: "# Saved Plan" },
      }),
    ).toEqual({ block: true, reason: "Save plan parent directory must already exist." });
  });

  it("blocks a broken symlink used as the write target", () => {
    const root = workspace();
    symlinkSync(join(root, "missing.md"), join(root, "docs/plan.md"));
    const session = createSavePlanSession("# Saved Plan", root);

    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "write-broken-target",
        toolName: "write",
        input: { path: "docs/plan.md", content: "# Saved Plan" },
      }),
    ).toEqual({ block: true, reason: "Save plan target must not already exist." });
  });

  it("blocks a parent symlink that resolves outside the workspace", () => {
    const root = workspace();
    const outside = workspace();
    rmSync(join(root, "docs"), { recursive: true, force: true });
    symlinkSync(outside, join(root, "docs"));
    const session = createSavePlanSession("# Saved Plan", root);

    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "write-outside",
        toolName: "write",
        input: { path: "docs/plan.md", content: "# Saved Plan" },
      }),
    ).toEqual({ block: true, reason: "Save plan path must stay inside the workspace." });
  });

  it("re-enables write after the authorized execution fails", () => {
    const session = createSavePlanSession("# Saved Plan", workspace());
    session.authorizeToolCall({
      type: "tool_call",
      toolCallId: "write-retry",
      toolName: "write",
      input: { path: "docs/plan.md", content: "# Saved Plan" },
    });

    session.recordToolExecution({
      type: "tool_execution_end",
      toolCallId: "write-other",
      toolName: "write",
      result: { ok: true },
      isError: false,
    });
    expect(session.toolNames()).not.toContain("write");
    expect(session.saved()).toBe(false);

    session.recordToolExecution({
      type: "tool_execution_end",
      toolCallId: "write-retry",
      toolName: "write",
      result: { error: "disk full" },
      isError: true,
    });

    expect(session.toolNames()).toContain("write");
  });

  it("locks writes and reports success after the authorized execution succeeds", () => {
    const session = createSavePlanSession("# Saved Plan", workspace());
    expect(session.saved()).toBe(false);
    session.authorizeToolCall({
      type: "tool_call",
      toolCallId: "write-success",
      toolName: "write",
      input: { path: "docs/plan.md", content: "# Saved Plan" },
    });
    session.recordToolExecution({
      type: "tool_execution_end",
      toolCallId: "write-success",
      toolName: "write",
      result: { ok: true },
      isError: false,
    });

    expect(session.toolNames()).not.toContain("write");
    expect(session.saved()).toBe(true);
    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "write-after-success",
        toolName: "write",
        input: { path: "docs/second.md", content: "# Saved Plan" },
      }),
    ).toEqual({
      block: true,
      reason: "Plan mode blocks 'write'. Exit plan mode first with /plan:exit.",
    });
  });

  it("blocks a second write while the first write is reserved", () => {
    const session = createSavePlanSession("# Saved Plan", workspace());
    session.authorizeToolCall({
      type: "tool_call",
      toolCallId: "write-first",
      toolName: "write",
      input: { path: "docs/first.md", content: "# Saved Plan" },
    });

    expect(
      session.authorizeToolCall({
        type: "tool_call",
        toolCallId: "write-second",
        toolName: "write",
        input: { path: "docs/second.md", content: "# Saved Plan" },
      }),
    ).toEqual({
      block: true,
      reason: "Plan mode blocks 'write'. Exit plan mode first with /plan:exit.",
    });
  });

  it("freezes the authorized write input", () => {
    const session = createSavePlanSession("# Saved Plan", workspace());
    const input = { path: "docs/plan.md", content: "# Saved Plan" };

    session.authorizeToolCall({
      type: "tool_call",
      toolCallId: "write-frozen",
      toolName: "write",
      input,
    });

    expect(Object.isFrozen(input)).toBe(true);
  });

  it("chains Save instructions onto Pi's incoming system prompt", () => {
    const session = createSavePlanSession("# Saved Plan", workspace());

    const result = session.beforeAgentStart({
      type: "before_agent_start",
      prompt: "save it",
      systemPrompt: "base prompt",
      systemPromptOptions: { cwd: process.cwd() },
    });

    expect(result.systemPrompt).toBe(
      `base prompt\n\n${buildPlanModePrompt()}\n\n[PLAN SAVE TURN]\nUse only one approved write call for the exact captured plan. Do not edit, implement, or modify any other file.`,
    );
  });
});
