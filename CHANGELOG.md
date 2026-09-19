# Changelog

## [Unreleased]

### Added
- **`pushify init`** — first-time setup for a directory: logs in if needed, then creates a new project (name from the directory, repository/branch from the `origin` remote) or links an existing one, writes `.pushify` and prints the dashboard URL. `--yes`, `--name`, `--project` for non-interactive use.
- **`pushify deploy --prod`** — deploy the project's production (default) branch; the documented spelling of a bare `pushify deploy`.
- **`pushify config set|get|unset default-project` / `config list`** — the default project `resolve` already honoured can now actually be set; `list` shows apiUrl, defaultProject and a masked API key.

### Fixed
- **`pushify logs -f`** on a healthy deployment printed the build log once and exited. It now follows the build log until the deployment settles, then streams the running container's output live (Ctrl-C to stop). Failed/stopped/cancelled deployments print the build log and say why there is nothing to follow. The follow loop also no longer re-prints the log already shown.

## [1.2.0] - 2026-07-20

### Added
- **`pushify link <project>` / `unlink`** — link a directory to a project (`.pushify` file, auto-added to `.gitignore`); every command then works with no project argument, resolving explicit arg → link file (searched up parent dirs, git-style) → default project. Used consistently by deploy, logs, status, env and open.
- **`pushify logs [target]`** now also accepts a project (or nothing, when linked) and follows that project's **latest** deployment; a UUID still targets a specific deployment.

### Fixed
- `--version` reported a hard-coded 1.0.0 — now read from package.json.
- Errors print one clean line with an exit code instead of a raw stack trace (rate limits get a friendly hint).
- `whoami` shows whether credentials come from `PUSHIFY_API_KEY` or stored config.
- **`pushify env pull [project]`** — download the project's environment variables into a local `.env` (written `chmod 600`; refuses to overwrite an existing file without `--force`; `--file` for alternate paths).
- **`pushify env push [project]`** — upsert variables from a local `.env` to the project, with a dry-run preview by default and `--yes` to apply. Existing keys are overwritten; keys missing from the file are kept. Comments, blank lines and quoted values are handled.
- **`pushify open [project]`** (alias `o`) — open the project's primary domain in the browser.

## [1.1.3 and earlier]
- Initial releases: login/logout, projects, deploy, logs (`--follow`), status, whoami.
