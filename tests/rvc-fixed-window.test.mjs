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

test("fixed browser RVC windows keep every input sample at the exported 100-frame shape", async () => {
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