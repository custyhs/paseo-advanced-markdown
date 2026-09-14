import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLayout, resolveCacheRoot } from "./cache-root.mjs";
import {
  BROWSER,
  BROWSER_BUILD_ID,
  MERMAID_CLI_VERSION,
  WORKER_KEY,
} from "../generated/runtime.js";

export interface MermaidRuntime {
  workerDir: string;
  cliEntry: string;
  executablePath: string;
  browsersDir: string;
  browserVersion: string | null;
  mermaidCliVersion: string;
}

export type RuntimeResolution =
  | { ready: true; runtime: MermaidRuntime; cacheRoot: string }
  | { ready: false; message: string; cacheRoot: string };

interface PreparedManifest {
  version: number;
  workerKey: string;
  workerDir: string;
  cliEntry: string;
  mermaidCliVersion: string;
  browser: string;
  buildId: string;
  executablePath: string;
  browserVersion: string | null;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate the runtime prepared by scripts/prepare-browser.mjs. The manifest is
 * the only source of absolute paths; every path is re-checked because the
 * cache can be deleted independently of the plugin.
 */
export async function resolveMermaidRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RuntimeResolution> {
  const layout = cacheLayout(resolveCacheRoot(env));
  const unavailable = (message: string): RuntimeResolution => ({
    ready: false,
    message,
    cacheRoot: layout.root,
  });
  if (!(await exists(layout.manifest))) {
    return unavailable(
      `Mermaid runtime is not prepared (missing ${layout.manifest}). Run "npm run prepare-browser" in the plugin directory or reinstall the plugin.`,
    );
  }
  let manifest: PreparedManifest;
  try {
    manifest = JSON.parse(await readFile(layout.manifest, "utf8")) as PreparedManifest;
  } catch (error) {
    return unavailable(`Mermaid runtime manifest is unreadable: ${describe(error)}`);
  }
  if (manifest.version !== 1 || manifest.workerKey !== WORKER_KEY) {
    return unavailable(
      `Mermaid runtime ${manifest.workerKey ?? "?"} does not match this plugin build (${WORKER_KEY}). Run "npm run prepare-browser" again.`,
    );
  }
  if (manifest.browser !== BROWSER || manifest.buildId !== BROWSER_BUILD_ID) {
    return unavailable(
      `Prepared browser ${manifest.browser}@${manifest.buildId} does not match ${BROWSER}@${BROWSER_BUILD_ID}.`,
    );
  }
  const expectedWorkerDir = path.join(layout.workers, WORKER_KEY);
  if (path.resolve(manifest.workerDir) !== expectedWorkerDir) {
    return unavailable(`Mermaid worker directory moved: expected ${expectedWorkerDir}.`);
  }
  for (const [label, target] of [
    ["worker runtime", path.join(manifest.workerDir, ".ready")],
    ["Mermaid CLI", manifest.cliEntry],
    ["browser executable", manifest.executablePath],
  ] as const) {
    if (!(await exists(target))) return unavailable(`Mermaid ${label} is missing: ${target}`);
  }
  return {
    ready: true,
    cacheRoot: layout.root,
    runtime: {
      workerDir: manifest.workerDir,
      cliEntry: manifest.cliEntry,
      executablePath: manifest.executablePath,
      browsersDir: layout.browsers,
      browserVersion: manifest.browserVersion ?? null,
      mermaidCliVersion: manifest.mermaidCliVersion || MERMAID_CLI_VERSION,
    },
  };
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
