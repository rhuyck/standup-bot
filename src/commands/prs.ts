import chalk from 'chalk';
import Table from 'cli-table3';
import { loadConfig } from '../config';
import { getOpenPRs, extractJiraKey, OpenPR } from '../github';
import { getTicketsByStatuses, getTicketByKey } from '../db';

export async function runPrs(): Promise<void> {
  const config = loadConfig();

  console.log(chalk.bold.cyan('\n=== OPEN PRs & PEER REVIEW ===\n'));
  console.log(chalk.dim('  Fetching open PRs from GitHub...'));

  let openPRs: OpenPR[] = [];
  try {
    openPRs = await getOpenPRs(config);
    console.log(chalk.dim(`  Found ${openPRs.length} open PR(s) on GitHub`));
  } catch (err) {
    console.log(chalk.red(`  Error fetching PRs: ${err}`));
  }

  const peerReviewTickets = getTicketsByStatuses(config.jira.statuses.peerReview);

  // Build a map of jira key → ticket for quick lookup
  const jiraKeyMap = new Map(peerReviewTickets.map(t => [t.key, t]));

  // Build a map of jira key → PR (matched by ticket # in PR title)
  const prByJiraKey = new Map<string, OpenPR>();
  const unmatchedPRs: OpenPR[] = [];

  for (const pr of openPRs) {
    if (pr.jiraKey) {
      prByJiraKey.set(pr.jiraKey, pr);
    } else {
      unmatchedPRs.push(pr);
    }
  }

  // --- Section 1: Matched PRs + Jira tickets ---
  const matched: Array<{ pr: OpenPR | null; jiraKey: string; jiraSummary: string; jiraStatus: string; flag: string }> = [];

  // All peer-review tickets
  for (const ticket of peerReviewTickets) {
    const pr = prByJiraKey.get(ticket.key) ?? null;
    const flag = detectWorkflowIssue(pr, ticket.status, config);
    matched.push({
      pr,
      jiraKey: ticket.key,
      jiraSummary: ticket.summary,
      jiraStatus: ticket.status,
      flag,
    });
  }

  // Open PRs with a jira key that aren't in peer review (possibly workflow failed)
  for (const [key, pr] of prByJiraKey.entries()) {
    if (!jiraKeyMap.has(key)) {
      const dbTicket = getTicketByKey(key);
      const jiraStatus = dbTicket?.status ?? 'Unknown';
      const flag = detectWorkflowIssue(pr, jiraStatus, config);
      matched.push({
        pr,
        jiraKey: key,
        jiraSummary: dbTicket?.summary ?? '(not in local DB)',
        jiraStatus,
        flag,
      });
    }
  }

  if (matched.length > 0) {
    console.log(chalk.bold.yellow('\n  Peer Review / Open PRs:\n'));

    const table = new Table({
      head: [
        chalk.bold('Jira'),
        chalk.bold('PR #'),
        chalk.bold('CI'),
        chalk.bold('Jira Status'),
        chalk.bold('Summary'),
        chalk.bold('Flags'),
      ],
      colWidths: [10, 8, 8, 18, 40, 30],
      wordWrap: true,
      style: { head: [], border: [] },
    });

    for (const row of matched) {
      const prNum = row.pr ? chalk.blue(`#${row.pr.number}`) : chalk.dim('none');
      const ciStatus = row.pr ? formatCi(row.pr.ciStatus) : chalk.dim('—');
      const jiraStatus = formatJiraStatus(row.jiraStatus, config);
      const flag = row.flag ? chalk.red(row.flag) : chalk.dim('—');

      table.push([
        chalk.bold(row.jiraKey),
        prNum,
        ciStatus,
        jiraStatus,
        truncate(row.jiraSummary, 38),
        flag,
      ]);
    }

    console.log(table.toString());
  }

  // --- Section 2: Unmatched PRs (no Jira key found) ---
  if (unmatchedPRs.length > 0) {
    console.log(chalk.bold.yellow('\n  Open PRs (no Jira ticket matched):\n'));

    const table = new Table({
      head: [chalk.bold('Repo'), chalk.bold('PR #'), chalk.bold('CI'), chalk.bold('Title')],
      colWidths: [20, 8, 10, 60],
      wordWrap: true,
      style: { head: [], border: [] },
    });

    for (const pr of unmatchedPRs) {
      const repo = pr.repo.split('/')[1] ?? pr.repo;
      table.push([
        chalk.cyan(repo),
        chalk.blue(`#${pr.number}`),
        formatCi(pr.ciStatus),
        truncate(pr.title, 58),
      ]);
    }

    console.log(table.toString());
  }

  if (openPRs.length === 0 && peerReviewTickets.length === 0) {
    console.log(chalk.green('  All clear — no open PRs or Peer Review tickets.\n'));
    return;
  }

  // --- Summary of flags ---
  const flagged = matched.filter(r => r.flag);
  if (flagged.length > 0) {
    console.log(chalk.bold.red('\n  ⚠ Action Required:\n'));
    for (const r of flagged) {
      console.log(chalk.red(`    • [${r.jiraKey}] ${r.flag}`));
      if (r.pr) {
        console.log(chalk.dim(`      PR: ${r.pr.url}`));
      }
      console.log(chalk.dim(`      Jira: https://${config.jira.domain}/browse/${r.jiraKey}`));
    }
  }

  console.log('');
}

function detectWorkflowIssue(
  pr: OpenPR | null,
  jiraStatus: string,
  config: ReturnType<typeof loadConfig>,
): string {
  const s = config.jira.statuses;

  // PR exists but Jira ticket not in Peer Review or beyond — might be stale
  if (pr && s.peerReview.includes(jiraStatus) && pr.ciStatus === 'failing') {
    return 'CI failing — review blocked';
  }

  // PR merged but ticket still in Peer Review (automation may have failed)
  if (!pr && s.peerReview.includes(jiraStatus)) {
    return 'No open PR found — workflow may have failed to advance ticket';
  }

  return '';
}

function formatCi(ciStatus: string | null): string {
  if (!ciStatus) return chalk.dim('—');
  if (ciStatus === 'passing') return chalk.green('✓ pass');
  if (ciStatus === 'failing') return chalk.red('✗ fail');
  if (ciStatus === 'pending') return chalk.yellow('… pending');
  return chalk.dim(ciStatus);
}

function formatJiraStatus(status: string, config: ReturnType<typeof loadConfig>): string {
  const s = config.jira.statuses;
  if (s.peerReview.includes(status)) return chalk.yellow(status);
  if (s.readyForQA.includes(status)) return chalk.green(status);
  if (s.qaTestFailed.includes(status)) return chalk.red(status);
  if (s.inDevelopment.includes(status)) return chalk.blue(status);
  return chalk.gray(status);
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}
