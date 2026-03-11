import fs from 'fs';
import path from 'path';
import os from 'os';

export const CONFIG_DIR = path.join(os.homedir(), '.standup-bot');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
export const DB_PATH = path.join(CONFIG_DIR, 'standup.db');
export const LOG_PATH = path.join(CONFIG_DIR, 'daemon.log');

export interface JiraStatuses {
  todo: string[];
  inDevelopment: string[];
  qaTestFailed: string[];
  peerReview: string[];
  readyForQA: string[];
  done: string[];
}

export interface Config {
  github: {
    token: string;
    username: string;
  };
  jira: {
    domain: string;
    email: string;
    apiToken: string;
    projects: string[];
    customFields: {
      storyPoints: string;
      sprint: string;
    };
    statuses: JiraStatuses;
  };
  polling: {
    intervalMinutes: number;
  };
}

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found at ${CONFIG_PATH}`);
    console.error(`Run: mkdir -p ~/.standup-bot && cp config.json ~/.standup-bot/config.json`);
    console.error('Then edit ~/.standup-bot/config.json with your credentials.');
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Config & { jira: { project?: string | string[] } };
    // Normalize "project" (singular or array) → "projects" array
    if (!parsed.jira.projects) {
      const p = parsed.jira.project;
      parsed.jira.projects = Array.isArray(p) ? p : (p ? [p] : []);
    }
    _config = parsed as Config;
    return _config;
  } catch (e) {
    console.error(`Failed to parse config: ${e}`);
    process.exit(1);
  }
}

export function allTrackedStatuses(config: Config): string[] {
  const s = config.jira.statuses;
  return [
    ...s.todo,
    ...s.inDevelopment,
    ...s.qaTestFailed,
    ...s.peerReview,
    ...s.readyForQA,
  ];
}
