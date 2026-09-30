import { runTask } from './harness.mjs';

export class TaskSupervisor {
  #running = new Map();

  constructor(database, options) {
    this.database = database;
    this.options = options;
  }

  start(id) {
    if (this.#running.has(id)) throw new Error('Task already running');
    const controller = new AbortController();
    const promise = runTask(this.database, id, {
      ...this.options,
      signal: controller.signal,
    }).catch(() => null).finally(() => this.#running.delete(id));
    this.#running.set(id, { controller, promise });
  }

  cancel(id) {
    const execution = this.#running.get(id);
    if (!execution) return false;
    execution.controller.abort();
    return true;
  }

  runningIds() {
    return [...this.#running.keys()];
  }
}
