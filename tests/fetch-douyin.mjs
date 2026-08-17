import { chromium } from "file:///E:/大肥鱼/rvc-local/convert/node_modules/playwright/index.mjs";

async function fetchDouyin() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    console.log("Navigating to Douyin URL...");
    await page.goto("https://v.douyin.com/-Q14t2QZXEE/", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log("Page Title:", title);
    const url = page.url();
    console.log("Redirected URL:", url);

    // Extract text content and video desc
    const texts = await page.evaluate(() => {
      const descEl = document.querySelector('h1') || document.querySelector('[data-e2e="video-desc"]') || document.querySelector('.video-info-detail');
      const allText = document.body.innerText;
      return {
        desc: descEl ? descEl.innerText : null,
        bodyExcerpt: allText.slice(0, 3000),
      };
    });

    console.log("=== Video Description / Content ===");
    console.log("Desc:", texts.desc);
    console.log("Body Excerpt:\n", texts.bodyExcerpt);
  } catch (err) {
    console.error("Fetch failed:", err);
  } finally {
    await browser.close();
  }
}

fetchDouyin();
