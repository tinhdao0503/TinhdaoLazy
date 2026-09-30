# Runtime Model

## Core

`agent-harness serve` starts one local HTTP control plane bound to `127.0.0.1:4310`.
It owns task state, process supervision, verification evidence, agent health, and the dashboard.
State lives under `~/.agent-harness-local/harness.db` unless `AGENT_HARNESS_HOME` overrides it.

## Project Bootstrap

`agent-harness add .` performs full project-local installation and registers the project centrally.
It creates `.agent-harness/project.json`, merges Claude hooks into `.claude/settings.local.json`,
adds project MCP configuration to `.mcp.json` and `.codex/config.toml`, and appends a managed
Agent Harness block to `AGENTS.md`. Existing files are backed up under `.agent-harness/backups/`.
Global user settings remain untouched.

## Hooks

Hooks call `agent-harness hook <event>` and persist bounded event payloads in SQLite.
Claude `UserPromptSubmit` and `SessionStart` hooks inject orchestration context into the current chat.
Subagent and tool hooks record lifecycle events. Hooks do not change permissions or execute a second competing agent process.
Codex receives the same orchestration contract through `AGENTS.md`; project hook events are recorded when its host supports `.cursor/hooks.json`.

## MCP

`agent-harness mcp` runs a local stdio MCP server. It exposes only:

- `harness_status`
- `harness_catalog`

MCP cannot submit, run, cancel, retry, or modify tasks. Execution stays inside the active Claude Code or Codex chat.

## Agents

- Codex: implementation, debugging, refactoring, tests, databases, DevOps, performance.
- Claude Code: requirements, architecture, planning, security review, research, knowledge curation, UI and visual review.
- OpenClaw: hook-enabled orchestration, durable tasks, audit, and session memory; not a model worker.

Registry contains 20 roles. Model namespaces are enforced before execution:

- Codex roles use only `cx/*`.
- Claude roles use only `cc/*`.

Gemini is disabled until its local TLS certificate-chain error is fixed. Hermes is disabled until hooks are configured and its pending update succeeds. OpenCode remains available for ACP/headless use but is not selected because it has no native hook command.

## Security Boundary

- HTTP binds to loopback only.
- ClaudeKit remains read-only.
- No global hooks or MCP entries are installed automatically.
- Project config contains no credentials.
- Agent processes run in the selected project with explicit timeout and cancellation.
