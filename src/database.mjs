import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      objective TEXT NOT NULL,
      agent TEXT NOT NULL,
      role TEXT,
      model TEXT,
      status TEXT NOT NULL,
      verification_command TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      result_json TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      project TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_sessions (
      session_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      project TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );
    CREATE TABLE IF NOT EXISTS child_agents (
      agent_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      stopped_at TEXT,
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );
  `);
  addColumn(database, 'tasks', 'role', 'TEXT');
  addColumn(database, 'tasks', 'model', 'TEXT');
  return database;
}

function addColumn(database, table, column, type) {
  const columns = database.prepare('PRAGMA table_info(' + table + ')').all().map((entry) => entry.name);
  if (!columns.includes(column)) database.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + type);
}

export function saveProject(database, project) {
  database.prepare(`
    INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET name = excluded.name
  `).run(project.id, project.name, project.path, project.createdAt);
  return database.prepare('SELECT * FROM projects WHERE path = ?').get(project.path);
}

export function listProjects(database) {
  return database.prepare('SELECT * FROM projects ORDER BY name').all();
}

export function saveTask(database, task) {
  database.prepare(`
    INSERT INTO tasks (
      id, project, objective, agent, role, model, status, verification_command, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.project,
    task.objective,
    task.agent,
    task.role,
    task.model,
    task.status,
    task.verificationCommand ?? null,
    task.createdAt,
    task.updatedAt,
  );
}

export function getTask(database, id) {
  const row = database.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    project: row.project,
    objective: row.objective,
    agent: row.agent,
    role: row.role,
    model: row.model,
    status: row.status,
    verificationCommand: row.verification_command,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    result: row.result_json ? JSON.parse(row.result_json) : null,
  };
}

export function updateTask(database, id, status, result = null) {
  database.prepare(`
    UPDATE tasks SET status = ?, result_json = ?, updated_at = ? WHERE id = ?
  `).run(status, result ? JSON.stringify(result) : null, new Date().toISOString(), id);
}

export function listTasks(database) {
  return database.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all().map((row) => ({
    id: row.id,
    project: row.project,
    objective: row.objective,
    agent: row.agent,
    role: row.role,
    model: row.model,
    status: row.status,
    verificationCommand: row.verification_command,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    result: row.result_json ? JSON.parse(row.result_json) : null,
  }));
}

export function recoverInterruptedTasks(database) {
  const timestamp = new Date().toISOString();
  const tasks = database.prepare("SELECT id FROM tasks WHERE status = 'running'").all();
  const update = database.prepare("UPDATE tasks SET status = 'interrupted', updated_at = ? WHERE id = ?");
  for (const task of tasks) {
    update.run(timestamp, task.id);
    appendEvent(database, task.id, 'interrupted', { reason: 'Harness restarted' });
  }
  return tasks.length;
}

export function appendEvent(database, taskId, type, payload) {
  database.prepare(`
    INSERT INTO events (task_id, type, payload_json, created_at) VALUES (?, ?, ?, ?)
  `).run(taskId, type, JSON.stringify(payload), new Date().toISOString());
}

export function bindChatSession(database, sessionId, taskId, project) {
  database.prepare(`
    INSERT INTO chat_sessions (session_id, task_id, project, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET task_id = excluded.task_id, project = excluded.project, updated_at = excluded.updated_at
  `).run(sessionId, taskId, project, new Date().toISOString());
}

export function getChatSessionTask(database, sessionId) {
  return database.prepare('SELECT task_id FROM chat_sessions WHERE session_id = ?').get(sessionId)?.task_id ?? null;
}

export function startChildAgent(database, agentId, taskId, role) {
  database.prepare(`
    INSERT INTO child_agents (agent_id, task_id, role, status, started_at, stopped_at)
    VALUES (?, ?, ?, 'running', ?, NULL)
    ON CONFLICT(agent_id) DO UPDATE SET task_id = excluded.task_id, role = excluded.role,
      status = 'running', started_at = excluded.started_at, stopped_at = NULL
  `).run(agentId, taskId, role, new Date().toISOString());
}

export function stopChildAgent(database, agentId) {
  database.prepare(`UPDATE child_agents SET status = 'completed', stopped_at = ? WHERE agent_id = ?`)
    .run(new Date().toISOString(), agentId);
}

export function getChildAgentTask(database, agentId) {
  return database.prepare('SELECT task_id FROM child_agents WHERE agent_id = ?').get(agentId)?.task_id ?? null;
}

export function countRunningChildAgents(database, taskId) {
  return database.prepare("SELECT COUNT(*) AS count FROM child_agents WHERE task_id = ? AND status = 'running'").get(taskId).count;
}

export function hasEvent(database, taskId, type) {
  return Boolean(database.prepare('SELECT 1 FROM events WHERE task_id = ? AND type = ? LIMIT 1').get(taskId, type));
}

export function listEvents(database, taskId) {
  return database.prepare(`
    SELECT type, payload_json, created_at FROM events WHERE task_id = ? ORDER BY id
  `).all(taskId).map((row) => ({
    type: row.type,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
  }));
}
