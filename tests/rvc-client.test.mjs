import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("rvc page has a three-step beginner flow and no default upload path", async () => {
  const [page, client, config, catalog, headersFile] = await Promise.all([
    readFile(new URL("rvc.html", root), "utf8"),
    readFile(new URL("assets/rvc.js", root), "utf8"),
    readFile(new URL("assets/postprep-config.js", root), "utf8"),
    readFile(new URL("assets/rvc-models.json", root), "utf8"),
    readFile(new URL("_headers", root), "utf8"),
  ]);

  assert.match(page, /data-page="rvc"/);
  assert.match(page, /viewport-fit=cover/);
  assert.match(page, /id="rvc-model-gallery"/);
  assert.match(page, /id="rvc-audio-file"/);
  assert.match(page, /id="rvc-record-toggle"/);
  assert.match(page, /id="rvc-convert"[^>]*aria-describedby="rvc-service-status"/);
  assert.match(page, /id="toast"[^>]*w-\[calc\(100%-2rem\)\]/);
  assert.match(page, /media-src 'self' blob: https:\/\/postprep-text-gateway\.postprep\.workers\.dev/);
  assert.match(page, /assets\/rvc\.css/);

  assert.match(client, /decodeAudioData/);
  assert.match(client, /MAX_AUDIO_BYTES/);
  assert.match(client, /MediaRecorder/);
  assert.match(client, /getUserMedia/);
  assert.match(client, /fetchBackendModels/);
  assert.match(client, /state\.backend !== "ready"/);
  assert.match(client, /requestConversion/);
  assert.match(client, /checkAvailability\(\)/);
  assert.doesNotMatch(client, /RVC_INFERENCE_TOKEN/);
  assert.doesNotMatch(client, /api\.github\.com/);
  assert.doesNotMatch(client, /I HAVE THE RIGHTS/);

  assert.match(config, /POSTPREP_RVC_API_ENDPOINT/);
  assert.doesNotMatch(config, /POSTPREP_VOICE_API_ENDPOINT/);

  const catalogPayload = JSON.parse(catalog);
  assert.ok(Array.isArray(catalogPayload.models));
  assert.ok(catalogPayload.models.every((model) => /^[A-Za-z0-9_-]{1,64}$/u.test(model.id)));

  // The /rvc* path rule must re-allow the microphone for browser recording.
  const rvcRule = headersFile.split(/\r?\n/u).findIndex((line) => line.trim() === "/rvc*");
  assert.ok(rvcRule >= 0);
  const rvcBlock = headersFile.split(/\r?\n/u).slice(rvcRule, rvcRule + 6).join("\n");
  assert.match(rvcBlock, /microphone=\(self\)/);
  assert.match(rvcBlock, /media-src 'self' blob:/);
});

test("rvc routes are constrained to the protected gateway and a fixed backend contract", async () => {
  const [gateway, rvc, shared, workerConfig, deployment] = await Promise.all([
    readFile(new URL("worker/api-gateway.js", root), "utf8"),
    readFile(new URL("functions/api/rvc.js", root), "utf8"),
    readFile(new URL("functions/api/_rvc-shared.js", root), "utf8"),
    readFile(new URL("worker/wrangler.toml", root), "utf8"),
    readFile(new URL("docs/RVC_DEPLOYMENT.md", root), "utf8"),
  ]);

  assert.match(gateway, /POSTPREP_RVC_RATE_LIMITER/);
  assert.match(gateway, /POSTPREP_RVC_UPSTREAM_URL/);
  assert.match(gateway, /MAX_RVC_UPLOAD_BYTES/);
  assert.match(gateway, /rvc-output/);
  assert.match(gateway, /\/rvc\/models/);
  assert.doesNotMatch(gateway, /\/voice\//);
  assert.match(rvc, /RVC_INVALID_MODEL/);
  assert.match(rvc, /modelId/);
  assert.match(rvc, /RVC_BACKEND_NOT_CONFIGURED/);
  assert.doesNotMatch(rvc, /turnstile/i);
  assert.doesNotMatch(rvc, /fetch\(.*body\.url/s);
  assert.match(shared, /url\.protocol !== "https:"/);
  assert.match(shared, /url\.pathname !== "\/v1\/convert"/);
  assert.match(workerConfig, /POSTPREP_RVC_RATE_LIMITER/);
  assert.doesNotMatch(workerConfig, /VOICE/);
  assert.match(deployment, /不会把音频发送到一个空地址/);
});
