import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const workerSource = await readFile(
  new URL("assets/rvc-engine/inference.worker.js", root),
  "utf8",
);

function extractFunction(name) {
  const marker = `function ${name}`;
  const start = workerSource.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const bodyStart = workerSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < workerSource.length; index += 1) {
    if (workerSource[index] === "{") depth += 1;
    if (workerSource[index] === "}") {
      depth -= 1;
      if (depth === 0) return workerSource.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

function evaluateFunction(name, dependencyNames = [], dependencyValues = []) {
  const source = extractFunction(name);
  return Function(...dependencyNames, `"use strict"; return (${source});`)(...dependencyValues);
}

function maxAbs(values) {
  let peak = 0;
  for (const value of values) peak = Math.max(peak, Math.abs(value));
  return peak;
}

function sine(length, amplitude, cycles = 100) {
  return Float32Array.from(
    { length },
    (_, index) => amplitude * Math.sin((2 * Math.PI * cycles * index) / length),
  );
}

test("RVC keeps ordinary input level and applies the shout guard before peak protection", () => {
  const conditionInputAudio = evaluateFunction("conditionInputAudio");
  const ordinary = conditionInputAudio(sine(16000, 0.1), 16000);
  assert.ok(maxAbs(ordinary) > 0.07);
  assert.ok(maxAbs(ordinary) < 0.13);

  const overRange = conditionInputAudio(sine(16000, 1.4), 16000);
  assert.ok(maxAbs(overRange) <= 0.901);
  assert.ok(maxAbs(overRange) > 0.7);
  const sustainedPeak = maxAbs(overRange.subarray(4000));
  assert.ok(sustainedPeak < 0.86, "sustained shouted audio should be gently contained");
});

test("shout F0 repair only removes isolated octave errors", () => {
  const hasShoutDynamics = evaluateFunction("hasShoutDynamics");
  const repairIsolatedShoutF0Errors = evaluateFunction("repairIsolatedShoutF0Errors");
  assert.equal(hasShoutDynamics(sine(16000, 0.1)), false);
  assert.equal(hasShoutDynamics(sine(16000, 0.8)), true);
  const contour = Float32Array.from([220, 222, 440, 224, 226, 300, 380, 480]);
  const repaired = repairIsolatedShoutF0Errors(contour);
  assert.ok(repaired[2] > 220 && repaired[2] < 230, "isolated octave hop should be repaired");
  assert.equal(repaired[5], 300, "sustained pitch motion must remain untouched");
  assert.equal(repaired[6], 380, "sustained pitch motion must remain untouched");
});

test("RMS mix follows official semantics: 1 is unchanged and 0 follows source", () => {
  const applyRmsVolumeEnvelope = evaluateFunction("applyRmsVolumeEnvelope");
  const source = sine(3200, 0.1, 20);
  const synth = sine(8000, 0.5, 50);

  assert.equal(applyRmsVolumeEnvelope(source, synth, 1, 40000), synth);
  const followed = applyRmsVolumeEnvelope(source, synth, 0, 40000);
  assert.notEqual(followed, synth);
  assert.ok(maxAbs(followed.subarray(800, 6000)) < maxAbs(synth.subarray(800, 6000)));
});

test("transparent output safety gain does not colour normal audio", () => {
  const normalizeOutputPeak = evaluateFunction("normalizeOutputPeak");
  const ordinary = sine(4000, 0.4, 25);
  const original = new Float32Array(ordinary);
  assert.equal(normalizeOutputPeak(ordinary), ordinary);
  assert.deepEqual(ordinary, original);

  const loud = sine(4000, 1.3, 25);
  loud[7] = Number.NaN;
  normalizeOutputPeak(loud);
  assert.equal(loud[7], 0);
  assert.ok(maxAbs(loud) <= 0.951);
});

test("RMVPE salience decoder supports class-last and class-first tensors", () => {
  const rmvpeParams = {
    nClass: 360,
    centsPerBin: 20,
    centsOffset: 1997.379408437619,
  };
  const decodeSalienceToF0 = evaluateFunction(
    "decodeSalienceToF0",
    ["RMVPE_PARAMS"],
    [rmvpeParams],
  );
  const frameCount = 2;
  const peaks = [80, 170];
  const classLast = new Float32Array(frameCount * rmvpeParams.nClass);
  const classFirst = new Float32Array(frameCount * rmvpeParams.nClass);
  for (let frame = 0; frame < frameCount; frame += 1) {
    classLast[frame * rmvpeParams.nClass + peaks[frame]] = 1;
    classFirst[peaks[frame] * frameCount + frame] = 1;
  }
  const lastResult = decodeSalienceToF0(classLast, frameCount, 0.03, false);
  const firstResult = decodeSalienceToF0(classFirst, frameCount, 0.03, true);
  assert.deepEqual(firstResult, lastResult);
  assert.ok(lastResult.every((value) => value > 0));
});

test("RVC page starts neutral and public voices prefer the cloud engine", async () => {
  const [page, client, runtime, service] = await Promise.all([
    readFile(new URL("rvc.html", root), "utf8"),
    readFile(new URL("assets/rvc.js", root), "utf8"),
    readFile(new URL("assets/rvc-engine/rvc-web-runtime.js", root), "utf8"),
    readFile(new URL("rvc-service/app/main.py", root), "utf8"),
  ]);

  assert.match(page, /id="rvc-pitch"[^>]*value="0"/u);
  assert.match(page, /id="rvc-protect"[^>]*value="0\.25"/u);
  assert.match(page, /id="rvc-preset-same"[^>]*aria-pressed="true"/u);
  assert.match(page, /id="rvc-preset-male-female"[^>]*aria-pressed="false"/u);
  assert.doesNotMatch(page, /value="crepe"|value="fcpe"|value="harvest"/u);
  assert.doesNotMatch(client, /pitchInput\.value = String\(model\.defaultPitch\)/u);
  assert.doesNotMatch(workerSource, /filteredF0 = stabilizeShoutingPitchF0/u);
  assert.match(workerSource, /hasShoutDynamics\(audio\) \? repairIsolatedShoutF0Errors\(f0\) : f0/u);
  assert.doesNotMatch(workerSource, /finalAudio = applyHarmonicAirAndWarmth/u);
  assert.match(workerSource, /finalAudio = normalizeOutputPeak\(finalAudio\)/u);
  assert.match(page, /assets\/rvc\.js\?v=20260826-stability-r1/u);
  assert.match(client, /rvc-filter-radius"\)\?\.value \|\| "0"/u);
  assert.match(client, /function runOfficialRvcInference\(\{ allowDeviceFallback = false \} = \{\}\)/u);
  assert.match(client, /function runWebRvcInference\(\{ allowLong = false, fallback = false \} = \{\}\)/u);
  assert.match(client, /OFFICIAL_RVC_STATUS_ENDPOINT/u);
  assert.match(client, /OFFICIAL_RVC_MODELS_ENDPOINT/u);
  assert.match(client, /function officialRoutes\(endpoint\)/u);
  assert.match(client, /convertUrl: base/u);
  assert.match(client, /DEVICE_FALLBACK_MAX_AUDIO_SECONDS = 180/u);
  assert.match(client, /isDeviceFallbackEligible/u);
  assert.match(client, /runOfficialRvcInference\(\{ allowDeviceFallback: true \}\)/u);
  assert.match(client, /runWebRvcInference\(\{ allowLong: true, fallback: true \}\)/u);
  assert.match(client, /const LOCAL_MAX_AUDIO_SECONDS = 20/u);
  assert.match(client, /const MAX_AUDIO_SECONDS = 600/u);
  assert.match(client, /const LONG_AUDIO_THRESHOLD_SECONDS = 45/u);
  assert.match(client, /state\.audio\.duration > DEVICE_FALLBACK_MAX_AUDIO_SECONDS/u);
  assert.match(client, /localTimeoutMs/u);
  assert.match(client, /postprep_rvc_inference_mode_v32/u);
  assert.match(client, /CLOUD_STATUS_TIMEOUT_MS = 15000/u);
  assert.match(client, /CLOUD_CONVERT_TIMEOUT_MS = 220000/u);
  assert.match(client, /CLOUD_MAX_CONVERT_TIMEOUT_MS = 600000/u);
  assert.match(client, /function prepareCloudUploadAudio\(audio, audioMode = "voice"\)/u);
  assert.match(client, /function cloudRequestTimeoutMs\(fileSize, durationSeconds, audioMode = "voice"\)/u);
  assert.match(client, /function pollCloudOutput\(url, timeoutMs, longJob = false\)/u);
  assert.match(client, /function downloadLongCloudOutput\(url, firstResponse, format, timeoutMs\)/u);
  assert.match(client, /CLOUD_MAX_LONG_JOB_TIMEOUT_MS = 45 \* 60 \* 1000/u);
  assert.match(client, /body\.set\("requestId", cloudRequestId\)/u);
  assert.match(client, /function cloudRvcFailureMessage\(error\)/u);
  assert.match(client, /error\.code = errCode/u);
  assert.doesNotMatch(client, /云端 RVC 引擎暂未完成本次请求，请重试/u);
  assert.doesNotMatch(client, /官方 RVC GPU 服务暂不可用/u);
  assert.match(client, /OWN_MODEL_PREFIX/u);
  assert.match(workerSource, /extractHubertFeatures[\s\S]*?normalize: false/u);
  assert.match(workerSource, /processAudioInFixedFrameWindows/u);
  assert.match(workerSource, /frameCount: 100/u);
  assert.match(workerSource, /maxFrames: chunkingConfig\.frameCount/u);
  assert.doesNotMatch(workerSource, /extractHubertFeatures[\s\S]{0,180}?normalize: true/u);
  assert.match(workerSource, /fMin: 30,/u);
  assert.match(workerSource, /2595 \* Math\.log10\(1 \+ hz \/ 700\)/u);
  assert.match(workerSource, /medianFilterEnabled = options\.medianFilter === true/u);
  assert.match(client, /v=20260826-v38/u);
  assert.match(client, /function preferredCloudOutputFormat\(durationSeconds = 0\)/u);
  assert.match(client, /MOBILE_AUDIO_USER_AGENT/u);
  assert.match(client, /body\.set\("format", outputFormat\)/u);
  assert.match(client, /body\.set\("f0Method", "auto"\)/u);
  assert.match(client, /body\.set\("f0_method", "auto"\)/u);
  assert.match(client, /normalizeCloudAudioBlob\(await outputResponse\.blob\(\), outputFormat\)/u);
  assert.match(runtime, /v=20260826-v38/u);
  assert.match(runtime, /typeof rawWasm === "string"/u);
  assert.match(client, /ort-wasm-simd-threaded\.asyncify\.mjs/u);
  assert.match(client, /ort-wasm-simd-threaded\.asyncify\.wasm/u);
  assert.match(client, /CHARACTER_MODEL_ASSET_VERSION = "20260824-v34"/u);
  assert.match(client, /function officialMediaUrl\(jobId, token\)/u);
  assert.match(client, /await attachResultAudio\(resultAudio, mediaUrl \|\| state\.resultUrl, Boolean\(mediaUrl\)\)/u);
  assert.match(page, /media-src[^;"]*https:\/\/postprep-ae6\.pages\.dev/u);
  assert.match(client, /characterModelCacheKey\(selectedModel\)/u);
  assert.match(client, /chunks\.map\(versionCharacterChunkPath\)/u);
  assert.match(page, /id="rvc-index-rate"[^>]*value="0\.3"/u);
  assert.doesNotMatch(page, /<div hidden>[\s\S]{0,240}?id="rvc-index-rate"/u);
  assert.match(client, /deriveStableNoiseSeed\(freshAudioInput, selectedModel\.id\)/u);
  assert.match(client, /indexRate: indexRateVal/u);
  assert.match(service, /adeclick=threshold=2\.5:burst=2/u);
  assert.match(service, /afftdn=nr=6:nf=-55:tn=1:ad=0\.8/u);
  assert.match(service, /speechnorm=p=0\.88:e=3:c=2/u);
  assert.match(service, /def select_f0_method\(/u);
  assert.match(service, /methods\.append\("fcpe" if selected_method == "rmvpe" else "rmvpe"\)/u);
  assert.match(service, /return used_method/u);
  assert.match(service, /async def process_conversion_job\(/u);
  assert.match(service, /record\.state = "processing"/u);
  assert.match(service, /status_code=202/u);
  assert.match(service, /MAX_AUDIO_SECONDS = 600/u);
  assert.match(service, /record\.state not in \{"queued", "processing"\}/u);
  assert.match(service, /record\.expires_at = job_expiry\(\)/u);
  assert.match(service, /SHOUT_HARSHNESS_GUARD_MODELS = frozenset\(\{"midori", "mika", "shiroko", "toki", "yuzu"\}\)/u);
  assert.match(service, /lowpass=f=10000:p=2/u);
});

test("all deployed character models expose caller-controlled noise without hidden random operators", async () => {
  const catalog = JSON.parse(await readFile(new URL("assets/rvc-models.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("models/manifest.json", root), "utf8"));
  assert.equal(catalog.models.length, 25);
  assert.ok(catalog.models.some((model) => model.id === "momoi"));
  assert.ok(catalog.models.some((model) => model.id === "reisa"));
  for (const model of catalog.models) {
    let hasRndInput = false;
    let hasSourceNoiseInput = false;
    let totalSize = 0;
    const hash = createHash("sha256");
    for (const chunkPath of model.chunks) {
      const chunk = await readFile(new URL(chunkPath, root));
      totalSize += chunk.length;
      hash.update(chunk);
      hasRndInput ||= chunk.includes(Buffer.from("rnd"));
      hasSourceNoiseInput ||= chunk.includes(Buffer.from("source_noise"));
      assert.equal(chunk.includes(Buffer.from("RandomNormalLike")), false, `${model.id} contains hidden Gaussian randomness`);
      assert.equal(chunk.includes(Buffer.from("RandomUniformLike")), false, `${model.id} contains hidden phase randomness`);
    }
    assert.equal(hasRndInput, true, `${model.id} is missing rnd input`);
    assert.equal(hasSourceNoiseInput, true, `${model.id} is missing source_noise input`);
    const manifestEntry = Object.values(manifest).find((entry) => entry.chunks?.[0] === model.chunks[0]);
    assert.ok(manifestEntry, `${model.id} missing manifest entry`);
    assert.equal(totalSize, manifestEntry.totalSize, `${model.id} manifest size`);
    assert.equal(hash.digest("hex"), manifestEntry.sha256, `${model.id} manifest hash`);
    const retrieval = await readFile(new URL(model.retrieval, root));
    assert.equal(retrieval.subarray(0, 4).toString("ascii"), "PPRI", `${model.id} retrieval header`);
  }
});

test("v24 exporter exposes both latent and NSF excitation noise", async () => {
  const source = await readFile(new URL("tools/export-rvc-explicit-noise.py", root), "utf8");
  assert.match(source, /z_p = \(m_p \+ torch\.exp\(logs_p\) \* rnd\) \* x_mask/u);
  assert.match(source, /source_noise/u);
  assert.doesNotMatch(source, /torch\.randn_like/u);
});

test("continuous F0 is not flattened while the coarse embedding stays bounded", () => {
  const applyPitchShift = evaluateFunction("applyPitchShift");
  const shifted = applyPitchShift(Float32Array.from([0, 30, 550, 900]), 12);
  assert.equal(shifted[0], 0);
  assert.equal(shifted[1], 60);
  assert.equal(shifted[2], 1100);
  assert.equal(shifted[3], 1800);

  const buildQuantizedPitch = evaluateFunction(
    "buildQuantizedPitch",
    ["F0_MEL_MIN", "F0_MEL_MAX"],
    [1127 * Math.log(1 + 50 / 700), 1127 * Math.log(1 + 1100 / 700)],
  );
  assert.deepEqual([...buildQuantizedPitch(shifted, shifted.length)], [1n, 5n, 255n, 255n]);
});

test("seeded synthesis noise is finite and exactly reproducible", () => {
  const createSeededRandom = evaluateFunction("createSeededRandom");
  const fillSeededGaussian = evaluateFunction(
    "fillSeededGaussian",
    ["createSeededRandom"],
    [createSeededRandom],
  );
  const first = fillSeededGaussian(new Float32Array(128), 12345, 0.5);
  const repeat = fillSeededGaussian(new Float32Array(128), 12345, 0.5);
  const other = fillSeededGaussian(new Float32Array(128), 12346, 0.5);
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, other);
  assert.equal(first.every(Number.isFinite), true);
});

test("retrieval codebook blends voiced frames and protects unvoiced consonants", () => {
  const applyRetrievalCodebook = evaluateFunction("applyRetrievalCodebook");
  const features = {
    hiddenStates: new Float32Array(4),
    featureSize: 2,
    upsampledFrameCount: 2,
  };
  const codebook = { count: 1, dimension: 2, centers: Float32Array.from([2, 4]) };
  const voiced = applyRetrievalCodebook(features, Float32Array.from([200, 200]), codebook, 0.5, 0.33);
  const unvoiced = applyRetrievalCodebook(features, Float32Array.from([0, 0]), codebook, 0.5, 0.33);
  const protectionDisabled = applyRetrievalCodebook(features, Float32Array.from([0, 0]), codebook, 0.5, 0.5);
  assert.deepEqual([...voiced.hiddenStates], [1, 2, 1, 2]);
  assert.ok(Math.abs(unvoiced.hiddenStates[0] - 0.33) < 1e-6);
  assert.ok(Math.abs(unvoiced.hiddenStates[1] - 0.66) < 1e-6);
  assert.deepEqual([...protectionDisabled.hiddenStates], [1, 2, 1, 2]);
});

test("browser retrieval uses the official Top-8 neighbour count", () => {
  assert.match(workerSource, /const neighborCount = Math\.min\(8, codebook\.count\)/u);
  assert.doesNotMatch(extractFunction("applyRetrievalCodebook"), /new Float64Array\(4\)/u);
});
