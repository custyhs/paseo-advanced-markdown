// Declarative host preparation: install the pinned Mermaid worker runtime and
// the pinned Chrome headless shell into the plugin's own cache directory.
// Runs from the manifest `build` list after `npm ci` and `npm run build`.
// It never runs at message time and never reaches the network afterwards.
import { spawn } from "node:child_process";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Browser,
  computeExecutablePath,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  uninstall,
} from "@puppeteer/browsers";
import { cacheLayout, resolveCacheRoot } from "../server/mermaid/cache-root.mjs";
import { readWorkerSpec } from "./lib/worker-key.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const spec = await readWorkerSpec(root);
const layout = cacheLayout(resolveCacheRoot());
const workerDir = path.join(layout.workers, spec.key);
const readyFile = path.join(workerDir, ".ready");
const log = (message) => console.log(`[advanced-markdown] ${message}`);

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output.slice(-4000)}`));
    });
  });
}

await mkdir(layout.browsers, { recursive: true });
await mkdir(layout.workers, { recursive: true });

// 1. Worker runtime: exact lockfile install, no browser download from npm.
if ((await exists(readyFile)) && (await readFile(readyFile, "utf8")).trim() === spec.key) {
  log(`worker runtime ${spec.key} already prepared at ${workerDir}`);
} else {
  await rm(workerDir, { recursive: true, force: true });
  await mkdir(workerDir, { recursive: true });
  await writeFile(path.join(workerDir, "package.json"), spec.packageJson);
  await writeFile(path.join(workerDir, "package-lock.json"), spec.lock);
  log(`installing worker runtime ${spec.key} (mermaid-cli ${spec.mermaidCliVersion})`);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await run(npm, ["ci", "--omit=dev", "--no-fund", "--no-audit"], {
    cwd: workerDir,
    env: {
      ...process.env,
      PUPPETEER_SKIP_DOWNLOAD: "1",
      PUPPETEER_SKIP_CHROME_DOWNLOAD: "1",
      PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD: "1",
    },
  });
  await writeFile(readyFile, `${spec.key}\n`);
  log("worker runtime installed");
}
const cliEntry = path.join(workerDir, "node_modules/@mermaid-js/mermaid-cli/src/cli.js");
if (!(await exists(cliEntry))) throw new Error(`Mermaid CLI entry is missing: ${cliEntry}`);

// 2. Browser: pinned Chrome headless shell in the plugin cache, not ~/.cache/puppeteer.
if (spec.browser !== "chrome-headless-shell") {
  throw new Error(`Unsupported browser in worker/browser.json: ${spec.browser}`);
}
const platform = detectBrowserPlatform();
if (!platform) throw new Error("Unsupported host platform for Chrome headless shell");
const executablePath = computeExecutablePath({
  browser: Browser.CHROMEHEADLESSSHELL,
  buildId: spec.buildId,
  cacheDir: layout.browsers,
});
if (await exists(executablePath)) {
  log(`browser ${spec.browser}@${spec.buildId} already present`);
} else {
  log(`downloading ${spec.browser}@${spec.buildId} for ${platform}`);
  let lastPercent = -1;
  await install({
    browser: Browser.CHROMEHEADLESSSHELL,
    buildId: spec.buildId,
    cacheDir: layout.browsers,
    downloadProgressCallback(downloaded, total) {
      const percent = total ? Math.floor((downloaded / total) * 10) * 10 : 0;
      if (percent !== lastPercent) {
        lastPercent = percent;
        log(`download ${percent}% (${Math.round(downloaded / 1048576)} MiB)`);
      }
    },
  });
  if (!(await exists(executablePath))) throw new Error(`Browser install did not produce ${executablePath}`);
  log("browser installed");
}
let browserVersion = null;
try {
  browserVersion = (await run(executablePath, ["--version"], {})).trim();
} catch (error) {
  log(`browser --version check failed: ${error instanceof Error ? error.message : String(error)}`);
}

// 3. Prune runtimes and browsers from earlier plugin versions inside our own cache.
for (const entry of await readdir(layout.workers, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== spec.key) {
    log(`removing stale worker runtime ${entry.name}`);
    await rm(path.join(layout.workers, entry.name), { recursive: true, force: true });
  }
}
for (const installed of await getInstalledBrowsers({ cacheDir: layout.browsers })) {
  if (installed.browser === Browser.CHROMEHEADLESSSHELL && installed.buildId === spec.buildId) continue;
  log(`removing stale browser ${installed.browser}@${installed.buildId}`);
  await uninstall({ browser: installed.browser, buildId: installed.buildId, cacheDir: layout.browsers });
}

// 4. Record what the daemon side may use. Paths are absolute on this host only.
const manifest = {
  version: 1,
  workerKey: spec.key,
  workerDir,
  cliEntry,
  mermaidCliVersion: spec.mermaidCliVersion,
  browser: spec.browser,
  buildId: spec.buildId,
  browserPlatform: platform,
  executablePath,
  browserVersion,
  node: process.version,
  preparedAt: new Date().toISOString(),
};
await writeFile(layout.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
log(`ready: ${layout.manifest}`);
