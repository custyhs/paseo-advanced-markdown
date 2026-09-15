import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import puppeteer, { type Browser } from "puppeteer-core";
import { BROWSER, BROWSER_BUILD_ID, WORKER_KEY } from "../server/generated/runtime.js";
import {
  browserArguments,
  renderDiagram,
  resetMermaidForTests,
  stopMermaid,
} from "../server/mermaid/render.js";
import { resolveMermaidRuntime } from "../server/mermaid/runtime.js";

const exec = promisify(execFile);
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let root: string;
let unrelated: Browser | undefined;
let prepared = false;
const previous = process.env.PASEO_ADVANCED_MARKDOWN_CACHE;
const require = createRequire(import.meta.url);

async function living(pids: number[]): Promise<number[]> {
  const { stdout } = await exec("ps", ["-axo", "pid=,stat="]);
  return stdout
    .trim()
    .split("\n")
    .map((s) => s.trim().split(/\s+/))
    .filter(([p, state]) => pids.includes(Number(p)) && !state!.startsWith("Z"))
    .map(([p]) => Number(p));
}

beforeAll(async () => {
  const runtime = await resolveMermaidRuntime();
  if (!runtime.ready || process.platform === "win32") return;
  root = await mkdtemp(path.join(os.tmpdir(), "pam-real-tree-"));
  const workerDir = path.join(root, "worker", WORKER_KEY);
  await mkdir(workerDir, { recursive: true });
  const cliEntry = path.join(workerDir, "paused-cli.mjs");
  // Launch through the same Puppeteer used by the real CLI, then hang while
  // owning a real browser. Pure fake CLI tests cannot reveal this leak.
  await writeFile(
    cliEntry,
    `
    import puppeteer from ${JSON.stringify(pathToFileURL(require.resolve("puppeteer-core")).href)};
    import { readFile, writeFile } from 'node:fs/promises';
    import { execFileSync } from 'node:child_process';
    const config = JSON.parse(await readFile(process.argv[process.argv.indexOf('--puppeteerConfigFile')+1], 'utf8'));
    const browser = await puppeteer.launch(config);
    await browser.newPage();
    const rows = execFileSync('ps',['-axo','pid=,ppid=']).toString().trim().split('\\n').map(s=>s.trim().split(/\\s+/).map(Number));
    const owned = new Set([process.pid]);
    for (let i=0;i<10;i++) for(const [pid,ppid] of rows) if(owned.has(ppid)) owned.add(pid);
    await writeFile(${JSON.stringify(path.join(root, "pids.json"))}, JSON.stringify([...owned]));
    setInterval(()=>{},1000);
  `,
  );
  await writeFile(path.join(workerDir, ".ready"), WORKER_KEY);
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      version: 1,
      workerKey: WORKER_KEY,
      workerDir,
      cliEntry,
      mermaidCliVersion: "test",
      browser: BROWSER,
      buildId: BROWSER_BUILD_ID,
      executablePath: runtime.runtime.executablePath,
    }),
  );
  unrelated = await puppeteer.launch({
    executablePath: runtime.runtime.executablePath,
    headless: "shell",
    args: browserArguments(),
  });
  prepared = true;
  process.env.PASEO_ADVANCED_MARKDOWN_CACHE = root;
});

afterAll(async () => {
  await stopMermaid();
  await unrelated?.close();
  if (previous === undefined) delete process.env.PASEO_ADVANCED_MARKDOWN_CACHE;
  else process.env.PASEO_ADVANCED_MARKDOWN_CACHE = previous;
  if (root) await rm(root, { recursive: true, force: true });
});

for (const mode of ["stop", "timeout"] as const) {
  describe(`${mode} with a real browser descendant`, () => {
    it("reclaims the owned tree and keeps another browser alive", async (context) => {
      if (!prepared) return context.skip();
      resetMermaidForTests();
      const marker = path.join(root, "pids.json");
      await rm(marker, { force: true });
      const task = renderDiagram({ source: `flowchart LR\n A --> ${mode}`, theme: "default" });
      for (let i = 0; i < 150; i++) {
        if (
          await access(marker).then(
            () => true,
            () => false,
          )
        )
          break;
        await pause(40);
      }
      const pids = JSON.parse(await readFile(marker, "utf8")) as number[];
      expect(pids.length).toBeGreaterThan(1);
      if (mode === "stop") await stopMermaid();
      const result = await task;
      expect(result).toMatchObject({
        ok: false,
        reason: mode === "stop" ? "unavailable" : "timeout",
      });
      expect(await living(pids)).toEqual([]);
      expect(unrelated?.connected).toBe(true);
      const page = await unrelated!.newPage();
      expect(await page.evaluate(() => 2 + 2)).toBe(4);
      await page.close();
    }, 30_000);
  });
}
