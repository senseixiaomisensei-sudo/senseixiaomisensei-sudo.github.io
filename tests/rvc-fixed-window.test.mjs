import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../assets/rvc-engine/inference.worker.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const declarationStart = source.slice(Math.max(0, start - 6), start) === "async " ? start - 6 : start;
  const bodyStart = source.indexOf(") {", start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(declarationStart, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const processFixedWindows = Function(
  `"use strict"; return (${extractFunction("processAudioInFixedFrameWindows")});`,
)();

const suppressHarshBursts = Function(`
  "use strict";
  ${extractFunction("createBiquadLowpass")}
  ${extractFunction("applyBiquadFilterInPlace")}
  return (${extractFunction("suppressDetectedHarshBursts")});
`)();

test("fixed browser RVC windows overlap and crossfade without changing duration", async () => {
  const audio = new Float32Array(40_000); // 2.5 seconds at 16 kHz
  const windows = [];
  const progress = [];
  const output = await processFixedWindows(
    audio,
    async (chunk) => {
      windows.push(chunk.data.length);
      return new Float32Array(40_000); // one 100-frame, 40 kHz model output
    },
    { inputSampleRate: 16_000, outputSampleRate: 40_000, frameCount: 100, lookAheadDuration: 0.04 },
    (current, total) => progress.push([current, total]),
  );
  assert.deepEqual(windows, [16_640, 16_640, 16_640]);
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
  assert.equal(output.length, 100_000); // 2.5 seconds; the padded tail is removed
});

test("fixed browser RVC windows smooth a discontinuity at each one-second boundary", async () => {
  const audio = new Float32Array(40_000);
  const output = await processFixedWindows(
    audio,
    async (_chunk, current) => {
      const samples = new Float32Array(40_000);
      samples.fill(current === 1 ? -1 : 1);
      return samples;
    },
    { inputSampleRate: 16_000, outputSampleRate: 40_000, frameCount: 100, lookAheadDuration: 0.04 },
  );
  assert.equal(output.length, 100_000);
  const firstJoin = 38_000;
  assert.ok(Math.abs(output[firstJoin] - output[firstJoin - 1]) < 0.01);
  assert.ok(output[firstJoin] > -1 && output[firstJoin] < 1);
});

test("local harsh-burst guard leaves normal audio untouched and suppresses a detected burst", () => {
  const sampleRate = 40_000;
  const normal = Float32Array.from(
    { length: sampleRate },
    (_, index) => 0.2 * Math.sin(2 * Math.PI * 1000 * index / sampleRate),
  );
  assert.equal(suppressHarshBursts(normal, sampleRate), normal);

  const harsh = new Float32Array(normal);
  for (let index = 19_000; index < 19_500; index++) harsh[index] = index % 2 ? 0.8 : -0.8;
  const repaired = suppressHarshBursts(harsh, sampleRate);
  const maximumJump = (samples) => {
    let maximum = 0;
    for (let index = 1; index < samples.length; index++) {
      maximum = Math.max(maximum, Math.abs(samples[index] - samples[index - 1]));
    }
    return maximum;
  };
  assert.ok(maximumJump(repaired) < maximumJump(harsh) * 0.8);
});
