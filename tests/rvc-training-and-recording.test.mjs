import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("recording negotiates browser formats and keeps a PCM WAV fallback", async () => {
  const client = await readFile(new URL("assets/rvc.js", root), "utf8");
  assert.match(client, /MediaRecorder\.isTypeSupported/u);
  assert.match(client, /audio\/webm;codecs=opus/u);
  assert.match(client, /audio\/mp4/u);
  assert.match(client, /startPcmRecorder/u);
  assert.match(client, /encodePcmWav/u);
  assert.match(client, /fallbackDuration/u);
  assert.match(client, /microphoneStream/u);
});

test("extreme-input protection is conditional and leaves the normal path intact", async () => {
  const service = await readFile(new URL("rvc-service/app/main.py", root), "utf8");
  assert.match(service, /class AudioProfile/u);
  assert.match(service, /def analyze_audio_profile/u);
  assert.match(service, /if not profile\.high_energy:\s+return input_wav/u);
  assert.match(service, /HIGH_ENERGY_INPUT_FILTER/u);
  assert.match(service, /HIGH_ENERGY_OUTPUT_FILTER/u);
  assert.match(service, /PITCH_COMPLEX_OUTPUT_FILTER/u);
  assert.match(service, /profile\.high_pitch and not profile\.complex_pitch/u);
  assert.match(service, /index_rate=min\(index_rate, 0\.22\) if profile\.high_energy else min\(index_rate, 0\.26\) if profile\.high_pitch or profile\.complex_pitch else index_rate/u);
  assert.match(service, /protect=min\(protect, 0\.18\) if profile\.high_energy or profile\.high_pitch or profile\.complex_pitch else protect/u);
  assert.match(service, /rms_mix_rate=min\(rms_mix_rate, 0\.90\) if profile\.high_energy or profile\.high_pitch or profile\.complex_pitch else rms_mix_rate/u);
});

test("training UI uploads multiple authorized clips and separates trained models", async () => {
  const [page, client] = await Promise.all([
    readFile(new URL("rvc.html", root), "utf8"),
    readFile(new URL("assets/rvc.js", root), "utf8"),
  ]);
  assert.match(page, /id="rvc-training-files"[^>]*multiple/u);
  assert.match(page, /id="rvc-training-name"/u);
  assert.match(page, /id="rvc-training-collection"/u);
  assert.match(page, /id="rvc-training-consent"/u);
  assert.match(page, /id="rvc-trained-model-gallery"/u);
  assert.match(client, /function trainingRoutes/u);
  assert.match(client, /uploadWithRetry/u);
  assert.match(client, /postprep_rvc_training_job_v1/u);
  assert.match(client, /model\.trained === true/u);
  assert.match(client, /initBody\.set\("collection_name", collectionName\)/u);
  assert.match(client, /function renderCollectionNav/u);
  assert.match(client, /function renderModelCards/u);
  assert.match(client, /function trainedCollectionId/u);
  assert.match(client, /escapeHtml/u);
});

test("training service follows the pinned official RVC v2 pipeline", async () => {
  const [service, runtime, proxy] = await Promise.all([
    readFile(new URL("rvc-service/app/main.py", root), "utf8"),
    readFile(new URL("rvc-service/app/training_runtime.py", root), "utf8"),
    readFile(new URL("rvc-service/tunnel_proxy.py", root), "utf8"),
  ]);
  assert.match(service, /@app\.post\("\/v1\/training\/init"\)/u);
  assert.match(service, /@app\.post\("\/v1\/training\/\{job_id\}\/audio\/\{slot\}"\)/u);
  assert.match(service, /@app\.post\("\/v1\/training\/\{job_id\}\/start"\)/u);
  assert.match(service, /@app\.get\("\/v1\/training\/\{job_id\}"\)/u);
  assert.match(runtime, /train\/preprocess\.py/u);
  assert.match(runtime, /train\/dataset\/extract_f0\.py/u);
  assert.match(runtime, /train\/dataset\/extract_hubert_feature\.py/u);
  assert.match(runtime, /train\/train\.py/u);
  assert.match(runtime, /train\/train_index\.py/u);
  assert.match(runtime, /TRAIN_VERSION = "v2"/u);
  assert.match(runtime, /"collectionName": collection_name/u);
  assert.match(service, /collection_name: str = Form\("我的训练模型"\)/u);
  assert.match(proxy, /TRAIN_UPLOAD_RE/u);
  assert.match(proxy, /MAX_TTS_BODY_BYTES = 8 \* 1024/u);
  assert.match(proxy, /expected_type = "application\/json"/u);
});

test("the protected worker exposes only constrained training routes", async () => {
  const [gateway, config] = await Promise.all([
    readFile(new URL("worker/api-gateway.js", root), "utf8"),
    readFile(new URL("worker/wrangler.toml", root), "utf8"),
  ]);
  assert.match(gateway, /\/rvc\/train\/init/u);
  assert.match(gateway, /trainUploadMatch/u);
  assert.match(gateway, /INVALID_RVC_TRAINING_TOKEN/u);
  assert.match(gateway, /MAX_RVC_TRAIN_UPLOAD_BYTES/u);
  assert.match(config, /POSTPREP_RVC_TRAIN_RATE_LIMITER/u);
});
