import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";
const root = path.resolve(import.meta.dirname, "..");
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + new URL(req.url, "http://localhost").pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", error => console.error(error.message));
  await page.addInitScript(() => localStorage.setItem("postprep_rvc_custom_collections_v1", JSON.stringify(["喜羊羊与灰太狼", "保留分区"])));
  await page.goto("http://127.0.0.1:" + server.address().port + "/rvc.html");
  await page.locator('[data-model-id="ayane"]').waitFor();
  assert.doesNotMatch(await page.locator("#rvc-collection-nav").innerText(), /喜羊羊/);
  assert.match(await page.locator("#rvc-collection-nav").innerText(), /保留分区/);
  for (const school of ["millennium", "gehenna", "trinity", "shittim"]) {
    await page.selectOption("#rvc-school-filter", school);
    assert.ok(await page.locator("#rvc-model-gallery [data-model-id]").count() > 0, school);
  }
  await page.selectOption("#rvc-school-filter", "abydos");
  assert.equal(await page.locator("#rvc-model-gallery [data-model-id]").count(), 5);
  await page.locator("#rvc-model-search").fill("Ayane");
  assert.equal(await page.locator("#rvc-model-gallery [data-model-id]").count(), 1);
  await page.locator("#rvc-model-search").fill("");
  for (const school of ["highlander", "wildhunt"]) {
    await page.selectOption("#rvc-school-filter", school);
    assert.equal(await page.locator("#rvc-model-gallery [data-model-id]").count(), 0);
    assert.match(await page.locator("#rvc-school-roster").innerText(), /声线待接入/);
  }
  await page.locator('[data-collection-id="jujutsu-kaisen"]').click();
  assert.equal(await page.locator("#rvc-school-browser").isVisible(), false);
  assert.equal(await page.locator("#rvc-model-gallery [data-model-id]").count(), 5);
  await page.locator('[data-collection-id="blue-archive"]').click();
  await page.selectOption("#rvc-school-filter", "abydos");
  assert.equal(await page.locator("#rvc-model-gallery [data-model-id]").count(), 5);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  console.log("PASS: school filters, search, pending voices, collection switching, mobile width");
} finally {
  await browser?.close();
  server.close();
}
