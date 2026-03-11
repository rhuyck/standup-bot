import Database from 'better-sqlite3';
import fs from 'fs';
import { CONFIG_DIR, DB_PATH } from './config';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      repo TEXT NOT NULL,
      branch TEXT,
      pr_number INTEGER,
      pr_title TEXT,
      commit_count INTEGER,
      sha TEXT,
      created_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jira_tickets (
      key TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      issue_type TEXT,
      story_points REAL,
      sprint TEXT,
      priority TEXT,
      url TEXT,
      updated_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jira_events (
      id TEXT PRIMARY KEY,
      ticket_key TEXT NOT NULL,
      ticket_summary TEXT,
      event_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      author_email TEXT,
      created_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_github_events_created ON github_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_jira_events_created ON jira_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_jira_tickets_status ON jira_tickets(status);
  `);
}

// --- Meta ---

export function getMeta(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setMeta(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

// --- GitHub Events ---

export interface GithubEvent {
  id: string;
  type: string;
  repo: string;
  branch: string | null;
  pr_number: number | null;
  pr_title: string | null;
  commit_count: number | null;
  sha: string | null;
  created_at: string;
}

export function insertGithubEvent(event: GithubEvent): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO github_events
      (id, type, repo, branch, pr_number, pr_title, commit_count, sha, created_at)
    VALUES
      (@id, @type, @repo, @branch, @pr_number, @pr_title, @commit_count, @sha, @created_at)
  `).run(event);
}

export function getGithubEventsSince(since: Date): GithubEvent[] {
  return getDb().prepare(
    'SELECT * FROM github_events WHERE created_at >= ? ORDER BY created_at DESC'
  ).all(since.toISOString()) as GithubEvent[];
}

export function getRecentRepos(days = 30): string[] {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = getDb().prepare(
    'SELECT DISTINCT repo FROM github_events WHERE created_at >= ? ORDER BY repo'
  ).all(since) as { repo: string }[];
  return rows.map(r => r.repo);
}

// --- Jira Tickets ---

export interface JiraTicket {
  key: string;
  summary: string;
  status: string;
  issue_type: string | null;
  story_points: number | null;
  sprint: string | null;
  priority: string | null;
  url: string | null;
  updated_at: string;
}

export function upsertJiraTicket(ticket: JiraTicket): void {
  getDb().prepare(`
    INSERT INTO jira_tickets
      (key, summary, status, issue_type, story_points, sprint, priority, url, updated_at)
    VALUES
      (@key, @summary, @status, @issue_type, @story_points, @sprint, @priority, @url, @updated_at)
    ON CONFLICT(key) DO UPDATE SET
      summary    = excluded.summary,
      status     = excluded.status,
      issue_type = excluded.issue_type,
      story_points = excluded.story_points,
      sprint     = excluded.sprint,
      priority   = excluded.priority,
      url        = excluded.url,
      updated_at = excluded.updated_at,
      recorded_at = datetime('now')
  `).run(ticket);
}

export function getTicketsByStatuses(statuses: string[]): JiraTicket[] {
  const placeholders = statuses.map(() => '?').join(',');
  return getDb().prepare(
    `SELECT * FROM jira_tickets WHERE status IN (${placeholders})
     ORDER BY sprint IS NULL ASC, sprint ASC, key ASC`
  ).all(...statuses) as JiraTicket[];
}

export function getAllActiveTickets(): JiraTicket[] {
  return getDb().prepare(
    `SELECT * FROM jira_tickets
     WHERE status NOT IN ('Done', 'Closed', 'Resolved')
     ORDER BY sprint IS NULL ASC, sprint ASC, key ASC`
  ).all() as JiraTicket[];
}

export function getTicketByKey(key: string): JiraTicket | null {
  return getDb().prepare('SELECT * FROM jira_tickets WHERE key = ?').get(key) as JiraTicket | null;
}

// --- Jira Events ---

export interface JiraEvent {
  id: string;
  ticket_key: string;
  ticket_summary: string | null;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  author_email: string | null;
  created_at: string;
}

export function insertJiraEvent(event: JiraEvent): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO jira_events
      (id, ticket_key, ticket_summary, event_type, old_value, new_value, author_email, created_at)
    VALUES
      (@id, @ticket_key, @ticket_summary, @event_type, @old_value, @new_value, @author_email, @created_at)
  `).run(event);
}

export function getJiraEventsSince(since: Date): JiraEvent[] {
  return getDb().prepare(
    'SELECT * FROM jira_events WHERE created_at >= ? ORDER BY created_at DESC'
  ).all(since.toISOString()) as JiraEvent[];
}

export function removeStaleTickets(activeKeys: string[]): void {
  if (activeKeys.length === 0) return;
  const placeholders = activeKeys.map(() => '?').join(',');
  getDb().prepare(
    `DELETE FROM jira_tickets WHERE key NOT IN (${placeholders})`
  ).run(...activeKeys);
}
