# Preserve Plan Context Across Mode Switches Design

## Summary

Plan mode and normal mode will share one continuous Pi conversation. Switching modes changes only the extension's active tools, safety policy, UI, persisted enabled state, and per-turn Plan instructions. User and assistant messages, including `<proposed_plan>` blocks, remain available to later turns.

Mode changes requested while Pi is busy will be deferred until `agent_settled`. Only the latest queued transition is applied. This prevents a running turn from combining one mode's system prompt with the other mode's tools.

## Reference Behavior

The design follows behavior confirmed in the referenced source trees:

- Codex stores collaboration mode as thread/session configuration, updates it in place, and renders only the changed mode instructions into model context (`codex-rs/core/src/session/session.rs` and `codex-rs/core/src/context/world_state/collaboration_mode.rs`).
- Codex's same-context implementation action switches to Default mode and submits `Implement the plan.`; clearing context is a separate explicit action (`codex-rs/tui/src/chatwidget/plan_implementation.rs`).
- Codex rejects mode changes while a turn is running (`codex-rs/tui/src/chatwidget/input_flow.rs`).
- Pi executes extension commands during streaming, and an active-tool update can affect the next provider request in the same run (`packages/coding-agent/src/core/agent-session.ts` and `packages/coding-agent/test/suite/regressions/6162-extension-active-tools-next-turn.test.ts`).
- Pi marks the session idle before emitting `agent_settled`, making that event the safe transition boundary.

## Context and Cache Behavior

The context hook will stop removing or rewriting assistant `<proposed_plan>` blocks. It will retain one compatibility responsibility: remove legacy `customType: "proposed-plan"` messages in every mode. Pi converts custom messages to model-visible user messages regardless of their display purpose, so retaining these obsolete v0.3 duplicates would add the same plan twice under different roles.

`latestPlan` remains persisted menu/save state, not a substitute for conversation context. Entering or exiting without another turn preserves it. At the start of the next real turn, a shared cache-clear path removes `latestPlan` and `awaitingAction`, persists the change, and refreshes the UI before applying the selected mode's prompt. Save-plan turns retain their captured plan until their specialized lifecycle finishes.

## Deferred Transition Model

The extension keeps one non-persisted pending record local to `src/index.ts`:

```ts
interface PendingModeTransition {
  enabled: boolean;
  prompt?: string;
  consumePlan?: boolean;
}
```

When Pi is idle, a requested transition applies immediately. When Pi is busy, it replaces the pending record and produces a concise notification. Replacing the whole record gives the latest request precedence and discards intermediate toggles and prompts.

At `agent_settled`, the extension first completes any Save-plan cleanup, then takes and clears the pending record. It changes mode only if the target differs from current state, consumes the cached plan only for implementation, and finally sends the optional prompt. Since Pi is idle at this point, the prompt starts a clean turn through the normal `before_agent_start` flow.

| Request | Idle behavior | Busy behavior |
| --- | --- | --- |
| `/plan` while normal | Enter Plan mode | Queue Plan mode |
| `/plan <prompt>` while normal | Enter, then send prompt | Queue Plan mode and prompt |
| `/plan <prompt>` while already planning | Send prompt | Send as same-mode follow-up |
| `/plan:exit` or Exit action | Exit Plan mode | Queue normal mode |
| Implement action | Exit, consume cache, send `Implement the plan.` | Queue those three actions |
| Show plan or Stay | Perform immediately | Perform immediately |
| Configure tools | Open selector | Warn that configuration requires idle Pi |

An opposite request may replace a pending transition even when the current mode already matches the new target. This lets `/plan:exit` cancel a queued entry and `/plan` cancel a queued exit. Session shutdown discards the pending in-memory request; it must not leak into another session or require a state migration.

## Components

- `src/core/context.ts` will retain plan capture and a small legacy-custom-message filter; assistant plan sanitization is removed.
- `src/core/state.ts` will preserve `latestPlan` on entry while continuing to reset `awaitingAction`.
- `src/index.ts` will own pending transitions, shared turn-start cache clearing, deferred settlement, and same-context implementation submission.
- Existing Save-plan, safety, tool-selection, and menu modules keep their responsibilities. No new module or dependency is needed.

## Error Handling

- Mode-changing commands never call `setActiveTools` while Pi is busy.
- Tool configuration while busy reports a warning instead of queuing an interactive modal.
- A later transition safely replaces the earlier pending transition; there is no FIFO replay.
- Save-plan settlement runs before a deferred mode transition so temporary write access is removed before normal tools are restored or Plan tools are reapplied.
- Existing Pi runtime error reporting remains responsible for failures when an idle deferred prompt starts.

## Test Strategy

- Verify assistant plan blocks survive context transformation in both modes while legacy custom duplicates are removed in both modes.
- Verify exit and re-entry without a turn preserve `latestPlan`; the next normal or Plan turn clears and persists only the cache.
- Verify idle implementation switches immediately and submits exactly `Implement the plan.`.
- Verify busy entry, exit, and implementation leave current tools/state/messages unchanged until `agent_settled`, then apply atomically.
- Verify the latest busy transition replaces an earlier one, including cancellation by a target matching the current mode.
- Verify Save-plan cleanup precedes a pending transition and session shutdown drops pending work.
- Run `pnpm check` and `pnpm run pack:dry-run` as final verification.

## Non-Goals

- No Shift-Tab mode cycling, fresh-context implementation option, new persisted field, migration, dependency, or session branch.
- No changes to Plan-mode shell safety, Save-plan authorization, tool-selection persistence, or proposed-plan parsing format.
