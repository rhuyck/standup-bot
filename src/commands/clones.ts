import axios, { AxiosError } from 'axios';
import chalk from 'chalk';
import Table from 'cli-table3';
import { loadConfig } from '../config';
import { hyperlink } from '../utils/format';

export async function runClones(proj?: string): Promise<void> {
  const config = loadConfig();
  const token = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64');
  const client = axios.create({
    baseURL: `https://${config.jira.domain}/rest/api/3`,
    headers: {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
    },
  });

  const projClause = proj ? ` AND project = "${proj.toUpperCase()}"` : '';
  const jql = `summary ~ "CLONE -"${projClause} ORDER BY created DESC`;

  try {
    const { data } = await client.get('/search/jql', {
      params: {
        jql,
        maxResults: 100,
        fields: 'summary,status,created',
      },
    });

    const issues: Array<{ key: string; fields: Record<string, any> }> = data.issues ?? [];

    if (issues.length === 0) {
      console.log(chalk.gray('\n  No CLONE tickets found.\n'));
      return;
    }

    const scopeNote = proj ? chalk.dim(` — project: ${proj.toUpperCase()}`) : '';
    console.log(chalk.bold.cyan(`\n=== CLONE TICKETS (${issues.length})${scopeNote} ===\n`));

    const table = new Table({
      head: [chalk.cyan('Key'), chalk.cyan('Status'), chalk.cyan('Created'), chalk.cyan('Summary')],
      colWidths: [14, 22, 12, 62],
      wordWrap: true,
      style: { border: ['gray'], head: [] },
    });

    for (const issue of issues) {
      const url = `https://${config.jira.domain}/browse/${issue.key}`;
      const keyLink = hyperlink(chalk.bold(issue.key), url);
      const status = issue.fields.status?.name ?? 'Unknown';
      const created = (issue.fields.created as string)?.split('T')[0] ?? '?';
      const summary = (issue.fields.summary as string) ?? '';
      table.push([keyLink, status, created, summary]);
    }

    console.log(table.toString());
    console.log('');
  } catch (err) {
    if (err instanceof AxiosError && err.response) {
      console.error(chalk.red(`Jira error ${err.response.status}: ${JSON.stringify(err.response.data)}`));
    } else {
      console.error(chalk.red(`Failed to fetch clone tickets: ${err}`));
    }
  }
}
