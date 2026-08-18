---
name: postprep-frontend-quality
description: Design, implement, and review small web interfaces with accessible responsive layouts and safe frontend boundaries. Use when building or improving HTML, CSS, JavaScript, landing pages, dashboards, forms, or navigation.
---

# PostPrep Frontend Quality

Build focused interfaces that remain clear on phones, keyboards, and narrow network conditions.

## Delivery workflow

1. Inspect the existing information hierarchy and reuse the project's design tokens before introducing new styles.
2. Define the smallest useful page flow: primary action, visible feedback, empty state, failure state, and completion state.
3. Use semantic HTML first. Every control needs an accessible name, visible focus, and a touch target of about 40 px or more.
4. Implement the narrow layout first, then enhance for larger screens. Check that no element creates horizontal overflow at 320 px.
5. Keep untrusted text out of `innerHTML`; render it with DOM APIs or escaped text. Never put secrets, private API keys, or privileged URLs in client code.
6. Test keyboard navigation, reduced motion, language changes, and error paths before claiming completion.

## Review checklist

- One primary action per section; destructive actions are visually distinct.
- Labels describe outcome, not implementation details.
- Loading states preserve layout and prevent duplicate requests.
- Remote requests have allowlisted destinations, timeouts, and a user-visible fallback.
- New dependencies and third-party scripts have a documented purpose and permission boundary.

License: MIT. See the repository root `LICENSE`.
