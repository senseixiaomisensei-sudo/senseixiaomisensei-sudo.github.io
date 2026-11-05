import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (await readFile(new URL("../assets/rvc.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
function load(name, deps = {}) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n  }", start) + 4;
  const prefix = source.slice(start - 6, start) === "async " ? "async " : "";
  return Function(...Object.keys(deps), `return (${prefix}${source.slice(start, end)});`)(...Object.values(deps));
}
class RvcStallError extends Error {
  constructor(stage, zh, en, code) { super(zh); this.code = code; this.stalled = true; }
}
const withDeadline = load("withDeadline", { RvcStallError });
const throwIfAborted = load("throwIfAborted", { RvcStallError });
const isTransientCloudOutputError = load("isTransientCloudOutputError", {
  TRANSIENT_CLOUD_OUTPUT_CODES: new Set(["RVC_BACKEND_TIMEOUT", "RVC_NETWORK_INTERRUPTED", "UPSTREAM_UNAVAILABLE"]),
  TRANSIENT_CLOUD_OUTPUT_STATUSES: new Set([0, 408, 429, 500, 502, 503, 504]),
});

function polling(deps) {
  return load("pollCloudOutput", {
    l: zh => zh, withDeadline, throwIfAborted, isTransientCloudOutputError,
    updateProgressBar() {}, updateStatusDisplay() {}, ...deps,
  });
}

test("healthy unchanged cloud stages survive the 180-second page supervisor", async () => {
  for (const [audioMode, longJob] of [["voice", false], ["song", true]]) {
    let clock = 1000000, tick, requests = 0, restored = false;
    const state = { busy: false, audioMode };
    const poll = polling({ state, Date: { now: () => clock },
      fetch: async () => ++requests <= 45
        ? Response.json({ state: "processing", stage: "converting" }, { status: 202 })
        : new Response("audio"),
      waitFor: async ms => { clock += ms; tick(); },
    });
    const start = load("startConversion", { state, Date: { now: () => clock },
      hideStallActions() {}, maybeReturnToCloud: async () => false,
      RVC_STALL: { globalNoProgressMs: 180000 }, RvcStallError,
      setInterval: callback => { tick = callback; return 1; }, clearInterval() {},
      forceRestoreAfterStall: () => { restored = true; },
    });
    const response = await start(async () => {
      state.busy = true;
      try { return await poll("https://example.test/output", 600000, longJob); }
      finally { state.busy = false; }
    });
    assert.equal(response.status, 200);
    assert.ok(clock - 1000000 > 180000);
    assert.equal(requests, 46);
    assert.equal(restored, false);
  }
});

test("repeated healthy 202 replies still obey the absolute job deadline", async () => {
  let clock = 1000, requests = 0;
  const state = {};
  const poll = polling({ state, Date: { now: () => clock },
    fetch: async () => { requests++; return Response.json({ state: "queued", stage: "queued" }, { status: 202 }); },
    waitFor: async ms => { clock += ms; },
  });
  await assert.rejects(poll("https://example.test/output", 30000), { code: "RVC_BACKEND_TIMEOUT" });
  assert.equal(clock, 31000);
  assert.equal(requests, 5);
  assert.equal(state.cloudRunAbort, undefined);
});

test("supervisor abort ends a hanging poll and its active network request", async () => {
  const state = {};
  const reason = new RvcStallError("supervisor", "stopped", "stopped", "RVC_NO_PROGRESS");
  let requests = 0, signal;
  const poll = polling({ state,
    fetch: (_url, options) => {
      requests++; signal = options.signal;
      queueMicrotask(() => state.cloudRunAbort(reason));
      return new Promise(() => {});
    }, waitFor: async () => {},
  });
  await assert.rejects(poll("https://example.test/output", 1000), error => error === reason);
  assert.equal(signal.aborted, true);
  assert.equal(requests, 1);
  assert.equal(state.cloudRunAbort, undefined);
});

test("aborting the polling sleep cannot start another fetch or late UI update", async () => {
  const state = {};
  let requests = 0, updates = 0;
  const reason = new Error("stop while waiting");
  const poll = polling({ state,
    fetch: async () => { requests++; return Response.json({ stage: "converting" }, { status: 202 }); },
    updateStatusDisplay: () => { updates++; },
    waitFor: () => { queueMicrotask(() => state.cloudRunAbort(reason)); return new Promise(() => {}); },
  });
  await assert.rejects(poll("https://example.test/output", 1000), error => error === reason);
  assert.equal(requests, 1);
  assert.equal(updates, 1);
});

test("a real inference failure stops polling without retrying a failed job", async () => {
  let requests = 0;
  const poll = polling({ state: {}, waitFor: async () => {},
    fetch: async () => { requests++; return Response.json({ code: "RVC_INFERENCE_FAILED" }, { status: 502 }); },
  });
  await assert.rejects(poll("https://example.test/output", 1000), { code: "RVC_INFERENCE_FAILED" });
  assert.equal(requests, 1);
});

function conversion() {
  const state = { audio: { file: new File(["test"], "voice.mp3", { type: "audio/mpeg" }), duration: 5 },
    catalog: [{ id: "hoshino", chunks: ["a"] }], selectedModelId: "hoshino", audioMode: "voice", lang: "zh", lastCloudSubmissionAt: 0 };
  const uploadedIds = [], polledUrls = [], statuses = [];
  let nextError = Object.assign(new Error("connection lost"), { code: "RVC_BACKEND_TIMEOUT" });
  let nextId = 0;
  const createCloudRequestId = () => `request-${++nextId}`;
  const routes = { convertUrl: "https://example.test/convert", outputUrl: (id, token) => `https://example.test/output/${id}?token=${token}` };
  class XHR {
    upload = {}; status = 200;
    responseText = JSON.stringify({ jobId: "same-job", downloadToken: "protected" });
    open() {} getResponseHeader() { return ""; }
    send(body) { uploadedIds.push(body.get("requestId")); queueMicrotask(() => this.onload()); }
  }
  const deps = {
    state, l: zh => zh, document: { getElementById: () => null },
    MAX_AUDIO_SECONDS: 900, MAX_AUDIO_BYTES: 25e6, DURABLE_CLOUD_JOB_SECONDS: 40, RVC_SUBMISSION_COOLDOWN_MS: 20000,
    useNewSpeechEngine: () => false, fixUploadContainer: async file => file,
    prepareCloudUploadAudio: audio => ({ file: audio.file }), selectedRmsMixRate: () => .5,
    selectedMixControls: () => ({ vocalGainDb: 0, accompanimentGainDb: 0, vocalMute: false, accompanimentMute: false }),
    syncMixControls() {}, persistCloudSubmissionTimestamp() {}, showProgressBar() {}, updateProgressBar() {}, showToast() {},
    updateStatusDisplay: text => statuses.push(text),
    buildRvcEndpointCandidates: () => ["https://example.test"],
    cloudRequestTimeoutMs: () => 1000, cloudJobTimeoutMs: () => 1000, preferredCloudOutputFormat: () => "wav",
    cloudSubmissionFor: load("cloudSubmissionFor", { state, createCloudRequestId }),
    createCloudRequestId, FormData, XMLHttpRequest: XHR,
    uploadWithRouteFallback: async (_bases, upload) => ({ payload: await upload(routes, 1), routes }),
    pollCloudOutput: async url => { polledUrls.push(url); if (nextError) throw nextError; return new Response("audio"); },
    cloudResultUrl: async () => "blob:result", isTransientCloudOutputError,
    hasDeviceFallbackModel: () => true, isDeviceFallbackEligible: () => false,
    cloudRvcFailureMessage: error => error.message, showStallActions() {},
    console: { warn() {} }, setTimeout() {}, clearInterval() {},
  };
  return { run: load("runOfficialRvcInference", deps), state, uploadedIds, polledUrls, statuses,
    error: value => { nextError = value; } };
}

test("Retry resumes an accepted cloud job immediately without a second upload", async () => {
  const h = conversion();
  assert.equal(await h.run(), false);
  assert.equal(h.state.busy, false);
  assert.match(h.statuses.at(-1), /继续查询/u);
  h.error(null);
  assert.equal(await h.run(), true);
  assert.equal(h.uploadedIds.length, 1);
  assert.equal(h.polledUrls.length, 2);
  assert.equal(h.polledUrls[0], h.polledUrls[1]);
  assert.equal(h.state.cloudSubmission, null);
});

test("a failed cloud job clears the resumable state so Retry creates a new job", async () => {
  const h = conversion();
  h.error(Object.assign(new Error("inference failed"), { code: "RVC_INFERENCE_FAILED", httpStatus: 502 }));
  await h.run();
  assert.equal(h.state.cloudSubmission, null);
  h.state.lastCloudSubmissionAt = 0;
  h.error(null);
  assert.equal(await h.run(), true);
  assert.equal(h.uploadedIds.length, 2);
  assert.notEqual(h.uploadedIds[0], h.uploadedIds[1]);
});

test("idempotency survives a lost acknowledgement, but files, settings and expiry start a new request", () => {
  const state = {}; let id = 0;
  const get = load("cloudSubmissionFor", { state, createCloudRequestId: () => String(++id) });
  const file = new File(["test"], "voice.wav");
  const body = new FormData(); body.set("modelId", "hoshino"); body.set("pitch", "0"); body.set("language", "zh");
  const original = get(file, body);
  body.set("language", "en");
  assert.equal(get(file, body), original);
  body.set("pitch", "12");
  const shifted = get(file, body);
  assert.notEqual(shifted.requestId, original.requestId);
  const reselected = get(new File(["test"], "voice.wav"), body);
  assert.notEqual(reselected.requestId, shifted.requestId);
  reselected.expiresAt = Date.now() - 1;
  assert.notEqual(get(reselected.file, body).requestId, reselected.requestId);
});
