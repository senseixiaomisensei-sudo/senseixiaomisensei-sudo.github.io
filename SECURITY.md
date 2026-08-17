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
- Public GitHub Skill reading is limited to a fixed `github.com` URL grammar,
  GitHub's public API, a size limit, timeouts, and a pinned commit SHA; loaded
  Skill text is untrusted data and must never be executed or treated as
  instructions.
- Third-party scripts, new external network origins, CSP changes, proxy
  changes, and automatic Skill installation or execution require maintainer
  review before merge.
- Voice-changer uploads may only pass through the protected Worker and Pages
  Function after strict Origin checks, a dedicated RVC rate limit, model-id and
  parameter validation, format/size validation, and a fixed server-configured
  GPU URL. Never add a browser-to-GPU path, arbitrary URL fetch, long-lived
  media library, or client-side inference token.
- The separate GPU adapter must have no browser CORS, must use a server-only
  bearer token, and must delete source audio after the task plus generated
  audio after its short token-protected retention period. Mounted RVC model
  weights are operator-provided; the adapter never downloads models.

## Response target

The maintainer aims to acknowledge a valid report within seven days and to
publish a remediation plan after reproducing the issue.
