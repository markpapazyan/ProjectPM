const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Projects ─────────────────────────────────────────────────────────────────

app.get('/api/projects', (req, res) => {
  const projects = db.prepare(`
    SELECT p.*,
      COUNT(t.id) as task_count,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(projects);
});

app.get('/api/projects/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

app.post('/api/projects', (req, res) => {
  const { name, description, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare(
    'INSERT INTO projects (name, description, color) VALUES (?, ?, ?)'
  ).run(name.trim(), description || '', color || '#4f86f7');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
});

app.put('/api/projects/:id', (req, res) => {
  const { name, description, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare(
    `UPDATE projects SET name = ?, description = ?, color = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name.trim(), description || '', color || '#4f86f7', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found' });
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

app.delete('/api/projects/:id', (req, res) => {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found' });
  res.json({ success: true });
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

app.get('/api/projects/:id/tasks', (req, res) => {
  const tasks = db.prepare(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY start_date ASC, created_at ASC'
  ).all(req.params.id);
  res.json(tasks);
});

app.post('/api/projects/:id/tasks', (req, res) => {
  const { name, description, status, priority, start_date, end_date, progress, assignee } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare(
    `INSERT INTO tasks (project_id, name, description, status, priority, start_date, end_date, progress, assignee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.params.id, name.trim(), description || '',
    status || 'todo', priority || 'medium',
    start_date || null, end_date || null,
    progress || 0, assignee || ''
  );
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const { name, description, status, priority, start_date, end_date, progress, assignee } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare(
    `UPDATE tasks SET name = ?, description = ?, status = ?, priority = ?,
     start_date = ?, end_date = ?, progress = ?, assignee = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name.trim(), description || '', status || 'todo', priority || 'medium',
    start_date || null, end_date || null, progress || 0, assignee || '',
    req.params.id
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Task not found' });
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

app.delete('/api/tasks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Task not found' });
  res.json({ success: true });
});

// ─── Catch-all error handlers ─────────────────────────────────────────────────

// JSON 404 for unmatched /api/* routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Global error handler — always return JSON for /api, HTML otherwise
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
  res.status(500).send('Internal server error');
});

app.listen(PORT, () => {
  console.log(`ProjectPM running at http://localhost:${PORT}`);
});
