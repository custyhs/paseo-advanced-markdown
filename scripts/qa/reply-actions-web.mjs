// QA helper: drive an official Paseo web UI page in a real Chrome for the
// fork-safe replies checks that need interactions web-capture.mjs does not
// have: pressing Show original, the composer pill and Paseo's Fork menu,
// reloading, marking formula images across a transformer re-registration,
// and recording viewport/scroll facts. Evidence only; it changes no Paseo
// state beyond the clicks it is told to make.
//
// node scripts/qa/reply-actions-web.mjs --url http://127.0.0.1:6792/h/srv/agent/id \
//   --out docs/qa/evidence --report run-1100 --width 1100 --height 900 \
//   --steps "wait:Show original;shot:footer;click:Show original;sleep:1200;shot:after"
//
// Steps (semicolon separated, `action:value`, labels may end with `@<index>`):
//   goto:<url>        navigate            wait:<text>      wait for body text
//   waitgone:<text>   wait for absence    sleep:<ms>       pause
//   reload            reload the page     click:<label>    real mouse click
//   copy:<label>      click + clipboard   has:/not:<text>  record presence
//   buttons:<label>   record match count  inview:<text>    record viewport fact
//   scrollto:<text>   scroll into view    scrollbottom|scrolltop
//   mark              tag plugin images   marks:<name>     record surviving tags
//   shot:<name>       viewport shot       fullshot:<name>  full-page shot
//   setls:<key>=<json>  write localStorage (app preferences only)
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}
const url = option("url");
if (!url) throw new Error("--url is required");
const out = path.resolve(option("out", ".smoke/reply-actions-web"));
const reportName = option("report", "run");
const width = Number(option("width", "1100"));
const height = Number(option("height", "900"));
const scheme = option("scheme", "dark");
const chrome =
  option("chrome") ??
  process.env.PAM_QA_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const timeout = Number(option("timeout", "60000"));
const settleAfterClick = Number(option("click-settle", "600"));
const steps = (option("steps", "") || "").split(";").filter(Boolean);

/**
 * `label@2` → index 2; `label@v` → first candidate inside the viewport;
 * `label@l` → last candidate inside the viewport; plain labels → index 0.
 */
function parseTarget(value) {
  const match = /^(.*)@(\d+|v|l)$/.exec(value);
  if (!match) return { label: value, index: 0, visible: false };
  if (match[2] === "v") return { label: match[1], index: 0, visible: "first" };
  if (match[2] === "l") return { label: match[1], index: 0, visible: "last" };
  return { label: match[1], index: Number(match[2]), visible: false };
}

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: [
    "--no-first-run",
    "--no-default-browser-check",
    // The host follows navigator.language; captures pin English so recorded
    // labels match the app's source strings on any machine locale.
    `--lang=${option("lang", "en-US")}`,
    `--window-size=${width},${height + 120}`,
  ],
});
const origin = new URL(url).origin;
await browser
  .defaultBrowserContext()
  .overridePermissions(origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning")
    consoleErrors.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
await page.setViewport({ width, height, deviceScaleFactor: 2 });
// --lang alone does not move navigator.language off the OS locale here; the
// CDP override does, and the host's language=system then resolves to it.
const cdp = await page.createCDPSession();
await cdp.send("Emulation.setLocaleOverride", { locale: option("lang", "en-US") });
await page.emulateMediaFeatures([
  { name: "prefers-color-scheme", value: scheme === "dark" ? "dark" : "light" },
]);

const record = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = (text) =>
  page.waitForFunction((needle) => document.body.innerText.includes(needle), { timeout }, text);
const waitGone = (text) =>
  page.waitForFunction((needle) => !document.body.innerText.includes(needle), { timeout }, text);

/**
 * All clickable candidates for a label: exact aria-label matches first, then
 * clickable roles with that exact trimmed text, then leaves containing the
 * text (climbing to the closest clickable ancestor). Returns element handles.
 */
async function candidatesFor(label) {
  return page.evaluateHandle((needle) => {
    const results = [];
    const seen = new Set();
    const push = (element) => {
      if (element && !seen.has(element)) {
        seen.add(element);
        results.push(element);
      }
    };
    for (const element of document.querySelectorAll(`[aria-label=${JSON.stringify(needle)}]`))
      push(element);
    const clickable =
      '[role="button"],[role="menuitem"],[role="link"],[role="tab"],[role="switch"],button,a,input[type="checkbox"]';
    for (const element of document.querySelectorAll(clickable)) {
      if (element.innerText?.trim() === needle) push(element);
    }
    for (const element of document.querySelectorAll("*")) {
      if (element.children.length === 0 && element.textContent?.includes(needle)) {
        // A settings row keeps its switch beside the label, not around it:
        // climb a few ancestors and take a control inside before falling back.
        let container = element.parentElement;
        let control = null;
        for (let depth = 0; depth < 4 && container && !control; depth += 1) {
          control = container.querySelector('[role="switch"],input[type="checkbox"]');
          container = container.parentElement;
        }
        push(control ?? element.closest(clickable) ?? element);
      }
    }
    return results;
  }, label);
}

async function clickTarget(value) {
  const { label, index, visible } = parseTarget(value);
  const list = await candidatesFor(label);
  const length = await page.evaluate((elements) => elements.length, list);
  if (length <= index) throw new Error(`click target not found: ${value} (${length} candidates)`);
  const handle = await page.evaluateHandle(
    (elements, at, wantVisible) => {
      if (!wantVisible) return elements[at];
      const inViewport = elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight && rect.height > 0;
      });
      const pick = wantVisible === "last" ? inViewport[inViewport.length - 1] : inViewport[0];
      return pick ?? elements[at];
    },
    list,
    index,
    visible,
  );
  const element = handle.asElement();
  await element.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await sleep(150);
  await element.click();
  await sleep(settleAfterClick);
}

async function facts() {
  return page.evaluate(() => {
    const images = [...document.querySelectorAll("img")].filter(
      (image) => image.src.startsWith("data:image/png") && image.complete,
    );
    const buttons = [...document.querySelectorAll('[role="button"],[role="menuitem"],button')]
      .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "")
      .filter(Boolean);
    return {
      images: images.length,
      markedImages: images.filter((image) => image.dataset.qaMark === "1").length,
      buttonLabels: buttons,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

try {
  await page.goto(url, { waitUntil: "networkidle2", timeout });
  for (const step of steps) {
    const separator = step.indexOf(":");
    const action = separator === -1 ? step : step.slice(0, separator);
    const value = separator === -1 ? "" : step.slice(separator + 1);
    if (action === "goto") await page.goto(value, { waitUntil: "networkidle2", timeout });
    else if (action === "wait") await waitFor(value);
    else if (action === "waitgone") await waitGone(value);
    else if (action === "sleep") await sleep(Number(value));
    else if (action === "reload") await page.reload({ waitUntil: "networkidle2", timeout });
    else if (action === "click") {
      await clickTarget(value);
      record.push({ step, done: true });
    } else if (action === "copy") {
      await clickTarget(value);
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      record.push({ step, clipboardChars: clipboard.length, clipboard });
    } else if (action === "has" || action === "not") {
      const present = await page.evaluate(
        (needle) => document.body.innerText.includes(needle),
        value,
      );
      record.push({ step, ok: action === "has" ? present : !present, present });
    } else if (action === "buttons") {
      const list = await candidatesFor(parseTarget(value).label);
      const ariaCount = await page.evaluate(
        (needle) => document.querySelectorAll(`[aria-label=${JSON.stringify(needle)}]`).length,
        parseTarget(value).label,
      );
      record.push({
        step,
        ariaCount,
        candidates: await page.evaluate((elements) => elements.length, list),
      });
    } else if (action === "inview") {
      const fact = await page.evaluate((needle) => {
        const leaves = [...document.querySelectorAll("*")].filter(
          (element) => element.children.length === 0 && element.textContent?.includes(needle),
        );
        const target = leaves[0];
        if (!target) return null;
        const rect = target.getBoundingClientRect();
        return {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          viewport: window.innerHeight,
          inViewport: rect.bottom > 0 && rect.top < window.innerHeight,
        };
      }, value);
      record.push({ step, fact });
    } else if (action === "scrollto") {
      const moved = await page.evaluate((needle) => {
        const leaves = [...document.querySelectorAll("*")].filter(
          (element) => element.children.length === 0 && element.textContent?.includes(needle),
        );
        if (!leaves[0]) return false;
        leaves[0].scrollIntoView({ block: "center" });
        return true;
      }, value);
      if (!moved) throw new Error(`scrollto target not found: ${value}`);
      await sleep(600);
    } else if (action === "scrollbottom" || action === "scrolltop") {
      await page.evaluate((toBottom) => {
        const scrollers = [...document.querySelectorAll("*")].filter(
          (element) =>
            element.scrollHeight > element.clientHeight + 10 && element.clientHeight > 200,
        );
        const target = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (target) target.scrollTop = toBottom ? target.scrollHeight : 0;
        window.scrollTo(0, toBottom ? document.body.scrollHeight : 0);
      }, action === "scrollbottom");
      await sleep(600);
    } else if (action === "mark") {
      const marked = await page.evaluate(() => {
        const images = [...document.querySelectorAll("img")].filter(
          (image) => image.src.startsWith("data:image/png") && image.complete,
        );
        for (const image of images) image.dataset.qaMark = "1";
        return images.length;
      });
      record.push({ step, marked });
    } else if (action === "marks") {
      record.push({ step, ...(await facts()) });
    } else if (action === "shot" || action === "fullshot") {
      const file = path.join(out, `${value}.png`);
      await page.screenshot({ path: file, fullPage: action === "fullshot" });
      record.push({ step, file: path.basename(file), ...(await facts()) });
    } else if (action === "type") {
      const focused = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('textarea,[contenteditable="true"]')].filter(
          (element) => element.getBoundingClientRect().height > 0,
        );
        if (!inputs[0]) return false;
        inputs[0].focus();
        return true;
      });
      if (!focused) throw new Error("type: no visible composer input");
      await page.keyboard.type(value, { delay: 10 });
      record.push({ step: `type:${value.slice(0, 40)}…`, done: true });
    } else if (action === "key") {
      await page.keyboard.press(value);
      record.push({ step, done: true });
    } else if (action === "setls") {
      const equals = value.indexOf("=");
      const key = value.slice(0, equals);
      const stored = value.slice(equals + 1);
      await page.evaluate((k, v) => localStorage.setItem(k, v), key, stored);
      record.push({ step, done: true });
    } else throw new Error(`unknown step: ${step}`);
  }
  const report = {
    url,
    width,
    height,
    scheme,
    steps: record,
    consoleErrors,
    capturedAt: new Date().toISOString(),
  };
  await writeFile(path.join(out, `${reportName}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      report: reportName,
      steps: record.length,
      consoleErrors: consoleErrors.length,
    }),
  );
} finally {
  await browser.close();
}
