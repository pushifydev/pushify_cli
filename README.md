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

1. Get your API key from [Pushify Dashboard](https://pushify.dev/dashboard/settings)

2. Login with your API key:
```bash
pushify login --key pk_live_YOUR_API_KEY
```

3. Deploy your project:
```bash
pushify deploy my-project
```

## Commands

### Authentication

```bash
# Login with API key
pushify login --key pk_live_xxx

# Login with custom API URL (for self-hosted)
pushify login --key pk_live_xxx --url http://localhost:4000/api/v1

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

# Deploy a specific branch
pushify deploy my-project --branch feature/new-feature

# Deploy and wait for completion
pushify deploy my-project --wait

# Short alias
pushify d my-project
```

### Status

```bash
# Show project status and recent deployments
pushify status my-project

# Show all projects status
pushify status
```

### Logs

```bash
# View deployment logs
pushify logs <deployment-id>

# Follow logs in real-time
pushify logs <deployment-id> --follow
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
