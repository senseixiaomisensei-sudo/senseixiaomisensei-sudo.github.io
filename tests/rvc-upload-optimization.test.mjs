import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../assets/rvc.js", import.meta.url), "utf8");

function extractFunction(name) {
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

const helpers = Function(`
  "use strict";
  const CLOUD_CONVERT_TIMEOUT_MS = 220000;
  const CLOUD_MAX_CONVERT_TIMEOUT_MS = 600000;
  const CLOUD_MIN_EXPECTED_UPLOAD_BYTES_PER_SECOND = 64 * 1024;
  ${extractFunction("encodeMono16kWav")}
  ${extractFunction("prepareCloudUploadAudio")}
  ${extractFunction("cloudRequestTimeoutMs")}
  return { encodeMono16kWav, prepareCloudUploadAudio, cloudRequestTimeoutMs };
`)();

test("large WAV uploads are reduced to 16 kHz mono without shortening the clip", () => {
  const seconds = 60;
  const samples = new Float32Array(16000 * seconds);
  samples.fill(0.1);
  const original = new File([new Uint8Array(8 * 1024 * 1024)], "long-stereo.wav", { type: "audio/wav" });
  const prepared = helpers.prepareCloudUploadAudio({
    file: original,
    float32: samples,
    duration: seconds,
  });
  assert.equal(prepared.optimized, true);
  assert.equal(prepared.file.type, "audio/wav");
  assert.equal(prepared.file.size, 44 + samples.length * 2);
  assert.ok(prepared.file.size < original.size / 4);
});

test("already compact short MP3 uploads stay untouched", () => {
  const original = new File([new Uint8Array(96 * 1024)], "short.mp3", { type: "audio/mpeg" });
  const prepared = helpers.prepareCloudUploadAudio({
    file: original,
    float32: new Float32Array(16000 * 4),
    duration: 4,
  });
  assert.equal(prepared.optimized, false);
  assert.equal(prepared.file, original);
});

test("long uploads receive a size-aware timeout instead of the old fixed cutoff", () => {
  const timeout = helpers.cloudRequestTimeoutMs(25 * 1024 * 1024, 180);
  assert.ok(timeout > 500000);
  assert.ok(timeout <= 600000);
  assert.equal(helpers.cloudRequestTimeoutMs(100 * 1024, 4), 220000);
});
