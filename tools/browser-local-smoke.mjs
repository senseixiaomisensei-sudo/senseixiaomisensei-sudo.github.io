// Manual end-to-end check for the on-device RVC path. Large model downloads
// make this unsuitable for the default unit-test suite.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node tools/browser-local-smoke.mjs <input.wav> <output.wav>");
const root = fileURLToPath(new URL("../", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const target = path.resolve(root, "." + pathname);
  if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader("Content-Type", mime[path.extname(target)] || "application/octet-stream");
  fs.createReadStream(target).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage();
  page.on("pageerror", error => console.error(`page error: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") console.error(`console: ${message.text()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/rvc.html`, { waitUntil: "load" });
  await page.locator("#rvc-mode-local").click();
  await page.locator("#rvc-audio-file").setInputFiles(path.resolve(input));
  await page.locator("#rvc-convert").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.getElementById("rvc-convert").disabled, null, { timeout: 30000 });
  await page.locator("#rvc-convert").click();
  await page.waitForFunction(() => !document.getElementById("rvc-result").hidden || (!document.getElementById("rvc-convert").disabled && document.getElementById("rvc-service-status").textContent.includes("失败")), null, { timeout: 600000 });
  const result = await page.evaluate(async () => {
    const section = document.getElementById("rvc-result");
    if (section.hidden) return { error: document.getElementById("rvc-service-status").textContent };
    const url = document.getElementById("rvc-result-download").href;
    const response = await fetch(url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 16384) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    }
    return { base64: btoa(binary), mime: response.headers.get("Content-Type") };
  });
  if (result.error) throw new Error(`Browser conversion failed: ${result.error}`);
  const bytes = Buffer.from(result.base64, "base64");
  assert.ok(bytes.length > 44);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), bytes);
  console.log(JSON.stringify({ output: path.resolve(output), bytes: bytes.length, mime: result.mime }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
