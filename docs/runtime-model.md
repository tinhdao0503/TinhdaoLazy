# Runtime Model

## Core

`agent-harness serve` starts one local HTTP control plane bound to `127.0.0.1:4310`.
It owns task state, process supervision, verification evidence, agent health, and the dashboard.
State lives under `~/.agent-harness-local/harness.db` unless `AGENT_HARNESS_HOME` overrides it.

## Project Bootstrap

`agent-harness add .` creates `.agent-harness/project.json` and registers the project centrally.
It does not alter editor, agent, hook, MCP, or global settings.

`agent-harness add . --integrate` also creates reviewed adapter files under
`.agent-harness/integrations/`:

- `claude-settings.json`: Claude Code SessionStart and Stop hook bridge.
- `mcp.json`: read-only MCP server configuration.
- `AGENTS.snippet.md`: Codex instruction snippet.

These files are generated but not silently merged into existing user configuration.

## Hooks

Hooks call `agent-harness hook <event>` and persist bounded event payloads in SQLite.
Hooks do not execute tasks, change permissions, or inject policy.

## MCP

`agent-harness mcp` runs a local stdio MCP server. It exposes only:

- `harness_status`
- `harness_catalog`

MCP cannot submit, run, cancel, retry, or modify tasks. Execution stays in the control plane.

## Agents

- Codex: implementation, debugging, refactoring, tests.
- Claude Code: specification, planning, review, knowledge curation.
- Antigravity: interactive visual review until a stable headless interface exists.

## Security Boundary

- HTTP binds to loopback only.
- ClaudeKit remains read-only.
- No global hooks or MCP entries are installed automatically.
- Project config contains no credentials.
- Agent processes run in the selected project with explicit timeout and cancellation.
