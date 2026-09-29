import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import { api } from '../api.js';
import { requireAuth, resolveProject } from '../resolve.js';

/** The server's rule for variable names (envvar.service): uppercase letters, digits and _, starting with a letter. */
export const ENV_KEY_RULE = /^[A-Z][A-Z0-9_]*$/;

/** What `env pull` writes for a secret: the first and last two characters around ****, or **** alone. */
export const MASKED_VALUE = /^(?:[\s\S]{2}\*{4}[\s\S]{2}|\*{4})$/;

/**
 * Split parsed variables into what can be sent, names the server would refuse, and values that
 * are masked secrets from `env pull` — sending those would overwrite the real secret with the mask.
 */
export function checkPushable(vars: Array<{ key: string; value: string }>): {
  send: Array<{ key: string; value: string }>;
  invalidKeys: string[];
  masked: string[];
} {
  const invalidKeys = vars.filter((v) => !ENV_KEY_RULE.test(v.key)).map((v) => v.key);
  const masked = vars.filter((v) => ENV_KEY_RULE.test(v.key) && MASKED_VALUE.test(v.value)).map((v) => v.key);
  const send = vars.filter((v) => ENV_KEY_RULE.test(v.key) && !MASKED_VALUE.test(v.value));
  return { send, invalidKeys, masked };
}

/** Parse a .env file into key/value pairs. Ignores comments and blank lines. */
export function parseDotenv(content: string): Array<{ key: string; value: string }> {
  const vars: Array<{ key: string; value: string }> = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    // Strip a single layer of matching quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.length > 0) vars.push({ key, value });
  }
  return vars;
}

function serializeDotenv(vars: Array<{ key: string; value: string }>): string {
  return (
    vars
      .map(({ key, value }) => {
        const needsQuotes = /[\s#"']/g.test(value);
        return `${key}=${needsQuotes ? JSON.stringify(value) : value}`;
      })
      .join('\n') + '\n'
  );
}

export async function envPullCommand(
  projectArg: string | undefined,
  options: { file?: string; force?: boolean }
): Promise<void> {
  requireAuth();
  const file = options.file || '.env';
  if (existsSync(file) && !options.force) {
    console.log(chalk.red(`${file} already exists. Use --force to overwrite.`));
    process.exit(1);
  }

  const { id, name } = await resolveProject(projectArg);
  const spinner = ora(`Pulling env vars from ${name}...`).start();
  try {
    const vars = await api.getEnvVars(id);
    writeFileSync(file, serializeDotenv(vars), { mode: 0o600 });
    spinner.succeed(`Wrote ${vars.length} variable(s) to ${chalk.cyan(file)} (chmod 600)`);
    console.log(chalk.gray('Tip: make sure this file is in .gitignore.'));
  } catch (error) {
    spinner.fail('Failed to pull env vars');
    if (error instanceof Error) console.log(chalk.red(error.message));
    process.exit(1);
  }
}

export async function envPushCommand(
  projectArg: string | undefined,
  options: { file?: string; yes?: boolean }
): Promise<void> {
  requireAuth();
  const file = options.file || '.env';
  if (!existsSync(file)) {
    console.log(chalk.red(`${file} not found.`));
    process.exit(1);
  }
  const parsed = parseDotenv(readFileSync(file, 'utf-8'));
  if (parsed.length === 0) {
    console.log(chalk.yellow(`${file} contains no variables.`));
    process.exit(1);
  }

  const { send: vars, invalidKeys, masked } = checkPushable(parsed);
  if (invalidKeys.length > 0) {
    console.log(chalk.red('These names are not allowed:'));
    for (const key of invalidKeys) console.log(chalk.red(`  ${key}`) + chalk.gray(`  → ${key.toUpperCase()}?`));
    console.log('Variable names must start with an uppercase letter and use only A–Z, 0–9 and _ (the same rule as the dashboard).');
    console.log(`Rename them in ${file} and run the command again. Nothing was sent.`);
    process.exit(1);
  }
  if (masked.length > 0) {
    console.log(chalk.yellow(`Skipping ${masked.length} masked secret(s) — their values are the ****-masked copies from \`env pull\`, and sending them would replace the real secret:`));
    for (const key of masked) console.log(chalk.gray(`  ${key}`));
  }
  if (vars.length === 0) {
    console.log(chalk.yellow('Nothing to push.'));
    process.exit(0);
  }

  const { id, name } = await resolveProject(projectArg);
  console.log(
    `About to upsert ${chalk.bold(String(vars.length))} variable(s) from ${chalk.cyan(file)} to ${chalk.bold(name)}:`
  );
  for (const v of vars) console.log(chalk.gray(`  ${v.key}`));
  if (!options.yes) {
    console.log('');
    console.log(chalk.yellow('Re-run with --yes to confirm. Existing keys are overwritten; keys not in the file are kept.'));
    process.exit(0);
  }

  const spinner = ora('Pushing env vars...').start();
  try {
    const count = await api.bulkSetEnvVars(id, vars);
    spinner.succeed(`Upserted ${count} variable(s) on ${name}. Redeploy to apply.`);
  } catch (error) {
    spinner.fail('Failed to push env vars');
    if (error instanceof Error) console.log(chalk.red(error.message));
    process.exit(1);
  }
}

export async function openCommand(projectArg: string | undefined): Promise<void> {
  requireAuth();
  const project = await resolveProject(projectArg);
  const primary = project.domains?.find((d) => d.isPrimary) ?? project.domains?.[0];
  if (!primary) {
    console.log(chalk.yellow(`${project.name} has no domain yet.`));
    process.exit(1);
  }
  const url = `https://${primary.domain}`;
  const { exec } = await import('node:child_process');
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${opener} ${JSON.stringify(url)}`);
  console.log(`${chalk.green('→')} ${url}`);
}
