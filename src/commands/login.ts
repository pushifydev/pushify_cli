import chalk from 'chalk';
import ora from 'ora';
import { config } from '../config.js';
import { api } from '../api.js';

interface LoginOptions {
  key?: string;
  url?: string;
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const apiKey = options.key || process.env.PUSHIFY_API_KEY;
  const apiUrl = options.url || 'http://localhost:4000/api/v1';

  if (!apiKey) {
    console.log(chalk.red('Error: API key is required'));
    console.log('');
    console.log('Usage:');
    console.log(`  ${chalk.cyan('pushify login --key pk_live_xxx')}`);
    console.log('');
    console.log('Or set the PUSHIFY_API_KEY environment variable:');
    console.log(`  ${chalk.cyan('export PUSHIFY_API_KEY=pk_live_xxx')}`);
    console.log('');
    console.log('Get your API key from:');
    console.log(`  ${chalk.cyan('https://pushify.dev/dashboard/settings')}`);
    process.exit(1);
  }

  // Validate API key format
  if (!apiKey.startsWith('pk_live_')) {
    console.log(chalk.red('Error: Invalid API key format'));
    console.log('API keys should start with "pk_live_"');
    process.exit(1);
  }

  // Save config temporarily
  config.set('apiKey', apiKey);
  config.set('apiUrl', apiUrl);

  const spinner = ora('Validating API key...').start();

  try {
    const valid = await api.validateApiKey();

    if (!valid) {
      spinner.fail('Invalid API key');
      config.delete('apiKey');
      process.exit(1);
    }

    spinner.succeed('Successfully authenticated!');
    console.log('');
    console.log(`  ${chalk.gray('API URL:')} ${apiUrl}`);
    console.log(`  ${chalk.gray('API Key:')} ${apiKey.substring(0, 15)}...`);
    console.log('');
    console.log(chalk.green('You can now use Pushify CLI commands.'));
  } catch (error) {
    spinner.fail('Authentication failed');
    config.delete('apiKey');

    if (error instanceof Error) {
      console.log(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}
