import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getTask, openDatabase, recoverInterruptedTasks, updateTask } from '../src/database.mjs';
import { submitTask } from '../src/harness.mjs';
import { assertModelRuntime, routeTask } from '../src/task-router.mjs';

const agents = [
  { id: 'architect', runtime: 'claude', model: 'cc/claude-opus-5', available: true, execution: 'cli' },
  { id: 'database-specialist', runtime: 'codex', model: 'cx/gpt-5.6-sol', available: true, execution: 'cli' },
  { id: 'devops-engineer', runtime: 'codex', model: 'cx/gpt-5.6-terra', available: true, execution: 'cli' },
  { id: 'performance-engineer', runtime: 'codex', model: 'cx/gpt-5.6-sol', available: true, execution: 'cli' },
  { id: 'planner', runtime: 'claude', model: 'cc/claude-opus-5', available: true, execution: 'cli' },
  { id: 'requirements-analyst', runtime: 'claude', model: 'cc/claude-sonnet-5', available: true, execution: 'cli' },
  { id: 'security-reviewer', runtime: 'claude', model: 'cc/claude-opus-5', available: true, execution: 'cli' },
  { id: 'debugger', runtime: 'codex', model: 'cx/gpt-5.6-sol', available: true, execution: 'cli' },
  { id: 'tester', runtime: 'codex', model: 'cx/gpt-5.6-terra', available: true, execution: 'cli' },
  { id: 'fullstack-developer', runtime: 'codex', model: 'cx/gpt-5.6-sol', available: true, execution: 'cli' },
];

test('routes planning work to Claude and implementation work to Codex', () => {
  assert.equal(routeTask('Plan API architecture', agents).agent, 'claude');
  assert.equal(routeTask('Fix failing authentication test', agents).agent, 'codex');
  assert.equal(routeTask('Plan API architecture', agents).model, 'cc/claude-opus-5');
  assert.equal(routeTask('Fix failing authentication test', agents).role, 'tester');
  assert.equal(routeTask('Design scalable system architecture', agents).role, 'architect');
  assert.equal(routeTask('Review OWASP security threats', agents).role, 'security-reviewer');
  assert.equal(routeTask('Optimize database query latency', agents).role, 'database-specialist');
  assert.equal(routeTask('Build Docker deployment pipeline', agents).role, 'devops-engineer');
  assert.equal(routeTask('Profile CPU and memory leak', agents).role, 'performance-engineer');
  assert.equal(routeTask('Define user story acceptance criteria', agents).role, 'requirements-analyst');
});

test('rejects models assigned across runtime namespaces', () => {
  assert.doesNotThrow(() => assertModelRuntime('codex', 'cx/gpt-5.6-sol'));
  assert.doesNotThrow(() => assertModelRuntime('claude', 'cc/claude-sonnet-5'));
  assert.throws(() => assertModelRuntime('codex', 'cc/claude-sonnet-5'), /Invalid model route/);
  assert.throws(() => assertModelRuntime('claude', 'cx/gpt-5.6-sol'), /Invalid model route/);
  assert.throws(() => assertModelRuntime('unknown', 'unknown/model'), /Invalid model route/);
});

test('marks running tasks interrupted after restart', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-recovery-'));
  const database = openDatabase(join(workspace, 'harness.db'));
  const task = submitTask(database, { id: 'task-recovery', project: workspace, objective: 'Fix test', agent: 'codex' });
  updateTask(database, task.id, 'running');
  assert.equal(recoverInterruptedTasks(database), 1);
  assert.equal(getTask(database, task.id).status, 'interrupted');
});
