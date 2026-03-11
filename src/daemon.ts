import cron from 'node-cron';
import fs from 'fs';
import { loadConfig, CONFIG_DIR, LOG_PATH } from './config';
import { getDb } from './db';
import { pollGithub } from './github';
import { pollJira } from './jira';

// Redirect stdout/stderr to log file when running as a daemon
function setupLogging(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
    logStream.write(line + '\n');
    // Also write to real stdout (captured by launchd StandardOutPath)
    process.stdout.write(line + '\n');
  };

  console.error = (...args: unknown[]) => {
    const line = `[${new Date().toISOString()}] ERROR: ${args.join(' ')}`;
    logStream.write(line + '\n');
    process.stderr.write(line + '\n');
  };
}

async function runPoll(): Promise<void> {
  const config = loadConfig();
  console.log('--- Poll cycle starting ---');
  await Promise.allSettled([
    pollGithub(config),
    pollJira(config),
  ]);
  console.log('--- Poll cycle complete ---');
}

async function main(): Promise<void> {
  setupLogging();
  console.log('standup-bot daemon starting');

  const config = loadConfig();

  // Init DB
  getDb();

  // Run immediately on start
  await runPoll();

  const interval = config.polling.intervalMinutes;
  const cronExpr = `*/${interval} * * * *`;

  console.log(`Scheduling polls every ${interval} minute(s) (cron: ${cronExpr})`);

  cron.schedule(cronExpr, async () => {
    await runPoll();
  });

  console.log('Daemon running. Press Ctrl+C to stop.');

  // Keep process alive
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down');
    process.exit(0);
  });
}

main().catch(err => {
  console.error(`Fatal: ${err}`);
  process.exit(1);
});
