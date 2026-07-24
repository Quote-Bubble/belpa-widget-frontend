/**
 * End-to-end drive for the measured replacement path on a DETACHED property
 * (Round 3): no manual outline — area comes straight from the satellite
 * scan, only gutter lines are drawn directly, plus chimney/rooflight
 * counters. Verifies estimate reveal has no pins and lead POSTs 202.
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.env.QUOTE_BASE_URL || "http://localhost:3000";
const OUT = path.join(__dirname, "..", "tmp", "playwright");

async function clickOption(page, label) {
  await page.getByRole("button", { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click();
  await page.waitForTimeout(400);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  let leadStatus = null;
  page.on("response", (response) => {
    if (response.url().includes("/api/lead") && response.request().method() === "POST") {
      leadStatus = response.status();
    }
  });

  await page.goto(`${BASE}/quote`);
  await page.waitForTimeout(500);

  // Address
  await page.locator("#quote-address input, [placeholder*='address' i], input").first().fill("10 Downing Street");
  await page.locator("#quote-postcode").fill("SW1A 2AA");
  // The autocomplete suggestions dropdown can still be settling from the
  // debounced lookup and visually overlaps the button below it — force
  // bypasses that overlay check (a real click here wouldn't be blocked by
  // the time a person tabs/clicks down to Continue).
  await page.getByRole("button", { name: "Continue" }).click({ force: true });
  await page.waitForTimeout(500);

  await clickOption(page, "Full roof replacement");
  await clickOption(page, "Detached");
  await clickOption(page, "Two");

  // Locate confirm — compact tick FAB floating over the map, not a full-width button
  await page.getByRole("heading", { name: /Is this your house/i }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, "locate-confirm.png") });
  await page.getByRole("button", { name: /Yes, measure this roof/i }).click();

  // Detached skips manual area marking entirely — straight to gutter lines.
  await page.getByRole("heading", { name: /Mark the gutters/i }).waitFor({ timeout: 45000 });
  await page.waitForTimeout(1500);

  const areaBadge = await page.locator("text=/roof \\(from satellite\\)/i").count();
  if (areaBadge === 0) {
    throw new Error("Expected the satellite whole-roof area badge, no manual outline should be needed");
  }
  const outlineHeading = await page.getByRole("heading", { name: /Outline your roof/i }).count();
  if (outlineHeading > 0) {
    throw new Error("Detached property should never show the manual outline step");
  }

  // Draw one gutter line via clicks (relative to map box)
  const map = page.locator(".gm-style").first();
  await map.waitFor({ timeout: 20000 });
  const box = await map.boundingBox();
  if (!box) throw new Error("Map has no bounding box");

  const pts = [
    [box.x + box.width * 0.4, box.y + box.height * 0.6],
    [box.x + box.width * 0.6, box.y + box.height * 0.6],
  ];
  for (const [x, y] of pts) {
    await page.mouse.click(x, y, { delay: 40 });
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: /Finish this line/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "gutter-line-drawn.png") });

  // The chimney / rooflight counters are commented out in GutterLineStep
  // (see the note there — they come back with obstruction pricing), so this
  // script no longer drives them. Restore the click when that block does.

  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(500);

  // Material
  // Match the heading, not any text — StepShell also renders the same string
  // into an sr-only aria-live region, which trips Playwright's strict mode.
  await page.getByRole("heading", { name: /What's on the roof/i }).waitFor();
  await page.getByRole("button", { name: /Concrete/i }).first().click();
  await page.waitForTimeout(500);

  // Contact
  await page.locator("#contact-name").fill("Ada Lovelace");
  await page.locator("#contact-phone").fill("07700900123");
  await page.getByRole("button", { name: /Show my estimate/i }).click();

  await page.getByRole("heading", { name: /your estimate/i }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "estimate-reveal.png") });

  const pinCount = await page.locator(".q-pin").count();
  if (pinCount > 0) throw new Error(`Expected no estimate pins, found ${pinCount}`);
  if (leadStatus !== 202) throw new Error(`Expected lead 202, got ${leadStatus}`);

  console.log("drive-flow OK", { leadStatus, pinCount, out: OUT });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
