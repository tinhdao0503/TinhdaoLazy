#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { openDatabase } from '../src/database.mjs';
import { listProjects } from '../src/project-registry.mjs';
import { installProject } from '../src/project-installer.mjs';

const [command = 'help', target = '.'] = process.argv.slice(2);
const home = resolve(process.env.AGENT_HARNESS_HOME ?? resolve(homedir(), '.agent-harness-local'));
const databasePath = resolve(home, 'harness.db');

if (command === 'add') {
  addProject(resolve(target));
} else if (command === 'serve') {
  process.env.HARNESS_DB ??= databasePath;
  await import('../src/server.mjs');
} else if (command === 'list') {
  console.log(JSON.stringify(listProjects(openDatabase(databasePath)), null, 2));
} else if (command === 'status') {
  showStatus(resolve(target));
} else if (command === 'hook') {
  await recordHook(target, flags);
} else if (command === 'mcp') {
  await import('../src/mcp-server.mjs');
} else {
  printHelp();
}

function addProject(projectPath) {
  const result = installProject(openDatabase(databasePath), { path: projectPath });
  console.log(`Installed ${result.project.name}`);
  console.log(`Changed: ${result.changedFiles.length} integration files`);
  console.log('Run dashboard: agent-harness serve');
}

async function recordHook(event, args) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = Buffer.concat(chunks).subarray(0, 65_536).toString('utf8');
  const database = openDatabase(databasePath);
  database.prepare(`
    INSERT INTO hook_events (event, project, payload_json, created_at) VALUES (?, ?, ?, ?)
  `).run(event, process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), payload || JSON.stringify({ args }), new Date().toISOString());
}

function showStatus(projectPath) {
  const configPath = resolve(projectPath, '.agent-harness', 'project.json');
  if (!existsSync(configPath)) {
    console.error('Project is not added. Run: agent-harness add .');
    process.exitCode = 1;
    return;
  }
  console.log(readFileSync(configPath, 'utf8').trim());
}

function printHelp() {
  console.log(`Agent Harness Local

Usage:
  agent-harness add [project-path]
  agent-harness status [project-path]
  agent-harness list
  agent-harness serve
  agent-harness mcp

Environment:
  AGENT_HARNESS_HOME   State directory (default: ~/.agent-harness-local)
  PORT                 Dashboard port (default: 4310)`);
}
