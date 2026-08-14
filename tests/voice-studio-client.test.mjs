import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("voice studio has a visible rights gate, local preflight, and no default upload path", async () => {
  const [page, client, config, policy] = await Promise.all([
    readFile(new URL("voice-studio.html", root), "utf8"),
    readFile(new URL("assets/voice-studio.js", root), "utf8"),
    readFile(new URL("assets/postprep-config.js", root), "utf8"),
    readFile(new URL("VOICE_USE_POLICY.md", root), "utf8"),
  ]);

  assert.match(page, /data-page="voice"/);
  assert.match(page, /viewport-fit=cover/);
  assert.match(page, /id="voice-reference-file"/);
  assert.match(page, /id="voice-source-file"/);
  assert.match(page, /id="voice-rights-confirmed"/);
  assert.match(page, /id="voice-rights-phrase"/);
  assert.match(page, /id="voice-disclosure-confirmed"/);
  assert.match(page, /id="voice-generate"[^>]*aria-describedby="voice-service-status"/);
  assert.match(page, /id="voice-generate"[^>]*min-h-12/);
  assert.match(page, /id="toast"[^>]*w-\[calc\(100%-2rem\)\]/);
  assert.match(page, /media-src 'self' blob: https:\/\/postprep-text-gateway\.postprep\.workers\.dev/);
  assert.match(client, /decodeAudioData/);
  assert.match(client, /MAX_REFERENCE_BYTES/);
  assert.match(client, /I HAVE THE RIGHTS/);
  assert.match(client, /await verify\(VOICE_ACTION\)/);
  assert.match(client, /state\.backend !== "ready"/);
  assert.match(client, /handlePrimaryAction/);
  assert.match(client, /checkService/);
  assert.match(client, /await checkAvailability\(\)/);
  assert.doesNotMatch(client, /VOICE_INFERENCE_TOKEN/);
  assert.doesNotMatch(client, /api\.github\.com/);
  assert.match(config, /POSTPREP_VOICE_API_ENDPOINT/);
  assert.match(policy, /免责声明不能使未授权克隆变为合法/);
  assert.match(policy, /unauthorized real person/);
});

test("voice routes are constrained to the protected gateway and a fixed backend contract", async () => {
  const [gateway, voice, shared, workerConfig, deployment] = await Promise.all([
    readFile(new URL("worker/api-gateway.js", root), "utf8"),
    readFile(new URL("functions/api/voice.js", root), "utf8"),
    readFile(new URL("functions/api/_voice-shared.js", root), "utf8"),
    readFile(new URL("worker/wrangler.toml", root), "utf8"),
    readFile(new URL("docs/VOICE_STUDIO_DEPLOYMENT.md", root), "utf8"),
  ]);

  assert.match(gateway, /POSTPREP_VOICE_RATE_LIMITER/);
  assert.match(gateway, /POSTPREP_VOICE_UPSTREAM_URL/);
  assert.match(gateway, /MAX_VOICE_UPLOAD_BYTES/);
  assert.match(gateway, /isOutputJobId/);
  assert.match(voice, /VOICE_RIGHTS_CONFIRMATION_REQUIRED/);
  assert.match(voice, /VOICE_AI_DISCLOSURE_REQUIRED/);
  assert.match(voice, /referenceAudio/);
  assert.match(voice, /sourceAudio/);
  assert.doesNotMatch(voice, /fetch\(.*body\.url/s);
  assert.match(shared, /url\.protocol !== "https:"/);
  assert.match(shared, /url\.pathname !== "\/v1\/jobs"/);
  assert.match(workerConfig, /POSTPREP_VOICE_RATE_LIMITER/);
  assert.match(deployment, /不会把音频发送到一个空地址/);
});
