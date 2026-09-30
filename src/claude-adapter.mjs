import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runProcess } from './process-runner.mjs';

export async function executeClaude(task, options) {
  const schema = readFileSync(join(options.rootDirectory, 'schemas', 'task-result.schema.json'), 'utf8');
  const args = options.claudeArgs?.(task, schema) ?? [
    '-p',
    '--output-format', 'json',
    '--json-schema', schema,
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read,Edit,Write,Bash,Glob,Grep',
    buildPrompt(task),
  ];
  const invocation = options.claudeCommand
    ? { command: options.claudeCommand, args }
    : claudeInvocation(args);
  const execution = await runProcess(invocation.command, invocation.args, {
    cwd: task.project,
    onStdout: options.onLog,
    onStderr: options.onLog,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  if (execution.exitCode !== 0) {
    throw new Error(`Claude exited with code ${execution.exitCode}: ${execution.stderr.trim()}`);
  }
  return parseClaudeResult(execution.stdout);
}

function claudeInvocation(args) {
  if (process.platform !== 'win32') return { command: 'claude', args };
  const executable = join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  return { command: executable, args };
}

function parseClaudeResult(stdout) {
  const envelope = JSON.parse(stdout);
  if (envelope.structured_output) return envelope.structured_output;
  if (typeof envelope.result === 'object') return envelope.result;
  if (typeof envelope.result === 'string') return JSON.parse(envelope.result);
  throw new Error('Claude returned no structured result');
}

function buildPrompt(task) {
  return [
    'Complete this task in the current project.',
    `Objective: ${task.objective}`,
    'Keep changes focused. Do not commit.',
    'Return only the requested structured result.',
  ].join('\n');
}
