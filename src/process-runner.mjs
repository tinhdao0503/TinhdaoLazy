import { spawn } from 'node:child_process';

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      windowsHide: true,
    });
    if (options.stdin !== undefined) child.stdin?.end(options.stdin);
    else child.stdin?.end();
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => stop(new Error(`Process timed out after ${options.timeoutMs}ms`)), options.timeoutMs)
      : null;

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      callback(value);
    }

    function stop(error) {
      if (child.exitCode === null) child.kill('SIGTERM');
      finish(reject, error);
    }

    function abort() {
      stop(new Error('Process cancelled'));
    }

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
    });
    child.on('error', (error) => finish(reject, error));
    child.on('close', (exitCode) => finish(resolve, { exitCode, stdout, stderr }));
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
  });
}
