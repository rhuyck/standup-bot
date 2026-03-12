import chalk from 'chalk';
import { loadConfig, Config } from '../config';
import { getGithubEventsSince, getJiraEventsSince, getTicketsByStatuses, JiraEvent, GithubEvent } from '../db';
import { getLookbackDate, getCustomLookbackDate, isMonday, formatDisplayDate, formatShortDate, formatTimestamp } from '../utils/time';
import { transformGithubEvents, transformJiraEvents, StandupItem } from '../utils/fakeit';
import { isIgnoredRepo } from '../github';
import { hyperlink } from '../utils/format';
import { fetchAllUsersJiraEvents } from '../jira';

export interface StandupOptions {
  fakeit?: boolean;
  days?: number;
  allUsers?: boolean;
  jiraOnly?: boolean;
  gitOnly?: boolean;
  proj?: string;
  repo?: string;
}

export async function runStandup(opts: StandupOptions = {}): Promise<void> {
  const { fakeit = false, days, allUsers = false, jiraOnly = false, gitOnly = false, proj, repo } = opts;
  const config = loadConfig();
  const since = days !== undefined ? getCustomLookbackDate(days) : getLookbackDate();
  const monday = days === undefined && isMonday();

  const header = chalk.bold.cyan(`\n=== STANDUP — ${formatDisplayDate(new Date())} ===`);
  const period = days !== undefined
    ? chalk.gray(`  (last ${days} day${days === 1 ? '' : 's'}, since ${formatShortDate(since)})`)
    : monday
      ? chalk.gray(`  (covering Thu ${formatShortDate(since)} — today)`)
      : chalk.gray(`  (since yesterday)`);

  const scopeParts: string[] = [];
  if (allUsers) scopeParts.push('Jira: all users (live query)');
  if (proj) scopeParts.push(`project: ${proj.toUpperCase()}`);
  if (repo) scopeParts.push(`repo: ~${repo}`);
  const scopeNote = scopeParts.length > 0 ? chalk.dim(`  [${scopeParts.join(', ')}]`) : '';

  console.log(header);
  console.log(period);
  if (scopeNote) console.log(scopeNote);

  const showGit = !jiraOnly;
  const showJira = !gitOnly;

  // --- GITHUB EVENTS ---
  let githubEvents: GithubEvent[] = [];
  if (showGit) {
    githubEvents = getGithubEventsSince(since).filter(e => !isIgnoredRepo(e.repo, config));
    if (repo) {
      const repoFilter = repo.toLowerCase();
      githubEvents = githubEvents.filter(e => e.repo.toLowerCase().includes(repoFilter));
    }
  }

  // --- JIRA EVENTS ---
  let jiraEvents: JiraEvent[] = [];
  if (showJira) {
    if (allUsers) {
      jiraEvents = await fetchAllUsersJiraEvents(config, since);
    } else {
      jiraEvents = getJiraEventsSince(since);
    }
    if (proj) {
      const projPrefix = proj.toUpperCase() + '-';
      jiraEvents = jiraEvents.filter(e => e.ticket_key.startsWith(projPrefix));
    }
  }

  // --- YESTERDAY / SINCE THURSDAY ---
  const sinceLabel = days !== undefined ? `Last ${days} day${days === 1 ? '' : 's'}` : monday ? `Since Thursday` : `Yesterday`;
  console.log(chalk.bold.yellow(`\n${sinceLabel}:`));

  if (githubEvents.length === 0 && jiraEvents.length === 0) {
    console.log(chalk.gray('  No activity recorded.'));
  } else {
    if (fakeit) {
      const ghItems = transformGithubEvents(githubEvents);
      const jiraItems = transformJiraEvents(jiraEvents);
      printFakeitItems([...jiraItems, ...ghItems], config.jira.domain);
    } else {
      if (showGit) printGithubEvents(githubEvents, config, allUsers);
      if (showJira) printJiraEvents(jiraEvents, config.jira.email, config.jira.domain, allUsers);
    }
  }

  // Today/Blockers read from DB (current user's tickets only)
  if (allUsers) {
    console.log(chalk.dim('\n  (Today and Blockers reflect your assigned tickets only — omit --allusers for full standup view)\n'));
    return;
  }

  // --- TODAY ---
  if (showJira) {
    console.log(chalk.bold.yellow(`\nToday:`));

    const todoStatuses = [
      ...config.jira.statuses.inDevelopment,
      ...config.jira.statuses.qaTestFailed,
      ...config.jira.statuses.peerReview,
    ];
    let todayTickets = getTicketsByStatuses(todoStatuses);
    if (proj) {
      const projPrefix = proj.toUpperCase() + '-';
      todayTickets = todayTickets.filter(t => t.key.startsWith(projPrefix));
    }

    if (todayTickets.length === 0) {
      console.log(chalk.gray('  No active tickets.'));
    } else {
      for (const t of todayTickets) {
        const statusColor = getStatusColor(t.status, config);
        const statusLabel = statusColor(`[${t.status}]`);
        const sprintBadge = t.sprint ? chalk.dim(` {${t.sprint}}`) : '';
        const ticketUrl = `https://${config.jira.domain}/browse/${t.key}`;
        if (fakeit) {
          const action = getFakeitTodayAction(t.status, config);
          const keyLink = hyperlink(chalk.bold(t.key), ticketUrl);
          console.log(`  • ${action} [${keyLink}]${sprintBadge} — ${t.summary}`);
        } else {
          const keyLink = hyperlink(chalk.bold(t.key), ticketUrl);
          console.log(`  • ${statusLabel} [${keyLink}]${sprintBadge} — ${t.summary}`);
        }
      }
    }
  }

  // --- BLOCKERS ---
  if (showJira) {
    console.log(chalk.bold.yellow(`\nBlockers:`));

    let blocked = getTicketsByStatuses(config.jira.statuses.blocked ?? []);
    let qaFailed = getTicketsByStatuses(config.jira.statuses.qaTestFailed);
    let stalePeerReview = getTicketsByStatuses(config.jira.statuses.peerReview).filter(t => {
      const daysOld = (Date.now() - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysOld > 3;
    });

    if (proj) {
      const projPrefix = proj.toUpperCase() + '-';
      blocked = blocked.filter(t => t.key.startsWith(projPrefix));
      qaFailed = qaFailed.filter(t => t.key.startsWith(projPrefix));
      stalePeerReview = stalePeerReview.filter(t => t.key.startsWith(projPrefix));
    }

    if (blocked.length === 0 && qaFailed.length === 0 && stalePeerReview.length === 0) {
      console.log(chalk.gray('  None'));
    } else {
      for (const t of blocked) {
        const ticketUrl = `https://${config.jira.domain}/browse/${t.key}`;
        const keyLink = hyperlink(t.key, ticketUrl);
        console.log(chalk.red(`  • [${keyLink}] Blocked — ${t.summary}`));
      }
      for (const t of qaFailed) {
        const ticketUrl = `https://${config.jira.domain}/browse/${t.key}`;
        const keyLink = hyperlink(t.key, ticketUrl);
        console.log(chalk.red(`  • [${keyLink}] QA Test Failed — ${t.summary}`));
      }
      for (const t of stalePeerReview) {
        const ticketUrl = `https://${config.jira.domain}/browse/${t.key}`;
        const keyLink = hyperlink(t.key, ticketUrl);
        const daysStale = Math.floor((Date.now() - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        console.log(chalk.yellow(`  • [${keyLink}] Peer Review stalled (${daysStale}d) — ${t.summary}`));
      }
    }
  }

  console.log('');
}

function printGithubEvents(events: GithubEvent[], config: Config, allUsers = false): void {
  if (events.length === 0) return;

  const label = allUsers ? '  GitHub (your activity):' : '  GitHub:';
  console.log(chalk.dim(label));
  for (const e of events) {
    const ts = chalk.dim(formatTimestamp(e.created_at));
    const repoShort = e.repo.split('/')[1] ?? e.repo;
    const repo = chalk.cyan(repoShort);
    if (e.type === 'push') {
      const isMain = e.branch === 'main' || e.branch === 'master';
      const branchName = e.branch ?? '?';
      const branchUrl = `https://github.com/${e.repo}/tree/${branchName}`;
      const branchColored = isMain ? chalk.magenta.bold(branchName) : chalk.blue(branchName);
      const branch = hyperlink(branchColored, branchUrl);
      const msg = e.message ? chalk.dim(` "${trunc(e.message, 75)}"`) : '';
      console.log(`    ${ts} Pushed ${e.commit_count} commit(s) to ${branch} in ${repo}${msg}`);
    } else if (e.type === 'branch_created') {
      const branchName = e.branch ?? '?';
      const branchUrl = `https://github.com/${e.repo}/tree/${branchName}`;
      const branch = hyperlink(chalk.blue(branchName), branchUrl);
      console.log(`    ${ts} Created branch ${branch} in ${repo}`);
    } else if (e.type === 'pr_merged') {
      const title = e.pr_title ? ` ${chalk.green(trunc(e.pr_title, 75))}` : '';
      const prLink = hyperlink(`#${e.pr_number}`, `https://github.com/${e.repo}/pull/${e.pr_number}`);
      console.log(`    ${ts} Merged PR ${prLink} in ${repo}:${title}`);
    } else if (e.type === 'pr_opened') {
      const title = e.pr_title ? ` ${trunc(e.pr_title, 75)}` : '';
      const prLink = hyperlink(`#${e.pr_number}`, `https://github.com/${e.repo}/pull/${e.pr_number}`);
      console.log(`    ${ts} Opened PR ${prLink} in ${repo}:${title}`);
    }
  }
}

function trunc(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

function printJiraEvents(events: JiraEvent[], myEmail: string, jiraDomain: string, allUsers = false): void {
  if (events.length === 0) return;

  console.log(chalk.dim('  Jira:'));
  for (const e of events) {
    const ts = chalk.dim(formatTimestamp(e.created_at));
    const ticketUrl = `https://${jiraDomain}/browse/${e.ticket_key}`;
    const key = hyperlink(chalk.bold(e.ticket_key), ticketUrl);
    const summary = chalk.dim(` — ${e.ticket_summary ?? ''}`);

    if (e.event_type === 'status_change') {
      const from = chalk.yellow(e.old_value ?? '?');
      const to = chalk.green(e.new_value ?? '?');
      let who: string;
      if (allUsers && e.author_email && e.author_email !== '__automation__') {
        who = chalk.dim(` (${e.author_email.split('@')[0]})`);
      } else if (e.author_email === '__automation__' || (allUsers && !e.author_email)) {
        who = chalk.dim(' (automation)');
      } else {
        who = '';
      }
      console.log(`    ${ts} [${key}] ${from} → ${to}${who}${summary}`);
    } else if (e.event_type === 'comment') {
      const who = allUsers && e.author_email ? chalk.dim(` (${e.author_email.split('@')[0]})`) : '';
      console.log(`    ${ts} [${key}] Added comment${who}${summary}`);
    } else if (e.event_type === 'created') {
      const who = allUsers && e.author_email ? chalk.dim(` (${e.author_email.split('@')[0]})`) : '';
      console.log(`    ${ts} [${key}] Created ticket${who}${summary}`);
    }
  }
}

function printFakeitItems(items: StandupItem[], jiraDomain: string): void {
  for (const item of items) {
    const ts = item.timestamp ? chalk.dim(formatTimestamp(item.timestamp)) + ' ' : '';
    const text = item.text
      .replace(/\*\*([A-Z][A-Z0-9]+-\d+)\*\*/g, (_, key) =>
        chalk.bold(hyperlink(key, `https://${jiraDomain}/browse/${key}`))
      )
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
