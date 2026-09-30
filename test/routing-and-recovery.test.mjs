import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getTask, openDatabase, recoverInterruptedTasks, updateTask } from '../src/database.mjs';
import { submitTask } from '../src/harness.mjs';
import { routeTask } from '../src/task-router.mjs';

const agents = [
  { id: 'codex', available: true, execution: 'cli' },
  { id: 'claude', available: true, execution: 'cli' },
];

test('routes planning work to Claude and implementation work to Codex', () => {
  assert.equal(routeTask('Plan API architecture', agents).agent, 'claude');
  assert.equal(routeTask('Fix failing authentication test', agents).agent, 'codex');
});

test('marks running tasks interrupted after restart', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-recovery-'));
  const database = openDatabase(join(workspace, 'harness.db'));
  const task = submitTask(database, { id: 'task-recovery', project: workspace, objective: 'Fix test', agent: 'codex' });
  updateTask(database, task.id, 'running');
  assert.equal(recoverInterruptedTasks(database), 1);
  assert.equal(getTask(database, task.id).status, 'interrupted');
});
