import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { scanClaudeKit } from './claudekit-catalog.mjs';
import { getAgents } from './agent-registry.mjs';
import { getTask, listEvents, listTasks, openDatabase, recoverInterruptedTasks } from './database.mjs';
import { submitTask } from './harness.mjs';
import { listProjects, registerProject } from './project-registry.mjs';
import { TaskSupervisor } from './task-supervisor.mjs';

const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicDirectory = resolve(rootDirectory, 'public');
const harnessHome = resolve(process.env.AGENT_HARNESS_HOME ?? resolve(homedir(), '.agent-harness-local'));
const database = openDatabase(process.env.HARNESS_DB ?? resolve(harnessHome, 'harness.db'));
recoverInterruptedTasks(database);
const claudeKitRoot = resolve(process.env.CLAUDEKIT_ROOT ?? resolve(rootDirectory, '..', 'claudekit-engineer'));
const supervisor = new TaskSupervisor(database, {
  rootDirectory,
  runtimeDirectory: resolve(rootDirectory, 'data', 'runs'),
  timeoutMs: Number(process.env.HARNESS_TASK_TIMEOUT_MS ?? 1_800_000),
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/api/status') {
      return json(response, 200, { ok: true, running: supervisor.runningIds(), now: new Date().toISOString() });
    }
    if (request.method === 'GET' && url.pathname === '/api/agents') return json(response, 200, getAgents());
    if (request.method === 'GET' && url.pathname === '/api/projects') return json(response, 200, listProjects(database));
    if (request.method === 'POST' && url.pathname === '/api/projects') return json(response, 201, registerProject(database, await body(request)));
    if (request.method === 'GET' && url.pathname === '/api/tasks') return json(response, 200, listTasks(database));
    if (request.method === 'POST' && url.pathname === '/api/tasks') return json(response, 201, submitTask(database, await body(request)));
    if (request.method === 'GET' && url.pathname === '/api/catalog') return json(response, 200, scanClaudeKit(claudeKitRoot));

    const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (request.method === 'GET' && taskMatch) {
      const task = getTask(database, taskMatch[1]);
      return task ? json(response, 200, { task, events: listEvents(database, task.id) }) : json(response, 404, { error: 'Task not found' });
    }
    const actionMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(run|cancel)$/);
    if (request.method === 'POST' && actionMatch) {
      if (actionMatch[2] === 'run') supervisor.start(actionMatch[1]);
      else if (!supervisor.cancel(actionMatch[1])) return json(response, 409, { error: 'Task is not running' });
      return json(response, 202, { accepted: true });
    }
    if (request.method === 'GET') return staticFile(response, url.pathname);
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    json(response, 400, { error: error.message });
  }
});

const port = Number(process.env.PORT ?? 4310);
server.listen(port, '127.0.0.1', () => {
  console.log(`Agent Harness UI: http://127.0.0.1:${port}`);
});

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function staticFile(response, pathname) {
  const files = { '/': 'index.html', '/app.css': 'app.css', '/app.js': 'app.js' };
  const name = files[pathname];
  if (!name) return json(response, 404, { error: 'Not found' });
  const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  response.writeHead(200, { 'content-type': contentTypes[extname(name)] });
  response.end(readFileSync(resolve(publicDirectory, name)));
}
