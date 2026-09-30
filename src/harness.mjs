import { randomUUID } from 'node:crypto';
import { executeCodex } from './codex-adapter.mjs';
import { executeClaude } from './claude-adapter.mjs';
import { appendEvent, getTask, saveTask, updateTask } from './database.mjs';
import { runProcess } from './process-runner.mjs';
import { getAgents } from './agent-registry.mjs';
import { assertModelRuntime, routeTask } from './task-router.mjs';

export function submitTask(database, input) {
  if (!input.project || !input.objective) throw new Error('project and objective are required');
  const timestamp = new Date().toISOString();
  const route = input.agent === 'auto' || !input.agent
    ? routeTask(input.objective, getAgents())
    : routeTask(input.objective, getAgents().filter((agent) => agent.runtime === input.agent));
  const task = {
    id: input.id ?? `task-${randomUUID()}`,
    project: input.project,
    objective: input.objective,
    agent: route.agent,
    role: route.role,
    model: route.model,
    status: 'queued',
    verificationCommand: input.verificationCommand ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (!['codex', 'claude'].includes(task.agent)) throw new Error(`Unsupported agent: ${task.agent}`);
  assertModelRuntime(task.agent, task.model);
  saveTask(database, task);
  appendEvent(database, task.id, 'submitted', { agent: task.agent, role: task.role, model: task.model, routingReason: route.reason });
  return task;
}

export async function runTask(database, id, options) {
  const task = getTask(database, id);
  if (!task) throw new Error(`Task not found: ${id}`);
  if (task.status !== 'queued') throw new Error(`Task is not queued: ${task.status}`);
  updateTask(database, id, 'running');
  appendEvent(database, id, 'started', { agent: task.agent, role: task.role, model: task.model });
  const onLog = (text) => appendEvent(database, id, 'log', { text });

  try {
    const executeAgent = task.agent === 'claude' ? executeClaude : executeCodex;
    const agentResult = await executeAgent(task, { ...options, onLog });
    const verification = task.verificationCommand
      ? await runProcess(task.verificationCommand, [], {
        cwd: task.project, shell: true, onStdout: onLog, onStderr: onLog,
        signal: options.signal, timeoutMs: options.verificationTimeoutMs ?? 300_000,
      })
      : null;
    const result = {
      ...agentResult,
      verification: verification ? [{ command: task.verificationCommand, exitCode: verification.exitCode }] : [],
    };
    const status = verification && verification.exitCode !== 0 ? 'failed' : 'completed';
    updateTask(database, id, status, result);
    appendEvent(database, id, 'finished', { status, verification: result.verification });
    return getTask(database, id);
  } catch (error) {
    const status = error.message === 'Process cancelled' ? 'cancelled' : 'failed';
    updateTask(database, id, status, { error: error.message });
    appendEvent(database, id, status, { error: error.message });
    throw error;
  }
}
