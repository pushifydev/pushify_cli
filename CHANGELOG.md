# Changelog

## [0.2.0-beta.2] - 2026-07-20

### Added
- **`pushify env pull [project]`** — download the project's environment variables into a local `.env` (written `chmod 600`; refuses to overwrite an existing file without `--force`; `--file` for alternate paths).
- **`pushify env push [project]`** — upsert variables from a local `.env` to the project, with a dry-run preview by default and `--yes` to apply. Existing keys are overwritten; keys missing from the file are kept. Comments, blank lines and quoted values are handled.
- **`pushify open [project]`** (alias `o`) — open the project's primary domain in the browser.

## [0.2.0-beta.1]
- Initial release: login/logout, projects, deploy, logs (`--follow`), status, whoami.
