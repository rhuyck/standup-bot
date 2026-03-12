#!/usr/bin/env node
import { runStandup } from './commands/standup';
import { runTodo } from './commands/todo';
import { runPrs } from './commands/prs';
import { runPoll } from './commands/poll';
import { runClones } from './commands/clones';

const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
    return args[idx + 1];
  }
  return undefined;
}

const daysVal = getArgValue('--days');
const days = daysVal ? parseInt(daysVal, 10) : undefined;
const proj = getArgValue('--proj');
const repo = getArgValue('--repo');

// Collect value-arg indices so they aren't treated as positional args
const valueIndices = new Set<number>();
for (const flag of ['--days', '--proj', '--repo']) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
    valueIndices.add(idx + 1);
  }
}

const flags = new Set(args.filter(a => a.startsWith('-')));
const positional = args.filter((a, i) => !a.startsWith('-') && !valueIndices.has(i));
const command = positional[0] ?? 'standup';

function printHelp(): void {
  console.log(`
standup-bot CLI

Commands:
  standup                  What you did yesterday / since Thursday (if Monday)
  standup --fakeit         Same, but framed impressively
  standup --days N         Look back N days instead of the default
  standup --git            Show only GitHub activity
  standup --jira           Show only Jira activity
  standup --allusers       Cross-team Jira activity via live query (up to 100 tickets)
                           NOTE: --allusers is Jira-only. GitHub events always reflect
                           your own activity (limited by your personal access token).
                           Cannot be combined with --git.
  standup --proj KEY       Filter Jira events and tickets to a specific project key
  standup --repo NAME      Filter GitHub events to repos containing NAME as a substring
  clones                   Last 100 CLONE tickets with status and creation date
  clones --proj KEY        Filter clones to a specific Jira project
  todo                     Tickets assigned to you in To-Do, In Dev, or QA Test Failed
  prs                      Open PRs and Peer Review tickets, with workflow issue detection
  poll                     Manually trigger a poll (GitHub + Jira)
  poll --git               Poll GitHub only
  poll --jira              Poll Jira only
  help                     Show this message

Examples:
  standup
  standup --fakeit
  standup --days 4
  standup --allusers --jira
  standup --allusers --jira --proj MYPROJ
  standup --allusers --proj MYPROJ        # Jira all-users + your own GitHub activity
  standup --git --repo renderer
  standup clones
  standup clones --proj SD
`);
}

async function main(): Promise<void> {
  switch (command) {
    case 'standup':
      if (flags.has('--allusers') && flags.has('--git')) {
        console.error('Error: --allusers is Jira-only and cannot be combined with --git.');
        console.error('GitHub events are always scoped to your personal access token.');
        process.exit(1);
      }
      await runStandup({
        fakeit: flags.has('--fakeit'),
        days,
        allUsers: flags.has('--allusers'),
        jiraOnly: flags.has('--jira'),
        gitOnly: flags.has('--git'),
        proj,
        repo,
      });
      break;

    case 'todo':
      runTodo();
      break;

    case 'prs':
      await runPrs();
      break;

    case 'clones':
      await runClones(proj);
      break;

    case 'poll':
      await runPoll(flags);
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
