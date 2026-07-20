import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { api, type Project } from './api.js';
import { config, isAuthenticated } from './config.js';

export const LINK_FILE = '.pushify';

export interface LinkFile {
  projectId: string;
  slug?: string;
}

/** Read the .pushify link file from the current directory (or nearest parent). */
export function readLinkFile(cwd = process.cwd()): LinkFile | null {
  let dir = cwd;
  // Walk up like git does, so subdirectories of a linked repo still resolve
  for (let depth = 0; depth < 25; depth++) {
    const file = path.join(dir, LINK_FILE);
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf-8')) as LinkFile;
        if (parsed && typeof parsed.projectId === 'string') return parsed;
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Exit with a friendly message when not logged in. */
export function requireAuth(): void {
  if (!isAuthenticated()) {
    console.log(chalk.red('Not authenticated.'));
    console.log(`Run ${chalk.cyan('pushify login --key pk_live_...')} or set ${chalk.cyan('PUSHIFY_API_KEY')}.`);
    process.exit(1);
  }
}

/**
 * Single project-resolution path for every command:
 * explicit argument → .pushify link file → global default project.
 */
export async function resolveProject(projectArg?: string): Promise<Project> {
  if (projectArg) {
    const bySlug = await api.getProjectBySlug(projectArg);
    if (bySlug) return bySlug;
    try {
      return await api.getProject(projectArg);
    } catch {
      console.log(chalk.red(`Project not found: ${projectArg}`));
      process.exit(1);
    }
  }

  const linked = readLinkFile();
  if (linked) {
    try {
      return await api.getProject(linked.projectId);
    } catch {
      console.log(chalk.red(`Linked project no longer exists (${LINK_FILE} is stale).`));
      console.log(`Run ${chalk.cyan('pushify link <project>')} to relink or ${chalk.cyan('pushify unlink')}.`);
      process.exit(1);
    }
  }

  const defaultProject = config.get('defaultProject');
  if (defaultProject) {
    try {
      return await api.getProject(defaultProject);
    } catch {
      // fall through to the guidance below
    }
  }

  console.log(chalk.red('No project specified and this directory is not linked.'));
  console.log('');
  console.log('Either pass a project:');
  console.log(`  ${chalk.cyan('pushify <command> my-project')}`);
  console.log('or link this directory once:');
  console.log(`  ${chalk.cyan('pushify link my-project')}`);
  process.exit(1);
}
