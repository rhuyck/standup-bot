import { Octokit } from '@octokit/rest';
import { Config } from './config';
import { insertGithubEvent, getMeta, setMeta, getRecentRepos } from './db';

export async function pollGithub(config: Config): Promise<void> {
  const octokit = new Octokit({ auth: config.github.token });
  const username = config.github.username;
  const lastPolled = getMeta('github_last_polled');
  const since = lastPolled
    ? new Date(lastPolled)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days on first run

  try {
    let page = 1;
    let done = false;

    while (!done && page <= 3) {
      const { data: events } = await octokit.activity.listEventsForAuthenticatedUser({
        username,
        per_page: 100,
        page,
      });

      if (events.length === 0) break;

      for (const event of events) {
        const createdAt = event.created_at ?? new Date().toISOString();
        if (new Date(createdAt) <= since) {
          done = true;
          break;
        }

        const repoName = event.repo?.name ?? 'unknown/unknown';

        if (event.type === 'PushEvent') {
          const payload = event.payload as {
            ref?: string;
            size?: number;
            head?: string;
          };
          const branch = payload.ref?.replace('refs/heads/', '') ?? null;
          insertGithubEvent({
            id: `push-${event.id}`,
            type: 'push',
            repo: repoName,
            branch,
            pr_number: null,
            pr_title: null,
            commit_count: payload.size ?? 1,
            sha: payload.head ?? null,
            created_at: createdAt,
          });
        }

        if (event.type === 'CreateEvent') {
          const payload = event.payload as {
            ref_type?: string;
            ref?: string;
          };
          if (payload.ref_type === 'branch') {
            insertGithubEvent({
              id: `create-${event.id}`,
              type: 'branch_created',
              repo: repoName,
              branch: payload.ref ?? null,
              pr_number: null,
              pr_title: null,
              commit_count: null,
              sha: null,
              created_at: createdAt,
            });
          }
        }

        if (event.type === 'PullRequestEvent') {
          const payload = event.payload as {
            action?: string;
            number?: number;
            pull_request?: {
              title?: string;
              merged?: boolean;
              head?: { sha?: string };
            };
          };

          if (payload.action === 'opened') {
            insertGithubEvent({
              id: `pr-opened-${event.id}`,
              type: 'pr_opened',
              repo: repoName,
              branch: null,
              pr_number: payload.number ?? null,
              pr_title: payload.pull_request?.title ?? null,
              commit_count: null,
              sha: payload.pull_request?.head?.sha ?? null,
              created_at: createdAt,
            });
          }

          if (payload.action === 'closed' && payload.pull_request?.merged) {
            insertGithubEvent({
              id: `pr-merged-${event.id}`,
              type: 'pr_merged',
              repo: repoName,
              branch: null,
              pr_number: payload.number ?? null,
              pr_title: payload.pull_request?.title ?? null,
              commit_count: null,
              sha: payload.pull_request?.head?.sha ?? null,
              created_at: createdAt,
            });
          }
        }
      }

      page++;
    }

    setMeta('github_last_polled', new Date().toISOString());
    log(`GitHub poll complete`);
  } catch (err) {
    log(`GitHub poll error: ${err}`);
  }
}

export async function getOpenPRs(config: Config): Promise<OpenPR[]> {
  const octokit = new Octokit({ auth: config.github.token });
  const username = config.github.username;
  const results: OpenPR[] = [];
  const seen = new Set<number>(); // dedupe by PR number across repos

  // Use repos from recent event history — avoids needing search scope
  const repos = getRecentRepos(30);

  for (const fullRepo of repos) {
    const [owner, repo] = fullRepo.split('/');
    if (!owner || !repo) continue;

    try {
      const { data: prs } = await octokit.pulls.list({
        owner,
        repo,
        state: 'open',
        per_page: 50,
      });

      for (const pr of prs) {
        if (pr.user?.login !== username) continue;
        if (seen.has(pr.number)) continue;
        seen.add(pr.number);

        const headSha = pr.head.sha;
        const headBranch = pr.head.ref;

        // Check CI status using head SHA
        let ciStatus: string | null = null;
        try {
          const { data: checks } = await octokit.checks.listForRef({
            owner,
            repo,
            ref: headSha,
          });
          const runs = checks.check_runs ?? [];
          if (runs.some(r => r.conclusion === 'failure')) ciStatus = 'failing';
          else if (runs.length > 0 && runs.every(r => r.conclusion === 'success')) ciStatus = 'passing';
          else if (runs.some(r => r.status === 'in_progress')) ciStatus = 'pending';
        } catch {
          // CI info unavailable
        }

        // Extract Jira key from title, body, then branch name — in that order
        const jiraKey = extractJiraKey(pr.title, pr.body ?? '', headBranch);

        results.push({
          number: pr.number,
          title: pr.title,
          repo: fullRepo,
          url: pr.html_url,
          createdAt: pr.created_at,
          ciStatus,
          jiraKey,
          headBranch,
        });
      }
    } catch {
      // Repo may be inaccessible — skip
    }
  }

  return results;
}

export interface OpenPR {
  number: number;
  title: string;
  repo: string;
  url: string;
  createdAt: string;
  ciStatus: string | null;
  jiraKey: string | null;
  headBranch: string | null;
}

export function extractJiraKey(...texts: string[]): string | null {
  for (const text of texts) {
    const match = text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
    if (match) return match[1];
  }
  return null;
}

function log(msg: string): void {
  console.log(`[github] ${msg}`);
}
