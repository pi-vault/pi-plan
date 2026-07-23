# @pi-vault/pi-plan

[![npm version](https://img.shields.io/npm/v/%40pi-vault%2Fpi-plan)](https://www.npmjs.com/package/@pi-vault/pi-plan)
[![Quality](https://github.com/pi-vault/pi-plan/actions/workflows/quality.yml/badge.svg?branch=master)](https://github.com/pi-vault/pi-plan/actions/workflows/quality.yml)
[![Node >= 24.15.0](https://img.shields.io/badge/node-%3E%3D24.15.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

## Description

Plan first, change code second. `@pi-vault/pi-plan` adds a read-only planning workflow to Pi so the agent can inspect the repo, clarify the request, and return a decision-complete implementation plan before any write-capable work starts.

## Screenshots

![Plan mode active in Pi showing the plan-mode widget and status line](docs/assets/plan-mode-active-ui.png)
![Plan mode menu opened from /plan with Configure tools, Stay in Plan mode, and Exit Plan mode options](docs/assets/plan-mode-menu-ui.png)
![Plan-mode tool selector showing built-in tools with policy labels and optional extension tools flagged as user risk](docs/assets/plan-mode-tools-ui.png)

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

Start plan mode:

```text
/plan
```

Start plan mode and send the planning prompt immediately:

```text
/plan prepare the next release notes and docs
```

Open the optional tool selector for plan mode:

```text
/plan:tools
```

Exit plan mode and restore normal tool access:

```text
/plan:exit
```

Start Pi directly in plan mode:

```bash
pi --plan
```

## How Plan Mode Works

When plan mode is active, the agent stays in an explore-first workflow until you explicitly exit or choose to implement the latest proposed plan.

A typical flow looks like this:

1. Enter plan mode with `/plan` or `pi --plan`.
2. Let the agent inspect the repo and ask clarifying questions.
3. Receive exactly one `<proposed_plan>` block when the plan is ready.
4. Choose whether to implement it, stay in plan mode, or exit.

If you choose **Implement this plan**, pi-plan turns plan mode off first, restores full tool access, and immediately sends the full proposed plan back into the conversation as the implementation instruction.

## What’s New In Current Behavior

The current release behavior includes a few workflow improvements beyond the original 0.2.0 command surface:

- Optional plan-mode tool selections persist across Pi sessions.
- Choosing **Implement this plan** directly sends the full proposed plan as the next instruction.
- After a normal exit, the latest proposed plan is available only to the next normal-mode turn, then it is consumed.
- Once plan mode is off, `<proposed_plan>` blocks are stripped from normal assistant context so later turns do not carry stale planning markup forward.

## Command Reference

### `/plan`

- If plan mode is off, `/plan` turns it on.
- If you pass text after `/plan`, that text is sent as the planning prompt.
- If plan mode is already on and you run `/plan` with no arguments, Pi opens the plan-mode menu.

### `/plan:tools`

- Opens the plan-mode tool selector.
- If plan mode is not active yet, Pi enables it first.
- Safe built-in planning tools stay available by default.
- Optional extension tools are opt-in and can remain selected across session restarts.

### `/plan:exit`

- Turns off plan mode.
- Restores the tool set that was active before planning started.
- Preserves the latest plan for the next normal-mode prompt only, then consumes it. To save it, exit and make your next prompt `Write the latest proposed plan to proposed-plan.md`.
- `/plan:exit` does not accept handoff text: `/plan:exit write the plan to proposed-plan.md` exits but does not send the write request. Re-entering plan mode before the next normal prompt discards the pending plan.

### `pi --plan`

Starts Pi directly in plan mode at session startup.

## Safety Model

Plan mode keeps the default workflow read-only:

- built-in `edit` and `write` are blocked
- `bash` is limited to allowlisted read-only commands
- mutating shell commands are blocked with a plan-mode error
- safe built-in planning tools remain available: `read`, `bash`, `grep`, `find`, and `ls`

Optional extension tools are off by default. You can enable them with `/plan:tools`, and those selections persist across sessions. Built-in `edit` and `write` remain blocked even when extra tools are enabled, but non-built-in tools may still expose broader capabilities through their own interfaces, so treat them as deliberate opt-ins.

## Development And Verification

```bash
pnpm install
pnpm check
pnpm run pack:dry-run
pnpm run release:check
```

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for release notes.

## License

MIT — see [`LICENSE`](LICENSE).
