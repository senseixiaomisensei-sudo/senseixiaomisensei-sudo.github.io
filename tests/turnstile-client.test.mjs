import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientPath = new URL("../assets/postprep.js", import.meta.url);

test("Turnstile uses a visible auto-running dialog and reports recoverable states", async () => {
  const [source, motion] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(new URL("../assets/postprep-motion.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /postprep-turnstile-overlay/);
  assert.match(source, /execution:\s*"render"/);
  assert.match(source, /appearance:\s*"always"/);
  assert.match(source, /"unsupported-callback"/);
  assert.match(source, /HUMAN_VERIFICATION_CANCELLED/);
  assert.match(source, /HUMAN_VERIFICATION_TIMEOUT/);
  assert.match(source, /function turnstileWidgetSize\(mount\)/);
  assert.match(source, /availableWidth > 0 && availableWidth < 300 \? "compact" : "flexible"/);
  assert.match(source, /size: turnstileWidgetSize\(mount\)/);
  assert.match(motion, /max-height: calc\(100dvh - 1\.5rem\)/);
  assert.match(motion, /min-height: 140px/);
  assert.doesNotMatch(source, /turnstile\.execute\(/);
});
