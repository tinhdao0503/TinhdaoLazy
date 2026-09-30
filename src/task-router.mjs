export function routeTask(objective, agents) {
  const text = objective.toLowerCase();
  const available = new Set(agents.filter((agent) => agent.available && agent.execution === 'cli').map((agent) => agent.id));
  const claudeSignals = ['spec', 'requirement', 'architecture', 'plan', 'review', 'document', 'knowledge', 'research'];
  const preferred = claudeSignals.some((signal) => text.includes(signal)) ? 'claude' : 'codex';
  const fallback = preferred === 'claude' ? 'codex' : 'claude';
  const agent = available.has(preferred) ? preferred : available.has(fallback) ? fallback : null;
  if (!agent) throw new Error('No supported CLI agent is available');
  return {
    agent,
    reason: agent === preferred ? `Matched ${preferred} task profile` : `${preferred} unavailable; used ${fallback}`,
  };
}
