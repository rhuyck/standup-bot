#!/usr/bin/env node
import { runStandup } from './commands/standup';
import { runTodo } from './commands/todo';
import { runPrs } from './commands/prs';

const args = process.argv.slice(2);

const daysIdx = args.indexOf('--days');
const days = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : undefined;

const flags = new Set(args.filter(a => a.startsWith('-')));
// Exclude flag names and their values (e.g. --days 7) from positional args
const positional = args.filter((a, i) => !a.startsWith('-') && !(daysIdx !== -1 && i === daysIdx + 1));
const command = positional[0] ?? 'standup';

function printHelp(): void {
  console.log(`
standup-bot CLI

Commands:
  standup              What you did yesterday / since Thursday (if Monday)
  standup --fakeit     Same, but framed impressively
  standup --days N     Look back N days instead of the default
  todo                 Tickets assigned to you in To-Do, In Dev, or QA Test Failed
  prs                  Open PRs and Peer Review tickets, with workflow issue detection
  help                 Show this message

Examples:
  standup
  standup --fakeit
  standup --days 4
  standup --fakeit --days 4
  standup todo
  standup prs
`);
}

async function main(): Promise<void> {
  switch (command) {
    case 'standup':
      runStandup(flags.has('--fakeit'), days);
      break;

    case 'todo':
      runTodo();
      break;

    case 'prs':
      await runPrs();
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
