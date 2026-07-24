/**
 * Desktop in-place bubble expansion screenshot.
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.env.QUOTE_BASE_URL || "http://localhost:3000";
const OUT = path.join(__dirname, "..", "tmp", "playwright");

async function assertStableShell(page, label) {
  await page.waitForFunction(
    () => Math.round(document.querySelector("#quoter-widget")?.getBoundingClientRect().height ?? 0) === 544,
    { timeout: 5000 },
  );
  const dimensions = await page.locator("#quoter-widget").evaluate((node) => {
    const scroller = node.querySelector(".quote-flow-scroller");
    return {
      width: Math.round(node.getBoundingClientRect().width),
      height: Math.round(node.getBoundingClientRect().height),
      flowClientHeight: scroller?.clientHeight ?? 0,
      flowScrollHeight: scroller?.scrollHeight ?? 0,
      overflowY: scroller ? getComputedStyle(scroller).overflowY : "",
    };
  });
  if (dimensions.width !== 700 || dimensions.height !== 544) {
    throw new Error(`${label}: expected 700×544 bubble, got ${dimensions.width}×${dimensions.height}`);
  }
  if (dimensions.flowScrollHeight > dimensions.flowClientHeight + 1) {
    throw new Error(`${label}: expanded quote flow overflows its fixed desktop shell`);
  }
  return dimensions;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(BASE);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "bubble-collapsed.png") });

  const input = page.locator("#quoter-widget input").first();
  await input.fill("SW1A 2AA");
  // Submit a real UK postcode so the shell expands into the flow stage.
  await page.locator(".q-go").click();

  await page.waitForFunction(
    () => document.querySelector("#quoter-widget")?.getAttribute("data-stage") === "flow",
    { timeout: 8000 },
  );
  const stage = await page.locator("#quoter-widget").getAttribute("data-stage");
  await page.screenshot({ path: path.join(OUT, "bubble-expanded.png") });

  if (stage !== "flow") {
    throw new Error(`Expected data-stage=flow, got ${stage}`);
  }
  // Card should still be in-page (not a full-viewport fixed overlay on desktop)
  const fixedOverlay = await page.locator("body > .quote-surface.fixed").count();
  if (fixedOverlay > 0) throw new Error("Desktop still used full-screen portal overlay");

  await assertStableShell(page, "job type");
  await page.getByRole("button", { name: /Tile or slate repair/i }).click();
  await page.waitForTimeout(300);
  await assertStableShell(page, "property type");
  await page.getByRole("button", { name: "Bungalow" }).click();
  await page.waitForTimeout(300);
  await assertStableShell(page, "repair size");
  await page.getByRole("button", { name: /A small patch/i }).click();
  await page.waitForTimeout(300);
  const dimensions = await assertStableShell(page, "material grid");
  await page.screenshot({ path: path.join(OUT, "bubble-material.png") });
  await page.getByRole("button", { name: /Concrete tile/i }).click();
  await page.waitForTimeout(300);
  await assertStableShell(page, "contact form");
  await page.screenshot({ path: path.join(OUT, "bubble-contact.png") });

  console.log("drive-bubble OK", { stage, fixedOverlay, dimensions });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
