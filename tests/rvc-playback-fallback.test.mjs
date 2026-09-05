import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../assets/rvc.js", import.meta.url), "utf8");
test("complete browser client parses without duplicate declarations", () => {
  assert.doesNotThrow(() => new Function(source));
});

test("MP3 compatibility outputs bypass WAV polish", () => {
  assert.match(source, /const outputBlob = state.audioMode === "song" \|\| outputFormat === "mp3"\s*\? rawOutputBlob/);
});

test("native demux failure on polished audio retries the original downloaded file", async () => {
  const start = source.indexOf("        if (polishedVoiceOutput) {");
  const end = source.indexOf("        } else {", start);
  const body = source.slice(start + "        if (polishedVoiceOutput) {".length, end);
  const state = { resultUrl: "blob:polished" };
  const resultDownload = {};
  const rawOutputBlob = new Blob(["original"]);
  const attempts = [];
  const run = new Function("state", "resultDownload", "rawOutputBlob", "attachResultAudio", "URL", "selectedModel", "outputFormat", "resultAudio", `return (async () => {${body}})()`);
  await run(state, resultDownload, rawOutputBlob, async (_, url) => {
    attempts.push(url);
    if (url === "blob:polished") throw new Error("DEMUXER_ERROR_NO_SUPPORTED_STREAMS");
  }, { revokeObjectURL() {}, createObjectURL(blob) { assert.equal(blob, rawOutputBlob); return "blob:original"; } }, { id: "maki" }, "wav", {});
  assert.deepEqual(attempts, ["blob:polished", "blob:original"]);
  assert.equal(resultDownload.href, "blob:original");
  assert.match(resultDownload.download, /\.wav$/);
});
