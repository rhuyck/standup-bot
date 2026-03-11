#!/usr/bin/env node
import { runStandup } from './commands/standup';
import { runTodo } from './commands/todo';
import { runPrs } from './commands/prs';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('-')));
const positional = args.filter(a => !a.startsWith('-'));
const command = positional[0] ?? 'standup';

function printHelp(): void {
  console.log(`
standup-bot CLI

Commands:
  standup            What you did yesterday / since Thursday (if Monday)
  standup --fakeit   Same, but framed impressively
  todo               Tickets assigned to you in To-Do, In Dev, or QA Test Failed
  prs                Open PRs and Peer Review tickets, with workflow issue detection
  help               Show this message

Examples:
  standup
  standup --fakeit
  standup todo
  standup prs
`);
}

async function main(): Promise<void> {
  switch (command) {
    case 'standup':
      runStandup(flags.has('--fakeit'));
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
