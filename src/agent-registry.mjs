import { spawnSync } from 'node:child_process';

const definitions = [
  { id: 'codex', command: 'codex', roles: ['implementation', 'debug', 'refactor', 'test'] },
  { id: 'claude', command: 'claude', roles: ['spec-analysis', 'planning', 'review', 'knowledge-curation'] },
  { id: 'antigravity', command: 'antigravity', roles: ['visual-review', 'browser-validation', 'interactive-ide'] },
];

export function getAgents() {
  return definitions.map((definition) => {
    const probe = spawnSync(definition.command, ['--version'], { encoding: 'utf8', windowsHide: true, shell: true, timeout: 5_000 });
    return {
      ...definition,
      available: probe.status === 0,
      version: probe.status === 0 ? (probe.stdout || probe.stderr).trim().split(/\r?\n/)[0] : null,
      execution: definition.id === 'antigravity' ? 'interactive-only' : 'cli',
    };
  });
}
