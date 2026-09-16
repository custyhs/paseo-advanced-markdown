// Interaction probe against the isolated official 0.8.0 app; never targets production.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
const origin = "http://127.0.0.1:6790";
const url = `${origin}/h/srv_cS2FIpy5eZub/agent/f9af67a7-c5de-4fac-a16d-af6bc05fb334`;
const out = ".smoke/math-reading-web";
await mkdir(out, { recursive: true });
const client = new DaemonClient({
  url: "ws://127.0.0.1:6790/ws",
  clientId: "math-reading-web-qa",
  clientType: "cli",
  appVersion: "0.8.0",
  reconnect: { enabled: false },
});
await client.connect();
const rpc = (name, input) => client.invokePluginRpc("advanced-markdown", name, input);
const saved = await rpc("settings.modules.read", {});
assert.equal(saved.status, "ready");
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});
const errors = [];
const report = { views: [], inspector: {}, settings: {}, errors };
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await browser
  .defaultBrowserContext()
  .overridePermissions(origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
const click = async (label, last = false) => {
  const ok = await page.evaluate(
    ({ label, last }) => {
      const nodes = [...document.querySelectorAll('[role="button"],button')].filter(
        (e) => e.getAttribute("aria-label") === label || e.textContent.trim() === label,
      );
      const node = last ? nodes.at(-1) : nodes[0];
      node?.scrollIntoView({ block: "center" });
      node?.click();
      return !!node;
    },
    { label, last },
  );
  assert.ok(ok, `button ${label}`);
  await wait(200);
};
const facts = () =>
  page.evaluate(() => ({
    images: [...document.querySelectorAll('img[src^="data:image/png"]')].map((image) => {
      const r = image.getBoundingClientRect();
      return {
        label: image.alt,
        width: r.width,
        height: r.height,
        naturalWidth: image.naturalWidth,
      };
    }),
    inspectEntries: [
      ...document.querySelectorAll('[role="button"][aria-label^="Inspect formula"]'),
    ].map((node) => ({ label: node.getAttribute("aria-label"), tabIndex: node.tabIndex })),
    overflow: document.documentElement.scrollWidth > innerWidth,
    body: document.body.innerText,
  }));
try {
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });
  await page.goto(origin, { waitUntil: "networkidle2" });
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("Math reading candidate"), {
    timeout: 20000,
  });
  await wait(3000);
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
    await wait(700);
    const current = await facts();
    assert.equal(current.overflow, false);
    assert.ok(current.images.length >= 9, `images at ${width}: ${current.images.length}`);
    await page.screenshot({ path: `${out}/width-${width}.png` });
    const promoted = await page.$('[data-pam-formula-frame] [role="button"]');
    await promoted?.scrollIntoView();
    await page.screenshot({ path: `${out}/nested-${width}.png` });
    report.views.push({ width, ...current });
  }
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });
  await wait(400);
  const before = await facts();
  const revision = await rpc("settings.modules.read", {});
  const changed = await rpc("settings.modules.write", {
    revision: revision.revision,
    values: { ...revision.values, mathScale: 2 },
  });
  assert.equal(changed.status, "saved");
  await wait(1600);
  const enlarged = await facts();
  report.settings = { original: saved.values, before: before.images, enlarged: enlarged.images };
  assert.ok(enlarged.images[0].width > before.images[0].width * 1.9, "mounted math size updates");
  await page.screenshot({ path: `${out}/size-200.png` });
  // Inline Text must expose a keyboard-operable button as well as touch onPress.
  const inline = await page.$('[role="button"][aria-label^="Inspect formula:"]');
  assert.ok(inline, "inline inspection entry");
  await inline.focus();
  await page.keyboard.press("Enter");
  await wait(500);
  report.inspector.keyboardOpened = await page.evaluate(() =>
    document.body.innerText.includes("Close formula"),
  );
  assert.equal(report.inspector.keyboardOpened, true);
  await page.screenshot({ path: `${out}/inline-fit.png` });
  await click("3×");
  await wait(600);
  report.inspector.zoomed = await facts();
  await click("Copy TeX", true);
  report.inspector.tex = await page.evaluate(() => navigator.clipboard.readText());
  await click("Copy source", true);
  report.inspector.source = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(report.inspector.source.includes(report.inspector.tex));
  assert.ok(report.inspector.source.startsWith("$"));
  await click("Show source", true);
  await page.screenshot({ path: `${out}/source.png` });
  await click("Close formula");
  await wait(300);
  await page.waitForFunction(() => !document.body.innerText.includes("Close formula"), {
    timeout: 3000,
  });
  report.inspector.closed = !(await page.evaluate(() =>
    document.body.innerText.includes("Close formula"),
  ));
  // Inspect a wide promoted inline formula at the saved 200% reading size.
  await wait(800);
  await click("Show formula actions");
  await click("Expand");
  await page.waitForFunction(() => document.body.innerText.includes("Fit (selected)"), {
    timeout: 5000,
  });
  await wait(400);
  const fitted = (await facts()).images.at(-1);
  assert.ok(fitted.width <= 390 && fitted.height <= 900, "inspector fit within viewport");
  report.inspector.wideFit = fitted;
  await page.screenshot({ path: `${out}/wide-fit.png` });
  await click("Reading size");
  await wait(500);
  report.inspector.wideReading = (await facts()).images.at(-1);
  assert.ok(
    report.inspector.wideReading.width > fitted.width,
    "manual reading size restores width",
  );
  assert.equal((await facts()).overflow, false);
  await page.screenshot({ path: `${out}/wide-reading.png` });
  await page.setViewport({ width: 430, height: 720, deviceScaleFactor: 2 });
  await wait(400);
  const resizedReading = (await facts()).images.at(-1);
  assert.equal(
    resizedReading.width,
    report.inspector.wideReading.width,
    "manual zoom survives resize",
  );
  await click("Fit");
  await wait(300);
  assert.ok((await facts()).images.at(-1).width <= 430);
  await click("Close formula");
  await wait(300);
  await page.waitForFunction(() => !document.body.innerText.includes("Close formula"), {
    timeout: 3000,
  });
  await page.evaluate(() => {
    const image = [...document.querySelectorAll("img")].find((node) =>
      node.alt.includes("\\begin{pmatrix}"),
    );
    const button = image?.closest('[role="button"]');
    button?.scrollIntoView();
    button?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Fit (selected)"), {
    timeout: 3000,
  });
  await wait(400);
  report.inspector.tallFit = (await facts()).images.at(-1);
  assert.ok(report.inspector.tallFit.height < 400, "tall formula fits available modal height");
  await page.screenshot({ path: `${out}/tall-fit.png` });
  await click("3×");
  await wait(500);
  report.inspector.tallZoom = (await facts()).images.at(-1);
  assert.ok(report.inspector.tallZoom.height > report.inspector.tallFit.height * 2);
  assert.equal((await facts()).overflow, false);
  await click("Close formula");
  // A stale revision cannot overwrite a newer formula-size setting.
  const conflict = await rpc("settings.modules.write", {
    revision: revision.revision,
    values: revision.values,
  });
  report.settings.conflict = conflict.status;
  assert.equal(conflict.status, "conflict");
  assert.deepEqual(errors, []);
} finally {
  const current = await rpc("settings.modules.read", {});
  await rpc("settings.modules.write", { revision: current.revision, values: saved.values });
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await client.close();
}
console.log(
  JSON.stringify({ views: report.views.length, errors, keyboard: report.inspector.keyboardOpened }),
);
