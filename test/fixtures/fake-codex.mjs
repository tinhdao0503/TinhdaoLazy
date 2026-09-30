import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const resultPath = process.argv[2];
mkdirSync(dirname(resultPath), { recursive: true });
console.log(JSON.stringify({ type: 'agent_message', message: 'fake codex completed' }));
writeFileSync(resultPath, JSON.stringify({
  status: 'completed',
  summary: 'Fake task completed',
  changedFiles: [],
  decisions: [],
  risks: [],
  blockers: [],
}));
