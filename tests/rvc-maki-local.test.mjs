import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const client = await readFile(new URL("assets/rvc.js", root), "utf8");
const catalog = JSON.parse(await readFile(new URL("assets/rvc-models.json", root), "utf8"));
const manifest = JSON.parse(await readFile(new URL("models/manifest.json", root), "utf8"));

function functionSource(name, async = false) {
  const start = client.indexOf(`${async ? "async " : ""}function ${name}(`);
  assert.ok(start >= 0);
  return client.slice(start, client.indexOf("\n  }", start) + 4);
}

test("Maki V1 uses its own projected feature model and complete published chunks", async () => {
  const maki = catalog.models.find(model => model.id === "maki");
  assert.equal(maki.supportsDevice, true);
  assert.equal(maki.rvcVersion, "v1");
  assert.deepEqual(catalog.baseModels.hubertV1.chunks, manifest["hubert-v1.onnx"].chunks);
  const resolve = Function("EMBEDDED_BASE_MODELS", `return (${functionSource("resolveContentEncoder")});`)(catalog.baseModels);
  const encoder = resolve(maki, catalog.baseModels);
  assert.equal(encoder.config, catalog.baseModels.hubertV1);
  assert.equal(encoder.featureDimension, 256);
  assert.equal(encoder.outputLayer, 9);
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256");
  let bytes = 0;
  for (const chunk of catalog.baseModels.hubertV1.chunks) {
    const data = await readFile(new URL(chunk, root));
    assert.ok(data.length <= 25 * 1024 * 1024);
    bytes += data.length;
    digest.update(data);
  }
  assert.equal(bytes, manifest["hubert-v1.onnx"].totalSize);
  assert.equal(digest.digest("hex"), manifest["hubert-v1.onnx"].sha256);
});

test("unreadable model cache is evicted, readable cache retains exact bytes", async () => {
  const { webcrypto, createHash } = await import("node:crypto");
  const verify = Function("crypto", `return (${functionSource("verifyModelBytes", true)});`)(webcrypto);
  const bytes = new Uint8Array(1024 * 1024 + 1).fill(31);
  const blob = new Blob([bytes]);
  let removed = "";
  const read = Function("getCachedItem", "removeCachedItem", "verifyModelBytes", `return (${functionSource("readableCachedModel", true)});`)(
    async () => blob, async key => { removed = key; }, verify,
  );
  assert.deepEqual(new Uint8Array(await (await read("model")).arrayBuffer()), bytes);
  const validHash = createHash("sha256").update(bytes).digest("hex");
  assert.ok(await read("model", validHash));
  assert.equal(await read("model", "0".repeat(64)), null);
  assert.equal(removed, "model");
  blob.arrayBuffer = async () => { throw new DOMException("unreadable", "NotReadableError"); };
  assert.equal(await read("model"), null);
  assert.equal(removed, "model");
});

test("local continuation button is visible before a cloud failure", async () => {
  const page = await readFile(new URL("rvc.html", root), "utf8");
  const button = page.match(/<button[^>]+id="rvc-song-local-fallback"[^>]*>/)[0];
  assert.doesNotMatch(button, /\bhidden\b/);
});
