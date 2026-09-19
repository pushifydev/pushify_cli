import chalk from 'chalk';
import ora from 'ora';
import { config, DEFAULT_API_URL, getDashboardUrl } from '../config.js';
import { api } from '../api.js';

interface LoginOptions {
  key?: string;
  url?: string;
}

async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('child_process');
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

async function browserLogin(apiUrl: string): Promise<void> {
  const spinner = ora('Creating auth session...').start();

  try {
    // 1. Create session — get code
    const response = await fetch(`${apiUrl}/auth/cli/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      spinner.fail('Failed to create auth session');
      process.exit(1);
    }

    const { code } = await response.json();

    // 2. Build browser URL
    const authUrl = `${getDashboardUrl(apiUrl)}/cli/auth?code=${code}`;

    spinner.stop();

    console.log('');
    console.log(chalk.cyan('  Opening browser for authentication...'));
    console.log('');
    console.log(`  ${chalk.gray('If the browser doesn\'t open, visit:')}`);
    console.log(`  ${chalk.underline(authUrl)}`);
    console.log('');
    console.log(`  ${chalk.gray('Verification code:')} ${chalk.bold.cyan(code)}`);
    console.log('');

    await openBrowser(authUrl);

    // 3. Poll for approval
    const pollSpinner = ora('Waiting for approval in browser...').start();
    const maxAttempts = 120; // 10 minutes (5s intervals)

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      try {
        const pollResponse = await fetch(`${apiUrl}/auth/cli/poll/${code}`);
        const data = await pollResponse.json();

        if (data.status === 'approved' && data.apiKey) {
          config.set('apiKey', data.apiKey);
          config.set('apiUrl', apiUrl);

          pollSpinner.succeed('Successfully authenticated!');
          console.log('');
          console.log(`  ${chalk.gray('API Key:')} ${data.apiKey.substring(0, 15)}...`);
          console.log(`  ${chalk.gray('API URL:')} ${apiUrl}`);
          console.log('');
          console.log(chalk.green('You can now use Pushify CLI commands.'));
          return;
        }

        if (data.status === 'expired') {
          pollSpinner.fail('Auth session expired. Please try again.');
          process.exit(1);
        }
      } catch {
        // Network error, keep polling
      }
    }

    pollSpinner.fail('Timed out waiting for approval.');
    process.exit(1);
  } catch (error) {
    spinner.fail('Authentication failed');
    if (error instanceof Error) {
      console.log(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const apiUrl = options.url || process.env.PUSHIFY_API_URL || config.get('apiUrl');

  // A previously saved custom URL (self-hosted or dev) silently redirecting the
  // login is surprising — surface it and say how to get back to the default.
  if (!options.url && !process.env.PUSHIFY_API_URL && apiUrl !== DEFAULT_API_URL) {
    console.log(chalk.yellow(`Using stored API URL: ${apiUrl}`));
    console.log(chalk.gray(`Pass --url ${DEFAULT_API_URL} to switch back to the default.`));
    console.log('');
  }

  // If --key flag provided, use direct API key login
  const apiKey = options.key || process.env.PUSHIFY_API_KEY;

  if (apiKey) {
    // Validate API key format
    if (!apiKey.startsWith('pk_live_')) {
      console.log(chalk.red('Error: Invalid API key format'));
      console.log('API keys should start with "pk_live_"');
      process.exit(1);
    }

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

    return;
  }

  // No --key flag — use browser-based login
  await browserLogin(apiUrl);
}
