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
  const compact = await page.$('[data-pam-formula-frame="always"]');
  assert.ok(compact);
  await compact.scrollIntoView();
  report.compact = await opacity(compact);
  assert.equal(report.compact, "1");
  await page.screenshot({ path: `${out}/compact.png` });
  await page.setViewport({
    width: 1280,
    height: 900,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForSelector("[data-pam-formula-frame]");
  report.touchMedia = await page.evaluate(() => ({
    hover: matchMedia("(hover: hover)").matches,
    fine: matchMedia("(pointer: fine)").matches,
  }));
  const touch = await page.$("[data-pam-formula-frame]");
  report.touch = await opacity(touch);
  assert.equal(report.touch, "1");
  assert.equal(report.touchMedia.hover, false);
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report));
