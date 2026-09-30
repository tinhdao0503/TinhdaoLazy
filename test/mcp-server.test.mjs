import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('serves read-only MCP tools over newline-delimited stdio', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agent-harness-mcp-'));
  const child = spawn(process.execPath, [resolve('src', 'mcp-server.mjs')], {
    env: { ...process.env, AGENT_HARNESS_HOME: home },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const messages = [];
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
    const lines = output.split('\n');
    output = lines.pop();
    messages.push(...lines.filter(Boolean).map(JSON.parse));
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  child.stdin.end();
  await new Promise((resolvePromise) => child.on('close', resolvePromise));
  assert.equal(messages[0].result.serverInfo.name, 'agent-harness-local');
  assert.deepEqual(messages[1].result.tools.map((tool) => tool.name), ['harness_status', 'harness_catalog']);
});
