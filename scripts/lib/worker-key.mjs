import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The Mermaid worker runtime is installed outside the plugin checkout, keyed by
 * its lockfile and pinned browser build. A dependency change produces a new key
 * and a fresh side-by-side install; unchanged keys are reused.
 */
export async function readWorkerSpec(root) {
  const lock = await readFile(path.join(root, "worker/package-lock.json"), "utf8");
  const packageJson = await readFile(path.join(root, "worker/package.json"), "utf8");
  const browser = JSON.parse(await readFile(path.join(root, "worker/browser.json"), "utf8"));
  const key = createHash("sha256")
    .update(lock)
    .update(JSON.stringify({ browser: browser.browser, buildId: browser.buildId }))
    .digest("hex")
    .slice(0, 16);
  const mermaidCli = JSON.parse(lock).packages?.["node_modules/@mermaid-js/mermaid-cli"];
  return {
    key,
    lock,
    packageJson,
    browser: browser.browser,
    buildId: browser.buildId,
    mermaidCliVersion: mermaidCli?.version ?? "unknown",
  };
}
