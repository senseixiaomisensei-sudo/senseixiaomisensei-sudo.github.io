# Contributing to PostPrep

## Before opening a pull request

1. Keep basic text tools browser-local. Do not add tracking, draft storage, or
   external requests to them.
2. Never commit credentials, tokens, production URLs with embedded secrets, or
   `.dev.vars` files.
3. Treat AI input as untrusted data. Do not add user-controlled HTML to
   `innerHTML`, and do not add user-controlled shell or file-system execution.
4. Do not add third-party scripts, analytics, advertising code, or new network
   origins without maintainer approval and a privacy/CSP update.
5. Add or update a focused test when changing `functions/api/text.js`.
6. Run `npm run build:styles` and `npm test` before requesting review.

## Pull request scope

Keep pull requests focused. Describe user-facing effects, deployment changes,
and any new environment variables. Security-sensitive changes require a short
threat-model note in the pull request description.
