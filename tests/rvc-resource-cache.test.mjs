import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../assets/rvc.js", import.meta.url), "utf8");
const start = source.indexOf('  const CHARACTER_MODEL_ASSET_VERSION =');
const end = source.indexOf('  function deriveStableNoiseSeed', start);
assert.ok(start >= 0 && end > start);
const api = vm.runInNewContext(`${source.slice(start, end)}\n({characterModelCacheKey, retrievalCacheKey, versionCharacterChunkPath})`);
const model = { id: "gojo", resourceRevision: "a".repeat(64), indexSha256: "b".repeat(64), retrieval: "models/characters/gojo/retrieval.bin" };

test("same role with replaced generator cannot reuse old generator or retrieval cache", () => {
  const replacement = { ...model, resourceRevision: "c".repeat(64) };
  assert.notEqual(api.characterModelCacheKey(model), api.characterModelCacheKey(replacement));
  assert.notEqual(api.retrievalCacheKey(model), api.retrievalCacheKey(replacement));
  const path = "models/characters/gojo/chunk_0.bin";
  assert.notEqual(api.versionCharacterChunkPath(path, model), api.versionCharacterChunkPath(path, replacement));
});

test("index-only replacement refreshes retrieval URL and cache while preserving generator cache", () => {
  const replacement = { ...model, indexSha256: "d".repeat(64) };
  assert.equal(api.characterModelCacheKey(model), api.characterModelCacheKey(replacement));
  assert.notEqual(api.retrievalCacheKey(model), api.retrievalCacheKey(replacement));
  assert.notEqual(api.versionCharacterChunkPath(model.retrieval, model), api.versionCharacterChunkPath(replacement.retrieval, replacement));
});

test("display changes do not invalidate bytes; user-owned model keys remain compatible", () => {
  assert.equal(api.characterModelCacheKey(model), api.characterModelCacheKey({ ...model, name: "New label" }));
  assert.equal(api.characterModelCacheKey({ id: "own:abc", sha256: "e".repeat(64) }), "own:abc.onnx");
  const path = api.versionCharacterChunkPath("models/characters/gojo/chunk_0.bin?download=1", model);
  assert.match(path, /\?download=1&model=/);
});

test("every published role uses its manifest revision rather than a shared date", async () => {
  const catalog = JSON.parse(await readFile(new URL("../assets/rvc-models.json", import.meta.url), "utf8"));
  for (const entry of catalog.models) {
    assert.match(entry.resourceRevision || entry.sha256, /^[a-f0-9]{64}$/i);
    assert.ok(api.characterModelCacheKey(entry).includes(entry.resourceRevision || entry.sha256));
    if (entry.retrieval) {
      const revision = entry.retrievalSha256 || entry.indexSha256;
      assert.match(revision, /^[a-f0-9]{64}$/i);
      assert.ok(api.versionCharacterChunkPath(entry.retrieval, entry).includes(revision));
    }
  }
});

test("user-requested cache clearing removes current and legacy role cache entries", async () => {
  const deletion = [];
  const clearSource = source.match(/  async function clearModelCache\(\) \{[\s\S]*?\n  \}/)[0];
  const context = {
    state: { catalog: [{ ...model, chunks: ["models/characters/gojo/chunk_0.bin"] }] },
    removeCachedItem: async (key) => deletion.push(key),
    getChunkMirrorUrls: (path) => [path],
    showToast: () => {},
    checkCacheStatus: async () => {},
    console,
  };
  await vm.runInNewContext(`${source.slice(start, end)}\n${clearSource}\nclearModelCache()`, context);
  assert.ok(deletion.includes(api.characterModelCacheKey(model)));
  assert.ok(deletion.includes(api.retrievalCacheKey(model)));
  assert.ok(deletion.includes("gojo.20260919-v37.onnx"));
  assert.ok(deletion.includes("gojo.20260919-v37.retrieval.bin"));
  assert.ok(deletion.includes("chunk:models/characters/gojo/chunk_0.bin?model=20260919-v37"));
});
