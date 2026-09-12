import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(new URL("../assets/rvc.js", import.meta.url), "utf8");
function source(name) {
  const marker = `function ${name}(`;
  const start = client.indexOf(marker);
  assert.ok(start >= 0);
  const end = client.indexOf("\n  }", start) + 4;
  return (client.slice(start - 6, start) === "async " ? "async " : "") + client.slice(start, end);
}
const codes = new Set(["RVC_BACKEND_TIMEOUT", "RVC_BACKEND_UNAVAILABLE", "RVC_NETWORK_INTERRUPTED", "RVC_OUTPUT_UNAVAILABLE", "RVC_RELAY_UNAVAILABLE", "UPSTREAM_UNAVAILABLE"]);
const eligible = Function("DEVICE_FALLBACK_CODES", `return (${source("isDeviceFallbackEligible")});`)(codes);

test("connection failures fall back but rejected input and permission errors do not", () => {
  for (const error of [{ code: "UPSTREAM_UNAVAILABLE" }, { code: "RVC_BACKEND_TIMEOUT" }, { httpStatus: 530 }, new TypeError("Failed to fetch")]) assert.equal(eligible(error), true);
  for (const error of [{ code: "RVC_INVALID_AUDIO" }, { httpStatus: 401 }, { httpStatus: 403 }, { httpStatus: 422 }]) assert.equal(eligible(error), false);
});

function cloudHarness(mode) {
  const audio = { file: { name: "regression.mp3", size: 1000 }, duration: 303.6 };
  const model = { id: "momoi", chunks: ["model.bin"] };
  const state = { busy: false, audio, selectedModelId: model.id, catalog: [model], audioMode: mode, lang: "zh", lastCloudSubmissionAt: 0 };
  const button = { hidden: true };
  const toasts = [];
  const statuses = [];
  let uploads = 0;
  class XHR {
    upload = {};
    status = 503;
    responseText = JSON.stringify({ code: "UPSTREAM_UNAVAILABLE", message: "offline" });
    open() {}
    getResponseHeader() { return ""; }
    send() { uploads++; queueMicrotask(() => this.onload()); }
  }
  const dependencies = {
    state, MAX_AUDIO_SECONDS: 600, MAX_AUDIO_BYTES: 25 * 1024 * 1024,
    RVC_SUBMISSION_COOLDOWN_MS: 20000, DURABLE_CLOUD_JOB_SECONDS: 180,
    document: { getElementById: id => id === "rvc-song-local-fallback" ? button : null },
    fixUploadContainer: async file => file,
    setAudioMode: mode => { state.audioMode = mode; },
    prepareCloudUploadAudio: audio => ({ file: audio.file }),
    persistCloudSubmissionTimestamp() {}, showProgressBar() {}, updateProgressBar() {},
    updateStatusDisplay: text => statuses.push(text), showToast: text => toasts.push(text),
    officialRoutes: () => ({ convertUrl: "/test" }), getOfficialEndpoint: () => "",
    cloudRequestTimeoutMs: () => 1000, cloudJobTimeoutMs: () => 1000,
    preferredCloudOutputFormat: () => "mp3", createCloudRequestId: () => "same-retry-id",
    FormData: class { set() {} }, XMLHttpRequest: XHR, waitFor: async () => {},
    console: { warn() {} }, setTimeout() {}, clearInterval() {},
    hasDeviceFallbackModel: m => m.chunks.length > 0,
    isDeviceFallbackEligible: eligible,
    buildRvcEndpointCandidates: () => [],
    isEndpointNetworkError: () => false,
  };
  const run = Function(...Object.keys(dependencies), `return (${source("runOfficialRvcInference")});`)(...Object.values(dependencies));
  return { run, state, audio, button, statuses, toasts, uploads: () => uploads };
}

test("303-second voice retries once then offers automatic fallback with intact audio and unlocked UI", async () => {
  const h = cloudHarness("voice");
  const result = await h.run({ allowDeviceFallback: true });
  assert.equal(result.fallback, true);
  assert.equal(h.uploads(), 2);
  assert.equal(h.state.audio, h.audio);
  assert.equal(h.state.busy, false);
});

test("song outage auto-switches to on-device voice conversion with an explicit notice", async () => {
  const h = cloudHarness("song");
  const result = await h.run({ allowDeviceFallback: true });
  assert.equal(result.fallback, true);
  assert.equal(h.state.audioMode, "voice");
  assert.match(h.toasts.join("\n"), /不分离伴奏|一起变声/u);
  assert.equal(h.state.busy, false);
  assert.equal(h.state.audio, h.audio);
});

test("hybrid dispatcher actually starts local inference after cloud failure", async () => {
  const calls = [];
  const state = { catalog: [{ id: "momoi" }], selectedModelId: "momoi", audioMode: "voice", engineReady: true };
  const run = Function("state", "document", "OWN_MODEL_PREFIX", "hasDeviceFallbackModel", "setInferenceMode", "runOfficialRvcInference", "runWebRvcInference", `return (${source("runRvcInference")});`)(
    state, { getElementById: () => null }, "own:", () => true, () => {},
    async () => ({ fallback: true }), async options => { calls.push(options); return true; },
  );
  assert.equal(await run(), true);
  assert.deepEqual(calls, [{ allowLong: true, fallback: true }]);
});
