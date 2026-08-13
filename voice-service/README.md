# PostPrep protected voice service

This is the GPU-only backend for `voice-studio.html`. It is deliberately not a
browser service: it accepts one server-to-server bearer token, has no CORS
allowlist for browsers, never auto-downloads model weights, and deletes source
audio as soon as a request finishes. Generated WAV files receive a random
download token and are removed after 15 minutes by default.

## Supported tasks

- `read`: CosyVoice cross-lingual zero-shot text reading using an authorized
  reference voice. No reference transcript is required by this adapter.
- `cover`: CosyVoice voice conversion using an authorized source dry vocal and
  an authorized reference voice. It does **not** download media, split stems,
  remove accompaniment, or validate copyright ownership.

The adapter uses the Apache-2.0 CosyVoice repository at commit
`074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc`. Model weights are not bundled;
the operator must review the selected model's separate weight license before
mounting it. Do not configure a public browser-accessible inference endpoint.

## Required server environment

```text
VOICE_GATEWAY_TOKEN=<same high-entropy value as Cloudflare Pages VOICE_INFERENCE_TOKEN>
COSYVOICE_MODEL_DIR=/models/CosyVoice-300M
VOICE_OUTPUT_RETENTION_SECONDS=900
VOICE_MAX_CONCURRENCY=1
```

Build and run only in a GPU environment after the account owner authorizes its
provider and charges:

```bash
docker build -t postprep-voice:local .
docker run --rm --gpus all -p 8080:8080 \
  -e VOICE_GATEWAY_TOKEN='replace-with-a-server-secret' \
  -e COSYVOICE_MODEL_DIR=/models/CosyVoice-300M \
  -v /absolute/path/to/reviewed-model:/models/CosyVoice-300M:ro \
  postprep-voice:local
```

Put this service behind an HTTPS reverse proxy or private tunnel. Cloudflare
Pages should receive only `https://your-voice-service.example/v1/jobs` as
`VOICE_INFERENCE_URL`; browsers must only call the PostPrep Worker. Never put
`VOICE_GATEWAY_TOKEN` or `VOICE_INFERENCE_TOKEN` in a static file, a URL, or a
client-side environment variable.

## Operating constraints

- Allow only the caller's own voice, written-authorized voice, or an original
  fictional voice whose character and performance rights the caller controls.
- Reject requests without the fixed rights declaration and AI-audio disclosure.
- Keep this endpoint private from browsers; the Pages Function is the only
  intended caller.
- Source and reference audio are temporary request files. Generated files are
  temporary, token-protected downloads—not a permanent media library.
- A clean single-speaker reference helps quality but does not guarantee natural
  output or eliminate artifacts.
