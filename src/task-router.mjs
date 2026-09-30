const routes = [
  { role: 'ui-ux-designer', signals: ['ui', 'ux', 'visual', 'screenshot', 'design'] },
  { role: 'planner', signals: ['spec', 'requirement', 'architecture', 'plan'] },
  { role: 'researcher', signals: ['research', 'investigate', 'compare', 'documentation'] },
  { role: 'code-reviewer', signals: ['review', 'audit', 'security'] },
  { role: 'tester', signals: ['test', 'coverage', 'e2e', 'playwright'] },
  { role: 'debugger', signals: ['bug', 'debug', 'fix', 'error', 'failure'] },
  { role: 'docs-manager', signals: ['docs', 'document', 'readme', 'wiki'] },
];

export function routeTask(objective, agents) {
  const text = objective.toLowerCase();
  const requestedRole = routes.find((route) => route.signals.some((signal) => text.includes(signal)))?.role ?? 'fullstack-developer';
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

export function assertModelRuntime(runtime, model) {
  const prefixes = { codex: 'cx/', claude: 'cc/', antigravity: 'ag/' };
  if (!prefixes[runtime] || !model?.startsWith(prefixes[runtime])) {
    throw new Error('Invalid model route: ' + model + ' cannot run on ' + runtime);
  }
}
