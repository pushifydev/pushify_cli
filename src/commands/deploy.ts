import chalk from 'chalk';
import ora from 'ora';
import { api, type Deployment } from '../api.js';
import { isAuthenticated, config } from '../config.js';

interface DeployOptions {
  branch?: string;
  wait?: boolean;
}

export async function deployCommand(projectArg: string | undefined, options: DeployOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('Not authenticated. Run `pushify login` first.'));
    process.exit(1);
  }

  // Resolve project
  let projectId: string | null = null;
  let projectName: string = '';

  if (projectArg) {
    // Try to find by slug or name
    const spinner = ora('Finding project...').start();
    try {
      const project = await api.getProjectBySlug(projectArg);
      if (project) {
        projectId = project.id;
        projectName = project.name;
        spinner.stop();
      } else {
        // Maybe it's a project ID directly
        try {
          const projectById = await api.getProject(projectArg);
          projectId = projectById.id;
          projectName = projectById.name;
          spinner.stop();
        } catch {
          spinner.fail(`Project not found: ${projectArg}`);
          process.exit(1);
        }
      }
    } catch (error) {
      spinner.fail('Failed to find project');
      if (error instanceof Error) {
        console.log(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  } else {
    // Use default project or prompt
    const defaultProject = config.get('defaultProject');
    if (defaultProject) {
      projectId = defaultProject;
      const project = await api.getProject(defaultProject);
      projectName = project.name;
    } else {
      console.log(chalk.red('No project specified.'));
      console.log('');
      console.log('Usage:');
      console.log(`  ${chalk.cyan('pushify deploy <project-name>')}`);
      console.log(`  ${chalk.cyan('pushify deploy my-app')}`);
      console.log('');
      console.log('Or list available projects:');
      console.log(`  ${chalk.cyan('pushify projects')}`);
      process.exit(1);
    }
  }

  // Create deployment
  const spinner = ora(`Triggering deployment for ${chalk.bold(projectName)}...`).start();

  try {
    const deployment = await api.createDeployment(projectId!, {
      branch: options.branch,
    });

    spinner.succeed(`Deployment triggered!`);
    console.log('');
    console.log(`  ${chalk.gray('Deployment ID:')} ${deployment.id}`);
    console.log(`  ${chalk.gray('Status:')} ${formatStatus(deployment.status)}`);
    if (deployment.branch) {
      console.log(`  ${chalk.gray('Branch:')} ${deployment.branch}`);
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
