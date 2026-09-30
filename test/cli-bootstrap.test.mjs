import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const cli = resolve('bin', 'agent-harness.mjs');

test('adds a project with one command and detects npm verification', () => {
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

  const second = spawnSync(process.execPath, [cli, 'add', project], {
    encoding: 'utf8', env: { ...process.env, AGENT_HARNESS_HOME: home },
  });
  assert.equal(second.status, 0, second.stderr);
});
