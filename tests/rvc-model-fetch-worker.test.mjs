// Model download worker (2026-11-01 freeze1): downloads, verifies and
// assembles model chunks off the page thread, ranks mirrors by a concurrent
// probe and switches away from an unreachable one, and throttles progress.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import vm from "node:vm";

const workerSource = await readFile(new URL("../assets/rvc-engine/model-fetch.worker.js", import.meta.url), "utf8");
const rvcSource = await readFile(new URL("../assets/rvc.js", import.meta.url), "utf8");
const html = await readFile(new URL("../rvc.html", import.meta.url), "utf8");
const versionJson = JSON.parse(await readFile(new URL("../assets/rvc-version.json", import.meta.url), "utf8"));

function loadWorker(fetchImpl) {
  const messages = [];
  const self = { postMessage: (msg) => messages.push(msg) };
  const ctx = vm.createContext({ self, fetch: fetchImpl, setTimeout, clearTimeout, AbortController, URL, Blob,
    Uint8Array, Float64Array, ArrayBuffer, Promise, Map, Set, Array, Number, String, Object, Error, Math, Date, crypto: globalThis.crypto, console });
  vm.runInContext(workerSource, ctx);
  const run = (m) => new Promise((resolve) => {
    const tick = setInterval(() => {
      const end = messages.find((x) => x.type === "done" || x.type === "error");
      if (end) { clearInterval(tick); resolve(end); }
    }, 5);
    self.onmessage({ data: m });
  });
  return { messages, run, self };
}

const parts = [Buffer.alloc(1000, 1), Buffer.alloc(1000, 2), Buffer.alloc(500, 3)];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const chunks = parts.map((b, i) => ({
  cacheKey: `t:${i}`, sha256: sha(b),
  mirrors: [`https://blocked.example/c${i}`, `https://good.example/c${i}`],
}));
const job = (extra = {}) => ({ type: "load", id: 1, name: "t", chunks, totalSize: 2500, returnBytes: true, checkWhole: false,
  concurrency: 2, progressMs: 10000, probeMs: 300, connectMs: 300, inactivityMs: 300, db: { dbName: "x", storeName: "y", openMs: 50 }, ...extra });

test("worker skips an unreachable mirror, verifies and assembles the model", async () => {
  const fetchImpl = async (url, { signal } = {}) => {
    if (url.startsWith("https://blocked.")) return new Promise((_, rej) => signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const i = Number(url.slice(-1));
    return new Response(parts[i], { headers: { "content-length": String(parts[i].length) } });
  };
  const w = loadWorker(fetchImpl);
  const done = await w.run(job());
  assert.equal(done.type, "done", JSON.stringify(done));
  assert.equal(done.size, 2500);
  assert.deepEqual(Buffer.from(done.buffer), Buffer.concat(parts));
  const probe = w.messages.find((m) => m.type === "probe");
  assert.ok(probe, "probe result reported to the page");
  assert.deepEqual(probe.results.map((r) => [r.host, r.ok]), [["blocked.example", false], ["good.example", true]]);
  // progressMs=10000: only forced progress (phase changes + per-chunk completion), never one per read.
  const progress = w.messages.filter((m) => m.type === "progress");
  assert.ok(progress.length <= 2 + 1 + parts.length + 1, `progress throttled (${progress.length})`);
});

test("worker reports a mirror switch when the ranked mirror fails mid-download", async () => {
  let flaky = 0;
  const fetchImpl = async (url) => {
    const i = Number(url.slice(-1));
    if (url.startsWith("https://blocked.")) {
      if (flaky++ === 0) return new Response(parts[i]); // wins the probe
      return new Response("nope", { status: 503 });
    }
    await new Promise((r) => setTimeout(r, 20));
    return new Response(parts[i]);
  };
  const w = loadWorker(fetchImpl);
  const done = await w.run(job({ returnBytes: false }));
  assert.equal(done.type, "done", JSON.stringify(done));
  assert.equal(done.buffer, undefined, "warm-up does not send bytes back");
  assert.ok(w.messages.some((m) => m.type === "switch" && m.from === "blocked.example" && m.to === "good.example"));
});

test("worker fails fast with a clear code when every mirror is unreachable", async () => {
  const w = loadWorker(async () => { throw new TypeError("Failed to fetch"); });
  const end = await w.run(job());
  assert.equal(end.type, "error");
  assert.equal(end.code, "RVC_MIRRORS_UNREACHABLE");
});

test("page build version, version.json and cache-busting query strings agree", () => {
  const build = rvcSource.match(/const RVC_BUILD = "([^"]+)"/u)?.[1];
  assert.ok(build);
  assert.equal(versionJson.version, build);
  assert.match(html, new RegExp(`assets/rvc\\.js\\?v=${build}`, "u"));
  assert.match(rvcSource, new RegExp(`model-fetch\\.worker\\.js\\?v=${build}`, "u"));
  assert.match(rvcSource, /async function checkRvcBuild/u);
  assert.match(rvcSource, /rvc-version\.json\?t=/u);
});

test("page thread throttles download progress and shows a hint before the first byte", () => {
  const cfg = rvcSource.match(/const MODEL_FETCH = \{ progressMs: (\d+)[^}]*quietHintMs: (\d+)/u);
  assert.ok(cfg, "MODEL_FETCH config present");
  assert.ok(Number(cfg[1]) >= 150, "progress at most ~5/s");
  assert.ok(Number(cfg[2]) < 15000, "quiet hint well under 15 s");
  assert.match(rvcSource, /msg\.type === "switch"/u);
});
