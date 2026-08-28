import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(new URL("../assets/rvc.js", import.meta.url), "utf8");
function readFunction(name) {
  const start = client.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const body = client.indexOf("{", start);
  let depth = 0;
  for (let i = body; i < client.length; i++) {
    if (client[i] === "{") depth++;
    if (client[i] === "}" && --depth === 0) return client.slice(start, i + 1);
  }
  throw new Error(`Unterminated ${name}`);
}
const limit = Function(`const LOCAL_MAX_AUDIO_SECONDS=20, DEVICE_FALLBACK_MAX_AUDIO_SECONDS=1200, MAX_AUDIO_SECONDS=600; return (${readFunction("audioDurationLimit")});`)();
const timeout = Function(`return (${readFunction("localInferenceTimeoutMs")});`)();

test("20-minute local input does not expand cloud or unverified imported-model limits", () => {
  assert.equal(limit("local", "hoshino"), 1200);
  assert.equal(1200 <= limit("local", "hoshino"), true);
  assert.equal(1200.01 <= limit("local", "hoshino"), false);
  assert.equal(limit("official", "hoshino"), 600);
  assert.equal(limit("local", "own:custom"), 20);
  assert.match(client, /decoded\.duration > audioDurationLimit\(state\.inferenceMode, state\.selectedModelId\)/u);
  assert.match(client, /safeFallbackDuration > audioDurationLimit\(state\.inferenceMode, state\.selectedModelId\)/u);
  assert.match(client, /if \(!usesBrowserInference && state\.audio\.duration > MAX_AUDIO_SECONDS\)/u);
  assert.match(client, /async function runOfficialRvcInference[\s\S]*?if \(state\.audio\.duration > MAX_AUDIO_SECONDS\)[\s\S]*?return;/u);
});

test("local deadline supports 20 minutes and leaves existing short budgets unchanged", () => {
  assert.equal(timeout(20, false), 120000);
  for (const duration of [1, 20, 60, 180, 300]) {
    assert.equal(timeout(duration, true), Math.min(1800000, Math.max(180000, Math.ceil(duration * 6000) + 180000)));
  }
  assert.ok(timeout(1200, true) >= 1200 * 10000);
  assert.ok(timeout(1200, true) <= 4 * 60 * 60 * 1000);
});
