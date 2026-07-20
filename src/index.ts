#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import chalk from 'chalk';
import { config, getApiKey, getApiUrl } from './config.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { projectsCommand } from './commands/projects.js';
import { deployCommand } from './commands/deploy.js';
import { logsCommand } from './commands/logs.js';
import { statusCommand } from './commands/status.js';
import { envPullCommand, envPushCommand, openCommand } from './commands/env.js';
import { linkCommand, unlinkCommand } from './commands/link.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const program = new Command();

const logo = `
${chalk.cyan('╔═══════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('⚡ Pushify CLI')}                        ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Deploy at the speed of thought')}        ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════╝')}
`;

/**
 * Wrap command actions so failures print one clean line and a proper exit code —
 * never a raw stack trace at the user.
 */
function run<A extends unknown[]>(fn: (...args: A) => void | Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`Error: ${message}`));
      if (message.toLowerCase().includes('rate limit')) {
        console.log(chalk.gray('Wait a minute and try again, or upgrade the plan for a higher API limit.'));
      }
      process.exit(1);
    }
  };
}

program
  .name('pushify')
  .description('CLI for the Pushify deployment platform')
  .version(version)
  .addHelpText('before', logo)
  .addHelpText(
    'after',
    `
Examples:
  $ pushify login --key pk_live_xxx
  $ pushify link my-app            ${chalk.gray('# link this directory once')}
  $ pushify deploy --wait          ${chalk.gray('# then commands need no project arg')}
  $ pushify logs -f                ${chalk.gray('# follow the latest deployment')}
  $ pushify env pull               ${chalk.gray('# download env vars to .env')}
  $ pushify open

Docs: https://pushify.dev/docs`
  );

program
  .command('login')
  .description('Authenticate with your API key')
  .option('-k, --key <key>', 'API key (or set PUSHIFY_API_KEY env var)')
  .option('-u, --url <url>', 'API URL (default: https://api.pushify.dev/api/v1)')
  .action(run(loginCommand));

program.command('logout').description('Remove stored credentials').action(run(logoutCommand));

program
  .command('link <project>')
  .description('Link this directory to a project (writes a .pushify file)')
  .action(run(linkCommand));

program
  .command('unlink')
  .description('Remove the link between this directory and its project')
  .action(run(unlinkCommand));

program
  .command('projects')
  .alias('ps')
  .description('List all projects')
  .option('-j, --json', 'Output as JSON')
  .action(run(projectsCommand));

program
  .command('deploy [project]')
  .alias('d')
  .description('Trigger a deployment (uses the linked project when omitted)')
  .option('-b, --branch <branch>', 'Branch to deploy')
  .option('-w, --wait', 'Wait for deployment to complete')
  .action(run(deployCommand));

program
  .command('logs [target]')
  .alias('l')
  .description('Show logs for a deployment ID, or the latest deployment of a project')
  .option('-f, --follow', 'Follow logs in real-time')
  .action(run(logsCommand));

program
  .command('status [project]')
  .alias('s')
  .description('Show project status and latest deployment')
  .action(run(statusCommand));

const env = program.command('env').description('Sync environment variables with a local .env file');
env
  .command('pull [project]')
  .description('Download project env vars into a local .env file')
  .option('-f, --file <file>', 'Target file (default: .env)')
  .option('--force', 'Overwrite the file if it exists')
  .action(run(envPullCommand));
env
  .command('push [project]')
  .description('Upsert variables from a local .env file to the project')
  .option('-f, --file <file>', 'Source file (default: .env)')
  .option('-y, --yes', 'Apply without confirmation')
  .action(run(envPushCommand));

program
  .command('open [project]')
  .alias('o')
  .description("Open the project's primary domain in your browser")
  .action(run(openCommand));

program
  .command('whoami')
  .description('Show current authentication state')
  .action(() => {
    const apiKey = getApiKey();
    if (!apiKey) {
      console.log(chalk.yellow('Not logged in. Run `pushify login` to authenticate.'));
      return;
    }
    const source = process.env.PUSHIFY_API_KEY ? 'PUSHIFY_API_KEY env var' : 'stored credentials';
    console.log(chalk.green('✓ Authenticated'));
    console.log(`  ${chalk.gray('API Key:')} ${apiKey.substring(0, 15)}... ${chalk.gray(`(${source})`)}`);
    console.log(`  ${chalk.gray('API URL:')} ${getApiUrl()}`);
    const defaultProject = config.get('defaultProject');
    if (defaultProject) console.log(`  ${chalk.gray('Default project:')} ${defaultProject}`);
  });

program.parse();
