# Incremental Architecture Deepening — Phased Plan

> **For agentic workers:** Execute the linked phase plans in order using `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Each phase must be complete and verified before starting the next.

**Goal:** Deepen pi-plan's shallow modules and concentrate Plan mode behavior behind coherent interfaces while preserving the Pi 0.82 extension contract.

**Architecture:** Five sequential refactors move from deletion and inlining to event-boundary consolidation. `src/index.ts` remains the Pi event coordinator; core modules own context, tools, safety, and Save lifecycle; the TUI selector owns its private state and rendering. No new dependency, adapter, persistence format, command, or product behavior is introduced.

**Tech Stack:** TypeScript ESM, Node.js >=24.15.0, Vitest, Biome, Pi coding-agent 0.82 extension types, Pi TUI 0.82.

---

## Invariants

- Preserve the extension entry point, `--plan`, `/plan`, `/plan:exit`, `/plan:tools`, labels, status/widget text, session persistence, tool JSON shape, and agent-mediated writes.
- Use Pi's exported event and `ToolInfo` types; do not recreate competing public shapes.
- The only intentional behavior correction is line-anchored proposed-plan delimiter parsing.
- Preserve existing Save authorization policy and wording, including its root-directory wording mismatch.
- Keep the package engine at `>=24.15.0`.
- Preserve the current working-tree contents of `2026-07-25-incremental-architecture-deepening.md`; it is the source plan and is not rewritten.

## Execution order

| Phase | Plan                                                                                                  | Usable result                                                    | Depends on             |
| ----- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------- |
| 1     | [Inline UI formatting](2026-07-25-incremental-architecture-deepening-phase-1-inline-ui-formatting.md) | Same Plan-mode UI with deleted formatter seams                   | Baseline tests passing |
| 2     | [Context handling](2026-07-25-incremental-architecture-deepening-phase-2-context-handling.md)         | Correct standalone plan extraction and one context seam          | Phase 1                |
| 3     | [Tool policy](2026-07-25-incremental-architecture-deepening-phase-3-tool-policy.md)                   | Same tool behavior with one core policy/persistence owner        | Phase 2                |
| 4     | [Tool selector](2026-07-25-incremental-architecture-deepening-phase-4-tool-selector.md)               | Fully usable `/plan:tools` selector with private internals       | Phase 3                |
| 5     | [Save lifecycle](2026-07-25-incremental-architecture-deepening-phase-5-save-lifecycle.md)             | Complete refactor accepted by tests, packaging, and Pi TUI smoke | Phase 4                |

Each phase plan is self-contained and includes exact files, tests, commands, expected results, and one atomic commit. Do not start a later phase after a preceding phase has an unverified failure or new lint warning.

## Final acceptance

After Phase 5:

```bash
pnpm check
pnpm run pack:dry-run
git diff --check
git status --short
```

From `/Users/lanh/Developer/pi-packages/pi`, run Pi with only this extension:

```bash
pnpm exec pi -ne -e /Users/lanh/Developer/pi-vault/pi-plan/src/index.ts
```

Exercise `/plan`, `/plan:tools`, raw selector navigation, Save/cancel, and `/plan:exit` without calling a real model API. Confirm command registration, rendering, input handling, Save cleanup, and tool restoration.
