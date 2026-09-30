const routes = [
  { role: 'ui-ux-designer', signals: ['ui', 'ux', 'visual design', 'screenshot', 'frontend interface'] },
  { role: 'security-reviewer', signals: ['security', 'vulnerability', 'threat', 'owasp', 'permission', 'secret'] },
  { role: 'requirements-analyst', signals: ['requirement', 'acceptance criteria', 'user story', 'scope'] },
  { role: 'architect', signals: ['architecture', 'system design', 'scalability', 'distributed'] },
  { role: 'database-specialist', signals: ['database', 'schema', 'sql', 'postgres', 'mysql', 'sqlite', 'migration'] },
  { role: 'devops-engineer', signals: ['devops', 'docker', 'kubernetes', 'deploy', 'deployment', 'ci/cd', 'pipeline'] },
  { role: 'performance-engineer', signals: ['performance', 'latency', 'benchmark', 'profiling', 'memory leak', 'optimize'] },
  { role: 'planner', signals: ['spec', 'plan', 'roadmap'] },
  { role: 'researcher', signals: ['research', 'investigate', 'compare', 'documentation'] },
  { role: 'code-reviewer', signals: ['code review', 'review', 'audit'] },
  { role: 'tester', signals: ['test', 'coverage', 'e2e', 'playwright'] },
  { role: 'debugger', signals: ['bug', 'debug', 'fix', 'error', 'failure'] },
  { role: 'docs-manager', signals: ['docs', 'document', 'readme', 'wiki'] },
];

export function routeTask(objective, agents) {
  const text = objective.toLowerCase();
  const requestedRole = routes.find((route) => route.signals.some((signal) => matchesSignal(text, signal)))?.role ?? 'fullstack-developer';
  const preferred = agents.find((agent) => agent.id === requestedRole && agent.available && agent.execution === 'cli');
  const fallback = agents.find((agent) => agent.id === 'fullstack-developer' && agent.available)
    ?? agents.find((agent) => agent.available && agent.execution === 'cli');
  const selected = preferred ?? fallback;
  if (!selected) throw new Error('No supported agent runtime is available');
  assertModelRuntime(selected.runtime, selected.model);
  return {
    agent: selected.runtime,
    role: selected.id,
    model: selected.model,
    reason: preferred ? 'Matched ' + selected.id + ' task profile' : requestedRole + ' unavailable; used ' + selected.id,
  };
}

function matchesSignal(text, signal) {
  const escaped = signal.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  return new RegExp('(^|\\W)' + escaped + '(?=\\W|$)', 'i').test(text);
}

export function assertModelRuntime(runtime, model) {
  const prefixes = { codex: 'cx/', claude: 'cc/', antigravity: 'ag/' };
  if (!prefixes[runtime] || !model?.startsWith(prefixes[runtime])) {
    throw new Error('Invalid model route: ' + model + ' cannot run on ' + runtime);
  }
}
