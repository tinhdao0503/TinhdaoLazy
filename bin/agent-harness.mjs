#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { appendEvent, bindChatSession, countRunningChildAgents, getChatSessionTask, getChildAgentTask, hasEvent, openDatabase, saveTask, startChildAgent, stopChildAgent, updateTask } from '../src/database.mjs';
import { listProjects } from '../src/project-registry.mjs';
import { installProject } from '../src/project-installer.mjs';
import { selectRole } from '../src/task-router.mjs';

const [command = 'help', target = '.', ...flags] = process.argv.slice(2);
const home = resolve(process.env.AGENT_HARNESS_HOME ?? resolve(homedir(), '.agent-harness-local'));
const databasePath = resolve(home, 'harness.db');

if (command === 'add') {
  addProject(resolve(target));
} else if (command === 'serve') {
  process.env.HARNESS_DB ??= databasePath;
  await import('../src/server.mjs');
} else if (command === 'list') {
  console.log(JSON.stringify(listProjects(openDatabase(databasePath)), null, 2));
} else if (command === 'status') {
  showStatus(resolve(target));
} else if (command === 'hook') {
  await recordHook(target, flags);
} else if (command === 'mcp') {
  await import('../src/mcp-server.mjs');
} else {
  printHelp();
}

function addProject(projectPath) {
  const result = installProject(openDatabase(databasePath), { path: projectPath });
  console.log(`Installed ${result.project.name}`);
  console.log(`Changed: ${result.changedFiles.length} integration files`);
  console.log('Run dashboard: agent-harness serve');
}

async function recordHook(event, args) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = Buffer.concat(chunks).subarray(0, 65_536).toString('utf8');
  const database = openDatabase(databasePath);
  const value = parsePayload(payload);
  const project = value.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const sessionId = value.session_id ?? value.sessionId;
  database.prepare(`
    INSERT INTO hook_events (event, project, payload_json, created_at) VALUES (?, ?, ?, ?)
  `).run(event, project, payload || JSON.stringify({ args }), new Date().toISOString());
  if (event === 'user-prompt' && sessionId) startChatTask(database, sessionId, project, value);
  else if (sessionId) recordChatLifecycle(database, sessionId, event, value);
  if (event === 'user-prompt' || event === 'session-start') {
    const role = event === 'user-prompt' ? selectRole(value.prompt ?? '') : 'lead-agent';
    const contract = event === 'user-prompt' ? orchestrationContract(value.prompt ?? '', role) : 'Agent Harness is active for this session.';
    console.log(JSON.stringify({ hookSpecificOutput: {
      hookEventName: event === 'user-prompt' ? 'UserPromptSubmit' : 'SessionStart',
      additionalContext: contract,
    } }));
  }
}

function parsePayload(payload) {
  try { return payload ? JSON.parse(payload) : {}; } catch { return {}; }
}

function startChatTask(database, sessionId, project, payload) {
  const previous = getChatSessionTask(database, sessionId);
  if (previous && countRunningChildAgents(database, previous) === 0) updateTask(database, previous, 'completed', { source: 'chat', reason: 'Superseded by next prompt' });
  const timestamp = new Date().toISOString();
  const role = selectRole(payload.prompt ?? '');
  const rawModel = payload.model ?? 'claude-sonnet-5';
  const model = rawModel.startsWith('cc/') ? rawModel : 'cc/' + rawModel;
  const task = { id: 'chat-' + randomUUID(), project, objective: payload.prompt ?? 'Claude chat request', agent: 'claude', role, model, status: 'running', verificationCommand: null, createdAt: timestamp, updatedAt: timestamp };
  saveTask(database, task);
  bindChatSession(database, sessionId, task.id, project);
  appendEvent(database, task.id, 'submitted', { source: 'chat-hook', sessionId, agent: task.agent, role, model });
  appendEvent(database, task.id, 'started', { source: 'chat-hook', sessionId, agent: task.agent, role, model });
}

function recordChatLifecycle(database, sessionId, event, payload) {
  const agentId = payload.agent_id ?? payload.agentId;
  const taskId = agentId ? getChildAgentTask(database, agentId) ?? getChatSessionTask(database, sessionId) : getChatSessionTask(database, sessionId);
  if (!taskId) return;
  const role = normalizeChildRole(payload.agent_type ?? payload.agent_name);
  appendEvent(database, taskId, event, { tool: payload.tool_name, agent: role, agentId, status: payload.status });
  if (event === 'post-tool-use') appendEvent(database, taskId, 'log', { text: JSON.stringify({ item: { type: 'command_execution', command: payload.tool_name ?? 'tool', status: 'completed' } }) });
  if (event === 'subagent-start') {
    startChildAgent(database, agentId ?? taskId + ':' + role, taskId, role);
    appendEvent(database, taskId, 'log', { text: JSON.stringify({ agent_id: agentId, subagent: role }) });
  }
  if (event === 'subagent-stop') {
    if (agentId) stopChildAgent(database, agentId);
    appendEvent(database, taskId, 'log', { text: JSON.stringify({ agent_id: agentId, subagent: role, status: 'completed' }) });
    completeStoppedTask(database, taskId);
  }
  if (event === 'session-stop') {
    appendEvent(database, taskId, 'lead-stopped', { runningChildAgents: countRunningChildAgents(database, taskId) });
    completeStoppedTask(database, taskId);
  }
}

function completeStoppedTask(database, taskId) {
  if (hasEvent(database, taskId, 'lead-stopped') && countRunningChildAgents(database, taskId) === 0) {
    updateTask(database, taskId, 'completed', { source: 'chat', verification: [] });
  }
}

function normalizeChildRole(value) {
  if (!value) return 'subagent';
  const role = String(value).toLowerCase();
  return { explore: 'researcher', plan: 'planner', 'general-purpose': 'fullstack-developer' }[role] ?? role;
}

function orchestrationContract(prompt, primaryRole) {
  const complex = prompt.trim().length >= 80 || /build|implement|create|fix|refactor|design|test|review|migrate|deploy/i.test(prompt);
  if (!complex) return 'Agent Harness is active. Handle this request in the current chat as ' + primaryRole + '. Use dashboard only for observation.';
  return [
    'Agent Harness mandatory orchestration is active for this non-trivial request.',
    'Stay in this chat. Lead role: ' + primaryRole + '.',
    'Before editing, spawn native subagents for independent analysis and implementation work.',
    'Required minimum: one specialist for the primary role, tester, and code-reviewer. Add architect, security-reviewer, database-specialist, devops-engineer, or performance-engineer when relevant.',
    'Run independent subagents in parallel. Lead agent owns integration, conflict resolution, verification, and final response.',
    'Do not claim completion without verification evidence. Dashboard is observation only.',
  ].join(' ');
}

function showStatus(projectPath) {
  const configPath = resolve(projectPath, '.agent-harness', 'project.json');
  if (!existsSync(configPath)) {
    console.error('Project is not added. Run: agent-harness add .');
    process.exitCode = 1;
    return;
  }
  console.log(readFileSync(configPath, 'utf8').trim());
}

function printHelp() {
  console.log(`Agent Harness Local

Usage:
  agent-harness add [project-path]
  agent-harness status [project-path]
  agent-harness list
  agent-harness serve
  agent-harness mcp

Environment:
  AGENT_HARNESS_HOME   State directory (default: ~/.agent-harness-local)
  PORT                 Dashboard port (default: 4310)`);
}
