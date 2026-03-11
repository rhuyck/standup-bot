import { GithubEvent } from '../db';
import { JiraEvent } from '../db';

export interface StandupItem {
  text: string;
  raw?: string;
  source: 'github' | 'jira';
}

const VERB_MAP: Record<string, string> = {
  'fixed': 'resolved',
  'fix': 'resolution of',
  'update': 'optimization of',
  'updated': 'optimized',
  'add': 'implementation of',
  'added': 'implemented',
  'change': 'refinement of',
  'changed': 'refined',
  'remove': 'elimination of',
  'removed': 'eliminated',
  'refactor': 'architectural improvement of',
  'wip': 'iterative development on',
  'cleanup': 'technical debt reduction in',
  'test': 'test coverage expansion for',
  'style': 'code quality improvement in',
};

function elevatePrTitle(title: string): string {
  let elevated = title;
  for (const [raw, fancy] of Object.entries(VERB_MAP)) {
    elevated = elevated.replace(new RegExp(`\\b${raw}\\b`, 'gi'), fancy);
  }
  return elevated;
}

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural}`;
}

export function transformGithubEvents(events: GithubEvent[]): StandupItem[] {
  const items: StandupItem[] = [];
  const repoSet = new Set<string>();
  let prsMerged = 0;
  let totalCommits = 0;

  for (const e of events) {
    repoSet.add(e.repo);

    if (e.type === 'push' && e.commit_count) {
      totalCommits += e.commit_count;
      const shortRepo = e.repo.split('/')[1] ?? e.repo;
      const branch = e.branch ?? 'unknown';
      const raw = `Pushed ${e.commit_count} commit(s) to ${branch} in ${shortRepo}`;

      if (e.commit_count >= 5) {
        items.push({
          text: `Conducted sustained development effort on \`${branch}\` in **${shortRepo}**, delivering ${e.commit_count} commits across the iteration`,
          raw,
          source: 'github',
        });
      } else if (e.commit_count >= 2) {
        items.push({
          text: `Executed ${e.commit_count}-commit development iteration on \`${branch}\` in **${shortRepo}**, refining implementation details`,
          raw,
          source: 'github',
        });
      } else {
        items.push({
          text: `Advanced \`${branch}\` in **${shortRepo}** with a targeted commit addressing implementation objectives`,
          raw,
          source: 'github',
        });
      }
    }

    if (e.type === 'branch_created') {
      const shortRepo = e.repo.split('/')[1] ?? e.repo;
      const raw = `Created branch ${e.branch} in ${shortRepo}`;
      items.push({
        text: `Initiated new development workstream: \`${e.branch}\` in **${shortRepo}**`,
        raw,
        source: 'github',
      });
    }

    if (e.type === 'pr_merged') {
      prsMerged++;
      const shortRepo = e.repo.split('/')[1] ?? e.repo;
      const title = e.pr_title ? elevatePrTitle(e.pr_title) : `PR #${e.pr_number}`;
      const raw = `Merged PR #${e.pr_number} in ${shortRepo}`;
      items.push({
        text: `Successfully delivered **${title}** (PR #${e.pr_number}) to the production pipeline in **${shortRepo}**, clearing path for downstream integration testing`,
        raw,
        source: 'github',
      });
    }

    if (e.type === 'pr_opened') {
      const shortRepo = e.repo.split('/')[1] ?? e.repo;
      const title = e.pr_title ? elevatePrTitle(e.pr_title) : `PR #${e.pr_number}`;
      const raw = `Opened PR #${e.pr_number} in ${shortRepo}`;
      items.push({
        text: `Submitted **${title}** (PR #${e.pr_number}) for peer review in **${shortRepo}**, advancing ticket toward QA validation`,
        raw,
        source: 'github',
      });
    }
  }

  // Synthetic bonus items — all technically implied and true
  if (prsMerged > 0) {
    items.push({
      text: `Maintained team development velocity through active PR lifecycle management (${pluralize(prsMerged, 'merge', 'merges')} completed)`,
      raw: '(implied)',
      source: 'github',
    });
  }

  if (repoSet.size > 1) {
    items.push({
      text: `Demonstrated cross-repository impact across ${pluralize(repoSet.size, 'project', 'projects')}: ${Array.from(repoSet).map(r => r.split('/')[1]).join(', ')}`,
      raw: '(implied)',
      source: 'github',
    });
  }

  if (totalCommits >= 8) {
    items.push({
      text: `Sustained high-output development cadence with ${totalCommits} total commits across the period`,
      raw: '(implied)',
      source: 'github',
    });
  }

  return items;
}

export function transformJiraEvents(events: JiraEvent[]): StandupItem[] {
  const items: StandupItem[] = [];
  const cyclesCompleted: string[] = [];

  for (const e of events) {
    const ticket = e.ticket_key;
    const summary = e.ticket_summary ?? '';

    if (e.event_type === 'status_change') {
      const from = e.old_value ?? '?';
      const to = e.new_value ?? '?';
      const raw = `[${ticket}] Status: ${from} → ${to}`;

      const toUpper = to.toLowerCase();
      if (toUpper.includes('peer review') || toUpper.includes('review')) {
        cyclesCompleted.push(ticket);
        items.push({
          text: `[**${ticket}**] Advanced to Peer Review following completion of all development objectives — *${summary}*`,
          raw,
          source: 'jira',
        });
      } else if (toUpper.includes('ready for qa') || toUpper.includes('ready')) {
        items.push({
          text: `[**${ticket}**] Pipeline validation complete — ticket promoted to Ready for QA — *${summary}*`,
          raw,
          source: 'jira',
        });
      } else if (toUpper.includes('qa test failed')) {
        items.push({
          text: `[**${ticket}**] QA feedback received and under active triage — *${summary}*`,
          raw,
          source: 'jira',
        });
      } else if (toUpper.includes('in development') || toUpper.includes('in progress')) {
        items.push({
          text: `[**${ticket}**] Initiated active development sprint on *${summary}*`,
          raw,
          source: 'jira',
        });
      } else if (e.author_email === '__automation__') {
        items.push({
          text: `[**${ticket}**] Automated pipeline successfully validated and advanced work item to **${to}** — *${summary}*`,
          raw,
          source: 'jira',
        });
      } else {
        items.push({
          text: `[**${ticket}**] Progressed from **${from}** to **${to}** — *${summary}*`,
          raw,
          source: 'jira',
        });
      }
    }

    if (e.event_type === 'comment') {
      const raw = `Commented on [${ticket}]`;
      items.push({
        text: `[**${ticket}**] Provided technical guidance and documentation updates — *${summary}*`,
        raw,
        source: 'jira',
      });
    }

    if (e.event_type === 'created') {
      const raw = `Created ticket [${ticket}]`;
      items.push({
        text: `[**${ticket}**] Scoped and initiated new work item: *${summary}*`,
        raw,
        source: 'jira',
      });
    }
  }

  if (cyclesCompleted.length > 1) {
    items.push({
      text: `Navigated complete development-to-review cycle on ${pluralize(cyclesCompleted.length, 'ticket', 'tickets')}: ${cyclesCompleted.join(', ')}`,
      raw: '(implied)',
      source: 'jira',
    });
  }

  return items;
}
