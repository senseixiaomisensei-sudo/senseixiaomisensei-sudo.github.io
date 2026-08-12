import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientPath = new URL("../assets/postprep.js", import.meta.url);

test("Turnstile uses a visible auto-running dialog and reports recoverable states", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.match(source, /postprep-turnstile-overlay/);
  assert.match(source, /execution:\s*"render"/);
  assert.match(source, /appearance:\s*"always"/);
  assert.match(source, /"unsupported-callback"/);
  assert.match(source, /HUMAN_VERIFICATION_CANCELLED/);
  assert.match(source, /HUMAN_VERIFICATION_TIMEOUT/);
  assert.doesNotMatch(source, /turnstile\.execute\(/);
});
