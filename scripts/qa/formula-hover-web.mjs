// Verify toolbar visibility in the isolated official app; no production state writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
const origin = "http://127.0.0.1:6790";
const url = `${origin}/h/srv_cS2FIpy5eZub/agent/05094db6-5954-411c-9ad4-6198ae19ceba`;
const out = ".smoke/formula-hover";
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});
const report = { errors: [] };
const page = await browser.newPage();
page.on("pageerror", (e) => report.errors.push(e.message));
await browser
  .defaultBrowserContext()
  .overridePermissions(origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const selector = '[data-pam-formula-frame="hover"]';
const opacity = (frame) =>
  frame.$eval("[data-pam-formula-actions]", (node) => getComputedStyle(node).opacity);
const resetPointer = async () => {
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.activeElement?.blur());
  await wait(50);
};
try {
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await page.goto(origin, { waitUntil: "networkidle2" });
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForSelector(selector, { timeout: 20000 });
  const frame = await page.$(selector);
  await frame.scrollIntoView();
  await wait(300);
  await resetPointer();
  report.hidden = await opacity(frame);
  assert.equal(report.hidden, "0");
  const before = await frame.boundingBox();
  await page.screenshot({ path: `${out}/desktop-default.png` });
  const image = await frame.$("img");
  await image.hover();
  report.hover = await opacity(frame);
  assert.equal(report.hover, "1");
  const button = await frame.$('[aria-label="Copy TeX"]');
  await button.hover();
  report.buttonHover = await opacity(frame);
  assert.equal(report.buttonHover, "1");
  const after = await frame.boundingBox();
  report.geometry = { before, after };
  assert.equal(after.height, before.height);
  assert.equal(after.width, before.width);
  await button.click();
  report.clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(report.clipboard.includes("\\Delta"));
  await page.screenshot({ path: `${out}/desktop-hover.png` });
  await resetPointer();
  assert.equal(await opacity(frame), "0");
  const imageButton = await frame.$('[aria-label="Inspect formula"]');
  await imageButton.focus();
  report.focus = await opacity(frame);
  assert.equal(report.focus, "1");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.body.innerText.includes("Close formula"), {
    timeout: 3000,
  });
  report.inspector = true;
  await page.evaluate(() => document.querySelector('[aria-label="Close formula"]').click());
  await page.waitForFunction(() => !document.body.innerText.includes("Close formula"), {
    timeout: 3000,
  });
  await resetPointer();
  assert.equal(await opacity(frame), "0");
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });
  await wait(300);
  async function verifyTapMode(name, useTouch) {
    const frame = await page.$('[data-pam-formula-frame="tap"]');
    assert.ok(frame);
    await frame.scrollIntoView();
    const trigger = await frame.$('[aria-label="Show formula actions"]');
    assert.ok(trigger);
    assert.equal(await trigger.evaluate((node) => node.getAttribute("aria-expanded")), "false");
    assert.equal(await frame.$("[data-pam-formula-actions]"), null);
    await page.screenshot({ path: `${out}/${name}-collapsed.png` });
    if (name === "phone-touch") {
      const scroller = await trigger.evaluateHandle((node) => {
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          if (
            parent.scrollWidth > parent.clientWidth + 30 &&
            ["auto", "scroll"].includes(getComputedStyle(parent).overflowX)
          )
            return parent;
        }
        return null;
      });
      assert.ok(await scroller.evaluate((node) => !!node), "wide formula has horizontal scroll");
      const bounds = await scroller.boundingBox();
      const x = Math.min(360, bounds.x + bounds.width - 20);
      const y = bounds.y + bounds.height / 2;
      const session = await page.createCDPSession();
      try {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let step = 1; step <= 8; step++) {
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x - step * 20, y }],
          });
          await wait(20);
        }
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await wait(200);
        report.horizontalScroll = await scroller.evaluate((node) => node.scrollLeft);
        assert.ok(report.horizontalScroll > 20);
        assert.equal(
          await frame.$("[data-pam-formula-actions]"),
          null,
          "scroll must not disclose controls",
        );
      } finally {
        await session.detach();
      }
    }
    const press = async (node) => (useTouch ? node.tap() : node.click());
    await press(trigger);
    await frame.waitForSelector('[aria-label="Hide formula actions"]');
    assert.equal(await trigger.evaluate((node) => node.getAttribute("aria-expanded")), "true");
    assert.equal(await opacity(frame), "1");
    assert.equal(await page.$('[aria-label="Close formula"]'), null);
    await page.screenshot({ path: `${out}/${name}-expanded.png` });
    const copy = await frame.$('[aria-label="Copy TeX"]');
    await press(copy);
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes("\\Delta"));
    assert.ok(await frame.$('[aria-label="Hide formula actions"]'));
    await press(await frame.$('[aria-label="Expand"]'));
    await page.waitForSelector('[aria-label="Close formula"]', { visible: true });
    // The compact host modal slides in; presence precedes its final hit target.
    await wait(500);
    await press(await page.$('[aria-label="Close formula"]'));
    await page.waitForSelector('[aria-label="Close formula"]', { hidden: true });
    assert.ok(await frame.$('[aria-label="Hide formula actions"]'));
    await press(trigger);
    await frame.waitForSelector('[aria-label="Show formula actions"]');
    assert.equal(await frame.$("[data-pam-formula-actions]"), null);
    // Keyboard users can disclose the same compact control without a mouse.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await frame.waitForSelector('[aria-label="Hide formula actions"]');
    await page.keyboard.press("Enter");
    await frame.waitForSelector('[aria-label="Show formula actions"]');
    report[name] = {
      collapsed: true,
      tapToggle: true,
      copy: true,
      inspector: true,
      keyboard: true,
    };
    return frame;
  }
  await verifyTapMode("compact", false);
  await page.setViewport({
    width: 390,
    height: 900,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-pam-formula-frame="tap"]');
  await verifyTapMode("phone-touch", true);
  await page.setViewport({
    width: 1280,
    height: 900,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-pam-formula-frame="tap"]');
  report.touchMedia = await page.evaluate(() => ({
    hover: matchMedia("(hover: hover)").matches,
    fine: matchMedia("(pointer: fine)").matches,
  }));
  await verifyTapMode("wide-touch", true);
  assert.equal(report.touchMedia.hover, false);
  assert.deepEqual(report.errors, []);
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  throw error;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report));
