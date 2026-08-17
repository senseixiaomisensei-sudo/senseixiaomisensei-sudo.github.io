import fs from "node:fs";
import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";

async function analyzeGeneratedAudio() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", (msg) => console.log("[Console]", msg.text()));
  page.on("pageerror", (err) => console.log("[Error]", String(err)));

  try {
    await page.goto("http://127.0.0.1:8124/rvc.html", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1000);

    const testAudioPath = "E:\\大肥鱼\\rvc-local\\convert\\test-input-16k.wav";
    const fileInput = await page.locator("#rvc-audio-file");
    await fileInput.setInputFiles(testAudioPath);
    await page.waitForTimeout(1000);

    const convertBtn = await page.locator("#rvc-convert");
    await convertBtn.click();

    console.log("Waiting for conversion result...");
    await page.waitForSelector("#rvc-result", { state: "visible", timeout: 60000 });

    // Extract audio blob data from <audio id="rvc-result-audio">
    const audioBase64 = await page.evaluate(async () => {
      const audioEl = document.getElementById("rvc-result-audio");
      if (!audioEl || !audioEl.src) return null;
      const res = await fetch(audioEl.src);
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    });

    if (audioBase64) {
      const outPath = "E:\\大肥鱼\\site\\tests\\debug-output.wav";
      fs.writeFileSync(outPath, Buffer.from(audioBase64, "base64"));
      console.log(`Saved output wav to ${outPath} (${fs.statSync(outPath).size} bytes)`);

      // Inspect WAV header and samples
      const buf = fs.readFileSync(outPath);
      const sampleRate = buf.readUInt32LE(24);
      const channels = buf.readUInt16LE(22);
      const bitsPerSample = buf.readUInt16LE(34);
      const numSamples = (buf.length - 44) / 2;

      let min = 32767, max = -32768, sumSquare = 0, clippedCount = 0;
      for (let i = 44; i < buf.length; i += 2) {
        const val = buf.readInt16LE(i);
        if (val < min) min = val;
        if (val > max) max = val;
        if (Math.abs(val) >= 32700) clippedCount++;
        sumSquare += val * val;
      }
      const rms = Math.sqrt(sumSquare / numSamples);

      console.log("=== Audio Analysis Results ===");
      console.log("Sample Rate:", sampleRate, "Hz");
      console.log("Channels:", channels);
      console.log("Bits Per Sample:", bitsPerSample);
      console.log("Total Samples:", numSamples, `(${(numSamples/sampleRate).toFixed(2)}s)`);
      console.log("Min Value:", min, "Max Value:", max);
      console.log("RMS Energy:", rms.toFixed(2));
      console.log("Clipped Samples (>32700):", clippedCount, `(${(clippedCount/numSamples*100).toFixed(2)}%)`);
    }
  } catch (err) {
    console.error("Analysis failed:", err);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

analyzeGeneratedAudio();
