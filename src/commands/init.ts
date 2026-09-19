import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import ora from 'ora';
import { api, type Project } from '../api.js';
import { getDashboardUrl, isAuthenticated } from '../config.js';
import { LINK_FILE, readLinkFile } from '../resolve.js';
import { loginCommand } from './login.js';
import { findProject, writeLink } from './link.js';

interface InitOptions {
  project?: string;
  name?: string;
  yes?: boolean;
}

interface NewProjectInput {
  name: string;
  gitRepoUrl?: string;
  gitBranch?: string;
}

/** Run a git command in cwd; null when git is missing, this is not a repo, or the command fails. */
function git(args: string): string | null {
  try {
    const out = execSync(`git ${args}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** The API only accepts http(s) URLs — turn `git@host:owner/repo.git` into `https://host/owner/repo`. */
function normalizeRepoUrl(url: string): string {
  const ssh = url.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  return url.replace(/\.git$/, '');
}

function detectProvider(url: string): 'github' | 'gitlab' | undefined {
  if (url.includes('github.com')) return 'github';
  if (url.includes('gitlab')) return 'gitlab';
  return undefined; // Bitbucket is not integrated; the API refuses it
}

function printNextSteps(project: Project): void {
  console.log('');
  console.log(`Next: ${chalk.cyan('pushify deploy --wait')}`);
  console.log(`Dashboard: ${chalk.underline(`${getDashboardUrl()}/dashboard/projects/${project.id}`)}`);
}

async function createAndLink(input: NewProjectInput): Promise<void> {
  const spinner = ora(`Creating project ${chalk.bold(input.name)}...`).start();
  let project: Project;
  try {
    project = await api.createProject({
      name: input.name,
      gitRepoUrl: input.gitRepoUrl,
      gitBranch: input.gitRepoUrl ? input.gitBranch : undefined,
      gitProvider: input.gitRepoUrl ? detectProvider(input.gitRepoUrl) : undefined,
    });
  } catch (error) {
    spinner.fail('Failed to create project');
    throw error;
  }
  spinner.succeed(`Created ${chalk.bold(project.name)} (${project.slug})`);
  if (project.gitRepoUrl) {
    console.log(`  ${chalk.gray('Repository:')} ${project.gitRepoUrl}${project.gitBranch ? chalk.gray(` @ ${project.gitBranch}`) : ''}`);
  } else {
    console.log(chalk.gray('  No git remote found — connect a repository in the dashboard before deploying.'));
  }

  writeLink(project);
  printNextSteps(project);
}

/** First-time setup for the current directory: log in, then create or link a project. */
export async function initCommand(options: InitOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.yellow('Not logged in yet — starting login.'));
    console.log('');
    await loginCommand({});
    console.log('');
  }

  // Already linked? Nothing to do.
  if (existsSync(path.join(process.cwd(), LINK_FILE))) {
    const linked = readLinkFile();
    const label = linked?.slug ?? linked?.projectId ?? 'a project';
    console.log(`${chalk.green('✓')} This directory is already linked to ${chalk.bold(label)} (${LINK_FILE} exists).`);
    console.log(chalk.gray(`Run ${chalk.cyan('pushify unlink')} first to set it up again.`));
    return;
  }

  // --project links an existing project outright
  if (options.project) {
    const project = await findProject(options.project);
    if (!project) {
      console.log(chalk.red(`Project not found: ${options.project}`));
      process.exit(1);
    }
    writeLink(project);
    printNextSteps(project);
    return;
  }

  // Defaults gathered from the directory and its git remote
  // symbolic-ref works before the first commit too, and fails (→ null) on a detached HEAD
  const origin = git('remote get-url origin');
  const branch = git('symbolic-ref --short -q HEAD');
  const defaults: NewProjectInput = {
    name: options.name || path.basename(process.cwd()),
    gitRepoUrl: origin ? normalizeRepoUrl(origin) : undefined,
    gitBranch: branch ?? undefined,
  };

  if (options.yes) {
    await createAndLink(defaults);
    return;
  }

  if (!process.stdin.isTTY) {
    console.log(chalk.red('No interactive terminal.'));
    console.log(
      `Pass ${chalk.cyan('--yes')} to create a project from the defaults, or ${chalk.cyan('--project <id>')} to link an existing one.`
    );
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => {
    rl.close();
    console.log('');
    process.exit(130);
  });
  const ask = async (question: string, fallback?: string): Promise<string> => {
    const hint = fallback ? chalk.gray(` (${fallback})`) : '';
    const answer = (await rl.question(`${question}${hint}: `)).trim();
    return answer || fallback || '';
  };

  try {
    console.log(chalk.bold('Set up this directory for Pushify'));
    console.log('');
    console.log('  1) Create a new project');
    console.log('  2) Link an existing project');
    console.log('');
    const choice = await ask('Choose', '1');

    if (choice === '2') {
      const spinner = ora('Fetching projects...').start();
      const projects = await api.listProjects();
      spinner.stop();

      if (projects.length === 0) {
        console.log(chalk.yellow('No projects yet — creating a new one instead.'));
      } else {
        console.log('');
        projects.forEach((p, i) => {
          console.log(`  ${String(i + 1).padStart(2)}) ${chalk.bold(p.name)} ${chalk.gray(`(${p.slug})`)}`);
        });
        console.log('');
        const pick = await ask('Project number or slug');
        const index = Number(pick);
        const project =
          Number.isInteger(index) && projects[index - 1] ? projects[index - 1] : await findProject(pick);
        if (!project) {
          console.log(chalk.red(`Project not found: ${pick}`));
          process.exit(1);
        }
        writeLink(project);
        printNextSteps(project);
        return;
      }
    }

    console.log('');
    const name = await ask('Project name', defaults.name);
    const repo = (await ask('Git repository URL', defaults.gitRepoUrl)) || undefined;
    const branch = repo ? await ask('Branch', defaults.gitBranch || 'main') : undefined;
    console.log('');
    await createAndLink({ name, gitRepoUrl: repo ? normalizeRepoUrl(repo) : undefined, gitBranch: branch });
  } finally {
    rl.close();
  }
}
