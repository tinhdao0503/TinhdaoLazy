import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { registerProject } from './project-registry.mjs';

const startMarker = '<!-- agent-harness:start -->';
const endMarker = '<!-- agent-harness:end -->';

export function installProject(database, input) {
  const projectPath = resolve(input.path ?? '');
  if (!statSync(projectPath).isDirectory()) throw new Error('Project path must be a directory');
  const packagePath = resolve(projectPath, 'package.json');
  const name = input.name?.trim() || (existsSync(packagePath) ? JSON.parse(readFileSync(packagePath, 'utf8')).name : basename(projectPath));
  const harnessDirectory = resolve(projectPath, '.agent-harness');
  const backupDirectory = resolve(harnessDirectory, 'backups', new Date().toISOString().replaceAll(':', '-'));
  mkdirSync(harnessDirectory, { recursive: true });

  const config = {
    schema: 'agent-harness.project.v1', name, path: projectPath, agent: 'auto',
    verificationCommand: detectVerification(projectPath), installedAt: new Date().toISOString(),
  };
  writeJson(resolve(harnessDirectory, 'project.json'), config);
  const changedFiles = [];
  mergeJson(resolve(projectPath, '.claude', 'settings.local.json'), claudeSettings(), backupDirectory, changedFiles);
  mergeJson(resolve(projectPath, '.cursor', 'hooks.json'), codexHooks(), backupDirectory, changedFiles);
  mergeJson(resolve(projectPath, '.mcp.json'), mcpSettings(projectPath), backupDirectory, changedFiles);
  mergeCodexConfig(resolve(projectPath, '.codex', 'config.toml'), backupDirectory, changedFiles);
  mergeAgents(resolve(projectPath, 'AGENTS.md'), backupDirectory, changedFiles);
  writeJson(resolve(harnessDirectory, 'install-state.json'), { schema: 'agent-harness.install.v1', changedFiles, backupDirectory, installedAt: config.installedAt });
  const project = registerProject(database, { name, path: projectPath });
  return { project, config, changedFiles, backupDirectory };
}

function claudeSettings() {
  const command = process.platform === 'win32' ? 'agent-harness.cmd' : 'agent-harness';
  return { hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: `${command} hook session-start` }] }],
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: `${command} hook user-prompt` }] }],
    SubagentStart: [{ hooks: [{ type: 'command', command: `${command} hook subagent-start` }] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: `${command} hook subagent-stop` }] }],
    PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `${command} hook post-tool-use` }] }],
    Stop: [{ hooks: [{ type: 'command', command: `${command} hook session-stop` }] }],
  } };
}

function codexHooks() {
  const command = process.platform === 'win32' ? 'agent-harness.cmd' : 'agent-harness';
  return { version: 1, hooks: {
    subagentStart: [{ command: `${command} hook codex-subagent-start` }],
    subagentStop: [{ command: `${command} hook codex-subagent-stop` }],
    postToolUse: [{ command: `${command} hook codex-post-tool-use` }],
  } };
}

function mcpSettings(projectPath) {
  const command = process.platform === 'win32' ? 'agent-harness.cmd' : 'agent-harness';
  return { mcpServers: { 'agent-harness': { command, args: ['mcp'], env: { AGENT_HARNESS_PROJECT: projectPath } } } };
}

function mergeJson(path, addition, backupDirectory, changedFiles) {
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  backup(path, backupDirectory);
  const merged = deepMerge(existing, addition);
  mkdirSync(dirname(path), { recursive: true });
  writeJson(path, merged);
  changedFiles.push(path);
}

function mergeCodexConfig(path, backupDirectory, changedFiles) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (existing.includes('[mcp_servers.agent-harness]')) return;
  backup(path, backupDirectory);
  const command = process.platform === 'win32' ? 'agent-harness.cmd' : 'agent-harness';
  const block = `\n# ${startMarker}\n[mcp_servers.agent-harness]\ncommand = "${command}"\nargs = ["mcp"]\n# ${endMarker}\n`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${existing.trimEnd()}${block}`);
  changedFiles.push(path);
}

function mergeAgents(path, backupDirectory, changedFiles) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  backup(path, backupDirectory);
  const block = `${startMarker}\n## Agent Harness\n\n- Harness activates automatically for every non-trivial request in Claude Code or Codex. Stay in the current chat; never redirect task intake to dashboard.\n- Read \`.agent-harness/project.json\` and use Agent Harness MCP for status and role catalog.\n- Select the best role from the harness registry. Use native subagents for independent planning, implementation, testing, review, security, database, DevOps, or performance work.\n- Keep one lead agent responsible for scope, child-agent coordination, integration, verification, and final response.\n- Emit normal runtime events; project hooks record prompt, tool, and subagent lifecycle for dashboard observation.\n- Run the detected verification command before claiming completion. Dashboard is observation and control only, never primary task intake.\n${endMarker}`;
  const managed = new RegExp(startMarker + '[\\s\\S]*?' + endMarker);
  const content = managed.test(existing) ? existing.replace(managed, block) : `${existing.trimEnd()}\n\n${block}\n`;
  writeFileSync(path, content);
  changedFiles.push(path);
}

function backup(path, backupDirectory) {
  if (!existsSync(path)) return;
  mkdirSync(backupDirectory, { recursive: true });
  const name = `${randomUUID()}-${basename(path)}`;
  writeFileSync(resolve(backupDirectory, name), readFileSync(path));
}

function deepMerge(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) {
    const values = [...left];
    for (const item of right) if (!values.some((value) => JSON.stringify(value) === JSON.stringify(item))) values.push(item);
    return values;
  }
  if (isObject(left) && isObject(right)) {
    return Object.fromEntries([...new Set([...Object.keys(left), ...Object.keys(right)])].map((key) => [key, key in right && key in left ? deepMerge(left[key], right[key]) : (right[key] ?? left[key])]));
  }
  return right;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function detectVerification(projectPath) {
  if (existsSync(resolve(projectPath, 'package.json'))) return 'npm test';
  if (existsSync(resolve(projectPath, 'pyproject.toml')) || existsSync(resolve(projectPath, 'pytest.ini'))) return 'pytest';
  if (existsSync(resolve(projectPath, 'Cargo.toml'))) return 'cargo test';
  if (existsSync(resolve(projectPath, 'go.mod'))) return 'go test ./...';
  return null;
}
