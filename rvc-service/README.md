# PostPrep RVC voice-changer service

GPU-only backend for `rvc.html`. It is deliberately not a browser service: it
accepts one server-to-server bearer token, has no browser CORS, never
auto-downloads model weights, and deletes source audio as soon as a request
finishes. Generated files receive a random download token and are removed
after 15 minutes by default.

## Supported task

- Voice conversion with [RVC](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)
  via the MIT-licensed [`rvc-python`](https://github.com/daswer123/rvc-python)
  inference wrapper: pick a mounted model, convert one uploaded/recorded audio
  file with pitch, index rate, protect, filter radius, resample rate, RMS mix
  rate and f0-method controls. Output is WAV or MP3.

## Required server environment

```text
RVC_GATEWAY_TOKEN=<same high-entropy value as Cloudflare Pages RVC_INFERENCE_TOKEN>
RVC_MODELS_DIR=/models/rvc
RVC_OUTPUT_RETENTION_SECONDS=900
RVC_MAX_CONCURRENCY=1
RVC_DEVICE=auto            # auto picks cuda:0 when available
```

## Adding character voices (models)

Drop RVC model files into `RVC_MODELS_DIR` and restart the container. Every
`.pth` becomes a selectable voice on the website automatically:

```text
/models/rvc/
  sweet-female/
    model.pth          # required
    model.index        # optional, improves similarity
    meta.json          # optional display metadata
```

`meta.json` (optional):

```json
{
  "name": "甜美少女",
  "emoji": "🎀",
  "description": "甜美的少女音色。",
  "tags": ["女声", "甜美"]
}
```

Flat files (`/models/rvc/sweet-female.pth` + `sweet-female.index`) also work.
Never commit model weights to this repository; mount them on the GPU host.
The static showcase list at `assets/rvc-models.json` is only a display
catalog — the website merges it with the live `/v1/models` response.

## Build and run (GPU host only)

```bash
docker build -t postprep-rvc:local .
docker run --rm --gpus all -p 8080:8080 \
  -e RVC_GATEWAY_TOKEN='replace-with-a-server-secret' \
  -v /absolute/path/to/models:/models/rvc:ro \
  postprep-rvc:local
```

Put this service behind an HTTPS reverse proxy or private tunnel. Cloudflare
Pages should receive only `https://your-rvc-service.example/v1/convert` as
`RVC_INFERENCE_URL`; browsers must only call the PostPrep Worker. Never put
`RVC_GATEWAY_TOKEN` or `RVC_INFERENCE_TOKEN` in a static file, a URL, or a
client-side environment variable.

## API

All endpoints require `Authorization: Bearer <RVC_GATEWAY_TOKEN>`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/healthz` | readiness probe |
| GET | `/v1/models` | list mounted models |
| POST | `/v1/convert` | multipart: `model_id`, `audio`, `pitch`, `index_rate`, `protect`, `filter_radius`, `resample`, `rms_mix_rate`, `f0_method`, `format`, `language` |
| GET | `/v1/output/{job_id}?token=...` | download a generated file |

## Operating constraints

- Audio is temporary request data; generated files are short-lived,
  token-protected downloads — not a permanent media library.
- The gateway token must be at least 32 characters; the service refuses to
  start without it and a readable models directory.
- Model weight licensing is the operator's responsibility. Review each
  model's license before mounting it.
