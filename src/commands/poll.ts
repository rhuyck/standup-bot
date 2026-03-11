import { loadConfig } from '../config';
import { pollGithub } from '../github';
import { pollJira } from '../jira';

export async function runPoll(flags: Set<string>): Promise<void> {
  const config = loadConfig();
  const onlyJira = flags.has('--jira');
  const onlyGit = flags.has('--git');

  const tasks: Promise<void>[] = [];

  if (!onlyJira) tasks.push(pollGithub(config));
  if (!onlyGit) tasks.push(pollJira(config));

  await Promise.allSettled(tasks);
  console.log('Poll complete.');
}
