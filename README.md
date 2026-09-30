# Agent Harness Local

Local multi-agent harness for Claude Code and Codex, with OpenClaw orchestration support.

## One Command

Private repository, run from the project that should receive the harness:

```bash
gh api repos/tinhdao0503/TinhdaoLazy/contents/bootstrap.sh -H "Accept: application/vnd.github.raw+json" | bash
```

If the repository becomes public:

```bash
curl -fsSL https://raw.githubusercontent.com/tinhdao0503/TinhdaoLazy/main/bootstrap.sh | bash
```

The command installs or updates the CLI, integrates the current project, starts the local control plane in the background, and prints the dashboard URL. Override target project with `AGENT_HARNESS_PROJECT` when needed.

## Constraints

- ClaudeKit repository is read-only input.
- No global hooks or global policy injection.
- Process execution stays local and CLI-based.
- MCP, if added, exposes read-only catalog/status resources only.
- SQLite stores task state, execution evidence, and audit history.

## Runtime Flow

Chat normally in Claude Code or Codex. Project instructions activate the harness, native subagents handle independent work, hooks record lifecycle events, and the dashboard observes execution and evidence.

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

`add` installs project-local harness instructions, Claude/Codex hooks, MCP settings, and project metadata. It does not copy runtime code.

## Commands

```powershell
agent-harness add .
agent-harness status .
agent-harness list
npm run web
```

The add command installs project-local Claude hooks, Claude/Codex MCP settings, and a managed `AGENTS.md` block. Existing files are backed up under `.agent-harness/backups/`. See `docs/runtime-model.md`.

Runtime state is stored in `data/harness.db`. Codex runs with `workspace-write`, no commit instruction, JSONL logs, and a required structured final result.

Dashboard binds only to `http://127.0.0.1:4310`. It observes prompts, tools, subagents, evidence, logs, and the read-only ClaudeKit catalog. Primary task intake remains the normal Claude Code or Codex chat.
