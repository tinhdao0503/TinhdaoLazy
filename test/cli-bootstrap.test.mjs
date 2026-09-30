import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const cli = resolve('bin', 'agent-harness.mjs');

test('installs project config, hooks, MCP, and instructions with one command', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-harness-cli-'));
  const project = join(root, 'sample-project');
  const home = join(root, 'home');
  writeFileSync(join(root, 'placeholder'), '');
  spawnSync(process.execPath, ['-e', `require('node:fs').mkdirSync(${JSON.stringify(project)}, {recursive:true})`]);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'sample-project' }));

  const result = spawnSync(process.execPath, [cli, 'add', project], {
    encoding: 'utf8', env: { ...process.env, AGENT_HARNESS_HOME: home },
  });
  assert.equal(result.status, 0, result.stderr);
  const configPath = join(project, '.agent-harness', 'project.json');
  assert.equal(existsSync(configPath), true);
  assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).verificationCommand, 'npm test');
  assert.match(readFileSync(join(project, '.claude', 'settings.local.json'), 'utf8'), /session-start/);
  assert.match(readFileSync(join(project, '.claude', 'settings.local.json'), 'utf8'), /user-prompt/);
  assert.match(readFileSync(join(project, '.cursor', 'hooks.json'), 'utf8'), /codex-subagent-start/);
  assert.match(readFileSync(join(project, '.mcp.json'), 'utf8'), /agent-harness/);
  assert.match(readFileSync(join(project, '.codex', 'config.toml'), 'utf8'), /mcp_servers\.agent-harness/);
  assert.match(readFileSync(join(project, 'AGENTS.md'), 'utf8'), /agent-harness:start/);
  assert.match(readFileSync(join(project, 'AGENTS.md'), 'utf8'), /current chat/);
  assert.doesNotMatch(readFileSync(join(project, 'AGENTS.md'), 'utf8'), /controlled by local dashboard/);

  const second = spawnSync(process.execPath, [cli, 'add', project], {
    encoding: 'utf8', env: { ...process.env, AGENT_HARNESS_HOME: home },
  });
  assert.equal(second.status, 0, second.stderr);
  assert.equal((readFileSync(join(project, 'AGENTS.md'), 'utf8').match(/agent-harness:start/g) ?? []).length, 1);
  assert.equal((JSON.parse(readFileSync(join(project, '.claude', 'settings.local.json'), 'utf8')).hooks.UserPromptSubmit ?? []).length, 1);

  const hook = spawnSync(process.execPath, [cli, 'hook', 'user-prompt'], {
    encoding: 'utf8', input: JSON.stringify({ prompt: 'Build login with tests' }),
    cwd: project, env: { ...process.env, AGENT_HARNESS_HOME: home },
  });
  assert.equal(hook.status, 0, hook.stderr);
  assert.match(hook.stdout, /Agent Harness is active/);
});
