import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runProcess } from './process-runner.mjs';

export async function executeCodex(task, options) {
  const taskDirectory = join(options.runtimeDirectory, task.id);
  const resultPath = join(taskDirectory, 'result.json');
  const schemaPath = join(options.rootDirectory, 'schemas', 'task-result.schema.json');
  mkdirSync(taskDirectory, { recursive: true });

  const args = options.codexArgs?.(task, resultPath, schemaPath) ?? [
    'exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write',
    '--output-schema', schemaPath, '--output-last-message', resultPath,
    '--cd', task.project, buildPrompt(task),
  ];
  const invocation = options.codexCommand
    ? { command: options.codexCommand, args }
    : codexInvocation(args);
  const execution = await runProcess(invocation.command, invocation.args, {
    cwd: task.project,
    onStdout: options.onLog,
    onStderr: options.onLog,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  if (execution.exitCode !== 0) {
    throw new Error(`Codex exited with code ${execution.exitCode}: ${execution.stderr.trim()}`);
  }
  return JSON.parse(readFileSync(resultPath, 'utf8'));
}

function codexInvocation(args) {
  if (process.platform !== 'win32') return { command: 'codex', args };
  const entry = join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  return { command: process.execPath, args: [entry, ...args] };
}

function buildPrompt(task) {
  return [
    'Complete this task in the current project.',
    `Objective: ${task.objective}`,
    'Keep changes focused. Do not commit.',
    'Return the final response using the provided JSON schema.',
  ].join('\n');
}
