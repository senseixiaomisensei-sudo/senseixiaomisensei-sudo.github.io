import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientPath = new URL("../assets/postprep.js", import.meta.url);
const trustPagePath = new URL("../publish-trust.html", import.meta.url);
const passportPagePath = new URL("../skill-passport.html", import.meta.url);
const privacyPagePath = new URL("../privacy.html", import.meta.url);

test("publish trust keeps ordinary checks in the client and gates editorial notes behind an explicit cloud action", async () => {
  const [client, page, privacy] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(trustPagePath, "utf8"),
    readFile(privacyPagePath, "utf8"),
  ]);

  assert.match(page, /data-page="trust"/);
  assert.match(page, /id="trust-input"/);
  assert.match(page, /id="trust-ai-use"/);
  assert.match(page, /id="trust-deep-action"/);
  assert.match(page, /id="trust-pack"/);
  assert.match(client, /function localPublishTrustReport\(value, aiUse\)/);
  assert.match(client, /collectPublicLinks/);
  assert.match(client, /publishClaimSignalCount/);
  assert.match(client, /requestCloudText\("publishTrust"/);
  assert.match(client, /input\.addEventListener\("input"/);
  assert.match(privacy, /发布可信包/);
});

test("Skill passport uses client static analysis for local files and the protected route for GitHub public content", async () => {
  const [client, page] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(passportPagePath, "utf8"),
  ]);

  assert.match(page, /data-page="passport"/);
  assert.match(page, /id="passport-local-file"/);
  assert.match(page, /id="passport-github-url"/);
  assert.match(page, /id="passport-github-inspect"/);
  assert.match(page, /id="passport-deep-action"/);
  assert.match(page, /id="passport-pin"/);
  assert.match(client, /function skillStaticCapabilityReport\(value, source\)/);
  assert.match(client, /new FileReader\(\)/);
  assert.match(client, /requestCloudText\("skillPassport", address\)/);
  assert.match(client, /requestCloudText\("skillPassportExplain", currentReport\.content\)/);
  assert.match(client, /INVALID_GITHUB_SKILL_URL/);
  assert.match(client, /“未发现匹配信号”/);
  assert.doesNotMatch(client, /api\.github\.com/);
  assert.match(client, /\{ id: "passport", href: "skill-passport\.html"/);
});
