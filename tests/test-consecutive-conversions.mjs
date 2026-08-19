import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8130;
const SITE_DIR = "E:\\大肥鱼\\site";

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".onnx": "application/octet-stream",
  ".wav": "audio/wav",
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  let filePath = path.join(SITE_DIR, urlPath === "/" ? "rvc.html" : urlPath);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": mime,
    "Access-Control-Allow-Origin": "*",
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  console.log(`Test server running at http://127.0.0.1:${PORT}`);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.on("console", (msg) => console.log(`[Browser Console] ${msg.text()}`));
  page.on("pageerror", (err) => console.error(`[Browser PageError]`, err));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/rvc.html?v=test`, { waitUntil: "networkidle" });
    console.log("Page loaded.");

    // Upload test input audio
    const testAudioPath = "E:\\大肥鱼\\rvc-local\\convert\\test-input-16k.wav";
    const fileInput = await page.locator("#rvc-audio-file");
    await fileInput.setInputFiles(testAudioPath);
    console.log("Audio file uploaded.");
    await page.waitForTimeout(1000);

    // Click Convert 1st time
    console.log("=== Starting 1st Conversion ===");
    const convertBtn = await page.$("#rvc-convert");
    await convertBtn.click();

    // Wait for 1st completion
    await page.waitForSelector("#rvc-result:not([hidden])", { timeout: 120000 });
    console.log("✅ 1st Conversion succeeded!");

    await page.waitForTimeout(2000);

    // Click Convert 2nd time without re-uploading (testing detached buffer fix)
    console.log("=== Starting 2nd Consecutive Conversion ===");
    await convertBtn.click();

    // Wait for 2nd completion
    await page.waitForFunction(() => {
      const btn = document.getElementById("rvc-convert");
      return btn && !btn.disabled && btn.getAttribute("aria-busy") !== "true";
    }, { timeout: 120000 });
    console.log("✅ 2nd Consecutive Conversion succeeded without detached buffer errors!");

    await page.waitForTimeout(1000);

  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
    console.log("Server and browser closed.");
  }
});
