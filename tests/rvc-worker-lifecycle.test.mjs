import assert from "node:assert/strict";
import test from "node:test";
import { runPipelineInWorker } from "../assets/rvc-engine/rvc-web-runtime.js";

function model(name) {
  return { name, arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
}

async function exercise(kind) {
  const previous = {
    fetch: globalThis.fetch, Worker: globalThis.Worker,
    create: URL.createObjectURL, revoke: URL.revokeObjectURL,
  };
  const events = { created: 0, revoked: 0, terminated: 0 };
  globalThis.fetch = async () => new Response("self.onmessage = () => {}", { status: 200 });
  URL.createObjectURL = () => { events.created += 1; return "blob:worker-test"; };
  URL.revokeObjectURL = () => { events.revoked += 1; };
  globalThis.Worker = class {
    constructor() {
      if (kind === "constructor") throw new Error("blocked");
    }
    terminate() { events.terminated += 1; }
    postMessage() {
      if (kind === "post") throw new Error("clone failed");
      if (kind === "complete") queueMicrotask(() => this.onmessage?.({ data: { type: "COMPLETE", result: { ok: true } } }));
      if (kind === "runtime") queueMicrotask(() => this.onerror?.({ message: "crashed", preventDefault() {} }));
      if (kind === "message") queueMicrotask(() => this.onmessageerror?.());
    }
  };
  const controller = new AbortController();
  if (kind === "abort") setTimeout(() => controller.abort(), 5);
  try {
    const promise = runPipelineInWorker(
      { workerUrl: "https://example.test/worker.js" },
      { model: model("voice"), contentVec: model("hubert"), rmvpe: model("rmvpe") },
      new Float32Array([.1]), 16000, {}, { timeout: 20, signal: controller.signal },
    );
    if (kind === "complete") assert.deepEqual(await promise, { ok: true });
    else await assert.rejects(promise);
    assert.equal(events.created, 1);
    assert.equal(events.revoked, 1);
    assert.equal(events.terminated, kind === "constructor" ? 0 : 1);
  } finally {
    globalThis.fetch = previous.fetch;
    globalThis.Worker = previous.Worker;
    URL.createObjectURL = previous.create;
    URL.revokeObjectURL = previous.revoke;
  }
}

test("worker releases URL and timers on success, error, timeout, cancellation and setup failure", async () => {
  for (const kind of ["complete", "runtime", "message", "timeout", "abort", "constructor", "post"]) {
    await exercise(kind);
  }
});
