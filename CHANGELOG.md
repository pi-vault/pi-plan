# Changelog

All notable changes to `@pi-vault/pi-plan` are documented in this file.

## [Unreleased]

### Added

- Register a conflict-free `Ctrl+Alt+P` shortcut to toggle Plan mode (idle or queued when busy).
- Let users independently opt `edit` and `write` into Plan mode through the existing persisted optional tool selector.

### Changed

- Preserve complete conversation context when switching between Plan mode and normal mode; old display-only proposed-plan messages remain filtered to avoid duplicate context.
- Defer mode changes requested during an active turn until Pi is idle, with the latest queued request taking precedence.
- Submit `Implement the plan.` in the retained conversation instead of copying the full cached plan into a new handoff prompt.
- Plan-mode prompt rules and runtime authorization are now driven by the user's selected optional tools so the prompt no longer contradicts explicit opt-in behavior.

## [0.4.0] - 2026-07-26

Pi 0.82.0 or newer is now required.

### Added

- Add an idle-only **Save plan** action that keeps Plan mode active, asks the agent to choose a new lowercase `.md` filename inside the workspace, and grants built-in `write` for that save turn only.

### Changed

- Preserve the latest proposed plan as context for only the first normal-mode turn after exit.
- Send the full proposed plan directly when choosing **Implement this plan**.

### Removed

- Remove exit-time plan file prompts and writes.
- Remove the duplicate display-only proposed-plan timeline message.

## [0.3.0] - 2026-07-07

### Added

- Save the latest proposed plan to a file when implementing or exiting plan mode.
- Persist optional plan-mode tool selections across Pi sessions.
- Show the latest proposed plan in the session timeline as a display-only message.

### Changed

- Strip `<proposed_plan>` blocks from assistant context when plan mode is off.
- Restore persisted tool selections during session start.
- Refresh the README to match the current usage-first workflow.

### Fixed

- Harden tool discovery and active-tool reads with safe fallbacks around host tool APIs.

## [0.2.0] - 2026-06-24

### Added

- Added dedicated `plan:exit` and `plan:tools` commands alongside `plan` for a clearer plan-mode command surface.
- Added a custom TUI tool selector for enabling additional optional tools during plan mode.
- Added built-in search and keyboard-driven selection for plan-mode tool configuration.

### Changed

- Reworked the main `plan` command so arguments are always treated as a planning prompt instead of legacy subcommand text.
- Updated plan-mode menus so users can implement the latest plan, stay in plan mode, exit, or configure tools from the current state.
- Kept implementation handoff behavior explicit: when a stored plan is implemented, plan mode turns off and full tool access is restored before execution continues.
- Preserved the default plan-mode safety rules while aligning the user-facing workflow with the new command layout and keeping extra tool enablement explicitly opt-in.

## [0.1.0] - 2026-06-24

### Added

- Initial public release of `@pi-vault/pi-plan`.
- Added a `/plan` command that enters a read-only planning workflow inside Pi.
- Added a `--plan` startup flag for starting sessions directly in plan mode.
- Added system-prompt injection that guides the agent through explore, clarify, and plan phases and requires a `<proposed_plan>` block.
- Added automatic proposed-plan detection, session persistence for the latest plan, and implementation handoff that restores full tool access before continuing.
- Added plan menus and a plan-ready menu for implementing, staying in plan mode, showing the latest plan, or exiting.
- Added `/plan tools`, a paginated selector for enabling optional extension tools during plan mode while keeping safe built-in planning tools available.
- Added status-line and widget feedback for active planning and plan-ready states.

### Changed

- Enforced plan-mode safety by blocking built-in `edit` and `write` and restricting `bash` to allowlisted read-only commands.
- Completed the package release collateral with a usage-first README, this changelog, and the MIT license for the first published package.
