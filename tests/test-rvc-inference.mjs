import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";

const PORT = 8126;
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
  if (reqPath === "/assets/rvc-models.json" && (process.env.POSTPREP_RVC_NOISE_SCALE || process.env.POSTPREP_RVC_NOISE_SEED)) {
    const catalog = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const model of catalog.models || []) {
      if (process.env.POSTPREP_RVC_NOISE_SCALE) model.noiseScale = Number(process.env.POSTPREP_RVC_NOISE_SCALE);
      if (process.env.POSTPREP_RVC_NOISE_SEED) model.noiseSeed = Number(process.env.POSTPREP_RVC_NOISE_SEED);
    }
    res.end(JSON.stringify(catalog));
    return;
  }
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, "127.0.0.1", async () => {
  let exitCode = 0;
  console.log(`Test server running at http://127.0.0.1:${PORT}`);
  const chromeCandidates = [
    process.env.POSTPREP_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage(process.env.POSTPREP_RVC_MOBILE ? {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  } : {});

  page.on("console", (msg) => {
    if (msg.text().includes("ERR_NETWORK_ACCESS_DENIED")) return;
    console.log("[Browser Console]", msg.text());
  });
  page.on("pageerror", (err) => console.log("[Browser Error]", String(err)));

  try {
    await page.goto(process.env.POSTPREP_RVC_TEST_URL || `http://127.0.0.1:${PORT}/rvc.html`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500);
    if (process.env.POSTPREP_RVC_FORCE_LOCAL === "1") {
      await page.locator("#rvc-mode-local").click();
    }
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (horizontalOverflow) throw new Error("RVC page has horizontal overflow at the test viewport");

    const requestedModelId = process.argv[3];
    if (requestedModelId) {
      const modelCard = page.locator(`[data-model-id="${requestedModelId}"]`);
      if ((await modelCard.count()) !== 1) throw new Error(`Unknown model id: ${requestedModelId}`);
      await modelCard.click();
    }

    // Set input file using test audio
    const testAudioPath = process.env.POSTPREP_RVC_TEST_AUDIO || "E:\\大肥鱼\\rvc-local\\convert\\test-input-16k.wav";
    console.log("Setting input audio file:", testAudioPath);
    const fileInput = await page.locator("#rvc-audio-file");
    await fileInput.setInputFiles(testAudioPath);

    await page.waitForFunction(() => {
      const status = document.getElementById("rvc-audio-status")?.textContent || "";
      const button = document.getElementById("rvc-convert");
      return !status.includes("正在分析") && button && !button.disabled;
    }, { timeout: 120000 });
    if (process.env.POSTPREP_RVC_INDEX_RATE) {
      await page.locator("#rvc-index-rate").evaluate((element, value) => {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }, process.env.POSTPREP_RVC_INDEX_RATE);
    }
    if (process.env.POSTPREP_RVC_PROTECT) {
      await page.locator("#rvc-protect").evaluate((element, value) => {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }, process.env.POSTPREP_RVC_PROTECT);
    }
    if (process.env.POSTPREP_RVC_PITCH) {
      await page.locator("#rvc-pitch").evaluate((element, value) => {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }, process.env.POSTPREP_RVC_PITCH);
    }
    const audioStatus = await page.locator("#rvc-audio-status").textContent();
    console.log("Audio status:", audioStatus);

    const convertBtn = await page.locator("#rvc-convert");
    const isEnabled = await convertBtn.isEnabled();
    console.log("Convert button enabled:", isEnabled);

    if (isEnabled) {
      console.log("Triggering conversion click...");
      await convertBtn.click();

      // Long stability fixtures may need substantially more than the default
      // short-smoke timeout while still exercising the same browser path.
      const inferenceTimeoutMs = Math.max(90000, Number(process.env.POSTPREP_RVC_E2E_TIMEOUT_MS) || 90000);
      let finished = false;
      const start = Date.now();
      while (Date.now() - start < inferenceTimeoutMs) {
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
        const outputPath = process.argv[2];
        if (outputPath && outputPath !== "-") {
          const outputBase64 = await page.evaluate(async () => {
            const audio = document.getElementById("rvc-result-audio");
            const response = await fetch(audio.src);
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            }
            return btoa(binary);
          });
          fs.writeFileSync(outputPath, Buffer.from(outputBase64, "base64"));
          console.log(`Saved converted WAV: ${outputPath}`);
        }
        console.log("✅ FULL END-TO-END RVC IN-BROWSER INFERENCE PASSED!");
      } else {
        throw new Error("Inference timed out before a result was produced");
      }
    } else {
      throw new Error("Convert button stayed disabled after valid audio was selected");
    }
  } catch (err) {
    console.error("Test error:", err);
    exitCode = 1;
  } finally {
    await browser.close();
    server.close();
    process.exit(exitCode);
  }
});
