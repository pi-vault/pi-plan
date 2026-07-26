# Incremental Architecture Phase Split Design

**Goal:** Split the existing incremental architecture implementation plan into one umbrella plan and five atomic phase plans without changing the existing parent plan.

## Design

The current parent plan remains the source document and is preserved byte-for-byte. A sibling umbrella plan describes the sequence, invariants, dependencies, usable result of each phase, and final acceptance. Five sibling plans contain complete execution instructions rather than requiring an implementer to consult the parent for missing code, tests, commands, or expected outcomes.

The phases follow the existing dependency order:

1. Inline status/widget formatting and delete shallow UI seams.
2. Fix standalone plan delimiters and deepen context operations with Pi types.
3. Consolidate tool policy/persistence and move shell patterns behind safety.
4. Collapse selector state/render internals behind the factory and rely on Pi TUI render scheduling.
5. Isolate Save lifecycle, align first-block test semantics, and perform complete acceptance.

Each phase starts from the previous verified commit, preserves existing behavior except the explicitly approved delimiter correction, and ends with focused tests, `pnpm check`, `git diff --check`, and one atomic commit. Phase 5 adds packaging and a no-model Pi TUI smoke test.

## Boundaries

- Preserve the current parent plan exactly.
- Do not add source code, dependencies, commands, persistence formats, or product behavior.
- Use Pi's official event and `ToolInfo` types in the copied implementation plans.
- Keep Node engine `>=24.15.0`.
- Keep the existing Save authorization policy and wording.

## Acceptance

Confirm all five phase plans map directly to the parent’s five refactors, all links resolve, no placeholders or contradictory interfaces remain, and the parent file hash is unchanged after document creation.
