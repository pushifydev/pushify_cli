import chalk from 'chalk';
import ora from 'ora';
import { api } from '../api.js';
import { isAuthenticated } from '../config.js';

interface LogsOptions {
  follow?: boolean;
}

export async function logsCommand(deploymentId: string, options: LogsOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('Not authenticated. Run `pushify login` first.'));
    process.exit(1);
  }

  // First, we need to find which project this deployment belongs to
  const spinner = ora('Fetching deployment logs...').start();

  try {
    // Get all projects and find the deployment
    const projects = await api.listProjects();

    let foundProjectId: string | null = null;
    let foundDeployment: any = null;

    for (const project of projects) {
      try {
        const deployment = await api.getDeployment(project.id, deploymentId);
        foundProjectId = project.id;
        foundDeployment = deployment;
        break;
      } catch {
        // Not found in this project, continue
      }
    }

    if (!foundProjectId || !foundDeployment) {
      spinner.fail('Deployment not found');
      console.log(chalk.gray('Make sure the deployment ID is correct.'));
      process.exit(1);
    }

    // Get logs
    const logsData = await api.getDeploymentLogs(foundProjectId, deploymentId);
    spinner.stop();

    console.log('');
    console.log(chalk.bold(`Deployment Logs`));
    console.log(chalk.gray(`ID: ${deploymentId}`));
    console.log(chalk.gray(`Status: ${formatStatus(logsData.status)}`));
    console.log('');
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');

    if (logsData.logs) {
      // Format and colorize logs
      const lines = logsData.logs.split('\n');
      for (const line of lines) {
        console.log(formatLogLine(line));
      }
    } else {
      console.log(chalk.gray('No logs available yet.'));
    }

    console.log('');
    console.log(chalk.gray('─'.repeat(60)));

    if (options.follow && !['running', 'failed', 'stopped', 'cancelled'].includes(logsData.status)) {
      console.log('');
      await followLogs(foundProjectId, deploymentId);
    }
  } catch (error) {
    spinner.fail('Failed to fetch logs');
    if (error instanceof Error) {
      console.log(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}

async function followLogs(projectId: string, deploymentId: string): Promise<void> {
  const spinner = ora('Following logs...').start();
  let lastLogLength = 0;
  const terminalStatuses = ['running', 'failed', 'stopped', 'cancelled'];

  while (true) {
    try {
      const logsData = await api.getDeploymentLogs(projectId, deploymentId);
      const currentLogs = logsData.logs || '';

      if (currentLogs.length > lastLogLength) {
        spinner.stop();
        const newLogs = currentLogs.substring(lastLogLength);
        const lines = newLogs.split('\n').filter(l => l.trim());

        for (const line of lines) {
          console.log(formatLogLine(line));
        }

        lastLogLength = currentLogs.length;

        if (!terminalStatuses.includes(logsData.status)) {
          spinner.start('Following logs...');
        }
      }

      if (terminalStatuses.includes(logsData.status)) {
        spinner.stop();
        console.log('');
        console.log(chalk.gray('─'.repeat(60)));
        console.log(`Final status: ${formatStatus(logsData.status)}`);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      spinner.fail('Error following logs');
      break;
    }
  }
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: chalk.gray('Pending'),
    building: chalk.yellow('Building'),
    deploying: chalk.blue('Deploying'),
    running: chalk.green('Running'),
    failed: chalk.red('Failed'),
    stopped: chalk.gray('Stopped'),
    cancelled: chalk.yellow('Cancelled'),
  };

  return statusMap[status] || status;
}

function formatLogLine(line: string): string {
  // Highlight timestamps
  line = line.replace(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/g, chalk.gray('[$1]'));

  // Highlight success messages
  if (line.includes('✓') || line.includes('✅') || line.toLowerCase().includes('success')) {
    return chalk.green(line);
  }

  // Highlight errors
  if (line.includes('❌') || line.includes('✗') || line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
    return chalk.red(line);
  }

  // Highlight warnings
  if (line.includes('⚠️') || line.toLowerCase().includes('warning')) {
    return chalk.yellow(line);
  }

  // Highlight build steps
  if (line.includes('📥') || line.includes('📦') || line.includes('🔨') || line.includes('🚀') || line.includes('🐳')) {
    return chalk.cyan(line);
  }

  return line;
}
