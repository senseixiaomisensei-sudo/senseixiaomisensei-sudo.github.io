import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("V1 collection navigation filters one collection and persists custom training areas", async () => {
  const [page, client] = await Promise.all([
    readFile(new URL("rvc.html", root), "utf8"),
    readFile(new URL("assets/rvc.js", root), "utf8"),
  ]);
  assert.match(page, /版本 V1（分区导航 \+ 伴奏翻唱）/u);
  assert.match(page, /id="rvc-collection-nav"[^>]*role="tablist"/u);
  assert.match(page, /id="rvc-create-collection-form"/u);
  assert.match(page, /id="rvc-create-collection-name"[^>]*maxlength="30"/u);
  assert.match(client, /String\(m\.collectionId \|\| "other"\) !== state\.activeCollectionId/u);
  assert.match(client, /state\.activeCollectionId = collection\.id/u);
  assert.match(client, /state\.customCollections\.push\(name\)/u);
  assert.match(client, /window\.localStorage\.setItem\(COLLECTION_STORAGE_KEY/u);
  assert.match(client, /trainingCollection\.value = name/u);
});

test("song mode is an additive PyMSS separation, RVC vocal conversion and backing remix path", async () => {
  const [page, client, gateway, service, separation, worker, requirements, setup] = await Promise.all([
    readFile(new URL("rvc.html", root), "utf8"),
    readFile(new URL("assets/rvc.js", root), "utf8"),
    readFile(new URL("functions/api/rvc.js", root), "utf8"),
    readFile(new URL("rvc-service/app/main.py", root), "utf8"),
    readFile(new URL("rvc-service/app/separation_runtime.py", root), "utf8"),
    readFile(new URL("rvc-service/app/separation_worker.py", root), "utf8"),
    readFile(new URL("rvc-service/requirements.txt", root), "utf8"),
    readFile(new URL("rvc-service/setup-official-rvc.ps1", root), "utf8"),
  ]);
  assert.match(page, /id="rvc-audio-mode-song"/u);
  assert.match(page, /云端先分离人声，只变人声，再与原伴奏回混/u);
  assert.match(client, /if \(audioMode === "song"\)[\s\S]*preservesMix: true/u);
  assert.match(client, /body\.set\("audioMode", state\.audioMode\)/u);
  assert.match(client, /body\.set\("audio_mode", state\.audioMode\)/u);
  assert.match(gateway, /ALLOWED_AUDIO_MODES = new Set\(\["voice", "song"\]\)/u);
  assert.match(gateway, /upstreamBody\.set\("audio_mode", audioMode\)/u);
  assert.match(service, /audio_mode: str = Form\("voice"\)/u);
  assert.match(service, /if audio_mode == "song":/u);
  assert.match(service, /separate_song, input_raw/u);
  assert.match(service, /render_duration_safe_conversion_async\([\s\S]*separated_vocals,[\s\S]*converted_vocals/u);
  assert.match(service, /remix_song,/u);
  assert.match(separation, /model_bs_roformer_ep_368_sdr_12\.9628\.ckpt/u);
  assert.match(separation, /amix=inputs=2:duration=first/u);
  assert.match(worker, /separator\.separate\(mix, pbar=False\)/u);
  assert.match(worker, /find_stem\(results, "vocals"\)/u);
  assert.match(requirements, /pymss==2\.0\.14/u);
  assert.match(requirements, /pymss-core==0\.1\.4/u);
  assert.match(setup, /f6c94864adfb73bbb0ca58ec14d58dd0b364549e9fb61433ae51916f3e2f8d0b/u);
});

test("long audio uses a separate resilient contract without changing short conversion", async () => {
  const [client, service, gateway, page] = await Promise.all([
    readFile(new URL("assets/rvc.js", root), "utf8"),
    readFile(new URL("rvc-service/app/main.py", root), "utf8"),
    readFile(new URL("worker/api-gateway.js", root), "utf8"),
    readFile(new URL("rvc.html", root), "utf8"),
  ]);
  assert.match(client, /LONG_AUDIO_THRESHOLD_SECONDS = 45/u);
  assert.match(client, /DEVICE_FALLBACK_MAX_AUDIO_SECONDS = 300/u);
  assert.match(client, /runOfficialRvcInference\(\{ allowDeviceFallback: true \}\)/u);
  assert.match(client, /MAX_AUDIO_SECONDS = 600/u);
  assert.match(client, /DURABLE_CLOUD_JOB_SECONDS = 40/u);
  assert.match(client, /if \(Number\(durationSeconds\) >= DURABLE_CLOUD_JOB_SECONDS\) return "mp3"/u);
  assert.match(client, /structuredCode[\s\S]*longJob && TRANSIENT_CLOUD_OUTPUT_CODES\.has/u);
  assert.match(client, /maxTransientFailures = longJob \? 30 : 4/u);
  assert.match(client, /结果下载中断，正在从已完成任务重新拉取/u);
  assert.match(service, /MAX_AUDIO_SECONDS = 600/u);
  assert.match(service, /OUTPUT_RETENTION_SECONDS = max\(900,[\s\S]*"7200"/u);
  assert.match(service, /record\.state not in \{"queued", "processing"\}/u);
  assert.match(service, /record\.stage = "encoding"/u);
  assert.match(service, /LONG_AUDIO_THRESHOLD_SECONDS = 20/u);
  assert.match(service, /LONG_CHUNK_SECONDS = 20/u);
  assert.match(service, /LONG_CHUNK_CROSSFADE_SECONDS = 0\.5/u);
  assert.match(service, /chunk_count = max\([\s\S]*math\.ceil/u);
  assert.match(service, /chunk_duration = \([\s\S]*duration_seconds \+ LONG_CHUNK_CROSSFADE_SECONDS/u);
  assert.match(service, /def render_duration_safe_conversion\(/u);
  assert.match(service, /async def render_duration_safe_conversion_async\(/u);
  assert.match(service, /for index, source_chunk in enumerate\(source_chunks\):[\s\S]*async with inference_lock:[\s\S]*await asyncio\.sleep\(0\)/u);
  assert.match(service, /if duration_seconds > LONG_AUDIO_THRESHOLD_SECONDS:[\s\S]*release_cached_models/u);
  assert.match(service, /acrossfade=d=\{LONG_CHUNK_CROSSFADE_SECONDS\}/u);
  assert.match(gateway, /id: "rvc-output"[\s\S]*skipRateLimit: true/u);
  assert.match(page, /最长 10 分钟/u);
});
