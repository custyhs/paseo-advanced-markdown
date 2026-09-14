import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MermaidRenderInput, MermaidRenderOutput } from "../../shared/rpc.js";
import {
  IMAGE_CACHE_BYTES,
  IMAGE_CACHE_ENTRIES,
  MAX_IMAGE_BASE64,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_PIXELS,
  MAX_MERMAID_SOURCE,
  MIN_DIAGRAM_SCALE,
  MERMAID_CONCURRENCY,
  MERMAID_QUEUE_LIMIT,
  MERMAID_TASK_TIMEOUT_MS,
} from "../../shared/limits.js";
import { BoundedCache } from "../cache.js";
import { pngDimensions } from "./png.js";
import { describe, resolveMermaidRuntime, type MermaidRuntime } from "./runtime.js";

const SCALE = 2;
const VIEWPORT_WIDTH = 1200;
const VIEWPORT_HEIGHT = 800;

/**
 * Device scale that keeps a diagram of the given logical size inside the pixel
 * and edge budgets, preferring the crisp default. Returns null when even the
 * minimum scale cannot fit, so the caller refuses instead of shipping a huge
 * bitmap to phones.
 */
export function fitScale(logicalWidth: number, logicalHeight: number): number | null {
  if (!(logicalWidth > 0) || !(logicalHeight > 0)) return null;
  const byArea = Math.sqrt(MAX_IMAGE_PIXELS / (logicalWidth * logicalHeight));
  const byEdge = MAX_IMAGE_EDGE / Math.max(logicalWidth, logicalHeight);
  const scale = Math.min(SCALE, byArea, byEdge);
  if (scale >= SCALE) return SCALE;
  if (scale < MIN_DIAGRAM_SCALE) return null;
  // Quantize so cache keys and repeated renders agree.
  return Math.floor(scale * 100) / 100;
}

type Failure = Extract<MermaidRenderOutput, { ok: false }>;

const cache = new BoundedCache<MermaidRenderOutput>(IMAGE_CACHE_ENTRIES, IMAGE_CACHE_BYTES);
const inflight = new Map<string, Promise<MermaidRenderOutput>>();
const queue: Array<() => void> = [];
const children = new Set<ChildProcess>();
let active = 0;
let stopped = false;

function failure(reason: Failure["reason"], message?: string): Failure {
  const trimmed = message?.replace(/\s+/g, " ").trim();
  return trimmed ? { ok: false, reason, message: trimmed.slice(0, 512) } : { ok: false, reason };
}

function cacheKey(input: MermaidRenderInput): string {
  return JSON.stringify([input.source, input.theme, SCALE]);
}

function remember(key: string, output: MermaidRenderOutput): MermaidRenderOutput {
  const bytes = 2 * (key.length + (output.ok ? output.png.length : 64)) + 128;
  return cache.set(key, Object.freeze(output), bytes);
}

export function mermaidQueueLength(): number {
  return queue.length + active;
}

export function mermaidCacheSize(): number {
  return cache.size;
}

/** Terminates in-flight work and forgets queued requests. Idempotent. */
export async function stopMermaid(): Promise<void> {
  stopped = true;
  const waiting = queue.splice(0, queue.length);
  for (const release of waiting) release();
  for (const child of children) {
    if (!child.killed) child.kill("SIGKILL");
  }
  children.clear();
  cache.clear();
  inflight.clear();
}

export function resetMermaidForTests(): void {
  stopped = false;
  cache.clear();
  inflight.clear();
  queue.splice(0, queue.length);
  active = 0;
}

function acquireSlot(): Promise<boolean> {
  if (active < MERMAID_CONCURRENCY) {
    active++;
    return Promise.resolve(true);
  }
  if (queue.length >= MERMAID_QUEUE_LIMIT) return Promise.resolve(false);
  return new Promise((resolve) => {
    queue.push(() => {
      if (stopped) {
        resolve(false);
        return;
      }
      active++;
      resolve(true);
    });
  });
}

function releaseSlot(): void {
  active = Math.max(0, active - 1);
  queue.shift()?.();
}

function classifyFailure(output: string, code: number | null): Failure {
  const text = output.replace(/\x1b\[[0-9;]*m/g, "");
  if (/parse error|syntax error|unknowndiagramerror|no diagram type detected|lexical error|expecting/i.test(text)) {
    const line = text
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => /error/i.test(entry));
    return failure("invalid", line ?? "Mermaid could not parse the diagram");
  }
  if (/could not find|no such file|executable doesn't exist|failed to launch|spawn .* ENOENT/i.test(text)) {
    return failure("unavailable", "The pinned browser could not be started");
  }
  return failure("failed", `Mermaid renderer exited with code ${code ?? "?"}: ${lastLine(text)}`);
}

function lastLine(text: string): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "no output";
}

function nodeExecutable(): { command: string; env: NodeJS.ProcessEnv } {
  // The plugin subprocess may itself be Electron running as Node; keep that
  // behaviour for the worker so the packaged daemon needs no separate Node.
  return {
    command: process.execPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  };
}

/** Launch flags handed to the pinned browser; exported for the network-isolation test. */
export function browserArguments(): string[] {
  const args = [
    "--disable-gpu",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-features=Translate",
    // Diagram content must not reach the network; assets load from file URLs
    // through mermaid-cli's request interception.
    "--host-resolver-rules=MAP * ~NOTFOUND",
    "--proxy-server=127.0.0.1:1",
  ];
  if (typeof process.getuid === "function" && process.getuid() === 0) args.push("--no-sandbox");
  return args;
}

async function runCli(
  runtime: MermaidRuntime,
  input: MermaidRenderInput,
  scale: number = SCALE,
): Promise<MermaidRenderOutput> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "paseo-advanced-markdown-"));
  try {
    const inputPath = path.join(workDir, "diagram.mmd");
    const outputPath = path.join(workDir, "diagram.png");
    const puppeteerConfigPath = path.join(workDir, "puppeteer.json");
    const mermaidConfigPath = path.join(workDir, "mermaid.json");
    await writeFile(inputPath, input.source, "utf8");
    await writeFile(
      puppeteerConfigPath,
      JSON.stringify({
        executablePath: runtime.executablePath,
        headless: "shell",
        args: browserArguments(),
        timeout: MERMAID_TASK_TIMEOUT_MS,
        protocolTimeout: MERMAID_TASK_TIMEOUT_MS,
      }),
    );
    await writeFile(
      mermaidConfigPath,
      JSON.stringify({
        theme: input.theme,
        securityLevel: "strict",
        startOnLoad: false,
        maxTextSize: MAX_MERMAID_SOURCE,
      }),
    );
    const node = nodeExecutable();
    const args = [
      runtime.cliEntry,
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--outputFormat",
      "png",
      "--puppeteerConfigFile",
      puppeteerConfigPath,
      "--configFile",
      mermaidConfigPath,
      "--backgroundColor",
      "transparent",
      "--scale",
      String(scale),
      "--width",
      String(VIEWPORT_WIDTH),
      "--height",
      String(VIEWPORT_HEIGHT),
      "--quiet",
    ];
    const result = await new Promise<{ code: number | null; output: string; timedOut: boolean }>(
      (resolve) => {
        const child = spawn(node.command, args, {
          cwd: workDir,
          env: {
            ...node.env,
            PUPPETEER_CACHE_DIR: runtime.browsersDir,
            PUPPETEER_SKIP_DOWNLOAD: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        });
        children.add(child);
        let output = "";
        let timedOut = false;
        const append = (chunk: Buffer | string) => {
          output = `${output}${chunk.toString()}`.slice(-16_384);
        };
        child.stdout?.on("data", append);
        child.stderr?.on("data", append);
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, MERMAID_TASK_TIMEOUT_MS);
        child.once("error", (error) => {
          clearTimeout(timer);
          children.delete(child);
          resolve({ code: null, output: `${output}\n${error.message}`, timedOut });
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          children.delete(child);
          resolve({ code, output, timedOut });
        });
      },
    );
    if (result.timedOut) return failure("timeout", "Mermaid rendering exceeded 15 s");
    if (stopped) return failure("unavailable", "Plugin is stopping");
    if (result.code !== 0) return classifyFailure(result.output, result.code);
    const png = await readFile(outputPath).catch(() => null);
    if (!png) return failure("failed", "Mermaid produced no image");
    const size = pngDimensions(png);
    if (!size) return failure("failed", "Mermaid produced an unreadable image");
    const logicalWidth = size.width / scale;
    const logicalHeight = size.height / scale;
    if (size.width * size.height > MAX_IMAGE_PIXELS || Math.max(size.width, size.height) > MAX_IMAGE_EDGE) {
      const fitted = fitScale(logicalWidth, logicalHeight);
      if (fitted !== null && fitted < scale) {
        // One retry at a lower device scale keeps large diagrams viewable
        // without exceeding what phones can decode.
        return runCli(runtime, input, fitted);
      }
      return failure(
        "too-large",
        `Diagram is ${Math.round(logicalWidth)}x${Math.round(logicalHeight)} px at 1x, above the image budget`,
      );
    }
    const base64 = png.toString("base64");
    if (base64.length > MAX_IMAGE_BASE64) {
      return failure("too-large", `Diagram image is ${Math.round(png.length / 1024)} KiB, above the size budget`);
    }
    return {
      ok: true,
      png: base64,
      width: logicalWidth,
      height: logicalHeight,
      scale,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Renders one complete Mermaid definition through the bounded local queue. */
export async function renderDiagram(input: MermaidRenderInput): Promise<MermaidRenderOutput> {
  if (typeof input.source !== "string" || !input.source.trim()) return failure("invalid");
  if (input.source.length > MAX_MERMAID_SOURCE) return failure("too-large");
  if (stopped) return failure("unavailable", "Plugin is stopping");
  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const task = (async () => {
    const admitted = await acquireSlot();
    if (!admitted) return failure("busy", "Too many diagrams are waiting; retry shortly");
    try {
      const resolution = await resolveMermaidRuntime();
      if (!resolution.ready) return failure("unavailable", resolution.message);
      const output = await runCli(resolution.runtime, input);
      // Retryable outcomes are not cached so a later attempt can succeed.
      if (output.ok || output.reason === "invalid" || output.reason === "too-large") {
        return remember(key, output);
      }
      return output;
    } catch (error) {
      return failure("failed", describe(error));
    } finally {
      releaseSlot();
    }
  })();
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
