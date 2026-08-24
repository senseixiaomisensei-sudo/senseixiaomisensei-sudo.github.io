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
  const CLOUD_MAX_LONG_JOB_TIMEOUT_MS = 45 * 60 * 1000;
  const LONG_AUDIO_THRESHOLD_SECONDS = 45;
  const DURABLE_CLOUD_JOB_SECONDS = 40;
  const CLOUD_MIN_EXPECTED_UPLOAD_BYTES_PER_SECOND = 64 * 1024;
  const TRANSIENT_CLOUD_OUTPUT_CODES = new Set(["RATE_LIMITER_UNAVAILABLE", "RVC_BACKEND_TIMEOUT", "RVC_BACKEND_UNAVAILABLE", "RVC_NETWORK_INTERRUPTED", "RVC_OUTPUT_UNAVAILABLE", "RVC_RELAY_UNAVAILABLE", "UPSTREAM_UNAVAILABLE"]);
  const TRANSIENT_CLOUD_OUTPUT_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530]);
  ${extractFunction("encodeMono16kWav")}
  ${extractFunction("prepareCloudUploadAudio")}
  ${extractFunction("cloudRequestTimeoutMs")}
  ${extractFunction("cloudJobTimeoutMs")}
  ${extractFunction("isTransientCloudOutputError")}
  return { encodeMono16kWav, prepareCloudUploadAudio, cloudRequestTimeoutMs, cloudJobTimeoutMs, isTransientCloudOutputError };
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

test("song mode preserves the original full-band stereo-capable upload", () => {
  const original = new File([new Uint8Array(512 * 1024)], "song.mp3", { type: "audio/mpeg" });
  const prepared = helpers.prepareCloudUploadAudio({
    file: original,
    float32: new Float32Array(16000 * 20),
    duration: 20,
  }, "song");
  assert.equal(prepared.optimized, false);
  assert.equal(prepared.preservesMix, true);
  assert.equal(prepared.file, original);
});

test("browser microphone recordings are normalized to a standard WAV before cloud upload", () => {
  const original = new File([new Uint8Array(32 * 1024)], "mic_recording_1787536560938.webm", { type: "audio/webm" });
  const samples = new Float32Array(16000 * 3);
  samples.fill(0.1);
  const prepared = helpers.prepareCloudUploadAudio({
    file: original,
    float32: samples,
    duration: 3,
  });
  assert.equal(prepared.optimized, true);
  assert.equal(prepared.file.type, "audio/wav");
  assert.match(prepared.file.name, /\.postprep-16k\.wav$/u);
});

test("long uploads receive a size-aware timeout instead of the old fixed cutoff", () => {
  const timeout = helpers.cloudRequestTimeoutMs(25 * 1024 * 1024, 180);
  assert.ok(timeout > 500000);
  assert.ok(timeout <= 600000);
  assert.equal(helpers.cloudRequestTimeoutMs(100 * 1024, 4), 220000);
  assert.equal(helpers.cloudRequestTimeoutMs(100 * 1024, 180, "song"), 600000);
});

test("short job timing remains unchanged while long jobs receive a durable window", () => {
  assert.equal(helpers.cloudJobTimeoutMs(4, "voice"), 220000);
  assert.equal(helpers.cloudJobTimeoutMs(39.9, "voice"), helpers.cloudRequestTimeoutMs(0, 39.9, "voice"));
  assert.ok(helpers.cloudJobTimeoutMs(40, "voice") >= 12 * 60 * 1000);
  assert.ok(helpers.cloudJobTimeoutMs(60, "voice") >= 12 * 60 * 1000);
  assert.ok(helpers.cloudJobTimeoutMs(600, "song") >= 40 * 60 * 1000);
  assert.ok(helpers.cloudJobTimeoutMs(600, "song") <= 45 * 60 * 1000);
});


test("output polling distinguishes recoverable tunnel errors from terminal inference failures", () => {
  assert.equal(helpers.isTransientCloudOutputError({ code: "UPSTREAM_UNAVAILABLE", httpStatus: 502 }), true);
  assert.equal(helpers.isTransientCloudOutputError({ code: "RVC_RELAY_UNAVAILABLE", httpStatus: 502 }), true);
  assert.equal(helpers.isTransientCloudOutputError({ code: "", httpStatus: 524 }), true);
  assert.equal(helpers.isTransientCloudOutputError(new TypeError("network drop")), true);
  assert.equal(helpers.isTransientCloudOutputError({ code: "RVC_INFERENCE_FAILED", httpStatus: 502 }), false);
  assert.equal(helpers.isTransientCloudOutputError({ code: "RVC_INVALID_AUDIO", httpStatus: 400 }), false);
});
