import { spawnSync } from 'node:child_process';

const roles = [
  ['architect', 'claude', 'cc/claude-opus-5'],
  ['brainstormer', 'claude', 'cc/claude-opus-5'],
  ['code-reviewer', 'claude', 'cc/claude-opus-5'],
  ['code-simplifier', 'codex', 'cx/gpt-5.6-sol'],
  ['debugger', 'codex', 'cx/gpt-5.6-sol'],
  ['database-specialist', 'codex', 'cx/gpt-5.6-sol'],
  ['devops-engineer', 'codex', 'cx/gpt-5.6-terra'],
  ['docs-manager', 'claude', 'cc/claude-fable-5-1'],
  ['fullstack-developer', 'codex', 'cx/gpt-5.6-sol'],
  ['git-manager', 'codex', 'cx/gpt-5.6-luna'],
  ['journal-writer', 'claude', 'cc/claude-fable-5-1'],
  ['mcp-manager', 'codex', 'cx/gpt-5.6-terra'],
  ['planner', 'claude', 'cc/claude-opus-5'],
  ['performance-engineer', 'codex', 'cx/gpt-5.6-sol'],
  ['project-manager', 'claude', 'cc/claude-fable-5-1'],
  ['requirements-analyst', 'claude', 'cc/claude-sonnet-5'],
  ['researcher', 'claude', 'cc/claude-sonnet-5'],
  ['security-reviewer', 'claude', 'cc/claude-opus-5'],
  ['tester', 'codex', 'cx/gpt-5.6-terra'],
  ['ui-ux-designer', 'claude', 'cc/claude-sonnet-5'],
];

const runtimes = [
  { id: 'codex', command: 'codex', execution: 'cli' },
  { id: 'claude', command: 'claude', execution: 'cli' },
];

export function getAgentDefinitions() {
  return roles.map(([id, runtime, model]) => ({ id, runtime, model, available: true, execution: 'cli' }));
}

export function getAgents() {
  const availability = new Map(runtimes.map((runtime) => {
    const probe = spawnSync(runtime.command, ['--version'], { encoding: 'utf8', windowsHide: true, shell: true, timeout: 5_000 });
    return [runtime.id, {
      available: probe.status === 0,
      version: probe.status === 0 ? (probe.stdout || probe.stderr).trim().split(/\r?\n/)[0] : null,
      execution: runtime.execution,
    }];
  }));
  return roles.map(([id, runtime, model]) => ({ id, runtime, model, ...availability.get(runtime) }));
}
