// QA helper: open an official Paseo web UI page in a real Chrome, wait for
// text, record image/button facts, optionally exercise a copy button and read
// the clipboard, and save screenshots. Evidence only; it changes no Paseo state.
//
// node scripts/qa/web-capture.mjs --url http://127.0.0.1:6790/... --wait "Advanced Markdown smoke" \
//   --out .smoke/web --name web-1280 [--width 1280 --height 900] [--copy "Copy source" --copy-index 0]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}
const url = option("url");
if (!url) throw new Error("--url is required");
const waitText = option("wait");
const out = path.resolve(option("out", ".smoke/web"));
const name = option("name", "capture");
const width = Number(option("width", "1280"));
const height = Number(option("height", "900"));
const copyLabel = option("copy");
const copyIndex = Number(option("copy-index", "0"));
const scheme = option("scheme", "dark");
const dark = scheme === "dark";
const chrome =
  option("chrome") ??
  process.env.PAM_QA_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const timeout = Number(option("timeout", "60000"));

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check", `--window-size=${width},${height}`],
});
const origin = new URL(url).origin;
const context = browser.defaultBrowserContext();
await context.overridePermissions(origin, [
  "clipboard-read",
  "clipboard-write",
  "clipboard-sanitized-write",
]);
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning")
    consoleErrors.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
await page.setViewport({ width, height, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
try {
  let navigationStartedAt = Date.now();
  await page.goto(url, { waitUntil: "networkidle2", timeout });
  const waitFor = (text) =>
    page.waitForFunction((needle) => document.body.innerText.includes(needle), { timeout }, text);
  // Optional scripted steps after the first load: goto <url> | wait <text> | click <text> | sleep <ms>.
  // Example: --steps "wait:pam-workspace;goto:http://host/h/srv/agent/id;wait:Smoke"
  for (const step of (option("steps", "") || "").split(";").filter(Boolean)) {
    const separator = step.indexOf(":");
    const action = step.slice(0, separator);
    const value = step.slice(separator + 1);
    if (action === "goto") {
      navigationStartedAt = Date.now();
      await page.goto(value, { waitUntil: "networkidle2", timeout });
    } else if (action === "wait") await waitFor(value);
    else if (action === "sleep") await new Promise((resolve) => setTimeout(resolve, Number(value)));
    else if (action === "click") {
      const clicked = await page.evaluate((text) => {
        const candidates = [...document.querySelectorAll("*")].filter(
          (element) => element.children.length === 0 && element.textContent?.trim() === text,
        );
        const target =
          candidates[0]?.closest('[role="button"],[role="link"],a,button') ?? candidates[0];
        if (!target) return false;
        target.scrollIntoView({ block: "center" });
        target.click();
        return true;
      }, value);
      if (!clicked) throw new Error(`click target not found: ${value}`);
      await new Promise((resolve) => setTimeout(resolve, 800));
    } else throw new Error(`unknown step: ${step}`);
  }
  if (waitText) await waitFor(waitText);
  // Let plugin images arrive: data-URL images appear after the host RPC settles.
  // With --expect-images N, poll until N data-URL images are present and record the time.
  const settle = Number(option("settle", "8000"));
  const expectImages = Number(option("expect-images", "0"));
  let imagesReadyMs = null;
  const startedWaiting = Date.now();
  if (expectImages > 0) {
    while (Date.now() - startedWaiting < timeout) {
      const count = await page.evaluate(
        () =>
          [...document.querySelectorAll("img")].filter(
            (image) => image.src.startsWith("data:image/png") && image.complete,
          ).length,
      );
      if (count >= expectImages) {
        // Measured from the last navigation so it includes host RPC round trips.
        imagesReadyMs = Date.now() - navigationStartedAt;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  await new Promise((resolve) => setTimeout(resolve, settle));
  const facts = await page.evaluate(() => {
    const images = [...document.querySelectorAll("img")]
      .filter((image) => image.src.startsWith("data:image/png"))
      .map((image) => ({
        label: image.getAttribute("aria-label") ?? image.alt ?? "",
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: Math.round(image.getBoundingClientRect().width),
        height: Math.round(image.getBoundingClientRect().height),
        complete: image.complete,
      }));
    const buttons = [...document.querySelectorAll('[role="button"],[role="imagebutton"],button')]
      .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "")
      .filter(Boolean);
    const body = document.body.innerText;
    return {
      title: document.title,
      images,
      buttonLabels: buttons,
      bodyExcerpt: body.slice(0, 40000),
      rawDollarMath: body.includes("$E = mc^2$"),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  let clipboard = null;
  if (copyLabel) {
    const handles = await page.$$(`[aria-label="${copyLabel}"]`);
    if (!handles[copyIndex])
      throw new Error(
        `No element with aria-label ${JSON.stringify(copyLabel)} at index ${copyIndex}`,
      );
    await handles[copyIndex].evaluate((element) => element.scrollIntoView({ block: "center" }));
    await handles[copyIndex].click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    clipboard = await page.evaluate(() => navigator.clipboard.readText());
    await page.screenshot({ path: path.join(out, `${name}-after-copy.png`), fullPage: false });
  }
  const report = {
    url,
    name,
    width,
    height,
    dark,
    chrome,
    facts,
    clipboard,
    consoleErrors,
    imagesReadyMs,
    expectImages,
    capturedAt: new Date().toISOString(),
  };
  await writeFile(path.join(out, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      name,
      images: facts.images.length,
      imagesReadyMs,
      buttons: facts.buttonLabels.length,
      rawDollarMath: facts.rawDollarMath,
      overflow: facts.scrollWidth > facts.clientWidth,
      clipboardChars: clipboard?.length ?? null,
      consoleErrors: consoleErrors.length,
    }),
  );
} finally {
  await browser.close();
}
