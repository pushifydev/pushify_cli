import chalk from 'chalk';
import ora from 'ora';
import { api, type Project } from '../api.js';
import { isAuthenticated } from '../config.js';

interface ProjectsOptions {
  json?: boolean;
}

export async function projectsCommand(options: ProjectsOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('Not authenticated. Run `pushify login` first.'));
    process.exit(1);
  }

  const spinner = ora('Fetching projects...').start();

  try {
    const projects = await api.listProjects();
    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(projects, null, 2));
      return;
    }

    if (projects.length === 0) {
      console.log(chalk.yellow('No projects found.'));
      console.log(chalk.gray('Create a project at https://pushify.dev/dashboard/projects/new'));
      return;
    }

    console.log('');
    console.log(chalk.bold(`  Projects (${projects.length})`));
    console.log('');

    for (const project of projects) {
      printProject(project);
    }
  } catch (error) {
    spinner.fail('Failed to fetch projects');
    if (error instanceof Error) {
      console.log(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}

function printProject(project: Project): void {
  const statusColors: Record<string, (text: string) => string> = {
    active: chalk.green,
    paused: chalk.yellow,
    deleted: chalk.red,
  };

  const statusColor = statusColors[project.status] || chalk.gray;
  const statusIcon = project.status === 'active' ? '●' : '○';

  console.log(`  ${statusColor(statusIcon)} ${chalk.bold(project.name)} ${chalk.gray(`(${project.slug})`)}`);

  if (project.gitRepoUrl) {
    console.log(`    ${chalk.gray('Repository:')} ${project.gitRepoUrl}`);
  }

  if (project.gitBranch) {
    console.log(`    ${chalk.gray('Branch:')} ${project.gitBranch}`);
  }

  const primaryDomain = project.domains?.find(d => d.isPrimary);
  if (primaryDomain) {
    console.log(`    ${chalk.gray('URL:')} ${chalk.cyan(`https://${primaryDomain.domain}`)}`);
  }

  console.log(`    ${chalk.gray('ID:')} ${project.id}`);
  console.log('');
}
