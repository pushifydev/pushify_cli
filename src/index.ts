#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from './config.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { projectsCommand } from './commands/projects.js';
import { deployCommand } from './commands/deploy.js';
import { logsCommand } from './commands/logs.js';
import { statusCommand } from './commands/status.js';
import { envPullCommand, envPushCommand, openCommand } from './commands/env.js';

const program = new Command();

// ASCII Art Logo
const logo = `
${chalk.cyan('╔═══════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('⚡ Pushify CLI')}                        ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Deploy at the speed of thought')}        ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════╝')}
`;

program
  .name('pushify')
  .description('CLI tool for Pushify deployment platform')
  .version('1.0.0')
  .addHelpText('before', logo);

// Login command
program
  .command('login')
  .description('Authenticate with your API key')
  .option('-k, --key <key>', 'API key (or set PUSHIFY_API_KEY env var)')
  .option('-u, --url <url>', 'API URL (default: https://api.pushify.dev)')
  .action(loginCommand);

// Logout command
program
  .command('logout')
  .description('Remove stored credentials')
  .action(logoutCommand);

// Projects command
program
  .command('projects')
  .alias('ps')
  .description('List all projects')
  .option('-j, --json', 'Output as JSON')
  .action(projectsCommand);

// Deploy command
program
  .command('deploy [project]')
  .alias('d')
  .description('Trigger a deployment')
  .option('-b, --branch <branch>', 'Branch to deploy')
  .option('-w, --wait', 'Wait for deployment to complete')
  .action(deployCommand);

// Logs command
program
  .command('logs <deployment-id>')
  .alias('l')
  .description('View deployment logs')
  .option('-f, --follow', 'Follow logs in real-time')
  .action(logsCommand);

// Env commands — .env sync with the dashboard
const env = program.command('env').description('Sync environment variables with a local .env file');
env
  .command('pull [project]')
  .description('Download project env vars into a local .env file')
  .option('-f, --file <file>', 'Target file (default: .env)')
  .option('--force', 'Overwrite the file if it exists')
  .action(envPullCommand);
env
  .command('push [project]')
  .description('Upsert variables from a local .env file to the project')
  .option('-f, --file <file>', 'Source file (default: .env)')
  .option('-y, --yes', 'Apply without confirmation')
  .action(envPushCommand);

// Open command
program
  .command('open [project]')
  .alias('o')
  .description("Open the project's primary domain in your browser")
  .action(openCommand);

// Status command
program
  .command('status [project]')
  .alias('s')
  .description('Show project status and latest deployment')
  .action(statusCommand);

// Whoami command
program
  .command('whoami')
  .description('Show current authenticated user')
  .action(() => {
    const apiKey = config.get('apiKey');
    const apiUrl = config.get('apiUrl');

    if (!apiKey) {
      console.log(chalk.yellow('Not logged in. Run `pushify login` to authenticate.'));
      return;
    }

    console.log(chalk.green('✓ Authenticated'));
    console.log(`  ${chalk.gray('API Key:')} ${apiKey.substring(0, 15)}...`);
    console.log(`  ${chalk.gray('API URL:')} ${apiUrl}`);
  });

// Parse arguments
program.parse();
