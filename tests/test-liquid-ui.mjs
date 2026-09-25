import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(root, "../test-artifacts/liquid-ui-20260920");
fs.mkdirSync(output, { recursive: true });
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const target = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader("Content-Type", mime[path.extname(target)] || "application/octet-stream");
  fs.createReadStream(target).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [];
try {
  const context = await browser.newContext();
  await context.route("**/*", route => {
    const url = route.request().url();
    return url.startsWith(base) || url.startsWith("blob:") || url.startsWith("data:")
      ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const pages = fs.readdirSync(root).filter(name => name.endsWith(".html"));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of pages) {
      await page.goto(`${base}/${name}`, { waitUntil: "load" });
      await page.locator(".style-toggle").waitFor();
      assert.equal(await page.locator("html").getAttribute("data-ui"), "glass");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `${name} overflows at ${width}px`);
      const emoji = await page.locator("body").innerText();
      assert.equal(/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(emoji), false, `${name} contains emoji`);
      if (name === "rvc.html" || name === "index.html") {
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true, animations: "disabled" });
      }
    }
  }
  for (const width of [360, 375, 412, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/rvc.html`, { waitUntil: "load" });
    await page.locator("[data-model-id]").first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `RVC workspace overflows at ${width}px`);
    const dockBefore = await page.locator(".studio-dock").evaluate(dock => ({
      parent: dock.parentElement === document.body,
      position: getComputedStyle(dock).position,
      top: dock.getBoundingClientRect().top,
      bottom: dock.getBoundingClientRect().bottom,
      buttons: [...dock.querySelectorAll("button")].map(button => button.getBoundingClientRect().height),
    }));
    assert.equal(dockBefore.parent, true, `Dock must be outside workspace at ${width}px`);
    assert.equal(dockBefore.position, "fixed", `Dock must be viewport-fixed at ${width}px`);
    assert.equal(dockBefore.buttons.length, 4);
    assert.ok(dockBefore.buttons.every(height => height >= 44), `Dock actions are touch-sized at ${width}px`);
    await page.evaluate(() => { document.getElementById("rvc-advanced").open = true; document.getElementById("rvc-result").hidden = false; });
    await page.locator("#rvc-result-download").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const dockAfter = await page.locator(".studio-dock").evaluate(dock => {
      const bar = dock.getBoundingClientRect();
      const last = document.getElementById("rvc-result-download").getBoundingClientRect();
      return { top: bar.top, bottom: bar.bottom, lastBottom: last.bottom, viewport: innerHeight };
    });
    assert.ok(Math.abs(dockBefore.top - dockAfter.top) < 2, `Dock moves during scrolling at ${width}px`);
    assert.ok(dockAfter.bottom <= dockAfter.viewport + 1, `Dock leaves the viewport at ${width}px`);
    assert.ok(dockAfter.lastBottom < dockAfter.top - 8, `Last result control is covered at ${width}px`);
    if (width === 390) {
      const layers = await page.evaluate(() => {
        const overlay = document.createElement("div");
        overlay.className = "postprep-turnstile-overlay";
        document.body.append(overlay);
        const values = [getComputedStyle(document.querySelector(".studio-dock")).zIndex,
          getComputedStyle(overlay).zIndex, getComputedStyle(document.getElementById("toast")).zIndex].map(Number);
        overlay.remove();
        return values;
      });
      assert.ok(layers[0] < layers[1] && layers[1] < layers[2], "Dock, dialog and toast stack in order");
      await page.evaluate(() => {
        document.getElementById("rvc-model-search").focus();
        Object.defineProperty(window.visualViewport, "height", { configurable: true, value: innerHeight * .5 });
        window.visualViewport.dispatchEvent(new Event("resize"));
      });
      assert.equal(await page.locator(".studio-dock").isVisible(), false, "Keyboard hides the dock");
      await page.evaluate(() => {
        document.activeElement.blur();
        delete window.visualViewport.height;
        window.visualViewport.dispatchEvent(new Event("resize"));
      });
      assert.equal(await page.locator(".studio-dock").isVisible(), true, "Dock returns after keyboard closes");
    }
    assert.equal(await page.locator('#site-header a[aria-current="page"]:visible').count(), width < 1400 ? 0 : 1, `RVC navigation has the correct active item at ${width}px`);
    assert.ok(await page.locator("#rvc-convert").evaluate(button => button.getBoundingClientRect().width >= 44), `Convert action stays tappable at ${width}px`);
    if (width < 1400) {
      assert.equal(await page.locator("[data-menu-toggle]").isVisible(), true, `Mobile navigation is reachable at ${width}px`);
      await page.locator("[data-menu-toggle]").click();
      assert.equal(await page.locator("#mobile-navigation").isVisible(), true);
      assert.equal(await page.locator('#mobile-navigation a[aria-current="page"]:visible').count(), 1);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#mobile-navigation").isVisible(), false);
    } else {
      assert.equal(await page.locator('nav[aria-label="Primary navigation"]').isVisible(), true);
    }
    if ([360, 1280, 1920].includes(width)) {
      await page.screenshot({ path: path.join(output, `rvc-workspace-${width}.png`), fullPage: true, animations: "disabled" });
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`${base}/rvc.html`, { waitUntil: "load" });
  const landscapeDock = await page.locator(".studio-dock").evaluate(dock => ({
    bottom: dock.getBoundingClientRect().bottom,
    height: dock.getBoundingClientRect().height,
    position: getComputedStyle(dock).position,
  }));
  assert.equal(landscapeDock.position, "fixed");
  assert.ok(landscapeDock.bottom <= 391 && landscapeDock.height <= 64, "Landscape dock stays compact at viewport bottom");
  await page.goto(`${base}/rvc.html`);
  await page.locator("[data-model-id]").first().waitFor();
  await page.locator('.studio-dock button[data-step="3"]').click();
  assert.equal(await page.evaluate(() => document.activeElement?.disabled === true), false, "Empty result does not focus a disabled action");
  assert.match(await page.locator("#rvc-service-status").innerText(), /先载入音频|Load audio/u);
  await page.locator("[data-model-id]").first().click();
  assert.equal(await page.locator("#studio-model").innerText(), await page.locator('[data-model-id][aria-selected="true"] p').first().innerText());
  await page.locator('.studio-dock button[data-step="2"]').click();
  assert.equal(await page.locator('.studio-dock button[data-step="2"]').getAttribute("aria-current"), "step");
  await page.locator("#rvc-pitch").fill("4");
  assert.equal(await page.locator("#studio-pitch").innerText(), "+4");
  await page.locator("#rvc-advanced").evaluate(details => { details.open = true; });
  await page.locator("#rvc-rms-mix").fill("0.8");
  assert.equal(await page.locator("#rvc-rms-mix-value").innerText(), "0.80");
  await page.locator('[data-studio-target="rvc-pitch"]').click();
  await page.waitForFunction(() => document.activeElement.id === "rvc-pitch");
  const wave = Buffer.alloc(44 + 16000 * 2);
  wave.write("RIFF"); wave.writeUInt32LE(wave.length - 8, 4); wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(16000, 24); wave.writeUInt32LE(32000, 28);
  wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write("data", 36);
  wave.writeUInt32LE(32000, 40);
  for (let i = 0; i < 16000; i++) wave.writeInt16LE(Math.round(Math.sin(i / 16000 * 440 * 2 * Math.PI) * 12000), 44 + i * 2);
  await page.locator("#rvc-audio-file").setInputFiles({ name: "preview-test.wav", mimeType: "audio/wav", buffer: wave });
  await page.waitForFunction(() => document.getElementById("studio-file").textContent === "preview-test.wav");
  assert.equal(await page.locator("#studio-duration").innerText(), "0:01");
  const painted = await page.locator(".studio-wave").evaluate(canvas => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 20 && data[i + 1] > 100 && data[i + 3] > 200) count++;
    return count;
  });
  assert.ok(painted > 10000, "Waveform must contain real rendered peaks");
  await page.locator("#studio-seek").fill("500");
  assert.ok(await page.locator("#studio-input-audio").evaluate(audio => audio.currentTime >= 0.49));
  await page.locator(".style-toggle").click();
  assert.equal(await page.locator("html").getAttribute("data-ui"), "classic");
  assert.equal(await page.locator(".studio-monitor").isVisible(), false);
  for (const width of [320, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of pages) {
      await page.goto(`${base}/${name}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Classic ${name} overflows at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/index.html`);
  assert.equal(await page.locator("html").getAttribute("data-ui"), "classic");
  await page.locator(".style-toggle").click();
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-ui"), "glass");
  await page.locator("[data-menu-toggle]").click();
  assert.equal(await page.locator("#mobile-navigation").isVisible(), true);
  await page.locator("[data-language-toggle]").click();
  await page.waitForFunction(() => document.documentElement.lang.startsWith("en"));
  assert.match(await page.locator(".style-toggle").getAttribute("aria-label"), /Classic/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/rvc.html`);
  await page.locator(".studio-monitor").waitFor();
  assert.equal(await page.locator(".studio-monitor").evaluate(el => getComputedStyle(el).animationName), "none");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pages: pages.length, widths: [1440, 768, 390], waveformPixels: painted, interactions: "passed", pageErrors: errors, screenshots: output }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
