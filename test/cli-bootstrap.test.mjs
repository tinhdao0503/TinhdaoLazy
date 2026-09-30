import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { listEvents, listTasks, openDatabase } from '../src/database.mjs';

const cli = resolve('bin', 'agent-harness.mjs');

test('installs project config, hooks, MCP, and instructions with one command', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-harness-cli-'));
  const project = join(root, 'sample-project');
  const home = join(root, 'home');
  writeFileSync(join(root, 'placeholder'), '');
  spawnSync(process.execPath, ['-e', `require('node:fs').mkdirSync(${JSON.stringify(project)}, {recursive:true})`]);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'sample-project' }));

  const result = spawnSync(process.execPath, [cli, 'add', project], {
    encoding: 'utf8', env: { ...process.env, AGENT_HARNESS_HOME: home },
  });
  assert.equal(result.status, 0, result.stderr);
  const configPath = join(project, '.agent-harness', 'project.json');
  assert.equal(existsSync(configPath), true);
  assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).verificationCommand, 'npm test');
  assert.match(readFileSync(join(project, '.claude', 'settings.local.json'), 'utf8'), /session-start/);
  assert.match(readFileSync(join(project, '.claude', 'settings.local.json'), 'utf8'), /user-prompt/);
  assert.match(readFileSync(join(project, '.cursor', 'hooks.json'), 'utf8'), /codex-subagent-start/);
  assert.match(readFileSync(join(project, '.mcp.json'), 'utf8'), /agent-harness/);
  assert.match(readFileSync(join(project, '.codex', 'config.toml'), 'utf8'), /mcp_servers\.agent-harness/);
  assert.match(readFileSync(join(project, 'AGENTS.md'), 'utf8'), /agent-harness:start/);
  assert.match(readFileSync(join(project, 'AGENTS.md'), 'utf8'), /current chat/);
  assert.doesNotMatch(readFileSync(join(project, 'AGENTS.md'), 'utf8'), /controlled by local dashboard/);

  const second = spawnSync(process.execPath, [cli, 'add', project], {
    encoding: 'utf8', env: { ...process.env, AGENT_HARNESS_HOME: home },
  });
  assert.equal(second.status, 0, second.stderr);
  assert.equal((readFileSync(join(project, 'AGENTS.md'), 'utf8').match(/agent-harness:start/g) ?? []).length, 1);
  assert.equal((JSON.parse(readFileSync(join(project, '.claude', 'settings.local.json'), 'utf8')).hooks.UserPromptSubmit ?? []).length, 1);

  const hook = spawnSync(process.execPath, [cli, 'hook', 'user-prompt'], {
    encoding: 'utf8', input: JSON.stringify({ session_id: 'session-test', cwd: project, model: 'claude-sonnet-5', prompt: 'Build login with tests and security review using subagents' }),
    cwd: project, env: { ...process.env, AGENT_HARNESS_HOME: home },
  });
  assert.equal(hook.status, 0, hook.stderr);
  assert.match(hook.stdout, /mandatory orchestration/);

  for (const [event, payload] of [
    ['subagent-start', { session_id: 'session-test', cwd: project, agent_id: 'child-1', agent_type: 'Explore' }],
    ['post-tool-use', { session_id: 'session-test', cwd: project, agent_id: 'child-1', agent_type: 'Explore', tool_name: 'Bash' }],
    ['session-stop', { session_id: 'session-test', cwd: project }],
  ]) {
    const lifecycle = spawnSync(process.execPath, [cli, 'hook', event], {
      encoding: 'utf8', input: JSON.stringify(payload), cwd: project, env: { ...process.env, AGENT_HARNESS_HOME: home },
    });
    assert.equal(lifecycle.status, 0, lifecycle.stderr);
  }

  const database = openDatabase(join(home, 'harness.db'));
  let [task] = listTasks(database);
  assert.equal(task.status, 'running');
  const stopped = spawnSync(process.execPath, [cli, 'hook', 'subagent-stop'], {
    encoding: 'utf8', input: JSON.stringify({ session_id: 'session-test', cwd: project, agent_id: 'child-1', agent_type: 'Explore' }),
    cwd: project, env: { ...process.env, AGENT_HARNESS_HOME: home },
  });
  assert.equal(stopped.status, 0, stopped.stderr);
  [task] = listTasks(database);
  assert.equal(task.status, 'completed');
  assert.equal(task.role, 'security-reviewer');
  assert.equal(task.agent, 'claude');
  assert.ok(listEvents(database, task.id).some((event) => event.type === 'subagent-start'));
  assert.ok(listEvents(database, task.id).some((event) => event.type === 'lead-stopped'));
  assert.equal(listEvents(database, task.id).find((event) => event.type === 'subagent-start').payload.agent, 'researcher');
  assert.ok(listEvents(database, task.id).some((event) => event.type === 'log'));
});

test('keeps late child events attached to their original chat task', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-harness-overlap-'));
  const project = join(root, 'project');
  const home = join(root, 'home');
  spawnSync(process.execPath, ['-e', `require('node:fs').mkdirSync(${JSON.stringify(project)}, {recursive:true})`]);
  const runHook = (event, payload) => spawnSync(process.execPath, [cli, 'hook', event], {
    encoding: 'utf8', input: JSON.stringify({ session_id: 'shared-session', cwd: project, ...payload }),
    cwd: project, env: { ...process.env, AGENT_HARNESS_HOME: home },
  });

  assert.equal(runHook('user-prompt', { prompt: 'Research the existing architecture before implementation' }).status, 0);
  assert.equal(runHook('subagent-start', { agent_id: 'late-child', agent_type: 'Explore' }).status, 0);
  assert.equal(runHook('session-stop', {}).status, 0);
  assert.equal(runHook('user-prompt', { prompt: 'Implement the approved design' }).status, 0);
  assert.equal(runHook('subagent-stop', { agent_id: 'late-child', agent_type: 'Explore' }).status, 0);

  const database = openDatabase(join(home, 'harness.db'));
  const tasks = listTasks(database);
  const first = tasks.find((entry) => entry.objective.startsWith('Research'));
  const second = tasks.find((entry) => entry.objective.startsWith('Implement'));
  assert.equal(first.status, 'completed');
  assert.equal(second.status, 'running');
  assert.ok(listEvents(database, first.id).some((event) => event.type === 'subagent-stop'));
  assert.ok(!listEvents(database, second.id).some((event) => event.type === 'subagent-stop'));
});
