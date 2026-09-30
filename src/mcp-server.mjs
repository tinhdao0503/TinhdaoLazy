import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { scanClaudeKit } from './claudekit-catalog.mjs';
import { listProjects, listTasks, openDatabase } from './database.mjs';

const home = resolve(process.env.AGENT_HARNESS_HOME ?? resolve(homedir(), '.agent-harness-local'));
const database = openDatabase(resolve(home, 'harness.db'));
const claudeKitRoot = resolve(process.env.CLAUDEKIT_ROOT ?? resolve(import.meta.dirname, '..', '..', 'claudekit-engineer'));
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

lines.on('line', (line) => {
  if (!line.trim()) return;
  try {
    handle(JSON.parse(line));
  } catch (error) {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } });
  }
});

function handle(request) {
  if (request.method === 'initialize') return reply(request.id, {
    protocolVersion: request.params?.protocolVersion ?? '2025-06-18',
    capabilities: { tools: {} },
    serverInfo: { name: 'agent-harness-local', version: '0.1.0' },
  });
  if (request.method === 'notifications/initialized') return;
  if (request.method === 'ping') return reply(request.id, {});
  if (request.method === 'tools/list') return reply(request.id, { tools: [
    tool('harness_status', 'List registered projects and recent tasks'),
    tool('harness_catalog', 'Read ClaudeKit agent, skill, rule, and recipe catalog'),
  ] });
  if (request.method === 'tools/call') {
    if (request.params.name === 'harness_status') return toolResult(request.id, { projects: listProjects(database), tasks: listTasks(database).slice(0, 50) });
    if (request.params.name === 'harness_catalog') return toolResult(request.id, scanClaudeKit(claudeKitRoot));
    return failure(request.id, -32601, 'Unknown tool');
  }
  if (request.id !== undefined) failure(request.id, -32601, 'Method not found');
}

function tool(name, description) {
  return { name, description, inputSchema: { type: 'object', additionalProperties: false } };
}

function toolResult(id, value) {
  reply(id, { content: [{ type: 'text', text: JSON.stringify(value) }] });
}

function failure(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
