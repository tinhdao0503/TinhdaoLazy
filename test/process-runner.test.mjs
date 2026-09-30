import assert from 'node:assert/strict';
import test from 'node:test';
import { runProcess } from '../src/process-runner.mjs';

test('cancels a running process', async () => {
  const controller = new AbortController();
  const execution = runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(execution, /Process cancelled/);
});

test('times out a running process', async () => {
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 30 }),
    /timed out/,
  );
});
