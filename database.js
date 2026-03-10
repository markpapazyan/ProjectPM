const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'projects.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#4f86f7',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    start_date TEXT,
    end_date TEXT,
    progress INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    assignee TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

// Seed sample data if empty
const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get();
if (projectCount.count === 0) {
  const insertProject = db.prepare(
    'INSERT INTO projects (name, description, color) VALUES (?, ?, ?)'
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks (project_id, name, description, status, priority, start_date, end_date, progress, assignee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const p1 = insertProject.run('Website Redesign', 'Redesign the company website with modern UI', '#4f86f7');
  const p2 = insertProject.run('Mobile App', 'Build iOS and Android mobile app', '#34c97e');

  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  insertTask.run(p1.lastInsertRowid, 'Design Mockups', 'Create Figma mockups for all pages', 'done', 'high', fmt(today), fmt(addDays(today, 7)), 100, 'Alice');
  insertTask.run(p1.lastInsertRowid, 'Frontend Development', 'Implement HTML/CSS/JS', 'in_progress', 'high', fmt(addDays(today, 5)), fmt(addDays(today, 20)), 60, 'Bob');
  insertTask.run(p1.lastInsertRowid, 'Backend API', 'Build REST API endpoints', 'in_progress', 'medium', fmt(addDays(today, 8)), fmt(addDays(today, 18)), 40, 'Charlie');
  insertTask.run(p1.lastInsertRowid, 'Testing & QA', 'End-to-end testing', 'todo', 'medium', fmt(addDays(today, 18)), fmt(addDays(today, 25)), 0, 'Alice');
  insertTask.run(p1.lastInsertRowid, 'Launch', 'Deploy to production', 'todo', 'high', fmt(addDays(today, 25)), fmt(addDays(today, 28)), 0, 'Bob');

  insertTask.run(p2.lastInsertRowid, 'Requirements Gathering', 'Define app features and user stories', 'done', 'high', fmt(today), fmt(addDays(today, 5)), 100, 'Diana');
  insertTask.run(p2.lastInsertRowid, 'UI/UX Design', 'Design app screens and flows', 'in_progress', 'high', fmt(addDays(today, 3)), fmt(addDays(today, 15)), 50, 'Eve');
  insertTask.run(p2.lastInsertRowid, 'iOS Development', 'Build native iOS app', 'todo', 'medium', fmt(addDays(today, 14)), fmt(addDays(today, 35)), 0, 'Frank');
  insertTask.run(p2.lastInsertRowid, 'Android Development', 'Build native Android app', 'todo', 'medium', fmt(addDays(today, 14)), fmt(addDays(today, 35)), 0, 'Grace');
  insertTask.run(p2.lastInsertRowid, 'App Store Submission', 'Submit to Apple and Google stores', 'todo', 'low', fmt(addDays(today, 35)), fmt(addDays(today, 42)), 0, 'Diana');
}

module.exports = db;
