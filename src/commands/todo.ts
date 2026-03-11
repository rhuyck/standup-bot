import chalk from 'chalk';
import Table from 'cli-table3';
import { loadConfig } from '../config';
import { getTicketsByStatuses } from '../db';

export function runTodo(): void {
  const config = loadConfig();
  const statuses = [
    ...config.jira.statuses.todo,
    ...config.jira.statuses.inDevelopment,
    ...config.jira.statuses.qaTestFailed,
  ];

  const tickets = getTicketsByStatuses(statuses);

  console.log(chalk.bold.cyan(`\n=== TODO / IN PROGRESS ===\n`));

  if (tickets.length === 0) {
    console.log(chalk.gray('  No tickets found in To-Do, In Development, or QA Test Failed.'));
    console.log(chalk.dim('  (Run the daemon first if this is a fresh install)\n'));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold('Ticket'),
      chalk.bold('Status'),
      chalk.bold('Pts'),
      chalk.bold('Sprint'),
      chalk.bold('Summary'),
    ],
    colWidths: [12, 20, 5, 22, 50],
    wordWrap: true,
    style: { head: [], border: [] },
  });

  // Sort: sprint tickets first, then alphabetically by key
  const withSprint = tickets.filter(t => t.sprint);
  const withoutSprint = tickets.filter(t => !t.sprint);
  const sorted = [...withSprint, ...withoutSprint];

  for (const t of sorted) {
    const statusColor = getStatusColor(t.status, config);
    const pts = t.story_points != null ? String(t.story_points) : chalk.dim('—');
    const sprint = t.sprint ? chalk.cyan(truncate(t.sprint, 20)) : chalk.dim('—');
    const summary = truncate(t.summary, 48);

    table.push([
      chalk.bold(t.key),
      statusColor(truncate(t.status, 18)),
      pts,
      sprint,
      summary,
    ]);
  }

  console.log(table.toString());

  const totalPts = tickets.reduce((sum, t) => sum + (t.story_points ?? 0), 0);
  const sprintTickets = withSprint.length;
  console.log(chalk.dim(`\n  ${tickets.length} ticket(s) | ${totalPts} story points | ${sprintTickets} in active sprint\n`));
}

function getStatusColor(status: string, config: ReturnType<typeof loadConfig>) {
  const s = config.jira.statuses;
  if (s.todo.includes(status)) return chalk.white;
  if (s.inDevelopment.includes(status)) return chalk.blue;
  if (s.qaTestFailed.includes(status)) return chalk.red;
  return chalk.gray;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}
