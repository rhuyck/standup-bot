import chalk from 'chalk';
import { loadConfig } from '../config';
import { getGithubEventsSince, getJiraEventsSince, getTicketsByStatuses } from '../db';
import { getLookbackDate, isMonday, formatDisplayDate, formatShortDate } from '../utils/time';
import { transformGithubEvents, transformJiraEvents, StandupItem } from '../utils/fakeit';

export function runStandup(fakeit: boolean): void {
  const config = loadConfig();
  const since = getLookbackDate();
  const monday = isMonday();

  const githubEvents = getGithubEventsSince(since);
  const jiraEvents = getJiraEventsSince(since);

  const header = chalk.bold.cyan(`\n=== STANDUP — ${formatDisplayDate(new Date())} ===`);
  const period = monday
    ? chalk.gray(`  (covering Thu ${formatShortDate(since)} — today)`)
    : chalk.gray(`  (since yesterday)`);

  console.log(header);
  console.log(period);

  // --- YESTERDAY / SINCE THURSDAY ---
  const sinceLabel = monday ? `Since Thursday` : `Yesterday`;
  console.log(chalk.bold.yellow(`\n${sinceLabel}:`));

  if (githubEvents.length === 0 && jiraEvents.length === 0) {
    console.log(chalk.gray('  No activity recorded.'));
  } else {
    if (fakeit) {
      const ghItems = transformGithubEvents(githubEvents);
      const jiraItems = transformJiraEvents(jiraEvents);
      printFakeitItems([...jiraItems, ...ghItems]);
    } else {
      printGithubEvents(githubEvents);
      printJiraEvents(jiraEvents, config.jira.email);
    }
  }

  // --- TODAY ---
  console.log(chalk.bold.yellow(`\nToday:`));

  const todoStatuses = [
    ...config.jira.statuses.inDevelopment,
    ...config.jira.statuses.qaTestFailed,
    ...config.jira.statuses.peerReview,
  ];
  const todayTickets = getTicketsByStatuses(todoStatuses);

  if (todayTickets.length === 0) {
    console.log(chalk.gray('  No active tickets.'));
  } else {
    for (const t of todayTickets) {
      const statusColor = getStatusColor(t.status, config);
      const statusLabel = statusColor(`[${t.status}]`);
      const sprintBadge = t.sprint ? chalk.dim(` {${t.sprint}}`) : '';
      if (fakeit) {
        const action = getFakeitTodayAction(t.status, config);
        console.log(`  • ${action} [**${t.key}**]${sprintBadge} — ${t.summary}`);
      } else {
        console.log(`  • ${statusLabel} [${chalk.bold(t.key)}]${sprintBadge} — ${t.summary}`);
      }
    }
  }

  // --- BLOCKERS ---
  console.log(chalk.bold.yellow(`\nBlockers:`));
  const qaFailed = getTicketsByStatuses(config.jira.statuses.qaTestFailed);
  const stalePeerReview = getTicketsByStatuses(config.jira.statuses.peerReview).filter(t => {
    const daysOld = (Date.now() - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysOld > 3;
  });

  if (qaFailed.length === 0 && stalePeerReview.length === 0) {
    console.log(chalk.gray('  None'));
  } else {
    for (const t of qaFailed) {
      console.log(chalk.red(`  • [${t.key}] QA Test Failed — ${t.summary}`));
    }
    for (const t of stalePeerReview) {
      console.log(chalk.yellow(`  • [${t.key}] Peer Review stalled (${Math.floor((Date.now() - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24))}d) — ${t.summary}`));
    }
  }

  console.log('');
}

function printGithubEvents(events: ReturnType<typeof getGithubEventsSince>): void {
  if (events.length === 0) return;

  console.log(chalk.dim('  GitHub:'));
  for (const e of events) {
    const repo = chalk.cyan(e.repo.split('/')[1] ?? e.repo);
    if (e.type === 'push') {
      const branch = chalk.blue(e.branch ?? '?');
      console.log(`    • Pushed ${e.commit_count} commit(s) to ${branch} in ${repo}`);
    } else if (e.type === 'branch_created') {
      console.log(`    • Created branch ${chalk.blue(e.branch ?? '?')} in ${repo}`);
    } else if (e.type === 'pr_merged') {
      console.log(`    • Merged PR #${e.pr_number} in ${repo}: ${chalk.green(e.pr_title ?? '')}`);
    } else if (e.type === 'pr_opened') {
      console.log(`    • Opened PR #${e.pr_number} in ${repo}: ${e.pr_title ?? ''}`);
    }
  }
}

function printJiraEvents(events: ReturnType<typeof getJiraEventsSince>, myEmail: string): void {
  if (events.length === 0) return;

  console.log(chalk.dim('  Jira:'));
  for (const e of events) {
    const key = chalk.bold(e.ticket_key);
    const summary = chalk.dim(` — ${e.ticket_summary ?? ''}`);

    if (e.event_type === 'status_change') {
      const from = chalk.yellow(e.old_value ?? '?');
      const to = chalk.green(e.new_value ?? '?');
      const who = e.author_email === '__automation__' ? chalk.dim(' (automation)') : '';
      console.log(`    • [${key}] ${from} → ${to}${who}${summary}`);
    } else if (e.event_type === 'comment') {
      console.log(`    • [${key}] Added comment${summary}`);
    } else if (e.event_type === 'created') {
      console.log(`    • [${key}] Created ticket${summary}`);
    }
  }
}

function printFakeitItems(items: StandupItem[]): void {
  for (const item of items) {
    // Strip markdown bold syntax for terminal output, re-apply chalk
    const text = item.text
      .replace(/\*\*(.+?)\*\*/g, (_, s) => chalk.bold(s))
      .replace(/\*(.+?)\*/g, (_, s) => chalk.italic(s))
      .replace(/`(.+?)`/g, (_, s) => chalk.cyan(s));
    console.log(`  • ${text}`);
  }
}

function getStatusColor(status: string, config: ReturnType<typeof loadConfig>) {
  const s = config.jira.statuses;
  if (s.inDevelopment.includes(status)) return chalk.blue;
  if (s.qaTestFailed.includes(status)) return chalk.red;
  if (s.peerReview.includes(status)) return chalk.yellow;
  if (s.readyForQA.includes(status)) return chalk.green;
  return chalk.white;
}

function getFakeitTodayAction(status: string, config: ReturnType<typeof loadConfig>): string {
  const s = config.jira.statuses;
  if (s.inDevelopment.includes(status)) return 'Continuing active development on';
  if (s.qaTestFailed.includes(status)) return 'Triaging QA feedback and resolving defects on';
  if (s.peerReview.includes(status)) return 'Awaiting peer review approval on';
  if (s.readyForQA.includes(status)) return 'Monitoring QA pipeline for';
  return 'Working on';
}
