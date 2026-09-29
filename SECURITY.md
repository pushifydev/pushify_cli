# Security Policy

## Supported Versions

Security fixes ship in the latest published version of `pushify-cli` on npm. Please upgrade
before reporting (`npm i -g pushify-cli@latest`).

## Reporting a Vulnerability

Please **do not open a public issue** for security problems.

- Email **support@pushify.dev** with the details (steps to reproduce, impact, CLI version), or
- use GitHub's **"Report a vulnerability"** (Security tab → Private vulnerability reporting) on
  this repository.

You can expect an acknowledgement within **72 hours**. We'll work with you on a fix and
coordinate disclosure; credit is given unless you prefer otherwise.

## Scope notes

- The CLI stores your API key on your machine; anything that leaks it (logs, error output,
  world-readable files) is in scope.
- Issues in the Pushify platform itself (API, dashboard, installer) are also welcome here, or on
  [pushify_backend](https://github.com/pushifydev/pushify_backend/security/policy).
