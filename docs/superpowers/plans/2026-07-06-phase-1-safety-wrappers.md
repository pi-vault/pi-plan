# Phase 1: Try/Catch Safety Wrappers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add try/catch safety wrappers around `pi.getAllTools()` and `pi.getActiveTools()` to prevent crashes when called before the extension runtime is fully bound.

**Architecture:** Two new exported functions in `src/core/tools.ts`, two call-site replacements in `src/index.ts`.

**Tech Stack:** TypeScript, vitest, `@earendil-works/pi-coding-agent` extension API

---

### Task 1.1: Add safe wrapper functions to tools.ts

**Files:**

- Modify: `src/core/tools.ts`
- Test: `tests/core/tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/core/tools.test.ts` (update the import at the top to include the new functions):

```ts
import {
  defaultPlanModeToolNames,
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
} from "../../src/core/tools.ts";

describe("safeGetAllTools", () => {
  it("returns tools from pi.getAllTools()", () => {
    const tools = [{ name: "read", sourceInfo: { source: "builtin" } }];
    const pi = { getAllTools: () => tools } as any;
    expect(safeGetAllTools(pi)).toEqual(tools);
  });

  it("returns empty array when getAllTools throws", () => {
    const pi = {
      getAllTools: () => {
        throw new Error("not bound");
      },
    } as any;
    expect(safeGetAllTools(pi)).toEqual([]);
  });
});

describe("safeGetActiveTools", () => {
  it("returns tools from pi.getActiveTools()", () => {
    const pi = { getActiveTools: () => ["read", "bash"] } as any;
    expect(safeGetActiveTools(pi)).toEqual(["read", "bash"]);
  });

  it("returns DEFAULT_TOOLS when getActiveTools throws", () => {
    const pi = {
      getActiveTools: () => {
        throw new Error("not bound");
      },
    } as any;
    expect(safeGetActiveTools(pi)).toEqual(["read", "bash", "edit", "write"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/core/tools.test.ts`
Expected: FAIL — `safeGetAllTools` and `safeGetActiveTools` not exported

- [ ] **Step 3: Implement the safe wrappers**

Add to `src/core/tools.ts` (add new imports at the top, add new functions after existing ones):

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ToolSelectorItem } from "../tui/tool-selector-state.ts";
import { DEFAULT_TOOLS, SAFE_BUILTIN_PLAN_TOOLS } from "../shared/constants.ts";

export function safeGetAllTools(pi: ExtensionAPI): ToolSelectorItem[] {
  try {
    return pi.getAllTools() as ToolSelectorItem[];
  } catch {
    return [];
  }
}

export function safeGetActiveTools(pi: ExtensionAPI): string[] {
  try {
    return pi.getActiveTools();
  } catch {
    return [...DEFAULT_TOOLS];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/tools.test.ts`
Expected: PASS

### Task 1.2: Replace direct API calls in index.ts

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Update imports in index.ts**

Change the import from `./core/tools.ts`:

```ts
import {
  normalModeToolNames,
  planModeToolNamesWithSelections,
  safeGetActiveTools,
  safeGetAllTools,
} from "./core/tools.ts";
```

- [ ] **Step 2: Replace `pi.getActiveTools()` in activatePlanModeTools**

Change `activatePlanModeTools` function:

```ts
function activatePlanModeTools(): void {
  if (previousTools === undefined) {
    previousTools = safeGetActiveTools(pi);
  }
  pi.setActiveTools(planModeToolNamesWithSelections(state.selectedToolNames));
}
```

- [ ] **Step 3: Replace `pi.getAllTools()` in runToolSelector**

Change line in `runToolSelector`:

```ts
  async function runToolSelector(ctx: ExtensionContext): Promise<void> {
    const allTools = safeGetAllTools(pi);
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/core/tools.ts src/index.ts tests/core/tools.test.ts
git commit -m "feat: add try/catch safety wrappers for getAllTools and getActiveTools"
```
