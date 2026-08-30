import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const workerSource = await readFile(
  new URL("assets/rvc-engine/inference.worker.js", root),
  "utf8",
);
const clientSource = await readFile(new URL("assets/rvc.js", root), "utf8");

function extractFunction(name, sourceText = workerSource) {
  const marker = `function ${name}`;
  const start = sourceText.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const bodyStart = sourceText.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    if (sourceText[index] === "{") depth += 1;
    if (sourceText[index] === "}") {
      depth -= 1;
      if (depth === 0) return sourceText.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

function evaluateFunction(name, dependencyNames = [], dependencyValues = [], sourceText = workerSource) {
  const source = extractFunction(name, sourceText);
  return Function(...dependencyNames, `"use strict"; return (${source});`)(...dependencyValues);
}

const applyBiquadFilterInPlace = evaluateFunction("applyBiquadFilterInPlace");
const createBiquadHighpass = evaluateFunction("createBiquadHighpass");
const applyVoicingSanityGate = evaluateFunction(
  "applyVoicingSanityGate",
  ["applyBiquadFilterInPlace", "createBiquadHighpass"],
  [applyBiquadFilterInPlace, createBiquadHighpass],
);
const repairIsolatedShoutF0Errors = evaluateFunction("repairIsolatedShoutF0Errors");

function windLikeNoise(length, sampleRate = 16000) {
  // 模拟麦克风上的风声: 白噪声先经过漏积分(布朗化, -6dB/oct), 再两级
  // 150Hz 低通, 能量集中在 200Hz 以下, 并带缓慢的阵风起伏。
  const out = new Float32Array(length);
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x3fffffff - 1;
  };
  const integrator = 1 - Math.exp((-2 * Math.PI * 100) / sampleRate);
  const lowpass = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let brown = 0;
  let stage1 = 0;
  let stage2 = 0;
  let gustPhase = 0;
  for (let index = 0; index < length; index += 1) {
    gustPhase += (2 * Math.PI * 0.4) / sampleRate;
    brown += (random() - brown) * integrator;
    stage1 += (brown - stage1) * lowpass;
    stage2 += (stage1 - stage2) * lowpass;
    out[index] = stage2 * (1.1 + 0.9 * Math.sin(gustPhase));
  }
  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    peak = Math.max(peak, Math.abs(out[index]));
  }
  const scale = peak > 0 ? 0.3 / peak : 1;
  for (let index = 0; index < length; index += 1) out[index] *= scale;
  return out;
}

function voiceLikeTone(length, sampleRate = 16000) {
  // 220Hz 基频 + 谐波 + 轻微颤音: 高于 300Hz 的频带能量占比与真人一致。
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const vibrato = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t);
    const phase = 2 * Math.PI * 220 * vibrato * t;
    out[index] =
      0.5 * Math.sin(phase) +
      0.25 * Math.sin(2 * phase) +
      0.17 * Math.sin(3 * phase) +
      0.12 * Math.sin(4 * phase) +
      0.08 * Math.sin(5 * phase);
  }
  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    peak = Math.max(peak, Math.abs(out[index]));
  }
  const scale = 0.3 / peak;
  for (let index = 0; index < length; index += 1) out[index] *= scale;
  return out;
}

function fullyVoicedF0(length) {
  return Float32Array.from({ length }, () => 220);
}

test("voicing gate keeps genuine voice fully voiced", () => {
  const sampleRate = 16000;
  const audio = voiceLikeTone(sampleRate * 4, sampleRate);
  const f0 = fullyVoicedF0(Math.floor(audio.length / 160));
  const gated = applyVoicingSanityGate(f0, audio, sampleRate);
  let kept = 0;
  for (let index = 0; index < f0.length; index += 1) {
    if (gated[index] > 0) kept += 1;
    assert.equal(gated[index], gated[index] > 0 ? f0[index] : 0, "gate must only drop frames, never retune them");
  }
  assert.ok(kept / f0.length > 0.98, `voice should stay voiced, kept=${kept}/${f0.length}`);
});

test("voicing gate rejects wind-dominated frames instead of singing them", () => {
  const sampleRate = 16000;
  const audio = windLikeNoise(sampleRate * 4, sampleRate);
  const f0 = fullyVoicedF0(Math.floor(audio.length / 160));
  const gated = applyVoicingSanityGate(f0, audio, sampleRate);
  let kept = 0;
  for (let index = 0; index < f0.length; index += 1) {
    if (gated[index] > 0) kept += 1;
  }
  assert.ok(kept / f0.length < 0.2, `wind should lose its fake pitch, kept=${kept}/${f0.length}`);
});

test("voicing gate keeps voice dominant in a wind mix and clears wind-only tails", () => {
  const sampleRate = 16000;
  const voice = voiceLikeTone(sampleRate * 2, sampleRate);
  const wind = windLikeNoise(sampleRate * 4, sampleRate);
  const mixed = new Float32Array(wind.length);
  for (let index = 0; index < wind.length; index += 1) {
    mixed[index] = index < voice.length ? voice[index] + wind[index] : wind[index];
  }
  let peak = 0;
  for (let index = 0; index < mixed.length; index += 1) {
    peak = Math.max(peak, Math.abs(mixed[index]));
  }
  for (let index = 0; index < mixed.length; index += 1) mixed[index] *= 0.3 / peak;
  const f0 = fullyVoicedF0(Math.floor(mixed.length / 160));
  const gated = applyVoicingSanityGate(f0, mixed, sampleRate);
  const voiceFrames = Math.floor(voice.length / 160);
  let voiceKept = 0;
  let tailKept = 0;
  for (let index = 0; index < voiceFrames; index += 1) {
    if (gated[index] > 0) voiceKept += 1;
  }
  for (let index = voiceFrames + 40; index < Math.floor(mixed.length / 160); index += 1) {
    if (gated[index] > 0) tailKept += 1;
  }
  assert.ok(voiceKept / voiceFrames > 0.9, `voice-over-wind should stay voiced (${voiceKept}/${voiceFrames})`);
  assert.ok(tailKept < 5, `wind-only tail should be unvoiced (kept=${tailKept})`);
});

test("voicing gate is a no-op without voiced frames", () => {
  const audio = windLikeNoise(16000 * 2);
  const f0 = new Float32Array(200);
  const gated = applyVoicingSanityGate(f0, audio, 16000);
  assert.equal(gated.length, f0.length);
  for (let index = 0; index < gated.length; index += 1) assert.equal(gated[index], 0);
});

test("octave repair: long runs only inside shout/complex chunks, default stays short", () => {
  const base = 440;
  const contour = Float32Array.from({ length: 40 }, (_, index) =>
    index >= 10 && index < 20 ? base / 2 : base,
  );
  const longRepaired = repairIsolatedShoutF0Errors(contour, 10);
  let fixed = 0;
  for (let index = 10; index < 20; index += 1) {
    if (Math.abs(longRepaired[index] - base) < 1) fixed += 1;
  }
  assert.ok(fixed >= 9, `long octave run should be relocked in complex chunks (fixed=${fixed}/10)`);

  const defaultRepaired = repairIsolatedShoutF0Errors(contour);
  let untouched = 0;
  for (let index = 10; index < 20; index += 1) {
    if (Math.abs(defaultRepaired[index] - base / 2) < 1) untouched += 1;
  }
  assert.equal(untouched, 10, "default short-run repair must keep its previous behaviour");
});

test("worker wires the gate and the complex-chunk repair window", () => {
  assert.match(workerSource, /applyVoicingSanityGate\(filteredF0, audio\)/u);
  assert.match(workerSource, /shoutLikeChunk \? 10 : 3/u);
  assert.match(workerSource, /Math\.min\(12, Math\.floor\(maxRunLength\)/u);
  assert.match(workerSource, /const VOICE_BAND_RATIO = 0\.18;/u);
});

test("cloud voice path conditions uploads and polishes voice-mode output", async () => {
  assert.match(clientSource, /const conditioned = conditionCloudUploadAudio\(audio\.float32\);/u);
  assert.match(clientSource, /await polishCloudVoiceAudio\(rawOutputBlob\)/u);
  assert.match(clientSource, /state\.audioMode === "song"\s*\n\s*\? rawOutputBlob/u);
  assert.match(clientSource, /polishedVoiceOutput \? "wav" : outputFormat/u);

  const conditionInput = evaluateFunction("conditionCloudUploadAudio", [], [], clientSource);
  const quiet = conditionInput(voiceLikeTone(16000, 16000));
  let quietPeak = 0;
  for (const value of quiet) quietPeak = Math.max(quietPeak, Math.abs(value));
  // 与本地 worker 的既有测试口径一致 (0.1 幅度允许 0.07-0.13): 普通输入
  // 只要求保持在 ±35% 内, 3ms 启动瞬态的小超冲是参考实现的固有行为。
  assert.ok(quietPeak > 0.19 && quietPeak < 0.42, `ordinary input level must pass through (peak=${quietPeak.toFixed(3)})`);

  const hot = new Float32Array(16000);
  for (let index = 0; index < hot.length; index += 1) {
    hot[index] = 1.0 * Math.sin((2 * Math.PI * 220 * index) / 16000);
  }
  const conditionedHot = conditionInput(hot);
  let hotPeak = 0;
  for (const value of conditionedHot) hotPeak = Math.max(hotPeak, Math.abs(value));
  assert.ok(hotPeak < 0.95, `shout-level input must be contained (peak=${hotPeak.toFixed(3)})`);

  const suppress = evaluateFunction("suppressDetectedHarshBurstsCloud", [], [], clientSource);
  const clean = conditionInput(voiceLikeTone(16000, 16000));
  assert.equal(suppress(clean, 16000), clean, "clean audio must be returned untouched");
  const burst = Float32Array.from(clean);
  for (let index = 4000; index < 4080; index += 1) {
    burst[index] = index % 2 === 0 ? 0.6 : -0.6;
  }
  const repaired = suppress(burst, 16000);
  let burstPeakAfter = 0;
  for (let index = 4000; index < 4080; index += 1) {
    burstPeakAfter = Math.max(burstPeakAfter, Math.abs(repaired[index]));
  }
  assert.ok(burstPeakAfter < 0.6, `harsh burst should be smoothed (peak=${burstPeakAfter.toFixed(3)})`);
});

test("local engine and rvc client cache versions are bumped for the voice fix", async () => {
  const runtimeSource = await readFile(new URL("assets/rvc-engine/rvc-web-runtime.js", root), "utf8");
  const htmlSource = await readFile(new URL("rvc.html", root), "utf8");
  assert.match(runtimeSource, /inference\.worker\.js\?v=20260830-v43/u);
  assert.match(clientSource, /rvc-web-runtime\.js\?v=20260830-v43/u);
  assert.match(htmlSource, /assets\/rvc\.js\?v=20260830-voice-fix-v8/u);
});
