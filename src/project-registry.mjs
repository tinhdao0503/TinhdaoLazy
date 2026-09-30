import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { listProjects, saveProject } from './database.mjs';

export function registerProject(database, input) {
  const path = resolve(input.path ?? '');
  if (!input.name?.trim()) throw new Error('Project name is required');
  if (!statSync(path).isDirectory()) throw new Error('Project path must be a directory');
  return saveProject(database, {
    id: `project-${randomUUID()}`,
    name: input.name.trim(),
    path,
    createdAt: new Date().toISOString(),
  });
}

export { listProjects };
