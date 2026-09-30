import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

export function scanClaudeKit(root) {
  return {
    root,
    scannedAt: new Date().toISOString(),
    agents: scanMarkdown(join(root, 'claude', 'agents')),
    skills: scanSkills(join(root, 'claude', 'skills')),
    rules: scanMarkdown(join(root, 'claude', 'rules')),
    recipes: scanJson(join(root, 'mcp-harness', 'recipes')),
  };
}

function scanSkills(directory) {
  if (!existsSync(directory)) return [];
  return walk(directory, (path) => basename(path) === 'SKILL.md').map((path) => {
    const metadata = frontmatter(readFileSync(path, 'utf8'));
    return { name: metadata.name ?? basename(dirname(path)), description: metadata.description ?? '', path: relative(directory, path) };
  });
}

function scanMarkdown(directory) {
  if (!existsSync(directory)) return [];
  return walk(directory, (path) => extname(path) === '.md').map((path) => {
    const metadata = frontmatter(readFileSync(path, 'utf8'));
    return { name: metadata.name ?? basename(path, '.md'), description: metadata.description ?? '', path: relative(directory, path) };
  });
}

function scanJson(directory) {
  if (!existsSync(directory)) return [];
  return walk(directory, (path) => extname(path) === '.json').map((path) => {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return { name: value.name ?? basename(path, '.json'), description: value.description ?? '', path: relative(directory, path) };
  });
}

function walk(directory, include) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path, include);
    return include(path) ? [path] : [];
  });
}

function frontmatter(content) {
  if (!content.startsWith('---')) return {};
  const end = content.indexOf('\n---', 3);
  if (end < 0) return {};
  return Object.fromEntries(content.slice(3, end).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([\w-]+):\s*["']?(.*?)["']?\s*$/);
    return match ? [[match[1], match[2]]] : [];
  }));
}
