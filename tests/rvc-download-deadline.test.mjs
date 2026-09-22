import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../assets/rvc.js", import.meta.url), "utf8");
const start = source.indexOf("  async function readCloudAudioBody(");
const end = source.indexOf("  async function downloadLongCloudOutput(", start);
const readBody = Function(`${source.slice(start, end)}; return readCloudAudioBody;`)();
test("cloud audio consumes a complete streaming body", async () => {
  const result = await readBody(new Response(new Uint8Array([1, 2, 3])), 100);
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [1, 2, 3]);
});
test("stalled audio cancels its body instead of hanging after headers", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } });
  await assert.rejects(readBody(new Response(stream), 15), /超时/);
  assert.equal(cancelled, true);
});
test("a GitHub static origin is excluded from cloud POST retries", () => {
  const a = source.indexOf("  function buildRvcEndpointCandidates(");
  const b = source.indexOf("  function isEndpointNetworkError(", a);
  const build = Function("getOfficialEndpoint", "globalThis", `${source.slice(a,b)}; return buildRvcEndpointCandidates;`)(
    () => "https://postprep-ae6.pages.dev/rvc-api", { location: { origin: "https://senseixiaomisensei-sudo.github.io" } });
  assert.deepEqual(build(), ["https://postprep-ae6.pages.dev/rvc-api"]);
});
