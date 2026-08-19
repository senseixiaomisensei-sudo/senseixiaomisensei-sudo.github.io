import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";

const PORT = 8128;
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
  ".bin": "application/octet-stream",
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

    const testAudioPath = "E:\\大肥鱼\\rvc-local\\convert\\test-input-16k.wav";
    const fileInput = await page.locator("#rvc-audio-file");
    await fileInput.setInputFiles(testAudioPath);
    await page.waitForTimeout(1000);

    const convertBtn = await page.locator("#rvc-convert");
    await convertBtn.click();

    const start = Date.now();
    while (Date.now() - start < 90000) {
      const resultVisible = await page.locator("#rvc-result").isVisible();
      if (resultVisible) {
        console.log("🎉 Conversion complete! Extracting audio blob...");
        const audioSrc = await page.locator("#rvc-result-audio").getAttribute("src");
        const wavBufferBase64 = await page.evaluate(async (src) => {
          const resp = await fetch(src);
          const buf = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        }, audioSrc);

        const outPath = "E:\\大肥鱼\\rvc-local\\convert\\test-browser-out.wav";
        fs.writeFileSync(outPath, Buffer.from(wavBufferBase64, "base64"));
        console.log(`Saved browser output to ${outPath} (${fs.statSync(outPath).size} bytes)`);
        break;
      }
      await page.waitForTimeout(2000);
    }
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await browser.close();
    server.close();
    process.exit(0);
  }
});
