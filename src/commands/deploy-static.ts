import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { api } from '../api.js';
import { LINK_FILE, readLinkFile, resolveProject } from '../resolve.js';

/**
 * `pushify deploy ./site` — publish a folder of HTML, CSS and JS as it is. No Git, no build.
 * A new site is created (and this directory linked to it) the first time; after that the same
 * command uploads a new version.
 */

const MAX_FILES = 2000;
const MAX_BYTES = 50 * 1024 * 1024;
const SKIPPED = new Set(['node_modules', '__MACOSX', 'Thumbs.db', 'desktop.ini']);

export interface StaticDeployOptions {
  project?: string;
  name?: string;
  wait?: boolean;
}

export function isDirectory(p: string | undefined): p is string {
  if (!p) return false;
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Every publishable file under `root`, with its path relative to it. Hidden files are left out. */
function collect(root: string): { rel: string; abs: string; size: number }[] {
  const out: { rel: string; abs: string; size: number }[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile()) out.push({ rel, abs, size: statSync(abs).size });
    }
  };
  walk(root, '');
  return out;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function deployStaticCommand(dir: string, options: StaticDeployOptions): Promise<void> {
  const root = path.resolve(dir);
  const files = collect(root);
  const total = files.reduce((sum, f) => sum + f.size, 0);

  if (!files.some((f) => f.rel === 'index.html')) {
    console.log(chalk.red(`No index.html in ${dir} — the site would have no home page.`));
    console.log(chalk.gray('Point at the folder that contains index.html (for a build, usually dist/ or build/).'));
    process.exit(1);
  }
  if (files.length > MAX_FILES) {
    console.log(chalk.red(`${files.length} files — a site can have at most ${MAX_FILES}.`));
    process.exit(1);
  }
  if (total > MAX_BYTES) {
    console.log(chalk.red(`${formatBytes(total)} — a site can be at most 50 MB.`));
    process.exit(1);
  }

  // Where it goes: an explicit project, else the linked one if it is an uploaded site, else new.
  let target: { id: string; name: string } | null = null;
  if (options.project) {
    const p = await resolveProject(options.project);
    target = { id: p.id, name: p.name };
  } else if (readLinkFile()) {
    const p = await resolveProject();
    if (p.settings?.staticSource === 'upload') target = { id: p.id, name: p.name };
  }
  const name = options.name ?? path.basename(root);

  const form = new FormData();
  if (!target) form.append('name', name);
  for (const f of files) form.append('files', new Blob([readFileSync(f.abs)]), f.rel);

  const spinner = ora(
    `${target ? `Uploading a new version of ${chalk.bold(target.name)}` : `Creating ${chalk.bold(name)}`} · ${files.length} files, ${formatBytes(total)}`,
  ).start();

  let projectId: string;
  let deploymentId: string;
  try {
    const result = await api.uploadStaticSite(form, target?.id);
    projectId = target?.id ?? result.project!.id;
    deploymentId = result.deployment.id;
    spinner.succeed(target ? 'New version uploaded' : `Site created: ${chalk.bold(result.project!.name)}`);
  } catch (error) {
    spinner.fail('Upload failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }

  // Link the directory once, so the next `pushify deploy <dir>` updates the same site.
  if (!target && !readLinkFile()) {
    writeFileSync(path.join(process.cwd(), LINK_FILE), JSON.stringify({ projectId }, null, 2) + '\n');
    console.log(chalk.gray(`  Linked this directory (${LINK_FILE}); next time the same command uploads a new version.`));
  }

  if (!options.wait) {
    console.log(`  View logs: ${chalk.cyan(`pushify logs ${deploymentId}`)}`);
    console.log(chalk.gray('  Use --wait to wait until it is live.'));
    return;
  }

  const waiting = ora('Publishing...').start();
  for (;;) {
    const d = await api.getDeployment(projectId, deploymentId);
    if (d.status === 'running') {
      const project = await api.getProject(projectId);
      const url = project.productionUrl ?? (project.settings?.productionUrl as string | undefined);
      waiting.succeed(url ? `Live: ${chalk.cyan(url)}` : 'Live');
      return;
    }
    if (['failed', 'stopped', 'cancelled'].includes(d.status)) {
      waiting.fail(`Publish ${d.status}${d.errorMessage ? `: ${d.errorMessage}` : ''}`);
      console.log(`  View logs: ${chalk.cyan(`pushify logs ${deploymentId}`)}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
