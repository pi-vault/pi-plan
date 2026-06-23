# Phase 1: Plan Mode Toggle with Safety Enforcement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working `/plan` toggle that restricts tools, filters bash commands, shows status, and persists across sessions.

**Architecture:** Pure function modules (`safety`, `state`, `tools`, `status`) with no Pi API dependency. The entry point (`index.ts`) wires these to Pi's extension API via closures. All modules export testable functions. The mock ExtensionAPI in test helpers captures registrations and event handlers for integration tests.

**Tech Stack:** TypeScript (ESM, Node16 module resolution, `.ts` extensions), Vitest, Biome (2-space indent, double quotes, semicolons, 100-char line width)

**Spec:** `docs/superpowers/specs/2026-06-22-pi-plan-design.md`

**Reference implementations:**

- Official example: `node_modules/@earendil-works/pi-coding-agent/dist/core/../../../examples/extensions/plan-mode/`
- Narumiruna: patterns from `@narumitw/pi-plan-mode` (Codex-like approach)

---

### Task 1: Shared types and constants

**Files:**

- Create: `src/shared/types.ts`
- Create: `src/shared/constants.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```typescript
export interface PlanModeState {
  enabled: boolean;
  latestPlan: string | undefined;
  awaitingAction: boolean;
  selectedToolNames: string[] | undefined;
}

export interface SessionEntry {
  type?: string;
  customType?: string;
  data?: Partial<PlanModeState>;
}
```

- [ ] **Step 2: Create `src/shared/constants.ts`**

```typescript
export const STATE_ENTRY_TYPE = "plan-mode-state";
export const STATUS_KEY = "pi-plan";

export const SAFE_BUILTIN_PLAN_TOOLS = new Set([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
]);
export const BLOCKED_BUILTIN_TOOLS = new Set(["edit", "write"]);
export const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

export const MUTATING_BASH_PATTERNS: RegExp[] = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish|version)\b/i,
  /\byarn\s+(add|remove|install|publish|upgrade)\b/i,
  /\bpnpm\s+(add|remove|install|publish|update)\b/i,
  /\bbun\s+(add|remove|install|update|publish)\b/i,
  /\bpip\s+(install|uninstall)\b/i,
  /\buv\s+(add|remove|sync|lock|pip\s+install)\b/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|switch|stash|cherry-pick|revert|tag|init|clone)\b/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)\b/i,
  /\bservice\s+\S+\s+(start|stop|restart)\b/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

export const SAFE_BASH_PATTERNS: RegExp[] = [
  /^\s*(cat|head|tail|less|more|grep|find|ls|pwd|echo|printf|wc|sort|uniq|diff|file|stat|du|df|tree|which|whereis|type|env|printenv|uname|whoami|id|date|uptime|ps|jq|awk|rg|fd|bat|eza)\b/i,
  /^\s*sed\s+-n\b/i,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-files|grep)\b/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)\b/i,
  /^\s*(node|python|python3|npm|tsc|biome|ruff|ty)\s+--version\b/i,
];
```

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm typecheck`
Expected: PASS, no errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts
git commit -m "feat: add shared types and constants for plan mode"
```

---

### Task 2: Bash safety module (TDD)

**Files:**

- Create: `src/core/safety.ts`
- Create: `tests/core/safety.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/safety.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isSafeCommand } from "../../src/core/safety.ts";

describe("isSafeCommand", () => {
  it("rejects empty input", () => {
    expect(isSafeCommand("")).toBe(false);
    expect(isSafeCommand("  ")).toBe(false);
  });

  describe("safe read-only commands", () => {
    const safe = [
      "cat file.ts",
      "head -20 file.ts",
      "tail -f log.txt",
      "grep -r pattern src/",
      "find . -name '*.ts'",
      "ls -la",
      "pwd",
      "echo hello",
      "wc -l file.ts",
      "sort file.txt",
      "diff a.ts b.ts",
      "tree src/",
      "git status --short",
      "git log --oneline -5",
      "git diff HEAD",
      "git show HEAD:file.ts",
      "git branch -a",
      "npm list --depth=0",
      "npm outdated",
      "sed -n '1,20p' file.ts",
      "jq '.name' package.json",
      "rg pattern src/",
      "fd '*.ts'",
      "node --version",
      "python --version",
    ];

    for (const cmd of safe) {
      it(`allows: ${cmd}`, () => {
        expect(isSafeCommand(cmd)).toBe(true);
      });
    }
  });

  describe("mutating commands", () => {
    const dangerous = [
      "rm -rf build",
      "rm file.ts",
      "mv a.ts b.ts",
      "cp a.ts b.ts",
      "mkdir new-dir",
      "touch file.ts",
      "chmod 755 script.sh",
      "git add .",
      "git commit -m 'msg'",
      "git push origin main",
      "git checkout main",
      "git stash",
      "npm install",
      "npm uninstall pkg",
      "yarn add pkg",
      "pnpm add pkg",
      "bun add pkg",
      "pip install pkg",
      "sudo rm -rf /",
      "kill -9 1234",
      "vim file.ts",
      "nano file.ts",
      "code file.ts",
    ];

    for (const cmd of dangerous) {
      it(`blocks: ${cmd}`, () => {
        expect(isSafeCommand(cmd)).toBe(false);
      });
    }
  });

  describe("redirect operators", () => {
    it("blocks stdout redirect", () => {
      expect(isSafeCommand("echo hello > file.txt")).toBe(false);
    });

    it("blocks append redirect", () => {
      expect(isSafeCommand("echo hello >> file.txt")).toBe(false);
    });

    it("allows comparison operators in safe commands", () => {
      expect(isSafeCommand("echo $((1<2))")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- `isSafeCommand` not found

- [ ] **Step 3: Implement `src/core/safety.ts`**

```typescript
import {
  MUTATING_BASH_PATTERNS,
  SAFE_BASH_PATTERNS,
} from "../shared/constants.ts";

export function isSafeCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (MUTATING_BASH_PATTERNS.some((p) => p.test(trimmed))) return false;
  return SAFE_BASH_PATTERNS.some((p) => p.test(trimmed));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/safety.ts tests/core/safety.test.ts
git commit -m "feat: add bash command safety filtering"
```

---

### Task 3: State transitions module (TDD)

**Files:**

- Create: `src/core/state.ts`
- Create: `tests/core/state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/state.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  enterPlanMode,
  exitPlanMode,
  restoreState,
} from "../../src/core/state.ts";

describe("createInitialState", () => {
  it("returns disabled state with no plan", () => {
    const state = createInitialState();
    expect(state).toEqual({
      enabled: false,
      latestPlan: undefined,
      awaitingAction: false,
      selectedToolNames: undefined,
    });
  });
});

describe("enterPlanMode", () => {
  it("enables plan mode and clears awaitingAction", () => {
    const state = createInitialState();
    const next = enterPlanMode(state);
    expect(next.enabled).toBe(true);
    expect(next.awaitingAction).toBe(false);
  });

  it("preserves selectedToolNames", () => {
    const state = {
      ...createInitialState(),
      selectedToolNames: ["read", "grep"],
    };
    const next = enterPlanMode(state);
    expect(next.selectedToolNames).toEqual(["read", "grep"]);
  });
});

describe("exitPlanMode", () => {
  it("disables plan mode and clears plan data", () => {
    const state = {
      enabled: true,
      latestPlan: "some plan",
      awaitingAction: true,
      selectedToolNames: ["read"] as string[] | undefined,
    };
    const next = exitPlanMode(state);
    expect(next.enabled).toBe(false);
    expect(next.latestPlan).toBeUndefined();
    expect(next.awaitingAction).toBe(false);
  });

  it("preserves selectedToolNames for next plan session", () => {
    const state = {
      enabled: true,
      latestPlan: undefined,
      awaitingAction: false,
      selectedToolNames: ["read", "grep"] as string[] | undefined,
    };
    const next = exitPlanMode(state);
    expect(next.selectedToolNames).toEqual(["read", "grep"]);
  });
});

describe("restoreState", () => {
  it("returns initial state when no entries exist", () => {
    const state = restoreState([]);
    expect(state).toEqual(createInitialState());
  });

  it("restores from the latest plan-mode-state entry", () => {
    const entries = [
      {
        type: "custom",
        customType: "plan-mode-state",
        data: { enabled: true },
      },
      {
        type: "custom",
        customType: "plan-mode-state",
        data: { enabled: false },
      },
    ];
    const state = restoreState(entries);
    expect(state.enabled).toBe(false);
  });

  it("clears plan data when restored as disabled", () => {
    const entries = [
      {
        type: "custom",
        customType: "plan-mode-state",
        data: {
          enabled: false,
          latestPlan: "stale plan",
          awaitingAction: true,
        },
      },
    ];
    const state = restoreState(entries);
    expect(state.enabled).toBe(false);
    expect(state.latestPlan).toBeUndefined();
    expect(state.awaitingAction).toBe(false);
  });

  it("preserves plan data when restored as enabled", () => {
    const entries = [
      {
        type: "custom",
        customType: "plan-mode-state",
        data: {
          enabled: true,
          latestPlan: "a plan",
          awaitingAction: true,
          selectedToolNames: ["read"],
        },
      },
    ];
    const state = restoreState(entries);
    expect(state.enabled).toBe(true);
    expect(state.latestPlan).toBe("a plan");
    expect(state.awaitingAction).toBe(true);
    expect(state.selectedToolNames).toEqual(["read"]);
  });

  it("ignores non-plan-mode entries", () => {
    const entries = [
      { type: "message", content: "hello" },
      { type: "custom", customType: "other-ext", data: { enabled: true } },
    ];
    const state = restoreState(entries);
    expect(state).toEqual(createInitialState());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- imports not found

- [ ] **Step 3: Implement `src/core/state.ts`**

```typescript
import { STATE_ENTRY_TYPE } from "../shared/constants.ts";
import type { PlanModeState, SessionEntry } from "../shared/types.ts";

export function createInitialState(): PlanModeState {
  return {
    enabled: false,
    latestPlan: undefined,
    awaitingAction: false,
    selectedToolNames: undefined,
  };
}

export function enterPlanMode(state: PlanModeState): PlanModeState {
  return { ...state, enabled: true, awaitingAction: false };
}

export function exitPlanMode(state: PlanModeState): PlanModeState {
  return {
    ...state,
    enabled: false,
    latestPlan: undefined,
    awaitingAction: false,
  };
}

export function restoreState(entries: SessionEntry[]): PlanModeState {
  const entry = entries
    .filter((e) => e.type === "custom" && e.customType === STATE_ENTRY_TYPE)
    .pop();

  if (!entry?.data) return createInitialState();

  const enabled = entry.data.enabled ?? false;
  return {
    enabled,
    latestPlan: enabled ? entry.data.latestPlan : undefined,
    awaitingAction: enabled ? (entry.data.awaitingAction ?? false) : false,
    selectedToolNames: entry.data.selectedToolNames,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/state.ts tests/core/state.test.ts
git commit -m "feat: add plan mode state transitions and restoration"
```

---

### Task 4: Tool name computation module (TDD)

**Files:**

- Create: `src/core/tools.ts`
- Create: `tests/core/tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/tools.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
} from "../../src/core/tools.ts";

describe("defaultPlanModeToolNames", () => {
  it("returns safe built-in tools", () => {
    const tools = defaultPlanModeToolNames();
    expect(tools).toContain("read");
    expect(tools).toContain("bash");
    expect(tools).toContain("grep");
    expect(tools).toContain("find");
    expect(tools).toContain("ls");
  });

  it("does not include edit or write", () => {
    const tools = defaultPlanModeToolNames();
    expect(tools).not.toContain("edit");
    expect(tools).not.toContain("write");
  });
});

describe("normalModeToolNames", () => {
  it("returns previous tools when available", () => {
    const previous = ["read", "bash", "edit", "write", "custom-tool"];
    expect(normalModeToolNames(previous)).toEqual(previous);
  });

  it("returns defaults when previous is undefined", () => {
    expect(normalModeToolNames(undefined)).toEqual([
      "read",
      "bash",
      "edit",
      "write",
    ]);
  });

  it("returns defaults when previous is empty", () => {
    expect(normalModeToolNames([])).toEqual(["read", "bash", "edit", "write"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- imports not found

- [ ] **Step 3: Implement `src/core/tools.ts`**

```typescript
import { DEFAULT_TOOLS, SAFE_BUILTIN_PLAN_TOOLS } from "../shared/constants.ts";

export function defaultPlanModeToolNames(): string[] {
  return [...SAFE_BUILTIN_PLAN_TOOLS];
}

export function normalModeToolNames(
  previousTools: string[] | undefined,
): string[] {
  return previousTools && previousTools.length > 0
    ? previousTools
    : [...DEFAULT_TOOLS];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/tools.ts tests/core/tools.test.ts
git commit -m "feat: add plan mode tool name computation"
```

---

### Task 5: Status formatting module (TDD)

**Files:**

- Create: `src/tui/status.ts`
- Create: `tests/tui/status.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tui/status.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatStatus } from "../../src/tui/status.ts";
import { createInitialState } from "../../src/core/state.ts";

describe("formatStatus", () => {
  it("returns undefined when plan mode is off", () => {
    expect(formatStatus(createInitialState())).toBeUndefined();
  });

  it("returns 'plan active' when enabled with no plan", () => {
    const state = { ...createInitialState(), enabled: true };
    expect(formatStatus(state)).toBe("plan active");
  });

  it("returns 'plan ready' when a plan exists", () => {
    const state = {
      ...createInitialState(),
      enabled: true,
      latestPlan: "some plan",
    };
    expect(formatStatus(state)).toBe("plan ready");
  });

  it("returns 'plan ready' when awaitingAction is true", () => {
    const state = {
      ...createInitialState(),
      enabled: true,
      awaitingAction: true,
    };
    expect(formatStatus(state)).toBe("plan ready");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- `formatStatus` not found

- [ ] **Step 3: Implement `src/tui/status.ts`**

```typescript
import type { PlanModeState } from "../shared/types.ts";

export function formatStatus(state: PlanModeState): string | undefined {
  if (!state.enabled) return undefined;
  if (state.awaitingAction || state.latestPlan) return "plan ready";
  return "plan active";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/tui/status.ts tests/tui/status.test.ts
git commit -m "feat: add plan mode status formatting"
```

---

### Task 6: Test helpers (mock ExtensionAPI)

**Files:**

- Create: `tests/helpers.ts`

- [ ] **Step 1: Create `tests/helpers.ts`**

This mock captures all Pi API calls and lets integration tests invoke event handlers.

```typescript
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { SessionEntry } from "../src/shared/types.ts";

interface RegisteredFlag {
  description?: string;
  type: string;
  default?: boolean | string;
}

interface RegisteredCommand {
  description?: string;
  handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => unknown;
}

type EventHandler = (
  event: unknown,
  ctx: ExtensionContext,
) => Promise<unknown> | unknown;

export interface MockPi {
  pi: ExtensionAPI;
  flags: Map<string, RegisteredFlag>;
  flagValues: Map<string, boolean | string>;
  commands: Map<string, RegisteredCommand>;
  events: Map<string, EventHandler[]>;
  activeTools: string[];
  entries: Array<{ customType: string; data: unknown }>;
  messages: Array<{ message: unknown; options: unknown }>;
  userMessages: Array<{ content: unknown; options: unknown }>;
  fireEvent(name: string, event: unknown, ctx: MockContext): Promise<unknown>;
}

export interface MockContext {
  ctx: ExtensionContext;
  statuses: Map<string, string | undefined>;
  notifications: Array<{ message: string; type?: string }>;
  widgets: Map<string, unknown>;
}

export function createMockPi(options?: { activeTools?: string[] }): MockPi {
  const flags = new Map<string, RegisteredFlag>();
  const flagValues = new Map<string, boolean | string>();
  const commands = new Map<string, RegisteredCommand>();
  const events = new Map<string, EventHandler[]>();
  let activeTools = options?.activeTools ?? ["read", "bash", "edit", "write"];
  const entries: Array<{ customType: string; data: unknown }> = [];
  const messages: Array<{ message: unknown; options: unknown }> = [];
  const userMessages: Array<{ content: unknown; options: unknown }> = [];

  const mock: MockPi = {
    pi: {
      registerFlag(name: string, opts: RegisteredFlag) {
        flags.set(name, opts);
        if (opts.default !== undefined) flagValues.set(name, opts.default);
      },
      registerCommand(name: string, opts: RegisteredCommand) {
        commands.set(name, opts);
      },
      on(event: string, handler: EventHandler) {
        const handlers = events.get(event) ?? [];
        handlers.push(handler);
        events.set(event, handlers);
      },
      getFlag(name: string) {
        return flagValues.get(name);
      },
      getActiveTools() {
        return [...activeTools];
      },
      setActiveTools(toolNames: string[]) {
        activeTools = [...toolNames];
        mock.activeTools = activeTools;
      },
      appendEntry(customType: string, data: unknown) {
        entries.push({ customType, data });
      },
      sendMessage(message: unknown, opts: unknown) {
        messages.push({ message, options: opts });
      },
      sendUserMessage(content: unknown, opts: unknown) {
        userMessages.push({ content, options: opts });
      },
    } as unknown as ExtensionAPI,
    flags,
    flagValues,
    commands,
    events,
    activeTools,
    entries,
    messages,
    userMessages,
    async fireEvent(name: string, event: unknown, mockCtx: MockContext) {
      const handlers = events.get(name) ?? [];
      let result: unknown;
      for (const handler of handlers) {
        result = await handler(event, mockCtx.ctx);
      }
      return result;
    },
  };

  return mock;
}

export function createMockContext(options?: {
  entries?: SessionEntry[];
  hasUI?: boolean;
  isIdle?: boolean;
}): MockContext {
  const statuses = new Map<string, string | undefined>();
  const notifications: Array<{ message: string; type?: string }> = [];
  const widgets = new Map<string, unknown>();
  const sessionEntries = options?.entries ?? [];

  const mockCtx: MockContext = {
    ctx: {
      ui: {
        setStatus(key: string, value: string | undefined) {
          statuses.set(key, value);
        },
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
        setWidget(key: string, content: unknown) {
          widgets.set(key, content);
        },
        theme: {
          fg(_color: string, text: string) {
            return text;
          },
        },
      },
      hasUI: options?.hasUI ?? true,
      isIdle: () => options?.isIdle ?? true,
      sessionManager: {
        getEntries: () => sessionEntries,
      },
    } as unknown as ExtensionContext,
    statuses,
    notifications,
    widgets,
  };

  return mockCtx;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/helpers.ts
git commit -m "feat: add mock ExtensionAPI test helpers"
```

---

### Task 7: Entry point wiring and integration tests

**Files:**

- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Replace `tests/index.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import createExtension from "../src/index.ts";
import { createMockContext, createMockPi } from "./helpers.ts";

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

  it("registers session_start, session_shutdown, and tool_call handlers", () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    expect(mock.events.has("session_start")).toBe(true);
    expect(mock.events.has("session_shutdown")).toBe(true);
    expect(mock.events.has("tool_call")).toBe(true);
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

  it("toggles plan mode off", async () => {
    const mock = createMockPi();
    createExtension(mock.pi);
    const ctx = createMockContext();

    const handler = mock.commands.get("plan")!.handler;
    await handler("", ctx.ctx); // on
    await handler("", ctx.ctx); // off

    expect(ctx.statuses.get("pi-plan")).toBeUndefined();
    expect(ctx.notifications.some((n) => n.message.includes("disabled"))).toBe(
      true,
    );
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
    await handler("", ctx.ctx); // off

    expect(mock.activeTools).toContain("edit");
    expect(mock.activeTools).toContain("write");
    expect(mock.activeTools).toContain("custom");
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
    await handler("", ctx.ctx); // off

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: FAIL -- the wiring doesn't exist yet

- [ ] **Step 3: Implement `src/index.ts`**

Replace `src/index.ts`:

```typescript
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "./core/safety.ts";
import {
  createInitialState,
  enterPlanMode,
  exitPlanMode,
  restoreState,
} from "./core/state.ts";
import { defaultPlanModeToolNames, normalModeToolNames } from "./core/tools.ts";
import {
  BLOCKED_BUILTIN_TOOLS,
  STATE_ENTRY_TYPE,
  STATUS_KEY,
} from "./shared/constants.ts";
import type { PlanModeState, SessionEntry } from "./shared/types.ts";
import { formatStatus } from "./tui/status.ts";

export default function createExtension(pi: ExtensionAPI): void {
  let state: PlanModeState = createInitialState();
  let previousTools: string[] | undefined;

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
  }

  function clearUi(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  function activatePlanModeTools(): void {
    if (previousTools === undefined) {
      previousTools = pi.getActiveTools();
    }
    pi.setActiveTools(defaultPlanModeToolNames());
  }

  function restoreTools(): void {
    pi.setActiveTools(normalModeToolNames(previousTools));
    previousTools = undefined;
  }

  function doEnter(ctx: ExtensionContext): void {
    state = enterPlanMode(state);
    activatePlanModeTools();
    persist();
    updateUi(ctx);
  }

  function doExit(ctx: ExtensionContext): void {
    state = exitPlanMode(state);
    restoreTools();
    persist();
    updateUi(ctx);
  }

  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only exploration)",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();

      if (command === "exit" || command === "off") {
        doExit(ctx);
        ctx.ui.notify("Plan mode disabled.", "info");
        return;
      }

      if (state.enabled) {
        doExit(ctx);
        ctx.ui.notify("Plan mode disabled. Full access restored.", "info");
      } else {
        doEnter(ctx);
        ctx.ui.notify("Plan mode enabled. Write tools disabled.", "info");
      }
    },
  });

  pi.on("tool_call", async (event) => {
    if (!state.enabled) return;

    if (BLOCKED_BUILTIN_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: `Plan mode blocks '${event.toolName}'. Exit plan mode first with /plan exit.`,
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

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries() as SessionEntry[];
    state = restoreState(entries);

    if (pi.getFlag("plan") === true) {
      state = enterPlanMode(state);
    }

    if (state.enabled) {
      activatePlanModeTools();
    }
    updateUi(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    persist();
    clearUi(ctx);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts tests/helpers.ts
git commit -m "feat: wire plan mode toggle with safety enforcement and session persistence"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run the full check suite**

Run: `cd /Users/lanh/Developer/pi-vault/pi-plan && pnpm check`

This runs `biome lint . && tsc --noEmit && vitest run`. All three must pass.

- [ ] **Step 2: Fix any lint or type errors from biome/tsc**

If biome reports formatting issues, run: `pnpm format`
If biome reports lint issues, fix them manually.
If tsc reports type errors, fix them in the relevant files.

Re-run `pnpm check` until clean.

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve lint and type issues from full check"
```

(Skip this step if Step 1 passed clean.)

- [ ] **Step 4: Verify the file structure**

Run: `find src tests -type f -name '*.ts' | sort`

Expected output:

```
src/core/safety.ts
src/core/state.ts
src/core/tools.ts
src/index.ts
src/shared/constants.ts
src/shared/types.ts
src/tui/status.ts
tests/core/safety.test.ts
tests/core/state.test.ts
tests/core/tools.test.ts
tests/helpers.ts
tests/index.test.ts
tests/tui/status.test.ts
```
