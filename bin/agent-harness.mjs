#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { openDatabase } from '../src/database.mjs';
import { listProjects, registerProject } from '../src/project-registry.mjs';

const [command = 'help', target = '.', ...flags] = process.argv.slice(2);
const home = resolve(process.env.AGENT_HARNESS_HOME ?? resolve(homedir(), '.agent-harness-local'));
const databasePath = resolve(home, 'harness.db');

if (command === 'add') {
  addProject(resolve(target), flags.includes('--integrate'));
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

function addProject(projectPath, integrate) {
  const packagePath = resolve(projectPath, 'package.json');
  const projectName = existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, 'utf8')).name ?? basename(projectPath)
    : basename(projectPath);
  const localDirectory = resolve(projectPath, '.agent-harness');
  const configPath = resolve(localDirectory, 'project.json');
  mkdirSync(localDirectory, { recursive: true });

  const config = {
    schema: 'agent-harness.project.v1',
    name: projectName,
    path: projectPath,
    agent: 'auto',
    verificationCommand: detectVerification(projectPath),
    addedAt: new Date().toISOString(),
  };
  if (existsSync(configPath)) {
    const existing = JSON.parse(readFileSync(configPath, 'utf8'));
    writeFileSync(configPath, `${JSON.stringify({ ...config, addedAt: existing.addedAt ?? config.addedAt }, null, 2)}\n`);
  } else {
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }
  registerProject(openDatabase(databasePath), { name: projectName, path: projectPath });
  if (integrate) writeIntegrations(projectPath);
  console.log(`Added ${projectName}`);
  console.log(`Config: ${configPath}`);
  console.log('Run dashboard: agent-harness serve');
}

function writeIntegrations(projectPath) {
  const integrationDirectory = resolve(projectPath, '.agent-harness', 'integrations');
  mkdirSync(integrationDirectory, { recursive: true });
  const executable = process.platform === 'win32' ? 'agent-harness.cmd' : 'agent-harness';
  writeFileSync(resolve(integrationDirectory, 'claude-settings.json'), `${JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: `${executable} hook session-start` }] }],
      Stop: [{ hooks: [{ type: 'command', command: `${executable} hook session-stop` }] }],
    },
  }, null, 2)}\n`);
  writeFileSync(resolve(integrationDirectory, 'mcp.json'), `${JSON.stringify({
    mcpServers: {
      'agent-harness': { command: executable, args: ['mcp'], env: { AGENT_HARNESS_PROJECT: projectPath } },
    },
  }, null, 2)}\n`);
  writeFileSync(resolve(integrationDirectory, 'AGENTS.snippet.md'), [
    '# Agent Harness',
    '',
    '- Read `.agent-harness/project.json` for project harness settings.',
    '- Use Agent Harness MCP only for read-only status, task, and ClaudeKit catalog lookup.',
    '- Process execution remains in dashboard/CLI; MCP must not start or cancel tasks.',
  ].join('\n'));
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

function detectVerification(projectPath) {
  if (existsSync(resolve(projectPath, 'package.json'))) return 'npm test';
  if (existsSync(resolve(projectPath, 'pyproject.toml')) || existsSync(resolve(projectPath, 'pytest.ini'))) return 'pytest';
  if (existsSync(resolve(projectPath, 'Cargo.toml'))) return 'cargo test';
  if (existsSync(resolve(projectPath, 'go.mod'))) return 'go test ./...';
  return null;
}

function printHelp() {
  console.log(`Agent Harness Local

Usage:
  agent-harness add [project-path]
  agent-harness add [project-path] --integrate
  agent-harness status [project-path]
  agent-harness list
  agent-harness serve
  agent-harness mcp

Environment:
  AGENT_HARNESS_HOME   State directory (default: ~/.agent-harness-local)
  PORT                 Dashboard port (default: 4310)`);
}
