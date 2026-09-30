import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scanClaudeKit } from '../src/claudekit-catalog.mjs';
import { openDatabase } from '../src/database.mjs';
import { listProjects, registerProject } from '../src/project-registry.mjs';

test('registers a local project without duplicates', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-project-'));
  const database = openDatabase(join(workspace, 'harness.db'));
  registerProject(database, { name: 'First', path: workspace });
  registerProject(database, { name: 'Renamed', path: workspace });
  assert.deepEqual(listProjects(database).map(({ name, path }) => ({ name, path })), [
    { name: 'Renamed', path: workspace },
  ]);
});

test('scans ClaudeKit assets as read-only catalog entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-catalog-'));
  const skillDirectory = join(root, 'claude', 'skills', 'sample');
  const agentDirectory = join(root, 'claude', 'agents');
  const recipeDirectory = join(root, 'mcp-harness', 'recipes');
  mkdirSync(skillDirectory, { recursive: true });
  mkdirSync(agentDirectory, { recursive: true });
  mkdirSync(recipeDirectory, { recursive: true });
  writeFileSync(join(skillDirectory, 'SKILL.md'), '---\nname: sample-skill\ndescription: Sample\n---\n');
  writeFileSync(join(agentDirectory, 'reviewer.md'), '---\nname: reviewer\n---\n');
  writeFileSync(join(recipeDirectory, 'flow.json'), JSON.stringify({ name: 'flow' }));

  const catalog = scanClaudeKit(root);
  assert.equal(catalog.skills[0].name, 'sample-skill');
  assert.equal(catalog.agents[0].name, 'reviewer');
  assert.equal(catalog.recipes[0].name, 'flow');
});
