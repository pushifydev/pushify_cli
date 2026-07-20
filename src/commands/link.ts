import { existsSync, readFileSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { api } from '../api.js';
import { LINK_FILE, requireAuth } from '../resolve.js';

/** Link the current directory to a project so commands need no [project] argument. */
export async function linkCommand(projectArg: string): Promise<void> {
  requireAuth();

  const project =
    (await api.getProjectBySlug(projectArg)) ??
    (await api.getProject(projectArg).catch(() => null));
  if (!project) {
    console.log(chalk.red(`Project not found: ${projectArg}`));
    process.exit(1);
  }

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

export function unlinkCommand(): void {
  const file = path.join(process.cwd(), LINK_FILE);
  if (!existsSync(file)) {
    console.log(chalk.yellow('This directory is not linked.'));
    return;
  }
  unlinkSync(file);
  console.log(`${chalk.green('✓')} Unlinked.`);
}
