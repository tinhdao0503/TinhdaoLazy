export function projectActivity(tasks, eventReader) {
  return tasks.filter((task) => ['running', 'queued'].includes(task.status)).map((task) => {
    const events = eventReader(task.id);
    const children = events.flatMap((event) => extractChildren(event)).filter((value, index, values) => values.indexOf(value) === index);
    const hasVerification = events.some((event) => event.type === 'finished' && event.payload.verification?.length);
    return {
      taskId: task.id,
      project: task.project,
      objective: task.objective,
      status: task.status,
      role: task.role,
      model: task.model,
      layers: [
        { id: 'supervisor', label: 'Task Supervisor', status: task.status === 'running' ? 'active' : 'waiting' },
        { id: 'router', label: 'Task Router', status: events.some((event) => event.type === 'submitted') ? 'complete' : 'waiting' },
        { id: 'primary', label: task.role && task.model ? task.role + ' · ' + task.model : task.agent === 'claude' ? 'Claude Code' : 'Codex', status: task.status === 'running' ? 'active' : 'waiting' },
        ...children.map((label) => ({ id: `child-${label}`, label, status: 'active' })),
        { id: 'verification', label: 'Verification Gate', status: hasVerification ? 'complete' : 'waiting' },
      ],
    };
  });
}

function extractChildren(event) {
  if (event.type !== 'log') return [];
  const text = event.payload.text ?? '';
  return text.split(/\r?\n/).flatMap((line) => {
    try {
      const value = JSON.parse(line);
      const item = value.item ?? value;
      const labels = [];
      const label = item.agent_name ?? item.agent ?? item.subagent ?? item.tool_name ?? item.tool;
      if (label) labels.push(String(label));
      if (item.type === 'collab_tool_call') {
        labels.push(...(item.receiver_thread_ids ?? []).map((id) => `subagent ${String(id).slice(0, 8)}`));
      }
      if (item.type === 'command_execution') labels.push('command execution');
      return labels;
    } catch {
      return [];
    }
  });
}
