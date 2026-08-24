# PostPrep RVC voice-changer service

GPU-only backend for `rvc.html`. It is deliberately not a browser service: it
accepts one server-to-server bearer token, has no browser CORS, never
auto-downloads model weights, and deletes source audio as soon as a request
finishes. Generated files receive a random download token and are removed
after 15 minutes by default.

## Supported task

- Voice conversion uses the upstream
  [RVC-Project/Retrieval-based-Voice-Conversion-WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)
  inference source pinned to tag `2.3.260718`, commit
  `8f2fdbf483955f924b4c87ab34919170d0b704ed`. The path is the upstream
  HuBERT/ContentVec extractor, RMVPE/FCPE/PM F0, FAISS Top-8 retrieval and
  PyTorch NSF generator—not the previous browser ONNX approximation and not
  the `rvc-python` wrapper.
- User-authorized training follows the same pinned upstream's RVC v2 40 kHz
  pipeline: preprocessing, RMVPE F0, HuBERT features, pretrained G/D fine
  tuning, and FAISS index construction. Training audio is removed when the
  task completes, fails, or is cancelled.

## Required server environment

```text
RVC_GATEWAY_TOKEN=<same high-entropy value as Cloudflare Pages RVC_INFERENCE_TOKEN>
RVC_MODELS_DIR=/models/rvc
RVC_OFFICIAL_ROOT=/opt/rvc-official
RVC_OUTPUT_RETENTION_SECONDS=900
RVC_MAX_CONCURRENCY=1
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
  "tags": ["女声", "甜美"],
  "license": "SPDX identifier or exact model terms",
  "source": "https://exact-source-page.example/model",
  "modelVersion": "source commit or SHA-256"
}
```

Flat files (`/models/rvc/sweet-female.pth` + `sweet-female.index`) also work.
Never commit model weights to this repository; mount them on the GPU host.
The static showcase list at `assets/rvc-models.json` is only an offline display
catalog. Public conversion uses only the live `/v1/models` response. A public
download page or a generic `License: other` label is not proof that a character
or performer's voice can be redistributed or used for impersonation.

## Build and run (GPU host only)

```bash
docker build -t postprep-rvc:local .
docker run --rm --gpus all -p 8080:8080 \
  -e RVC_GATEWAY_TOKEN='replace-with-a-server-secret' \
  -v /absolute/path/to/models:/models/rvc:rw \
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
| POST | `/v1/training/init` | create a named, token-protected training job |
| POST | `/v1/training/{job_id}/audio/{slot}?token=...` | upload one training clip |
| POST | `/v1/training/{job_id}/start?token=...` | start the pinned RVC v2 pipeline |
| GET | `/v1/training/{job_id}?token=...` | poll training status |
| POST | `/v1/training/{job_id}/cancel?token=...` | safely stop a training job |

## Operating constraints

- Audio is temporary request data; generated files are short-lived,
  token-protected downloads — not a permanent media library.
- The gateway token must be at least 32 characters; the service refuses to
  start without it and a readable models directory.
- Model weight licensing is the operator's responsibility. Record an exact
  source URL, revision/hash and the model-specific terms before mounting it.
- Only one GPU training job runs at a time. Conversion returns a structured
  `RVC_TRAINING_ACTIVE` response during the explicit training window instead
  of competing for VRAM and crashing both workloads.
