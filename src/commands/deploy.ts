import chalk from 'chalk';
import ora from 'ora';
import { requireAuth, resolveProject } from '../resolve.js';
import { api, type Deployment } from '../api.js';
import { isAuthenticated, config } from '../config.js';
import { deployStaticCommand, isDirectory } from './deploy-static.js';

interface DeployOptions {
  branch?: string;
  wait?: boolean;
  prod?: boolean;
  project?: string;
  name?: string;
}

export async function deployCommand(projectArg: string | undefined, options: DeployOptions): Promise<void> {
  requireAuth();

  // `pushify deploy ./site`: a folder is published as a static site (upload, no Git).
  if (isDirectory(projectArg)) {
    if (options.branch || options.prod) {
      console.log(chalk.red('--branch and --prod are for Git projects; a folder is uploaded as it is.'));
      process.exit(1);
    }
    await deployStaticCommand(projectArg, { project: options.project, name: options.name, wait: options.wait });
    return;
  }

  if (options.prod && options.branch) {
    console.log(chalk.red('Use either --prod or --branch, not both.'));
    process.exit(1);
  }

  const resolved = await resolveProject(projectArg);
  const projectId: string = resolved.id;
  const projectName: string = resolved.name;

  // --prod deploys the project's production branch — the same branch a bare
  // `pushify deploy` uses, just spelled out.
  const branch = options.prod ? resolved.gitBranch ?? undefined : options.branch;

  // Create deployment
  const spinner = ora(`Triggering deployment for ${chalk.bold(projectName)}...`).start();

  try {
    const deployment = await api.createDeployment(projectId, { branch });

    spinner.succeed(`Deployment triggered!`);
    console.log('');
    console.log(`  ${chalk.gray('Deployment ID:')} ${deployment.id}`);
    console.log(`  ${chalk.gray('Status:')} ${formatStatus(deployment.status)}`);
    if (deployment.branch) {
      console.log(`  ${chalk.gray('Branch:')} ${deployment.branch}${options.prod ? chalk.gray(' (production)') : ''}`);
    }
    console.log('');

    if (options.wait) {
      await waitForDeployment(projectId!, deployment.id, projectName);
    } else {
      console.log(chalk.gray('Use --wait to wait for deployment to complete.'));
      console.log(`View logs: ${chalk.cyan(`pushify logs ${deployment.id}`)}`);
    }
  } catch (error) {
    spinner.fail('Failed to trigger deployment');
    if (error instanceof Error) {
      console.log(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}

async function waitForDeployment(projectId: string, deploymentId: string, projectName: string): Promise<void> {
  const spinner = ora('Waiting for deployment...').start();

  const terminalStatuses = ['running', 'failed', 'stopped', 'cancelled'];
  let lastStatus = '';

  while (true) {
    try {
      const deployment = await api.getDeployment(projectId, deploymentId);

      if (deployment.status !== lastStatus) {
        lastStatus = deployment.status;
        spinner.text = `${formatStatus(deployment.status)} - ${projectName}`;
      }

      if (terminalStatuses.includes(deployment.status)) {
        if (deployment.status === 'running') {
          spinner.succeed(`Deployment successful!`);
          console.log('');
          console.log(chalk.green('  ✓ Your application is now live'));
        } else if (deployment.status === 'failed') {
          spinner.fail(`Deployment failed`);
          if (deployment.errorMessage) {
            console.log(chalk.red(`  Error: ${deployment.errorMessage}`));
          }
          console.log('');
          console.log(`View logs: ${chalk.cyan(`pushify logs ${deploymentId}`)}`);
          process.exit(1);
        } else {
          spinner.warn(`Deployment ${deployment.status}`);
        }
        break;
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      spinner.fail('Failed to check deployment status');
      process.exit(1);
    }
  }
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: chalk.gray('⏳ Pending'),
    building: chalk.yellow('🔨 Building'),
    deploying: chalk.blue('🚀 Deploying'),
    running: chalk.green('✓ Running'),
    failed: chalk.red('✗ Failed'),
    stopped: chalk.gray('■ Stopped'),
    cancelled: chalk.yellow('⊘ Cancelled'),
  };

  return statusMap[status] || status;
}
