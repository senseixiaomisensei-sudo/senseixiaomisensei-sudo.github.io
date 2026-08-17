import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";

const PORT = 8126;
const ROOT = "E:\\大肥鱼\\site";

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
  const page = await browser.newPage();

  page.on("console", (msg) => console.log("[Browser Console]", msg.text()));
  page.on("pageerror", (err) => console.log("[Browser Error]", String(err)));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/rvc.html`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500);

    // Set input file using test audio
    const testAudioPath = "E:\\大肥鱼\\rvc-local\\convert\\test-input-16k.wav";
    console.log("Setting input audio file:", testAudioPath);
    const fileInput = await page.locator("#rvc-audio-file");
    await fileInput.setInputFiles(testAudioPath);

    await page.waitForTimeout(1000);
    const audioStatus = await page.locator("#rvc-audio-status").textContent();
    console.log("Audio status:", audioStatus);

    const convertBtn = await page.locator("#rvc-convert");
    const isEnabled = await convertBtn.isEnabled();
    console.log("Convert button enabled:", isEnabled);

    if (isEnabled) {
      console.log("Triggering conversion click...");
      await convertBtn.click();

      // Poll status for up to 90 seconds
      let finished = false;
      const start = Date.now();
      while (Date.now() - start < 90000) {
        const currentStatus = await page.locator("#rvc-service-status").textContent();
        console.log(`[${Math.round((Date.now() - start)/1000)}s] Status:`, currentStatus);

        const resultVisible = await page.locator("#rvc-result").isVisible();
        if (resultVisible) {
          console.log("🎉 Result section is VISIBLE!");
          const resultMeta = await page.locator("#rvc-result-meta").textContent();
          console.log("Result Meta:", resultMeta);
          finished = true;
          break;
        }
        await page.waitForTimeout(3000);
      }

      if (finished) {
        console.log("✅ FULL END-TO-END RVC IN-BROWSER INFERENCE PASSED!");
      } else {
        console.log("⏳ Inference in progress or timed out.");
      }
    }
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await browser.close();
    server.close();
    process.exit(0);
  }
});
