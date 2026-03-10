/* ── State ─────────────────────────────────────────────────────── */
let projects = [];
let currentProject = null;
let tasks = [];
let ganttChart = null;
let editingProjectId = null;
let editingTaskId = null;
let confirmCallback = null;

/* ── API helpers ───────────────────────────────────────────────── */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ── Toast ─────────────────────────────────────────────────────── */
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── Utilities ─────────────────────────────────────────────────── */
function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function badgeStatus(s) {
  const map = { todo: ['badge-todo', 'To Do'], in_progress: ['badge-inprogress', 'In Progress'], done: ['badge-done', 'Done'] };
  const [cls, label] = map[s] || ['badge-todo', s];
  return `<span class="badge ${cls}">${label}</span>`;
}

function badgePriority(p) {
  const map = { high: 'badge-high', medium: 'badge-medium', low: 'badge-low' };
  return `<span class="badge ${map[p] || 'badge-medium'}">${p[0].toUpperCase() + p.slice(1)}</span>`;
}

function progressBar(pct) {
  const p = pct || 0;
  return `
    <div class="progress-wrap">
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${p}%"></div></div>
      <span class="progress-pct">${p}%</span>
    </div>`;
}

/* ── Project list ──────────────────────────────────────────────── */
async function loadProjects() {
  projects = await api('GET', '/api/projects');
  renderProjectList();
}

function renderProjectList() {
  const ul = document.getElementById('project-list');
  if (projects.length === 0) {
    ul.innerHTML = '<li style="padding:8px 10px;color:var(--muted);font-size:13px;">No projects yet</li>';
    return;
  }
  ul.innerHTML = projects.map(p => `
    <li class="project-item ${currentProject?.id === p.id ? 'active' : ''}"
        data-id="${p.id}">
      <span class="project-dot" style="background:${p.color}"></span>
      <span class="project-name">${escHtml(p.name)}</span>
      <span class="project-count">${p.task_count || 0}</span>
    </li>`).join('');

  ul.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', () => selectProject(+el.dataset.id));
  });
}

async function selectProject(id) {
  currentProject = projects.find(p => p.id === id) || null;
  if (!currentProject) return;
  renderProjectList();
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('project-view').classList.remove('hidden');
  document.getElementById('project-title').textContent = currentProject.name;
  document.getElementById('project-desc').textContent = currentProject.description || '';
  await loadTasks();
}

/* ── Tasks ─────────────────────────────────────────────────────── */
async function loadTasks() {
  if (!currentProject) return;
  tasks = await api('GET', `/api/projects/${currentProject.id}/tasks`);
  renderStats();
  renderTaskList();
  if (!document.getElementById('tab-gantt').classList.contains('hidden')) {
    renderGantt();
  }
}

function getFilteredTasks() {
  const q = document.getElementById('task-search').value.toLowerCase();
  const fs = document.getElementById('filter-status').value;
  const fp = document.getElementById('filter-priority').value;
  return tasks.filter(t =>
    (!q || t.name.toLowerCase().includes(q) || (t.assignee || '').toLowerCase().includes(q)) &&
    (!fs || t.status === fs) &&
    (!fp || t.priority === fp)
  );
}

function renderStats() {
  document.getElementById('stat-total').textContent = tasks.length;
  document.getElementById('stat-todo').textContent = tasks.filter(t => t.status === 'todo').length;
  document.getElementById('stat-inprogress').textContent = tasks.filter(t => t.status === 'in_progress').length;
  document.getElementById('stat-done').textContent = tasks.filter(t => t.status === 'done').length;
}

function renderTaskList() {
  const filtered = getFilteredTasks();
  const container = document.getElementById('task-list');

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--muted);">
        ${tasks.length === 0 ? 'No tasks yet. Click <strong>+ Add Task</strong> to create one.' : 'No tasks match your filters.'}
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(t => `
    <div class="task-row" data-id="${t.id}">
      <div>
        <div class="task-name">${escHtml(t.name)}</div>
        ${t.assignee ? `<div class="task-name-sub">👤 ${escHtml(t.assignee)}</div>` : ''}
      </div>
      <div>${escHtml(t.assignee || '—')}</div>
      <div>${badgePriority(t.priority)}</div>
      <div>${badgeStatus(t.status)}</div>
      <div style="font-size:12px;color:var(--muted)">${fmtDate(t.end_date)}</div>
      <div>${progressBar(t.progress)}</div>
      <div class="task-actions">
        <button class="icon-btn edit-task-btn" title="Edit">✏️</button>
        <button class="icon-btn danger delete-task-btn" title="Delete">🗑️</button>
      </div>
    </div>`).join('');

  container.querySelectorAll('.edit-task-btn').forEach((btn, i) => {
    btn.addEventListener('click', () => openTaskModal(filtered[i]));
  });
  container.querySelectorAll('.delete-task-btn').forEach((btn, i) => {
    btn.addEventListener('click', () => confirmDelete('task', filtered[i]));
  });
}

/* ── Gantt ─────────────────────────────────────────────────────── */
function renderGantt() {
  const hasDates = tasks.filter(t => t.start_date && t.end_date);
  const empty = document.getElementById('gantt-empty');
  const svgEl = document.getElementById('gantt');

  if (hasDates.length === 0) {
    empty.classList.remove('hidden');
    svgEl.innerHTML = '';
    ganttChart = null;
    return;
  }

  empty.classList.add('hidden');

  const ganttTasks = hasDates.map(t => ({
    id: String(t.id),
    name: t.name,
    start: t.start_date,
    end: t.end_date,
    progress: t.progress || 0,
    custom_class: `priority-${t.priority}`,
  }));

  const viewMode = document.getElementById('gantt-view-mode').value;

  // Clear and recreate SVG to avoid Frappe Gantt reuse issues
  const container = document.getElementById('gantt-container');
  const newSvg = document.createElement('svg');
  newSvg.id = 'gantt';
  svgEl.replaceWith(newSvg);

  try {
    ganttChart = new Gantt('#gantt', ganttTasks, {
      view_mode: viewMode,
      date_format: 'YYYY-MM-DD',
      bar_height: 28,
      bar_corner_radius: 4,
      padding: 18,
      language: 'en',
      on_click(task) {
        const t = tasks.find(x => String(x.id) === task.id);
        if (t) openTaskModal(t);
      },
      on_date_change(task, start, end) {
        const fmt = d => d.toISOString().split('T')[0];
        api('PUT', `/api/tasks/${task.id}`, {
          ...tasks.find(x => String(x.id) === task.id),
          start_date: fmt(start),
          end_date: fmt(end),
        }).then(() => loadTasks()).catch(e => toast(e.message, 'error'));
      },
      on_progress_change(task, progress) {
        api('PUT', `/api/tasks/${task.id}`, {
          ...tasks.find(x => String(x.id) === task.id),
          progress: Math.round(progress),
        }).then(() => loadTasks()).catch(e => toast(e.message, 'error'));
      },
    });
  } catch (e) {
    console.error('Gantt render error:', e);
  }
}

/* ── Project modal ─────────────────────────────────────────────── */
function openProjectModal(project = null) {
  editingProjectId = project?.id || null;
  document.getElementById('project-modal-title').textContent = project ? 'Edit Project' : 'New Project';
  document.getElementById('project-modal-save').textContent = project ? 'Save Changes' : 'Create';
  document.getElementById('pm-name').value = project?.name || '';
  document.getElementById('pm-desc').value = project?.description || '';
  const color = project?.color || '#4f86f7';
  document.getElementById('pm-color').value = color;
  document.getElementById('pm-color-preview').style.background = color;
  document.getElementById('project-modal').classList.remove('hidden');
  document.getElementById('pm-name').focus();
}

document.getElementById('project-form').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('pm-name').value,
    description: document.getElementById('pm-desc').value,
    color: document.getElementById('pm-color').value,
  };
  try {
    if (editingProjectId) {
      const updated = await api('PUT', `/api/projects/${editingProjectId}`, payload);
      projects = projects.map(p => p.id === updated.id ? { ...p, ...updated } : p);
      if (currentProject?.id === updated.id) {
        currentProject = { ...currentProject, ...updated };
        document.getElementById('project-title').textContent = updated.name;
        document.getElementById('project-desc').textContent = updated.description || '';
      }
      toast('Project updated');
    } else {
      const created = await api('POST', '/api/projects', payload);
      projects.unshift({ ...created, task_count: 0, done_count: 0 });
      toast('Project created');
      selectProject(created.id);
    }
    renderProjectList();
    closeModal('project-modal');
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('pm-color').addEventListener('input', e => {
  document.getElementById('pm-color-preview').style.background = e.target.value;
});

/* ── Task modal ────────────────────────────────────────────────── */
function openTaskModal(task = null) {
  editingTaskId = task?.id || null;
  document.getElementById('task-modal-title').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('task-modal-save').textContent = task ? 'Save Changes' : 'Create Task';
  document.getElementById('tm-name').value = task?.name || '';
  document.getElementById('tm-desc').value = task?.description || '';
  document.getElementById('tm-status').value = task?.status || 'todo';
  document.getElementById('tm-priority').value = task?.priority || 'medium';
  document.getElementById('tm-start').value = task?.start_date || '';
  document.getElementById('tm-end').value = task?.end_date || '';
  document.getElementById('tm-progress').value = task?.progress || 0;
  document.getElementById('progress-val').textContent = task?.progress || 0;
  document.getElementById('tm-assignee').value = task?.assignee || '';
  document.getElementById('task-modal').classList.remove('hidden');
  document.getElementById('tm-name').focus();
}

document.getElementById('tm-progress').addEventListener('input', e => {
  document.getElementById('progress-val').textContent = e.target.value;
});

document.getElementById('task-form').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('tm-name').value,
    description: document.getElementById('tm-desc').value,
    status: document.getElementById('tm-status').value,
    priority: document.getElementById('tm-priority').value,
    start_date: document.getElementById('tm-start').value || null,
    end_date: document.getElementById('tm-end').value || null,
    progress: +document.getElementById('tm-progress').value,
    assignee: document.getElementById('tm-assignee').value,
  };
  try {
    if (editingTaskId) {
      await api('PUT', `/api/tasks/${editingTaskId}`, payload);
      toast('Task updated');
    } else {
      await api('POST', `/api/projects/${currentProject.id}/tasks`, payload);
      toast('Task created');
    }
    closeModal('task-modal');
    await loadTasks();
    await loadProjects(); // refresh counts
  } catch (err) {
    toast(err.message, 'error');
  }
});

/* ── Confirm / Delete ──────────────────────────────────────────── */
function confirmDelete(type, item) {
  document.getElementById('confirm-title').textContent = `Delete ${type === 'project' ? 'Project' : 'Task'}`;
  document.getElementById('confirm-msg').textContent =
    type === 'project'
      ? `Delete "${item.name}" and all its tasks? This cannot be undone.`
      : `Delete task "${item.name}"? This cannot be undone.`;
  confirmCallback = async () => {
    try {
      if (type === 'project') {
        await api('DELETE', `/api/projects/${item.id}`);
        projects = projects.filter(p => p.id !== item.id);
        if (currentProject?.id === item.id) {
          currentProject = null;
          document.getElementById('project-view').classList.add('hidden');
          document.getElementById('empty-state').classList.remove('hidden');
        }
        renderProjectList();
        toast('Project deleted');
      } else {
        await api('DELETE', `/api/tasks/${item.id}`);
        await loadTasks();
        await loadProjects();
        toast('Task deleted');
      }
    } catch (err) {
      toast(err.message, 'error');
    }
    closeModal('confirm-modal');
  };
  document.getElementById('confirm-modal').classList.remove('hidden');
}

document.getElementById('confirm-ok').addEventListener('click', () => confirmCallback?.());
document.getElementById('confirm-cancel').addEventListener('click', () => closeModal('confirm-modal'));

/* ── Modal helpers ─────────────────────────────────────────────── */
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

/* ── Tab switching ─────────────────────────────────────────────── */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    tab.classList.add('active');
    const target = document.getElementById(`tab-${tab.dataset.tab}`);
    target.classList.remove('hidden');
    if (tab.dataset.tab === 'gantt') renderGantt();
  });
});

/* ── Button wiring ─────────────────────────────────────────────── */
document.getElementById('new-project-btn').addEventListener('click', () => openProjectModal());
document.getElementById('empty-new-project-btn').addEventListener('click', () => openProjectModal());
document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal());
document.getElementById('project-modal-cancel').addEventListener('click', () => closeModal('project-modal'));
document.getElementById('task-modal-cancel').addEventListener('click', () => closeModal('task-modal'));

document.getElementById('edit-project-btn').addEventListener('click', () => {
  openProjectModal(currentProject);
});

document.getElementById('delete-project-btn').addEventListener('click', () => {
  confirmDelete('project', currentProject);
});

document.getElementById('gantt-view-mode').addEventListener('change', renderGantt);

document.getElementById('task-search').addEventListener('input', renderTaskList);
document.getElementById('filter-status').addEventListener('change', renderTaskList);
document.getElementById('filter-priority').addEventListener('change', renderTaskList);

/* ── Keyboard shortcuts ────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});

/* ── XSS safe ──────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Init ──────────────────────────────────────────────────────── */
(async () => {
  await loadProjects();
  if (projects.length > 0) {
    selectProject(projects[0].id);
  }
})();
