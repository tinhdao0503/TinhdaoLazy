const state = { tasks: [], projects: [], selectedTask: null, running: [] };
const elements = Object.fromEntries(['health','task-count','running-count','skill-count','project-form','project-name','project-path','task-form','task-project','task-agent','task-objective','task-verify','task-list','task-detail','event-log','activity-list','refresh','toast'].map((id) => [id, document.getElementById(id)]));

elements['project-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  await api('/api/projects', { method: 'POST', body: { name: elements['project-name'].value, path: elements['project-path'].value } });
  event.target.reset();
  toast('Đã cài settings, hooks và MCP vào project');
  await refresh();
});

elements['task-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const task = await api('/api/tasks', { method: 'POST', body: {
    project: elements['task-project'].value,
    agent: elements['task-agent'].value,
    objective: elements['task-objective'].value,
    verificationCommand: elements['task-verify'].value || null,
  }});
  event.target.reset();
  state.selectedTask = task.id;
  toast('Task đã vào queue');
  await refresh();
});

elements.refresh.addEventListener('click', refresh);
elements['task-list'].addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  const row = event.target.closest('tr');
  if (!row?.dataset.id) return;
  state.selectedTask = row.dataset.id;
  if (button?.dataset.action) {
    await api(`/api/tasks/${row.dataset.id}/${button.dataset.action}`, { method: 'POST' });
    toast(button.dataset.action === 'run' ? 'Đã chạy task' : 'Đã gửi lệnh hủy');
  }
  await refresh();
});

async function refresh() {
  try {
    const [status, projects, tasks, catalog, activity] = await Promise.all([
      api('/api/status'), api('/api/projects'), api('/api/tasks'), api('/api/catalog'), api('/api/activity'),
    ]);
    Object.assign(state, { projects, tasks, running: status.running });
    elements.health.classList.add('ok');
    elements.health.lastChild.textContent = 'Online';
    elements['task-count'].textContent = tasks.length;
    elements['running-count'].textContent = status.running.length;
    elements['skill-count'].textContent = catalog.skills.length;
    renderProjects();
    renderTasks();
    renderActivity(activity);
    if (state.selectedTask) await renderDetail(state.selectedTask);
  } catch (error) {
    elements.health.classList.remove('ok');
    elements.health.lastChild.textContent = 'Offline';
    toast(error.message);
  }
}

function renderActivity(activity) {
  elements['activity-list'].innerHTML = activity.length ? activity.map((task) => `
    <article class="activity-task">
      <header><strong>${escapeHtml(task.objective)}</strong><span class="status ${task.status}">${task.status}</span></header>
      <p>${escapeHtml(task.project)}</p>
      <ol>${task.layers.map((layer) => `<li class="${layer.status}"><span></span><strong>${escapeHtml(layer.label)}</strong><small>${layer.status}</small></li>`).join('')}</ol>
    </article>`).join('') : '<p class="empty">Chưa có task đang chạy.</p>';
}

function renderProjects() {
  const selected = elements['task-project'].value;
  elements['task-project'].innerHTML = '<option value="">Chọn project</option>' + state.projects.map((project) => `<option value="${escapeHtml(project.path)}">${escapeHtml(project.name)}</option>`).join('');
  elements['task-project'].value = selected;
}

function renderTasks() {
  elements['task-list'].innerHTML = state.tasks.length ? state.tasks.map((task) => `
    <tr data-id="${task.id}">
      <td><span class="status ${task.status}">${task.status}</span></td>
      <td>${escapeHtml(task.objective)}</td><td>${escapeHtml((task.role ?? task.agent) + ' · ' + (task.model ?? 'default'))}</td>
      <td>${new Date(task.updatedAt).toLocaleString()}</td>
      <td class="actions">${task.status === 'queued' ? '<button data-action="run">Run</button>' : ''}${task.status === 'running' ? '<button class="cancel" data-action="cancel">Cancel</button>' : ''}<button class="secondary">View</button></td>
    </tr>`).join('') : '<tr><td colspan="5" class="empty">Chưa có task</td></tr>';
}

async function renderDetail(id) {
  const value = await api(`/api/tasks/${id}`);
  elements['task-detail'].textContent = JSON.stringify(value.task, null, 2);
  elements['event-log'].innerHTML = value.events.length ? value.events.map((event) => `<article><time>${new Date(event.createdAt).toLocaleTimeString()}</time><strong>${event.type}</strong><br>${escapeHtml(JSON.stringify(event.payload))}</article>`).join('') : '<p class="empty">Chưa có event.</p>';
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
}

refresh();
setInterval(refresh, 1500);
