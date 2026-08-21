import assert from "node:assert/strict";
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

test("RVC keeps ordinary input level and only attenuates over-range audio", () => {
  const conditionInputAudio = evaluateFunction("conditionInputAudio");
  const ordinary = conditionInputAudio(sine(16000, 0.1), 16000);
  assert.ok(maxAbs(ordinary) > 0.07);
  assert.ok(maxAbs(ordinary) < 0.13);

  const overRange = conditionInputAudio(sine(16000, 1.4), 16000);
  assert.ok(maxAbs(overRange) <= 0.951);
  assert.ok(maxAbs(overRange) > 0.9);
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

test("RVC page starts neutral and the pipeline avoids non-official mastering", async () => {
  const [page, client, runtime] = await Promise.all([
    readFile(new URL("rvc.html", root), "utf8"),
    readFile(new URL("assets/rvc.js", root), "utf8"),
    readFile(new URL("assets/rvc-engine/rvc-web-runtime.js", root), "utf8"),
  ]);

  assert.match(page, /id="rvc-pitch"[^>]*value="0"/u);
  assert.match(page, /id="rvc-preset-same"[^>]*aria-pressed="true"/u);
  assert.match(page, /id="rvc-preset-male-female"[^>]*aria-pressed="false"/u);
  assert.doesNotMatch(page, /value="crepe"|value="fcpe"|value="harvest"/u);
  assert.doesNotMatch(client, /pitchInput\.value = String\(model\.defaultPitch\)/u);
  assert.doesNotMatch(workerSource, /filteredF0 = stabilizeShoutingPitchF0/u);
  assert.doesNotMatch(workerSource, /finalAudio = applyHarmonicAirAndWarmth/u);
  assert.match(workerSource, /finalAudio = normalizeOutputPeak\(finalAudio\)/u);
  assert.match(page, /id="rvc-filter-radius"[\s\S]*?<option value="0">0（推荐/u);
  assert.match(page, /assets\/rvc\.js\?v=20260821-v23/u);
  assert.match(client, /rvc-filter-radius"\)\?\.value \|\| "0"/u);
  assert.match(workerSource, /extractHubertFeatures[\s\S]*?normalize: false/u);
  assert.doesNotMatch(workerSource, /extractHubertFeatures[\s\S]{0,180}?normalize: true/u);
  assert.match(workerSource, /fMin: 30,/u);
  assert.match(workerSource, /2595 \* Math\.log10\(1 \+ hz \/ 700\)/u);
  assert.match(workerSource, /medianFilterEnabled = options\.medianFilter === true/u);
  assert.match(client, /v=20260821-v23/u);
  assert.match(runtime, /v=20260821-v23/u);
  assert.match(client, /CHARACTER_MODEL_ASSET_VERSION = "20260821-v23"/u);
  assert.match(client, /characterModelCacheKey\(selectedModel\)/u);
  assert.match(client, /chunks\.map\(versionCharacterChunkPath\)/u);
});

test("re-exported character models retain the official stochastic latent path", async () => {
  const reexported = ["arisu", "shiroko", "yuuka", "hina", "noa", "koharu"];
  const randomNode = Buffer.from("RandomNormalLike");

  for (const id of reexported) {
    const firstChunk = await readFile(
      new URL(`models/characters/${id}/chunk_0.bin`, root),
    );
    assert.ok(
      firstChunk.includes(randomNode),
      `${id} is missing RandomNormalLike and may regress to metallic deterministic synthesis`,
    );
  }
});

test("model export helpers do not collapse the latent distribution to its mean", async () => {
  const helpers = [
    "tools/export-blue-archive.py",
    "tools/batch-ba-models.py",
    "tools/convert_hoshino_local.py",
    "tools/export_hoshino.py",
    "tools/export_hoshino_fast.py",
    "tools/export_hoshino_v2.py",
  ];

  for (const helper of helpers) {
    const source = await readFile(new URL(helper, root), "utf8");
    assert.doesNotMatch(source, /z_p\s*=\s*m_p\s*\*\s*x_mask/u, helper);
    assert.match(source, /torch\.randn_like\(m_p\)\s*\*\s*0\.66666/u, helper);
  }
});
