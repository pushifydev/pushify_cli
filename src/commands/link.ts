import { existsSync, readFileSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { api, type Project } from '../api.js';
import { LINK_FILE, requireAuth } from '../resolve.js';

/** Resolve a project by slug, name or ID; null when nothing matches. */
export async function findProject(projectArg: string): Promise<Project | null> {
  return (await api.getProjectBySlug(projectArg)) ?? (await api.getProject(projectArg).catch(() => null));
}

/** Write the .pushify link file for `project` in the current directory and keep it out of git. */
export function writeLink(project: Project): void {
  const file = path.join(process.cwd(), LINK_FILE);
  writeFileSync(file, JSON.stringify({ projectId: project.id, slug: project.slug }, null, 2) + '\n');
  console.log(`${chalk.green('✓')} Linked to ${chalk.bold(project.name)} (${project.slug})`);

  // Keep the link out of git automatically when possible
  const gitignore = path.join(process.cwd(), '.gitignore');
  if (existsSync(gitignore)) {
    const content = readFileSync(gitignore, 'utf-8');
    if (!content.split('\n').some((l) => l.trim() === LINK_FILE)) {
      appendFileSync(gitignore, `${content.endsWith('\n') ? '' : '\n'}${LINK_FILE}\n`);
      console.log(chalk.gray(`Added ${LINK_FILE} to .gitignore`));
    }
  } else {
    console.log(chalk.gray(`Tip: add ${LINK_FILE} to your .gitignore`));
  }
}

/** Link the current directory to a project so commands need no [project] argument. */
export async function linkCommand(projectArg: string): Promise<void> {
  requireAuth();

  const project = await findProject(projectArg);
  if (!project) {
    console.log(chalk.red(`Project not found: ${projectArg}`));
    process.exit(1);
  }

  writeLink(project);
}

export function unlinkCommand(): void {
  const file = path.join(process.cwd(), LINK_FILE);
  if (!existsSync(file)) {
    console.log(chalk.yellow('This directory is not linked.'));
    return;
  }
  unlinkSync(file);
  console.log(`${chalk.green('✓')} Unlinked.`);
}
