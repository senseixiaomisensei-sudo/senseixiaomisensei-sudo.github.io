import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

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
  assert.match(page, /media-src 'self' blob:[^;]*https:\/\/postprep-text-gateway\.postprep\.workers\.dev/);
  assert.match(page, /media-src[^;]*https:\/\/postprep-ae6\.pages\.dev/);
  assert.match(page, /assets\/rvc\.css/);

  assert.match(client, /decodeAudioData/);
  assert.match(client, /MAX_AUDIO_BYTES/);
  assert.match(client, /MediaRecorder/);
  assert.match(client, /getUserMedia/);
  assert.match(client, /loadModelAuto/);
  assert.match(client, /runWebRvcInference/);
  assert.match(client, /function cloudUploadProgress\(evt, startedAt = Date\.now\(\)\)/u);
  assert.match(client, /音频已从浏览器发出/u);
  assert.match(client, /等待云端接收确认/u);
  assert.match(client, /等待服务端完成响应，不虚报百分比/u);
  assert.match(client, /xhr\.status === 0/u);
  assert.match(client, /xhr\.onabort = rejectNetworkFailure/u);
  assert.match(client, /RVC_NETWORK_INTERRUPTED/u);
  assert.match(client, /error\.retryable = attempt < 2/u);
  assert.match(client, /body\.set\("model_id", selectedModel\.id\)/u);
  assert.match(client, /body\.set\("index_rate"/u);
  assert.match(client, /body\.set\("f0_method", "auto"\)/u);
  assert.match(client, /body\.set\("rms_mix_rate"/u);
  assert.match(client, /body\.set\("filter_radius"/u);
  assert.doesNotMatch(client, /正在上传音频… \$\{pct\}%/u);
  assert.doesNotMatch(client, /RVC_INFERENCE_TOKEN/);
  assert.doesNotMatch(client, /api\.github\.com/);
  assert.doesNotMatch(client, /I HAVE THE RIGHTS/);

  assert.match(config, /POSTPREP_RVC_API_ENDPOINT = "https:\/\/postprep-ae6\.pages\.dev\/rvc-api"/u);
  assert.match(config, /POSTPREP_RVC_STATUS_ENDPOINT = "https:\/\/postprep-ae6\.pages\.dev\/rvc-api\/status"/u);
  assert.match(config, /POSTPREP_RVC_MODELS_ENDPOINT = "https:\/\/postprep-ae6\.pages\.dev\/rvc-api\/models"/u);
  assert.match(config, /POSTPREP_RVC_MEDIA_ENDPOINT = "https:\/\/postprep-ae6\.pages\.dev\/rvc-api\/output"/u);
  assert.doesNotMatch(config, /POSTPREP_VOICE_API_ENDPOINT/);

  const officialRoutes = Function(`"use strict"; return (${extractFunction(client, "officialRoutes")});`)();
  const pagesRoutes = officialRoutes("https://postprep-ae6.pages.dev/rvc-api");
  assert.equal(pagesRoutes.convertUrl, "https://postprep-ae6.pages.dev/rvc-api");
  assert.equal(
    pagesRoutes.outputUrl("11111111-2222-3333-8444-555555555555", "download_token"),
    "https://postprep-ae6.pages.dev/rvc-api/output/11111111-2222-3333-8444-555555555555?token=download_token",
  );
  assert.doesNotMatch(pagesRoutes.convertUrl, /\/v1\/convert$/u);
  assert.match(client, /if \(stored\) window\.localStorage\.removeItem\(RVC_ENDPOINT_STORAGE_KEY\)/u);
  assert.match(client, /CLOUD_MIN_EXPECTED_UPLOAD_BYTES_PER_SECOND = 64 \* 1024/u);
  assert.match(client, /encodeMono16kWav/u);
  assert.match(client, /formatTransferredBytes\(bytesPerSecond\)/u);
  assert.match(client, /诊断号 \$\{error\.requestId\}/u);
  assert.match(client, /createCloudRequestId/u);
  assert.match(client, /pollCloudOutput\(outputUrl, requestTimeoutMs\)/u);

  const catalogPayload = JSON.parse(catalog);
  assert.ok(Array.isArray(catalogPayload.models));
  assert.ok(catalogPayload.models.every((model) => /^[A-Za-z0-9_-]{1,64}$/u.test(model.id)));

  // The exact RVC page rule must override the global CSP and re-allow media
  // blobs plus the microphone. Cloudflare Pages did not reliably match the
  // former /rvc* wildcard for /rvc.html.
  const rvcRule = headersFile.split(/\r?\n/u).findIndex((line) => line.trim() === "/rvc.html");
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

test("GPU service pins and imports the official RVC inference source", async () => {
  const [service, runtime, requirements, dockerfile, setup] = await Promise.all([
    readFile(new URL("rvc-service/app/main.py", root), "utf8"),
    readFile(new URL("rvc-service/app/official_runtime.py", root), "utf8"),
    readFile(new URL("rvc-service/requirements.txt", root), "utf8"),
    readFile(new URL("rvc-service/Dockerfile", root), "utf8"),
    readFile(new URL("rvc-service/setup-official-rvc.ps1", root), "utf8"),
  ]);
  assert.doesNotMatch(service + requirements, /rvc_python|rvc-python/u);
  assert.match(service, /OfficialRvcModel/u);
  assert.match(runtime, /from infer\.vc\.modules import VC/u);
  assert.match(runtime, /8f2fdbf483955f924b4c87ab34919170d0b704ed/u);
  assert.match(dockerfile, /RVC_COMMIT=8f2fdbf483955f924b4c87ab34919170d0b704ed/u);
  assert.match(setup, /cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5/u);
  assert.match(setup, /6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193/u);
});

test("RVC watchdog automatically recovers the local service and public tunnel", async () => {
  const watchdog = await readFile(new URL("rvc-service/watchdog.ps1", root), "utf8");
  assert.match(watchdog, /FailureThreshold = 2/u);
  assert.match(watchdog, /postprep-ae6\.pages\.dev\/rvc-api\/status/u);
  assert.match(watchdog, /start-all\.ps1/u);
  assert.match(watchdog, /-NoWatchdog/u);
  assert.match(watchdog, /Local\\PostPrepRvcWatchdog/u);
});
