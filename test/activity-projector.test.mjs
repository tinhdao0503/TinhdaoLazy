import assert from 'node:assert/strict';
import test from 'node:test';
import { projectActivity } from '../src/activity-projector.mjs';

test('projects primary and child agent layers from JSONL logs', () => {
  const activity = projectActivity([{ id: 'task-1', project: '/project', objective: 'Fix UI', agent: 'codex', status: 'running' }], () => [
    { type: 'submitted', payload: {} },
    { type: 'log', payload: { text: '{"subagent":"tester"}\n{"tool_name":"browser"}' } },
  ]);
  assert.deepEqual(activity[0].layers.map((layer) => layer.label), [
    'Task Supervisor', 'Task Router', 'Codex', 'tester', 'browser', 'Verification Gate',
  ]);
});
