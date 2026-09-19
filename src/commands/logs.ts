import chalk from 'chalk';
import ora from 'ora';
import { api } from '../api.js';
import { requireAuth, resolveProject } from '../resolve.js';

interface LogsOptions {
  follow?: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES = ['running', 'failed', 'stopped', 'cancelled'];

export async function logsCommand(target: string | undefined, options: LogsOptions): Promise<void> {
  requireAuth();

  let foundProjectId: string;
  let deploymentId: string;

  if (target && UUID_PATTERN.test(target)) {
    // Explicit deployment ID — locate its project
    const spinner = ora('Locating deployment...').start();
    const projects = await api.listProjects();
    let located: string | null = null;
    for (const project of projects) {
      try {
        await api.getDeployment(project.id, target);
        located = project.id;
        break;
      } catch {
        // not in this project
      }
    }
    if (!located) {
      spinner.fail('Deployment not found');
      process.exit(1);
    }
    spinner.stop();
    foundProjectId = located;
    deploymentId = target;
  } else {
    // Project (or linked directory) — use its latest deployment
    const project = await resolveProject(target);
    const [latest] = await api.listDeployments(project.id, 1);
    if (!latest) {
      console.log(chalk.yellow(`${project.name} has no deployments yet.`));
      process.exit(1);
    }
    foundProjectId = project.id;
    deploymentId = latest.id;
    console.log(chalk.gray(`Latest deployment of ${project.name}: ${deploymentId}`));
  }

  const spinner = ora('Fetching deployment logs...').start();

  let status: string;
  let printedLength: number;

  try {
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

    status = logsData.status;
    printedLength = (logsData.logs || '').length;
  } catch (error) {
    spinner.fail('Failed to fetch logs');
    if (error instanceof Error) {
      console.log(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }

  if (!options.follow) return;

  // Still building/deploying: poll the build log until the deployment settles
  if (!TERMINAL_STATUSES.includes(status)) {
    console.log('');
    status = await followBuildLogs(foundProjectId, deploymentId, printedLength);
  }

  // Only a running deployment has a container whose output we can follow
  if (status !== 'running') {
    console.log('');
    console.log(chalk.yellow(`Deployment is ${formatStatus(status)} — there is no running container to follow.`));
    console.log(chalk.gray('The build log above is complete.'));
    return;
  }

  console.log('');
  await followRuntimeLogs(foundProjectId, deploymentId);
}

/** Poll the build log until the deployment reaches a terminal status; returns that status. */
async function followBuildLogs(projectId: string, deploymentId: string, alreadyPrinted: number): Promise<string> {
  const spinner = ora('Following build logs...').start();
  let lastLogLength = alreadyPrinted;

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

        if (!TERMINAL_STATUSES.includes(logsData.status)) {
          spinner.start('Following build logs...');
        }
      }

      if (TERMINAL_STATUSES.includes(logsData.status)) {
        spinner.stop();
        console.log('');
        console.log(chalk.gray('─'.repeat(60)));
        console.log(`Final status: ${formatStatus(logsData.status)}`);
        return logsData.status;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      spinner.fail('Error following build logs');
      throw error;
    }
  }
}

/** Stream the running container's output over SSE until Ctrl-C or the server ends the stream. */
async function followRuntimeLogs(projectId: string, deploymentId: string): Promise<void> {
  const spinner = ora('Connecting to container...').start();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);

  try {
    await api.streamContainerLogs(
      projectId,
      deploymentId,
      (event) => {
        switch (event.type) {
          case 'connected':
            spinner.stop();
            console.log(chalk.bold('Runtime Logs'));
            console.log(
              chalk.gray(
                `Container: ${event.containerName}${event.remote ? ' (remote)' : ''} — last 100 lines, then live. Ctrl-C to stop.`
              )
            );
            console.log('');
            console.log(chalk.gray('─'.repeat(60)));
            console.log('');
            break;
          case 'log':
            if (event.message !== undefined) console.log(formatLogLine(event.message));
            break;
          case 'error':
            spinner.stop();
            console.log(chalk.red(`Stream error: ${event.message || 'Unknown error'}`));
            break;
          case 'end':
            spinner.stop();
            console.log('');
            console.log(chalk.gray('Log stream ended (container stopped or restarted). Re-run to reconnect.'));
            break;
          case 'ping':
            break;
        }
      },
      { signal: controller.signal }
    );
  } catch (error) {
    spinner.stop();
    if (!controller.signal.aborted) {
      console.log(chalk.red('Failed to follow runtime logs'));
      throw error;
    }
  } finally {
    process.off('SIGINT', stop);
  }

  if (controller.signal.aborted) {
    console.log('');
    console.log(chalk.gray('Stopped following.'));
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
