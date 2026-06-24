# @pi-vault/pi-plan

[![npm version](https://img.shields.io/npm/v/%40pi-vault%2Fpi-plan)](https://www.npmjs.com/package/@pi-vault/pi-plan)
[![Quality](https://github.com/pi-vault/pi-plan/actions/workflows/quality.yml/badge.svg?branch=master)](https://github.com/pi-vault/pi-plan/actions/workflows/quality.yml)
[![Node >= 24.15.0](https://img.shields.io/badge/node-%3E%3D24.15.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

Add a read-only planning mode to Pi so the agent explores first, clarifies intent, and produces a decision-complete plan before any code mutation happens. `@pi-vault/pi-plan` installs a `/plan` command, blocks write tools while planning, and offers a clean handoff back to normal execution when the plan is ready.

## Install, Upgrade, And Reload

Install or upgrade the extension:

```bash
pi install npm:@pi-vault/pi-plan
```

Reload Pi after installing or upgrading:

```text
/reload
```

## Quick Start

Enter plan mode:

```text
/plan
```

Enter plan mode and immediately give the agent a planning prompt:

```text
/plan add release notes and update package docs
```

Configure which extra extension tools are available during plan mode:

```text
/plan tools
```

Leave plan mode and restore full tool access:

```text
/plan exit
```

You can also use `/plan off` as an alias for exiting.

## How It Works

### Read-only planning mode

When plan mode is active, the agent stays in exploration and planning mode until you explicitly exit or choose to implement the proposed plan.

### Tool safety

- Built-in `edit` and `write` are blocked.
- `bash` is limited to an allowlisted set of read-only commands.
- Mutating shell commands are blocked with an explicit plan-mode error.
- Safe built-in planning tools stay available: `read`, `bash`, `grep`, `find`, and `ls`.

### Proposed plan detection and handoff

The extension injects a plan-mode system prompt that tells the agent to produce exactly one `<proposed_plan>` block.

When the agent returns a proposed plan, `pi-plan`:

- detects the block automatically
- stores the latest plan in session state
- updates the status/widget UI to show that a plan is ready
- opens a ready menu so you can implement, stay in plan mode, or exit

If you choose **Implement this plan**, plan mode turns off, full tool access is restored, and the plan is sent back into the conversation as the next implementation instruction.

### Menus and `/plan tools`

Running `/plan` while plan mode is already active opens the plan menu.

Depending on state, the menu lets you:

- show the latest proposed plan
- implement the proposed plan
- configure plan-mode tools
- stay in plan mode
- exit plan mode

`/plan tools` opens a paginated selector for optional extension tools. Safe built-in planning tools remain on, blocked built-ins stay blocked, and your extra selections persist across turns and session restore.

### Start Pi directly in plan mode

You can start a session in plan mode with the `--plan` flag:

```bash
pi --plan
```

## Development And Verification

```bash
pnpm install
pnpm check
pnpm run pack:dry-run
pnpm run release:check
```

## License

MIT
