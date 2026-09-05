import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const pages = [
  "index.html",
  "length-checker.html",
  "hashtag-cleaner.html",
  "caption-formatter.html",
  "idea-generator.html",
  "publish-trust.html",
  "skill-passport.html",
  "skills.html",
  "rvc.html",
  "privacy.html",
];
const publisherId = "ca-pub-2239449670938714";
const adScript = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;

test("every public page carries one valid asynchronous AdSense Auto ads tag", async () => {
  for (const page of pages) {
    const html = await readFile(new URL(page, root), "utf8");
    assert.equal((html.match(new RegExp(adScript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1, page);
    assert.match(html, new RegExp(`<meta name="google-adsense-account" content="${publisherId}">`), page);
    assert.doesNotMatch(html, /\[https:\/\/pagead2\.googlesyndication\.com[^\]]*\]\(/u, page);
    assert.match(html, /script-src[^">]*https:/u, `${page} CSP must permit AdSense scripts`);
    assert.match(html, /frame-src https:/u, `${page} CSP must permit AdSense frames`);
  }
});

test("ads.txt authorizes the configured Google seller", async () => {
  const ads = await readFile(new URL("ads.txt", root), "utf8");
  assert.equal(ads.trim(), "google.com, pub-2239449670938714, DIRECT, f08c47fec0942fa0");
});

test("RVC follows the shared language event and localizes its own controls", async () => {
  const html = await readFile(new URL("rvc.html", root), "utf8");
  const source = await readFile(new URL("assets/rvc.js", root), "utf8");
  assert.match(source, /document\.addEventListener\("postprep:languagechange", applyRvcLanguage\)/u);
  assert.match(source, /state\.lang = resolveRvcLanguage\(\)/u);
  assert.match(source, /querySelectorAll\("\[data-rvc-i18n\]"\)/u);
  assert.match(source, /querySelectorAll\("\[data-rvc-i18n-placeholder\]"\)/u);
  assert.match(html, /data-rvc-i18n="modeOfficialTitle"/u);
  assert.match(html, /data-rvc-i18n="sourceTts"/u);
  assert.match(html, /assets\/rvc\.js\?v=20260905-schools/u);
});
