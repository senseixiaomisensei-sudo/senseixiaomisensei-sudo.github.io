import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('assets/rvc.js', root), 'utf8');
const catalog = JSON.parse(await readFile(new URL('assets/rvc-models.json', root), 'utf8'));
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}
const resolve = Function('EMBEDDED_BASE_MODELS', `return (${extract('resolveContentEncoder')})`)(catalog.baseModels);

test('checkpoint-required Japanese encoder cannot be replaced with a same-dimension default', () => {
  const hoshino = { rvcVersion: 'v2', contentEncoder: {
    name: 'hubert-base-japanese', outputLayer: 12, featureDimension: 768
  } };
  const resolved = resolve(hoshino, catalog.baseModels);
  assert.equal(resolved.name, 'hubert-base-japanese');
  assert.equal(resolved.outputLayer, 12);
  assert.equal(resolved.featureDimension, 768);
  assert.notEqual(resolved.config.chunks[0], catalog.baseModels.hubert.chunks[0]);
  assert.ok(resolved.cacheKey.includes(resolved.config.sha256));
  assert.throws(() => resolve({ contentEncoder: { name: 'unknown-768' } }, catalog.baseModels));
  assert.throws(() => resolve({ ...hoshino, rvcVersion: 'v1' }, catalog.baseModels));
  assert.throws(() => resolve({ contentEncoder: { name: 'hubert_base', outputLayer: 9 } }, catalog.baseModels));
  assert.equal(resolve({ rvcVersion: 'v1' }, catalog.baseModels).featureDimension, 256);
});

test('Japanese ONNX fragments match their immutable content hashes', async () => {
  const config = catalog.baseModels.hubertJapanese;
  const full = createHash('sha256');
  let bytes = 0;
  assert.equal(config.chunks.length, config.chunkSha256.length);
  for (const [i, path] of config.chunks.entries()) {
    const data = await readFile(new URL(path, root));
    assert.equal(createHash('sha256').update(data).digest('hex'), config.chunkSha256[i]);
    assert.ok(path.includes(config.sha256.slice(0, 16)));
    full.update(data); bytes += data.length;
  }
  assert.equal(bytes, config.totalSize);
  assert.equal(full.digest('hex'), config.sha256);
});

test('download integrity checks reject modified bytes before ONNX parsing', async () => {
  const verify = Function('crypto', 'l', `return (async ${extract('verifyModelBytes')})`)(webcrypto, zh => zh);
  const bytes = new Uint8Array([12, 34, 56, 78]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  await verify(bytes, hash);
  bytes[1] ^= 1;
  await assert.rejects(verify(bytes, hash), /校验失败/);
});
