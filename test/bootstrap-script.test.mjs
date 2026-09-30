import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('bootstrap shell script is syntactically valid and fail-fast', () => {
  const script = readFileSync('bootstrap.sh', 'utf8');
  assert.match(script, /^#!\/usr\/bin\/env bash/);
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /agent-harness add "\$NATIVE_PROJECT_DIR"/);
  assert.match(script, /npm install --global --force/);
  assert.match(script, /agent-harness hook user-prompt/);
  assert.match(script, /Start-Process/);
  const bash = spawnSync('bash', ['-n', 'bootstrap.sh'], { encoding: 'utf8' });
  assert.equal(bash.status, 0, bash.stderr);
});
