export function projectActivity(tasks, eventReader) {
  return tasks.filter((task) => ['running', 'queued'].includes(task.status)).map((task) => {
    const events = eventReader(task.id);
    const children = projectChildren(events);
    const primaryLabel = task.role && task.model
      ? task.role + ' · ' + task.model
      : task.agent === 'claude' ? 'Claude Code' : 'Codex';
    const hasVerification = events.some((event) => event.type === 'finished' && event.payload.verification?.length);
    const tree = {
      id: task.id, type: 'task', label: task.objective, status: task.status, meta: task.project,
      children: [
        {
          id: 'router', type: 'router', label: 'Task Router',
          status: events.some((event) => event.type === 'submitted') ? 'complete' : 'waiting',
          meta: task.agent + ' · ' + (task.role ?? 'default'), children: [],
        },
        {
          id: 'primary', type: 'agent', label: primaryLabel,
          status: task.status === 'running' ? 'active' : 'waiting', meta: task.agent, children,
        },
        {
          id: 'verification', type: 'gate', label: 'Verification Gate',
          status: hasVerification ? 'complete' : 'waiting', meta: hasVerification ? 'evidence recorded' : 'pending', children: [],
        },
      ],
    };
    return {
      taskId: task.id, project: task.project, objective: task.objective, status: task.status,
      role: task.role, model: task.model, tree,
      counters: {
        agents: countNodes(tree, 'agent'), commands: countNodes(tree, 'command'), active: countStatus(tree, 'active'),
      },
      timeline: events.slice(-12).map((event) => ({ type: event.type, createdAt: event.createdAt })),
      layers: flattenTree(tree).slice(1).map(({ id, label, status }) => ({ id, label, status })),
    };
  });
}

function projectChildren(events) {
  const nodes = new Map();
  for (const event of events) {
    if (event.type !== 'log') continue;
    for (const line of (event.payload.text ?? '').split(/\r?\n/)) {
      try {
        const value = JSON.parse(line);
        const item = value.item ?? value;
        if (item.type === 'collab_tool_call') {
          for (const threadId of item.receiver_thread_ids ?? []) {
            const id = String(threadId);
            nodes.set('agent-' + id, {
              id: 'agent-' + id, type: 'agent', label: item.agent_name ?? 'subagent ' + id.slice(0, 8),
              status: item.status === 'completed' ? 'complete' : 'active', meta: id, children: [],
            });
          }
          continue;
        }
        if (item.type === 'command_execution') {
          const label = item.command ?? item.cmd ?? 'command execution';
          nodes.set('command-' + label, {
            id: 'command-' + label, type: 'command', label,
            status: item.status === 'completed' ? 'complete' : 'active', meta: 'shell', children: [],
          });
          continue;
        }
        const label = item.agent_name ?? item.subagent;
        const agentKey = item.agent_id ?? label;
        if (label) nodes.set('agent-' + agentKey, {
          id: 'agent-' + agentKey, type: 'agent', label: String(label), status: item.status === 'completed' ? 'complete' : 'active', meta: item.agent_id ?? 'runtime child', children: [],
        });
        const tool = item.tool_name ?? item.tool;
        if (tool && tool !== 'spawn_agent') nodes.set('tool-' + tool, {
          id: 'tool-' + tool, type: 'command', label: String(tool), status: 'active', meta: 'tool', children: [],
        });
      } catch {
        // Non-JSON logs remain available in task event log.
      }
    }
  }
  return [...nodes.values()];
}

function flattenTree(node) {
  return [node, ...node.children.flatMap(flattenTree)];
}

function countNodes(node, type) {
  return flattenTree(node).filter((entry) => entry.type === type).length;
}

function countStatus(node, status) {
  return flattenTree(node).filter((entry) => entry.status === status).length;
}
