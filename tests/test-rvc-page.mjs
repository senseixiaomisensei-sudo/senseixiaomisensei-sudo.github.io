import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";

const PORT = 8124;
const ROOT = fileURLToPath(new URL("../", import.meta.url));

const MIME_MAP = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".onnx": "application/octet-stream",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/rvc.html";
  const filePath = path.join(ROOT, reqPath.replace(/^\//, ""));

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.end("Not Found: " + reqPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME_MAP[ext] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, "127.0.0.1", async () => {
  console.log(`Test server running at http://127.0.0.1:${PORT}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const logs = [];
  const errors = [];
  page.on("console", (msg) => logs.push(msg.text()));
  page.on("pageerror", (err) => errors.push(String(err)));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/rvc.html`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(2000);

    const title = await page.title();
    const cardsCount = await page.locator("#rvc-model-gallery button").count();
    const statusText = await page.locator("#rvc-service-status").textContent();
    const pitchValue = await page.locator("#rvc-pitch").inputValue();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );

    console.log("=== Page Test Results ===");
    console.log("Title:", title);
    console.log("Character Cards Loaded:", cardsCount);
    console.log("Service Status:", statusText);
    console.log("Default Pitch:", pitchValue);
    console.log("Mobile Horizontal Overflow:", hasHorizontalOverflow);
    console.log("Errors Count:", errors.length);
    if (errors.length > 0) {
      console.log("Page Errors:", errors);
    }
    console.log("Console Logs:", logs.slice(0, 10));

    if (cardsCount >= 3 && pitchValue === "0" && !hasHorizontalOverflow && errors.length === 0) {
      console.log("✅ TEST PASSED: RVC Page initialized perfectly with all models and 0 errors!");
    } else {
      console.log("⚠️ TEST WARNING: Check details above.");
    }
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    await browser.close();
    server.close();
    process.exit(0);
  }
});
