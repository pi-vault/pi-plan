# Changelog

All notable changes to `@pi-vault/pi-plan` are documented in this file.

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
