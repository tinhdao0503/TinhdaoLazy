# Agent Harness Local

Local multi-agent harness for Claude Code, Codex, and Antigravity.

## Constraints

- ClaudeKit repository is read-only input.
- No global hooks or global policy injection.
- Process execution stays local and CLI-based.
- MCP, if added, exposes read-only catalog/status resources only.
- SQLite stores task state, execution evidence, and audit history.

## First Vertical Slice

Submit a task, route it to Codex, stream logs, collect a structured result, run a verification command, and persist evidence.

## Add To A Project

From this repository:

```powershell
npm link
cd D:\path\to\your-project
agent-harness add .
agent-harness serve
```

Without linking:

```powershell
npx --yes "D:\PYTHON CODE\27.CLAUDE KIT\agent-harness-local" add .
```

After this repository is pushed to GitHub, the same bootstrap works without cloning:

```powershell
npx --yes github:tinhdao0503/TinhdaoLazy add .
```

`add` creates only `.agent-harness/project.json` inside the target project. It does not install hooks, edit `AGENTS.md`, alter MCP settings, or copy runtime code.

## Commands

```powershell
agent-harness add .
agent-harness add . --integrate
agent-harness status .
agent-harness list
npm run web
```

The integration flag generates reviewed Claude hook, MCP, and Codex instruction adapters under `.agent-harness/integrations/`. It never silently merges them into existing agent settings. See `docs/runtime-model.md`.

Runtime state is stored in `data/harness.db`. Codex runs with `workspace-write`, no commit instruction, JSONL logs, and a required structured final result.

Dashboard binds only to `http://127.0.0.1:4310`. It manages project registration, task intake, execution, cancellation, evidence, logs, and the read-only ClaudeKit catalog.
