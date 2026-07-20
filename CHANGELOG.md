# Changelog

## [0.2.0-beta.2] - 2026-07-20

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

## [0.2.0-beta.1]
- Initial release: login/logout, projects, deploy, logs (`--follow`), status, whoami.
