import assert from 'node:assert/strict';
import test from 'node:test';
import { projectActivity } from '../src/activity-projector.mjs';

test('projects primary and child agent layers from JSONL logs', () => {
  const activity = projectActivity([{ id: 'task-1', project: '/project', objective: 'Fix UI', agent: 'codex', status: 'running' }], () => [
    { type: 'submitted', payload: {} },
    { type: 'log', payload: { text: '{"subagent":"tester"}\n{"tool_name":"browser"}\n{"item":{"type":"collab_tool_call","tool":"spawn_agent","receiver_thread_ids":["01a0f0b1-example"]}}' } },
  ]);
  assert.deepEqual(activity[0].layers.map((layer) => layer.label), [
    'Task Router', 'Codex', 'tester', 'browser', 'subagent 01a0f0b1', 'Verification Gate',
  ]);
  assert.equal(activity[0].tree.type, 'task');
  assert.equal(activity[0].tree.children[1].type, 'agent');
  assert.equal(activity[0].counters.agents, 3);
  assert.equal(activity[0].counters.commands, 1);
});
