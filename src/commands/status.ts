import chalk from 'chalk';
import ora from 'ora';
import { requireAuth, resolveProject, readLinkFile } from '../resolve.js';
import { api, type Project, type Deployment } from '../api.js';
import { isAuthenticated, config } from '../config.js';

export async function statusCommand(projectArg?: string): Promise<void> {
  requireAuth();

  const spinner = ora('Fetching status...').start();

  try {
    let project: Project | null = null;

    if (projectArg || readLinkFile() || config.get('defaultProject')) {
      spinner.stop();
      project = await resolveProject(projectArg);
      spinner.start();
    } else {
      // No target anywhere — show all projects
      spinner.stop();
      await showAllProjectsStatus();
      return;
    }

    if (!project) {
      spinner.fail('No project specified.');
      console.log('');
      console.log('Usage:');
      console.log(`  ${chalk.cyan('pushify status <project-name>')}`);
      process.exit(1);
    }

    // Get recent deployments
    const deployments = await api.listDeployments(project.id, 5);
    spinner.stop();

    printProjectStatus(project, deployments);
  } catch (error) {
    spinner.fail('Failed to fetch status');
    if (error instanceof Error) {
      console.log(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}

async function showAllProjectsStatus(): Promise<void> {
  const projects = await api.listProjects();

  if (projects.length === 0) {
    console.log(chalk.yellow('No projects found.'));
    return;
  }

  console.log('');
  console.log(chalk.bold('Project Status Overview'));
  console.log('');

  for (const project of projects) {
    const deployments = await api.listDeployments(project.id, 1);
    const latestDeployment = deployments[0];

    const statusIcon = project.status === 'active' ? chalk.green('●') : chalk.yellow('○');
    console.log(`${statusIcon} ${chalk.bold(project.name)} ${chalk.gray(`(${project.slug})`)}`);

    if (latestDeployment) {
      console.log(`  ${chalk.gray('Latest:')} ${formatStatus(latestDeployment.status)} - ${formatTimeAgo(latestDeployment.createdAt)}`);
    } else {
      console.log(`  ${chalk.gray('No deployments yet')}`);
    }
    console.log('');
  }
}

function printProjectStatus(project: Project, deployments: Deployment[]): void {
  const statusIcon = project.status === 'active' ? chalk.green('●') : chalk.yellow('○');

  console.log('');
  console.log(`${statusIcon} ${chalk.bold.white(project.name)}`);
  console.log('');
  console.log(chalk.gray('─'.repeat(50)));
  console.log('');

  // Project info
  console.log(`  ${chalk.gray('ID:')} ${project.id}`);
  console.log(`  ${chalk.gray('Slug:')} ${project.slug}`);
  console.log(`  ${chalk.gray('Status:')} ${formatProjectStatus(project.status)}`);

  if (project.gitRepoUrl) {
    console.log(`  ${chalk.gray('Repository:')} ${project.gitRepoUrl}`);
  }

  if (project.gitBranch) {
    console.log(`  ${chalk.gray('Branch:')} ${project.gitBranch}`);
  }

  const primaryDomain = project.domains?.find(d => d.isPrimary);
  if (primaryDomain) {
    console.log(`  ${chalk.gray('URL:')} ${chalk.cyan(`https://${primaryDomain.domain}`)}`);
  }

  console.log('');
  console.log(chalk.gray('─'.repeat(50)));
  console.log('');

  // Recent deployments
  console.log(chalk.bold('  Recent Deployments'));
  console.log('');

  if (deployments.length === 0) {
    console.log(chalk.gray('  No deployments yet'));
  } else {
    for (const deployment of deployments) {
      const statusStr = formatStatus(deployment.status);
      const timeAgo = formatTimeAgo(deployment.createdAt);

      console.log(`  ${statusStr} ${chalk.gray('-')} ${timeAgo}`);

      if (deployment.branch) {
        console.log(`    ${chalk.gray('Branch:')} ${deployment.branch}`);
      }

      if (deployment.commitHash) {
        const shortHash = deployment.commitHash.substring(0, 7);
        console.log(`    ${chalk.gray('Commit:')} ${shortHash} ${deployment.commitMessage ? `- ${deployment.commitMessage.substring(0, 50)}` : ''}`);
      }

      console.log(`    ${chalk.gray('ID:')} ${deployment.id}`);
      console.log('');
    }
  }
}

function formatProjectStatus(status: string): string {
  const statusMap: Record<string, string> = {
    active: chalk.green('Active'),
    paused: chalk.yellow('Paused'),
    deleted: chalk.red('Deleted'),
  };

  return statusMap[status] || status;
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

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}
