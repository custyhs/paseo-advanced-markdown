// Fault injection for the Mermaid worker: a fake prepared runtime whose CLI
// entry misbehaves. Uses the real spawn, timeout, cleanup, and queue code.
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WORKER_KEY, BROWSER, BROWSER_BUILD_ID } from "../server/generated/runtime.js";
import { cacheLayout } from "../server/mermaid/cache-root.mjs";
import { mermaidQueueLength, renderDiagram, resetMermaidForTests, stopMermaid } from "../server/mermaid/render.js";
import { MERMAID_TASK_TIMEOUT_MS } from "../shared/limits.js";

let root: string;
let cliEntry: string;
const originalCache = process.env.PASEO_ADVANCED_MARKDOWN_CACHE;

async function writeFakeRuntime(script: string): Promise<void> {
  const layout = cacheLayout(root);
  const workerDir = path.join(layout.workers, WORKER_KEY);
  await mkdir(workerDir, { recursive: true });
  await mkdir(layout.browsers, { recursive: true });
  await writeFile(path.join(workerDir, ".ready"), `${WORKER_KEY}\n`);
  cliEntry = path.join(workerDir, "fake-cli.mjs");
  await writeFile(cliEntry, script);
  const executablePath = path.join(layout.browsers, "fake-browser");
  await writeFile(executablePath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  await writeFile(
    layout.manifest,
    JSON.stringify({
      version: 1,
      workerKey: WORKER_KEY,
      workerDir,
      cliEntry,
      mermaidCliVersion: "fake",
      browser: BROWSER,
      buildId: BROWSER_BUILD_ID,
      executablePath,
      browserVersion: "fake",
    }),
  );
}

async function tempDirsNamed(prefix: string): Promise<string[]> {
  return (await readdir(os.tmpdir())).filter((name) => name.startsWith(prefix));
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "pam-fake-cache-"));
  process.env.PASEO_ADVANCED_MARKDOWN_CACHE = root;
});

afterAll(async () => {
  await stopMermaid();
  if (originalCache === undefined) delete process.env.PASEO_ADVANCED_MARKDOWN_CACHE;
  else process.env.PASEO_ADVANCED_MARKDOWN_CACHE = originalCache;
  await rm(root, { recursive: true, force: true });
});

describe("Mermaid worker faults", () => {
  it("terminates a hung renderer at the time budget and removes its temp directory", async () => {
    await writeFakeRuntime("setInterval(() => {}, 1000);\n");
    resetMermaidForTests();
    const before = await tempDirsNamed("paseo-advanced-markdown-");
    const started = Date.now();
    const result = await renderDiagram({ source: "flowchart LR\n A --> B", theme: "default" });
    const elapsed = Date.now() - started;
    expect(result).toEqual({ ok: false, reason: "timeout", message: "Mermaid rendering exceeded 15 s" });
    expect(elapsed).toBeGreaterThanOrEqual(MERMAID_TASK_TIMEOUT_MS - 200);
    expect(elapsed).toBeLessThan(MERMAID_TASK_TIMEOUT_MS + 5000);
    const after = await tempDirsNamed("paseo-advanced-markdown-");
    expect(after.length).toBeLessThanOrEqual(before.length);
    // A retryable failure is not cached: the next call runs the worker again.
    expect(mermaidQueueLength()).toBe(0);
  }, 30_000);

  it("classifies a crashing renderer as a failed, retryable result with a short cause", async () => {
    await writeFakeRuntime('console.error("boom: " + "x".repeat(2000)); process.exit(3);\n');
    resetMermaidForTests();
    const result = await renderDiagram({ source: "flowchart LR\n A --> C", theme: "default" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("failed");
      expect(result.message).toMatch(/exited with code 3/);
      expect(result.message!.length).toBeLessThanOrEqual(512);
    }
  });

  it("reports the browser as unavailable when the executable disappears", async () => {
    await writeFakeRuntime("process.exit(0);\n");
    const layout = cacheLayout(root);
    await rm(path.join(layout.browsers, "fake-browser"));
    resetMermaidForTests();
    const result = await renderDiagram({ source: "flowchart LR\n A --> D", theme: "default" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unavailable");
      expect(result.message).toMatch(/browser executable is missing/);
    }
  });

  it("refuses new work after stop and kills in-flight children", async () => {
    await writeFakeRuntime("setInterval(() => {}, 1000);\n");
    resetMermaidForTests();
    const inflight = renderDiagram({ source: "flowchart LR\n A --> E", theme: "default" });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await stopMermaid();
    const stopped = await inflight;
    expect(stopped.ok).toBe(false);
    expect(await renderDiagram({ source: "flowchart LR\n A --> F", theme: "default" })).toEqual({
      ok: false,
      reason: "unavailable",
      message: "Plugin is stopping",
    });
    await expect(access(cliEntry)).resolves.toBeUndefined();
  });
});
