import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createRealFFT,
  createMdxDsp,
  separateStereo,
  MDX_CONFIG,
} from "../assets/rvc-engine/song-separator.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("mixed-radix real FFT matches a direct DFT for n_fft 7680", () => {
  const N = MDX_CONFIG.nFft;
  const rfft = createRealFFT(N);
  const x = new Float64Array(N);
  for (let i = 0; i < N; i += 1) x[i] = Math.sin(i * 0.013) + 0.3 * Math.cos(i * 0.71) + ((i * 7919) % 101) / 101 - 0.5;
  const re = new Float64Array(N / 2 + 1);
  const im = new Float64Array(N / 2 + 1);
  rfft.forward(x, re, im, N / 2 + 1);
  for (const k of [0, 1, 7, 1234, 3071, 3840]) {
    let sr = 0;
    let si = 0;
    for (let n = 0; n < N; n += 1) {
      sr += x[n] * Math.cos((2 * Math.PI * k * n) / N);
      si -= x[n] * Math.sin((2 * Math.PI * k * n) / N);
    }
    assert.ok(Math.abs(sr - re[k]) < 1e-6 && Math.abs(si - im[k]) < 1e-6, `bin ${k}`);
  }
  const back = new Float64Array(N);
  rfft.inverse(re, im, N / 2 + 1, back);
  for (let i = 0; i < N; i += 97) assert.ok(Math.abs(back[i] - x[i]) < 1e-9);
});

test("separation loop reconstructs the mix through an identity model", async () => {
  const n = 44100; // one second -> a single MDX chunk
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    left[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / 44100);
    right[i] = 0.3 * Math.sin((2 * Math.PI * 330 * i) / 44100);
  }
  const mixL = left.slice();
  let calls = 0;
  const { vocals, instrumental } = await separateStereo(left, right, async (spec, dims) => {
    calls += 1;
    assert.deepEqual(dims, [1, 4, MDX_CONFIG.dimF, MDX_CONFIG.dimT]);
    return spec;
  });
  assert.equal(calls, 1);
  assert.equal(vocals[0].length, n);
  for (let i = 1000; i < n - 1000; i += 101) {
    assert.ok(Math.abs(vocals[0][i] - mixL[i] * MDX_CONFIG.compensate) < 1e-4);
    assert.ok(Math.abs(instrumental[0][i] + vocals[0][i] - mixL[i]) < 1e-6);
  }
  const dsp = createMdxDsp();
  assert.equal(dsp.chunk, 261120);
  assert.equal(dsp.gen, 253440);
});

test("separator model chunks are published with integrity hashes", () => {
  const manifest = JSON.parse(read("assets/rvc-models.json"));
  const separator = manifest.baseModels.songSeparator;
  assert.ok(separator, "baseModels.songSeparator");
  assert.equal(separator.chunks.length, separator.chunkSha256.length);
  assert.match(separator.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(separator.license, "MIT");
  const whole = createHash("sha256");
  let present = 0;
  separator.chunks.forEach((path, index) => {
    const url = new URL(path, root);
    if (!existsSync(url)) return; // sparse checkouts may omit models/
    present += 1;
    const bytes = readFileSync(url);
    assert.ok(statSync(url).size < 20 * 1024 * 1024, "chunk under jsDelivr limit");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), separator.chunkSha256[index]);
    whole.update(bytes);
  });
  if (present === separator.chunks.length) assert.equal(whole.digest("hex"), separator.sha256);
});

test("rvc.js keeps cloud first and only falls back for song covers when the engine is offline", () => {
  const source = read("assets/rvc.js");
  assert.match(source, /async function runDeviceSongCover\(/u);
  assert.match(source, /OFFLINE_SONG_FALLBACK_KEY = "rvcOfflineSongFallback"/u);
  assert.match(source, /window\.POSTPREP_RVC_OFFLINE_SONG === false/u);
  const routing = source.slice(source.indexOf("async function runRvcInference()"));
  const probe = routing.indexOf('state.audioMode === "song" && state.engineReady !== true && canRunDeviceSongCover');
  const cloud = routing.indexOf("runOfficialRvcInference({ allowDeviceFallback");
  assert.ok(probe > 0 && cloud > probe, "offline probe precedes the cloud call");
  assert.match(routing, /if \(cloudReady !== true\) return runDeviceSongCover\(\);/u);
  assert.match(routing, /cloudResult\?\.fallback && state\.audioMode === "song" && canRunDeviceSongCover/u);
  // Apple mobile keeps the existing no-device-fallback policy.
  const gate = source.slice(source.indexOf("function canRunDeviceSongCover"), source.indexOf("function decodeWithContext"));
  assert.match(gate, /!isAppleMobile\(\)/u);
  assert.match(gate, /DEVICE_SONG_MAX_AUDIO_SECONDS/u);
});

test("separator worker uses the bundled onnxruntime build and verifies WebGPU output", () => {
  const worker = read("assets/rvc-engine/separator.worker.js");
  assert.match(worker, /from "\.\/ort126\/ort\.min\.mjs"/u);
  assert.match(worker, /relativeError\(out, ref\)/u);
  assert.match(worker, /inPlaceInstrumental: true/u);
});
