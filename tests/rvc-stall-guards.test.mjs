// Stall guards (2026-11-01): no stage of the voice-changer may wait forever.
// Regression for "[1/4] 正在加载基础语义模型 (HuBERT)..." hanging on a tablet
// when the home PC was offline: IndexedDB / cached-blob reads, chunk
// downloads, the worker bootstrap, the cloud probe and the v3 master worker
// all have a deadline or a no-progress watchdog, and a stall restores the UI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runPipelineInWorker } from "../assets/rvc-engine/rvc-web-runtime.js";
import { masterMixInWorker } from "../assets/rvc-engine/v3-master.mjs";

const source = (await readFile(new URL("../assets/rvc.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const html = (await readFile(new URL("../rvc.html", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

function body(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} exists`);
  const end = source.indexOf("\n  }", start) + 4;
  return (source.slice(start - 6, start) === "async " ? "async " : "") + source.slice(start, end);
}
function fn(name, deps = {}) {
  return Function(...Object.keys(deps), `return (${body(name)});`)(...Object.values(deps));
}
const classStart = source.indexOf("  class RvcStallError extends Error {");
const RvcStallError = Function("state", `${source.slice(classStart, source.indexOf("\n  }\n", classStart) + 4)}; return RvcStallError;`)({ lang: "zh" });
const withDeadline = fn("withDeadline", { RvcStallError });
const settleWithin = fn("settleWithin", { withDeadline });
const throwIfAborted = fn("throwIfAborted", { RvcStallError });
const l = (zh) => zh;
const FAST = {
  cacheOpenMs: 40, cacheReadMs: 40, cacheWriteBaseMs: 40, cacheBlobReadBaseMs: 40,
  downloadNoProgressMs: 150, cloudProbeMs: 60,
};
const elapsed = async (promise) => { const t0 = Date.now(); const value = await promise; return [value, Date.now() - t0]; };

test("stall budgets are finite and the cloud probe answers within 8 s", () => {
  const block = source.slice(source.indexOf("const RVC_STALL = {"), source.indexOf("};", source.indexOf("const RVC_STALL = {")));
  for (const key of ["cacheOpenMs", "cacheReadMs", "downloadNoProgressMs", "importMs", "workerStartMs", "cloudProbeMs", "globalNoProgressMs", "mixMs"]) {
    assert.match(block, new RegExp(`${key}: \\d+`), key);
  }
  assert.ok(Number(block.match(/cloudProbeMs: (\d+)/)[1]) <= 8000);
  assert.ok(Number(block.match(/downloadNoProgressMs: (\d+)/)[1]) >= 30000, "slow networks are judged by progress, not total time");
});

test("withDeadline rejects on timeout and abort; settleWithin falls back", async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 20, () => new RvcStallError("x", "超时", "timeout", "T")), /超时/);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new RvcStallError("x", "已停止", "stopped")), 10);
  await assert.rejects(withDeadline(new Promise(() => {}), 0, null, controller.signal), /已停止/);
  assert.equal(await withDeadline(Promise.resolve(7), 50), 7);
  assert.equal(await settleWithin(new Promise(() => {}), 20, "fallback"), "fallback");
  assert.throws(() => throwIfAborted(AbortSignal.abort(new RvcStallError("x", "停", "stop"))), /停/);
});

test("IndexedDB open that never answers resolves null within its budget", async () => {
  const window = { indexedDB: { open: () => ({}) } };
  const open = Function("window", "indexedDB", "RVC_STALL", "DB_NAME", "STORE_NAME",
    `let modelDbPromise = null; let modelDbUnavailableUntil = 0; return (${body("openModelDB")});`)(window, window.indexedDB, FAST, "db", "store");
  const [db, ms] = await elapsed(open());
  assert.equal(db, null);
  assert.ok(ms < 500, `open settled in ${ms}ms`);
  // A timed-out open is not retried for every chunk.
  const [again, ms2] = await elapsed(open());
  assert.equal(again, null);
  assert.ok(ms2 < 20);
});

test("cache get/put never wait forever on a stuck transaction", async () => {
  const stuckDb = { transaction: () => ({ objectStore: () => ({ get: () => ({}), put() {} }) }) };
  const get = fn("getCachedItem", { openModelDB: async () => stuckDb, RVC_STALL: FAST, STORE_NAME: "s", modelDbPromise: null });
  const put = fn("setCachedItem", { openModelDB: async () => stuckDb, RVC_STALL: FAST, STORE_NAME: "s", modelDbPromise: null });
  const [value, ms] = await elapsed(get("chunk:a"));
  assert.equal(value, null);
  assert.ok(ms < 500);
  const [saved] = await elapsed(put("whole", new Uint8Array(10)));
  assert.equal(saved, false, "an uncommitted write reports failure so chunks are kept");
});

test("a cached model blob whose read hangs is dropped instead of blocking HuBERT loading", async () => {
  let removed = "";
  const hanging = new Blob([new Uint8Array(2 * 1024 * 1024)]);
  hanging.arrayBuffer = () => new Promise(() => {});
  const readable = fn("readableCachedModel", {
    getCachedItem: async () => hanging, verifyModelBytes: async () => {}, removeCachedItem: async (key) => { removed = key; },
    withDeadline, RvcStallError, RVC_STALL: { ...FAST, cacheBlobReadBaseMs: 30 }, console: { warn() {} },
  });
  let reading = 0;
  const [result, ms] = await elapsed(readable("hubert.onnx", null, () => { reading += 1; }));
  assert.equal(result, null);
  assert.equal(removed, "hubert.onnx");
  assert.equal(reading, 1, "status moves to 'reading cache' before the read");
  assert.ok(ms < 2000, `gave up after ${ms}ms`);
});

function chunkedHarness(fetchChunk) {
  const progress = [];
  const pool = { run: (task) => task() };
  const fetchChunked = fn("fetchChunkedModel", {
    readableCachedModel: async () => null, l, activeModelDownloadConcurrency: 4, RVC_STALL: FAST, RvcStallError,
    globalDownloadPool: pool, fetchSingleChunkWithFallback: fetchChunk, setCachedItem: async () => true,
    removeCachedItem: async () => {}, throwIfAborted, console: { warn() {} },
  });
  return { fetchChunked, progress };
}

test("download watchdog rejects a chunk download with no byte progress", async () => {
  let aborted = false;
  const { fetchChunked, progress } = chunkedHarness((path, idx, total, onBytes, hash, signal) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); });
  }));
  const t0 = Date.now();
  await assert.rejects(
    fetchChunked(["a", "b"], "hubert.onnx", "HuBERT", "application/onnx", (...args) => progress.push(args), { totalSize: 40 * 1024 * 1024 }, { skipWholeCheck: true }),
    (error) => error.code === "RVC_DOWNLOAD_STALLED" && /没有任何进展/.test(error.message) && /断点继续/.test(error.message),
  );
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(aborted, true, "in-flight transfers are aborted");
  assert.match(progress[0][5], /0\.0MB \/ 40\.0MB/u, "progress shows MB against the manifest total");
});

test("slow but moving downloads are not misjudged as stalled", async () => {
  const { fetchChunked, progress } = chunkedHarness(async (path, idx, total, onBytes) => {
    const buffer = new ArrayBuffer(1000);
    for (let i = 1; i <= 6; i += 1) { await new Promise((r) => setTimeout(r, 60)); onBytes(i * 100); }
    return { buffer };
  });
  const file = await fetchChunked(["a"], "x.onnx", "X", "application/onnx", (...args) => progress.push(args), { totalSize: 1000 }, { skipWholeCheck: true });
  assert.equal(file.size, 1000);
  assert.ok(progress.some((p) => p[0] > 0 && p[0] < 1000), "intermediate byte progress reported");
});

test("chunks are deleted only after the assembled model is committed", async () => {
  const removed = [];
  const run = async (saved) => {
    removed.length = 0;
    const fetchChunked = fn("fetchChunkedModel", {
      readableCachedModel: async () => null, l, activeModelDownloadConcurrency: 1, RVC_STALL: FAST, RvcStallError,
      globalDownloadPool: { run: (task) => task() }, fetchSingleChunkWithFallback: async () => ({ buffer: new ArrayBuffer(4) }),
      setCachedItem: async () => saved, removeCachedItem: async (key) => { removed.push(key); }, throwIfAborted, console: { warn() {} },
    });
    await fetchChunked(["a", "b"], "m.onnx", "M", "application/onnx", () => {}, {}, { skipWholeCheck: true });
    return [...removed];
  };
  assert.deepEqual(await run(false), []);
  assert.deepEqual(await run(true), ["chunk:a", "chunk:b"]);
});

test("model progress callbacks no longer shadow the language helper", () => {
  assert.doesNotMatch(source, /\(l, t, cur, tot, fromCache, msg\)/u);
  assert.match(source, /\(loaded, total, cur, tot, fromCache, msg\)/u);
});

test("worker that never answers fails with WORKER_START_TIMEOUT", async () => {
  const previous = { fetch: globalThis.fetch, Worker: globalThis.Worker, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  let terminated = 0;
  globalThis.fetch = async () => new Response("", { status: 200 });
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
  globalThis.Worker = class { postMessage() {} terminate() { terminated += 1; } };
  const file = { name: "m", arrayBuffer: async () => new ArrayBuffer(2) };
  try {
    await assert.rejects(runPipelineInWorker({ workerUrl: "https://example.test/w.js" }, { model: file, contentVec: file, rmvpe: file },
      new Float32Array(1), 16000, {}, { timeout: 60000, startupTimeout: 30 }), (error) => error.code === "WORKER_START_TIMEOUT");
    assert.equal(terminated, 1);
    globalThis.fetch = (url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    await assert.rejects(runPipelineInWorker({ workerUrl: "https://example.test/w.js" }, { model: file, contentVec: file, rmvpe: file },
      new Float32Array(1), 16000, {}, { timeout: 60000, fetchTimeout: 30 }), (error) => error.code === "WORKER_FETCH_TIMEOUT");
  } finally {
    globalThis.fetch = previous.fetch; globalThis.Worker = previous.Worker;
    URL.createObjectURL = previous.create; URL.revokeObjectURL = previous.revoke;
  }
});

test("v3 master worker that never answers keeps the legacy mix", async () => {
  const previous = globalThis.Worker;
  globalThis.Worker = class { postMessage() {} terminate() {} };
  try {
    const mix = [new Float32Array(4), new Float32Array(4)];
    const out = await masterMixInWorker(mix, 44100, null, { timeoutMs: 30 }, "blob:x");
    assert.equal(out.report.skipped, "worker-timeout");
    assert.equal(out.channels, mix);
  } finally {
    globalThis.Worker = previous;
  }
});

test("quick cloud probe marks a hanging or 530 relay offline within its budget", async () => {
  const state = { selectedModelId: "hoshino" };
  const fetchJsonWithTimeout = fn("fetchJsonWithTimeout", {
    fetch: (url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
  });
  const probe = fn("quickCloudProbe", {
    state, window: { location: { href: "https://example.test/rvc.html" } }, OFFICIAL_RVC_STATUS_ENDPOINT: "/rvc-api/status",
    fetchJsonWithTimeout, RVC_STALL: FAST, console: { warn() {} },
  });
  const [ready, ms] = await elapsed(probe());
  assert.equal(ready, false);
  assert.equal(state.engineReady, false);
  assert.ok(ms < 1000);
  const fetch530 = fn("fetchJsonWithTimeout", { fetch: async () => new Response("error code: 1016", { status: 530 }) });
  const probe530 = fn("quickCloudProbe", {
    state, window: { location: { href: "https://example.test/" } }, OFFICIAL_RVC_STATUS_ENDPOINT: "/s",
    fetchJsonWithTimeout: fetch530, RVC_STALL: FAST, console: { warn() {} },
  });
  assert.equal(await probe530(), false);
});

test("offline cloud falls back to this device at once and announces it", async () => {
  const statuses = [];
  const calls = [];
  const state = { catalog: [{ id: "hoshino" }], selectedModelId: "hoshino", inferenceMode: "official", audioMode: "voice", engineReady: null };
  const run = fn("runRvcInference", {
    state, document: { getElementById: () => null }, OWN_MODEL_PREFIX: "own:", chorusController: null, isAppleMobile: () => false,
    hasDeviceFallbackModel: () => true, quickCloudProbe: async () => false, l,
    updateStatusDisplay: (text) => statuses.push(text), setInferenceMode: (mode) => { state.inferenceMode = mode; },
    runWebRvcInference: async (options) => { calls.push(options); return true; },
    runOfficialRvcInference: async () => { throw new Error("must not upload to an offline cloud"); },
  });
  assert.equal(await run(), true);
  assert.deepEqual(calls, [{ allowLong: true, fallback: true }]);
  assert.equal(state.autoLocalFallback, true);
  assert.match(statuses.join("\n"), /云端电脑离线，正在使用本机处理/u);
});

test("an automatic local fallback switches back once the cloud PC answers", async () => {
  const state = { autoLocalFallback: true, inferenceMode: "local", busy: false };
  const toasts = [];
  const back = fn("maybeReturnToCloud", {
    state, quickCloudProbe: async () => true, setInferenceMode: (mode) => { state.inferenceMode = mode; },
    l, updateStatusDisplay() {}, showToast: (text) => toasts.push(text),
  });
  assert.equal(await back(), true);
  assert.equal(state.inferenceMode, "official");
  assert.equal(state.autoLocalFallback, false);
  assert.match(toasts[0], /已恢复/u);
  // A user-chosen local mode is never overridden.
  const manual = { autoLocalFallback: false, inferenceMode: "local", busy: false };
  const keep = fn("maybeReturnToCloud", { state: manual, quickCloudProbe: async () => true, setInferenceMode() { throw new Error("no"); }, l, updateStatusDisplay() {}, showToast() {} });
  assert.equal(await keep(), false);
});

test("stall restores the button and offers retry plus the other engine", () => {
  for (const id of ["rvc-stall-actions", "rvc-stall-message", "rvc-stall-retry", "rvc-stall-switch"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  const elements = {};
  const el = (id) => (elements[id] ||= { id, hidden: true, disabled: true, textContent: "", dataset: {}, setAttribute(k, v) { this[k] = v; } });
  const show = fn("showStallActions", {
    state: { busy: false, inferenceMode: "local", catalog: [{ id: "hoshino", chunks: ["a"] }], selectedModelId: "hoshino" },
    document: { getElementById: el }, l, t: (key) => key, OWN_MODEL_PREFIX: "own:",
    hasDeviceFallbackModel: () => true, isAppleMobile: () => false,
  });
  show({ mode: "local", reasonZh: "下载卡住", reasonEn: "stalled" });
  assert.equal(elements["rvc-convert"].disabled, false);
  assert.equal(elements["rvc-stall-actions"].hidden, false);
  assert.equal(elements["rvc-stall-message"].textContent, "下载卡住");
  assert.equal(elements["rvc-stall-switch"].hidden, false);
  assert.equal(elements["rvc-stall-switch"].dataset.target, "official");
  assert.match(source, /convertBtn\.addEventListener\("click", \(\) => startConversion\(\)\)/u);
  assert.match(source, /stallRetry: "重试"/u);
  assert.match(source, /stallRetry: "Retry"/u);
});

test("page supervisor aborts a run whose status and progress stop changing", async () => {
  const state = { busy: false, lastConversionActivityAt: 0, conversionStallLimitMs: 0, autoLocalFallback: false, inferenceMode: "local" };
  let abortedWith = null;
  let restored = null;
  const start = fn("startConversion", {
    state, hideStallActions() {}, maybeReturnToCloud: async () => false, RvcStallError,
    RVC_STALL: { globalNoProgressMs: 50 }, runRvcInference: null, forceRestoreAfterStall: (error) => { restored = error; },
    setInterval: (cb) => setInterval(cb, 20), setTimeout: (cb) => setTimeout(cb, 10), clearInterval, clearTimeout,
  });
  const result = start(() => {
    state.busy = true;
    state.localRunController = { abort: (error) => { abortedWith = error; } };
    return new Promise(() => {});
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(abortedWith?.code, "RVC_NO_PROGRESS");
  assert.equal(restored?.code, "RVC_NO_PROGRESS", "page restored even if the run never unwinds");
  void result;
});
