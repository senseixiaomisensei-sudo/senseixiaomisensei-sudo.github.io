import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../assets/rvc.js", import.meta.url), "utf8");
const start = source.indexOf("  function encodeWav16AtRate(");
const end = source.indexOf("\n  // 云端纯人声", start);
const encode = Function(source.slice(start, end) + "; return encodeWav16AtRate;")();
test("cloud polish emits valid mono PCM and sanitizes non-finite samples", () => {
  const view = new DataView(encode([0, 0.5, -0.5, NaN, Infinity, -Infinity], 40000));
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 40000);
  assert.equal(view.getUint32(28, true), 80000);
  assert.equal(view.getUint16(32, true), 2);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getInt16(46, true), 16383);
  for (const offset of [50, 52, 54]) assert.equal(view.getInt16(offset, true), 0);
});
