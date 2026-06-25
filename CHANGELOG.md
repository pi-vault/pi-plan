# Changelog

All notable changes to `@pi-vault/pi-plan` are documented in this file.

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
