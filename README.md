# Pushify CLI

Command-line interface for Pushify deployment platform.

## Installation

```bash
# Install globally
npm install -g pushify-cli

# Or use npx
npx pushify-cli <command>
```

## Quick Start

```bash
npm install -g pushify-cli
cd my-app
pushify init            # logs you in through the browser if needed, then creates or links a project
pushify deploy --wait
```

`pushify init` opens the browser to approve the login (it prints a verification code and a link in
case the browser does not open). For CI, use an API key instead — see
[Environment Variables](#environment-variables).

## Commands

### Set up a directory

`pushify init` is the first-time setup for a repo: it logs you in if needed, then either creates a
new project (name defaults to the directory name, repository and branch to the `origin` remote and
current branch) or links an existing one, and writes `.pushify`.

```bash
pushify init                         # interactive
pushify init --yes                   # no prompts: create from directory name + git remote
pushify init --yes --name my-app     # ...with an explicit name
pushify init --project my-app        # link an existing project (ID or slug) instead
```

### Link a directory

Already have a project? Link the directory once — every command then works without a project argument:

```bash
pushify link my-project     # writes .pushify (auto-added to .gitignore)
pushify deploy --wait
pushify logs -f             # follows the LATEST deployment of the linked project
pushify env pull
pushify open
pushify unlink
```

Resolution order everywhere: explicit argument → `.pushify` in the directory (or any parent) → `pushify config` default project.

### Authentication

```bash
# Log in through the browser (prints a verification code to match)
pushify login

# Log in with an API key instead (from Dashboard → Settings → API keys)
pushify login --key pk_live_xxx

# Log in to a self-hosted instance
pushify login --key pk_live_xxx --url https://api.your-domain.com/api/v1

# Logout
pushify logout

# Check current authentication
pushify whoami
```

### Projects

```bash
# List all projects
pushify projects

# List projects as JSON
pushify projects --json
```

### Deployments

```bash
# Deploy a project
pushify deploy my-project

# Deploy the production branch (the project's default branch — same as omitting --branch)
pushify deploy my-project --prod

# Deploy a specific branch
pushify deploy my-project --branch feature/new-feature

# Deploy and wait for completion
pushify deploy my-project --wait

# Short alias
pushify d my-project
```

### Publish a folder (no Git)

```bash
# Upload a folder of HTML, CSS and JS as a website — it needs an index.html at its top level
pushify deploy ./site --wait

# The first run creates the site and links this directory; running it again uploads a new version
pushify deploy ./site

# Name a new site, or update a specific one
pushify deploy ./dist --name marketing
pushify deploy ./dist --project marketing
```

Hidden files (`.git`, `.env`, …) are never uploaded. A site can have up to 2,000 files and 50 MB.

### Status

```bash
# Show project status and recent deployments
pushify status my-project

# Show all projects status
pushify status
```

### Logs

```bash
# Logs of a specific deployment, or the latest deployment of a project
pushify logs <deployment-id>
pushify logs my-project

# Follow: streams the build log while the deployment is building, then the
# running container's output live once it is up. Ctrl-C to stop.
pushify logs my-project -f
pushify logs <deployment-id> --follow
```

`--follow` on a failed, stopped or cancelled deployment prints the build log and explains why
there is nothing to follow.

### Environment variables

Sync your project's environment variables with a local `.env` file:

```bash
# Download project env vars into .env (refuses to overwrite without --force)
pushify env pull my-project

# Preview what would be pushed, then apply
pushify env push my-project
pushify env push my-project --yes

# Use a different file
pushify env pull my-project --file .env.production --force
```

`env push` upserts: existing keys are overwritten, keys not present in the file are kept.
The pulled file is written with `chmod 600` — keep it in `.gitignore`.

### Open in browser

```bash
# Open the project's primary domain
pushify open my-project
```

### CLI settings

A default project is used when a command has no project argument and the directory is not linked.

```bash
pushify config set default-project my-project   # accepts an ID or slug
pushify config get default-project
pushify config unset default-project
pushify config list                              # apiUrl, defaultProject, masked apiKey
```

## Environment Variables

Instead of using `pushify login`, you can set environment variables:

```bash
export PUSHIFY_API_KEY=pk_live_YOUR_API_KEY
export PUSHIFY_API_URL=https://api.pushify.dev/api/v1  # optional
```

## Examples

### CI/CD Integration

GitHub Actions example:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Pushify
        env:
          PUSHIFY_API_KEY: ${{ secrets.PUSHIFY_API_KEY }}
        run: |
          npx pushify-cli deploy my-project --wait
```

### Shell Script

```bash
#!/bin/bash

# Deploy and check result
pushify deploy my-project --wait

if [ $? -eq 0 ]; then
  echo "Deployment successful!"
else
  echo "Deployment failed!"
  exit 1
fi
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- projects

# Build
npm run build

# Run built version
npm start -- projects
```

## License

MIT
