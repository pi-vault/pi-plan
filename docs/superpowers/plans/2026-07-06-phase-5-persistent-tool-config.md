# Phase 5: Persistent Tool Config

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist tool selections to a JSON file at `<agentDir>/extensions/plan-tools.json` so they survive Pi relaunches.

**Architecture:** New `src/core/config.ts` module for file I/O using Pi's `getAgentDir()` utility, converter functions in `src/core/tools.ts`, wired into session_start and tool selector in `src/index.ts`.

**Tech Stack:** TypeScript, Node.js `node:fs/promises`, `getAgentDir` from `@earendil-works/pi-coding-agent`, vitest

**Prerequisite:** Phases 1-4 completed (safe wrappers available for `safeGetAllTools`).

**Key design decision:** Use the SDK-exported `getAgentDir()` (not raw `process.env.PI_CODING_AGENT_DIR`) to resolve the config path. This matches the canonical pattern used by Pi's sandbox and preset extensions, handles tilde expansion, and provides a working fallback (`~/.pi/agent`) when the env var is unset.

---

### Task 5.1: Create config module

**Files:**

- Create: `src/core/config.ts`
- Create: `tests/core/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/config.test.ts`:

```ts
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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getConfigFilePath,
  readToolConfig,
  writeToolConfig,
} from "../../src/core/config.ts";

describe("getConfigFilePath", () => {
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("returns path under PI_CODING_AGENT_DIR when set", () => {
    process.env.PI_CODING_AGENT_DIR = "/home/user/.config/pi";
    expect(getConfigFilePath()).toBe(
      "/home/user/.config/pi/extensions/plan-tools.json",
    );
  });

  it("returns a default path when env var is unset", () => {
    delete process.env.PI_CODING_AGENT_DIR;
    const result = getConfigFilePath();
    expect(result).toMatch(/extensions\/plan-tools\.json$/);
  });
});

describe("readToolConfig", () => {
  let tempDir: string;
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-config-"));
    process.env.PI_CODING_AGENT_DIR = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("returns undefined when file does not exist", async () => {
    expect(await readToolConfig()).toBeUndefined();
  });

  it("returns parsed config when file exists", async () => {
    const dir = join(tempDir, "extensions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "plan-tools.json"),
      JSON.stringify({ read: true, custom: true, edit: false }),
    );

    const config = await readToolConfig();
    expect(config).toEqual({ read: true, custom: true, edit: false });
  });

  it("returns undefined when file contains invalid JSON", async () => {
    const dir = join(tempDir, "extensions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plan-tools.json"), "not json");

    expect(await readToolConfig()).toBeUndefined();
  });
});

describe("writeToolConfig", () => {
  let tempDir: string;
  const originalEnv = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-plan-config-"));
    process.env.PI_CODING_AGENT_DIR = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("writes config to the correct path", async () => {
    const config = { read: true, bash: true, custom: true };
    await writeToolConfig(config);

    const configPath = join(tempDir, "extensions", "plan-tools.json");
    expect(existsSync(configPath)).toBe(true);
    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content).toEqual(config);
  });

  it("creates the extensions directory if missing", async () => {
    await writeToolConfig({ read: true });

    const dir = join(tempDir, "extensions");
    expect(existsSync(dir)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/core/config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the config module**

Create `src/core/config.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const CONFIG_FILENAME = "extensions/plan-tools.json";

export function getConfigFilePath(): string {
  return join(getAgentDir(), CONFIG_FILENAME);
}

export async function readToolConfig(): Promise<
  Record<string, boolean> | undefined
> {
  const filePath = getConfigFilePath();

  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return undefined;
    }
    return parsed as Record<string, boolean>;
  } catch {
    return undefined;
  }
}

export async function writeToolConfig(
  config: Record<string, boolean>,
): Promise<void> {
  const filePath = getConfigFilePath();

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // Silently fail — non-critical persistence
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/config.test.ts`
Expected: PASS

### Task 5.2: Add config converters to tools.ts

**Files:**

- Modify: `src/core/tools.ts`
- Test: `tests/core/tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/tools.test.ts` (update the import at the top):

```ts
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
  selectedNamesToToolConfig,
  toolConfigToSelectedNames,
} from "../../src/core/tools.ts";

describe("toolConfigToSelectedNames", () => {
  it("returns names where value is true, excluding safe builtins", () => {
    const config = {
      read: true,
      bash: true,
      custom: true,
      edit: false,
      another: true,
    };
    const result = toolConfigToSelectedNames(config);
    expect(result).toContain("custom");
    expect(result).toContain("another");
    expect(result).not.toContain("read");
    expect(result).not.toContain("bash");
    expect(result).not.toContain("edit");
  });

  it("returns empty array when all values are false", () => {
    const config = { custom: false, edit: false };
    expect(toolConfigToSelectedNames(config)).toEqual([]);
  });

  it("returns empty array for empty config", () => {
    expect(toolConfigToSelectedNames({})).toEqual([]);
  });
});

describe("selectedNamesToToolConfig", () => {
  it("builds full map from selected names and all tools", () => {
    const allTools = [
      { name: "read", sourceInfo: { source: "builtin" } },
      { name: "bash", sourceInfo: { source: "builtin" } },
      { name: "edit", sourceInfo: { source: "builtin" } },
      { name: "custom", sourceInfo: { source: "extension" } },
      { name: "another", sourceInfo: { source: "extension" } },
    ];
    const selected = ["custom"];
    const config = selectedNamesToToolConfig(selected, allTools);
    expect(config).toEqual({
      read: true,
      bash: true,
      edit: false,
      custom: true,
      another: false,
    });
  });

  it("marks safe builtins as true regardless of selection", () => {
    const allTools = [
      { name: "read", sourceInfo: { source: "builtin" } },
      { name: "grep", sourceInfo: { source: "builtin" } },
    ];
    const config = selectedNamesToToolConfig([], allTools);
    expect(config.read).toBe(true);
    expect(config.grep).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/core/tools.test.ts`
Expected: FAIL — `toolConfigToSelectedNames` and `selectedNamesToToolConfig` not exported

- [ ] **Step 3: Implement converters**

Add to `src/core/tools.ts` (after the safe wrapper functions). Note: `ToolSelectorItem` is already imported at line 3.

```ts
export function toolConfigToSelectedNames(
  config: Record<string, boolean>,
): string[] {
  return Object.entries(config)
    .filter(([name, enabled]) => enabled && !SAFE_BUILTIN_PLAN_TOOLS.has(name))
    .map(([name]) => name);
}

export function selectedNamesToToolConfig(
  selectedNames: string[],
  allTools: ToolSelectorItem[],
): Record<string, boolean> {
  const selected = new Set(selectedNames);
  const config: Record<string, boolean> = {};
  for (const tool of allTools) {
    if (SAFE_BUILTIN_PLAN_TOOLS.has(tool.name)) {
      config[tool.name] = true;
    } else {
      config[tool.name] = selected.has(tool.name);
    }
  }
  return config;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/tools.test.ts`
Expected: PASS

### Task 5.3: Wire config into session_start and tool selector

**Files:**

- Modify: `src/index.ts`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Write the failing test for config loading on session_start**

Add to the `session persistence` describe block in `tests/index.test.ts`.

Note: Tests still manipulate `process.env.PI_CODING_AGENT_DIR` because that's what `getAgentDir()` checks internally. Use top-level imports (no inline `await import()`).

```ts
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

// ... inside the "session persistence" describe block:

it("loads tool selections from config file on session_start", async () => {
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

    expect(mock.activeTools).toContain("custom_tool");
    expect(mock.activeTools).toContain("read");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/index.test.ts`
Expected: FAIL — config file not loaded

- [ ] **Step 3: Wire config loading into session_start**

In `src/index.ts`, add import for config:

```ts
import { readToolConfig, writeToolConfig } from "./core/config.ts";
```

And add the new converter imports alongside the existing tools import:

```ts
import {
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
  selectedNamesToToolConfig,
  toolConfigToSelectedNames,
} from "./core/tools.ts";
```

Update the `session_start` handler:

```ts
pi.on("session_start", async (_event, ctx) => {
  const entries = ctx.sessionManager.getEntries();
  state = restoreState(entries);

  if (pi.getFlag("plan") === true) {
    state = enterPlanMode(state);
  }

  // Load persistent tool config (overrides session-entry selections)
  const toolConfig = await readToolConfig();
  if (toolConfig) {
    state = {
      ...state,
      selectedToolNames: toolConfigToSelectedNames(toolConfig),
    };
  }

  if (state.enabled) {
    activatePlanModeTools();
  }
  updateUi(ctx);
});
```

- [ ] **Step 4: Wire config writing into tool selector save**

In the `runToolSelector` function, after the existing `persist();` call, add config write:

```ts
state = { ...state, selectedToolNames: selections };
activatePlanModeTools();
persist();

// Persist to config file
const allToolsForConfig = safeGetAllTools(pi);
const toolConfig = selectedNamesToToolConfig(selections, allToolsForConfig);
writeToolConfig(toolConfig).catch(() => {});

const count = selections.length;
```

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/config.ts src/core/tools.ts src/index.ts tests/core/config.test.ts tests/core/tools.test.ts tests/index.test.ts
git commit -m "feat: persist tool selections to config file across Pi sessions"
```
