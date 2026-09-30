import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { listEvents, openDatabase } from '../src/database.mjs';
import { runTask, submitTask } from '../src/harness.mjs';

const testDirectory = dirname(fileURLToPath(import.meta.url));

test('submit, execute, verify, and persist a Codex task', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'agent-harness-'));
  const database = openDatabase(join(workspace, 'harness.db'));
  const task = submitTask(database, {
    id: 'task-test',
    project: workspace,
    objective: 'Run fake task',
    verificationCommand: `${JSON.stringify(process.execPath)} -e "process.exit(0)"`,
  });
  const completed = await runTask(database, task.id, {
    rootDirectory: resolve(testDirectory, '..'),
    runtimeDirectory: join(workspace, 'runs'),
    codexCommand: process.execPath,
    codexArgs: (_task, resultPath) => [resolve(testDirectory, 'fixtures', 'fake-codex.mjs'), resultPath],
  });

  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.summary, 'Fake task completed');
  assert.equal(completed.result.verification[0].exitCode, 0);
  assert.deepEqual(listEvents(database, task.id).map((event) => event.type), [
    'submitted', 'started', 'log', 'finished',
  ]);
});

test('executes a Claude task using the same result contract', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'agent-harness-claude-'));
  const database = openDatabase(join(workspace, 'harness.db'));
  const task = submitTask(database, {
    id: 'task-claude', project: workspace, objective: 'Run fake review', agent: 'claude',
  });
  const completed = await runTask(database, task.id, {
    rootDirectory: resolve(testDirectory, '..'),
    runtimeDirectory: join(workspace, 'runs'),
    claudeCommand: process.execPath,
    claudeArgs: () => [resolve(testDirectory, 'fixtures', 'fake-claude.mjs')],
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.summary, 'Fake Claude task completed');
});
