import axios, { AxiosInstance, AxiosError } from 'axios';
import { Config, allTrackedStatuses } from './config';
import { insertJiraEvent, upsertJiraTicket, removeStaleTickets, getMeta, setMeta, JiraEvent } from './db';

function makeClient(config: Config): AxiosInstance {
  const token = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64');
  return axios.create({
    baseURL: `https://${config.jira.domain}/rest/api/3`,
    headers: {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, unknown>;
  changelog?: {
    histories: ChangelogHistory[];
  };
}

interface ChangelogHistory {
  id: string;
  author: { emailAddress?: string };
  created: string;
  items: ChangelogItem[];
}

interface ChangelogItem {
  field: string;
  fromString: string | null;
  toString: string | null;
}

interface JiraComment {
  id: string;
  author: { emailAddress?: string };
  created: string;
  body: unknown;
}

function projectClause(config: Config): string {
  const include = config.jira.projects ?? [];
  const exclude = config.jira.ignoreProjects ?? [];
  const parts: string[] = [];
  if (include.length > 0) parts.push(`project IN (${include.map(p => `"${p}"`).join(', ')})`);
  if (exclude.length > 0) parts.push(`project NOT IN (${exclude.map(p => `"${p}"`).join(', ')})`);
  return parts.length > 0 ? ' AND ' + parts.join(' AND ') : '';
}

export async function pollJira(config: Config): Promise<void> {
  const client = makeClient(config);
  const myEmail = config.jira.email.toLowerCase();
  const sprintField = config.jira.customFields.sprint;
  const spField = config.jira.customFields.storyPoints;
  const projFilter = projectClause(config);

  const lastPolled = getMeta('jira_last_polled');
  const since = lastPolled
    ? new Date(lastPolled)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Fetch all tickets assigned to me (active statuses + recently updated)
    const jql = `assignee = currentUser() AND NOT statusCategory = Done${projFilter} ORDER BY updated DESC`;
    const issues = await searchIssues(client, jql, spField, sprintField);

    const activeKeys: string[] = [];

    for (const issue of issues) {
      const fields = issue.fields;
      const sprint = extractSprint(fields[sprintField]);
      const storyPoints = extractNumber(fields[spField]) ?? extractNumber(fields['story_points']);

      activeKeys.push(issue.key);

      upsertJiraTicket({
        key: issue.key,
        summary: String(fields['summary'] ?? ''),
        status: extractStatus(fields['status']),
        issue_type: extractString(fields['issuetype'], 'name'),
        story_points: storyPoints,
        sprint,
        priority: extractString(fields['priority'], 'name'),
        url: `https://${config.jira.domain}/browse/${issue.key}`,
        updated_at: String(fields['updated'] ?? new Date().toISOString()),
      });

      // Process changelog for status changes
      if (issue.changelog?.histories) {
        for (const history of issue.changelog.histories) {
          const historyDate = new Date(history.created);
          if (historyDate <= since) continue;

          const authorEmail = (history.author?.emailAddress ?? '').toLowerCase();
          const isMe = authorEmail === myEmail;
          const isAutomation = !authorEmail || authorEmail.includes('automation') || authorEmail.includes('jira');

          for (const item of history.items) {
            if (item.field === 'status') {
              // Include: status changes by me, or automated changes on my tickets
              if (isMe || isAutomation) {
                insertJiraEvent({
                  id: `status-${issue.key}-${history.id}-${item.field}`,
                  ticket_key: issue.key,
                  ticket_summary: String(fields['summary'] ?? ''),
                  event_type: 'status_change',
                  old_value: item.fromString,
                  new_value: item.toString,
                  author_email: isAutomation && !isMe ? '__automation__' : authorEmail,
                  created_at: history.created,
                });
              }
            }
          }
        }
      }
    }

    // Fetch recently updated tickets (may include newly commented ones)
    const sinceStr = since.toISOString().split('T')[0];
    const commentJql = `assignee = currentUser() AND updated >= "${sinceStr}"${projFilter} ORDER BY updated DESC`;
    const recentIssues = await searchIssues(client, commentJql, spField, sprintField, false);

    for (const issue of recentIssues) {
      try {
        const { data } = await client.get(`/issue/${issue.key}/comment`, {
          params: { maxResults: 50, orderBy: '-created' },
        });
        const comments: JiraComment[] = data.comments ?? [];

        for (const comment of comments) {
          const commentDate = new Date(comment.created);
          if (commentDate <= since) break;

          const authorEmail = (comment.author?.emailAddress ?? '').toLowerCase();
          if (authorEmail === myEmail) {
            insertJiraEvent({
              id: `comment-${issue.key}-${comment.id}`,
              ticket_key: issue.key,
              ticket_summary: String(issue.fields['summary'] ?? ''),
              event_type: 'comment',
              old_value: null,
              new_value: null,
              author_email: authorEmail,
              created_at: comment.created,
            });
          }
        }
      } catch {
        // Comment fetch failed for this issue — skip
      }
    }

    // Also check for recently created tickets by me
    const createdJql = `reporter = currentUser() AND created >= "${sinceStr}"${projFilter} ORDER BY created DESC`;
    try {
      const createdIssues = await searchIssues(client, createdJql, spField, sprintField, false);
      for (const issue of createdIssues) {
        const createdAt = String(issue.fields['created'] ?? new Date().toISOString());
        if (new Date(createdAt) > since) {
          insertJiraEvent({
            id: `created-${issue.key}`,
            ticket_key: issue.key,
            ticket_summary: String(issue.fields['summary'] ?? ''),
            event_type: 'created',
            old_value: null,
            new_value: String(issue.fields['summary'] ?? ''),
            author_email: myEmail,
            created_at: createdAt,
          });
        }
      }
    } catch {
      // Created search failed — non-critical
    }

    removeStaleTickets(activeKeys);
    setMeta('jira_last_polled', new Date().toISOString());
    log(`Jira poll complete — ${issues.length} active tickets`);
  } catch (err) {
    if (err instanceof AxiosError && err.response) {
      log(`Jira poll error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    } else {
      log(`Jira poll error: ${err}`);
    }
  }
}

async function searchIssues(
  client: AxiosInstance,
  jql: string,
  spField: string,
  sprintField: string,
  withChangelog = true,
): Promise<JiraIssue[]> {
  const expand = withChangelog ? 'changelog' : '';
  const fields = [
    'summary', 'status', 'issuetype', 'priority',
    'updated', 'created', spField, sprintField,
  ].join(',');

  const results: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const params: Record<string, string | number> = {
      jql,
      startAt,
      maxResults,
      fields,
    };
    if (expand) params['expand'] = expand;

    const { data } = await client.get('/search/jql', { params });

    const issues: JiraIssue[] = data.issues ?? [];
    results.push(...issues);

    if (data.isLast === true || issues.length === 0) break;
    startAt += maxResults;

    if (results.length >= 500) break;
  }

  return results;
}

function extractStatus(statusField: unknown): string {
  if (statusField && typeof statusField === 'object') {
    return String((statusField as Record<string, unknown>)['name'] ?? 'Unknown');
  }
  return 'Unknown';
}

function extractString(field: unknown, key: string): string | null {
  if (field && typeof field === 'object') {
    const val = (field as Record<string, unknown>)[key];
    return val != null ? String(val) : null;
  }
  return null;
}

function extractNumber(field: unknown): number | null {
  if (field == null) return null;
  const n = Number(field);
  return isNaN(n) ? null : n;
}

function extractSprint(field: unknown): string | null {
  // Sprint field is an array of sprint objects
  if (!Array.isArray(field) || field.length === 0) return null;

  // Find the active sprint first, then most recent
  const sprints = field as Array<Record<string, unknown>>;
  const active = sprints.find(s => s['state'] === 'active');
  const target = active ?? sprints[sprints.length - 1];

  return target ? String(target['name'] ?? '') : null;
}

export async function fetchAllUsersJiraEvents(config: Config, since: Date): Promise<JiraEvent[]> {
  const client = makeClient(config);
  const sprintField = config.jira.customFields.sprint;
  const spField = config.jira.customFields.storyPoints;
  const projFilter = projectClause(config);
  const sinceStr = since.toISOString().split('T')[0];

  const jql = `updated >= "${sinceStr}"${projFilter} ORDER BY updated DESC`;
  const issues = await searchIssues(client, jql, spField, sprintField, true);
  const limited = issues.slice(0, 100);

  const events: JiraEvent[] = [];
  for (const issue of limited) {
    if (!issue.changelog?.histories) continue;
    for (const history of issue.changelog.histories) {
      const historyDate = new Date(history.created);
      if (historyDate <= since) continue;
      for (const item of history.items) {
        if (item.field === 'status') {
          events.push({
            id: `allusers-status-${issue.key}-${history.id}`,
            ticket_key: issue.key,
            ticket_summary: String(issue.fields['summary'] ?? ''),
            event_type: 'status_change',
            old_value: item.fromString,
            new_value: item.toString,
            author_email: history.author?.emailAddress ?? null,
            created_at: history.created,
          });
        }
      }
    }
  }

  return events.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function log(msg: string): void {
  console.log(`[jira] ${msg}`);
}
