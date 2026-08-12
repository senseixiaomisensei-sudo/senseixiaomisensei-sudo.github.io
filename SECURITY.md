# Security policy

## Supported version

Security fixes are applied to the current `main` branch.

## Report a vulnerability

Do not post exploit steps, visitor text, API credentials, Turnstile tokens, or
other sensitive material in a public issue.

Use GitHub's private vulnerability reporting for this repository when it is
enabled. If that option is unavailable, open a minimal public issue titled
`Security contact requested` without technical details; the maintainer will
arrange a private channel.

## Security boundaries

- `AGNES_API_KEY` and `TURNSTILE_SECRET_KEY` belong only in the server runtime.
- Browser configuration may contain a public API endpoint and a public
  Turnstile site key, never a secret key.
- Third-party scripts, new external network origins, CSP changes, and proxy
  changes require maintainer review before merge.

## Response target

The maintainer aims to acknowledge a valid report within seven days and to
publish a remediation plan after reproducing the issue.
