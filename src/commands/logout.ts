import chalk from 'chalk';
import { config } from '../config.js';

export async function logoutCommand(): Promise<void> {
  const apiKey = config.get('apiKey');

  if (!apiKey) {
    console.log(chalk.yellow('You are not logged in.'));
    return;
  }

  config.delete('apiKey');
  config.delete('defaultProject');
  // Reset any custom API URL too, so the next login targets the default
  // endpoint again instead of a stale self-hosted/dev address.
  config.delete('apiUrl');

  console.log(chalk.green('✓ Successfully logged out'));
  console.log(chalk.gray('Your API key has been removed from local storage.'));
}
