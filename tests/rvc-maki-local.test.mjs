import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const client = await readFile(new URL("assets/rvc.js", root), "utf8");
const catalog = JSON.parse(await readFile(new URL("assets/rvc-models.json", root), "utf8"));
const manifest = JSON.parse(await readFile(new URL("models/manifest.json", root), "utf8"));

test("Maki V1 uses its own projected feature model and complete published chunks", async () => {
  const maki = catalog.models.find(model => model.id === "maki");
  assert.equal(maki.supportsDevice, true);
  assert.equal(maki.rvcVersion, "v1");
  assert.deepEqual(catalog.baseModels.hubertV1.chunks, manifest["hubert-v1.onnx"].chunks);
  assert.match(client, /selectedModel\.rvcVersion === "v1"/);
  assert.match(client, /useV1 \? "hubert-v1.onnx" : "hubert.onnx"/);
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
  const start = client.indexOf("async function readableCachedModel(");
  const end = client.indexOf("\n  }", start) + 4;
  const bytes = new Uint8Array(1024 * 1024 + 1).fill(31);
  const blob = new Blob([bytes]);
  let removed = "";
  const read = Function("getCachedItem", "removeCachedItem", `return (${client.slice(start, end)});`)(
    async () => blob, async key => { removed = key; },
  );
  assert.deepEqual(new Uint8Array(await (await read("model")).arrayBuffer()), bytes);
  blob.arrayBuffer = async () => { throw new DOMException("unreadable", "NotReadableError"); };
  assert.equal(await read("model"), null);
  assert.equal(removed, "model");
});

test("local continuation button is visible before a cloud failure", async () => {
  const page = await readFile(new URL("rvc.html", root), "utf8");
  const button = page.match(/<button[^>]+id="rvc-song-local-fallback"[^>]*>/)[0];
  assert.doesNotMatch(button, /\bhidden\b/);
});
