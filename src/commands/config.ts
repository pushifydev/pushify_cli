import chalk from 'chalk';
import { config, getApiKey, getApiUrl } from '../config.js';
import { requireAuth } from '../resolve.js';
import { findProject } from './link.js';

const KEYS = ['default-project'] as const;
type ConfigKey = (typeof KEYS)[number];

function assertKey(key: string): asserts key is ConfigKey {
  if (!(KEYS as readonly string[]).includes(key)) {
    console.log(chalk.red(`Unknown config key: ${key}`));
    console.log(`Supported keys: ${KEYS.map((k) => chalk.cyan(k)).join(', ')}`);
    process.exit(1);
  }
}

/** Show a token without leaking it: prefix and last 4 characters only. */
function maskToken(token: string): string {
  if (token.length <= 12) return '••••';
  return `${token.slice(0, 8)}••••••••${token.slice(-4)}`;
}

/** `pushify config set default-project <project>` — used when nothing else names a project. */
export async function configSetCommand(key: string, value: string): Promise<void> {
  assertKey(key);
  requireAuth();

  const project = await findProject(value);
  if (!project) {
    console.log(chalk.red(`Project not found: ${value}`));
    process.exit(1);
  }

  config.set('defaultProject', project.id);
  console.log(`${chalk.green('✓')} Default project set to ${chalk.bold(project.name)} (${project.slug})`);
  console.log(chalk.gray('Used when a command has no project argument and the directory is not linked.'));
}

export function configGetCommand(key: string): void {
  assertKey(key);
  const value = config.get('defaultProject');
  if (!value) {
    console.log(chalk.yellow('default-project is not set.'));
    console.log(chalk.gray(`Set it with ${chalk.cyan('pushify config set default-project <project>')}`));
    process.exit(1);
  }
  console.log(value);
}

export function configUnsetCommand(key: string): void {
  assertKey(key);
  if (!config.get('defaultProject')) {
    console.log(chalk.yellow('default-project is not set.'));
    return;
  }
  config.delete('defaultProject');
  console.log(`${chalk.green('✓')} Removed default project.`);
}

export function configListCommand(): void {
  const apiKey = getApiKey();
  const keySource = process.env.PUSHIFY_API_KEY ? chalk.gray(' (PUSHIFY_API_KEY env var)') : '';
  const urlSource = process.env.PUSHIFY_API_URL ? chalk.gray(' (PUSHIFY_API_URL env var)') : '';
  const defaultProject = config.get('defaultProject');

  console.log('');
  console.log(`  ${chalk.gray('apiUrl:')}          ${getApiUrl()}${urlSource}`);
  console.log(`  ${chalk.gray('defaultProject:')}  ${defaultProject ?? chalk.gray('(not set)')}`);
  console.log(`  ${chalk.gray('apiKey:')}          ${apiKey ? maskToken(apiKey) + keySource : chalk.gray('(not logged in)')}`);
  console.log('');
  console.log(chalk.gray(`Config file: ${config.path}`));
}
