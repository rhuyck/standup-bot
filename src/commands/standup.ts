import chalk from 'chalk';
import { loadConfig } from '../config';
import { getGithubEventsSince, getJiraEventsSince, getTicketsByStatuses } from '../db';
import { getLookbackDate, getCustomLookbackDate, isMonday, formatDisplayDate, formatShortDate, formatTimestamp } from '../utils/time';
import { transformGithubEvents, transformJiraEvents, StandupItem } from '../utils/fakeit';

export function runStandup(fakeit: boolean, days?: number): void {
  const config = loadConfig();
  const since = days !== undefined ? getCustomLookbackDate(days) : getLookbackDate();
  const monday = days === undefined && isMonday();

  const githubEvents = getGithubEventsSince(since);
  const jiraEvents = getJiraEventsSince(since);

  const header = chalk.bold.cyan(`\n=== STANDUP — ${formatDisplayDate(new Date())} ===`);
  const period = days !== undefined
    ? chalk.gray(`  (last ${days} day${days === 1 ? '' : 's'}, since ${formatShortDate(since)})`)
    : monday
      ? chalk.gray(`  (covering Thu ${formatShortDate(since)} — today)`)
      : chalk.gray(`  (since yesterday)`);

  console.log(header);
  console.log(period);

  // --- YESTERDAY / SINCE THURSDAY ---
  const sinceLabel = days !== undefined ? `Last ${days} day${days === 1 ? '' : 's'}` : monday ? `Since Thursday` : `Yesterday`;
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
    const ts = chalk.dim(formatTimestamp(e.created_at));
    const repo = chalk.cyan(e.repo.split('/')[1] ?? e.repo);
    if (e.type === 'push') {
      const isMain = e.branch === 'main' || e.branch === 'master';
      const branch = isMain ? chalk.magenta.bold(e.branch ?? '?') : chalk.blue(e.branch ?? '?');
      const msg = e.message ? chalk.dim(` "${trunc(e.message, 75)}"`) : '';
      console.log(`    ${ts} Pushed ${e.commit_count} commit(s) to ${branch} in ${repo}${msg}`);
    } else if (e.type === 'branch_created') {
      console.log(`    ${ts} Created branch ${chalk.blue(e.branch ?? '?')} in ${repo}`);
    } else if (e.type === 'pr_merged') {
      const title = e.pr_title ? ` ${chalk.green(trunc(e.pr_title, 75))}` : '';
      console.log(`    ${ts} Merged PR #${e.pr_number} in ${repo}:${title}`);
    } else if (e.type === 'pr_opened') {
      const title = e.pr_title ? ` ${trunc(e.pr_title, 75)}` : '';
      console.log(`    ${ts} Opened PR #${e.pr_number} in ${repo}:${title}`);
    }
  }
}

function trunc(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

function printJiraEvents(events: ReturnType<typeof getJiraEventsSince>, myEmail: string): void {
  if (events.length === 0) return;

  console.log(chalk.dim('  Jira:'));
  for (const e of events) {
    const ts = chalk.dim(formatTimestamp(e.created_at));
    const key = chalk.bold(e.ticket_key);
    const summary = chalk.dim(` — ${e.ticket_summary ?? ''}`);

    if (e.event_type === 'status_change') {
      const from = chalk.yellow(e.old_value ?? '?');
      const to = chalk.green(e.new_value ?? '?');
      const who = e.author_email === '__automation__' ? chalk.dim(' (automation)') : '';
      console.log(`    ${ts} [${key}] ${from} → ${to}${who}${summary}`);
    } else if (e.event_type === 'comment') {
      console.log(`    ${ts} [${key}] Added comment${summary}`);
    } else if (e.event_type === 'created') {
      console.log(`    ${ts} [${key}] Created ticket${summary}`);
    }
  }
}

function printFakeitItems(items: StandupItem[]): void {
  for (const item of items) {
    const ts = item.timestamp ? chalk.dim(formatTimestamp(item.timestamp)) + ' ' : '';
    const text = item.text
      .replace(/\*\*(.+?)\*\*/g, (_, s) => chalk.bold(s))
      .replace(/\*(.+?)\*/g, (_, s) => chalk.italic(s))
      .replace(/`(.+?)`/g, (_, s) => chalk.cyan(s));
    console.log(`  • ${ts}${text}`);
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
